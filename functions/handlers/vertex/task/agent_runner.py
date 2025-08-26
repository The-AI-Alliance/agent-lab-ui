# functions/handlers/vertex/task/agent_runner.py
import json
import traceback
import uuid
import httpx
from a2a.types import Message as A2AMessage, TextPart
from firebase_admin import firestore
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.memory import InMemoryMemoryService
from google.adk.artifacts import InMemoryArtifactService
from vertexai import agent_engines

from common.core import db, logger


async def _run_agent_and_collect_events(agent_run_coroutine, events_collection_ref) -> tuple[list, list]:
    """Generic runner that executes an agent, collects all events, and stores them in Firestore."""
    all_events, errors = [], []
    try:
        async for event_obj in agent_run_coroutine:
            event_dict = event_obj.model_dump() if hasattr(event_obj, 'model_dump') else event_obj
            all_events.append(event_dict)
    except Exception as e_run:
        logger.error(f"Error during agent run: {e_run}\n{traceback.format_exc()}")
        errors.append(f"Agent run failed: {str(e_run)}")

    if all_events:
        batch = db.batch()
        for index, event_dict in enumerate(all_events):
            try:
                sanitized_event_dict = json.loads(json.dumps(event_dict, default=str))
                event_with_meta = {**sanitized_event_dict, "eventIndex": index, "timestamp": firestore.SERVER_TIMESTAMP}
                batch.set(events_collection_ref.document(), event_with_meta)
            except Exception as e_json:
                logger.error(f"Could not sanitize event at index {index}. Error: {e_json}. Skipping.")
        batch.commit()
    return all_events, errors


def _find_final_response_from_events(all_events: list) -> list:
    """Parses a list of events to find the last complete model response."""
    final_model_event = next(
        (event for event in reversed(all_events) if
         event.get('content', {}).get('role') == 'model' and
         not event.get("partial", False) and
         not any('function_call' in part for part in event.get('content', {}).get('parts', []))),
        None
    )
    if final_model_event and final_model_event.get("content", {}).get("parts"):
        return final_model_event["content"]["parts"]
    return []


async def _run_adk_agent(local_adk_agent, adk_content_for_run, adk_user_id, events_collection_ref):
    """Runs a locally instantiated ADK agent."""
    runner = Runner(
        agent=local_adk_agent, app_name=local_adk_agent.name,
        session_service=InMemorySessionService(),
        artifact_service=InMemoryArtifactService(),
        memory_service=InMemoryMemoryService()
    )
    session = await runner.session_service.create_session(app_name=runner.app_name, user_id=adk_user_id)
    run_coro = runner.run_async(user_id=adk_user_id, session_id=session.id, new_message=adk_content_for_run)

    all_events, errors = await _run_agent_and_collect_events(run_coro, events_collection_ref)
    final_parts = _find_final_response_from_events(all_events)
    return {"finalParts": final_parts, "errorDetails": errors}


async def _run_vertex_agent(resource_name, adk_content_for_run, adk_user_id, events_collection_ref):
    """Runs a deployed Vertex AI Reasoning Engine."""
    remote_app = agent_engines.get(resource_name)
    message_text_for_vertex = "\n".join([p.text for p in adk_content_for_run.parts if hasattr(p, 'text') and p.text])
    if not message_text_for_vertex: # Handle image-only case
        image_count = sum(1 for p in adk_content_for_run.parts if hasattr(p, 'file_data'))
        if image_count > 0: message_text_for_vertex = f"[Image Content Provided ({image_count})]"

    run_coro = remote_app.stream_query(message=message_text_for_vertex, user_id=adk_user_id)
    all_events, errors = await _run_agent_and_collect_events(run_coro, events_collection_ref)
    final_parts = _find_final_response_from_events(all_events)
    return {"finalParts": final_parts, "errorDetails": errors}


async def _run_a2a_agent(participant_config, adk_content_for_run, events_collection_ref):
    """Runs an A2A agent (unary)."""
    endpoint_url = participant_config.get("endpointUrl")
    if not endpoint_url: raise ValueError("A2A agent config is missing 'endpointUrl'.")

    message_text = "".join([p.text for p in adk_content_for_run.parts if hasattr(p, 'text') and p.text])
    a2a_message = A2AMessage(messageId=str(uuid.uuid4()), role="user", parts=[TextPart(text=message_text)])
    errors, final_parts = [], []

    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            rpc_payload = {"jsonrpc": "2.0", "method": "message/send", "id": str(uuid.uuid4()), "params": {"message": a2a_message.model_dump(exclude_none=True)}}
            response = await client.post(endpoint_url.rstrip('/'), json=rpc_payload)
            response.raise_for_status()
            rpc_response = response.json()

            if task_result := rpc_response.get("result"):
                events_collection_ref.document().set({"type": "a2a_unary_result", "result": task_result, "eventIndex": 0, "timestamp": firestore.SERVER_TIMESTAMP})
                final_text = "".join(part.get("text", "") or part.get("text-delta", "") for artifact in task_result.get("artifacts", []) for part in artifact.get("parts", []))
                if final_text: final_parts.append({"text": final_text})
            elif error := rpc_response.get("error"):
                errors.append(f"A2A RPC error: {error}")
        except Exception as e:
            errors.append(f"A2A communication failed: {e}")

    return {"finalParts": final_parts, "errorDetails": errors}