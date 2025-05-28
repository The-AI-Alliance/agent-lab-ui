# functions/handlers/management_logic.py
import traceback
from firebase_admin import firestore
from firebase_functions import https_fn
from google.cloud.aiplatform_v1beta1 import ReasoningEngineServiceClient
from google.cloud.aiplatform_v1beta1.types import ReasoningEngine as ReasoningEngineProto
from vertexai import agent_engines as deployed_agent_engines

from common.core import db, logger
from common.config import get_gcp_project_config
from common.utils import initialize_vertex_ai
from common.adk_helpers import generate_vertex_deployment_display_name


def _delete_vertex_agent_logic(req: https_fn.CallableRequest):
    resource_name = req.data.get("resourceName")
    agent_doc_id = req.data.get("agentDocId")

    if not resource_name or not agent_doc_id:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Vertex AI resourceName and agentDocId are required.")

    logger.info(f"Attempting to delete Vertex AI agent '{resource_name}' (FS doc: '{agent_doc_id}').")
    initialize_vertex_ai() # Ensures Vertex AI SDK is initialized

    try:
        # Check if the agent exists on Vertex AI before attempting to delete
        try:
            agent_to_delete = deployed_agent_engines.get(resource_name)
            agent_to_delete.delete(force=True) # force=True can help if there are active sessions
            logger.info(f"Vertex AI Agent '{resource_name}' deletion process successfully initiated.")
        except Exception as e_get_delete:
            if "NotFound" in str(e_get_delete) or "could not be found" in str(e_get_delete).lower():
                logger.warn(f"Agent '{resource_name}' was not found on Vertex AI during deletion attempt. Assuming already deleted or never existed there.")
                # Proceed to update Firestore as if deleted from Vertex
            else:
                raise e_get_delete # Re-raise other errors during get/delete

        # Update Firestore regardless of whether it was found on Vertex (to clean up local record)
        db.collection("agents").document(agent_doc_id).update({
            "vertexAiResourceName": firestore.DELETE_FIELD,
            "deploymentStatus": "deleted", # Or "not_found_on_vertex" if that's more accurate based on above
            "lastDeployedAt": firestore.DELETE_FIELD,
            "deploymentError": firestore.DELETE_FIELD,
            "lastStatusCheckAt": firestore.SERVER_TIMESTAMP
        })
        return {"success": True, "message": f"Agent '{resource_name}' deletion process completed (or agent was not found on Vertex)."}
    except Exception as e:
        logger.error(f"Error during delete_vertex_agent_logic for '{resource_name}': {e}\n{traceback.format_exc()}")
        # Update Firestore to reflect an error if deletion failed unexpectedly (not due to NotFound)
        db.collection("agents").document(agent_doc_id).update({
            "deploymentStatus": "error_deleting",
            "deploymentError": f"Failed to delete from Vertex: {str(e)[:250]}",
            "lastStatusCheckAt": firestore.SERVER_TIMESTAMP
        })
        if not isinstance(e, https_fn.HttpsError):
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Failed to delete agent '{resource_name}': {str(e)[:200]}")
        raise


