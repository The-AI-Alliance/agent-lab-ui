# Document: `agents/{agentId}`

This document represents the complete definition of an agent, including its architecture (single, sequential, etc.), tools, system instructions, and its deployment state. It is the central configuration object for any agent in the system.

## Fields

| Field                         | Type                  | Description                                                                                                   | Set By                                                              | Read By                                                                                                                              |    
| ----------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |    
| `name`                        | String                | A user-friendly display name for the agent.                                                                   | Client/UI (`AgentForm`)                                               | `_deploy_agent_to_vertex_logic`, `_check_vertex_agent_deployment_status_logic`, Client/UI (`AgentListItem`, `AgentDetailsPage`)       |    
| `description`                 | String                | A brief description of the agent's purpose.                                                                   | Client/UI (`AgentForm`)                                               | `_deploy_agent_to_vertex_logic`, Client/UI (`AgentListItem`, `AgentDetailsDisplay`)                                                  |    
| `projectIds`                  | Array of Strings      | An array of project IDs this agent is associated with.                                                        | Client/UI (`AgentForm`)                                               | `getAgentsForProjects`, `ModelSelector` (to filter available models)                                                                   |    
| `isPublic`                    | Boolean               | If `true`, this agent is visible to all users (read-only for non-owners).                                     | Client/UI (`AgentsPage` via `updateAgentInFirestore`)                   | `getPublicAgents`                                                                                                                    |    
| `platform`                    | String                | The execution platform, e.g., `google_vertex` or `a2a`.                                                       | Client/UI (`CreateAgentPage`, `ImportA2AAgentPage`)                   | `_execute_and_stream_to_firestore`, Client/UI (`AgentDetailsPage`, `AgentListItem`)                                                  |    
| `agentType`                   | String                | The ADK agent class: `Agent`, `SequentialAgent`, `LoopAgent`, `ParallelAgent`, or `A2AAgent`.               | Client/UI (`AgentForm`)                                               | `instantiate_adk_agent_from_config`, Client/UI (`AgentListItem`)                                                                     |    
| `modelId`                     | String                | (For `Agent`, `LoopAgent`) A reference to a document in the `/models` collection.                             | Client/UI (`AgentForm`)                                               | `instantiate_adk_agent_from_config`, `getAgentDetails` (to fetch model)                                                                |    
| `outputKey`                   | String                | (Optional) If set, the agent's final text response is saved to this key in the session state.                 | Client/UI (`AgentForm`)                                               | `_prepare_agent_kwargs_from_config`                                                                                                  |    
| `tools`                       | Array of Maps         | A list of tool configurations (`mcp`, `gofannon`, `custom_repo`).                                             | Client/UI (`ToolSelector` within `AgentForm`)                           | `_prepare_agent_kwargs_from_config`                                                                                                  |    
| `childAgents`                 | Array of Maps         | (For `SequentialAgent`, `ParallelAgent`) Nested agent definitions.                                            | Client/UI (`ChildAgentFormDialog` within `AgentForm`)                 | `instantiate_adk_agent_from_config`                                                                                                  |    
| `maxLoops`                    | Number                | (For `LoopAgent`) The maximum number of iterations for the loop.                                              | Client/UI (`AgentForm`)                                               | `instantiate_adk_agent_from_config`                                                                                                  |    
| `usedCustomRepoUrls`          | Array of Strings      | (For `custom_repo` tools) URLs for pip-installable Git repositories.                                          | Client/UI (`ToolSelector` within `AgentForm`)                           | `_deploy_agent_to_vertex_logic`                                                                                                      |    
| `usedMcpServerUrls`           | Array of Strings      | (For `mcp` tools) URLs of the MCP servers providing the tools.                                                | Client/UI (`ToolSelector` within `AgentForm`)                           | `_deploy_agent_to_vertex_logic`                                                                                                      |    
| `deploymentStatus`            | String                | State of the Vertex AI deployment (e.g., `deploying_initiated`, `deployed`, `error`, `not_deployed`).          | `_deploy_...`, `_delete_...`, `_check_...` (in `admin/__init__.py`) | `_execute_and_stream_to_firestore`, `_check_...`, Client/UI (`AgentListItem`, `DeploymentControls`)                                  |    
| `vertexAiResourceName`        | String                | The full Google Cloud resource name of the deployed agent (e.g., `projects/.../reasoningEngines/...`).        | `_deploy_...`, `_check_...`                                         | `_delete_...`, `_check_...`, `_execute_...`, Client/UI (`DeploymentControls`)                                                          |    
| `deploymentError`             | String                | If `deploymentStatus` is `error`, this field contains the error message.                                      | `_deploy_...`, `_delete_...`, `_check_...`                                         | Client/UI (`DeploymentControls`)                                                                                                     |    
| `lastDeploymentAttemptAt`     | Timestamp             | Timestamp of when the last deployment was started.                                                            | `_deploy_agent_to_vertex_logic`                                     | Client/UI (`DeploymentControls`)                                                                                                     |    
| `lastDeployedAt`              | Timestamp             | Timestamp of when the agent was last successfully deployed or its status changed.                             | `_deploy_...`, `_check_...`                                         | Client/UI (`DeploymentControls`)                                                                                                     |    
| `agentCard`                   | Map                   | (For `a2a` platform) The cached AgentCard JSON from the remote agent.                                         | Client/UI (`ImportA2AAgentPage`)                                        | `_run_a2a_agent`, Client/UI (`AgentDetailsPage`)                                                                                     |    
| `endpointUrl`                 | String                | (For `a2a` platform) The URL of the remote A2A-compliant agent.                                               | Client/UI (`ImportA2AAgentPage`)                                        | `_run_a2a_agent`, Client/UI (`AgentDetailsPage`)                                                                                     |    
| `ownerId` / `userId`          | String                | The UID of the user who owns this agent configuration.                                                        | `createAgentInFirestore`                                            | `getAgentDetails`, `getMyAgents`                                                                                                     |    
| `createdAt` / `updatedAt`     | Timestamp             | Timestamps for document creation and last modification.                                                       | `createAgentInFirestore`, `updateAgentInFirestore`                    | _(For client display)_                                                                                                              |    

