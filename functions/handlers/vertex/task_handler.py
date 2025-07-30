# functions/handlers/vertex/task_handler.py
import asyncio
import traceback
import json
import uuid
from datetime import datetime, timezone
from google.cloud import storage
from firebase_admin import firestore
from firebase_functions import https_fn

from common.core import db, logger
from common.config import get_gcp_project_config
from common.utils import initialize_vertex_ai
from common.adk_helpers import instantiate_adk_agent_from_config, get_adk_artifact_service

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

async def get_full_message_history(chat_id, leaf_message_id):
    """Reconstructs the conversation history leading up to a specific message."""
    messages = {}
    messages_collection = db.collection("chats").document(chat_id).collection("messages")
    docs = messages_collection.stream()
    for doc in docs:
        doc_data = doc.to_dict()
        if doc_data:  # Robust: skip empty docs
            messages[doc.id] = doc_data

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
    # ... (unchanged from your code)
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
    # ... (unchanged from your code)
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

def _get_part_text_safe(part):
    if not isinstance(part, dict):
        return ""
    return part.get("data") or part.get("content") or ""

def _get_part_image_info_safe(part):
    if not isinstance(part, dict):
        return None
    if part.get("type") == "image" and (part.get("gs_uri") or part.get("storageUrl")):
        gs_uri = part.get("gs_uri") or part.get("storageUrl")
        return {
            "gs_uri": gs_uri,
            "public_url": part.get("public_url") or part.get("signedUrl"),
            "mimeType": part.get("mimeType", "image/jpeg")
        }
    return None

def _get_part_type(part):
    if isinstance(part, dict):
        return part.get("type")
    return None

async def _compose_multimodal_parts(conversation_history, stuffed_context_items):
    multimodal_parts = []

    # Context as first part if present
    context_prefix_text = ""
    if stuffed_context_items and isinstance(stuffed_context_items, list):
        prefix_chunks = []
        for item in stuffed_context_items:
            if not item or not isinstance(item, dict):
                continue
            item_name = item.get("name", "Unnamed Context Item")
            item_content = item.get("content", "[Content not available]")
            prefix_chunks.append(
                f"File: {item_name}\n``` \n{item_content}\n```"
            )
        if prefix_chunks:
            context_prefix_text = "\n---\n".join(prefix_chunks) + "\n---\nUser Query:\n"
            multimodal_parts.append({"type": "text", "data": context_prefix_text})

            # Conversation message chain (robust to missing/empty parts)
    if conversation_history:
        for msg in conversation_history:
            if not msg or not isinstance(msg, dict):
                continue
            for part in msg.get("parts", []):
                part_type = _get_part_type(part)
                if part_type == "text":
                    multimodal_parts.append({"type": "text", "data": _get_part_text_safe(part)})
                elif part_type == "image":
                    image_info = _get_part_image_info_safe(part)
                    if image_info:
                        multimodal_parts.append({
                            "type": "image",
                            **image_info
                        })
                        # Also add context images as image parts (after "main" history)
    if stuffed_context_items and isinstance(stuffed_context_items, list):
        for item in stuffed_context_items:
            if not item or not isinstance(item, dict):
                continue
            if item.get("type") == "image" and item.get("storageUrl"):
                multimodal_parts.append({
                    "type": "image",
                    "gs_uri": item.get("storageUrl"),
                    "public_url": item.get("signedUrl"),
                    "mimeType": item.get("mimeType", "image/jpeg")
                })

    return multimodal_parts

