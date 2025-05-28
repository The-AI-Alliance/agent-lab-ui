# functions/handlers/vertex/query_logic.py
import json
import asyncio # Make sure asyncio is imported
import traceback
from datetime import datetime, timedelta, timezone
from firebase_admin import firestore
from firebase_functions import https_fn
from vertexai import agent_engines as deployed_agent_engines
from google.adk.sessions import VertexAiSessionService
from google.cloud.logging_v2.services.logging_service_v2 import LoggingServiceV2Client
# google.protobuf.timestamp_pb2 might not be needed if using isoformat for filter
# from google.protobuf.timestamp_pb2 import Timestamp as ProtoTimestamp # Not strictly needed for filter

from common.core import db, logger
from common.config import get_gcp_project_config
from common.utils import initialize_vertex_ai

logging_client = LoggingServiceV2Client()

def get_reasoning_engine_id_from_name(resource_name: str) -> str | None:
    if not resource_name: return None
    parts = resource_name.split('/')
    if len(parts) == 6 and parts[0] == 'projects' and parts[2] == 'locations' and parts[4] == 'reasoningEngines':
        return parts[5]
    logger.warning(f"Could not parse reasoning_engine_id from resource_name: {resource_name}")
    return None

def _fetch_vertex_logs_sync(project_id: str, location: str, reasoning_engine_id: str, adk_session_id: str | None, start_time_dt_aware: datetime):
    """Synchronous helper to fetch logs, intended to be run in a thread."""
    log_errors_thread = []
    try:
        end_time_dt_ideal = start_time_dt_aware + timedelta(minutes=5) # Log window
        end_time_dt_actual = min(datetime.now(timezone.utc), end_time_dt_ideal)

        log_filter_parts = [
            f'resource.type="aiplatform.googleapis.com/ReasoningEngine"',
            f'resource.labels.reasoning_engine_id="{reasoning_engine_id}"',
            f'resource.labels.location="{location}"',
            f'severity>="WARNING"',
            f'timestamp >= "{start_time_dt_aware.isoformat()}"',
            f'timestamp <= "{end_time_dt_actual.isoformat()}"'
        ]
        if adk_session_id:
            log_filter_parts.append(f'(jsonPayload.session_id="{adk_session_id}" OR jsonPayload.adk_session_id="{adk_session_id}" OR textPayload:"{adk_session_id}")')

        final_log_filter = " AND ".join(log_filter_parts)
        # This logging will occur in the thread if called via to_thread
        # logger.info(f"Thread: Constructing Cloud Logging filter: {final_log_filter}")

        log_request = {
            "resource_names": [f"projects/{project_id}"],
            "filter": final_log_filter,
            "order_by": "timestamp desc",
            "page_size": 10
        }
        entries_iterator = logging_client.list_log_entries(request=log_request)

        for entry in entries_iterator:
            message = ""
            if entry.text_payload: message = entry.text_payload
            elif entry.json_payload:
                payload_message = entry.json_payload.get('message', entry.json_payload.get('msg', str(entry.json_payload)))
                message = payload_message if isinstance(payload_message, str) else json.dumps(payload_message)
            py_datetime = entry.timestamp.replace(tzinfo=timezone.utc)
            log_errors_thread.append(f"[{entry.severity.name} @ {py_datetime.strftime('%Y-%m-%dT%H:%M:%SZ')}]: {message}"[:1000])
            if len(log_errors_thread) >= 5: break
            # logger.info(f"Thread: Fetched {len(log_errors_thread)} relevant log entries.")
    except Exception as e_thread:
        # logger.error(f"Thread: Error fetching logs from Cloud Logging: {e_thread}")
        log_errors_thread.append(f"INTERNAL_LOG_FETCH_ERROR (thread): {str(e_thread)}")
    return log_errors_thread

async def fetch_vertex_logs(project_id: str, location: str, reasoning_engine_id: str, adk_session_id: str | None, start_time_dt: datetime):
    if not reasoning_engine_id:
        logger.info("fetch_vertex_logs: reasoning_engine_id is missing, skipping log fetch.")
        return []
    start_time_dt_aware = start_time_dt if start_time_dt.tzinfo else start_time_dt.replace(tzinfo=timezone.utc)
    logger.info(f"Dispatching synchronous log fetch to thread for engine {reasoning_engine_id}, session {adk_session_id or 'N/A'}.")
    try:
        log_errors = await asyncio.to_thread(
            _fetch_vertex_logs_sync, project_id, location, reasoning_engine_id, adk_session_id, start_time_dt_aware
        )
        logger.info(f"Async wrapper: Received {len(log_errors)} log entries from thread.")
        return log_errors
    except Exception as e_async_wrapper:
        logger.error(f"Async wrapper: Error calling _fetch_vertex_logs_sync via to_thread: {e_async_wrapper}")
        return [f"INTERNAL_ASYNC_LOG_FETCH_ERROR: {str(e_async_wrapper)}"]


