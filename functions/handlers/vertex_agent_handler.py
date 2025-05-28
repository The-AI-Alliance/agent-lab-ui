# functions/handlers/vertex_agent_handler.py

# Import the logic functions from their new locations
from handlers.vertex.deployment_logic import _deploy_agent_to_vertex_logic
from handlers.vertex.query_logic import _query_deployed_agent_logic
from handlers.vertex.management_logic import _delete_vertex_agent_logic, _check_vertex_agent_deployment_status_logic

# Re-export them to maintain the public interface for main.py
__all__ = [
    '_deploy_agent_to_vertex_logic',
    '_delete_vertex_agent_logic',
    '_query_deployed_agent_logic',
    '_check_vertex_agent_deployment_status_logic'
]  