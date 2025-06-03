# functions/handlers/vertex/deployment_logic.py
import traceback
import re # Ensure re is imported
import time # Ensure time is imported
from firebase_admin import firestore
from firebase_functions import https_fn
from vertexai import agent_engines as deployed_agent_engines

from common.core import db, logger
from common.utils import initialize_vertex_ai
from common.adk_helpers import (
    generate_vertex_deployment_display_name,
    instantiate_adk_agent_from_config,
)

def _deploy_agent_to_vertex_logic(req: https_fn.CallableRequest):
    agent_config_data = req.data.get("agentConfig")
    agent_doc_id = req.data.get("agentDocId")
    logger.info(f"--- RAW AGENT CONFIG RECEIVED for deployment (Doc ID: {agent_doc_id}) ---: {agent_config_data}")

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
    adk_agent = None

    try:
        adk_agent = instantiate_adk_agent_from_config(agent_config_data, parent_adk_name_for_context=f"root_{agent_doc_id[:4]}")
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

    if adk_agent is None:
        error_msg = f"ADK Agent object could not be constructed for agent '{agent_doc_id}' (Original Name: '{original_config_name}'). This is unexpected after instantiation attempt."
        logger.error(error_msg)
        db.collection("agents").document(agent_doc_id).update({"deploymentStatus": "error", "deploymentError": error_msg})
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=error_msg)

        # --- Deployment to Vertex AI ---
    # Base requirements
    requirements_list = ["google-cloud-aiplatform[adk,agent_engines]>=1.93.1",
                         "gofannon",
                         ]

    # Add custom tool repositories if provided
    custom_repo_urls = agent_config_data.get("usedCustomRepoUrls", [])
    if isinstance(custom_repo_urls, list):
        for repo_url_original in custom_repo_urls:
            if isinstance(repo_url_original, str) and repo_url_original.strip():
                repo_url_raw = repo_url_original.strip()

                if not (repo_url_raw.startswith("https://") or repo_url_raw.startswith("http://") or \
                        repo_url_raw.startswith("git@") or repo_url_raw.startswith("git+")): # Allow common git URL starts
                    logger.warning(f"Skipping custom repository URL with unrecognized scheme: {repo_url_raw}")
                    continue

                base_url_for_pip = repo_url_raw
                fragment_str = ""
                if "#" in repo_url_raw:
                    # Split base URL from fragment. base_url_for_pip will not have #
                    base_url_for_pip, fragment_str = repo_url_raw.split("#", 1)

                    # Ensure 'git+' prefix for HTTP/HTTPS, or convert SSH to git+ssh
                if base_url_for_pip.startswith("git@"): # e.g. git@github.com:user/repo.git@ref
                    # Convert git@host:path@ref to git+ssh://git@host/path@ref
                    # The @ref part needs to be preserved correctly after the path.
                    path_with_potential_ref = base_url_for_pip.split(":", 1)[1] # user/repo.git@ref
                    host_part = base_url_for_pip.split(":")[0] # git@github.com
                    base_url_for_pip = f"git+ssh://{host_part}/{path_with_potential_ref}"
                elif not base_url_for_pip.startswith("git+"):
                    base_url_for_pip = "git+" + base_url_for_pip

                    # base_url_for_pip now is like:
                # git+https://github.com/user/repo.git@mybranch
                # git+ssh://git@github.com/user/repo.git@mybranch
                # git+https://github.com/user/repo.git (no ref)

                # Determine user_specified_ref from the part of base_url_for_pip after the repo path
                user_specified_ref = None
                # Regex to capture repo path and optional ref (group1=repo_path, group2=ref)
                # Works for URLs like git+[proto]://host/path/repo.git@ref or git+[proto]://host/path/repo@ref
                match_repo_and_ref = re.match(r"^(.*\/[^@/]+(?:\.git)?)(?:@([^#]+))?$", base_url_for_pip)
                repo_path_for_install = base_url_for_pip # Default to full URL if regex fails

                if match_repo_and_ref:
                    repo_path_for_install = match_repo_and_ref.group(1) # The URL part up to repo.git or repo name
                    if match_repo_and_ref.group(2):
                        user_specified_ref = match_repo_and_ref.group(2)
                        # Now re-attach the @ref to repo_path_for_install
                        repo_path_for_install += f"@{user_specified_ref}"


                is_commit_hash_ref = False
                if user_specified_ref:
                    if re.fullmatch(r"[0-9a-fA-F]{7,40}", user_specified_ref): # Check for 7-40 hex chars
                        is_commit_hash_ref = True
                        logger.info(f"Detected commit hash ref: '{user_specified_ref}' for URL '{repo_url_raw}'")
                    else:
                        logger.info(f"Detected branch/tag ref: '{user_specified_ref}' for URL '{repo_url_raw}'")
                else:
                    logger.info(f"No specific ref detected (implies default branch) for URL '{repo_url_raw}'")

                    # Determine egg_name
                parsed_egg_name = None
                if fragment_str and "egg=" in fragment_str:
                    # Extract base egg name, stripping any existing extras like [extra]
                    egg_match_in_fragment = re.search(r"egg=([^&\[\]]+)", fragment_str)
                    if egg_match_in_fragment:
                        parsed_egg_name = egg_match_in_fragment.group(1)

                if not parsed_egg_name:
                    # Guess egg_name from the original URL path (before git+, @ref, or #fragment)
                    url_for_egg_guess = repo_url_raw.split("://",1)[-1].split('@')[0].split('#')[0]
                    egg_name_match_guess = re.search(r'/([^/]+?)(?:\.git)?$', url_for_egg_guess)
                    parsed_egg_name = egg_name_match_guess.group(1) if egg_name_match_guess else f"customrepo{int(time.time())}"

                sanitized_egg_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', parsed_egg_name)

                # Add timestamp extra to egg name UNLESS it's a commit hash ref
                should_add_timestamp_extra = not is_commit_hash_ref

                current_egg_name_for_fragment = sanitized_egg_name
                if should_add_timestamp_extra:
                    timestamp_val = int(time.time())
                    current_egg_name_for_fragment += f"[upd{timestamp_val}]" # Appends like myrepo[upd123]

                # Construct the new fragment
                new_fragment_parts = [f"egg={current_egg_name_for_fragment}"]
                if fragment_str: # Add back other original fragment parts
                    for part in fragment_str.split('&'):
                        if not part.startswith("egg="):
                            new_fragment_parts.append(part)

                final_install_string = f"{repo_path_for_install}#{'&'.join(new_fragment_parts)}"

                if final_install_string not in requirements_list:
                    requirements_list.append(final_install_string)
                    logger.info(f"Added custom tool repository to requirements: {final_install_string}")
                else:
                    logger.info(f"Custom tool repository already in requirements (or duplicate attempt): {final_install_string}")
            else:
                logger.warning(f"Skipping non-string or empty custom repository URL: {repo_url_original}")

    deployment_display_name = generate_vertex_deployment_display_name(original_config_name, agent_doc_id)

    logger.info(f"Attempting to deploy ADK agent '{adk_agent.name}' (from original config '{original_config_name}') to Vertex AI with display_name: '{deployment_display_name}'. Requirements: {requirements_list}")

    try:
        remote_app = deployed_agent_engines.create(
            agent_engine=adk_agent,
            requirements=requirements_list,
            display_name=deployment_display_name,
            description=agent_config_data.get("description", f"ADK Agent (config: {original_config_name}) deployed via AgentLabUI: {deployment_display_name}")
        )
        logger.info(f"Vertex AI agent deployment successful for '{agent_doc_id}' (Original Name: '{original_config_name}'). Resource: {remote_app.resource_name}")
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
        if "validation error" in str(e_deploy).lower() and ("Agent" in str(e_deploy) or "LlmAgent" in str(e_deploy)):
            if "Extra inputs are not permitted" in str(e_deploy):
                firestore_error_message = f"ADK Pydantic validation error (likely during remote_app.create). Detail: {str(e_deploy)[:300]}"
            else:
                firestore_error_message = f"ADK Pydantic validation error for Agent/LlmAgent components. Detail: {str(e_deploy)[:300]}"

        db.collection("agents").document(agent_doc_id).update({
            "deploymentStatus": "error",
            "deploymentError": firestore_error_message,
            "lastDeployedAt": firestore.SERVER_TIMESTAMP
        })

        if isinstance(e_deploy, https_fn.HttpsError): raise
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Deployment to Vertex AI failed: {str(e_deploy)[:300]}. See function logs for details.")

__all__ = ['_deploy_agent_to_vertex_logic']