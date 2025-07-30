# functions/handlers/mcp_handler.py
import asyncio
import traceback

import httpx # Import for specific httpx exceptions
from firebase_functions import https_fn

from mcp.client.session import ClientSession
from mcp.client.sse import sse_client
from mcp.client.streamable_http import streamablehttp_client
from mcp.shared.metadata_utils import get_display_name
from common.core import logger


async def _list_mcp_server_tools_logic_async(req: https_fn.CallableRequest):
    if not req.auth:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Authentication required to list MCP server tools."
        )

    server_url = req.data.get("serverUrl")
    auth_config = req.data.get("auth") # New: Get auth config

    if not server_url or not isinstance(server_url, str):
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="'serverUrl' is required and must be a string."
        )

    logger.info(f"Attempting to list tools from MCP server: {server_url}")

    # --- New: Construct headers from auth_config ---
    headers = {}
    if auth_config and isinstance(auth_config, dict):
        auth_type = auth_config.get("type")
        if auth_type == "bearer" and auth_config.get("token"):
            headers["Authorization"] = f"Bearer {auth_config['token']}"
            logger.info(f"Using Bearer Token authentication for {server_url}.")
        elif auth_type == "apiKey" and auth_config.get("key") and auth_config.get("name"):
            headers[auth_config["name"]] = auth_config["key"]
            logger.info(f"Using API Key authentication for {server_url} (Header: {auth_config['name']}).")

    client_kwargs = {"headers": headers} if headers else {}

    if server_url.endswith("/sse"):
        client_context_manager = sse_client(url=server_url, **client_kwargs)
        transport_description = "SSE"
    else:
        client_context_manager = streamablehttp_client(url=server_url, **client_kwargs)
        transport_description = "StreamableHTTP"

    logger.info(f"Attempting to connect to MCP server at {server_url} using {transport_description} client.")

    try:
        async with client_context_manager as client_streams_tuple:
            if transport_description == "SSE":
                read_stream, write_stream = client_streams_tuple
            else:  # StreamableHTTP
                read_stream, write_stream, _get_session_id = client_streams_tuple

            logger.info(f"Connection established via {transport_description} client.")
            async with ClientSession(read_stream, write_stream) as mcp_client:
                logger.info("Client session established with MCP server.")
                await mcp_client.initialize()

                mcp_server_tools = await mcp_client.list_tools()
                logger.info(f"Retrieved {len(mcp_server_tools.tools)} tools from MCP server: {server_url}")

                tools_for_client = []
                for tool_obj in mcp_server_tools.tools: # tool_obj is of type mcp.types.Tool
                    tools_for_client.append({
                        "name": tool_obj.name,
                        "description": tool_obj.description,
                        "title": get_display_name(tool_obj), # Use get_display_name here
                        "input_schema": tool_obj.inputSchema
                    })
                logger.info(f"Successfully listed {len(tools_for_client)} tools from MCP server: {server_url}")
                return {"success": True, "tools": tools_for_client, "serverUrl": server_url}

    except httpx.HTTPStatusError as e: # Specific error for HTTP status issues (4xx, 5xx)
        logger.error(f"HTTP error {e.response.status_code} while communicating with MCP server at {server_url}: {e.response.text[:200]}")
        # Map HTTP status codes to Firebase error codes more granularly if needed
        firebase_error_code = https_fn.FunctionsErrorCode.UNAVAILABLE
        if e.response.status_code == 401 or e.response.status_code == 403:
            firebase_error_code = https_fn.FunctionsErrorCode.PERMISSION_DENIED
            msg = f"Authentication failed for MCP server at {server_url}. Please check your credentials."
        elif 400 <= e.response.status_code < 500:
            firebase_error_code = https_fn.FunctionsErrorCode.INVALID_ARGUMENT # Or FAILED_PRECONDITION, etc.
            msg = f"MCP server at {server_url} returned client error {e.response.status_code}."
        elif 500 <= e.response.status_code < 600:
            firebase_error_code = https_fn.FunctionsErrorCode.INTERNAL
            msg = f"MCP server at {server_url} returned server error {e.response.status_code}."

        raise https_fn.HttpsError(code=firebase_error_code, message=msg)
    except httpx.RequestError as e: # General httpx network errors (ConnectTimeout, ReadTimeout, etc.)
        logger.error(f"Network error while communicating with MCP server at {server_url}: {type(e).__name__} - {e}")
        if isinstance(e, httpx.ConnectTimeout):
            code = https_fn.FunctionsErrorCode.DEADLINE_EXCEEDED
            msg = f"Connection to MCP server at {server_url} timed out."
        elif isinstance(e, httpx.ReadTimeout):
            code = https_fn.FunctionsErrorCode.DEADLINE_EXCEEDED
            msg = f"Reading from MCP server at {server_url} timed out."
        elif isinstance(e, httpx.ConnectError): # More specific than ConnectionRefusedError for httpx
            code = https_fn.FunctionsErrorCode.UNAVAILABLE
            msg = f"Could not connect to MCP server at {server_url}. Server might be down or URL incorrect."
        else:
            code = https_fn.FunctionsErrorCode.UNAVAILABLE
            msg = f"Network error connecting to MCP server at {server_url}."
        raise https_fn.HttpsError(code=code, message=msg)
        # ConnectionRefusedError might be caught by httpx.ConnectError above if httpx is used internally.
    # Keeping it for now as a fallback or if other libraries raise it.
    except ConnectionRefusedError:
        logger.error(f"Connection refused by MCP server at {server_url}.")
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAVAILABLE,
            message=f"Could not connect to MCP server at {server_url}. Server might be down or URL incorrect."
        )
        # The generic asyncio.TimeoutError might be less common now with specific httpx timeouts.
    # It's kept as a fallback.
    except asyncio.TimeoutError:
        logger.error(f"A general timeout occurred while communicating with MCP server at {server_url}.")
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.DEADLINE_EXCEEDED,
            message=f"An operation with MCP server at {server_url} timed out."
        )
    except Exception as e:
        logger.error(f"Error listing tools from MCP server {server_url}: {e}\n{traceback.format_exc()}", exc_info=True)
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=f"An unexpected error occurred while listing tools from MCP server: {str(e)[:200]}"
        )

def _list_mcp_server_tools_logic(req: https_fn.CallableRequest):
    return asyncio.run(_list_mcp_server_tools_logic_async(req))


__all__ = ['_list_mcp_server_tools_logic', '_list_mcp_server_tools_logic_async']  