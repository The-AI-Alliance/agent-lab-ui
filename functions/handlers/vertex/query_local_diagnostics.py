# functions/handlers/vertex/query_local_diagnostics.py
import os
import traceback
from common.core import db, logger
from common.adk_helpers import instantiate_adk_agent_from_config # Now async
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.artifacts import InMemoryArtifactService
from google.adk.memory import InMemoryMemoryService
from google.genai.types import Content, Part

async def try_local_diagnostic_run(
        firestore_agent_id: str,
        adk_user_id: str,
        message_text: str,
        project_id_for_diag: str | None,
        location_for_diag: str | None
) -> list[str]:
    """
    Attempts to run the agent configuration locally for diagnostic purposes.
    Returns: A list of diagnostic error messages. Empty if local run was successful or skipped.
    """
    logger.warn(f"[LocalDiag] Initiating local diagnostic run for Firestore Agent ID: '{firestore_agent_id}'.")
    diagnostic_errors = []
    agent_config_data = None
    original_env = {}

    try:
        # Manage environment variables carefully for the diagnostic scope
        vars_to_manage = ["GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION"]

        for var_name in vars_to_manage:
            original_env[var_name] = os.environ.get(var_name)

        if project_id_for_diag and os.environ.get("GOOGLE_CLOUD_PROJECT") != project_id_for_diag:
            os.environ["GOOGLE_CLOUD_PROJECT"] = project_id_for_diag
            logger.info(f"[LocalDiag] Temporarily set GOOGLE_CLOUD_PROJECT to '{project_id_for_diag}' for local diagnostic.")
        if location_for_diag and os.environ.get("GOOGLE_CLOUD_LOCATION") != location_for_diag:
            os.environ["GOOGLE_CLOUD_LOCATION"] = location_for_diag
            logger.info(f"[LocalDiag] Temporarily set GOOGLE_CLOUD_LOCATION to '{location_for_diag}' for local diagnostic.")

        agent_doc_ref = db.collection("agents").document(firestore_agent_id)
        agent_snap = agent_doc_ref.get()

        if not agent_snap.exists:
            diagnostic_errors.append(f"[LocalDiag] Agent config document '{firestore_agent_id}' not found in Firestore.")
            logger.error(diagnostic_errors[-1])
            return diagnostic_errors # Early exit

        agent_config_data = agent_snap.to_dict()
        if not agent_config_data:
            diagnostic_errors.append(f"[LocalDiag] Agent config data for '{firestore_agent_id}' is empty or invalid.")
            logger.error(diagnostic_errors[-1])
            return diagnostic_errors # Early exit

        config_name_for_log = agent_config_data.get('name', 'N/A_ConfigName')
        logger.info(f"[LocalDiag] Instantiating agent '{config_name_for_log}' (FS ID: {firestore_agent_id}) for local diagnostic run.")
        logger.debug(f"[LocalDiag] Agent config (first 500 chars): {str(agent_config_data)[:500]}...")

        # instantiate_adk_agent_from_config is now async
        local_adk_agent = await instantiate_adk_agent_from_config(
            agent_config_data,
            parent_adk_name_for_context=f"local_diag_{firestore_agent_id[:4]}"
        )
        logger.info(f"[LocalDiag] Successfully instantiated local ADK agent: {local_adk_agent.name} of type {type(local_adk_agent).__name__}")

        local_session_service = InMemorySessionService()
        local_artifact_service = InMemoryArtifactService()
        local_memory_service = InMemoryMemoryService()

        local_runner = Runner(
            agent=local_adk_agent,
            # Use a sanitized app_name for the runner
            app_name=local_adk_agent.name, # Using the sanitized ADK agent name
            session_service=local_session_service,
            artifact_service=local_artifact_service,
            memory_service=local_memory_service
            # tools_registry can be omitted if tools are part of the agent
        )

        local_session = await local_session_service.create_session(
            app_name=local_runner.app_name,
            user_id=adk_user_id,
        )
        logger.info(f"[LocalDiag] Created local in-memory session: {local_session.id}")

        local_message_content = Content(role="user", parts=[Part(text=message_text)])

        logger.info(f"[LocalDiag] Starting local run for agent '{local_adk_agent.name}', session '{local_session.id}', msg: '{message_text[:70]}...'")
        local_events_count = 0
        local_final_response_text = ""
        # The Runner.run_async yields ADK event objects/dicts
        async for diag_event_obj in local_runner.run_async(user_id=adk_user_id, session_id=local_session.id, new_message=local_message_content):
            local_events_count += 1
            logger.debug(f"[LocalDiag] Event {local_events_count}: {str(diag_event_obj)[:200]}...")

            # Extract text from events (similar to query_vertex_runner)
            if isinstance(diag_event_obj, dict) and diag_event_obj.get('content', {}).get('parts'):
                for part in diag_event_obj['content']['parts']:
                    if 'text' in part and isinstance(part['text'], str):
                        local_final_response_text += part['text']
                        # Could also check for 'text_delta' type events specifically if preferred.

        logger.info(f"[LocalDiag] Local run completed. Events: {local_events_count}. Final text (approx): '{local_final_response_text[:100]}...'")

        if local_events_count == 0 and not local_final_response_text:
            msg = (f"[LocalDiag] Local diagnostic run for '{config_name_for_log}' produced NO events and NO text. "
                   "This might indicate an issue in the agent's core logic (e.g., instruction, model config) "
                   "or tool setup that doesn't throw exceptions but also doesn't yield output. "
                   "Check agent instructions, model choice, and tool interactions/configurations.")
            diagnostic_errors.append(msg)
            logger.warn(msg)
        elif not local_final_response_text: # Has events but no text
            msg = (f"[LocalDiag] Local diagnostic run for '{config_name_for_log}' produced {local_events_count} events "
                   "but NO final text response. Check agent's output handling and if it's correctly forming "
                   "text parts in its events (e.g., from 'text_delta' or final message).")
            diagnostic_errors.append(msg)
            logger.warn(msg)
        else: # Has events and text, meaning it generally worked locally.
            msg = (f"[LocalDiag] Agent '{config_name_for_log}' ran locally without raising an ADK-level exception "
                   f"and produced text: '{local_final_response_text[:100]}...'. "
                   "If a remote query failed, the issue might be specific to: "
                   "1. Vertex AI environment (e.g., permissions, networking). "
                   "2. Deployment packaging (e.g., missing dependencies not caught by local pip). "
                   "3. Service account permissions for tools accessing GCP resources. "
                   "4. Subtle differences in how LiteLLM behaves locally vs. in the Vertex container "
                   "(e.g., environment variable access, default credentials). "
                   "5. Quotas or limits on Vertex AI or underlying LLM APIs.")
            diagnostic_errors.append(msg) # This is an informational "error" for diagnosis
            logger.info(msg)


    except ValueError as e_val_diag: # Catch config or instantiation errors specifically
        err_msg = f"[LocalDiag] Configuration or Instantiation Error for Agent '{firestore_agent_id}': {type(e_val_diag).__name__} - {str(e_val_diag)}"
        logger.error(f"{err_msg}\n{traceback.format_exc()}")
        diagnostic_errors.append(err_msg)
    except Exception as e_local_diag_run:
        config_name_for_error = agent_config_data.get('name', firestore_agent_id) if agent_config_data else firestore_agent_id
        err_msg = f"[LocalDiag] Runtime Exception during local diagnostic for Agent '{config_name_for_error}': {type(e_local_diag_run).__name__} - {str(e_local_diag_run)}"
        logger.error(f"{err_msg}\n{traceback.format_exc()}")
        tb_lines = traceback.format_exc().splitlines()
        relevant_tb = "\n".join(tb_lines[-7:]) # Last 7 lines for more context
        diagnostic_errors.append(f"{err_msg}\nRelevant Traceback Snippet:\n{relevant_tb}")
    finally:
        logger.info("[LocalDiag] Restoring original environment variables after diagnostic run.")
        for var_name, orig_value in original_env.items():
            current_val = os.environ.get(var_name)
            if orig_value is None:
                if current_val is not None: # If it was set during diag
                    del os.environ[var_name]
                    logger.debug(f"[LocalDiag] Cleared env var {var_name}")
            else: # If it had an original value
                if current_val != orig_value:
                    os.environ[var_name] = orig_value
                    logger.debug(f"[LocalDiag] Restored env var {var_name} to original value.")
        logger.info("[LocalDiag] Environment variables restored.")

    return diagnostic_errors

__all__ = ['try_local_diagnostic_run']  