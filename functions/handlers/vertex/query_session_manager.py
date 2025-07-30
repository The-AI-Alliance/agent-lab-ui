# functions/handlers/vertex/query_session_manager.py
import traceback
from common.core import logger
from google.adk.sessions import VertexAiSessionService

async def ensure_adk_session(
        session_service: VertexAiSessionService,
        app_name_or_resource_name: str, # This is the Vertex AI resource name
        adk_user_id: str,
        session_id_from_client: str | None
) -> tuple[str | None, list[str]]:
    """
    Ensures an ADK session ID is available. Retrieves an existing session if session_id_from_client
    is provided and valid, otherwise creates a new one.

    Args:
        session_service: Instance of VertexAiSessionService.
        app_name_or_resource_name: The Vertex AI reasoning engine resource name.
        adk_user_id: The ADK user ID.
        session_id_from_client: Optional session ID provided by the client.

    Returns:
        A tuple (current_adk_session_id, diagnostic_errors_list).
        current_adk_session_id will be None if session management fails critically.
    """
    current_adk_session_id = None
    errors = []
    logger.info(f"[SessionManager] Ensuring ADK session for App/Resource: '{app_name_or_resource_name}', User: '{adk_user_id}', ClientSessionID: '{session_id_from_client or 'None'}'.")

    if session_id_from_client:
        try:
            logger.debug(f"[SessionManager] Attempting to retrieve existing session: '{session_id_from_client}'.")
            # VertexAiSessionService.get_session takes app_name (which is the resource_name here)
            retrieved_session = await session_service.get_session(
                app_name=app_name_or_resource_name,
                user_id=adk_user_id,
                session_id=session_id_from_client
            )
            if retrieved_session and retrieved_session.id:
                current_adk_session_id = retrieved_session.id
                logger.info(f"[SessionManager] Successfully retrieved existing ADK session: '{current_adk_session_id}'.")
            else:
                # This case (get_session returning None for an existing ID) might indicate an issue
                # or that the session was deleted. Treat as if not found.
                logger.warn(f"[SessionManager] get_session for ID '{session_id_from_client}' returned None or invalid session object. Will create a new session.")
                session_id_from_client = None # Force creation of new session
        except Exception as e_get_session:
            logger.warn(f"[SessionManager] Failed to retrieve session '{session_id_from_client}'. Error: {type(e_get_session).__name__} - {str(e_get_session)}. Will attempt to create a new one.")
            # Log the full traceback for debugging if needed, but don't let it stop creation of a new session.
            # logger.debug(f"[SessionManager] Traceback for get_session error:\n{traceback.format_exc()}")
            session_id_from_client = None # Force creation of new session

    if not current_adk_session_id: # If no client ID provided, or retrieval failed
        try:
            logger.info(f"[SessionManager] No valid existing session ID. Attempting to create a new session for User: '{adk_user_id}'.")
            # VertexAiSessionService.create_session takes app_name (resource_name)
            new_session = await session_service.create_session(
                app_name=app_name_or_resource_name,
                user_id=adk_user_id
                # session_id can be omitted for auto-generation by the service
            )
            if new_session and new_session.id:
                current_adk_session_id = new_session.id
                logger.info(f"[SessionManager] Successfully created new ADK session: '{current_adk_session_id}'.")
            else:
                err_msg = "[SessionManager] Critical: create_session returned None or invalid session object."
                logger.error(err_msg)
                errors.append("Session creation failed: Service returned invalid session.")
        except Exception as e_create_session:
            err_msg = f"[SessionManager] Critical: Failed to create new ADK session. Error: {type(e_create_session).__name__} - {str(e_create_session)}"
            logger.error(f"{err_msg}\n{traceback.format_exc()}")
            errors.append(f"Session creation failed: {str(e_create_session)[:200]}. See function logs.")

    if not current_adk_session_id and not errors: # Should not happen if logic is correct
        errors.append("Critical: No ADK session ID available after get/create attempts.")
        logger.error("[SessionManager] Critical: current_adk_session_id is None, and no errors were appended. This indicates a logic flaw.")

    return current_adk_session_id, errors

__all__ = ['ensure_adk_session']  