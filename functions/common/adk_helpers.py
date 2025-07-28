# functions/common/adk_helpers.py
import re
import os
import importlib
import traceback
import asyncio # Import asyncio
from .core import logger, db
from google.adk.agents import Agent, SequentialAgent, LoopAgent, ParallelAgent # LlmAgent is aliased as Agent
from google.adk.tools.agent_tool import AgentTool
from google.adk.models.lite_llm import LiteLlm
from google.genai import types as genai_types # For GenerateContentConfig
# Updated import for MCPToolset and its params
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset

from google.adk.tools.mcp_tool.mcp_session_manager import (
    StreamableHTTPConnectionParams,
    SseServerParams,
)
from google.adk.artifacts import GcsArtifactService
from .config import get_gcp_project_config
from google.adk.auth.auth_schemes import AuthScheme
from google.adk.auth.auth_credential import AuthCredential, AuthCredentialTypes, HttpAuth, HttpCredentials
from fastapi.openapi.models import APIKey, APIKeyIn, HTTPBearer
from google.adk.auth.auth_schemes import AuthSchemeType


# SseServerParams was already imported from mcp_tool.mcp_toolset,
# StreamableHTTPConnectionParams is also available there.

# This mapping helps the backend determine LiteLLM prefixes and expected API key env vars.
# It's a simplified version of what was in PYTHON_AGENT_CONSTANTS before,
# as the frontend now sends more structured data.
BACKEND_LITELLM_PROVIDER_CONFIG = {
    "openai": {"prefix": "openai", "apiKeyEnv": "OPENAI_API_KEY"},
    "openai_compatible": {"prefix": "openai", "apiKeyEnv": None}, # User provides key/base
    "google_ai_studio": {"prefix": "gemini", "apiKeyEnv": "GEMINI_API_KEY"},
    "anthropic": {"prefix": "anthropic", "apiKeyEnv": "ANTHROPIC_API_KEY"},
    "bedrock": {"prefix": "bedrock", "apiKeyEnv": "AWS_ACCESS_KEY_ID"}, # Needs others like SECRET, REGION
    "meta_llama": {"prefix": "meta_llama", "apiKeyEnv": "LLAMA_API_KEY"},
    "mistral": {"prefix": "mistral", "apiKeyEnv": "MISTRAL_API_KEY"},
    "watsonx": {"prefix": "watsonx", "apiKeyEnv": "WATSONX_APIKEY"}, # Needs WATSONX_URL, WATSONX_PROJECT_ID
    "deepseek": {"prefix": "deepseek", "apiKeyEnv": "DEEPSEEK_API_KEY"},
    "deepinfra": {"prefix": "deepinfra", "apiKeyEnv": "DEEPINFRA_API_KEY"},
    "replicate": {"prefix": "replicate", "apiKeyEnv": "REPLICATE_API_KEY"},
    "together_ai": {"prefix": "together_ai", "apiKeyEnv": "TOGETHER_AI_API_KEY"},
    "azure": {"prefix": "azure", "apiKeyEnv": "AZURE_API_KEY"}, # Needs AZURE_API_BASE, AZURE_API_VERSION
    "custom": {"prefix": None, "apiKeyEnv": None} # No prefix, user provides full string
}



def generate_vertex_deployment_display_name(agent_config_name: str, agent_doc_id: str) -> str:
    base_name = agent_config_name or f"adk-agent-{agent_doc_id}"
    # Vertex AI display names must be 4-63 chars, start with letter, contain only lowercase letters, numbers, hyphens.
    sanitized_base = re.sub(r'[^a-z0-9-]+', '-', base_name.lower()).strip('-')
    if not sanitized_base: # If name was all invalid chars
        sanitized_base = f"agent-{agent_doc_id[:8]}" # Fallback using doc ID part

    # Ensure starts with a letter
    if not sanitized_base[0].isalpha():
        # Vertex display names must start with a letter.
        # Max length is 63. If prepending 'a-' makes it too long, truncate from the end of core_name.
        core_name = sanitized_base[:59] # Max 59 to allow for 'a-' prefix and ensure it's not too long
        deployment_display_name = f"a-{core_name}"
    else:
        deployment_display_name = sanitized_base

        # Ensure minimum length of 4 (Vertex requirement)
    # Ensure final length is within 63 characters
    deployment_display_name = deployment_display_name[:63]
    while len(deployment_display_name) < 4 and len(deployment_display_name) < 63 : # Check max length again here
        deployment_display_name += "x" # Pad if too short

    return deployment_display_name.strip('-')[:63] # Final strip and length check

