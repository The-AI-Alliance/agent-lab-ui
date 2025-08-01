# functions/handlers/vertex/orchestrator/__init__.py
import json
from google.cloud import tasks_v2

from firebase_admin import firestore
from firebase_functions import https_fn

from common.core import db, logger
from common.config import get_gcp_project_config
from common.utils import initialize_vertex_ai

def query_deployed_agent_orchestrator_logic(req: https_fn.CallableRequest):
    """
    IMMEDIATE RESPONSE: Validates request, creates a placeholder message in Firestore (and a user message if content is provided),
    enqueues a Cloud Task, and returns the new assistant messageId.
    """
    data = req.data
    agent_id = data.get("agentId")
    model_id = data.get("modelId")
    message_text = data.get("message")
    adk_user_id = data.get("adkUserId")
    chat_id = data.get("chatId")
    parent_message_id = data.get("parentMessageId") # Can be null

    # This now contains the full raw content from the client.
    stuffed_context_items = data.get("stuffedContextItems")

    firebase_auth_uid = req.auth.uid if req.auth else "unknown_firebase_auth_uid"

    if not chat_id or not adk_user_id:
        logger.error(f"Invalid arguments received. chatId: {chat_id}, adkUserId: {adk_user_id}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="chatId and adkUserId are required.")
    if not agent_id and not model_id:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Either agentId or modelId must be provided.")

    initialize_vertex_ai()
    project_id, location, _ = get_gcp_project_config()

    batch = db.batch()
    chat_ref = db.collection("chats").document(chat_id)
    messages_col_ref = chat_ref.collection("messages")

    effective_parent_id = parent_message_id
    user_message_id = None

    # Always create a user message if there's text or context.
    # The client constructs the display, the backend just needs to log it.
    if (message_text and message_text.strip()) or (stuffed_context_items and isinstance(stuffed_context_items, list)):
        user_message_ref = messages_col_ref.document()
        user_message_id = user_message_ref.id
        user_message_parts = []
        if message_text and message_text.strip():
            user_message_parts.append({"type": "text", "content": message_text})

        # Add stubs for context items for display purposes on the client.
        # New: stuffedContextItems now contain GCS URIs and are structured like Parts
        if stuffed_context_items and isinstance(stuffed_context_items, list):
            for item in stuffed_context_items: # item is now a dict like {name, storageUrl, mimeType, type}
                if isinstance(item, dict) and 'storageUrl' in item and 'mimeType' in item:
                    user_message_parts.append({
                        "file_data": {"file_uri": item['storageUrl'], "mime_type": item['mimeType']}
                    })

        user_message_data = {
            "id": user_message_id,
            "parts": user_message_parts,
            "participant": f"user:{firebase_auth_uid}",
            "parentMessageId": parent_message_id,
            "childMessageIds": [],
            "timestamp": firestore.SERVER_TIMESTAMP,
        }
        batch.set(user_message_ref, user_message_data)

        if parent_message_id:
            parent_message_ref = messages_col_ref.document(parent_message_id)
            batch.update(parent_message_ref, {"childMessageIds": firestore.ArrayUnion([user_message_id])})

        effective_parent_id = user_message_id
        logger.info(f"[Orchestrator] Creating user message {user_message_id} for chat {chat_id}.")

    assistant_message_ref = messages_col_ref.document()
    assistant_message_id = assistant_message_ref.id
    participant_id = f"agent:{agent_id}" if agent_id else f"model:{model_id}"
    assistant_message_data = {
        "id": assistant_message_id,
        "content": "", # Will be populated by the task
        "participant": participant_id,
        "parentMessageId": effective_parent_id,
        "childMessageIds": [],
        "parts": [],
        "timestamp": firestore.SERVER_TIMESTAMP,
    }
    batch.set(assistant_message_ref, assistant_message_data)

    if effective_parent_id:
        effective_parent_ref = messages_col_ref.document(effective_parent_id)
        batch.update(effective_parent_ref, {"childMessageIds": firestore.ArrayUnion([assistant_message_id])})

    batch.update(chat_ref, {"lastInteractedAt": firestore.SERVER_TIMESTAMP})
    batch.commit()
    logger.info(f"[Orchestrator] Created placeholder assistant message {assistant_message_id} for chat {chat_id}.")

    try:
        tasks_client = tasks_v2.CloudTasksClient()
        queue_path = tasks_client.queue_path(project_id, location, "executeAgentRunTask") # lowercase for queue name

        task_payload = {
            "chatId": chat_id,
            "assistantMessageId": assistant_message_id,
            "agentId": agent_id,
            "modelId": model_id,
            "adkUserId": adk_user_id,
            "firebaseAuthUid": firebase_auth_uid,
        }

        task = {
            "http_request": {
                "http_method": tasks_v2.HttpMethod.POST,
                "url": f"https://{location}-{project_id}.cloudfunctions.net/executeAgentRunTask",
                "headers": {"Content-type": "application/json"},
                "body": json.dumps({"data": task_payload}).encode(),
            }
        }
        tasks_client.create_task(parent=queue_path, task=task)
        logger.info(f"[Orchestrator] Enqueued task for assistantMessageId: {assistant_message_id}")

    except Exception as e:
        logger.error(f"[Orchestrator] CRITICAL: Failed to enqueue task for message {assistant_message_id}: {e}")
        assistant_message_ref.update({
            "run.status": "error",
            "run.queryErrorDetails": [f"Failed to start agent run (task enqueue error): {e}"]
        })
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message="Failed to start the agent run.")

    return {"success": True, "assistantMessageId": assistant_message_id}