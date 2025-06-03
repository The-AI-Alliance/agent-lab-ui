# functions/common/adk_helpers.py
import re
import os
import importlib
import traceback
from .core import logger
from google.adk.agents import Agent, SequentialAgent, LoopAgent, ParallelAgent # ADK Agent classes
from google.adk.tools.agent_tool import AgentTool
from google.adk.models.lite_llm import LiteLlm

def _prepare_agent_kwargs_from_config(agent_config, adk_agent_name: str, context_for_log: str = ""):
    logger.info(f"--- AGENT CONFIG RECEIVED by _prepare_agent_kwargs_from_config for {adk_agent_name} ---: {agent_config}")
    instantiated_tools = []
    user_defined_tools_config = agent_config.get("tools", [])
    for tc_idx, tc in enumerate(user_defined_tools_config):
        try:
            tool_instance = instantiate_tool(tc)
            instantiated_tools.append(tool_instance)
            logger.info(f"Successfully instantiated tool '{tc.get('id', f'index_{tc_idx}')}' for agent '{adk_agent_name}'.")
        except ValueError as e:
            logger.warn(f"Skipping tool for agent '{adk_agent_name}' due to error: {e} (Tool config: {tc.get('id', f'index_{tc_idx}')})")

    final_tool_config_for_agent = None
    enable_code_execution = agent_config.get("enableCodeExecution", False)

    # --- Model Configuration ---
    model_provider = agent_config.get("modelProvider", "google_gemini") # Default to Gemini

    actual_model_for_adk = None

    if model_provider == "openai_compatible":
        model_name_for_endpoint = agent_config.get("modelNameForEndpoint")
        api_base_url = agent_config.get("apiBase")
        api_key_for_endpoint = agent_config.get("apiKey") # Can be None for local/unsecured

        if not model_name_for_endpoint:
            raise ValueError(f"Missing 'modelNameForEndpoint' for 'openai_compatible' provider in agent config '{agent_config.get('name', 'N/A')}'.")
        if not api_base_url:
            raise ValueError(f"Missing 'apiBase' for 'openai_compatible' provider in agent config '{agent_config.get('name', 'N/A')}'.")

        logger.info(f"Configuring LiteLlm for agent '{adk_agent_name}' using endpoint model '{model_name_for_endpoint}' at base URL '{api_base_url}'. API key provided: {'Yes' if api_key_for_endpoint else 'No'}")
        actual_model_for_adk = LiteLlm(
            model=model_name_for_endpoint, # Model name as known by the endpoint
            api_base=api_base_url,
            api_key=api_key_for_endpoint # LiteLLM handles if this is None
        )
    elif model_provider == "google_gemini":
        # Use the 'model' field for Gemini, which was the original behavior
        gemini_model_id = agent_config.get("model")
        if not gemini_model_id:
            default_gemini = "gemini-1.5-flash-001" # Or your preferred default from constants
            logger.warn(f"No 'model' (Gemini model ID) provided for 'google_gemini' provider in agent config '{agent_config.get('name', 'N/A')}'. Defaulting to '{default_gemini}'.")
            gemini_model_id = default_gemini
        actual_model_for_adk = gemini_model_id
        logger.info(f"Configuring Google Gemini model '{actual_model_for_adk}' for agent '{adk_agent_name}'.")
    else:
        raise ValueError(f"Unsupported modelProvider: '{model_provider}' for agent config '{agent_config.get('name', 'N/A')}'.")


        # --- Code Execution Handling (remains mostly the same, uses the determined model) ---
    # Note: Ensure the model determined above (actual_model_for_adk, if it's a string for Gemini)
    # is compatible with code execution if enable_code_execution is true.
    # LiteLLM's compatibility with ADK's direct code_execution_config might vary or require specific model capabilities.
    # For now, we assume if enable_code_execution is true, the selected model (Gemini or via LiteLLM) supports it.
    # A more robust check might be needed here in the future if LiteLLM models behave differently
    # with ADK's code_execution_config.

    current_agent_model_for_code_exec_sub_agent = "gemini-1.5-flash-001" # Default for sub-agent
    if model_provider == "google_gemini" and actual_model_for_adk:
        current_agent_model_for_code_exec_sub_agent = actual_model_for_adk
    elif model_provider == "openai_compatible":
        # For LiteLlm, the sub-agent for code execution might still need to be Gemini,
        # or the LiteLlm instance itself could be passed if ADK supports it directly for sub-agents.
        # This part might need refinement based on ADK's AgentTool capabilities with LiteLlm instances.
        # For safety, defaulting to a known Gemini model for the sub-agent.
        # Alternatively, if the LiteLlm instance can be an "agent" for AgentTool:
        # current_agent_model_for_code_exec_sub_agent = actual_model_for_adk
        pass # Keep default Gemini for code exec sub-agent for now with LiteLLM

    if enable_code_execution:
        if not instantiated_tools:
            final_tool_config_for_agent = {"code_execution_config": {"enabled": True}}
            logger.info(f"Enabling direct code execution for agent '{adk_agent_name}' (no other tools).")
        else:
            logger.info(f"Agent '{adk_agent_name}' requires code execution AND other tools. Wrapping code execution in an AgentTool.")
            code_executor_sub_agent = _create_code_executor_agent(base_name=adk_agent_name, model=current_agent_model_for_code_exec_sub_agent)
            code_execution_agent_tool = AgentTool(agent=code_executor_sub_agent)
            instantiated_tools.append(code_execution_agent_tool)
            logger.info(f"Added AgentTool for code execution to tools list for '{adk_agent_name}'. Main agent tool_config remains None.")
    else:
        logger.info(f"Code execution is DISABLED for agent '{adk_agent_name}'.")

    agent_kwargs = {
        "name": adk_agent_name,
        "description": agent_config.get("description"),
        "model": actual_model_for_adk, # Will be string (Gemini) or LiteLlm instance
        "instruction": agent_config.get("instruction"),
        "tools": instantiated_tools,
        "tool_config": final_tool_config_for_agent,
        "output_key": agent_config.get("outputKey"),
    }
    return {k: v for k, v in agent_kwargs.items() if v is not None}