async def get_model_config_from_firestore(model_id: str) -> dict:
    """Fetches a model configuration document from Firestore."""
    if not model_id:
        raise ValueError("model_id cannot be empty.")
    try:
        model_ref = db.collection("models").document(model_id)
        model_doc = model_ref.get()
        if not model_doc.exists:
            raise ValueError(f"Model with ID '{model_id}' not found in Firestore.")
        return model_doc.to_dict()
    except Exception as e:
        logger.error(f"Error fetching model config for ID '{model_id}' from Firestore: {e}")
        # Re-raise as a ValueError to be handled by the calling function
        raise ValueError(f"Could not fetch model configuration for ID '{model_id}'.")


async def get_adk_artifact_service() -> GcsArtifactService:
    """
    Initializes and returns a GCSArtifactService instance.
    This can be shared across different runs within the same function invocation.
    """
    try:
        project_id, _, _ = get_gcp_project_config()
        # Bucket for ADK artifacts, separate from context uploads
        bucket_name = f"{project_id}-adk-artifacts"
        # The GcsArtifactService might create the bucket if it doesn't exist,
        # but it's better to ensure it exists with correct permissions.
        # For now, we assume it will be created or exists.
        return GcsArtifactService(bucket_name=bucket_name)
    except Exception as e:
        logger.error(f"Failed to initialize GCSArtifactService: {e}")
        # Depending on requirements, could fallback to InMemoryArtifactService or raise
        raise ValueError("Could not create GCS Artifact Service for ADK.")

def _create_mcp_auth_objects(auth_config: dict | None) -> tuple[AuthScheme | None, AuthCredential | None]:
    """
    Creates ADK AuthScheme and AuthCredential objects from a UI-provided auth dictionary.
    """
    if not auth_config:
        return None, None

    auth_type = auth_config.get("type")

    try:
        if auth_type == "bearer":
            token = auth_config.get("token")
            if not token:
                logger.warn("MCP Auth: Bearer token type specified but token is missing.")
                return None, None
                # For Bearer, the scheme is http and the credential carries the token.
            scheme = HTTPBearer()
            cred = AuthCredential(
                auth_type=AuthCredentialTypes.HTTP,
                http=HttpAuth(scheme="bearer", credentials=HttpCredentials(token=token))
            )
            logger.info("Created Bearer token AuthScheme and AuthCredential for MCP.")
            return scheme, cred

        elif auth_type == "apiKey":
            key = auth_config.get("key")
            name = auth_config.get("name")
            location = auth_config.get("in")

            if not all([key, name, location]):
                logger.warn("MCP Auth: API Key type specified but key, name, or location is missing.")
                return None, None
            if location != "header":
                logger.warn(f"MCP Auth: API Key location '{location}' is not supported. Only 'header' is supported.")
                return None, None

                # For API Key, the scheme defines where to put it, and the credential holds the value.
            scheme = APIKey(name=name, in_=APIKeyIn.header)
            cred = AuthCredential(auth_type=AuthCredentialTypes.API_KEY, api_key=key)
            logger.info(f"Created API Key AuthScheme (header: {name}) and AuthCredential for MCP.")
            return scheme, cred

        logger.warn(f"MCP Auth: Unsupported auth type '{auth_type}' received.")
        return None, None
    except Exception as e:
        logger.error(f"Error creating MCP auth objects for config {auth_config}: {e}")
        return None, None

