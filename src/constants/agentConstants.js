// src/constants/agentConstants.js

import openAIModels from './models/openai.json';
import openAICompatibleModels from './models/openai_compatible.json';
import googleAIStudioModels from './models/google_ai_studio.json';
import anthropicModels from './models/anthropic.json';
import bedrockModels from './models/bedrock.json';
import metaLlamaModels from './models/meta_llama.json';
import mistralModels from './models/mistral.json';
import watsonxModels from './models/watsonx.json';
import deepseekModels from './models/deepseek.json';
import deepinfraModels from './models/deepinfra.json';
import replicateModels from './models/replicate.json';
import togetherAIModels from './models/together_ai.json';
import customModels from './models/custom.json';
import azureModels from './models/azure.json';

export const MODEL_PROVIDERS_LITELLM = [
    openAIModels,
    openAICompatibleModels,
    googleAIStudioModels,
    anthropicModels,
    bedrockModels,
    metaLlamaModels,
    mistralModels,
    watsonxModels,
    deepseekModels,
    deepinfraModels,
    replicateModels,
    togetherAIModels,
    customModels,
    azureModels,
];

// Default provider and model
export const DEFAULT_LITELLM_PROVIDER_ID = "openai"; // OpenAI is a common default
export const DEFAULT_LITELLM_MODEL_STRING = "openai/gpt-4o"; // Default to GPT-4o for OpenAI
const defaultProvider = MODEL_PROVIDERS_LITELLM.find(p => p.id === DEFAULT_LITELLM_PROVIDER_ID);
export const DEFAULT_LITELLM_BASE_MODEL_ID = defaultProvider?.models[0]?.id || "gpt-4o"; // Default to first model of default provider

export const AGENT_TYPES = ["Agent", "SequentialAgent", "ParallelAgent", "LoopAgent"];

export const getLiteLLMProviderConfig = (providerId) => {
    return MODEL_PROVIDERS_LITELLM.find(p => p.id === providerId);
};