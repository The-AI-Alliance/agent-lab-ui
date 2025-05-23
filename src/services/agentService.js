// src/services/agentService.js
import { createCallable } from '../firebaseConfig';

const getGofannonToolManifestCallable = createCallable('get_gofannon_tool_manifest');
const deployAgentToVertexCallable = createCallable('deploy_agent_to_vertex');
const queryDeployedAgentCallable = createCallable('query_deployed_agent');
const deleteVertexAgentCallable = createCallable('delete_vertex_agent');
const checkVertexAgentDeploymentStatusCallable = createCallable('check_vertex_agent_deployment_status'); // New


export const fetchGofannonTools = async () => {
    try {
        const result = await getGofannonToolManifestCallable();
        return result.data; // { success: true, manifest: {...} }
    } catch (error) {
        console.error("Error fetching Gofannon tools:", error);
        throw error;
    }
};

export const deployAgent = async (agentConfig, agentDocId) => {
    try {
        // agentConfig is the object matching Firestore structure for an agent
        const result = await deployAgentToVertexCallable({ agentConfig, agentDocId });
        return result.data; // { success: true, resourceName: "..." } if completes quickly
    } catch (error) {
        console.error("Error deploying agent (raw):", error);
        // Firebase Functions can wrap errors. Check for specific codes or messages indicating timeout.
        // 'deadline-exceeded' is a common gRPC code that Firebase might surface.
        if (error.code === 'deadline-exceeded' ||
            (error.message && error.message.toLowerCase().includes('deadline exceeded')) ||
            (error.details && typeof error.details === 'string' && error.details.toLowerCase().includes('deadline exceeded'))) {
            // Return a specific structure to be handled by UI for timeout scenarios
            console.warn("Deployment call timed out. The process may still be running in the backend.");
            return {
                success: false, // Indicate the callable itself didn't "succeed" in confirming
                wasTimeout: true,
                message: "Deployment initiated, but the confirmation timed out. Please check status. The agent might still be deploying in the background."
            };
        }
        // For other errors, re-throw them to be handled as standard errors.
        throw error;
    }
};

export const queryAgent = async (resourceName, message, userId, sessionId, agentDocId) => {
    try {
        // The 'userId' parameter here actually holds the ADK User ID from the component.
        // The key in the payload to the Cloud Function must be 'adkUserId'.
        const result = await queryDeployedAgentCallable({
            resourceName,
            message,
            adkUserId: userId, // Corrected: key is 'adkUserId', value is from the 'userId' parameter
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
        return result.data; // { success: true, message: "..." }
    } catch (error) {
        console.error("Error deleting agent deployment:", error);
        throw error;
    }
};

export const checkAgentDeploymentStatus = async (agentDocId) => {
    try {
        const result = await checkVertexAgentDeploymentStatusCallable({ agentDocId });
        // Expected backend response: { success: true, status: "...", resourceName: "...", vertexState: "..." }
        // or { success: true, status: "...", message: "Engine not found..." }
        return result.data;
    } catch (error) {
        console.error("Error checking agent deployment status:", error);
        throw error; // Let the UI component handle this error (e.g., show an error message)
    }
};  