def generate_vertex_deployment_display_name(agent_config_name: str, agent_doc_id: str) -> str:
    # (No changes from your provided code, assuming it's correct)
    base_name = agent_config_name or f"adk-agent-{agent_doc_id}"
    sanitized_base = re.sub(r'[^a-z0-9-]+', '-', base_name.lower()).strip('-')
    if not sanitized_base:
        sanitized_base = f"agent-{agent_doc_id[:8]}"
    if not sanitized_base[0].isalpha() or len(sanitized_base) < 2 :
        core_name = sanitized_base[:59]
        deployment_display_name = f"a-{core_name}"
    else:
        deployment_display_name = sanitized_base
    deployment_display_name = deployment_display_name[:63]
    while len(deployment_display_name) < 4 and len(deployment_display_name) < 63:
        deployment_display_name += "x"
    return deployment_display_name.strip('-')[:63]


def instantiate_tool(tool_config):
    logger.info(f"Attempting to instantiate tool: {tool_config.get('id', 'N/A')}")
    if not isinstance(tool_config, dict):
        raise ValueError(f"Tool configuration must be a dictionary, got {type(tool_config)}")

    module_path = tool_config.get("module_path")
    class_name = tool_config.get("class_name")

    if module_path and class_name:
        try:
            module = importlib.import_module(module_path)
            ToolClass = getattr(module, class_name)
            instance_specific_kwargs = tool_config.get('configuration', {})
            if instance_specific_kwargs:
                logger.info(f"Instantiating tool '{tool_config.get('id', class_name)}' with specific configuration keys: {list(instance_specific_kwargs.keys())}")
            else:
                logger.info(f"Instantiating tool '{tool_config.get('id', class_name)}' with no specific instance configuration.")

            instance = ToolClass(**instance_specific_kwargs)

            if hasattr(instance, 'export_to_adk') and callable(instance.export_to_adk):
                adk_tool_spec = instance.export_to_adk()
                # Changed log message to be more generic
                tool_source_type = "Gofannon-compatible tool"
                logger.info(f"Successfully instantiated and exported {tool_source_type} '{tool_config.get('id', class_name)}' to ADK spec.")
                return adk_tool_spec
            else:
                logger.info(f"Successfully instantiated tool '{tool_config.get('id', class_name)}' (assumed ADK native or directly compatible, e.g., Langchain tool).")
                return instance
        except Exception as e:
            tool_id_for_log = tool_config.get('id', class_name or 'N/A')
            # Enhanced error logging for import issues
            if isinstance(e, (ImportError, ModuleNotFoundError)):
                logger.error(f"Error instantiating tool '{tool_id_for_log}': Could not import module '{module_path}'. Ensure this module is available in the Cloud Function's Python environment. Error: {e}\n{traceback.format_exc()}")
            else:
                logger.error(f"Error instantiating tool '{tool_id_for_log}': {e}\n{traceback.format_exc()}")
            raise ValueError(f"Error instantiating tool {tool_id_for_log}: {e}")
    else:
        raise ValueError(f"Unsupported or incomplete tool configuration for tool ID {tool_config.get('id', 'N/A')}. Missing module_path or class_name.")


