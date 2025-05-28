// src/services/agentService.js
import { createCallable } from '../firebaseConfig';

const getGofannonToolManifestCallable = createCallable('get_gofannon_tool_manifest');
const deployAgentToVertexCallable = createCallable('deploy_agent_to_vertex');
const queryDeployedAgentCallable = createCallable('query_deployed_agent');
const deleteVertexAgentCallable = createCallable('delete_vertex_agent');
const checkVertexAgentDeploymentStatusCallable = createCallable('check_vertex_agent_deployment_status');


export const fetchGofannonTools = async () => {
    try {
        const result = await getGofannonToolManifestCallable();
        // The backend function _get_gofannon_tool_manifest_logic now returns
        // { success: true, manifest: tools_array_from_manifest }
        // where tools_array_from_manifest is manifest_root_object["tools"]
        if (result.data && result.data.success && Array.isArray(result.data.manifest)) {
            return { success: true, manifest: result.data.manifest };
        } else if (result.data && result.data.success) {
            // This case should ideally not be hit if backend is correct, but good for robustness
            console.error("Gofannon manifest received, but 'manifest' is not an array:", result.data.manifest);
            return { success: false, message: "Manifest format error: Expected an array of tools in the 'manifest' field." };
        }
        // Handle cases where result.data.success is false or result.data structure is unexpected
        const errorMessage = result.data?.message || "Failed to fetch Gofannon tools due to an unknown error structure.";
        console.error("Error fetching Gofannon tools from callable:", result.data);
        return { success: false, message: errorMessage };

    } catch (error) { // Catch errors from the callable function itself (e.g., network error, Firebase internal error)
        console.error("Error calling Gofannon tools callable function:", error);
        const message = error.message || "An unexpected error occurred while fetching Gofannon tools.";
        return { success: false, message: message };
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

export const queryAgent = async (resourceName, message, userId, sessionId, agentDocId) => {
    try {
        const result = await queryDeployedAgentCallable({
            resourceName,
            message,
            adkUserId: userId,
            sessionId,
            agentDocId
        });
        return result.data;
    } catch (error) {
        console.error("Error querying agent:", error);
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