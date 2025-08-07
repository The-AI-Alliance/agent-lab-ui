// src/constants/agentConstants.js

export const MODEL_PROVIDERS_LITELLM = [
    {
        id: "openai",
        name: "OpenAI",
        apiBase: "https://api.openai.com/v1",
        requiresApiKeyInEnv: "OPENAI_API_KEY",
        allowsCustomBase: true, // OpenAI allows specifying a different base URL (e.g., for proxies)
        allowsCustomKey: true,
        liteLlmModelPrefix: "openai",
        models: [
            { id: "gpt-5-2025-08-07", name: "GPT-5 (2025-08-07)", supportedModes: ['text', 'image'] },
            { id: "gpt-5-mini-2025-08-07", name: "GPT-5 Mini (2025-08-07)", supportedModes: ['text', 'image']},
            { id: "gpt-5-Nano-2025-08-07", name: "GPT-5 Nano (2025-08-07)", supportedModes: ['text', 'image']},
            { id: "o3-deep-research-2025-06-26", name: "OpenAI o3 Deep Research (2025-06-26)", supportedModes: ['text', 'image'] },
            { id: "o4-mini-deep-research-2025-06-26", name: "OpenAI o4 Mini Deep Research (2025-06-26)", supportedModes: ['text', 'image'] },
            { id: "o4-mini-2025-04-16", name:"OpenAI o4 Mini (2025-04-16)", supportedModes: ['text', 'image'] },
            { id: "o3-mini-2025-01-31", name: "OpenAI o3 Mini (2025-01-31)", supportedModes: ['text'] },
            { id: "o3-2025-04-16", name: "OpenAI o3 (2025-04-16)", supportedModes: ['text', 'image'] },
            { id: "gpt-4.1-2025-04-14", name: "GPT-4.1 (2025-04-14)", supportedModes: ['text', 'image'] },
            { id: "gpt-4.1-mini-2025-04-14", name: "GPT-4.1 Mini (2025-04-14)", supportedModes: ['text', 'image'] },
            { id: "gpt-4.1-nano-2025-04-14", name: "GPT-4.1 Nano (2025-04-14)", supportedModes: ['text', 'image'] },
            { id: "gpt-4o", name: "GPT-4o (Omni)", supportedModes: ['text', 'image'] },
            { id: "gpt-4-turbo", name: "GPT-4 Turbo", supportedModes: ['text', 'image'] },
            { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", supportedModes: ['text'] },
        ]
    },
    {
        id: "openai_compatible",
        name: "OpenAI Compatible Endpoint",
        apiBase: null, // Must be user-provided
        requiresApiKeyInEnv: null, // API key handling is specific to the endpoint
        allowsCustomBase: true,
        allowsCustomKey: true,
        liteLlmModelPrefix: "openai", // LiteLLM uses "openai/" prefix for compatible endpoints too
        models: [
            { id: "your-custom-model-name-1", name: "Custom Model 1 (User Defined)", supportedModes: ['text', 'image'] },
            { id: "your-custom-model-name-2", name: "Custom Model 2 (User Defined)", supportedModes: ['text', 'image'] },
        ],
        isCustomEndpoint: true, // Flag to indicate user must provide base URL
        customInstruction: "For OpenAI-compatible endpoints, provide the API Base URL. The Model String should be the model name expected by your endpoint."
    },
    {
        id: "google_ai_studio", // For Gemini API
        name: "Google AI Studio (Gemini)",
        apiBase: "https://generativelanguage.googleapis.com",
        requiresApiKeyInEnv: "GEMINI_API_KEY", // LiteLLM uses GEMINI_API_KEY
        allowsCustomBase: false,
        allowsCustomKey: true, // LiteLLM seems to allow passing api_key for Gemini
        liteLlmModelPrefix: "gemini",
        models: [
            { id: "gemini-2.5-pro-preview-06-05", name: "Gemini 2.5 Pro (Preview)", supportedModes: ['text', 'image'] },
            { id: "gemini-1.5-flash-latest", name: "Gemini 1.5 Flash (Latest)", supportedModes: ['text', 'image'] },
            { id: "gemini-pro", name: "Gemini 1.0 Pro", supportedModes: ['text'] },
        ]
    },
    {
        id: "anthropic",
        name: "Anthropic (Claude)",
        apiBase: "https://api.anthropic.com",
        requiresApiKeyInEnv: "ANTHROPIC_API_KEY",
        allowsCustomBase: false,
        allowsCustomKey: true,
        liteLlmModelPrefix: "anthropic",
        models: [
            { id: "claude-3-opus-20240229", name: "Claude 3 Opus", supportedModes: ['text', 'image'] },
            { id: "claude-3-sonnet-20240229", name: "Claude 3 Sonnet", supportedModes: ['text', 'image'] },
            { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku", supportedModes: ['text', 'image'] },
        ]
    },
    {
        id: "bedrock",
        name: "AWS Bedrock",
        apiBase: null, // Determined by AWS SDK (region)
        requiresApiKeyInEnv: "AWS_ACCESS_KEY_ID", // Also AWS_SECRET_ACCESS_KEY, AWS_REGION_NAME
        allowsCustomBase: false, // AWS SDK handles endpoint resolution
        allowsCustomKey: true, // LiteLLM allows passing AWS keys
        liteLlmModelPrefix: "bedrock", // e.g. bedrock/anthropic.claude-3-opus-20240229-v1:0
        models: [
            // Model IDs for Bedrock are full ARNs or provider.model format
            { id: "anthropic.claude-3-5-sonnet-20240620-v1:0", name: "Claude 3.5 Sonnet (Bedrock)", supportedModes: ['text', 'image']},
            { id: "anthropic.claude-3-opus-20240229-v1:0", name: "Claude 3 Opus (Bedrock)", supportedModes: ['text', 'image'] },
            { id: "anthropic.claude-3-sonnet-20240229-v1:0", name: "Claude 3 Sonnet (Bedrock)", supportedModes: ['text', 'image'] },
            { id: "anthropic.claude-3-haiku-20240307-v1:0", name: "Claude 3 Haiku (Bedrock)", supportedModes: ['text', 'image'] },
            { id: "meta.llama3-70b-instruct-v1:0", name: "Meta Llama 3 70B Instruct (Bedrock)", supportedModes: ['text'] },
            { id: "amazon.titan-text-express-v1", name: "Amazon Titan Text Express (Bedrock)", supportedModes: ['text']},
        ],
        customInstruction: "For AWS Bedrock, Model String is the Bedrock Model ID (e.g., anthropic.claude-3-opus-20240229-v1:0). Ensure AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION_NAME) are set in the backend environment or passed if UI supports."
    },
    {
        id: "meta_llama",
        name: "Meta Llama API",
        apiBase: "https://api.llama.meta.com/v1", // Example, verify actual endpoint
        requiresApiKeyInEnv: "LLAMA_API_KEY", // LiteLLM uses LLAMA_API_KEY
        allowsCustomBase: false,
        allowsCustomKey: true,
        liteLlmModelPrefix: "meta_llama",
        models: [
            { id: "Llama-3.3-70B-Instruct", name: "Llama 3.3 70B Instruct", supportedModes: ['text']},
            { id: "Llama-3.3-8B-Instruct", name: "Llama 3.3 8B Instruct", supportedModes: ['text']},
            // Add other specific model versions if needed
        ]
    },
    {
        id: "mistral",
        name: "Mistral AI",
        apiBase: "https://api.mistral.ai/v1",
        requiresApiKeyInEnv: "MISTRAL_API_KEY",
        allowsCustomBase: false,
        allowsCustomKey: true,
        liteLlmModelPrefix: "mistral",
        models: [
            { id: "mistral-large-latest", name: "Mistral Large (Latest)", supportedModes: ['text'] },
            { id: "mistral-medium-latest", name: "Mistral Medium (Latest)", supportedModes: ['text'] },
            { id: "mistral-small-latest", name: "Mistral Small (Latest)", supportedModes: ['text'] },
            { id: "open-mixtral-8x7b", name: "Mixtral 8x7B (Open)", supportedModes: ['text'] },
            { id: "open-mistral-7b", name: "Mistral 7B (Open)", supportedModes: ['text'] },
        ]
    },
    {
        id: "watsonx",
        name: "IBM WatsonX",
        apiBase: null, // User must provide WATSONX_URL
        requiresApiKeyInEnv: "WATSONX_APIKEY", // or WATSONX_TOKEN
        allowsCustomBase: true, // WatsonX URL is the base
        allowsCustomKey: true,
        liteLlmModelPrefix: "watsonx", // e.g. watsonx/google/flan-t5-xxl
        models: [
            // IBM foundation models
            { id: "ibm/granite-3-3-8b-instruct", name: "granite-3-3-8b-instruct", supportedModes: ['text'] },
            { id: "ibm/granite-3-2-8b-instruct", name: "granite-3-2-8b-instruct", supportedModes: ['text'] },
            { id: "ibm/granite-vision-3-2-2b", name: "granite-vision-3-2-2b", supportedModes: ['text', 'vision'] },
            { id: "ibm/granite-3-2b-instruct-v3-1", name: "granite-3-2b-instruct (v3.1)", supportedModes: ['text'] },
            { id: "ibm/granite-3-8b-instruct-v3-1", name: "granite-3-8b-instruct (v3.1)", supportedModes: ['text'] },
            { id: "ibm/granite-guardian-3-8b-v3-1", name: "granite-guardian-3-8b (v3.1)", supportedModes: ['text'] },
            { id: "ibm/granite-guardian-3-2b-v3-1", name: "granite-guardian-3-2b (v3.1)", supportedModes: ['text'] },
            { id: "ibm/granite-13b-instruct", name: "granite-13b-instruct", supportedModes: ['text'] },
            { id: "ibm/granite-8b-code-instruct", name: "granite-8b-code-instruct", supportedModes: ['code'] },
            { id: "ibm/granite-8b-japanese", name: "granite-8b-japanese", supportedModes: ['text'] },

            // Meta Llama models
            { id: "meta-llama/llama-4-scout-17b-16e-instruct", name: "llama-4-scout-17b-16e-instruct", supportedModes: ['text', 'multimodal'] },
            { id: "meta-llama/llama-4-maverick-17b-128e-instruct-fp8", name: "llama-4-maverick-17b-128e-instruct-fp8", supportedModes: ['text', 'multimodal'] },
            { id: "meta-llama/llama-3-3-70b-instruct", name: "llama-3-3-70b-instruct", supportedModes: ['text'] },
            { id: "meta-llama/llama-3-2-90b-vision-instruct", name: "llama-3-2-90b-vision-instruct", supportedModes: ['text', 'vision'] },
            { id: "meta-llama/llama-3-2-11b-vision-instruct", name: "llama-3-2-11b-vision-instruct", supportedModes: ['text', 'vision'] },
            { id: "meta-llama/llama-guard-3-11b-vision", name: "llama-guard-3-11b-vision", supportedModes: ['text', 'vision'] },
            { id: "meta-llama/llama-3-2-1b-instruct", name: "llama-3-2-1b-instruct", supportedModes: ['text'] },
            { id: "meta-llama/llama-3-2-3b-instruct", name: "llama-3-2-3b-instruct", supportedModes: ['text'] },
            { id: "meta-llama/llama-3-405b-instruct", name: "llama-3-405b-instruct", supportedModes: ['text'] },

            // Mistral models
            { id: "mistral-ai/mistral-medium-2505", name: "mistral-medium-2505", supportedModes: ['text', 'vision'] },
            { id: "mistral-ai/mistral-small-3-1-24b-instruct-2503", name: "mistral-small-3-1-24b-instruct-2503", supportedModes: ['text', 'vision'] },
            { id: "mistral-ai/pixtral-12b", name: "pixtral-12b", supportedModes: ['text', 'vision'] },
            { id: "mistral-ai/mistral-large-2", name: "mistral-large-2", supportedModes: ['text'] },

            // Third-party foundation models
            { id: "sdaia/allam-1-13b-instruct", name: "allam-1-13b-instruct", supportedModes: ['text'] },
            { id: "core42/jais-13b-chat-arabic", name: "jais-13b-chat (Arabic)", supportedModes: ['text'] },
            { id: "google/flan-t5-xl-3b", name: "flan-t5-xl-3b", supportedModes: ['text'] },
            { id: "google/flan-t5-xxl-11b", name: "flan-t5-xxl-11b", supportedModes: ['text'] },
            { id: "google/flan-ul2-20b", name: "flan-ul2-20b", supportedModes: ['text'] },
            { id: "elyza/elyza-japanese-llama-2-7b-instruct", name: "elyza-japanese-llama-2-7b-instruct", supportedModes: ['text'] },
        ],
        customInstruction: "For IBM WatsonX, ensure WATSONX_URL and WATSONX_APIKEY (or WATSONX_TOKEN) are set in the backend or passed. Model String is the WatsonX model ID (e.g., google/flan-t5-xxl). Also requires WATSONX_PROJECT_ID."
    },
    {
        id: "deepseek",
        name: "Deepseek",
        apiBase: "https://api.deepseek.com/v1",
        requiresApiKeyInEnv: "DEEPSEEK_API_KEY",
        allowsCustomBase: false,
        allowsCustomKey: true,
        liteLlmModelPrefix: "deepseek",
        models: [
            { id: "deepseek-chat", name: "Deepseek Chat" },
            { id: "deepseek-coder", name: "Deepseek Coder" },
        ]
    },
    {
        id: "deepinfra",
        name: "DeepInfra",
        apiBase: "https://api.deepinfra.com/v1/openai",
        requiresApiKeyInEnv: "DEEPINFRA_API_KEY",
        allowsCustomBase: false, // DeepInfra has a fixed base for OpenAI compatibility
        allowsCustomKey: true,
        liteLlmModelPrefix: "deepinfra", // e.g. deepinfra/meta-llama/Llama-2-70b-chat-hf
        models: [
            // Model IDs are provider-org/model-name
            { id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", name: "Llama 3.3 70B Instruct Turbo (DeepInfra)", supportedModes: ['text'] },
            { id: "meta-llama/Meta-Llama-3-70B-Instruct", name: "Llama 3 70B Instruct (DeepInfra)", supportedModes: ['text'] },
            { id: "mistralai/Mistral-7B-Instruct-v0.1", name: "Mistral 7B Instruct (DeepInfra)", supportedModes: ['text'] },
        ],
        customInstruction: "For DeepInfra, Model String is the full model path (e.g., meta-llama/Meta-Llama-3-8B-Instruct)."
    },
    {
        id: "replicate",
        name: "Replicate",
        apiBase: "https://api.replicate.com/v1", // This is for their direct API, LiteLLM handles this
        requiresApiKeyInEnv: "REPLICATE_API_KEY",
        allowsCustomBase: false,
        allowsCustomKey: true,
        liteLlmModelPrefix: "replicate", // e.g. replicate/meta/meta-llama-3-8b-instruct
        models: [
            // Model IDs are owner/model-name:version-hash or owner/model-name if latest
            { id: "meta/meta-llama-3-8b-instruct", name: "Llama 3 8B Instruct (Replicate)", supportedModes: ['text'] },
            { id: "mistralai/mistral-7b-instruct-v0.2", name: "Mistral 7B Instruct v0.2 (Replicate)", supportedModes: ['text'] },
        ],
        customInstruction: "For Replicate, Model String is owner/model-name or owner/model-name:version-hash (e.g., meta/meta-llama-3-8b-instruct)."
    },
    {
        id: "together_ai",
        name: "TogetherAI",
        apiBase: "https://api.together.xyz/v1",
        requiresApiKeyInEnv: "TOGETHER_AI_API_KEY",
        allowsCustomBase: false,
        allowsCustomKey: true,
        liteLlmModelPrefix: "together_ai", // e.g. together_ai/mistralai/Mixtral-8x7B-Instruct-v0.1
        models: [
            // Model IDs are owner/model-name format
            { id: "mistralai/Mixtral-8x7B-Instruct-v0.1", name: "Mixtral 8x7B Instruct (TogetherAI)", supportedModes: ['text'] },
            { id: "meta-llama/Llama-3-8b-chat-hf", name: "Llama 3 8B Chat (TogetherAI)", supportedModes: ['text'] },
            { id: "meta-llama/Llama-3-70b-chat-hf", name: "Llama 3 70B Chat (TogetherAI)", supportedModes: ['text'] },
            { id: "databricks/dbrx-instruct", name: "DBRX Instruct (TogetherAI)", supportedModes: ['text']},
        ],
        customInstruction: "For TogetherAI, Model String is the full model path (e.g., mistralai/Mixtral-8x7B-Instruct-v0.1)."
    },
    {
        id: "custom", // For any other LiteLLM supported provider or direct OpenAI-compatible URL
        name: "Custom (Advanced)",
        apiBase: null, // User must provide
        requiresApiKeyInEnv: null, // User must handle API key env or pass directly
        allowsCustomBase: true,
        allowsCustomKey: true,
        liteLlmModelPrefix: null, // Model string is provided as-is by the user
        models: [
            { id: "custom/my-ollama-model", name: "Example: My Ollama Model (User Defined)", supportedModes: ['text', 'image']},
            { id: "custom/my-vllm-endpoint", name: "Example: My vLLM Model (User Defined)", supportedModes: ['text', 'image']},
        ],
        isCustomEndpoint: true,
        customInstruction: "For custom providers, enter the complete LiteLLM model string (e.g., 'ollama/mistral', 'groq/mixtral-8x7b-32768'). You may also need to set API Base and/or API Key overrides if not configured in the backend environment."
    },
    {
        id: "azure", // Azure OpenAI
        name: "Azure OpenAI",
        apiBase: null, // Must be set via AZURE_API_BASE env var or user override
        requiresApiKeyInEnv: "AZURE_API_KEY", // Also AZURE_API_VERSION
        allowsCustomBase: true,
        allowsCustomKey: true,
        liteLlmModelPrefix: "azure", // LiteLLM expects "azure/<your-deployment-name>"
        models: [
            // For Azure, the "id" here represents the "deployment name"
            { id: "gpt-4o-deployment", name: "GPT-4o (Azure Deployment)", supportedModes: ['text'] },
            { id: "gpt-35-turbo-deployment", name: "GPT-3.5 Turbo (Azure Deployment)", supportedModes: ['text'] },
        ],
        customInstruction: "For Azure OpenAI, Model String is your Azure Deployment Name. Ensure AZURE_API_KEY, AZURE_API_BASE, and AZURE_API_VERSION are set in the backend environment or passed as overrides."
    },
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