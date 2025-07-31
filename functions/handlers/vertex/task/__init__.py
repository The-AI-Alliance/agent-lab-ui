# functions/handlers/vertex/task/__init__.py
import asyncio
import traceback
import json
import uuid
from google.cloud import storage

from firebase_admin import firestore
from common.core import db, logger
from common.adk_helpers import instantiate_adk_agent_from_config, get_adk_artifact_service
from google.genai.types import Content, Part
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService, VertexAiSessionService
from google.adk.memory import InMemoryMemoryService
# CORRECTED IMPORT: Use agent_engines to get a deployed engine
from vertexai import agent_engines
import httpx
from a2a.types import Message as A2AMessage, TextPart

storage_client = storage.Client()

# --- Message History and Prompt Construction ---

async def get_full_message_history(chat_id: str, leaf_message_id: str | None) -> list[dict]:
    """Reconstructs the conversation history leading up to a specific message."""
    logger.info(f"[TaskExecutor] Fetching full message history for chat {chat_id} starting from leaf message {leaf_message_id}.")
    if not leaf_message_id:
        return []
    messages = {}
    messages_collection = db.collection("chats").document(chat_id).collection("messages")
    for doc in messages_collection.stream():
        doc_data = doc.to_dict()
        logger.log(f"[TaskExecutor - DEBUG] Fetched message {doc.id} with parentMessageId: {doc_data.get('parentMessageId')}")
        if doc_data:
            messages[doc.id] = doc_data
    logger.log(f"[TaskExecutor - DEBUG] Total messages fetched: {len(messages)}")
    history = []
    current_id = leaf_message_id
    while current_id and current_id in messages:
        logger.log(f"[TaskExecutor - DEBUG] Reconstructing history: current_id={current_id}")
        message = messages[current_id]
        logger.log(f"[TaskExecutor - DEBUG] message.keys() : {str(message.keys())}")

        history.insert(0, message)
        current_id = message.get("parentMessageId")
    logger.log(f"[TaskExecutor - DEBUG] Full history reconstructed with {len(history)} messages.")
    return history

async def _create_artifacts_from_context(raw_context_items: list, chat_id: str, adk_user_id: str) -> list[dict]:
    """Saves raw context items as chat-scoped ADK artifacts and returns references."""
    if not raw_context_items:
        return []

    artifact_service = await get_adk_artifact_service()
    processed_artifacts = []
    logger.info(f"[TaskExecutor] Creating artifacts from {len(raw_context_items)} raw context items for chat {chat_id}.")

    for item in raw_context_items:
        if not isinstance(item, dict): continue
        item_type = item.get("type")
        original_name = item.get("name", "context-item")
        filename = f"{item_type}-{uuid.uuid4().hex[:12]}-{original_name.replace('/', '_')}"
        artifact_part = None

        try:
            # Handle text-based context items (PDF, Git, Webpage)
            if item_type in ["pdf", "webpage", "git_repo", "text"]:
                content = item.get("content", "")
                if not content: continue
                artifact_part = Part.from_text(text=content)

                # Handle image-based context items which provide a storageUrl
            elif item_type == "image" and "storageUrl" in item:
                gcs_uri = item["storageUrl"]
                if not gcs_uri.startswith("gs://"): continue

                # Read the image bytes from the temporary GCS location
                bucket_name = gcs_uri.split('/')[2]
                blob_name = '/'.join(gcs_uri.split('/')[3:])
                bucket = storage_client.bucket(bucket_name)
                blob = bucket.blob(blob_name)
                image_bytes = blob.download_as_bytes()

                artifact_part = Part.from_bytes(data=image_bytes, mime_type=item.get("mimeType", "image/png"))

            if artifact_part:
                version = await artifact_service.save_artifact(
                    app_name="agentlab",
                    user_id=adk_user_id,
                    session_id=chat_id, # Use chat_id to scope artifacts
                    filename=filename,
                    artifact=artifact_part
                )
                processed_artifacts.append({
                    "filename": filename, "version": version,
                    "originalName": original_name, "type": item_type
                })
                logger.info(f"Saved chat-scoped artifact '{filename}' (v{version}) for chat {chat_id}.")

        except Exception as e:
            logger.error(f"Failed to create artifact for item '{original_name}': {e}", exc_info=True)

    return processed_artifacts


