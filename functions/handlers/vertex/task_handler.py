# functions/handlers/vertex/task_handler.py
import asyncio
import traceback
import json
import uuid  # Import uuid to generate message IDs
from datetime import datetime, timezone
from google.cloud import tasks_v2
from google.cloud import storage

from firebase_admin import firestore
from firebase_functions import https_fn

from common.core import db, logger
from common.config import get_gcp_project_config
from common.utils import initialize_vertex_ai
from common.adk_helpers import instantiate_adk_agent_from_config, get_adk_artifact_service

# NEW import for A2A client logic
import httpx
from a2a.types import Message as A2AMessage, TextPart


from .query_utils import get_reasoning_engine_id_from_name
from .query_log_fetcher import fetch_vertex_logs_for_query
from .query_session_manager import ensure_adk_session
from .query_vertex_runner import run_vertex_stream_query
from .query_local_diagnostics import try_local_diagnostic_run
from vertexai.agent_engines import get as get_engine
from google.adk.sessions import VertexAiSessionService
from google.genai.types import Content, Part

storage_client = storage.Client()

storage_client = storage.Client()

async def get_full_message_history(chat_id, leaf_message_id):
    """Reconstructs the conversation history leading up to a specific message."""
    messages = {}
    messages_collection = db.collection("chats").document(chat_id).collection("messages")
    docs = messages_collection.stream()
    for doc in docs:
        messages[doc.id] = doc.to_dict()

    history = []
    current_id = leaf_message_id
    while current_id and current_id in messages:
        message = messages[current_id]
        history.insert(0, message)
        current_id = message.get("parentMessageId")
    return history

async def _run_a2a_agent_unary(
        participant_config: dict,
        message_content_for_agent: str,
        assistant_message_ref
):
    """
    Handles the logic for a non-streaming A2A agent using a single
    'message/send' request/response.
    """
    logger.info("[A2AExecutor/Unary] Executing non-streaming 'message/send' request.")
    endpoint_url = participant_config.get("endpointUrl")
    if not endpoint_url:
        raise ValueError("A2A agent config is missing 'endpointUrl'.")

    a2a_message = A2AMessage(
        messageId=str(uuid.uuid4()),
        role="user",
        parts=[TextPart(text=message_content_for_agent)]
    )

    send_request_payload = {
        "jsonrpc": "2.0",
        "method": "message/send",
        "id": f"agentlab-send-{uuid.uuid4().hex}",
        "params": {
            "message": a2a_message.model_dump(exclude_none=True)
        }
    }
    logger.debug(f"[A2AExecutor/Unary] Request payload for 'message/send': {json.dumps(send_request_payload)}")

    errors = []
    final_text = ""
    rpc_endpoint_url = endpoint_url.rstrip('/')

    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            response = await client.post(rpc_endpoint_url, json=send_request_payload)
            logger.info(f"[A2AExecutor/Unary] Received response from 'message/send' with status {response.status_code}.")
            response.raise_for_status()

            rpc_response = response.json()
            task_result = rpc_response.get("result")
            logger.debug(f"[A2AExecutor/Unary] Full task object from unary response: {json.dumps(task_result, indent=2)}")

            if not task_result:
                if rpc_response.get("error"):
                    err_msg = f"A2A 'message/send' returned an error: {rpc_response['error']}"
                    logger.error(f"[A2AExecutor/Unary] {err_msg}")
                    errors.append(err_msg)
            else:
                # Log the final task object to Firestore
                final_task_event = {"type": "a2a_unary_task_result", "source_event": task_result}
                assistant_message_ref.update({"run.outputEvents": firestore.ArrayUnion([final_task_event])})

                # Extract final text from the artifacts in the task object
                for artifact in task_result.get("artifacts", []):
                    for part in artifact.get("parts", []):
                        text_part = part.get("text") or part.get("text-delta")
                        if text_part:
                            final_text += text_part
                logger.info(f"[A2AExecutor/Unary] Extracted final text: '{final_text[:150]}...'")

        except httpx.HTTPStatusError as e:
            error_msg = f"A2A 'message/send' returned an error: {e.response.status_code} - {e.response.text[:200]}"
            logger.error(f"[A2AExecutor/Unary] {error_msg}")
            errors.append(error_msg)
        except Exception as e:
            error_msg = f"Failed to communicate with non-streaming A2A agent: {str(e)}"
            logger.error(f"[A2AExecutor/Unary] {error_msg}\n{traceback.format_exc()}")
            errors.append(error_msg)

    return {"finalResponseText": final_text, "queryErrorDetails": errors}

