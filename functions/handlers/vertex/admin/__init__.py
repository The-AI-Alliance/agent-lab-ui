# functions/handlers/vertex/admin/__init__.py
import traceback
import re
import time
import asyncio
from firebase_admin import firestore
from firebase_functions import https_fn
from google.cloud.aiplatform_v1beta1 import ReasoningEngineServiceClient
from google.cloud.aiplatform_v1beta1.types import ReasoningEngine as ReasoningEngineProto
from vertexai import agent_engines as deployed_agent_engines
import os

from common.core import db, logger
from common.config import get_gcp_project_config
from common.utils import initialize_vertex_ai
from common.adk_helpers import (
    generate_vertex_deployment_display_name,
    instantiate_adk_agent_from_config,
    BACKEND_LITELLM_PROVIDER_CONFIG
)

# --- Deployment Logic ---

def _deploy_agent_to_vertex_logic(req: https_fn.CallableRequest):
    agent_config_data = req.data.get("agentConfig")
    agent_doc_id = req.data.get("agentDocId")

    if not agent_config_data or not agent_doc_id:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Agent config (agentConfig) and Firestore document ID (agentDocId) are required.")

    original_config_name = agent_config_data.get('name', 'N/A')
    logger.info(f"Initiating deployment for agent '{agent_doc_id}'. Config name: '{original_config_name}'")

    try:
        db.collection("agents").document(agent_doc_id).update({
            "deploymentStatus": "deploying_initiated", "lastDeploymentAttemptAt": firestore.SERVER_TIMESTAMP,
            "vertexAiResourceName": firestore.DELETE_FIELD, "deploymentError": firestore.DELETE_FIELD,
            "lastDeployedAt": firestore.DELETE_FIELD
        })
        logger.info(f"Agent '{agent_doc_id}' status in Firestore set to 'deploying_initiated'.")
    except Exception as e:
        logger.error(f"CRITICAL: Failed to update agent '{agent_doc_id}' status to 'deploying_initiated': {e}. Aborting.")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.ABORTED, message=f"Failed to set initial deployment status for agent {agent_doc_id}.")

    initialize_vertex_ai()

    try:
        adk_agent = asyncio.run(instantiate_adk_agent_from_config(
            agent_config_data,
            parent_adk_name_for_context=f"root_{agent_doc_id[:4]}"
        ))
        logger.info(f"Root ADK Agent object '{adk_agent.name}' of type {type(adk_agent).__name__} prepared for deployment.")
    except ValueError as e_instantiate:
        error_msg = f"Failed to instantiate agent hierarchy for '{agent_doc_id}' (Original Name: '{original_config_name}'): {str(e_instantiate)}"
        logger.error(error_msg)
        db.collection("agents").document(agent_doc_id).update({"deploymentStatus": "error", "deploymentError": error_msg, "lastDeployedAt": firestore.SERVER_TIMESTAMP})
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message=error_msg)
    except Exception as e_unhandled_instantiate:
        error_msg = f"Unexpected error during agent hierarchy instantiation for '{agent_doc_id}' (Original Name: '{original_config_name}'): {str(e_unhandled_instantiate)}"
        logger.error(f"{error_msg}\n{traceback.format_exc()}")
        db.collection("agents").document(agent_doc_id).update({"deploymentStatus": "error", "deploymentError": error_msg, "lastDeployedAt": firestore.SERVER_TIMESTAMP})
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=error_msg)

    requirements_list = [
        "google-cloud-aiplatform[adk,agent_engines]>=1.93.1",
        "gofannon",
        "litellm>=1.72.0"
    ]
    custom_repo_urls = agent_config_data.get("usedCustomRepoUrls", [])
    if isinstance(custom_repo_urls, list):
        for repo_url_original in custom_repo_urls:
            if isinstance(repo_url_original, str) and repo_url_original.strip():
                final_install_string = f"git+{repo_url_original.strip()}"
                if final_install_string not in requirements_list:
                    requirements_list.append(final_install_string)
                    logger.info(f"Added custom tool repository to requirements: {final_install_string}")

    deployment_display_name = generate_vertex_deployment_display_name(original_config_name, agent_doc_id)

    vertex_env_vars = {}
    for provider_id, config_details in BACKEND_LITELLM_PROVIDER_CONFIG.items():
        env_key_name = config_details.get("apiKeyEnv")
        if env_key_name and os.getenv(env_key_name):
            vertex_env_vars[env_key_name] = os.getenv(env_key_name)

        if provider_id == "azure":
            for azure_env_key in ["AZURE_API_BASE", "AZURE_API_VERSION"]:
                if os.getenv(azure_env_key):
                    vertex_env_vars[azure_env_key] = os.getenv(azure_env_key)

        if provider_id == "bedrock":
            for bedrock_key in ["AWS_SECRET_ACCESS_KEY", "AWS_REGION", "AWS_SESSION_TOKEN"]:
                if os.getenv(bedrock_key):
                    vertex_env_vars[bedrock_key] = os.getenv(bedrock_key)

        if provider_id == "watsonx":
            for watsonx_env_key in ["WATSONX_URL", "WATSONX_PROJECT_ID", "WATSONX_DEPLOYMENT_SPACE_ID", "WATSONX_ZENAPIKEY"]:
                if os.getenv(watsonx_env_key):
                    vertex_env_vars[watsonx_env_key] = os.getenv(watsonx_env_key)

    logger.info(f"Attempting to deploy ADK agent '{adk_agent.name}' to Vertex AI with display_name: '{deployment_display_name}'. Requirements: {requirements_list}. Environment Variables for Vertex: {list(vertex_env_vars.keys())}")

    try:
        remote_app = deployed_agent_engines.create(
            agent_engine=adk_agent,
            requirements=requirements_list,
            display_name=deployment_display_name,
            description=agent_config_data.get("description", f"ADK Agent: {deployment_display_name}"),
            env_vars=vertex_env_vars if vertex_env_vars else None
        )
        logger.info(f"Vertex AI agent deployment successful for '{agent_doc_id}'. Resource: {remote_app.resource_name}")
        db.collection("agents").document(agent_doc_id).update({
            "vertexAiResourceName": remote_app.resource_name, "deploymentStatus": "deployed",
            "lastDeployedAt": firestore.SERVER_TIMESTAMP, "deploymentError": firestore.DELETE_FIELD
        })
        return {"success": True, "resourceName": remote_app.resource_name, "message": f"Agent '{deployment_display_name}' deployment initiated."}
    except Exception as e_deploy:
        tb_str = traceback.format_exc()
        error_message_for_log = f"Error during Vertex AI agent deployment for '{agent_doc_id}': {str(e_deploy)}"
        logger.error(f"{error_message_for_log}\nFull Traceback:\n{tb_str}")
        firestore_error_message = f"Deployment Error: {type(e_deploy).__name__} - {str(e_deploy)[:500]}"
        db.collection("agents").document(agent_doc_id).update({
            "deploymentStatus": "error", "deploymentError": firestore_error_message,
            "lastDeployedAt": firestore.SERVER_TIMESTAMP
        })
        if isinstance(e_deploy, https_fn.HttpsError): raise
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Deployment to Vertex AI failed: {str(e_deploy)[:300]}.")

    # --- Management Logic ---