async def _build_adk_content_from_history_and_artifacts(
        conversation_history: list[dict],
        processed_artifacts: list[dict],
        chat_id: str,
        adk_user_id: str
) -> tuple[Content, int]:
    """Constructs a multi-part ADK Content object from history and loaded artifacts."""
    artifact_service = await get_adk_artifact_service()
    adk_parts = []
    total_char_count = 0
    logger.info(f"[TaskExecutor] Building ADK content for chat {chat_id} with {len(processed_artifacts)} artifacts and {len(conversation_history)} history messages.")
    # 1. Load artifact content and prepend it
    if processed_artifacts:
        context_text_chunks = []
        for artifact_ref in processed_artifacts:
            try:
                loaded_artifact = await artifact_service.load_artifact(
                    app_name="agentlab",
                    user_id=adk_user_id,
                    session_id=chat_id,
                    filename=artifact_ref["filename"],
                    version=artifact_ref["version"]
                )
                if loaded_artifact:
                    if loaded_artifact.text:
                        context_text_chunks.append(f"--- START CONTEXT FILE: {artifact_ref['originalName']} ---\n{loaded_artifact.text}\n--- END CONTEXT FILE ---")
                        total_char_count += len(loaded_artifact.text)
                    elif loaded_artifact.inline_data:
                        adk_parts.append(loaded_artifact) # Add image part directly
            except Exception as e:
                logger.error(f"Failed to load artifact '{artifact_ref['filename']}' for prompt construction: {e}")
                context_text_chunks.append(f"[Error loading context file: {artifact_ref['originalName']}]")

        if context_text_chunks:
            full_context_text = "\n\n".join(context_text_chunks)
            adk_parts.insert(0, Part.from_text(text= full_context_text))

            # 2. Add conversation history
    for msg in conversation_history:
        # We only care about the user's conversational turns for the prompt
        if msg.get("participant", "").startswith("user:"):
            for part_data in msg.get("parts", []):
                if part_data.get("type") == "text":
                    text = part_data.get("content", "")
                    adk_parts.append(Part.from_text(text= text))
                    total_char_count += len(text)
                elif part_data.get("type") == "image" and "storageUrl" in part_data and part_data["storageUrl"].startswith("gs://"):
                    adk_parts.append(Part.from_uri(uri=part_data["storageUrl"], mime_type=part_data.get("mimeType", "image/jpeg")))

    if not adk_parts:
        logger.warn("No message parts were created. Adding an empty text part to avoid ADK error.")
        adk_parts.append(Part.from_text(text=""))


    return Content(role="user", parts=adk_parts), total_char_count

# --- Agent/Model Execution Logic ---

async def _run_adk_agent(local_adk_agent, adk_content_for_run, adk_user_id, assistant_message_ref):
    """Runs a locally instantiated ADK agent (typically for an API-based model)."""
    from google.adk.artifacts import InMemoryArtifactService
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
                new_message=adk_content_for_run
        ):
            event_dict = event_obj.model_dump()
            assistant_message_ref.update({"run.outputEvents": firestore.ArrayUnion([event_dict])})
            content = event_dict.get("content", {})
            if content and content.get("parts"):
                for part in content["parts"]:
                    if "text" in part:
                        final_text += part["text"]
    except Exception as e_run:
        logger.error(f"Error during ADK agent run for '{local_adk_agent.name}': {e_run}\n{traceback.format_exc()}")
        errors.append(f"Agent/Model run failed: {str(e_run)}")
    return {"finalResponseText": final_text, "queryErrorDetails": errors}