async def _run_a2a_agent_stream(
        participant_config: dict,
        message_content_for_agent: str,
        assistant_message_ref
):
    """
    Handles the logic for a streaming A2A agent, implementing the two-step
    stream-then-get protocol.
    """
    logger.info("[A2AExecutor/Stream] Executing streaming 'message/stream' request.")
    endpoint_url = participant_config.get("endpointUrl")
    if not endpoint_url:
        raise ValueError("A2A agent config is missing 'endpointUrl'.")

    if not message_content_for_agent:
        logger.warn(f"[A2AExecutor/Stream] No user content found. Sending an empty message.")

    a2a_message = A2AMessage(
        messageId=str(uuid.uuid4()),
        role="user",
        parts=[TextPart(text=message_content_for_agent)]
    )

    # 2. Prepare for the two-step protocol
    errors = []
    final_text = ""
    task_id = None
    task_completed_in_stream = False
    rpc_endpoint_url = endpoint_url.rstrip('/')

    async with httpx.AsyncClient(timeout=60.0) as client:
        # STEP 1: Initiate `message/stream`
        stream_request_payload = {
            "jsonrpc": "2.0",
            "method": "message/stream",
            "id": f"agentlab-stream-{uuid.uuid4().hex}",
            "params": {
                "message": a2a_message.model_dump(exclude_none=True)
            }
        }

        try:
            logger.info(f"[A2AExecutor/Stream] Sending 'message/stream' RPC to {rpc_endpoint_url}")
            async with client.stream("POST", rpc_endpoint_url, json=stream_request_payload, headers={"Accept": "text/event-stream"}) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.startswith("data:"):
                        try:
                            event_json_str = line[len("data:"):].strip()
                            rpc_response = json.loads(event_json_str)

                            event_data = rpc_response.get("result", rpc_response)
                            logger.debug(f"[A2AExecutor/Stream] Processing stream event: {event_data}")

                            if not isinstance(event_data, dict):
                                if rpc_response.get("error"):
                                    err_msg = f"A2A stream returned an error: {rpc_response['error']}"
                                    logger.error(f"[A2AExecutor/Stream] {err_msg}")
                                    errors.append(err_msg)
                                continue

                            adk_like_event = {"type": "a2a_stream_event", "source_event": event_data}
                            assistant_message_ref.update({"run.outputEvents": firestore.ArrayUnion([adk_like_event])})

                            # Extract `task_id` and update state
                            new_task_id = None
                            if "task_id" in event_data: new_task_id = event_data["task_id"]
                            elif event_data.get("kind") == "task" and "id" in event_data: new_task_id = event_data["id"]
                            if new_task_id and task_id != new_task_id:
                                task_id = new_task_id
                                logger.info(f"[A2AExecutor/Stream] Captured task_id: {task_id}")

                            event_kind = event_data.get("kind")
                            if event_kind == "artifact-update" and event_data.get("artifact"):
                                for part in event_data["artifact"].get("parts", []):
                                    text_part = part.get("text") or part.get("text-delta")
                                    if text_part: final_text += text_part

                            if event_kind == "status-update" and event_data.get("status", {}).get("state") == "completed":
                                logger.info(f"[A2AExecutor/Stream] Task '{task_id}' completed within the stream.")
                                task_completed_in_stream = True

                        except json.JSONDecodeError:
                            logger.warn(f"[A2AExecutor/Stream] Could not decode JSON from event line: {line}")
                        except Exception as e_event_proc:
                            logger.error(f"[A2AExecutor/Stream] Error processing event: {e_event_proc}")
                            errors.append(f"Error processing A2A event: {str(e_event_proc)}")

            logger.info(f"[A2AExecutor/Stream] Stream finished. Task ID: {task_id}, Completed in stream: {task_completed_in_stream}")

        except httpx.HTTPStatusError as e:
            error_msg = f"A2A 'message/stream' returned an error: {e.response.status_code} - {e.response.text[:200]}"
            logger.error(f"[A2AExecutor/Stream] {error_msg}")
            errors.append(error_msg)
        except Exception as e:
            error_msg = f"Failed to communicate with A2A agent during stream: {str(e)}"
            logger.error(f"[A2AExecutor/Stream] {error_msg}\n{traceback.format_exc()}")
            errors.append(error_msg)

            # STEP 2: Conditionally fetch the final result with `task/get`
        if task_id and not task_completed_in_stream:
            logger.info(f"[A2AExecutor/Stream] Task incomplete. Making 'task/get' call for ID: {task_id}")
            get_task_payload = { "jsonrpc": "2.0", "method": "task/get", "id": f"agentlab-get-task-{uuid.uuid4().hex}", "params": {"id": task_id} }
            try:
                get_response = await client.post(rpc_endpoint_url, json=get_task_payload)
                get_response.raise_for_status()

                rpc_response = get_response.json()
                task_result = rpc_response.get("result")
                logger.debug(f"[A2AExecutor/Stream] Full task object from 'task/get' response: {json.dumps(task_result, indent=2)}")

                if not task_result:
                    if rpc_response.get("error"):
                        err_msg = f"A2A 'task/get' returned an error: {rpc_response['error']}"
                        logger.error(f"[A2AExecutor/Stream] {err_msg}")
                        errors.append(err_msg)
                else:
                    final_task_event = {"type": "a2a_final_task_get", "source_event": task_result}
                    assistant_message_ref.update({"run.outputEvents": firestore.ArrayUnion([final_task_event])})

                    for artifact in task_result.get("artifacts", []):
                        for part in artifact.get("parts", []):
                            text_part = part.get("text") or part.get("text-delta")
                            if text_part and text_part not in final_text:
                                final_text += text_part
                    logger.info(f"[A2AExecutor/Stream] Extracted final text from 'task/get' response: '{final_text[:150]}...'")

            except httpx.HTTPStatusError as e:
                error_msg = f"A2A 'task/get' returned an error: {e.response.status_code} - {e.response.text[:200]}"
                logger.error(f"[A2AExecutor/Stream] {error_msg}")
                errors.append(error_msg)
            except Exception as e:
                error_msg = f"Failed to get final task result from A2A agent: {str(e)}"
                logger.error(f"[A2AExecutor/Stream] {error_msg}\n{traceback.format_exc()}")
                errors.append(error_msg)
        elif not task_id:
            logger.warn(f"[A2AExecutor/Stream] No task_id was captured from the A2A stream. Cannot fetch final result.")

    return {"finalResponseText": final_text, "queryErrorDetails": errors}


