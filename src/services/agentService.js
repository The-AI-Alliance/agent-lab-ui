// src/services/agentService.js
import { createCallable } from '../firebaseConfig';

const getGofannonToolManifestCallable = createCallable('get_gofannon_tool_manifest');
const deployAgentToVertexCallable = createCallable('deploy_agent_to_vertex');
const executeQueryCallable = createCallable('executeQuery'); // Renamed
const deleteVertexAgentCallable = createCallable('delete_vertex_agent');
const checkVertexAgentDeploymentStatusCallable = createCallable('check_vertex_agent_deployment_status');
const listMcpServerToolsCallable = createCallable('list_mcp_server_tools');
const fetchA2AAgentCardCallable = createCallable('fetchA2AAgentCard');

export const fetchGofannonTools = async () => {
    try {
        const result = await getGofannonToolManifestCallable();
        if (result.data && result.data.success && Array.isArray(result.data.manifest)) {
            return { success: true, manifest: result.data.manifest };
        } else if (result.data && result.data.success) {
            console.error("Gofannon manifest received, but 'manifest' is not an array:", result.data.manifest);
            return { success: false, message: "Manifest format error: Expected an array of tools in the 'manifest' field." };
        }
        const errorMessage = result.data?.message || "Failed to fetch Gofannon tools due to an unknown error structure.";
        console.error("Error fetching Gofannon tools from callable:", result.data);
        return { success: false, message: errorMessage };

    } catch (error) {
        console.error("Error calling Gofannon tools callable function:", error);
        const message = error.message || "An unexpected error occurred while fetching Gofannon tools.";
        return { success: false, message: message };
    }
};

export const listMcpServerTools = async (serverUrl, auth) => {
    try {
        const result = await listMcpServerToolsCallable({ serverUrl, auth });
        if (result.data && result.data.success && Array.isArray(result.data.tools)) {
            return { success: true, tools: result.data.tools, serverUrl: result.data.serverUrl };
        }
        const errorMessage = result.data?.message || "Failed to list tools from MCP server.";
        console.error("Error listing MCP server tools:", result.data);
        if (result.data?.code === 'permission-denied') {
            return { success: false, message: `Authentication failed for ${serverUrl}. Please check your credentials.` };
        }
        return { success: false, message: errorMessage, serverUrl: serverUrl };
    } catch (error) {
        console.error("Error calling listMcpServerTools callable:", error);
        const message = error.details?.message || error.message || "An unexpected error occurred while listing MCP server tools.";
        if (error.code === 'permission-denied') {
            return { success: false, message: `Authentication failed for ${serverUrl}. Please check your credentials.` };
        }
        return { success: false, message: message, serverUrl: serverUrl };
    }
};

export const fetchA2AAgentCard = async (endpointUrl) => {
    try {
       const result = await fetchA2AAgentCardCallable({ endpointUrl });
        return result.data; // Expected: { success: true, agentCard: { ... } } or { success: false, message: string }
    } catch (error) {
        console.error("Error calling fetchA2AAgentCard callable:", error);
        throw error; // Re-throw to be caught by UI
    }
};


export const deployAgent = async (agentConfig, agentDocId) => {
    try {
        const result = await deployAgentToVertexCallable({ agentConfig, agentDocId });
        return result.data;
    } catch (error) {
        console.error("Error deploying agent (raw):", error);
        if (error.code === 'deadline-exceeded' ||
            (error.message && error.message.toLowerCase().includes('deadline exceeded')) ||
            (error.details && typeof error.details === 'string' && error.details.toLowerCase().includes('deadline exceeded'))) {
            console.warn("Deployment call timed out. The process may still be running in the backend.");
            return {
                success: false,
                wasTimeout: true,
                message: "Deployment initiated, but the confirmation timed out. Please check status. The agent might still be deploying in the background."
            };
        }
        throw error;
    }
};

// This function now handles querying agents OR models
export const executeQuery = async ({ agentId, modelId, message, adkUserId, chatId, parentMessageId, stuffedContextItems }) => {
    try {
        const payload = {
            agentId, // Can be null
            modelId, // Can be null
            message,
            adkUserId,
            chatId,
            parentMessageId,
            stuffedContextItems
        };
        // This cloud function now returns the new messageId immediately
        const result = await executeQueryCallable(payload);
        return result.data;
    } catch (error) {
        console.error("Error executing query:", error);
        throw error;
    }
};

export const deleteAgentDeployment = async (resourceName, agentDocId) => {
    try {
        const result = await deleteVertexAgentCallable({ resourceName, agentDocId });
        return result.data;
    } catch (error) {
        console.error("Error deleting agent deployment:", error);
        throw error;
    }
};

export const checkAgentDeploymentStatus = async (agentDocId) => {
    try {
        const result = await checkVertexAgentDeploymentStatusCallable({ agentDocId });
        return result.data;
    } catch (error) {
        console.error("Error checking agent deployment status:", error);
        throw error;
    }
};  