def sanitize_adk_agent_name(name_str: str, prefix_if_needed: str = "agent_") -> str:
    # (No changes from your provided code, assuming it's correct)
    sanitized = re.sub(r'[^a-zA-Z0-9_]', '_', name_str)
    sanitized = sanitized.strip('_')
    if sanitized and sanitized[0].isdigit():
        sanitized = f"_{sanitized}"
    if not sanitized or not (sanitized[0].isalpha() or sanitized[0] == '_'):
        temp_name = re.sub(r'[^a-zA-Z0-9_]', '_', name_str)
        sanitized = f"{prefix_if_needed.strip('_')}_{temp_name.strip('_')}"
        sanitized = re.sub(r'_+', '_', sanitized).strip('_')
    if not sanitized:
        sanitized = f"{prefix_if_needed.strip('_')}_default_agent_name"
    sanitized = sanitized[:63] # ADK name length limit
    if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", sanitized):
        logger.warn(f"Sanitized name '{sanitized}' from '{name_str}' is still not a valid Python identifier. Using a generic fallback.")
        generic_name = f"{prefix_if_needed.strip('_')}_{os.urandom(4).hex()}"
        return generic_name[:63]
    return sanitized

def _create_code_executor_agent(base_name: str, model: str) -> Agent:
    # (No changes from your provided code)
    code_exec_agent_name = sanitize_adk_agent_name(f"{base_name}_code_executor_sub_agent")
    logger.info(f"Creating dedicated Code Executor sub-agent: {code_exec_agent_name}")
    code_exec_agent = Agent(
        name=code_exec_agent_name,
        description="An agent that can execute Python code.",
        model=model,
        instruction="You are a code execution utility. Execute the provided code.",
        tool_config={"code_execution_config": {"enabled": True}}
    )
    return code_exec_agent

def _prepare_agent_kwargs_from_config(agent_config, adk_agent_name: str, context_for_log: str = ""):
    # (No changes from your provided code)
    logger.info(f"Preparing kwargs for ADK agent '{adk_agent_name}' {context_for_log}. Original config name: '{agent_config.get('name', 'N/A')}'")

    instantiated_tools = []
    user_defined_tools_config = agent_config.get("tools", [])
    for tc_idx, tc in enumerate(user_defined_tools_config):
        try:
            tool_instance = instantiate_tool(tc)
            instantiated_tools.append(tool_instance)
            logger.info(f"Successfully instantiated tool '{tc.get('id', f'index_{tc_idx}')}' for agent '{adk_agent_name}'.")
        except ValueError as e:
            logger.warn(f"Skipping tool for agent '{adk_agent_name}' due to error: {e} (Tool config: {tc.get('id', f'index_{tc_idx}')})")

    final_tool_config_for_agent = None
    enable_code_execution = agent_config.get("enableCodeExecution", False)
    agent_model = agent_config.get("model", "gemini-1.5-flash-001") # Default model

    if enable_code_execution:
        if not instantiated_tools:
            # Code execution is the ONLY tool, can be set directly
            final_tool_config_for_agent = {"code_execution_config": {"enabled": True}}
            logger.info(f"Enabling direct code execution for agent '{adk_agent_name}' (no other tools).")
        else:
            # Code execution needed alongside other tools; wrap it
            logger.info(f"Agent '{adk_agent_name}' requires code execution AND other tools. Wrapping code execution in an AgentTool.")
            code_executor_sub_agent = _create_code_executor_agent(base_name=adk_agent_name, model=agent_model)
            code_execution_agent_tool = AgentTool(agent=code_executor_sub_agent)
            instantiated_tools.append(code_execution_agent_tool)
            logger.info(f"Added AgentTool for code execution to tools list for '{adk_agent_name}'. Main agent tool_config remains None.")
    else:
        logger.info(f"Code execution is DISABLED for agent '{adk_agent_name}'.")

    agent_kwargs = {
        "name": adk_agent_name,
        "description": agent_config.get("description"),
        "model": agent_model,
        "instruction": agent_config.get("instruction"),
        "tools": instantiated_tools,
        "tool_config": final_tool_config_for_agent,
        "output_key": agent_config.get("outputKey"),
    }
    return {k: v for k, v in agent_kwargs.items() if v is not None}