## Prototypical Example (Un-deployed Vertex Agent)

```json  
{  
"name": "Customer Support Bot",  
"description": "Answers questions about orders using the order lookup tool.",  
"agentType": "Agent",  
"modelId": "abc123def456",  
"projectIds": ["proj_xyz"],  
"isPublic": false,  
"platform": "google_vertex",  
"outputKey": "customer_response",  
"systemInstruction": "You are a helpful assistant. Use the tools provided to answer questions.",  
"tools": [  
{  
"type": "gofannon",  
"id": "gofannon-tool-id-123",  
"name": "OrderLookup",  
"module_path": "gofannon_tools.order_lookup",  
"class_name": "OrderLookupTool"  
}  
],  
"userId": "user-uid-abc-123",  
"deploymentStatus": "not_deployed",  
"vertexAiResourceName": null,  
"createdAt": "2024-05-21T09:00:00Z",  
"updatedAt": "2024-05-21T09:00:00Z"  
}  
```

## Inconsistencies and Notes
*   The document serves a dual purpose: it's both the "source code" configuration for an agent and the live "status record" of its deployment. This is efficient but means that modifying the configuration fields (like `tools` or `systemInstruction`) after a successful deployment desynchronizes the stored configuration from what is actually running on Vertex AI until a redeployment occurs. The UI reflects this by showing the saved state, not necessarily the deployed state.
*   **Metadata on Copy:** The `createAgentInFirestore` service function correctly strips all deployment and ownership metadata when an agent is copied or imported, ensuring the new agent is a clean configuration owned by the current user.
*   The `maxLoops` field is stored as a Number, which is consistent with its use in the backend.
*   The frontend uses `userId` when fetching/displaying, while `createAgentInFirestore` also sets a `userId` field. The backend `ensureUserProfile` returns a `uid`. This document uses `userId` as the canonical key for consistency with frontend services.  