async def _run_vertex_agent(resource_name, adk_content_for_run, adk_user_id, assistant_message_ref):
    """Runs a deployed Vertex AI Reasoning Engine."""
    logger.info(f"Running deployed Vertex agent: {resource_name}")
    remote_app = agent_engines.get(resource_name)
    from common.config import get_gcp_project_config
    project_id, location, _ = get_gcp_project_config()
    session_service = VertexAiSessionService(project=project_id, location=location)
    session = await session_service.create_session(app_name=resource_name, user_id=adk_user_id)

    final_text = ""
    errors = []
    try:
        # The deployed `stream_query` endpoint currently accepts a simple string `message`.
        # We must serialize our rich Content object into text for it.
        # This is a known limitation that means images in context are not passed to deployed agents.
        message_text_for_vertex = "\n".join([p.text for p in adk_content_for_run.parts if hasattr(p, 'text') and p.text])
        if not any(p.text for p in adk_content_for_run.parts if hasattr(p, 'text')):
            image_count = sum(1 for p in adk_content_for_run.parts if hasattr(p, 'inline_data'))
            if image_count > 0:
                message_text_for_vertex = f"[Image Content Provided ({image_count})]"

        async for event_obj in remote_app.stream_query(
                message=message_text_for_vertex,
                user_id=adk_user_id,
                session_id=session.id
        ):
            if hasattr(event_obj, 'model_dump'): event_dict = event_obj.model_dump()
            else: event_dict = {"raw": str(event_obj)}
            assistant_message_ref.update({"run.outputEvents": firestore.ArrayUnion([event_dict])})
            if event_dict.get("content", {}).get("parts"):
                for part in event_dict["content"]["parts"]:
                    if "text" in part: final_text += part["text"]
    except Exception as e:
        errors.append(f"Vertex run failed: {str(e)}")
        logger.error(f"Error during Vertex engine run: {e}", exc_info=True)
    return {"finalResponseText": final_text, "queryErrorDetails": errors}

async def _run_a2a_agent(participant_config, adk_content_for_run, assistant_message_ref):
    """Runs an A2A agent (unary)."""
    endpoint_url = participant_config.get("endpointUrl")
    if not endpoint_url:
        raise ValueError("A2A agent config is missing 'endpointUrl'.")
    message_text_for_a2a = "".join([part.text for part in adk_content_for_run.parts if hasattr(part, 'text') and part.text])
    a2a_message = A2AMessage(messageId=str(uuid.uuid4()), role="user", parts=[TextPart(text=message_text_for_a2a)])
    rpc_endpoint_url = endpoint_url.rstrip('/')
    errors, final_text = [], ""
    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            rpc_payload = {
                "jsonrpc": "2.0", "method": "message/send", "id": f"agentlab-send-{uuid.uuid4().hex}",
                "params": {"message": a2a_message.model_dump(exclude_none=True)}
            }
            response = await client.post(rpc_endpoint_url, json=rpc_payload)
            response.raise_for_status()
            rpc_response = response.json()
            task_result = rpc_response.get("result")
            if task_result:
                assistant_message_ref.update({"run.outputEvents": firestore.ArrayUnion([{"type": "a2a_unary_task_result", "source_event": task_result}])})
                for artifact in task_result.get("artifacts", []):
                    for part in artifact.get("parts", []):
                        if part.get("text") or part.get("text-delta"):
                            final_text += part.get("text", "") or part.get("text-delta", "")
            elif rpc_response.get("error"):
                errors.append(f"A2A 'message/send' error: {rpc_response['error']}")
        except Exception as e:
            logger.error(f"Failed to communicate with A2A agent: {e}\n{traceback.format_exc()}")
            errors.append(f"A2A communication failed: {e}")
    return {"finalResponseText": final_text, "queryErrorDetails": errors}

# --- Main Task Handler Logic ---