def instantiate_adk_agent_from_config(agent_config, parent_adk_name_for_context="root", child_index=0):
    """
    Recursively instantiates an ADK Agent (LlmAgent, SequentialAgent, LoopAgent, ParallelAgent)
    from its configuration dictionary.
    Handles 'enableCodeExecution' by setting 'tool_config' or wrapping.
    """
    original_agent_name = agent_config.get('name', f'agent_cfg_{child_index}')
    unique_base_name_for_adk = f"{original_agent_name}_{parent_adk_name_for_context}_{os.urandom(2).hex()}"
    adk_agent_name = sanitize_adk_agent_name(unique_base_name_for_adk, prefix_if_needed=f"agent_{child_index}_")

    agent_type_str = agent_config.get("agentType")
    AgentClass = {
        "Agent": Agent,
        "SequentialAgent": SequentialAgent,
        "LoopAgent": LoopAgent,
        "ParallelAgent": ParallelAgent
    }.get(agent_type_str)

    if not AgentClass:
        error_msg = f"Invalid agentType specified: '{agent_type_str}' for agent config: {original_agent_name}"
        logger.error(error_msg)
        raise ValueError(error_msg)

    logger.info(f"Instantiating ADK Agent: Name='{adk_agent_name}', Type='{AgentClass.__name__}', Original Config Name='{original_agent_name}' (Context: parent='{parent_adk_name_for_context}', index={child_index})")

    if AgentClass == Agent: # This is LlmAgent
        agent_kwargs = _prepare_agent_kwargs_from_config(
            agent_config,
            adk_agent_name,
            context_for_log=f"(type: LlmAgent, parent: {parent_adk_name_for_context}, original: {original_agent_name})"
        )
        logger.debug(f"Final kwargs for LlmAgent '{adk_agent_name}': {agent_kwargs}")
        try:
            return Agent(**agent_kwargs)
        except Exception as e_agent_init:
            logger.error(f"Initialization Error for LlmAgent '{adk_agent_name}' (from config '{original_agent_name}'): {e_agent_init}")
            logger.error(f"Args passed: {agent_kwargs}")
            detailed_traceback = traceback.format_exc()
            logger.error(f"Traceback:\n{detailed_traceback}")
            raise ValueError(f"Failed to instantiate LlmAgent '{original_agent_name}': {e_agent_init}.")

    elif AgentClass == SequentialAgent or AgentClass == ParallelAgent:
        child_agent_configs = agent_config.get("childAgents", [])
        if not child_agent_configs:
            raise ValueError(f"{AgentClass.__name__} '{original_agent_name}' requires at least one child agent in its configuration.")

        instantiated_child_agents = []
        for idx, child_config in enumerate(child_agent_configs):
            try:
                child_agent_instance = instantiate_adk_agent_from_config( # Recursive call
                    child_config,
                    parent_adk_name_for_context=adk_agent_name,
                    child_index=idx
                )
                instantiated_child_agents.append(child_agent_instance)
            except Exception as e_child:
                logger.error(f"Failed to instantiate child agent at index {idx} for {AgentClass.__name__} '{original_agent_name}': {e_child}")
                raise ValueError(f"Error processing child agent for '{original_agent_name}': {e_child}")

        orchestrator_kwargs = {
            "name": adk_agent_name,
            "description": agent_config.get("description"),
            "sub_agents": instantiated_child_agents
        }
        logger.debug(f"Final kwargs for {AgentClass.__name__} '{adk_agent_name}': {{name, description, num_sub_agents: {len(instantiated_child_agents)}}}")
        return AgentClass(**orchestrator_kwargs)

    elif AgentClass == LoopAgent:
        looped_agent_config_name = f"{original_agent_name}_looped_child_config"
        looped_agent_adk_name = sanitize_adk_agent_name(f"{adk_agent_name}_looped_child_instance", prefix_if_needed="looped_")

        looped_agent_kwargs = _prepare_agent_kwargs_from_config(
            agent_config,
            looped_agent_adk_name,
            context_for_log=f"(looped child of {adk_agent_name}, original: {looped_agent_config_name})"
        )
        logger.debug(f"Final kwargs for Looped Child ADK Agent '{looped_agent_adk_name}' (for LoopAgent '{adk_agent_name}'): {looped_agent_kwargs}")
        try:
            looped_child_agent_instance = Agent(**looped_agent_kwargs)
        except Exception as e_loop_child_init:
            logger.error(f"Initialization Error for Looped Child Agent '{looped_agent_adk_name}' (from config '{looped_agent_config_name}'): {e_loop_child_init}")
            logger.error(f"Args passed to looped child Agent constructor: {looped_agent_kwargs}")
            detailed_traceback = traceback.format_exc()
            logger.error(f"Traceback:\n{detailed_traceback}")
            raise ValueError(f"Failed to instantiate looped child agent for '{original_agent_name}': {e_loop_child_init}.")

        max_loops_val = int(agent_config.get("maxLoops", 3))
        loop_agent_kwargs = {
            "name": adk_agent_name,
            "description": agent_config.get("description"),
            "agent": looped_child_agent_instance,
            "max_loops": max_loops_val
        }
        logger.debug(f"Final kwargs for LoopAgent '{adk_agent_name}': {{name, description, max_loops, agent_name: {looped_child_agent_instance.name}}}")
        return LoopAgent(**loop_agent_kwargs)

    else:
        raise ValueError(f"Unhandled agent type '{agent_type_str}' during recursive instantiation for '{original_agent_name}'.")


__all__ = [
    'generate_vertex_deployment_display_name',
    'instantiate_tool',
    'sanitize_adk_agent_name',
    '_prepare_agent_kwargs_from_config',
    'instantiate_adk_agent_from_config'
]