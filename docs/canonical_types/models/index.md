# Document: `models/{modelId}`

This document stores the configuration for a specific Large Language Model (LLM) provider and model string. It acts as a reusable template that agents can reference, abstracting away the specific API keys and parameters.

## Fields

| Field               | Type                  | Description                                                                                             | Set By                               | Read By                                                                                                 |  
| ------------------- | --------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------- |  
| `name`              | String                | A user-friendly display name for the model configuration.                                               | Client/UI                            | _(Not used by backend)_                                                                                 |  
| `description`       | String                | A brief description of the model or its intended use.                                                   | Client/UI                            | `_prepare_agent_kwargs_from_config`                                                                     |  
| `provider`          | String                | The LiteLLM provider key (e.g., `openai`, `google_ai_studio`, `anthropic`). Critical for routing.        | Client/UI                            | `_prepare_agent_kwargs_from_config`                                                                     |  
| `modelString`       | String                | The specific model name for the provider (e.g., `gpt-4-turbo`, `gemini-1.5-pro-latest`).                 | Client/UI                            | `_prepare_agent_kwargs_from_config`                                                                     |  
| `litellm_api_base`  | String                | (Optional) An override for the provider's base API URL.                                                 | Client/UI                            | `_prepare_agent_kwargs_from_config`                                                                     |  
| `litellm_api_key`   | String                | (Optional) An override for the API key, taking precedence over environment variables.                   | Client/UI                            | `_prepare_agent_kwargs_from_config`                                                                     |  
| `temperature`       | Number                | (Optional) The model's temperature setting (0.0 - 1.0).                                                 | Client/UI                            | `_prepare_agent_kwargs_from_config`                                                                     |  
| `maxOutputTokens`   | Number                | (Optional) The maximum number of tokens to generate.                                                    | Client/UI                            | `_prepare_agent_kwargs_from_config`                                                                     |  
| `topP`              | Number                | (Optional) The model's Top-P (nucleus sampling) value.                                                  | Client/UI                            | `_prepare_agent_kwargs_from_config`                                                                     |  
| `topK`              | Number                | (Optional) The model's Top-K sampling value.                                                            | Client/UI                            | `_prepare_agent_kwargs_from_config`                                                                     |  
| `stopSequences`     | Array of Strings      | (Optional) A list of strings that will cause the model to stop generating.                              | Client/UI                            | `_prepare_agent_kwargs_from_config`                                                                     |  
| `project_id`        | String                | (Optional) Specific to the `watsonx` provider for LiteLLM.                                              | Client/UI                            | `_prepare_agent_kwargs_from_config`                                                                     |  
| `space_id`          | String                | (Optional) Specific to `watsonx` deployments.                                                           | Client/UI                            | `_prepare_agent_kwargs_from_config`                                                                     |  

## Prototypical Example

```json  
{  
"name": "OpenAI GPT-4 Turbo",  
"description": "The latest GPT-4 model from OpenAI, optimized for chat.",  
"provider": "openai",  
"modelString": "gpt-4-turbo",  
"temperature": 0.7,  
"maxOutputTokens": 4096,  
"topP": 1,  
"stopSequences": [],  
"litellm_api_base": null,  
"litellm_api_key": null  
}  
```

## Inconsistencies and Notes

*   The backend functions **only read** from this collection. The schema is entirely dependent on the client/UI creating the documents correctly.
*   The function `get_model_config_from_firestore` is asynchronous but is called inside a synchronous `asyncio.run()` in the call stack of `deploy_agent_to_vertex`, which is a valid but potentially inefficient pattern if used frequently in a larger async application. In the `task_handler`, it is called correctly within an async context.  