async def _execute_and_stream_to_firestore(
        chat_id: str, assistant_message_id: str, agent_id: str | None,
        model_id: str | None, adk_user_id: str
):
    """The core logic that runs in the background task."""
    logger.info(f"[TaskExecutor] Starting execution for message {assistant_message_id} in chat {chat_id}.")
    assistant_message_ref = db.collection("chats").document(chat_id).collection("messages").document(assistant_message_id)
    assistant_message_snap = assistant_message_ref.get()
    if not assistant_message_snap.exists: raise ValueError(f"Assistant message {assistant_message_id} not found.")
    run_data = assistant_message_snap.to_dict().get("run", {})
    parent_message_id = assistant_message_snap.to_dict().get("parentMessageId")
    raw_context_items = run_data.get("rawStuffedContextItems")
    logger.info(f"[TaskExecutor] Raw context items for message {assistant_message_id}: {len(raw_context_items) if raw_context_items else 0} items.")
    processed_artifacts = await _create_artifacts_from_context(raw_context_items, chat_id, adk_user_id)
    logger.info(f"[TaskExecutor] Processed artifacts for message {assistant_message_id}: {len(processed_artifacts)} items.")
    assistant_message_ref.update({"run.processedArtifacts": processed_artifacts})

    conversation_history = await get_full_message_history(chat_id, parent_message_id)
    logger.info(f"[TaskExecutor] Full conversation history for message {assistant_message_id} retrieved with {len(conversation_history)} messages.")
    adk_content_for_run, char_count = await _build_adk_content_from_history_and_artifacts(
        conversation_history, processed_artifacts, chat_id, adk_user_id
    )
    assistant_message_ref.update({"run.inputCharacterCount": char_count})

    participant_ref = db.collection("agents").document(agent_id) if agent_id else db.collection("models").document(model_id)
    participant_snap = participant_ref.get()
    if not participant_snap.exists: raise ValueError(f"Participant config not found for ID: {agent_id or model_id}")
    participant_config = participant_snap.to_dict()

    agent_platform = participant_config.get("platform")
    if agent_id and agent_platform == 'a2a':
        return await _run_a2a_agent(participant_config, adk_content_for_run, assistant_message_ref)
    elif agent_id and agent_platform == 'vertex':
        resource_name = participant_config.get("vertexAiResourceName")
        if not resource_name or participant_config.get("deploymentStatus") != "deployed":
            raise ValueError(f"Agent {agent_id} is not successfully deployed.")
        return await _run_vertex_agent(resource_name, adk_content_for_run, adk_user_id, assistant_message_ref)
    elif model_id:
        model_only_agent_config = {
            "name": f"ephemeral_model_run_{model_id[:6]}",
            "agentType": "Agent", "tools": [], "modelId": model_id,
        }
        local_adk_agent = await instantiate_adk_agent_from_config(model_only_agent_config)
        return await _run_adk_agent(local_adk_agent, adk_content_for_run, adk_user_id, assistant_message_ref)
    return {"finalResponseText": "", "queryErrorDetails": [f"No valid execution path found for agentId: {agent_id}, modelId: {model_id}"]}

# --- Wrapper for Cloud Task ---

async def _run_agent_task_logic(data: dict):
    """Async logic for the task, with error handling."""
    chat_id = data.get("chatId")
    assistant_message_id = data.get("assistantMessageId")
    logger.info(f"[TaskHandler] Starting execution for message: {assistant_message_id}")
    assistant_message_ref = db.collection("chats").document(chat_id).collection("messages").document(assistant_message_id)
    try:
        assistant_message_ref.update({"run.status": "running"})
        final_state_data = await _execute_and_stream_to_firestore(
            chat_id=chat_id, assistant_message_id=assistant_message_id,
            agent_id=data.get("agentId"), model_id=data.get("modelId"),
            adk_user_id=data.get("adkUserId")
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
            logger.error(f"Failed to update error status for Firestore message {assistant_message_id}: {ee}", exc_info=True)

def run_agent_task_wrapper(data: dict):
    """Synchronous wrapper to be called by the Cloud Task entry point."""
    asyncio.run(_run_agent_task_logic(data))