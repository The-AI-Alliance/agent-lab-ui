# functions/main.py
# main.py - Entry point for Firebase Functions

from firebase_functions import https_fn, options, tasks_fn
from firebase_functions.options import RateLimits, RetryConfig

from common.utils import handle_exceptions_and_log
import asyncio

# Import the logic functions from their respective handlers
from handlers.vertex_agent_handler import (
    _deploy_agent_to_vertex_logic,
    _delete_vertex_agent_logic,
    query_deployed_agent_orchestrator_logic as _execute_query_logic,
    _check_vertex_agent_deployment_status_logic
)
from handlers.vertex.task import run_agent_task_wrapper
from handlers.gofannon_handler import _get_gofannon_tool_manifest_logic
from handlers.context_handler import (
    _fetch_web_page_content_logic_async,
    _fetch_git_repo_contents_logic_async,
    _process_pdf_content_logic_async,
    _upload_image_and_get_uri_logic
)
from handlers.mcp_handler import _list_mcp_server_tools_logic_async
from handlers.a2a_handler import _fetch_a2a_agent_card_logic_async

# --- Cloud Function Definitions ---

@https_fn.on_call(memory=options.MemoryOption.GB_1)
@handle_exceptions_and_log
def get_gofannon_tool_manifest(req: https_fn.CallableRequest):
    return _get_gofannon_tool_manifest_logic(req)


@https_fn.on_call(memory=options.MemoryOption.GB_1, timeout_sec=540)
@handle_exceptions_and_log
def deploy_agent_to_vertex(req: https_fn.CallableRequest):
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required to deploy agents.")
    return _deploy_agent_to_vertex_logic(req)


@https_fn.on_call(memory=options.MemoryOption.GB_1)
@handle_exceptions_and_log
def delete_vertex_agent(req: https_fn.CallableRequest):
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required to delete agent deployments.")
    return _delete_vertex_agent_logic(req)


@https_fn.on_call(memory=options.MemoryOption.GB_1, timeout_sec=180) # This is now a fast dispatcher
@handle_exceptions_and_log
def executeQuery(req: https_fn.CallableRequest): # Renamed from query_deployed_agent
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required to query.")
    return _execute_query_logic(req)


@https_fn.on_call(memory=options.MemoryOption.GB_1)
@handle_exceptions_and_log
def check_vertex_agent_deployment_status(req: https_fn.CallableRequest):
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required to check agent status.")
    return _check_vertex_agent_deployment_status_logic(req)

@https_fn.on_call(memory=options.MemoryOption.GB_1, timeout_sec=60)
@handle_exceptions_and_log
def fetch_web_page_content(req: https_fn.CallableRequest):
    return _fetch_web_page_content_logic_async(req)

@https_fn.on_call(memory=options.MemoryOption.GB_1, timeout_sec=300)
@handle_exceptions_and_log
def fetch_git_repo_contents(req: https_fn.CallableRequest):
    return _fetch_git_repo_contents_logic_async(req)

@https_fn.on_call(memory=options.MemoryOption.GB_1, timeout_sec=120)
@handle_exceptions_and_log
def process_pdf_content(req: https_fn.CallableRequest):
    return _process_pdf_content_logic_async(req)

@https_fn.on_call(memory=options.MemoryOption.GB_1, timeout_sec=120)
@handle_exceptions_and_log
def uploadImageForContext(req: https_fn.CallableRequest):
    # This now returns an object with a 'type' key to be consistent
    return _upload_image_and_get_uri_logic(req)

@https_fn.on_call(memory=options.MemoryOption.GB_1, timeout_sec=120)
@handle_exceptions_and_log
def list_mcp_server_tools(req: https_fn.CallableRequest):
    return asyncio.run(_list_mcp_server_tools_logic_async(req))

@https_fn.on_call(memory=options.MemoryOption.GB_1, timeout_sec=60)
@handle_exceptions_and_log
def fetchA2AAgentCard(req: https_fn.CallableRequest):
    return asyncio.run(_fetch_a2a_agent_card_logic_async(req))

# Task handler for executing queries in the background
@tasks_fn.on_task_dispatched(
    rate_limits=RateLimits(max_concurrent_dispatches=10),
    retry_config=RetryConfig(max_attempts=3, min_backoff_seconds=10),
    timeout_sec=540,
    memory=options.MemoryOption.GB_2,
    cpu=1
)
def executeAgentRunTask(req: tasks_fn.CallableRequest):
    """Background worker function triggered by Cloud Tasks."""
    run_agent_task_wrapper(req.data)