async def _execute_and_stream_to_firestore(
        chat_id: str,
        assistant_message_id: str,
        agent_id: str | None,
        model_id: str | None,
        adk_user_id: str,
        stuffed_context_items: list | None = None
):
    assistant_message_ref = db.collection("chats").document(chat_id).collection("messages").document(assistant_message_id)
    assistant_message_snap = assistant_message_ref.get()
    if not assistant_message_snap.exists:
        logger.error(f"[TaskExecutor] Assistant message {assistant_message_id} not found. Aborting task.")
        return

    assistant_message_data = assistant_message_snap.to_dict()
    parent_message_id = assistant_message_data.get("parentMessageId")
    stuffed_context_items = (assistant_message_data.get("run", {}) or {}).get("stuffedContextItems") or stuffed_context_items

    conversation_history = await get_full_message_history(chat_id, parent_message_id)
    multimodal_parts = await _compose_multimodal_parts(conversation_history, stuffed_context_items)

    logger.info(f"[TaskExecutor] multimodal_parts after robust assembly: count={len(multimodal_parts)}; first part: {multimodal_parts[0] if multimodal_parts else None}")

    project_id, location, _ = get_gcp_project_config()

    # Determine participant config (agent or model)
    if agent_id:
        participant_config_ref = db.collection("agents").document(agent_id)
    elif model_id:
        participant_config_ref = db.collection("models").document(model_id)
    else:
        raise ValueError("Task requires either agentId or modelId")

    participant_snap = participant_config_ref.get()
    if not participant_snap.exists:
        raise ValueError(f"Participant config not found for ID: {agent_id or model_id}")
    participant_config = participant_snap.to_dict()
    agent_platform = participant_config.get("platform") if participant_config else ""

    # === DISPATCHER LOGIC ===

    if agent_id and agent_platform == 'a2a':
        # ... (your unchanged A2A logic) ...
        last_user_message = next((msg for msg in reversed(conversation_history) if msg and isinstance(msg, dict) and msg.get("participant", "").startswith("user:")), None)
        user_message_content = last_user_message.get("content", "") if last_user_message else ""
        context_string_prefix = ""
        if stuffed_context_items and isinstance(stuffed_context_items, list):
            prefix_chunks = []
            for item in stuffed_context_items:
                if not item or not isinstance(item, dict):
                    continue
                item_name = item.get("name", "Unnamed Context Item")
                item_content = item.get("content", "[Content not available]")
                prefix_chunks.append(
                    f"File: {item_name}\n``` \n{item_content}\n```"
                )
            context_string_prefix = "\n---\n".join(prefix_chunks) + "\n---\nUser Query:\n"
        final_a2a_message_content = (context_string_prefix + user_message_content).strip()

        agent_capabilities = participant_config.get("agentCard", {}).get("capabilities", {})
        is_streaming = agent_capabilities.get("streaming", False)

        if is_streaming:
            logger.info("[A2AExecutor/Dispatch] Determined agent protocol: Streaming. Calling stream handler.")
            return await _run_a2a_agent_stream(participant_config, final_a2a_message_content, assistant_message_ref)
        else:
            logger.info("[A2AExecutor/Dispatch] Determined agent protocol: Non-Streaming (Unary). Calling unary handler.")
            return await _run_a2a_agent_unary(participant_config, final_a2a_message_content, assistant_message_ref)

    elif agent_id and agent_platform == "vertex":
        resource_name = participant_config.get("vertexAiResourceName")
        if not resource_name or participant_config.get("deploymentStatus") != "deployed":
            raise ValueError(f"Agent {agent_id} is not successfully deployed.")

        final_message_for_agent = "\n\n".join([
            part.get("data", "") for part in multimodal_parts if part.get("type") == "text" and part.get("data")
        ])
        if not final_message_for_agent:
            logger.warn("No user message text (or context) found for deployed Vertex agent run - adding an empty string.")
            final_message_for_agent = ""

        session_service = VertexAiSessionService(project=project_id, location=location)
        session = await session_service.create_session(app_name=resource_name, user_id=adk_user_id)
        current_adk_session_id = session.id

        remote_app = get_engine(resource_name)
        final_text = ""
        errors = []
        try:
            for event_obj in remote_app.stream_query(
                    message=final_message_for_agent,
                    user_id=adk_user_id,
                    session_id=current_adk_session_id
            ):
                if hasattr(event_obj, 'model_dump'):
                    event_dict = event_obj.model_dump()
                elif isinstance(event_obj, dict):
                    event_dict = event_obj
                else:
                    event_dict = {"raw": str(event_obj)}
                assistant_message_ref.update({"run.outputEvents": firestore.ArrayUnion([event_dict])})
                content = event_dict.get("content", {})
                if content and content.get("parts"):
                    for part in content["parts"]:
                        if "text" in part:
                            final_text += part["text"]
        except Exception as e_run:
            logger.error(f"Error during Vertex engine run: {e_run}", exc_info=True)
            errors.append(f"ADK runner failed: {str(e_run)}")
        return {"finalResponseText": final_text, "queryErrorDetails": errors}

    elif model_id:
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

        adk_parts = []
        for part_data in multimodal_parts:
            if not part_data or not isinstance(part_data, dict):
                continue
            if part_data.get("type") == "text":
                text = part_data.get("data", "")
                if text.strip():
                    adk_parts.append(Part.from_text(text=text))
            elif part_data.get("type") == "image":
                gs_uri = part_data.get("gs_uri") or part_data.get("storageUrl")
                if gs_uri and gs_uri.startswith("gs://"):
                    try:
                        bucket_name = gs_uri.split('/')[2]
                        blob_name = '/'.join(gs_uri.split('/')[3:])
                        bucket = storage_client.bucket(bucket_name)
                        blob = bucket.blob(blob_name)
                        image_bytes = blob.download_as_bytes()
                        mime_type = part_data.get("mimeType") or "image/jpeg"
                        adk_parts.append(Part.from_bytes(data=image_bytes, mime_type=mime_type))
                    except Exception as e_img:
                        logger.error(f"Failed to load image artifact from gs_uri {gs_uri}: {e_img}", exc_info=True)
                else:
                    public_url = part_data.get("public_url")
                    logger.warn(f"Image part without gs_uri found (public_url: {public_url}), skipping because we require gs-submitted images.")

        if not adk_parts:
            logger.warn("No message parts were created for the model run (no text, no context, no images). Adding an empty text part to avoid ADK error.")
            adk_parts.append(Part.from_text(text=""))

        message_content_for_runner = Content(role="user", parts=adk_parts)

        runner = Runner(
            agent=local_adk_agent,
            app_name=local_adk_agent.name,
            session_service=InMemorySessionService(),
            artifact_service=InMemoryArtifactService(),
            memory_service=InMemoryMemoryService()
        )
        session = await runner.session_service.create_session(app_name=runner.app_name, user_id=adk_user_id)

        final_text = ""
        errors = []

        try:
            async for event_obj in runner.run_async(
                    user_id=adk_user_id,
                    session_id=session.id,
                    new_message=message_content_for_runner
            ):
                event_dict = event_obj.model_dump()
                assistant_message_ref.update({"run.outputEvents": firestore.ArrayUnion([event_dict])})
                content = event_dict.get("content", {})
                if content and content.get("parts"):
                    for part in content["parts"]:
                        if "text" in part:
                            final_text += part["text"]
        except Exception as e_model_run:
            logger.error(f"Error during ephemeral model run for model {model_id}: {e_model_run}\n{traceback.format_exc()}")
            errors.append(f"Model run failed: {str(e_model_run)}")

        return {"finalResponseText": final_text, "queryErrorDetails": errors}


async def _run_agent_task_logic(data: dict):
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
        try:
            assistant_message_ref.update({
                "run.status": "error",
                "run.queryErrorDetails": firestore.ArrayUnion([f"Task handler exception: {error_msg}"]),
                "run.completedTimestamp": firestore.SERVER_TIMESTAMP
            })
        except Exception as ee:
            logger.error(f"Failed to update error status in Firestore for message {assistant_message_id}: {ee}", exc_info=True)

def run_agent_task_wrapper(data: dict):
    asyncio.run(_run_agent_task_logic(data))

__all__ = ['run_agent_task_wrapper']