async def _execute_and_stream_to_firestore(
        chat_id: str,
        assistant_message_id: str,
        agent_id: str | None,
        model_id: str | None,
        adk_user_id: str,
        stuffed_context_items: list | None = None
):
    """
    Orchestrates querying a deployed Vertex AI agent OR a model OR an A2A agent, streaming events to Firestore.
    """
    assistant_message_ref = db.collection("chats").document(chat_id).collection("messages").document(assistant_message_id)
    assistant_message_snap = assistant_message_ref.get()
    if not assistant_message_snap.exists:
        logger.error(f"[TaskExecutor] Assistant message {assistant_message_id} not found. Aborting task.")
        return

    assistant_message_data = assistant_message_snap.to_dict()
    parent_message_id = assistant_message_data.get("parentMessageId")

    # Fetch the raw conversation history
    conversation_history = await get_full_message_history(chat_id, parent_message_id)

    # --- START PORTED PREFIX LOGIC ---
    stuffed_context_items = assistant_message_data.get("run", {}).get("stuffedContextItems")
    if stuffed_context_items and isinstance(stuffed_context_items, list):
        logger.info(f"[TaskExecutor] Prepending {len(stuffed_context_items)} stuffed context items as one text part.")
        # Build exactly the same “File: …” + fences from HEAD‐patch
        prefix_chunks = []
        for item in stuffed_context_items:
            item_name = item.get("name", "Unnamed Context Item")
            item_content = item.get("content", "[Content not available]")
            prefix_chunks.append(
                f"File: {item_name}\n``` \n{item_content}\n```"
            )
        prefix_text = "\n---\n".join(prefix_chunks) + "\n---\nUser Query:\n"
        # Prepend it as a single text part
        multimodal_parts = [{"type": "text", "data": prefix_text}]
    else:
        multimodal_parts = []
        # --- END PORTED PREFIX LOGIC ---

    # Now walk the history as before
    for msg in conversation_history:
        for part in msg.get("parts", []):
            if part.get("type") == "text":
                multimodal_parts.append({"type": "text", "data": part["content"]})
            elif part.get("type") == "image" and part.get("storageUrl"):
                multimodal_parts.append({
                    "type": "image",
                    "gs_uri": part["storageUrl"],
                    "public_url": part.get("signedUrl"),
                    "mimeType": part.get("mimeType", "image/jpeg")
                })

                # And if you still want the old per‐item branching (images + texts) afterwards,
    # you can re‐append them—but note you’ve already folded them into your prefix.
    for item in stuffed_context_items or []:
        if item.get("type") == "image" and item.get("storageUrl"):
            multimodal_parts.append({
                "type": "image",
                "gs_uri": item["storageUrl"],
                "public_url": item.get("signedUrl"),
                "mimeType": item.get("mimeType", "image/jpeg")
            })
            # Else: we’ve already added the text version in the prefix chunk

    logger.info(f"[TaskExecutor] Initiating query for assistant message: {assistant_message_id}.")

    project_id, location, _ = get_gcp_project_config()

    # Determine participant config (agent or model)
    if agent_id:
        participant_config_ref = db.collection("agents").document(agent_id)
    elif model_id:
        participant_config_ref = db.collection("models").document(model_id)
    else: # Should not happen due to orchestrator validation
        raise ValueError("Task requires either agentId or modelId")

    participant_snap = participant_config_ref.get()
    if not participant_snap.exists:
        raise ValueError(f"Participant config not found for ID: {agent_id or model_id}")
    participant_config = participant_snap.to_dict()

    agent_platform = participant_config.get("platform")

    # === DISPATCHER LOGIC ===
    if agent_id and agent_platform == 'a2a':
        logger.info(f"[A2AExecutor/Dispatch] Handling A2A agent: {agent_id}")

        # Construct the message content for the A2A agent, including context
        last_user_message = next((msg for msg in reversed(conversation_history) if msg.get("participant", "").startswith("user:")), None)
        user_message_content = last_user_message.get("content", "") if last_user_message else ""
        final_a2a_message_content = (context_string_prefix + user_message_content).strip()

        agent_capabilities = participant_config.get("agentCard", {}).get("capabilities", {})
        is_streaming = agent_capabilities.get("streaming", False)

        if is_streaming:
            logger.info("[A2AExecutor/Dispatch] Determined agent protocol: Streaming. Calling stream handler.")
            return await _run_a2a_agent_stream(participant_config, final_a2a_message_content, assistant_message_ref)
        else:
            logger.info("[A2AExecutor/Dispatch] Determined agent protocol: Non-Streaming (Unary). Calling unary handler.")
            return await _run_a2a_agent_unary(participant_config, final_a2a_message_content, assistant_message_ref)

            # For Vertex and Model runs, combine the full history with the context
    full_message_text = "\n\n".join([msg.get("content", "") for msg in conversation_history if msg.get("content")])
    final_message_for_agent = (context_string_prefix + full_message_text).strip()

    if agent_id: # Defaults to google_vertex
        resource_name = participant_config.get("vertexAiResourceName")
        if not resource_name or participant_config.get("deploymentStatus") != "deployed":
            raise ValueError(f"Agent {agent_id} is not successfully deployed.")

            # For Vertex, we set up a runner with a session and artifact service
        from google.adk.runners import Runner

        session_service = VertexAiSessionService(project=project_id, location=location)
        artifact_service = await get_adk_artifact_service()

        remote_app_runner = Runner(
            agent=get_engine(resource_name),
            app_name=resource_name,
            session_service=session_service,
            artifact_service=artifact_service
        )

        session = await remote_app_runner.session_service.create_session(app_name=resource_name, user_id=adk_user_id)
        current_adk_session_id = session.id
        # … (your code that fills in multimodal_parts from history & images) …

        # --- START PORTED PREFIX LOGIC ---
        stuffed_context_items = assistant_message_data.get("run", {}).get("stuffedContextItems", [])
        if stuffed_context_items and isinstance(stuffed_context_items, list):
            logger.info(f"[TaskExecutor] Prepending {len(stuffed_context_items)} stuffed context items as one text part.")
            prefix_chunks = []
            for item in stuffed_context_items:
                item_name = item.get("name", "Unnamed Context Item")
                item_content = item.get("content", "[Content not available]")
                prefix_chunks.append(
                    f"File: {item_name}\n``` \n{item_content}\n```"
                )
                # join with separators & append "User Query:"
            prefix_text = "\n---\n".join(prefix_chunks) + "\n---\nUser Query:\n"
            # insert at front of your multimodal_parts
            multimodal_parts.insert(0, {"type": "text", "data": prefix_text})
        # --- END PORTED PREFIX LOGIC ---

        # Now construct multimodal input for the ADK
        adk_parts = []
        for part_data in multimodal_parts:
            if part_data["type"] == "text":
                adk_parts.append(Part.from_text(text=part_data["data"]))
            elif part_data["type"] == "image":
                gs_uri = part_data["gs_uri"]
                bucket_name = gs_uri.split('/')[2]
                blob_name = '/'.join(gs_uri.split('/')[3:])
                bucket = storage_client.bucket(bucket_name)
                blob = bucket.blob(blob_name)
                image_bytes = blob.download_as_bytes()
                mime_type = part_data.get("mimeType", "image/jpeg")
                adk_parts.append(Part.from_data(data=image_bytes, mime_type=mime_type))

            # Wrap into Content & send to ADK
        new_message_content = Content(parts=adk_parts, role="user")

        final_text = ""
        errors = []
        try:
            async for event_obj in remote_app_runner.run_async(
                    user_id=adk_user_id,
                    session_id=current_adk_session_id,
                    new_message=new_message_content
            ):
                event_dict = event_obj.model_dump()
                assistant_message_ref.update({"run.outputEvents": firestore.ArrayUnion([event_dict])})
                content = event_dict.get("content", {})
                if content and content.get("parts"):
                    for part in content["parts"]:
                        if "text" in part:
                            final_text += part["text"]
        except Exception as e_run:
            logger.error(f"Error during Vertex ADK run: {e_run}", exc_info=True)
            errors.append(f"ADK runner failed: {str(e_run)}")

        new_message_content = Content(parts=adk_parts, role="user")

        final_text = ""
        errors = []
        try:
            async for event_obj in remote_app_runner.run_async(user_id=adk_user_id, session_id=current_adk_session_id, new_message=new_message_content):
                event_dict = event_obj.model_dump()
                assistant_message_ref.update({"run.outputEvents": firestore.ArrayUnion([event_dict])})
                content = event_dict.get("content", {})
                if content and content.get("parts"):
                    for part in content["parts"]:
                        if "text" in part:
                            final_text += part["text"]
        except Exception as e_run:
            logger.error(f"Error during Vertex ADK run: {e_run}", exc_info=True)
            errors.append(f"ADK runner failed: {str(e_run)}")


        final_text, errors, had_exceptions, num_events = await run_vertex_stream_query(
            remote_app, final_message_for_agent, adk_user_id, current_adk_session_id, assistant_message_ref
        )

        return {"finalResponseText": final_text, "queryErrorDetails": errors}

    elif model_id:
        # This is for ephemeral model execution.
        model_only_agent_config = {
            "name": f"ephemeral_model_run_{model_id[:6]}",
            "agentType": "Agent",
            "tools": [],
            "modelId": model_id,
        }

        local_adk_agent = await instantiate_adk_agent_from_config(
            model_only_agent_config,
            parent_adk_name_for_context=f"model_run_{chat_id[:4]}"
        )

        from google.adk.runners import Runner
        from google.adk.sessions import InMemorySessionService
        from google.adk.artifacts import InMemoryArtifactService
        from google.adk.memory import InMemoryMemoryService

        # Construct multimodal input for LiteLLM
        litellm_content = []
        full_message_text_for_model = ""
        for part_data in multimodal_parts:
            if part_data["type"] == "text":
                # For LiteLLM, we can aggregate text into a single part or multiple
                full_message_text_for_model += part_data["data"] + "\n"
            elif part_data["type"] == "image":
                public_url = part_data.get("public_url")
                logger.info("Public URL for image part: %s", public_url)
                if not public_url:
                    # This is the critical change. We no longer try to sign here.
                    # We raise an error if the public URL is missing.
                    error_msg = f"Image part is missing its public URL for LiteLLM call. Stored gs_uri was {part_data.get('gs_uri')}"
                    logger.error(error_msg)
                    raise ValueError(error_msg)
                litellm_content.append({"type": "image_url", "image_url": {"url": public_url}})

                # Prepend text content to the list
        if full_message_text_for_model.strip():
            litellm_content.insert(0, {"type": "text", "text": full_message_text_for_model.strip()})

            # This is a workaround to pass the complex structure to the ADK's LiteLLM wrapper.
        # We pass a special JSON string that the LiteLLM model class in adk_helpers will be adapted to parse.
        # If no images, we pass a simple text string.
        if any(p['type'] == 'image_url' for p in litellm_content):
            # This indicates to the underlying model wrapper to use the multimodal format.
            message_content_for_runner = Content(role="user", parts=[Part.from_text(
                text= json.dumps({"multimodal_content": litellm_content}))
            ])
        else:
            message_content_for_runner = Content(role="user", parts=[Part.from_text(text = full_message_text_for_model)])
