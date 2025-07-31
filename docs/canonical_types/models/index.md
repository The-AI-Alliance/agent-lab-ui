# Document: `models/{modelId}`

This document stores the configuration for a specific Large Language Model (LLM) instance. It acts as a reusable template that agents can reference, abstracting away specific model parameters like system prompts and temperature.

## Fields

| Field               | Type                  | Description                                                                                             | Set By                                            | Read By                                                                                                 |    
| ------------------- | --------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |    
| `name`              | String                | A user-friendly display name for the model configuration.                                               | Client/UI (`ModelForm`)                             | Client/UI (`ModelsPage`, `ModelDetailsPage`, `ModelSelector`)                                             |    
| `description`       | String                | A brief description of the model or its intended use.                                                   | Client/UI (`ModelForm`)                             | `_prepare_agent_kwargs_from_config`, Client/UI (`ModelsPage`, `ModelDetailsPage`)                       |    
| `projectIds`        | Array of Strings      | An array of project IDs this model is associated with.                                                  | Client/UI (`ModelForm`)                             | `getModelsForProjects`                                                                                    |    
| `isPublic`          | Boolean               | If `true`, this model configuration is visible to all users.                                            | Client/UI (`ModelForm`)                             | `getPublicModels`                                                                                         |    
| `provider`          | String                | The LiteLLM provider key (e.g., `openai`, `google_ai_studio`, `anthropic`). Critical for routing.        | Client/UI (`ModelForm`)                             | `_prepare_agent_kwargs_from_config`, Client/UI (`ModelDetailsPage`)                                     |    
| `modelString`       | String                | The specific model name for the provider (e.g., `gpt-4-turbo`, `gemini-1.5-pro-latest`).                 | Client/UI (`ModelForm`)                             | `_prepare_agent_kwargs_from_config`, Client/UI (`ModelDetailsPage`)                                     |    
| `systemInstruction` | String                | The system prompt to be used with this model.                                                           | Client/UI (`ModelForm`)                             | `_prepare_agent_kwargs_from_config`, Client/UI (`ModelDetailsPage`)                                     |    
| `temperature`       | Number                | The model's temperature setting (0.0 - 1.0).                                                            | Client/UI (`ModelForm`)                             | `_prepare_agent_kwargs_from_config`, Client/UI (`ModelDetailsPage`)                                     |    
| `ownerId`           | String                | The UID of the user who owns this model configuration.                                                  | `createModel`                                     | `getMyModels`                                                                                             |    
| `createdAt`         | Timestamp             | Timestamp for when the document was created.                                                            | `createModel`                                     | _(For client display)_                                                                                  |    
| `updatedAt`         | Timestamp             | Timestamp for when the document was last updated.                                                       | `createModel`, `updateModel`                      | _(For client display)_                                                                                  |    

## Prototypical Example

$$$json  
{  
"name": "Creative Assistant GPT-4o",  
"description": "A GPT-4o configuration with a higher temperature for creative writing tasks.",  
"projectIds": ["proj_abc"],  
"isPublic": true,  
"provider": "openai",  
"modelString": "gpt-4o",  
"systemInstruction": "You are a creative writing assistant. Your goal is to help the user brainstorm and write compelling stories.",  
"temperature": 0.9,  
"ownerId": "user-uid-abc-123",  
"createdAt": "2024-05-20T11:00:00Z",  
"updatedAt": "2024-05-20T11:00:00Z"  
}  
$$$

## Inconsistencies and Notes

*   **Frontend-Driven Schema:** The backend functions only **read** from this collection (`get_model_config_from_firestore` called by `_prepare_agent_kwargs_from_config`). The schema is entirely defined and managed by the frontend (`CreateModelPage`, `ModelForm`, etc.) through the `firebaseService` functions (`createModel`, `updateModel`).
*   **No API Key Storage:** Unlike the original backend-only analysis might have inferred, API keys (`litellm_api_key`) are **not** stored in the model document. The frontend form does not have a field for them, and they are not passed to `createModel` or `updateModel`. The system relies on backend environment variables for API keys.
*   The function `get_model_config_from_firestore` is asynchronous but is called inside a synchronous `asyncio.run()` in the call stack of `deploy_agent_to_vertex`, which is a valid but potentially inefficient pattern. In the `task_handler` (`executeQuery`), it is called correctly within an async context.  