def _iterate_stream_query_sync(remote_app, message_text, adk_user_id, current_adk_session_id):
    """Synchronous helper to iterate stream_query, intended to be run in a thread."""
    all_events_thread = []
    final_text_response_thread = ""
    query_error_details_thread = []
    stream_had_exceptions_thread = False
    event_idx_thread = 0
    try:
        # This is the key change: using a synchronous for loop
        for event in remote_app.stream_query(message=message_text, user_id=adk_user_id, session_id=current_adk_session_id):
            # logger.debug(f"Thread Query Event {event_idx_thread} for session '{current_adk_session_id}': ...") # Keep logs concise for thread
            all_events_thread.append(event)
            if event.get('type') == 'text_delta' and event.get('content', {}).get('parts'):
                for part in event['content']['parts']:
                    if 'text' in part: final_text_response_thread += part['text']
            if event.get('error_message'):
                error_msg = f"Error in event stream (thread): {event['error_message']}"
                query_error_details_thread.append(error_msg)
                stream_had_exceptions_thread = True
            event_idx_thread += 1
    except Exception as e_thread:
        # logger.error(f"Query Stream Exception in thread (session {current_adk_session_id}): {e_thread}")
        query_error_details_thread.append(f"Agent stream error (thread): {str(e_thread)}")
        stream_had_exceptions_thread = True
    return all_events_thread, final_text_response_thread, query_error_details_thread, stream_had_exceptions_thread, event_idx_thread


async def _query_async_logic_internal(resource_name, message_text, adk_user_id, session_id_from_client, project_id, location, firestore_agent_id):
    query_start_time_utc = datetime.now(timezone.utc)
    current_adk_session_id = None

    session_service = VertexAiSessionService(project=project_id, location=location)
    try:
        remote_app = deployed_agent_engines.get(resource_name)
    except Exception as e_get_app:
        logger.error(f"Query Prep: Failed to get remote app '{resource_name}'. Error: {e_get_app}")
        reasoning_engine_id_val_fallback = get_reasoning_engine_id_from_name(resource_name)
        log_errors_fallback = []
        if reasoning_engine_id_val_fallback:
            log_errors_fallback = await fetch_vertex_logs(project_id, location, reasoning_engine_id_val_fallback, None, query_start_time_utc)
        return {"events": [], "responseText": "", "adkSessionId": None, "queryErrorDetails": [f"Failed to access agent: {str(e_get_app)}"] + log_errors_fallback}

    logger.info(f"Query Prep: Retrieved remote app: {remote_app.name}")

    if session_id_from_client:
        try:
            retrieved_session = await session_service.get_session(app_name=resource_name, user_id=adk_user_id, session_id=session_id_from_client)
            if retrieved_session: current_adk_session_id = retrieved_session.id
            else: logger.warning(f"Query Prep: get_session for '{session_id_from_client}' returned None.")
        except Exception as e:
            logger.warning(f"Query Prep: Failed to retrieve session '{session_id_from_client}'. Error: {e}. Will create new.")
    if not current_adk_session_id:
        try:
            new_session = await session_service.create_session(app_name=resource_name, user_id=adk_user_id)
            current_adk_session_id = new_session.id
            logger.info(f"Query Prep: Created new ADK session: {current_adk_session_id}")
        except Exception as e_create_sess:
            logger.error(f"Query Prep: Failed to create new ADK session. Error: {e_create_sess}")
            return {"events": [], "responseText": "", "adkSessionId": None, "queryErrorDetails": [f"Session creation failed: {str(e_create_sess)}"]}
    if not current_adk_session_id:
        return {"events": [], "responseText": "", "adkSessionId": None, "queryErrorDetails": ["Critical: No ADK session."]}

    logger.info(f"Query Iteration: Dispatching stream_query to thread for ADK session '{current_adk_session_id}', user '{adk_user_id}', msg: '{message_text[:50]}...'")

    try:
        all_events, final_text_response, query_error_details_from_stream, stream_had_exceptions, event_idx = await asyncio.to_thread(
            _iterate_stream_query_sync,
            remote_app,
            message_text,
            adk_user_id,
            current_adk_session_id
        )
        logger.debug(f"Threaded query for session '{current_adk_session_id}' completed. Events: {event_idx}, Exceptions: {stream_had_exceptions}")
    except Exception as e_to_thread:
        logger.error(f"Exception from asyncio.to_thread running _iterate_stream_query_sync (session {current_adk_session_id}): {e_to_thread}\n{traceback.format_exc()}")
        query_error_details_from_stream = [f"Async wrapper error for stream_query: {str(e_to_thread)}"]
        stream_had_exceptions = True
        all_events, final_text_response, event_idx = [], "", 0

    logger.info(f"Query Stream Complete (session {current_adk_session_id}): {event_idx} events. Resp len: {len(final_text_response)}. Stream exceptions: {stream_had_exceptions}")

    fetched_log_errors = []
    if stream_had_exceptions or not final_text_response or not all_events:
        reasoning_engine_id_val = get_reasoning_engine_id_from_name(resource_name)
        if reasoning_engine_id_val:
            fetched_log_errors = await fetch_vertex_logs(project_id, location, reasoning_engine_id_val, current_adk_session_id, query_start_time_utc)
        else:
            logger.warning("Could not determine reasoning_engine_id; skipping Vertex log fetch.")

    if not final_text_response and not query_error_details_from_stream and not fetched_log_errors and all_events:
        logger.info(f"Query Fallback: No text_delta, checking last events for session {current_adk_session_id}")
        for event_item in reversed(all_events):
            if event_item.get('content') and event_item['content'].get('parts'):
                temp_text = "".join(part.get('text', '') for part in event_item['content']['parts'] if 'text' in part)
                if temp_text:
                    final_text_response = f"(Content from event type '{event_item.get('type')}'): {temp_text}"
                    logger.info(f"Query Fallback: Found text in event {event_item.get('type')}: {final_text_response[:100]}...")
                    break

    combined_errors = query_error_details_from_stream + fetched_log_errors
    if not combined_errors and not final_text_response and not all_events:
        combined_errors.append("Agent produced no events and no text response. Check Vertex logs for deployment or runtime issues.")
        logger.warning(f"Query for session {current_adk_session_id} resulted in no events and no text response.")

    return {
        "events": all_events, "responseText": final_text_response,
        "adkSessionId": current_adk_session_id,
        "queryErrorDetails": combined_errors if combined_errors else None
    }


