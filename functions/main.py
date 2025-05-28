# Welcome to Cloud Functions for Firebase for Python!
# To get started, simply uncomment the below code or create your own.
# Deploy with `firebase deploy`

from firebase_functions import https_fn
from firebase_admin import initialize_app

from firebase_functions import https_fn, options
from common.utils import handle_exceptions_and_log

# Import the logic functions from their respective handlers
from handlers.vertex_agent_handler import (
    _deploy_agent_to_vertex_logic,
    _delete_vertex_agent_logic,
    _query_deployed_agent_logic,
    _check_vertex_agent_deployment_status_logic
)
from handlers.gofannon_handler import _get_gofannon_tool_manifest_logic

# --- Cloud Function Definitions ---  

@https_fn.on_call(memory=options.MemoryOption.MB_512) # Default memory and timeout unless overridden
@handle_exceptions_and_log # Apply the decorator to the Firebase Function wrapper  
def get_gofannon_tool_manifest(req: https_fn.CallableRequest):
    """  
    Callable Function to fetch and cache the Gofannon tool manifest.  
    """
    # The actual logic is now in _get_gofannon_tool_manifest_logic  
    # The decorator handles auth checks defined in the logic, logging, and error wrapping.  
    return _get_gofannon_tool_manifest_logic(req)


@https_fn.on_call(memory=options.MemoryOption.GB_1, timeout_sec=540) # Increased resources for deployment  
@handle_exceptions_and_log
def deploy_agent_to_vertex(req: https_fn.CallableRequest):
    """  
    Callable Function to deploy an agent configuration to Vertex AI.  
    """
    # req.auth is automatically checked by on_call for authenticated users.  
    # If req.auth is None, an UNAUTHENTICATED error is raised by default unless  
    # allow_unauthenticated is True for on_request, or handled in logic.  
    # For on_call, if req.auth is None, it means the call was not authenticated.  
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required to deploy agents.")
    return _deploy_agent_to_vertex_logic(req)


@https_fn.on_call(memory=options.MemoryOption.MB_512) # Default resources
@handle_exceptions_and_log
def delete_vertex_agent(req: https_fn.CallableRequest):
    """  
    Callable Function to delete an agent's deployment from Vertex AI.  
    """
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required to delete agent deployments.")
    return _delete_vertex_agent_logic(req)


@https_fn.on_call(memory=options.MemoryOption.GB_2, timeout_sec=180, cpu=1) # Moderate resources for querying
@handle_exceptions_and_log
def query_deployed_agent(req: https_fn.CallableRequest):
    """  
    Callable Function to query a deployed Vertex AI agent.  
    """
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required to query agents.")
    return _query_deployed_agent_logic(req)


@https_fn.on_call(memory=options.MemoryOption.MB_512) # Usually a quick operation  
@handle_exceptions_and_log
def check_vertex_agent_deployment_status(req: https_fn.CallableRequest):
    """  
    Callable Function to check the deployment status of a Vertex AI agent.  
    """
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required to check agent status.")
    return _check_vertex_agent_deployment_status_logic(req)

# To make these functions discoverable by Firebase CLI, ensure they are top-level  
# and match the names you'd deploy (e.g., firebase deploy --only functions:get_gofannon_tool_manifest)  
# The Python function name here becomes the Firebase Function name.  