async def _prepare_agent_kwargs_from_config(merged_agent_and_model_config, adk_agent_name: str, context_for_log: str = ""): # Made async
    logger.info(f"Preparing kwargs for ADK agent '{adk_agent_name}' {context_for_log}. Original config name: '{merged_agent_and_model_config.get('name', 'N/A')}'")

    instantiated_tools = []
    mcp_tools_by_server_and_auth = {}
    user_defined_tools_config = merged_agent_and_model_config.get("tools", [])
    logger.info(f"user_defined_tools_config for agent '{adk_agent_name}': {user_defined_tools_config}")
    for tc_idx, tc in enumerate(user_defined_tools_config):
        tool_type = tc.get('type')
        if tool_type is None and tc.get('module_path') and tc.get('class_name'):
            tool_type = 'gofannon'
            tc['type'] = 'gofannon'
            logger.info(f"Auto-detected tool type 'gofannon' for tool with module_path: {tc.get('module_path')}")

        if tool_type == 'mcp':
            server_url = tc.get('mcpServerUrl')
            tool_name_on_server = tc.get('mcpToolName')
            auth_config_from_ui = tc.get('auth') # New: get auth config

            # Create a hashable key for the dictionary
            auth_key = frozenset(auth_config_from_ui.items()) if auth_config_from_ui else None
            dict_key = (server_url, auth_key)

            if server_url and tool_name_on_server:
                if dict_key not in mcp_tools_by_server_and_auth:
                    mcp_tools_by_server_and_auth[dict_key] = []
                mcp_tools_by_server_and_auth[dict_key].append(tool_name_on_server)
                logger.info(f"Queued MCP tool '{tool_name_on_server}' from server '{server_url}' (Auth: {bool(auth_config_from_ui)}) for agent '{adk_agent_name}'.")
            else:
                logger.warn(f"Skipping MCP tool for agent '{adk_agent_name}' due to missing mcpServerUrl or mcpToolName: {tc}")
        elif tool_type == 'gofannon' or tool_type == 'custom_repo':
            try:
                tool_instance = instantiate_tool(tc)
                instantiated_tools.append(tool_instance)
                logger.info(f"Successfully instantiated tool '{tc.get('id', f'index_{tc_idx}')}' (type: {tool_type}) for agent '{adk_agent_name}'.")
            except ValueError as e:
                logger.warn(f"Skipping tool for agent '{adk_agent_name}' due to error: {e} (Tool config: {tc.get('id', f'index_{tc_idx}')}, Type: {tool_type})")
        else:
            logger.warn(f"Unknown or unhandled tool type '{tool_type}' for agent '{adk_agent_name}'. Tool config: {tc}")


            # After iterating all tool_configs, create MCPToolset instances using MCPToolset.from_server
    for (server_url, auth_key), tool_names_filter in mcp_tools_by_server_and_auth.items():
        try:
            auth_config_dict = dict(auth_key) if auth_key else None
            auth_scheme, auth_credential = _create_mcp_auth_objects(auth_config_dict)

            connection_params = None
            conn_type_log = ""
            if server_url.endswith("/sse"):
                connection_params = SseServerParams(url=server_url)
                conn_type_log = "SSE"
            else:
                connection_params = StreamableHTTPConnectionParams(url=server_url)
                conn_type_log = "StreamableHTTP"

            unique_tool_filter = list(set(tool_names_filter))
            logger.info(f"Attempting to create MCPToolset for '{server_url}' ({conn_type_log}) with tool filter: {unique_tool_filter} for agent '{adk_agent_name}'. Auth provided: {bool(auth_scheme)}")

            toolset = MCPToolset(
                connection_params=connection_params,
                tool_filter=unique_tool_filter,
                auth_scheme=auth_scheme,
                auth_credential=auth_credential,
                errlog= None
            )
            logger.info(f"toolset: {toolset}")
            mcp_toolset_instance = toolset

            instantiated_tools.append(mcp_toolset_instance)
            logger.info(f"Successfully created and added MCPToolset for server '{server_url}' to agent '{adk_agent_name}' with {len(unique_tool_filter)} tools filtered.")
        except Exception as e_mcp_toolset:
            logger.error(f"Failed to create MCPToolset for server '{server_url}' for agent '{adk_agent_name}': {type(e_mcp_toolset).__name__} - {e_mcp_toolset}")


    selected_provider_id = merged_agent_and_model_config.get("provider")
    base_model_name_from_config = merged_agent_and_model_config.get("modelString")
    user_api_base_override = merged_agent_and_model_config.get("litellm_api_base")
    user_api_key_override = merged_agent_and_model_config.get("litellm_api_key")

    if not selected_provider_id:
        logger.error(f"Missing 'provider' in model config for agent '{merged_agent_and_model_config.get('name', 'N/A')}' {context_for_log}.")
        raise ValueError("Model config is missing 'provider' field.")

    if not base_model_name_from_config:
        logger.warn(f"Missing 'modelString' for provider '{selected_provider_id}'. This may lead to errors.")

    provider_backend_config = BACKEND_LITELLM_PROVIDER_CONFIG.get(selected_provider_id)
    if not provider_backend_config:
        logger.error(f"Invalid 'provider': {selected_provider_id}. Cannot determine LiteLLM prefix or API key for agent '{adk_agent_name}'.")
        raise ValueError(f"Invalid provider ID: {selected_provider_id}")

    final_model_str_for_litellm = base_model_name_from_config
    if provider_backend_config["prefix"]:
        if selected_provider_id == "azure":
            if not base_model_name_from_config.startswith("azure/"): # LiteLLM expects "azure/your-deployment-name"
                final_model_str_for_litellm = f"azure/{base_model_name_from_config}"
        elif not base_model_name_from_config.startswith(provider_backend_config["prefix"] + "/"):
            final_model_str_for_litellm = f"{provider_backend_config['prefix']}/{base_model_name_from_config}"

    final_api_base = user_api_base_override
    final_api_key = user_api_key_override
    if not final_api_key and provider_backend_config["apiKeyEnv"]:
        final_api_key = os.getenv(provider_backend_config["apiKeyEnv"])
        if not final_api_key and provider_backend_config["apiKeyEnv"] not in ["AWS_ACCESS_KEY_ID", "WATSONX_APIKEY"]: # These have complex auth beyond just one key
            logger.warn(f"API key env var '{provider_backend_config['apiKeyEnv']}' for provider '{selected_provider_id}' not set, and no override provided. LiteLLM may fail if key is required by the provider or its default configuration.")

    if selected_provider_id == "azure":
        if not os.getenv("AZURE_API_BASE") and not final_api_base: # AZURE_API_BASE is critical for Azure
            logger.error("Azure provider selected, but AZURE_API_BASE is not set in environment and no API Base override provided. LiteLLM will likely fail.")
        if not os.getenv("AZURE_API_VERSION"): # AZURE_API_VERSION is also usually required
            logger.warn("Azure provider selected, but AZURE_API_VERSION is not set in environment. LiteLLM may require it.")

    if selected_provider_id == "watsonx":
        if not os.getenv("WATSONX_URL") and not final_api_base:
            logger.error("WatsonX provider: WATSONX_URL env var not set and not overridden by user. LiteLLM will likely fail.")
        if not os.getenv("WATSONX_PROJECT_ID") and not merged_agent_and_model_config.get("project_id"): # project_id can be in config or env
            logger.warn("WatsonX provider: WATSONX_PROJECT_ID env var not set and no project_id in agent_config. LiteLLM may require it.")


    logger.info(f"Configuring LiteLlm for agent '{adk_agent_name}' (Provider: {selected_provider_id}): "
                f"Model='{final_model_str_for_litellm}', API Base='{final_api_base or 'Default/Env'}', KeyIsSet={(not not final_api_key) or (selected_provider_id in ['bedrock', 'watsonx'])}")


    model_constructor_kwargs = {"model": final_model_str_for_litellm}
    if final_api_base:
        model_constructor_kwargs["api_base"] = final_api_base
    if final_api_key:
        model_constructor_kwargs["api_key"] = final_api_key

        # Specific handling for WatsonX project_id and space_id
    if selected_provider_id == "watsonx":
        project_id_for_watsonx = merged_agent_and_model_config.get("project_id") or os.getenv("WATSONX_PROJECT_ID")
        if project_id_for_watsonx:
            model_constructor_kwargs["project_id"] = project_id_for_watsonx
        else:
            # project_id is often required by LiteLLM for watsonx
            logger.warn(f"WatsonX project_id not found for agent {adk_agent_name}. This might be required by LiteLLM.")
            # space_id for watsonx deployments
        if base_model_name_from_config and base_model_name_from_config.startswith("deployment/"): # Heuristic for deployment models
            space_id_for_watsonx = merged_agent_and_model_config.get("space_id") or os.getenv("WATSONX_DEPLOYMENT_SPACE_ID")
            if space_id_for_watsonx:
                model_constructor_kwargs["space_id"] = space_id_for_watsonx
            else:
                logger.warn(f"WatsonX deployment model used for {adk_agent_name} but space_id not found. Deployment may fail or use default space.")


    actual_model_for_adk = LiteLlm(**model_constructor_kwargs)

    agent_kwargs = {
        "name": adk_agent_name,
        "description": merged_agent_and_model_config.get("description"),
        "model": actual_model_for_adk,
        "instruction": merged_agent_and_model_config.get("systemInstruction"),
        "tools": instantiated_tools,
        "output_key": merged_agent_and_model_config.get("outputKey"),
    }

    # --- Collect parameters for GenerateContentConfig ---
    model_params = merged_agent_and_model_config
    generate_config_kwargs = {}

    if "temperature" in model_params and model_params["temperature"] is not None:
        try: generate_config_kwargs["temperature"] = float(model_params["temperature"])
        except (ValueError, TypeError): logger.warn(f"Invalid temperature: {model_params['temperature']}")

    # NOTE: The ADK expects 'max_output_tokens' inside GenerateContentConfig, not 'max_tokens' as a direct kwarg.
    if "maxOutputTokens" in model_params and model_params["maxOutputTokens"] is not None:
        try: generate_config_kwargs["max_output_tokens"] = int(model_params["maxOutputTokens"])
        except (ValueError, TypeError): logger.warn(f"Invalid maxOutputTokens: {model_params['maxOutputTokens']}")

    if "topP" in model_params and model_params["topP"] is not None:
        try: generate_config_kwargs["top_p"] = float(model_params["topP"])
        except (ValueError, TypeError): logger.warn(f"Invalid topP: {model_params['topP']}")

    if "topK" in model_params and model_params["topK"] is not None:
        try: generate_config_kwargs["top_k"] = int(model_params["topK"])
        except (ValueError, TypeError): logger.warn(f"Invalid topK: {model_params['topK']}")

    if "stopSequences" in model_params and isinstance(model_params["stopSequences"], list):
        generate_config_kwargs["stop_sequences"] = [str(seq) for seq in model_params["stopSequences"]]
    if generate_config_kwargs:
        logger.info(f"Agent '{adk_agent_name}' has model generation parameters: {generate_config_kwargs}")
        agent_kwargs["generate_content_config"] = genai_types.GenerateContentConfig(**generate_config_kwargs)

    return {k: v for k, v in agent_kwargs.items() if v is not None}