>>>>>>> 8aa4c4ad (Image upload to context works)

        # Construct multimodal input for LiteLLM
        litellm_content = []
        full_message_text_for_model = ""
        for part_data in multimodal_parts:
            if part_data["type"] == "text":
                # For LiteLLM, we can aggregate text into a single part or multiple
                full_message_text_for_model += part_data["data"] + "\n"
            elif part_data["type"] == "image":
                public_url = part_data.get("public_url")
                logger.info("Public URL for image part: %s", public_url)
                if not public_url:
                    # This is the critical change. We no longer try to sign here.
                    # We raise an error if the public URL is missing.
                    error_msg = f"Image part is missing its public URL for LiteLLM call. Stored gs_uri was {part_data.get('gs_uri')}"
                    logger.error(error_msg)
                    raise ValueError(error_msg)
                litellm_content.append({"type": "image_url", "image_url": {"url": public_url}})

                # Prepend text content to the list
        if full_message_text_for_model.strip():
            litellm_content.insert(0, {"type": "text", "text": full_message_text_for_model.strip()})

            # This is a workaround to pass the complex structure to the ADK's LiteLLM wrapper.
        # We pass a special JSON string that the LiteLLM model class in adk_helpers will be adapted to parse.
        # If no images, we pass a simple text string.
        if any(p['type'] == 'image_url' for p in litellm_content):
            # This indicates to the underlying model wrapper to use the multimodal format.
            message_content_for_runner = Content(role="user", parts=[Part.from_text(
                text= json.dumps({"multimodal_content": litellm_content}))
            ])
        else:
            message_content_for_runner = Content(role="user", parts=[Part.from_text(text = full_message_text_for_model)])

        runner = Runner(agent=local_adk_agent, app_name=local_adk_agent.name, session_service=InMemorySessionService(), artifact_service=InMemoryArtifactService(), memory_service=InMemoryMemoryService())
        session = await runner.session_service.create_session(app_name=runner.app_name, user_id=adk_user_id)

        message_content = Content(role="user", parts=[Part(text=final_message_for_agent)])

        final_text = ""
        errors = []
        try:
            async for event_obj in runner.run_async(user_id=adk_user_id, session_id=session.id, new_message=message_content_for_runner):
                event_dict = event_obj.model_dump()
                assistant_message_ref.update({"run.outputEvents": firestore.ArrayUnion([event_dict])})
                content = event_dict.get("content", {})
                if content and content.get("parts"):
                    for part in content["parts"]:
                        if "text" in part:
                            final_text += part["text"]
        except Exception as e_model_run:
            logger.error(f"Error during ephemeral model run for model {model_id}: {e_model_run}")
            errors.append(f"Model run failed: {str(e_model_run)}")

        return {"finalResponseText": final_text, "queryErrorDetails": errors}


