// src/components/agents/AgentForm.js
import React, { useState, useEffect } from 'react';
import ToolSelector from '../tools/ToolSelector';
import ChildAgentFormDialog from './ChildAgentFormDialog';
import ExistingAgentSelectorDialog from './ExistingAgentSelectorDialog'; // New import
import { fetchGofannonTools } from '../../services/agentService';
import { AGENT_TYPES, GEMINI_MODELS } from '../../constants/agentConstants';
import { v4 as uuidv4 } from 'uuid'; // For local child IDs
import {
    TextField, Button, Select, MenuItem, FormControl, InputLabel,
    Paper, Grid, Box, CircularProgress, Typography, IconButton, List,
    ListItem, ListItemText, ListItemSecondaryAction, FormHelperText,
    Checkbox, FormControlLabel, Divider, Stack // Added Divider, Stack
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import LibraryAddIcon from '@mui/icons-material/LibraryAdd'; // Icon for existing
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

const AGENT_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const RESERVED_AGENT_NAME = "user";

function validateAgentName(name) {
    if (!name || !name.trim()) {
        return "Agent Name is required.";
    }
    if (/\s/.test(name)) {
        return "Agent Name cannot contain spaces.";
    }
    if (!AGENT_NAME_REGEX.test(name)) {
        return "Agent Name must start with a letter or underscore, and can only contain letters, digits, or underscores.";
    }
    if (name.toLowerCase() === RESERVED_AGENT_NAME) {
        return `Agent Name cannot be "${RESERVED_AGENT_NAME}" as it's a reserved name.`;
    }
    if (name.length > 63) {
        return "Agent Name is too long (max 63 characters).";
    }
    return null; // No error
}


const AgentForm = ({ onSubmit, initialData = {}, isSaving = false }) => {
    const [name, setName] = useState(initialData.name || '');
    const [description, setDescription] = useState(initialData.description || '');
    const [agentType, setAgentType] = useState(initialData.agentType || AGENT_TYPES[0]);
    const [model, setModel] = useState(initialData.model || GEMINI_MODELS[0]);
    const [instruction, setInstruction] = useState(initialData.instruction || '');
    const [selectedTools, setSelectedTools] = useState(initialData.tools || []);
    const [maxLoops, setMaxLoops] = useState(initialData.maxLoops || 3);
    const [enableCodeExecution, setEnableCodeExecution] = useState(initialData.enableCodeExecution || false);
    const [outputKey, setOutputKey] = useState(initialData.outputKey || '');

    const [childAgents, setChildAgents] = useState(initialData.childAgents || []);
    const [isChildFormOpen, setIsChildFormOpen] = useState(false);
    const [isExistingAgentSelectorOpen, setIsExistingAgentSelectorOpen] = useState(false); // New state
    const [editingChild, setEditingChild] = useState(null); // Stores the child agent object being edited

    const [availableGofannonTools, setAvailableGofannonTools] = useState([]);
    const [loadingTools, setLoadingTools] = useState(false);
    const [toolError, setToolError] = useState('');
    const [formError, setFormError] = useState('');
    const [nameError, setNameError] = useState('');

    const handleCodeExecutionChange = (event) => {
        const isChecked = event.target.checked;
        setEnableCodeExecution(isChecked);
        if (isChecked) {
            setSelectedTools([]);
        }
    };

    const handleSelectedToolsChange = (newTools) => {
        setSelectedTools(newTools);
        if (newTools.length > 0 && enableCodeExecution) {
            setEnableCodeExecution(false);
        }
    };

    const handleRefreshGofannonTools = async () => {
        setLoadingTools(true);
        setToolError('');
        try {
            const result = await fetchGofannonTools();
            if (result.success && Array.isArray(result.manifest)) {
                setAvailableGofannonTools(result.manifest);
            } else {
                setToolError(result.message || "Could not load Gofannon tools or manifest is in an unexpected format.");
                setAvailableGofannonTools([]);
            }
        } catch (error) {
            console.error("Critical error during Gofannon tools fetch in AgentForm:", error);
            setToolError(`Critical failure fetching Gofannon tools: ${error.message}`);
            setAvailableGofannonTools([]);
        } finally {
            setLoadingTools(false);
        }
    };

    useEffect(() => {
        handleRefreshGofannonTools();
    }, []);

    useEffect(() => {
        setName(initialData.name || '');
        setDescription(initialData.description || '');
        setAgentType(initialData.agentType || AGENT_TYPES[0]);
        setModel(initialData.model || GEMINI_MODELS[0]);
        setInstruction(initialData.instruction || '');
        const initialEnableCodeExec = initialData.enableCodeExecution || false;
        setEnableCodeExecution(initialEnableCodeExec);
        setSelectedTools(initialEnableCodeExec ? [] : (initialData.tools || []));
        setMaxLoops(initialData.maxLoops || 3);
        setOutputKey(initialData.outputKey || '');
        // Ensure child agents from initialData also get a local 'id' if they don't have one
        // This local 'id' is for UI list management and differs from Firestore doc ID.
        setChildAgents((initialData.childAgents || []).map(ca => ({ ...ca, id: ca.id || uuidv4() })));
        setFormError('');
        setNameError('');
    }, [initialData]);

    const handleNameChange = (event) => {
        const newName = event.target.value;
        setName(newName);
        const validationError = validateAgentName(newName);
        setNameError(validationError || '');
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setFormError('');
        setNameError('');

        const agentNameError = validateAgentName(name);
        if (agentNameError) {
            setNameError(agentNameError);
            return;
        }

        if ((agentType === 'SequentialAgent' || agentType === 'ParallelAgent') && childAgents.length === 0) {
            setFormError(`A ${agentType} requires at least one child agent/step.`);
            return;
        }

        const agentDataToSubmit = {
            name, description, agentType,
            model, instruction,
            tools: enableCodeExecution ? [] : selectedTools,
            enableCodeExecution,
        };

        const trimmedOutputKey = outputKey.trim();
        if (trimmedOutputKey) {
            agentDataToSubmit.outputKey = trimmedOutputKey;
        }

        if (agentType === 'LoopAgent') {
            agentDataToSubmit.maxLoops = Number(maxLoops);
        }
        if (agentType === 'SequentialAgent' || agentType === 'ParallelAgent') {
            // Prepare child agents for submission: strip local UI 'id'
            agentDataToSubmit.childAgents = childAgents.map(ca => {
                const { id, ...restOfConfig } = ca; // Remove local UI id
                return restOfConfig;
            });
        }

        if (initialData && initialData.platform) {
            agentDataToSubmit.platform = initialData.platform;
        }

        onSubmit(agentDataToSubmit);
    };

    const handleOpenChildFormForNew = () => {
        setEditingChild(null); // For creating a new child
        setIsChildFormOpen(true);
    };

    const handleOpenChildFormForEdit = (childToEdit) => {
        setEditingChild(childToEdit); // Pass the full child object
        setIsChildFormOpen(true);
    };

    const handleCloseChildForm = () => {
        setIsChildFormOpen(false);
        setEditingChild(null);
    };

    const handleDeleteChildAgent = (childId) => {
        if (window.confirm("Are you sure you want to remove this child agent/step?")) {
            setChildAgents(prev => prev.filter(c => c.id !== childId));
        }
    };

    const handleOpenExistingAgentSelector = () => {
        setIsExistingAgentSelectorOpen(true);
    };

    const handleExistingAgentSelected = (selectedAgentFullConfig) => {
        const newChildAgent = {
            ...selectedAgentFullConfig, // Spread all properties
            id: uuidv4(), // Assign a new unique local UI id
            // Ensure agentType is present, default if missing from original config
            agentType: selectedAgentFullConfig.agentType || AGENT_TYPES[0], // Default to "Agent"
        };

        if (!selectedAgentFullConfig.agentType) {
            console.warn(`Existing agent config for "${selectedAgentFullConfig.name}" (Firestore ID: ${selectedAgentFullConfig.id}) is missing agentType. Defaulting to "${AGENT_TYPES[0]}" for this child instance.`);
        }

        // If the original selectedAgentFullConfig had an 'id' field (from Firestore),
        // it's now been potentially overwritten by the new uuidv4().
        // This is generally fine as the 'id' for childAgents in the UI is for local list management.
        // The backend will use the content of this 'newChildAgent' object to instantiate.

        setChildAgents(prev => [...prev, newChildAgent]);
        setIsExistingAgentSelectorOpen(false);
    };

    const handleSaveChildAgent = (childDataFromForm) => {
        // childDataFromForm should now reliably include 'agentType' from ChildAgentFormDialog
        if (editingChild && editingChild.id) {
            setChildAgents(prev => prev.map(c => c.id === editingChild.id ? { ...childDataFromForm, id: editingChild.id } : c));
        } else {
            // For new children, ensure agentType is present (should be from dialog, but fallback)
            setChildAgents(prev => [...prev, { ...childDataFromForm, id: uuidv4(), agentType: childDataFromForm.agentType || AGENT_TYPES[0] }]);
        }
        setEditingChild(null);
    };

    const showParentConfig = agentType === 'Agent' || agentType === 'LoopAgent';
    const showChildConfig = agentType === 'SequentialAgent' || agentType === 'ParallelAgent';

    let childAgentSectionTitle = "Child Agents";
    if (agentType === 'SequentialAgent') childAgentSectionTitle = "Sequential Steps";
    if (agentType === 'ParallelAgent') childAgentSectionTitle = "Parallel Tasks";

    const codeExecutionDisabledByToolSelection = selectedTools.length > 0;

    return (
        <Paper elevation={3} sx={{ p: { xs: 2, md: 4 } }}>
            <Box component="form" onSubmit={handleSubmit} noValidate>
                <Grid container spacing={3}>
                    {/* ... (name, description, agentType, model, outputKey, instruction, codeExecution, tools - no changes here) ... */}
                    <Grid item xs={12}>
                        <TextField
                            label="Agent Name"
                            id="name"
                            value={name}
                            onChange={handleNameChange}
                            required
                            fullWidth
                            variant="outlined"
                            error={!!nameError}
                            helperText={nameError || "No spaces. Start with letter or _. Allowed: a-z, A-Z, 0-9, _. Not 'user'."}
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <TextField label="Description" id="description" value={description} onChange={(e) => setDescription(e.target.value)} multiline rows={3} fullWidth variant="outlined" />
                    </Grid>
                    <Grid item xs={12} sm={showParentConfig ? 4 : 6}>
                        <FormControl fullWidth variant="outlined">
                            <InputLabel id="agentType-label">Agent Type</InputLabel>
                            <Select labelId="agentType-label" id="agentType" value={agentType} onChange={(e) => setAgentType(e.target.value)} label="Agent Type">
                                {AGENT_TYPES.map(type => <MenuItem key={type} value={type}>{type}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Grid>

                    {showParentConfig && (
                        <>
                            <Grid item xs={12} sm={4}>
                                <FormControl fullWidth variant="outlined">
                                    <InputLabel id="model-label">Model</InputLabel>
                                    <Select labelId="model-label" id="model" value={model} onChange={(e) => setModel(e.target.value)} label="Model">
                                        {GEMINI_MODELS.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                                    </Select>
                                    <FormHelperText>
                                        {agentType === 'LoopAgent' ? "Model for the looped agent." : "Model for this agent."} (Gemini 2 for built-in tools/executor)
                                    </FormHelperText>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={4}>
                                <TextField
                                    label="Output Key (Optional)"
                                    id="outputKey" value={outputKey} onChange={(e) => setOutputKey(e.target.value)}
                                    fullWidth variant="outlined"
                                    helperText={agentType === 'LoopAgent' ? "Looped agent's response saved here." : "Agent's response saved here."}
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField
                                    label={agentType === 'LoopAgent' ? "Looped Agent Instruction" : "Instruction (System Prompt)"}
                                    id="instruction" value={instruction} onChange={(e) => setInstruction(e.target.value)}
                                    multiline rows={5}
                                    placeholder="e.g., You are a helpful assistant."
                                    fullWidth variant="outlined"
                                    required={showParentConfig} // Instruction is required for Agent and LoopAgent's "looped agent"
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={enableCodeExecution}
                                            onChange={handleCodeExecutionChange}
                                            name="enableCodeExecution"
                                            disabled={codeExecutionDisabledByToolSelection}
                                        />
                                    }
                                    label="Enable Built-in Code Execution"
                                />
                                <FormHelperText sx={{ml:3.5, mt:-0.5}}>
                                    (For this agent or its looped child. Requires a Gemini 2 model. Cannot be used if other tools are selected.)
                                </FormHelperText>
                            </Grid>
                            <Grid item xs={12}>
                                <Typography variant="subtitle1" sx={{mb:1}}>
                                    {agentType === 'LoopAgent' ? "Tools for Looped Agent" : "Tools for Agent"}
                                </Typography>
                                <ToolSelector
                                    availableGofannonTools={availableGofannonTools}
                                    selectedTools={selectedTools}
                                    onSelectedToolsChange={handleSelectedToolsChange}
                                    onRefreshGofannon={handleRefreshGofannonTools}
                                    loadingGofannon={loadingTools}
                                    gofannonError={toolError}
                                    isCodeExecutionMode={enableCodeExecution}
                                />
                            </Grid>
                        </>
                    )}

                    {agentType === 'LoopAgent' && (
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="Max Loops" type="number" id="maxLoops"
                                value={maxLoops}
                                onChange={(e) => setMaxLoops(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                InputProps={{ inputProps: { min: 1 } }}
                                fullWidth variant="outlined"
                                helperText="Number of times the looped agent will run."
                            />
                        </Grid>
                    )}
                    {showChildConfig && (
                        <Grid item xs={12}>
                            <Typography variant="body2" color="text.secondary" sx={{mb:1}}>
                                For {agentType === 'SequentialAgent' ? 'Sequential Agents, these are executed in order.' : 'Parallel Agents, these are executed concurrently.'}
                                Model, Instruction, Tools, Output Key, and Code Execution are configured within each Child Agent/Step.
                            </Typography>
                            <Divider sx={{ my: 2 }} /> {/* Added Divider */}
                        </Grid>
                    )}

                    {showChildConfig && (
                        <Grid item xs={12}>
                            <Typography variant="h6" gutterBottom>{childAgentSectionTitle}</Typography>
                            <Stack direction="row" spacing={1} sx={{ mb: 2 }}> {/* Changed to Stack for buttons */}
                                <Button
                                    variant="outlined"
                                    startIcon={<AddCircleOutlineIcon />}
                                    onClick={handleOpenChildFormForNew}
                                >
                                    {agentType === 'SequentialAgent' ? 'Add New Step' : 'Add New Parallel Task'}
                                </Button>
                                <Button
                                    variant="outlined"
                                    color="secondary"
                                    startIcon={<LibraryAddIcon />}
                                    onClick={handleOpenExistingAgentSelector}
                                >
                                    Add Existing Agent as Step
                                </Button>
                            </Stack>
                            {childAgents.length > 0 ? (
                                <List dense sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                                    {childAgents.map((child, index) => (
                                        <ListItem key={child.id || index} divider={index < childAgents.length -1}>
                                            <ListItemText
                                                primary={`${index + 1}. ${child.name}`}
                                                secondary={
                                                    `Type: ${child.agentType || 'Agent'} | Model: ${child.model || 'N/A'} | ` +
                                                    `Tools: ${child.tools?.length || 0}${child.tools?.some(t => t.configuration) ? ' (some configured)' : ''} | ` +
                                                    `Code Exec: ${child.enableCodeExecution ? 'Yes' : 'No'} | OutputKey: ${child.outputKey || 'N/A'}`
                                                }
                                            />
                                            <ListItemSecondaryAction>
                                                <IconButton edge="end" aria-label="edit" onClick={() => handleOpenChildFormForEdit(child)}>
                                                    <EditIcon />
                                                </IconButton>
                                                <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteChildAgent(child.id)}>
                                                    <DeleteIcon />
                                                </IconButton>
                                            </ListItemSecondaryAction>
                                        </ListItem>
                                    ))}
                                </List>
                            ) : (
                                <Typography color="text.secondary" sx={{fontStyle: 'italic'}}>
                                    No child agents/steps added yet. A {agentType} requires at least one.
                                </Typography>
                            )}
                        </Grid>
                    )}

                    {formError && <Grid item xs={12}><FormHelperText error sx={{fontSize: '1rem', textAlign:'center'}}>{formError}</FormHelperText></Grid>}

                    <Grid item xs={12}>
                        <Button
                            type="submit" variant="contained" color="primary" size="large"
                            disabled={isSaving || !!nameError}
                            fullWidth
                            startIcon={isSaving ? <CircularProgress size={20} color="inherit" /> : null}
                        >
                            {isSaving ? 'Saving...' : (initialData.id ? 'Update Agent' : 'Create Agent')}
                        </Button>
                    </Grid>
                </Grid>
            </Box>

            <ChildAgentFormDialog
                open={isChildFormOpen}
                onClose={handleCloseChildForm}
                onSave={handleSaveChildAgent}
                childAgentData={editingChild} // Pass the actual child object here
                availableGofannonTools={availableGofannonTools}
                loadingGofannon={loadingTools}
                gofannonError={toolError}
                onRefreshGofannon={handleRefreshGofannonTools}
            />
            {/* New Dialog for selecting existing agents */}
            <ExistingAgentSelectorDialog
                open={isExistingAgentSelectorOpen}
                onClose={() => setIsExistingAgentSelectorOpen(false)}
                onAgentSelected={handleExistingAgentSelected}
            />
        </Paper>
    );
};

export default AgentForm;  