def _delete_vertex_agent_logic(req: https_fn.CallableRequest):
    resource_name = req.data.get("resourceName")
    agent_doc_id = req.data.get("agentDocId")

    if not resource_name or not agent_doc_id:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Vertex AI resourceName and agentDocId are required.")

    logger.info(f"Attempting to delete Vertex AI agent '{resource_name}' (FS doc: '{agent_doc_id}').")
    initialize_vertex_ai()

    try:
        try:
            agent_to_delete = deployed_agent_engines.get(resource_name)
            agent_to_delete.delete(force=True)
            logger.info(f"Vertex AI Agent '{resource_name}' deletion process successfully initiated.")
        except Exception as e_get_delete:
            if "NotFound" in str(e_get_delete) or "could not be found" in str(e_get_delete).lower():
                logger.warn(f"Agent '{resource_name}' was not found on Vertex AI during deletion attempt. Assuming already deleted.")
            else:
                raise e_get_delete

        db.collection("agents").document(agent_doc_id).update({
            "vertexAiResourceName": firestore.DELETE_FIELD, "deploymentStatus": "deleted",
            "lastDeployedAt": firestore.DELETE_FIELD, "deploymentError": firestore.DELETE_FIELD,
            "lastStatusCheckAt": firestore.SERVER_TIMESTAMP
        })
        return {"success": True, "message": f"Agent '{resource_name}' deletion process completed."}
    except Exception as e:
        logger.error(f"Error during delete_vertex_agent_logic for '{resource_name}': {e}\n{traceback.format_exc()}")
        db.collection("agents").document(agent_doc_id).update({
            "deploymentStatus": "error_deleting", "deploymentError": f"Failed to delete from Vertex: {str(e)[:250]}",
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

        expected_config_name = agent_data.get("name")
        expected_vertex_display_name = generate_vertex_deployment_display_name(expected_config_name, agent_doc_id)
        current_stored_resource_name = agent_data.get("vertexAiResourceName")

        found_engine_proto = None
        if current_stored_resource_name:
            try:
                engine = reasoning_engine_client.get_reasoning_engine(name=current_stored_resource_name)
                if engine.display_name == expected_vertex_display_name:
                    found_engine_proto = engine
                else:
                    logger.warn(f"Stored resource '{current_stored_resource_name}' has mismatched display_name on Vertex ('{engine.display_name}' vs expected '{expected_vertex_display_name}').")
            except Exception as e:
                logger.info(f"Failed to get engine by stored resource_name '{current_stored_resource_name}': {e}.")
                if "NotFound" in str(e):
                    agent_doc_ref.update({"vertexAiResourceName": firestore.DELETE_FIELD, "deploymentStatus": "error_resource_vanished"})
                    current_stored_resource_name = None

        if not found_engine_proto:
            list_request = ReasoningEngineServiceClient.list_reasoning_engines_request_type(parent=parent_path, filter=f'display_name="{expected_vertex_display_name}"')
            engine_list_results = list(reasoning_engine_client.list_reasoning_engines(request=list_request))

            if engine_list_results:
                found_engine_proto = engine_list_results[0]
                if current_stored_resource_name != found_engine_proto.name:
                    agent_doc_ref.update({"vertexAiResourceName": found_engine_proto.name})

        firestore_update_payload = {"lastStatusCheckAt": firestore.SERVER_TIMESTAMP}
        final_status_to_report, vertex_resource_name, vertex_state = "not_found_on_vertex", None, None

        if found_engine_proto:
            current_engine_vertex_state = found_engine_proto.__getstate__()
            vertex_resource_name = found_engine_proto.name
            vertex_state = current_engine_vertex_state.name
            firestore_update_payload["vertexAiResourceName"] = found_engine_proto.name

            if current_engine_vertex_state == ReasoningEngineProto.State.ACTIVE:
                final_status_to_report = "deployed"
                firestore_update_payload["deploymentError"] = firestore.DELETE_FIELD
                firestore_update_payload["lastDeployedAt"] = firestore.Timestamp.from_pb(found_engine_proto.update_time) if hasattr(found_engine_proto, 'update_time') and found_engine_proto.update_time else firestore.SERVER_TIMESTAMP
            elif current_engine_vertex_state in [ReasoningEngineProto.State.CREATING, ReasoningEngineProto.State.UPDATING]:
                final_status_to_report = "deploying_in_progress"
            elif current_engine_vertex_state == ReasoningEngineProto.State.FAILED:
                final_status_to_report = "error"
                op_error = getattr(found_engine_proto, 'latest_failed_operation_error', None)
                error_details = f"Vertex AI Operation Error: {op_error.message}" if op_error else "Vertex AI reports engine state: FAILED."
                firestore_update_payload["deploymentError"] = error_details[:1000]
            else:
                final_status_to_report = f"unknown_vertex_state_{current_engine_vertex_state.name.lower()}"
            firestore_update_payload["deploymentStatus"] = final_status_to_report
        else:
            current_fs_status = agent_data.get("deploymentStatus")
            if current_fs_status == "deployed":
                final_status_to_report = "error_resource_vanished"
            firestore_update_payload["deploymentStatus"] = final_status_to_report
            firestore_update_payload["vertexAiResourceName"] = firestore.DELETE_FIELD

        agent_doc_ref.update(firestore_update_payload)
        return {"success": True, "status": final_status_to_report, "resourceName": vertex_resource_name, "vertexState": vertex_state}

    except Exception as e:
        logger.error(f"Error in status check for agent '{agent_doc_id}': {e}\n{traceback.format_exc()}")
        if isinstance(e, https_fn.HttpsError): raise
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Failed to check agent status: {str(e)[:200]}")