# functions/handlers/vertex/deployment_logic.py
import traceback
from firebase_admin import firestore
from firebase_functions import https_fn
from vertexai import agent_engines as deployed_agent_engines
from google.adk.agents import Agent, SequentialAgent, LoopAgent, ParallelAgent # ADK Agent classes

from common.core import db, logger
from common.utils import initialize_vertex_ai
from common.adk_helpers import (
    generate_vertex_deployment_display_name,
    sanitize_adk_agent_name,
    instantiate_adk_agent_from_config, # For child agents
    _prepare_agent_kwargs_from_config # For the main/root agent
)

def _deploy_agent_to_vertex_logic(req: https_fn.CallableRequest):
    agent_config_data = req.data.get("agentConfig")
    agent_doc_id = req.data.get("agentDocId")

    if not agent_config_data or not agent_doc_id:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Agent config (agentConfig) and Firestore document ID (agentDocId) are required.")

    logger.info(f"Initiating deployment for agent '{agent_doc_id}'. Config keys: {list(agent_config_data.keys())}")

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

    agent_type_str = agent_config_data.get("agentType")
    AgentClass = {"Agent": Agent, "SequentialAgent": SequentialAgent, "LoopAgent": LoopAgent, "ParallelAgent": ParallelAgent}.get(agent_type_str)

    if not AgentClass:
        error_msg = f"Invalid agentType specified: '{agent_type_str}' for agent '{agent_doc_id}'."
        logger.error(error_msg)
        db.collection("agents").document(agent_doc_id).update({"deploymentStatus": "error", "deploymentError": error_msg, "lastDeployedAt": firestore.SERVER_TIMESTAMP})
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message=error_msg)

    parent_agent_name_str = agent_config_data.get("name", f"default_agent_name_{agent_doc_id}")
    parent_adk_name = sanitize_adk_agent_name(parent_agent_name_str, prefix_if_needed=f"agent_{agent_doc_id}_")

    adk_agent = None

    if AgentClass == Agent:
        agent_kwargs = _prepare_agent_kwargs_from_config(
            agent_config_data,
            parent_adk_name,
            context_for_log="(root LlmAgent)"
        )
        logger.debug(f"Instantiating Root ADK LlmAgent '{parent_adk_name}' with kwargs: {agent_kwargs}")
        try:
            adk_agent = Agent(**agent_kwargs)
        except Exception as e_agent_init:
            logger.error(f"Pydantic or Init Error during Root Agent '{parent_adk_name}' instantiation: {e_agent_init}")
            logger.error(f"Args passed to root Agent constructor: {agent_kwargs}")
            detailed_traceback = traceback.format_exc()
            logger.error(f"Traceback for root agent init error:\n{detailed_traceback}")
            raise ValueError(f"Failed to instantiate root agent '{parent_agent_name_str}': {e_agent_init}. Check logs for Pydantic validation details against these args: {list(agent_kwargs.keys())}")


    elif AgentClass == SequentialAgent or AgentClass == ParallelAgent:
        child_agent_configs = agent_config_data.get("childAgents", [])
        if not child_agent_configs:
            error_msg = f"{AgentClass.__name__} '{parent_adk_name}' requires at least one child agent."
            logger.error(error_msg)
            db.collection("agents").document(agent_doc_id).update({"deploymentStatus": "error", "deploymentError": error_msg})
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message=error_msg)

        instantiated_child_agents = [
            instantiate_adk_agent_from_config(child_config, parent_adk_name_for_context=parent_adk_name, child_index=idx)
            for idx, child_config in enumerate(child_agent_configs)
        ]
        orchestrator_kwargs = {
            "name": parent_adk_name,
            "description": agent_config_data.get("description"), # Workflow agents have descriptions
            "sub_agents": instantiated_child_agents
        }
        logger.debug(f"Instantiating {AgentClass.__name__} '{parent_adk_name}' with kwargs: {orchestrator_kwargs}")
        adk_agent = AgentClass(**orchestrator_kwargs)

    elif AgentClass == LoopAgent:
        # The properties of the LoopAgent config (model, instruction, tools, codeExec)
        # define the SINGLE agent that will be looped.
        looped_agent_adk_name = sanitize_adk_agent_name(f"{parent_adk_name}_looped_child", prefix_if_needed="looped_")

        # Use the LoopAgent's own config (instruction, tools, model, enableCodeExecution)
        # to define the agent that will be looped.
        looped_agent_kwargs = _prepare_agent_kwargs_from_config(
            agent_config_data, # Pass the LoopAgent's main config
            looped_agent_adk_name,
            context_for_log=f"(looped child of {parent_adk_name})"
        )
        logger.debug(f"Instantiating Looped Child ADK Agent '{looped_agent_adk_name}' with kwargs: {looped_agent_kwargs}")
        try:
            looped_child_agent_instance = Agent(**looped_agent_kwargs)
        except Exception as e_loop_child_init:
            logger.error(f"Pydantic or Init Error during Looped Child Agent '{looped_agent_adk_name}' instantiation: {e_loop_child_init}")
            logger.error(f"Args passed to looped child Agent constructor: {looped_agent_kwargs}")
            detailed_traceback = traceback.format_exc()
            logger.error(f"Traceback for looped child agent init error:\n{detailed_traceback}")
            raise ValueError(f"Failed to instantiate looped child agent for '{parent_agent_name_str}': {e_loop_child_init}. Check logs for Pydantic validation details against these args: {list(looped_agent_kwargs.keys())}")

        max_loops_val = int(agent_config_data.get("maxLoops", 3)) # Default if not specified
        loop_agent_kwargs = {
            "name": parent_adk_name,
            "description": agent_config_data.get("description"), # LoopAgent itself can have a description
            "agent": looped_child_agent_instance, # The agent to loop
            "max_loops": max_loops_val
        }
        logger.debug(f"Instantiating LoopAgent '{parent_adk_name}' with kwargs: {loop_agent_kwargs}")
        adk_agent = LoopAgent(**loop_agent_kwargs)


    if adk_agent is None: # Should be caught by specific type instantiations
        error_msg = f"ADK Agent object could not be constructed for agent '{agent_doc_id}' type '{agent_type_str}'."
        logger.error(error_msg)
        db.collection("agents").document(agent_doc_id).update({"deploymentStatus": "error", "deploymentError": error_msg})
        raise ValueError(error_msg) # Or HttpsError

    logger.info(f"ADK Agent object '{adk_agent.name}' of type {AgentClass.__name__} prepared for deployment.")
    # Define standard requirements. Add others if your tools need them.
    requirements_list = ["google-cloud-aiplatform[adk,agent_engines]>=1.93.1", "gofannon"] # Example
    config_name_for_display = agent_config_data.get("name", agent_doc_id) # Use user-defined name for Vertex display name
    deployment_display_name = generate_vertex_deployment_display_name(config_name_for_display, agent_doc_id)

    logger.info(f"Attempting to deploy ADK agent '{adk_agent.name}' to Vertex AI with display_name: '{deployment_display_name}'.")

    try:
        remote_app = deployed_agent_engines.create(
            agent_engine=adk_agent,
            requirements=requirements_list,
            display_name=deployment_display_name,
            description=agent_config_data.get("description", f"ADK Agent deployed via AgentLabUI: {deployment_display_name}")
        )
        logger.info(f"Vertex AI agent deployment successful for '{agent_doc_id}'. Resource: {remote_app.resource_name}")
        db.collection("agents").document(agent_doc_id).update({
            "vertexAiResourceName": remote_app.resource_name, "deploymentStatus": "deployed",
            "lastDeployedAt": firestore.SERVER_TIMESTAMP, "deploymentError": firestore.DELETE_FIELD
        })
        return {"success": True, "resourceName": remote_app.resource_name, "message": f"Agent '{deployment_display_name}' deployment initiated."}

    except Exception as e:
        tb_str = traceback.format_exc() # Get traceback early
        error_message_for_log = f"Error during Vertex AI agent deployment for '{agent_doc_id}' (ADK name: '{getattr(adk_agent, 'name', 'N/A')}', Display: '{deployment_display_name}'): {str(e)}"
        logger.error(f"{error_message_for_log}\nFull Traceback:\n{tb_str}") # Log full traceback

        # Store a concise error in Firestore, potentially a summary or error type
        firestore_error_message = f"Deployment Error: {type(e).__name__} - {str(e)[:500]}" # More concise for DB
        if "validation error" in str(e).lower() and ("Agent" in str(e) or "LlmAgent" in str(e)) and "Extra inputs are not permitted" in str(e).lower():
            firestore_error_message = f"Pydantic validation error for Agent. Check logs for agent constructor args. Detail: {str(e)[:300]}"

        db.collection("agents").document(agent_doc_id).update({
            "deploymentStatus": "error",
            "deploymentError": firestore_error_message,
            "lastDeployedAt": firestore.SERVER_TIMESTAMP
        })

        if isinstance(e, https_fn.HttpsError): raise
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Deployment to Vertex AI failed: {str(e)[:300]}. See function logs for details.")  