def _query_deployed_agent_logic(req: https_fn.CallableRequest):
    resource_name = req.data.get("resourceName")
    message_text = req.data.get("message")
    adk_user_id = req.data.get("adkUserId")
    session_id_from_client = req.data.get("sessionId")
    firestore_agent_id = req.data.get("agentDocId")
    firebase_auth_uid = req.auth.uid if req.auth else "unknown_auth_uid"

    if not all([resource_name, message_text, adk_user_id, firestore_agent_id]):
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="resourceName, message, adkUserId, and agentDocId are required.")

    logger.info(f"Query Agent Wrapper: Agent '{resource_name}' (FS ID: {firestore_agent_id}) by adk_user '{adk_user_id}', firebase_auth_uid '{firebase_auth_uid}'.")
    initialize_vertex_ai()
    project_id, location, _ = get_gcp_project_config()
    result_data = {}

    try:
        # asyncio.run() is suitable here as _query_deployed_agent_logic is a synchronous Cloud Function handler
        result_data = asyncio.run(
            _query_async_logic_internal(resource_name, message_text, adk_user_id, session_id_from_client, project_id, location, firestore_agent_id)
        )
    except asyncio.TimeoutError:
        logger.error(f"Query for agent '{resource_name}' timed out during asyncio.run.")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.DEADLINE_EXCEEDED, message="Agent query timed out.")
    except Exception as e:
        logger.error(f"Error during asyncio.run for query: {e}\n{traceback.format_exc()}")
        # Log the full traceback for better debugging in Cloud Functions logs
        detailed_traceback = traceback.format_exc()
        logger.error(f"Full traceback for asyncio.run error: \n{detailed_traceback}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Async execution error: {str(e)}. See function logs for details.")

    if not result_data:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message="Async query logic did not return data.")

    run_data_to_store = {
        "firebaseUserId": firebase_auth_uid, "adkUserId": adk_user_id,
        "adkSessionId": result_data.get("adkSessionId"), "vertexAiResourceName": resource_name,
        "inputMessage": message_text,
        "outputEventsRaw": json.dumps(result_data.get("events", [])),
        "finalResponseText": result_data.get("responseText", ""),
        "queryErrorDetails": result_data.get("queryErrorDetails"),
        "timestamp": firestore.SERVER_TIMESTAMP
    }
    try:
        db.collection("agents").document(firestore_agent_id).collection("runs").add(run_data_to_store)
        logger.info(f"Query Agent Wrapper: Run saved for agent '{firestore_agent_id}'.")
    except Exception as e_firestore_run:
        logger.error(f"Failed to save run data to Firestore for agent '{firestore_agent_id}': {e_firestore_run}")

    return {"success": True, **result_data}  