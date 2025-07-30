# functions/handlers/vertex/deployment_logic.py
import traceback
import re
import time
import asyncio # Import asyncio
from firebase_admin import firestore
from firebase_functions import https_fn
from vertexai import agent_engines as deployed_agent_engines
import os

from common.core import db, logger
from common.utils import initialize_vertex_ai
from common.adk_helpers import (
    generate_vertex_deployment_display_name,
    instantiate_adk_agent_from_config, # This is now async
    BACKEND_LITELLM_PROVIDER_CONFIG
)

def _deploy_agent_to_vertex_logic(req: https_fn.CallableRequest): # Remains synchronous
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
        # Run the async agent instantiation within the synchronous function
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
    except Exception as e_unhandled_instantiate: # Catch any other errors from asyncio.run or instantiation
        error_msg = f"Unexpected error during agent hierarchy instantiation for '{agent_doc_id}' (Original Name: '{original_config_name}'): {str(e_unhandled_instantiate)}"
        logger.error(f"{error_msg}\n{traceback.format_exc()}")
        db.collection("agents").document(agent_doc_id).update({"deploymentStatus": "error", "deploymentError": error_msg, "lastDeployedAt": firestore.SERVER_TIMESTAMP})
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=error_msg)

    if adk_agent is None:
        error_msg = f"ADK Agent object could not be constructed for agent '{agent_doc_id}'." # Should be caught above
        logger.error(error_msg)
        db.collection("agents").document(agent_doc_id).update({"deploymentStatus": "error", "deploymentError": error_msg})
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=error_msg)

    requirements_list = [
        "google-cloud-aiplatform[adk,agent_engines]>=1.93.1", # Ensure version compatibility
        "gofannon", # For Gofannon tools
        "litellm>=1.72.0" # For LiteLlm model integration
    ]
    custom_repo_urls = agent_config_data.get("usedCustomRepoUrls", [])
    if isinstance(custom_repo_urls, list):
        for repo_url_original in custom_repo_urls:
            if isinstance(repo_url_original, str) and repo_url_original.strip():
                repo_url_raw = repo_url_original.strip()

                # Basic scheme validation
                if not (repo_url_raw.startswith("https://") or repo_url_raw.startswith("http://") or \
                        repo_url_raw.startswith("git@") or repo_url_raw.startswith("git+")):
                    logger.warning(f"Skipping custom repository URL with unrecognized scheme: {repo_url_raw}")
                    continue

                    # Normalize to git+https or git+ssh form for pip
                base_url_for_pip = repo_url_raw
                fragment_str = "" # For #egg=... or #subdirectory=...
                if "#" in repo_url_raw: # Separate URL from fragment
                    base_url_for_pip, fragment_str = repo_url_raw.split("#", 1)

                if base_url_for_pip.startswith("git@"): # Convert git@github.com:user/repo.git
                    # git@host:owner/repo.git -> git+ssh://git@host/owner/repo.git
                    path_with_potential_ref = base_url_for_pip.split(":", 1)[1]
                    host_part = base_url_for_pip.split(":")[0] # e.g., git@github.com
                    base_url_for_pip = f"git+ssh://{host_part}/{path_with_potential_ref}"
                elif not base_url_for_pip.startswith("git+"): # Add git+ if not present (for https)
                    base_url_for_pip = "git+" + base_url_for_pip

                # Extract user-specified ref (branch/tag/commit) from URL if present (e.g., ...repo.git@my-branch)
                user_specified_ref = None
                match_repo_and_ref = re.match(r"^(.*\/[^@/]+(?:\.git)?)(?:@([^#]+))?$", base_url_for_pip)
                repo_path_for_install = base_url_for_pip # Default if no @ref

                if match_repo_and_ref:
                    repo_path_for_install = match_repo_and_ref.group(1) # The repo path part
                    if match_repo_and_ref.group(2): # If ref (group 2) was found
                        user_specified_ref = match_repo_and_ref.group(2)
                        repo_path_for_install += f"@{user_specified_ref}" # Append ref back

                # Check if the ref is a commit hash (to avoid cache-busting timestamp)
                is_commit_hash_ref = bool(user_specified_ref and re.fullmatch(r"[0-9a-fA-F]{7,40}", user_specified_ref))

                parsed_egg_name = None
                if fragment_str and "egg=" in fragment_str:
                    egg_match_in_fragment = re.search(r"egg=([^&\[\]]+)", fragment_str) # Avoid extras like egg=name[extras]
                    if egg_match_in_fragment:
                        parsed_egg_name = egg_match_in_fragment.group(1)

                if not parsed_egg_name: # If not in fragment, guess from URL
                    # Guess from .../reponame.git or .../reponame
                    url_for_egg_guess = repo_url_raw.split("://",1)[-1].split('@')[0].split('#')[0] # Get host/path part
                    egg_name_match_guess = re.search(r'/([^/]+?)(?:\.git)?$', url_for_egg_guess)
                    parsed_egg_name = egg_name_match_guess.group(1) if egg_name_match_guess else f"customrepo{int(time.time())}"

                    # Sanitize egg name (pip allows ., -, _ but better to be safe)
                sanitized_egg_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', parsed_egg_name)

                current_egg_name_for_fragment = sanitized_egg_name
                # Add timestamp to egg name for cache busting IF NOT a commit hash ref
                # This helps ensure pip re-fetches if the branch/tag has updated.
                if not is_commit_hash_ref:
                    timestamp_val = int(time.time())
                    # Pip egg names can't have brackets in the core name if it's for extras.
                    # Appending a version-like string or unique suffix is safer.
                    current_egg_name_for_fragment += f"-{timestamp_val}" # Using a dash like a version part

                # Reconstruct fragment string with our (potentially modified) egg name
                new_fragment_parts = [f"egg={current_egg_name_for_fragment}"]
                if fragment_str: # Add other original fragment parts (like subdirectory)
                    for part in fragment_str.split('&'):
                        if not part.startswith("egg="): # Don't add original egg if we replaced it
                            new_fragment_parts.append(part)

                final_install_string = f"{repo_path_for_install}#{'&'.join(new_fragment_parts)}"


                if final_install_string not in requirements_list:
                    requirements_list.append(final_install_string)
                    logger.info(f"Added custom tool repository to requirements: {final_install_string}")


    deployment_display_name = generate_vertex_deployment_display_name(original_config_name, agent_doc_id)

    vertex_env_vars = {}
    # Pass API keys and necessary config from function environment to Vertex deployment environment
    for provider_id, config_details in BACKEND_LITELLM_PROVIDER_CONFIG.items():
        env_key_name = config_details.get("apiKeyEnv")
        if env_key_name and os.getenv(env_key_name):
            vertex_env_vars[env_key_name] = os.getenv(env_key_name)
            logger.info(f"Adding env var '{env_key_name}' for Vertex AI deployment from function's environment (Provider: {provider_id}).")

            # Specific multi-variable providers
        if provider_id == "azure":
            for azure_env_key in ["AZURE_API_BASE", "AZURE_API_VERSION"]: # Add others if needed like AD_CLIENT_ID etc.
                if os.getenv(azure_env_key):
                    vertex_env_vars[azure_env_key] = os.getenv(azure_env_key)
                    logger.info(f"Adding Azure env var '{azure_env_key}' for Vertex AI deployment.")

        if provider_id == "bedrock": # Bedrock needs more than just access key for LiteLLM usually
            for bedrock_key in ["AWS_SECRET_ACCESS_KEY", "AWS_REGION", "AWS_SESSION_TOKEN"]: # AWS_ACCESS_KEY_ID already covered
                if os.getenv(bedrock_key):
                    vertex_env_vars[bedrock_key] = os.getenv(bedrock_key)
                    logger.info(f"Adding Bedrock env var '{bedrock_key}' for Vertex AI deployment.")

        if provider_id == "watsonx": # WATSONX_APIKEY covered, add others
            for watsonx_env_key in ["WATSONX_URL", "WATSONX_PROJECT_ID", "WATSONX_DEPLOYMENT_SPACE_ID", "WATSONX_ZENAPIKEY"]: # Check if ZENAPIKEY is still used or APIKEY is sufficient
                if os.getenv(watsonx_env_key):
                    vertex_env_vars[watsonx_env_key] = os.getenv(watsonx_env_key)
                    logger.info(f"Adding WatsonX env var '{watsonx_env_key}' for Vertex AI deployment.")


    logger.info(f"Attempting to deploy ADK agent '{adk_agent.name}' to Vertex AI with display_name: '{deployment_display_name}'. Requirements: {requirements_list}. Environment Variables for Vertex: {list(vertex_env_vars.keys())}")

    try:
        remote_app = deployed_agent_engines.create(
            agent_engine=adk_agent,
            requirements=requirements_list,
            display_name=deployment_display_name,
            description=agent_config_data.get("description", f"ADK Agent: {deployment_display_name}"),
            env_vars=vertex_env_vars if vertex_env_vars else None # Pass None if empty
        )
        logger.info(f"Vertex AI agent deployment successful for '{agent_doc_id}'. Resource: {remote_app.resource_name}")
        db.collection("agents").document(agent_doc_id).update({
            "vertexAiResourceName": remote_app.resource_name, "deploymentStatus": "deployed",
            "lastDeployedAt": firestore.SERVER_TIMESTAMP, "deploymentError": firestore.DELETE_FIELD
        })
        return {"success": True, "resourceName": remote_app.resource_name, "message": f"Agent '{deployment_display_name}' deployment initiated."}
    except Exception as e_deploy:
        tb_str = traceback.format_exc()
        error_message_for_log = f"Error during Vertex AI agent deployment for '{agent_doc_id}' (ADK name: '{getattr(adk_agent, 'name', 'N/A')}', Display: '{deployment_display_name}'): {str(e_deploy)}"
        logger.error(f"{error_message_for_log}\nFull Traceback:\n{tb_str}")

        firestore_error_message = f"Deployment Error: {type(e_deploy).__name__} - {str(e_deploy)[:500]}"
        # Check for common Pydantic validation errors from ADK that are useful to surface
        if "validation error" in str(e_deploy).lower() and ("Agent" in str(e_deploy) or "LlmAgent" in str(e_deploy)):
            if "Extra inputs are not permitted" in str(e_deploy): # Common Pydantic error
                firestore_error_message = f"ADK Pydantic validation error (likely during remote_app.create for an Agent/LlmAgent). Detail: {str(e_deploy)[:300]}"
            else:
                firestore_error_message = f"ADK Pydantic validation error for Agent/LlmAgent components. Detail: {str(e_deploy)[:300]}"

        db.collection("agents").document(agent_doc_id).update({
            "deploymentStatus": "error",
            "deploymentError": firestore_error_message,
            "lastDeployedAt": firestore.SERVER_TIMESTAMP # Signify when the error occurred
        })

        if isinstance(e_deploy, https_fn.HttpsError): raise # Re-raise if already an HttpsError
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Deployment to Vertex AI failed: {str(e_deploy)[:300]}. See function logs for details.")

__all__ = ['_deploy_agent_to_vertex_logic']  