# functions/handlers/a2a_handler.py
import httpx
from firebase_functions import https_fn
from common.core import logger
import traceback
from urllib.parse import urljoin

async def _fetch_a2a_agent_card_logic_async(req: https_fn.CallableRequest):
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required.")

    endpoint_url = req.data.get("endpointUrl")
    if not endpoint_url:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="endpointUrl is required.")

    # A2A spec requires fetching the AgentCard from a well-known path relative to the base URL.
    agent_card_url = urljoin(endpoint_url, "/.well-known/agent.json")

    logger.info(f"[A2AHandler] Fetching AgentCard from well-known URL: {agent_card_url}")

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # According to the A2A spec, the AgentCard is at a standardized well-known path.
            response = await client.get(agent_card_url)
            response.raise_for_status() # Raise an exception for 4xx/5xx status codes
            agent_card_data = response.json()

            # Basic validation of the agent card structure
            required_keys = ["name", "description", "url", "version", "defaultInputModes", "defaultOutputModes", "capabilities"]
            if not all(key in agent_card_data for key in required_keys):
                logger.error(f"[A2AHandler] Fetched AgentCard from {agent_card_url} is missing required keys. Data: {agent_card_data}")
                raise https_fn.HttpsError(
                    code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
                    message="The provided URL did not return a valid A2A AgentCard. It is missing required fields."
                )

            logger.info(f"[A2AHandler] Successfully fetched AgentCard for '{agent_card_data.get('name')}' from {agent_card_url}")
            return {"success": True, "agentCard": agent_card_data}

    except httpx.HTTPStatusError as e:
        logger.error(f"[A2AHandler] HTTP error when fetching AgentCard from {agent_card_url}: {e.response.status_code} - {e.response.text[:200]}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAVAILABLE, message=f"Failed to fetch from the agent's well-known URL (HTTP {e.response.status_code}). Please check the URL and ensure the agent is running and publicly accessible.")
    except httpx.RequestError as e:
        logger.error(f"[A2AHandler] Network error when fetching AgentCard from {agent_card_url}: {e}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAVAILABLE, message=f"A network error occurred while trying to reach the agent's well-known URL: {e.__class__.__name__}. Please check the URL and your network connection.")
    except Exception as e:
        logger.error(f"[A2AHandler] Unexpected error fetching AgentCard from {agent_card_url}: {e}\n{traceback.format_exc()}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message="An unexpected error occurred while fetching the agent card.")

__all__ = ['_fetch_a2a_agent_card_logic_async']