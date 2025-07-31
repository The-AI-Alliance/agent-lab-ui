# Document: `agents/{agentId}`

This document represents the complete definition of an agent, including its architecture (single, sequential, etc.), tools, system instructions, and its deployment state on Google Cloud's Vertex AI platform.

## Fields

| Field                         | Type                  | Description                                                                                                   | Set By                                                              | Read By                                                                                                                              |  
| ----------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |  
| `name`                        | String                | A user-friendly display name for the agent.                                                                   | Client/UI                                                           | `_deploy_agent_to_vertex_logic`, `_check_vertex_agent_deployment_status_logic` (to generate Vertex display name)                     |  
| `description`                 | String                | A brief description of the agent's purpose.                                                                   | Client/UI                                                           | `_deploy_agent_to_vertex_logic` (passed to Vertex AI)                                                                                |  
| `platform`                    | String                | The execution platform for the agent, e.g., `vertex` or `a2a`.                                                | Client/UI                                                           | `_execute_and_stream_to_firestore` (in `task/__init__.py`)                                                                           |  
| `agentType`                   | String                | The ADK agent class: `Agent`, `SequentialAgent`, `LoopAgent`, `ParallelAgent`.                                | Client/UI                                                           | `instantiate_adk_agent_from_config`                                                                                                  |  
| `systemInstruction`           | String                | The base prompt or instructions for the agent.                                                                | Client/UI                                                           | `_prepare_agent_kwargs_from_config`                                                                                                  |  
| `modelId`                     | String                | (For `Agent`, `LoopAgent`) A reference to a document in the `/models` collection.                             | Client/UI                                                           | `instantiate_adk_agent_from_config`                                                                                                  |  
| `tools`                       | Array of Maps         | A list of tool configurations (`mcp`, `gofannon`, `custom_repo`).                                             | Client/UI                                                           | `_prepare_agent_kwargs_from_config`                                                                                                  |  
| `childAgents`                 | Array of Maps         | (For `SequentialAgent`, `ParallelAgent`) Nested agent definitions.                                            | Client/UI                                                           | `instantiate_adk_agent_from_config`                                                                                                  |  
| `maxLoops`                    | String or Number      | (For `LoopAgent`) The maximum number of iterations for the loop.                                              | Client/UI                                                           | `instantiate_adk_agent_from_config`                                                                                                  |  
| `usedCustomRepoUrls`          | Array of Strings      | (For agents with `custom_repo` tools) URLs for pip-installable Git repositories.                              | Client/UI                                                           | `_deploy_agent_to_vertex_logic` (to build deployment requirements)                                                                   |  
| `deploymentStatus`            | String                | The current state of the Vertex AI deployment (e.g., `deploying_initiated`, `deployed`, `error`).             | `_deploy_...`, `_delete_...`, `_check_...` (in `admin/__init__.py`) | `_execute_and_stream_to_firestore`, `_check_...`                                                                                     |  
| `vertexAiResourceName`        | String                | The full Google Cloud resource name of the deployed agent (e.g., `projects/.../reasoningEngines/...`).        | `_deploy_...`, `_check_...`                                         | `_delete_...`, `_check_...`, `_execute_...`                                                                                          |  
| `deploymentError`             | String                | If `deploymentStatus` is `error`, this field contains the error message.                                      | `_deploy_...`, `_delete_...`, `_check_...`                                         | _(For client display)_                                                                                                              |  
| `lastDeploymentAttemptAt`     | Timestamp             | Timestamp of when the last deployment was started.                                                            | `_deploy_agent_to_vertex_logic`                                     | _(For client display)_                                                                                                              |  
| `lastDeployedAt`              | Timestamp             | Timestamp of when the agent was last successfully deployed or its status changed.                             | `_deploy_...`, `_check_...`                                         | _(For client display)_                                                                                                              |  
| `lastStatusCheckAt`           | Timestamp             | Timestamp of the last time the deployment status was checked against Vertex AI.                               | `_delete_...`, `_check_...`                                         | _(For client display)_                                                                                                              |  
| `agentCard`                   | Map                   | (For `a2a` platform) The cached AgentCard JSON from the remote agent.                                         | Client/UI                                                           | `_run_a2a_agent` (to check capabilities)                                                                                             |  

## Prototypical Example (Deployed Vertex Agent)

```json  
{  
"name": "Customer Support Bot",  
"description": "Answers questions about orders using the order lookup tool.",  
"platform": "vertex",  
"agentType": "Agent",  
"modelId": "abc123def456",  
"systemInstruction": "You are a helpful assistant. Use the tools provided to answer questions.",  
"tools": [  
{  
"type": "gofannon",  
"id": "gofannon-tool-id-123",  
"module_path": "gofannon_tools.order_lookup",  
"class_name": "OrderLookupTool"  
}  
],  
"deploymentStatus": "deployed",  
"vertexAiResourceName": "projects/my-gcp-project/locations/us-central1/reasoningEngines/xyz789",  
"lastDeployedAt": "2024-05-21T10:00:00Z"  
}  
```

## Inconsistencies and Notes
*   The `maxLoops` field is read as a string but immediately converted to an integer. It would be more robust to store it as a Number in Firestore.
*   The document serves a dual purpose: it's both the "source code" configuration for an agent and the live "status record" of its deployment. This is efficient but means that modifying the configuration fields (like `tools` or `systemInstruction`) after a successful deployment desynchronizes the stored configuration from what is actually running on Vertex AI until a redeployment occurs.  