def instantiate_tool(tool_config):
    logger.info(f"Attempting to instantiate Gofannon/Custom tool: {tool_config.get('id', 'N/A')}")
    if not isinstance(tool_config, dict):
        raise ValueError(f"Tool configuration must be a dictionary, got {type(tool_config)}")

    module_path = tool_config.get("module_path")
    class_name = tool_config.get("class_name")
    tool_type = tool_config.get("type")

    if not (tool_type == 'gofannon' or tool_type == 'custom_repo'):
        raise ValueError(f"instantiate_tool received unexpected tool type: {tool_type}. Expected 'gofannon' or 'custom_repo'.")

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

            # If the tool has an 'export_to_adk' method, call it.
            # This is a convention for Gofannon tools primarily.
            if hasattr(instance, 'export_to_adk') and callable(instance.export_to_adk):
                adk_tool_spec = instance.export_to_adk()
                tool_source_type = "Gofannon-compatible tool" if tool_type == 'gofannon' else "Custom Repository tool"
                logger.info(f"Successfully instantiated and exported {tool_source_type} '{tool_config.get('id', class_name)}' to ADK spec.")
                return adk_tool_spec
            else:
                # If no export_to_adk, assume it's already an ADK-compatible tool instance.
                logger.info(f"Successfully instantiated tool '{tool_config.get('id', class_name)}' (assumed ADK native or directly compatible).")
                return instance  # Return the instance directly
        except Exception as e:
            tool_id_for_log = tool_config.get('id', class_name or 'N/A')
            if isinstance(e, (ImportError, ModuleNotFoundError)):
                logger.error(f"Error instantiating tool '{tool_id_for_log}': Could not import module '{module_path}'. Ensure this module is available in the Cloud Function's Python environment. Error: {e}\n{traceback.format_exc()}")
            else:
                logger.error(f"Error instantiating tool '{tool_id_for_log}': {e}\n{traceback.format_exc()}")
            raise ValueError(f"Error instantiating tool {tool_id_for_log}: {e}")
    else:
        raise ValueError(f"Unsupported or incomplete tool configuration for Gofannon/Custom tool ID '{tool_config.get('id', 'N/A')}' (type: {tool_type}). Missing module_path/class_name.")


