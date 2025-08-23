// src/components/agents/ChildAgentFormDialog.js
import React, { useState, useEffect, useRef } from 'react';
import {
    TextField, Button, Select, MenuItem, FormControl, InputLabel,
    Grid, Dialog, DialogTitle, DialogContent, DialogActions, FormHelperText,
    Typography, Alert // Removed Checkbox, FormControlLabel
} from '@mui/material';
import { v4 as uuidv4 } from 'uuid';
import ToolSelector from '../tools/ToolSelector';
import {
    AGENT_TYPES,
    MODEL_PROVIDERS_LITELLM,
    DEFAULT_LITELLM_PROVIDER_ID,
    DEFAULT_LITELLM_BASE_MODEL_ID,
    getLiteLLMProviderConfig
} from '../../constants/agentConstants';
import { validateAgentName } from '../../utils/agentValidation';


const ChildAgentFormDialog = ({
                                  open,
                                  onClose,
                                  onSave,
                                  childAgentData,
                              }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [currentChildAgentType, setCurrentChildAgentType] = useState(AGENT_TYPES[0]);

    const [selectedProviderId, setSelectedProviderId] = useState(DEFAULT_LITELLM_PROVIDER_ID);
    const [selectedBaseModelId, setSelectedBaseModelId] = useState(DEFAULT_LITELLM_BASE_MODEL_ID);
    const [inputtedModelString, setInputtedModelString] = useState(DEFAULT_LITELLM_BASE_MODEL_ID);
    const [litellmApiBase, setLitellmApiBase] = useState('');
    const [litellmApiKey, setLitellmApiKey] = useState('');

    const [instruction, setInstruction] = useState('');
    const [selectedTools, setSelectedTools] = useState([]);
    // enableCodeExecution removed
    const [outputKey, setOutputKey] = useState('');
    const [formError, setFormError] = useState('');
    const [nameError, setNameError] = useState('');
    const [usedCustomRepoUrls, setUsedCustomRepoUrls] = useState([]);
    const [usedMcpServerUrls, setUsedMcpServerUrls] = useState([]); // New state

    const currentProviderConfig = getLiteLLMProviderConfig(selectedProviderId);
    const availableBaseModels = currentProviderConfig?.models || [];
    const initialDataProcessedRef = useRef(false);


    useEffect(() => {
        if (open) {
            initialDataProcessedRef.current = false;
            const dataToLoad = childAgentData || {};

            setName(dataToLoad.name || '');
            setDescription(dataToLoad.description || '');
            setCurrentChildAgentType(dataToLoad.agentType || AGENT_TYPES[0]);

            let initialSelectedProvider = dataToLoad.selectedProviderId || DEFAULT_LITELLM_PROVIDER_ID;
            let initialBaseModelName = dataToLoad.litellm_model_string || DEFAULT_LITELLM_BASE_MODEL_ID;

            if (!dataToLoad.selectedProviderId && dataToLoad.litellm_model_string) {
                const fullModelStr = dataToLoad.litellm_model_string;
                let foundProvider = MODEL_PROVIDERS_LITELLM.find(
                    p => p.liteLlmModelPrefix && fullModelStr.startsWith(p.liteLlmModelPrefix + "/")
                );

                if (foundProvider) {
                    initialSelectedProvider = foundProvider.id;
                    initialBaseModelName = fullModelStr.substring(foundProvider.liteLlmModelPrefix.length + 1);
                } else {
                    if (fullModelStr.startsWith("azure/")) {
                        initialSelectedProvider = "azure";
                        initialBaseModelName = fullModelStr.substring("azure/".length);
                    } else {
                        initialSelectedProvider = 'custom';
                        initialBaseModelName = fullModelStr;
                    }
                }
            }
            setSelectedProviderId(initialSelectedProvider);

            const providerConf = getLiteLLMProviderConfig(initialSelectedProvider);
            if (providerConf?.id === 'custom' || providerConf?.id === 'openai_compatible') {
                setSelectedBaseModelId('');
                setInputtedModelString(initialBaseModelName);
            } else if (providerConf?.models.some(m => m.id === initialBaseModelName)) {
                setSelectedBaseModelId(initialBaseModelName);
                setInputtedModelString(initialBaseModelName);
            } else {
                const firstModelOfProvider = providerConf?.models[0]?.id || '';
                setSelectedBaseModelId(firstModelOfProvider);
                setInputtedModelString(firstModelOfProvider);
            }

            setLitellmApiBase(dataToLoad.litellm_api_base || '');
            setLitellmApiKey(dataToLoad.litellm_api_key || '');
            setInstruction(dataToLoad.instruction || '');
            // enableCodeExecution removed
            setSelectedTools(dataToLoad.tools || []);
            setOutputKey(dataToLoad.outputKey || '');
            setUsedCustomRepoUrls(
                dataToLoad.usedCustomRepoUrls ||
                (dataToLoad.tools?.filter(t => t.type === 'custom_repo' && t.sourceRepoUrl).map(t => t.sourceRepoUrl) || [])
            );
            setUsedMcpServerUrls( // Init MCP Urls for child
                dataToLoad.usedMcpServerUrls ||
                (dataToLoad.tools?.filter(t => t.type === 'mcp' && t.mcpServerUrl).map(t => t.mcpServerUrl) || [])
            );

            setFormError('');
            setNameError('');
            initialDataProcessedRef.current = true;
        }
    }, [childAgentData, open]);

    useEffect(() => {
        if (!open || !initialDataProcessedRef.current) return;

        const providerConf = getLiteLLMProviderConfig(selectedProviderId);
        if (providerConf) {
            if (providerConf.id === 'custom' || providerConf.id === 'openai_compatible') {
                setSelectedBaseModelId('');
                if (childAgentData?.selectedProviderId !== 'custom' && childAgentData?.selectedProviderId !== 'openai_compatible' &&
                    (currentProviderConfig?.id !== 'custom' && currentProviderConfig?.id !== 'openai_compatible')) {
                    setInputtedModelString('');
                } else {
                    setInputtedModelString(childAgentData?.litellm_model_string || '');
                }
            } else if (providerConf.models && providerConf.models.length > 0) {
                const firstModelId = providerConf.models[0].id;
                const currentBaseIsValid = providerConf.models.some(m => m.id === selectedBaseModelId);
                const newBaseModel = currentBaseIsValid ? selectedBaseModelId : firstModelId;
                setSelectedBaseModelId(newBaseModel);
                setInputtedModelString(newBaseModel);
            } else {
                setSelectedBaseModelId('');
                setInputtedModelString('');
            }
            setLitellmApiBase(providerConf.allowsCustomBase ? (litellmApiBase || '') : (providerConf.apiBase || ''));
            setLitellmApiKey('');
        }
    }, [selectedProviderId, open, childAgentData, litellmApiBase, selectedBaseModelId, currentProviderConfig]);

    useEffect(() => {
        if (!open || !initialDataProcessedRef.current) return;
        if (selectedProviderId !== 'custom' && selectedProviderId !== 'openai_compatible' && selectedBaseModelId) {
            setInputtedModelString(selectedBaseModelId);
        }
    }, [selectedBaseModelId, selectedProviderId, open]);

    const handleUsedCustomRepoUrlsChange = (urls) => {
        setUsedCustomRepoUrls(urls);
    };
    const handleUsedMcpServerUrlsChange = (urls) => { // New handler
        setUsedMcpServerUrls(urls);
    };

    // handleCodeExecutionChange removed

    const handleSelectedToolsChange = (newTools) => {
        setSelectedTools(newTools);
        // enableCodeExecution logic removed
        const currentCustomRepoUrls = newTools
            .filter(st => st.type === 'custom_repo' && st.sourceRepoUrl)
            .map(st => st.sourceRepoUrl);
        setUsedCustomRepoUrls(Array.from(new Set(currentCustomRepoUrls)));

        const currentMcpServerUrls = newTools // Update MCP URLs
            .filter(st => st.type === 'mcp' && st.mcpServerUrl)
            .map(st => st.mcpServerUrl);
        setUsedMcpServerUrls(Array.from(new Set(currentMcpServerUrls)));
    };


    const handleNameChange = (event) => {
        const newName = event.target.value;
        setName(newName);
        const validationError = validateAgentName(newName);
        setNameError(validationError || '');
    };

    const handleSave = () => {
        setFormError('');
        setNameError('');

        const agentNameError = validateAgentName(name);
        if (agentNameError) {
            setNameError(agentNameError);
            return;
        }

        if (showLlmFields && !instruction.trim()) {
            setFormError('Child agent/step instruction is required.');
            return;
        }

        let finalModelStringForSubmit;
        if (selectedProviderId === 'custom' || selectedProviderId === 'openai_compatible') {
            finalModelStringForSubmit = inputtedModelString.trim();
        } else {
            finalModelStringForSubmit = selectedBaseModelId;
        }

        if (showLlmFields && !finalModelStringForSubmit) {
            setFormError('Model String is required for child agent/step.');
            return;
        }

        const childDataToSave = {
            id: childAgentData?.id || uuidv4(),
            name,
            description,
            agentType: currentChildAgentType,
            instruction: showLlmFields ? instruction : null,
            tools: showLlmFields ? selectedTools : [], // enableCodeExecution removed
            // enableCodeExecution removed
            usedCustomRepoUrls: showLlmFields ? usedCustomRepoUrls : [],
            usedMcpServerUrls: showLlmFields ? usedMcpServerUrls : [], // Add MCP URLs

            selectedProviderId: showLlmFields ? selectedProviderId : null,
            litellm_model_string: showLlmFields ? finalModelStringForSubmit : null,
            litellm_api_base: (showLlmFields && currentProviderConfig?.allowsCustomBase && litellmApiBase.trim())
                ? litellmApiBase.trim()
                : (currentProviderConfig?.id === 'custom' || currentProviderConfig?.id === 'openai_compatible' || currentProviderConfig?.id === 'azure'
                    ? (litellmApiBase.trim() || null)
                    : (currentProviderConfig?.apiBase || null)),
            litellm_api_key: (showLlmFields && currentProviderConfig?.allowsCustomKey && litellmApiKey.trim())
                ? litellmApiKey.trim()
                : null,
        };

        const trimmedOutputKey = outputKey.trim();
        if (showLlmFields && trimmedOutputKey) {
            childDataToSave.outputKey = trimmedOutputKey;
        }

        if (currentChildAgentType === 'LoopAgent' && showLlmFields) {
            childDataToSave.maxLoops = childAgentData?.maxLoops || 3;
        }

        const adkReadyTools = (childDataToSave.tools || []).map(tool => {
            if (tool.type === 'custom_repo') {
                const { sourceRepoUrl, type, ...adkToolProps } = tool;
                return adkToolProps;
            }
            if (tool.type === 'mcp') {
                return tool;
            }
            // ADK built-in tools removed
            return tool;
        });
        childDataToSave.tools = adkReadyTools;

        onSave(childDataToSave);
        onClose();
    };

    // const codeExecutionDisabledByToolSelection = selectedTools.length > 0; // No longer needed
    const showLlmFields = currentChildAgentType === 'Agent' || currentChildAgentType === 'LoopAgent';


    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>
                {childAgentData ? 'Edit Step / Child Agent' : 'Add New Step / Child Agent'}
                {currentChildAgentType && <Typography variant="caption" sx={{ml: 1}}>({currentChildAgentType})</Typography>}
            </DialogTitle>
            <DialogContent>
                <Grid container spacing={2} sx={{ pt: 1 }}>
                    <Grid item xs={12}>
                        <TextField
                            label="Name" value={name} onChange={handleNameChange} required
                            fullWidth variant="outlined" error={!!nameError}
                            helperText={nameError || "Unique name for this step/child agent."}
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <TextField
                            label="Description (Optional)" value={description}
                            onChange={(e) => setDescription(e.target.value)} multiline rows={2}
                            fullWidth variant="outlined"
                        />
                    </Grid>
                    <Grid item xs={12} sm={showLlmFields ? 6 : 12}>
                        <FormControl fullWidth variant="outlined">
                            <InputLabel id="child-agentType-label">Type (for this step)</InputLabel>
                            <Select
                                labelId="child-agentType-label"
                                value={currentChildAgentType}
                                onChange={(e) => setCurrentChildAgentType(e.target.value)}
                                label="Type (for this step)"
                            >
                                <MenuItem value="Agent">Agent (Standard LLM Task)</MenuItem>
                                <MenuItem value="LoopAgent">LoopAgent (Iterative LLM Task)</MenuItem>
                            </Select>
                            <FormHelperText>Choose if this step is a standard task or an iterative loop.</FormHelperText>
                        </FormControl>
                    </Grid>

                    {showLlmFields && (
                        <>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth variant="outlined">
                                    <InputLabel id="child-modelProvider-label">LLM Provider (LiteLLM)</InputLabel>
                                    <Select
                                        labelId="child-modelProvider-label"
                                        value={selectedProviderId}
                                        onChange={(e) => setSelectedProviderId(e.target.value)}
                                        label="LLM Provider (LiteLLM)"
                                    >
                                        {MODEL_PROVIDERS_LITELLM.map(provider => <MenuItem key={provider.id} value={provider.id}>{provider.name}</MenuItem>)}
                                    </Select>
                                    {currentProviderConfig?.customInstruction && (
                                        <Alert severity="info" sx={{mt:1, fontSize:'0.8rem'}}>{currentProviderConfig.customInstruction}</Alert>
                                    )}
                                </FormControl>
                            </Grid>

                            {selectedProviderId !== 'custom' && selectedProviderId !== 'openai_compatible' && availableBaseModels.length > 0 && (
                                <Grid item xs={12}>
                                    <FormControl fullWidth variant="outlined">
                                        <InputLabel id="child-baseModel-label">Base Model</InputLabel>
                                        <Select
                                            labelId="child-baseModel-label"
                                            value={selectedBaseModelId}
                                            onChange={(e) => setSelectedBaseModelId(e.target.value)}
                                            label="Base Model"
                                        >
                                            {availableBaseModels.map(m => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
                                        </Select>
                                    </FormControl>
                                </Grid>
                            )}
                            {(selectedProviderId === 'custom' || selectedProviderId === 'openai_compatible' || (currentProviderConfig && availableBaseModels.length === 0)) && (
                                <Grid item xs={12}>
                                    <TextField
                                        label="Model String"
                                        id="child-inputtedModelString"
                                        value={inputtedModelString}
                                        onChange={(e) => setInputtedModelString(e.target.value)}
                                        fullWidth variant="outlined" required
                                        helperText={
                                            currentProviderConfig?.id === 'custom'
                                                ? "Enter the full LiteLLM model string (e.g., 'ollama/mistral', 'groq/mixtral-8x7b-32768')."
                                                : currentProviderConfig?.id === 'openai_compatible'
                                                    ? "Enter the model name expected by your OpenAI-compatible endpoint."
                                                    : `No predefined models for ${currentProviderConfig?.name}. Enter model string.`
                                        }
                                        error={formError.includes('Model String')}
                                    />
                                </Grid>
                            )}


                            {currentProviderConfig?.allowsCustomBase && (
                                <Grid item xs={12} sm={(currentProviderConfig?.allowsCustomKey) ? 6 : 12}>
                                    <TextField
                                        label="API Base URL (Override)"
                                        id="child-litellmApiBase"
                                        value={litellmApiBase}
                                        onChange={(e) => setLitellmApiBase(e.target.value)}
                                        fullWidth variant="outlined"
                                        placeholder={currentProviderConfig?.apiBase || (currentProviderConfig?.id === 'custom' || currentProviderConfig?.id === 'openai_compatible' || currentProviderConfig?.id === 'azure' ? 'Required if not in backend env' : 'Provider default will be used')}
                                        helperText={
                                            (currentProviderConfig?.id === 'custom' || currentProviderConfig?.id === 'openai_compatible' || currentProviderConfig?.id === 'azure')
                                                ? "Required if not set in backend environment variables."
                                                : "Optional. Overrides provider default if set in backend env."
                                        }
                                    />
                                </Grid>
                            )}
                            {currentProviderConfig?.allowsCustomKey && (
                                <Grid item xs={12} sm={(currentProviderConfig?.allowsCustomBase) ? 6 : 12}>
                                    <TextField
                                        label="API Key (Override)"
                                        id="child-litellmApiKey"
                                        type="password"
                                        value={litellmApiKey}
                                        onChange={(e) => setLitellmApiKey(e.target.value)}
                                        fullWidth variant="outlined"
                                        helperText={
                                            currentProviderConfig?.requiresApiKeyInEnv
                                                ? `Optional. Overrides API key from backend env var (${currentProviderConfig.requiresApiKeyInEnv}).`
                                                : "Optional. Provide if your custom endpoint needs an API key and it's not in backend env."
                                        }
                                        autoComplete="new-password"
                                    />
                                </Grid>
                            )}
                            <Grid item xs={12}>
                                <TextField
                                    label="Output Key (Optional)" value={outputKey}
                                    onChange={(e) => setOutputKey(e.target.value)}
                                    fullWidth variant="outlined"
                                    helperText="If set, agent's text response is saved to session state."
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField
                                    label="Instruction (System Prompt)" value={instruction}
                                    onChange={(e) => setInstruction(e.target.value)}
                                    multiline rows={4} required={showLlmFields}
                                    fullWidth variant="outlined" placeholder="e.g., You are a specialized researcher..."
                                    error={formError.includes('instruction')}
                                />
                            </Grid>
                            {/* Code Execution Checkbox Removed */}
                            <Grid item xs={12}>
                                <ToolSelector
                                    selectedTools={selectedTools}
                                    onSelectedToolsChange={handleSelectedToolsChange}
                                    onUsedCustomRepoUrlsChange={handleUsedCustomRepoUrlsChange}
                                    onUsedMcpServerUrlsChange={handleUsedMcpServerUrlsChange} // New prop
                                />
                            </Grid>
                        </>
                    )}
                    {formError && !nameError && <Grid item xs={12}><FormHelperText error>{formError}</FormHelperText></Grid>}
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    onClick={handleSave}
                    variant="contained"
                    color="primary"
                    disabled={!!nameError}
                >
                    {childAgentData ? 'Save Changes' : 'Add Step / Child Agent'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ChildAgentFormDialog;