def _check_vertex_agent_deployment_status_logic(req: https_fn.CallableRequest):
    agent_doc_id = req.data.get("agentDocId")
    if not agent_doc_id:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="agentDocId is required.")

    logger.info(f"Checking deployment status for agent Firestore doc ID: {agent_doc_id}")
    initialize_vertex_ai()

    project_id, location, _ = get_gcp_project_config()
    client_options = {"api_endpoint": f"{location}-aiplatform.googleapis.com"}
    reasoning_engine_client = ReasoningEngineServiceClient(client_options=client_options)
    parent_path = f"projects/{project_id}/locations/{location}"

    try:
        agent_doc_ref = db.collection("agents").document(agent_doc_id)
        agent_snap = agent_doc_ref.get()
        if not agent_snap.exists:
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.NOT_FOUND, message=f"Agent document {agent_doc_id} not found.")
        agent_data = agent_snap.to_dict()

        expected_config_name = agent_data.get("name") # Used for display name generation
        expected_vertex_display_name = generate_vertex_deployment_display_name(expected_config_name, agent_doc_id)
        current_stored_resource_name = agent_data.get("vertexAiResourceName")
        logger.info(f"Agent '{agent_doc_id}': Expected Vertex display name: '{expected_vertex_display_name}'. Stored resource: '{current_stored_resource_name or 'None'}'.")

        found_engine_proto = None
        identification_method = ""

        if current_stored_resource_name:
            try:
                engine = reasoning_engine_client.get_reasoning_engine(name=current_stored_resource_name)
                # Verify display name match if relying on stored resource name
                if engine.display_name == expected_vertex_display_name:
                    found_engine_proto = engine
                    identification_method = "by stored resource_name"
                else:
                    logger.warning(f"Stored resource '{current_stored_resource_name}' for agent '{agent_doc_id}' has mismatched display_name on Vertex ('{engine.display_name}' vs expected '{expected_vertex_display_name}'). Will attempt to list.")
            except Exception as e: # Use a more generic Exception to catch gRPC errors too
                logger.info(f"Failed to get engine by stored resource_name '{current_stored_resource_name}' for agent '{agent_doc_id}'. Error: {type(e).__name__} - {e}. Will attempt listing by display_name.")
                # If stored resource name is not found, it might have been deleted. Clear it.
                if "NotFound" in str(e) or (hasattr(e, 'code') and e.code().name == 'NOT_FOUND'):
                    agent_doc_ref.update({"vertexAiResourceName": firestore.DELETE_FIELD, "deploymentStatus": "error_resource_vanished", "deploymentError": "Stored Vertex AI resource was not found."})
                    current_stored_resource_name = None # Force listing

        if not found_engine_proto: # If not found by stored name or stored name was invalid/cleared
            logger.info(f"Attempting to find engine for agent '{agent_doc_id}' by listing with display_name filter: 'display_name=\"{expected_vertex_display_name}\"'.")
            list_request = ReasoningEngineServiceClient.list_reasoning_engines_request_type(parent=parent_path, filter=f'display_name="{expected_vertex_display_name}"')
            engine_list_results = list(reasoning_engine_client.list_reasoning_engines(request=list_request))

            if engine_list_results:
                if len(engine_list_results) > 1: logger.warning(f"Multiple ({len(engine_list_results)}) engines found for display_name '{expected_vertex_display_name}'. Using the first one: {[e.name for e in engine_list_results]}.")
                found_engine_proto = engine_list_results[0]
                identification_method = "by listing via display_name"
                logger.info(f"Found engine '{found_engine_proto.name}' via display_name listing.")
                if current_stored_resource_name != found_engine_proto.name: # Update if found by listing and different
                    agent_doc_ref.update({"vertexAiResourceName": found_engine_proto.name})
                    logger.info(f"Updated Firestore resource_name for '{agent_doc_id}' to '{found_engine_proto.name}'.")
            else:
                logger.info(f"No engine found for agent '{agent_doc_id}' with display_name '{expected_vertex_display_name}' via listing.")

        firestore_update_payload = {"lastStatusCheckAt": firestore.SERVER_TIMESTAMP}
        final_status_to_report, vertex_resource_name_for_client, vertex_state_for_client = "not_found_on_vertex", None, None

        if found_engine_proto:
            logger.info(f"Engine '{found_engine_proto.name}' (State on Vertex: {found_engine_proto.state.name}) identified for agent '{agent_doc_id}' via {identification_method}.")
            current_engine_vertex_state = found_engine_proto.state
            vertex_resource_name_for_client = found_engine_proto.name
            vertex_state_for_client = current_engine_vertex_state.name
            firestore_update_payload["vertexAiResourceName"] = found_engine_proto.name # Ensure it's set/updated

            if current_engine_vertex_state == ReasoningEngineProto.State.ACTIVE:
                final_status_to_report = "deployed"
                firestore_update_payload["deploymentError"] = firestore.DELETE_FIELD
                engine_update_time_fs = firestore.Timestamp.from_pb(found_engine_proto.update_time) if hasattr(found_engine_proto, 'update_time') and found_engine_proto.update_time else firestore.SERVER_TIMESTAMP
                firestore_update_payload["lastDeployedAt"] = engine_update_time_fs
            elif current_engine_vertex_state == ReasoningEngineProto.State.CREATING or \
                    current_engine_vertex_state == ReasoningEngineProto.State.UPDATING:
                final_status_to_report = "deploying_in_progress"
            elif current_engine_vertex_state == ReasoningEngineProto.State.FAILED:
                final_status_to_report = "error"
                error_details = "Vertex AI reports engine state: FAILED."
                # Attempt to get more specific error details
                op_error = getattr(found_engine_proto, 'latest_failed_operation_error', None)
                if op_error and op_error.message:
                    error_details = f"Vertex AI Operation Error: {op_error.message}"
                elif hasattr(found_engine_proto, 'error') and found_engine_proto.error and found_engine_proto.error.message: # For older proto versions
                    error_details = f"Vertex AI Error Status: {found_engine_proto.error.message}"
                firestore_update_payload["deploymentError"] = error_details[:1000] # Limit length
            else: # Other states like DELETING, etc.
                final_status_to_report = f"unknown_vertex_state_{current_engine_vertex_state.name.lower()}"
                logger.warning(f"Engine '{found_engine_proto.name}' is in an unhandled state: {current_engine_vertex_state.name}")

            firestore_update_payload["deploymentStatus"] = final_status_to_report
        else: # Engine not found on Vertex
            logger.warning(f"Engine for agent '{agent_doc_id}' (expected display_name: '{expected_vertex_display_name}') was NOT found on Vertex AI by any method.")
            current_fs_status = agent_data.get("deploymentStatus")
            if current_fs_status in ["deploying_initiated", "deploying_in_progress"]:
                final_status_to_report = "error_not_found_after_init"
                firestore_update_payload["deploymentError"] = ("Engine not found on Vertex AI after deployment was initiated. "
                                                               "It may have failed very early, had a display name mismatch, or was deleted externally.")
            elif current_fs_status == "deployed": # It was deployed but now it's gone
                final_status_to_report = "error_resource_vanished"
                firestore_update_payload["deploymentError"] = "Previously deployed engine is no longer found on Vertex AI."
                # else, it remains "not_found_on_vertex" or its previous error state.
            firestore_update_payload["deploymentStatus"] = final_status_to_report
            firestore_update_payload["vertexAiResourceName"] = firestore.DELETE_FIELD # Ensure it's cleared

        agent_doc_ref.update(firestore_update_payload)
        logger.info(f"Agent '{agent_doc_id}' Firestore status updated to: '{final_status_to_report}' (based on Vertex check).")

        response_payload = {
            "success": True,
            "status": final_status_to_report,
            "resourceName": vertex_resource_name_for_client, # Can be None if not found
            "vertexState": vertex_state_for_client # Can be None if not found
        }
        if not vertex_resource_name_for_client:
            response_payload["message"] = f"Engine with display name '{expected_vertex_display_name}' not found on Vertex AI."

        return response_payload

    except Exception as e:
        tb_str = traceback.format_exc()
        logger.error(f"Error in _check_vertex_agent_deployment_status_logic for agent '{agent_doc_id}': {str(e)}\n{tb_str}")
        if isinstance(e, https_fn.HttpsError): raise
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=f"Failed to check agent deployment status: {str(e)[:200]}"
        )
  