def sanitize_adk_agent_name(name_str: str, prefix_if_needed: str = "agent_") -> str:
    # ADK agent names should be valid Python identifiers.
    # Replace non-alphanumeric (excluding underscore) with underscore
    sanitized = re.sub(r'[^a-zA-Z0-9_]', '_', name_str)
    # Remove leading/trailing underscores that might result from replacement
    sanitized = sanitized.strip('_')
    # If starts with a digit, prepend an underscore (or prefix_if_needed if that's more robust)
    if sanitized and sanitized[0].isdigit():
        sanitized = f"_{sanitized}" # Python ids can start with _

    # If empty after sanitization or still doesn't start with letter/_ , use prefix
    if not sanitized or not (sanitized[0].isalpha() or sanitized[0] == '_'):
        # Fallback to a more generic construction if initial sanitization fails badly
        temp_name = re.sub(r'[^a-zA-Z0-9_]', '_', name_str) # Re-sanitize original
        sanitized = f"{prefix_if_needed.strip('_')}_{temp_name.strip('_')}"
        sanitized = re.sub(r'_+', '_', sanitized).strip('_') # Consolidate multiple underscores

    if not sanitized: # Ultimate fallback if all else fails
        sanitized = f"{prefix_if_needed.strip('_')}_default_agent_name"

        # Ensure it's a valid Python identifier (simple check, not exhaustive)
    # Python identifiers: ^[a-zA-Z_][a-zA-Z0-9_]*$
    # Max length (e.g. Vertex display names often have limits like 63)
    sanitized = sanitized[:63] # Apply a practical length limit

    if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", sanitized):
        # If it's *still* not valid (e.g., all underscores, or somehow bad), generate a safe name.
        logger.warn(f"Sanitized name '{sanitized}' from '{name_str}' is still not a valid Python identifier. Using a generic fallback.")
        generic_name = f"{prefix_if_needed.strip('_')}_{os.urandom(4).hex()}" # Random suffix for uniqueness
        return generic_name[:63] # Ensure length constraint

    return sanitized

