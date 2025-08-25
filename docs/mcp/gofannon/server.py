import asyncio
import logging
import os

from fastmcp import FastMCP 

from gofannon.simpler_grants_gov.query_opportunities import QueryOpportunities
from gofannon.grant_query.grant_query import GrantsQueryTool

logger = logging.getLogger(__name__)
logging.basicConfig(format="[%(levelname)s]: %(message)s", level=logging.INFO)

mcp = FastMCP("MCP Server on Cloud Run")

QueryOpportunities().export_to_mcp(mcp)
GrantsQueryTool().export_to_mcp(mcp)

if __name__ == "__main__":
    logger.info(f" MCP server started on port {os.getenv('PORT', 8080)}")
    # Could also use 'sse' transport, host="0.0.0.0" required for Cloud Run.
    asyncio.run(
        mcp.run_async(
            transport="streamable-http", 
            host="0.0.0.0", 
            port=os.getenv("PORT", 8080),
        )
    )