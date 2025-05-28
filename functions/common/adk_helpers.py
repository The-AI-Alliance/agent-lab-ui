# functions/common/adk_helpers.py  
import re
import os
import importlib
import traceback
from .core import logger
from google.adk.agents import Agent, SequentialAgent, LoopAgent, ParallelAgent # ADK Agent classes
from google.adk.tools.agent_tool import AgentTool # For wrapping agents as tools

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
    # (No changes from your provided code, assuming it handles Gofannon/ADK/Langchain correctly)
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
                logger.info(f"Successfully instantiated and exported Gofannon tool '{tool_config.get('id', class_name)}' to ADK spec.")
                return adk_tool_spec
            else:
                logger.info(f"Successfully instantiated tool '{tool_config.get('id', class_name)}' (assumed ADK compatible or Langchain tool).")
                return instance
        except Exception as e:
            tool_id_for_log = tool_config.get('id', class_name or 'N/A')
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
        logger.warning(f"Sanitized name '{sanitized}' from '{name_str}' is still not a valid Python identifier. Using a generic fallback.")
        generic_name = f"{prefix_if_needed.strip('_')}_{os.urandom(4).hex()}"
        return generic_name[:63]
    return sanitized

def _create_code_executor_agent(base_name: str, model: str) -> Agent:
    """Helper to create a dedicated agent for code execution."""
    code_exec_agent_name = sanitize_adk_agent_name(f"{base_name}_code_executor_sub_agent")
    logger.info(f"Creating dedicated Code Executor sub-agent: {code_exec_agent_name}")
    # This agent's instruction should be minimal, as it's just a utility
    # Its description will be used by the AgentTool wrapper.
    code_exec_agent = Agent(
        name=code_exec_agent_name,
        description="An agent that can execute Python code.", # AgentTool will use this
        model=model,
        instruction="You are a code execution utility. Execute the provided code.",
        tool_config={"code_execution_config": {"enabled": True}}
    )
    return code_exec_agent

def _prepare_agent_kwargs_from_config(agent_config, adk_agent_name: str, context_for_log: str = ""):
    """
    Prepares kwargs for ADK Agent instantiation from config, handling tools
    and code execution according to ADK restrictions.
    """
    logger.info(f"Preparing kwargs for ADK agent '{adk_agent_name}' {context_for_log}. Original config name: '{agent_config.get('name', 'N/A')}'")

    instantiated_tools = []
    user_defined_tools_config = agent_config.get("tools", [])
    for tc_idx, tc in enumerate(user_defined_tools_config):
        try:
            tool_instance = instantiate_tool(tc)
            instantiated_tools.append(tool_instance)
            logger.info(f"Successfully instantiated tool '{tc.get('id', f'index_{tc_idx}')}' for agent '{adk_agent_name}'.")
        except ValueError as e:
            logger.warning(f"Skipping tool for agent '{adk_agent_name}' due to error: {e} (Tool config: {tc.get('id', f'index_{tc_idx}')})")

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
            # The AgentTool's name and description are taken from the wrapped agent.
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
        "tools": instantiated_tools, # This now includes AgentTool for code exec if needed
        "tool_config": final_tool_config_for_agent, # This is None if code exec is wrapped or disabled
        # Add other LlmAgent specific params if they exist in your agent_config
        "output_key": agent_config.get("outputKey"),
        # "planner": ... if you support planners
        # "memory": ... if you support memory
        # "examples": ...
        # "include_contents": ...
        # "before_agent_callback": ... etc.
    }
    # Filter out None values for cleaner ADK agent instantiation
    return {k: v for k, v in agent_kwargs.items() if v is not None}


def instantiate_adk_agent_from_config(agent_config, parent_adk_name_for_context="parent", child_index=0):
    """
    Instantiates a child ADK Agent from its configuration dictionary.
    This is used for child agents within SequentialAgent, ParallelAgent.
    Handles 'enableCodeExecution' by setting the 'tool_config' or wrapping.
    """
    original_child_name = agent_config.get('name', f'child_agent_{child_index}')
    # Ensure unique base name for ADK, especially if names are not unique in config
    base_name_for_adk = f"{original_child_name}_{parent_adk_name_for_context}_{os.urandom(3).hex()}"
    final_child_agent_name = sanitize_adk_agent_name(base_name_for_adk, prefix_if_needed=f"child_{child_index}_")

    agent_kwargs = _prepare_agent_kwargs_from_config(
        agent_config,
        final_child_agent_name,
        context_for_log=f"(child of {parent_adk_name_for_context}, index {child_index})"
    )

    logger.debug(f"Instantiating Child ADK Agent '{final_child_agent_name}' with kwargs: {agent_kwargs}")
    try:
        return Agent(**agent_kwargs) # Assumes all children are LlmAgent (Agent alias)
    except Exception as e_child_init:
        logger.error(f"Pydantic or Init Error during Child Agent '{final_child_agent_name}' instantiation: {e_child_init}")
        logger.error(f"Args passed to child Agent constructor: {agent_kwargs}")
        detailed_traceback = traceback.format_exc()
        logger.error(f"Traceback for child agent init error:\n{detailed_traceback}")
        raise ValueError(f"Failed to instantiate child agent '{original_child_name}': {e_child_init}. Check logs for Pydantic validation details against these args: {list(agent_kwargs.keys())}")


__all__ = [
    'generate_vertex_deployment_display_name',
    'instantiate_tool',
    'sanitize_adk_agent_name',
    'instantiate_adk_agent_from_config',
    '_prepare_agent_kwargs_from_config' # Export if needed by deployment_logic directly
]  