async def instantiate_adk_agent_from_config(agent_config, parent_adk_name_for_context="root", child_index=0): # Made async
    original_agent_name = agent_config.get('name', f'agent_cfg_{child_index}')
    # Make ADK agent names more unique to avoid conflicts if multiple deployments happen
    # or if names are similar across different parts of a composite agent.
    unique_base_name_for_adk = f"{original_agent_name}_{parent_adk_name_for_context}_{os.urandom(2).hex()}"
    adk_agent_name = sanitize_adk_agent_name(unique_base_name_for_adk, prefix_if_needed=f"agent_{child_index}_")

    agent_type_str = agent_config.get("agentType")
    AgentClass = {
        "Agent": Agent, # This is LlmAgent
        "SequentialAgent": SequentialAgent,
        "LoopAgent": LoopAgent,
        "ParallelAgent": ParallelAgent
    }.get(agent_type_str)

    if not AgentClass:
        error_msg = f"Invalid agentType specified: '{agent_type_str}' for agent config: {original_agent_name}"
        logger.error(error_msg)
        raise ValueError(error_msg)

    logger.info(f"Instantiating ADK Agent: Name='{adk_agent_name}', Type='{AgentClass.__name__}', Original Config Name='{original_agent_name}' (Context: parent='{parent_adk_name_for_context}', index={child_index})")

    if AgentClass in [Agent, LoopAgent]:
        model_id = agent_config.get("modelId")
        if not model_id:
            raise ValueError(f"Agent '{original_agent_name}' is of type {agent_type_str} but is missing required 'modelId'.")

            # Fetch the model configuration from Firestore
        model_config = await get_model_config_from_firestore(model_id)

        # Merge agent-specific properties (like tools, outputKey) with the model's properties.
        # Agent properties take precedence.
        merged_config = {**model_config, **agent_config}

        if AgentClass == Agent:
            agent_kwargs = await _prepare_agent_kwargs_from_config(
                merged_config,
                adk_agent_name,
                context_for_log=f"(type: LlmAgent, parent: {parent_adk_name_for_context}, original: {original_agent_name})"
            )
            tool_count = len(agent_kwargs.get("tools", []))
            logger.info(f"Final kwargs for LlmAgent '{adk_agent_name}' includes {tool_count} tools")

            try:
                return Agent(**agent_kwargs)
            except Exception as e_agent_init:
                logger.error(f"Initialization Error for LlmAgent '{adk_agent_name}' (from config '{original_agent_name}'): {e_agent_init}")
                logger.error(f"Args passed: {agent_kwargs}") # Log the arguments that caused the error
                detailed_traceback = traceback.format_exc()
                logger.error(f"Traceback:\n{detailed_traceback}")
                raise ValueError(f"Failed to instantiate LlmAgent '{original_agent_name}': {e_agent_init}.")

        elif AgentClass == LoopAgent:
            looped_agent_config_name = f"{original_agent_name}_looped_child_config" # For logging
            looped_agent_adk_name = sanitize_adk_agent_name(f"{adk_agent_name}_looped_child_instance", prefix_if_needed="looped_")

            looped_agent_kwargs = await _prepare_agent_kwargs_from_config( # Await the async call
                merged_config, # Pass the merged config
                looped_agent_adk_name,
                context_for_log=f"(looped child of LoopAgent '{adk_agent_name}', original config: '{looped_agent_config_name}')"
            )
            logger.debug(f"Final kwargs for Looped Child ADK Agent '{looped_agent_adk_name}' (for LoopAgent '{adk_agent_name}'): {looped_agent_kwargs}")
            try:
                looped_child_agent_instance = Agent(**looped_agent_kwargs) # Agent is LlmAgent
            except Exception as e_loop_child_init:
                logger.error(f"Initialization Error for Looped Child Agent '{looped_agent_adk_name}' (from config '{looped_agent_config_name}'): {e_loop_child_init}")
                logger.error(f"Args passed to looped child Agent constructor: {looped_agent_kwargs}")
                detailed_traceback = traceback.format_exc()
                logger.error(f"Traceback:\n{detailed_traceback}")
                raise ValueError(f"Failed to instantiate looped child agent for '{original_agent_name}': {e_loop_child_init}.")

            max_loops_val_str = agent_config.get("maxLoops", "3") # Default to 3 loops
            try:
                max_loops_val = int(max_loops_val_str)
                if max_loops_val <= 0: # Max loops must be positive
                    logger.warning(f"MaxLoops for LoopAgent '{adk_agent_name}' is {max_loops_val}, which is not positive. Defaulting to 3.")
                    max_loops_val = 3
            except ValueError:
                logger.warning(f"Invalid MaxLoops value '{max_loops_val_str}' for LoopAgent '{adk_agent_name}'. Defaulting to 3.")
                max_loops_val = 3


            loop_agent_kwargs = {
                "name": adk_agent_name,
                "description": agent_config.get("description"),
                "agent": looped_child_agent_instance, # The LlmAgent to loop
                "max_loops": max_loops_val
                # Potentially other LoopAgent specific params like "stopping_condition" if supported/configured
            }
            logger.debug(f"Final kwargs for LoopAgent '{adk_agent_name}': {{name, description, max_loops, agent_name: {looped_child_agent_instance.name}}}")
            return LoopAgent(**loop_agent_kwargs)

    elif AgentClass == SequentialAgent or AgentClass == ParallelAgent:
        child_agent_configs = agent_config.get("childAgents", [])
        if not child_agent_configs:
            logger.info(f"{AgentClass.__name__} '{original_agent_name}' has no child agents configured.")
            instantiated_child_agents = []
        else:
            instantiated_child_agents = []
            for idx, child_config in enumerate(child_agent_configs):
                try:
                    child_agent_instance = await instantiate_adk_agent_from_config( # Await the recursive async call
                        child_config,
                        parent_adk_name_for_context=adk_agent_name, # Pass current agent's ADK name as context
                        child_index=idx
                    )
                    instantiated_child_agents.append(child_agent_instance)
                except Exception as e_child:
                    logger.error(f"Failed to instantiate child agent at index {idx} for {AgentClass.__name__} '{original_agent_name}': {e_child}")
                    # Potentially re-raise or handle to allow partial construction if desired
                    raise ValueError(f"Error processing child agent for '{original_agent_name}': {e_child}")

        orchestrator_kwargs = {
            "name": adk_agent_name,
            "description": agent_config.get("description"),
            "sub_agents": instantiated_child_agents
        }
        logger.debug(f"Final kwargs for {AgentClass.__name__} '{adk_agent_name}': {{name, description, num_sub_agents: {len(instantiated_child_agents)}}}")
        return AgentClass(**orchestrator_kwargs)

    else:
        # This case should be caught by the AgentClass check at the beginning
        raise ValueError(f"Unhandled agent type '{agent_type_str}' during recursive instantiation for '{original_agent_name}'.")


__all__ = [
    'generate_vertex_deployment_display_name',
    'instantiate_tool',
    'sanitize_adk_agent_name',
    'instantiate_adk_agent_from_config'
]