async def _run_agent_task_logic(data: dict):
    """
    Handles the background task of running an agent query and streaming results.
    """
    chat_id = data.get("chatId")
    assistant_message_id = data.get("assistantMessageId")
    agent_id = data.get("agentId")
    model_id = data.get("modelId")
    adk_user_id = data.get("adkUserId")
    stuffed_context_items = data.get("stuffedContextItems")

    logger.info(f"[TaskHandler] Starting execution for message: {assistant_message_id}")
    assistant_message_ref = db.collection("chats").document(chat_id).collection("messages").document(assistant_message_id)

    try:
        assistant_message_ref.update({"run.status": "running"})

        final_state_data = await _execute_and_stream_to_firestore(
            chat_id=chat_id,
            assistant_message_id=assistant_message_id,
            agent_id=agent_id,
            model_id=model_id,
            adk_user_id=adk_user_id,
            stuffed_context_items=stuffed_context_items
        )

        final_update_payload = {
            "content": final_state_data.get("finalResponseText", ""),
            "run.status": "error" if final_state_data.get("queryErrorDetails") else "completed",
            "run.finalResponseText": final_state_data.get("finalResponseText", ""),
            "run.queryErrorDetails": final_state_data.get("queryErrorDetails"),
            "run.completedTimestamp": firestore.SERVER_TIMESTAMP
        }

        assistant_message_ref.update(final_update_payload)
        logger.info(f"[TaskHandler] Message {assistant_message_id} completed with status: {final_update_payload['run.status']}")

    except Exception as e:
        error_msg = f"Unhandled exception in task handler for message {assistant_message_id}: {type(e).__name__} - {e}"
        logger.error(f"{error_msg}\n{traceback.format_exc()}")
        assistant_message_ref.update({
            "run.status": "error",
            "run.queryErrorDetails": firestore.ArrayUnion([f"Task handler exception: {error_msg}"]),
            "run.completedTimestamp": firestore.SERVER_TIMESTAMP
        })

def run_agent_task_wrapper(data: dict):
    """Synchronous wrapper to run the async task logic."""
    asyncio.run(_run_agent_task_logic(data))

__all__ = ['run_agent_task_wrapper']