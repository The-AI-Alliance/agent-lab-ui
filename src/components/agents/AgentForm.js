// src/components/agents/AgentForm.js
import React, { useState, useEffect } from 'react';
import ToolSelector from '../tools/ToolSelector';
import ChildAgentFormDialog from './ChildAgentFormDialog';
import { fetchGofannonTools } from '../../services/agentService';
import { AGENT_TYPES, GEMINI_MODELS } from '../../constants/agentConstants';
import {
    TextField, Button, Select, MenuItem, FormControl, InputLabel,
    Paper, Grid, Box, CircularProgress, Typography, IconButton, List,
    ListItem, ListItemText, ListItemSecondaryAction, FormHelperText,
    Checkbox, FormControlLabel
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

const AgentForm = ({ onSubmit, initialData = {}, isSaving = false }) => {
    const [name, setName] = useState(initialData.name || '');
    const [description, setDescription] = useState(initialData.description || '');
    const [agentType, setAgentType] = useState(initialData.agentType || AGENT_TYPES[0]);
    const [model, setModel] = useState(initialData.model || GEMINI_MODELS[0]);
    const [instruction, setInstruction] = useState(initialData.instruction || '');
    const [selectedTools, setSelectedTools] = useState(initialData.tools || []);
    const [maxLoops, setMaxLoops] = useState(initialData.maxLoops || 3);
    const [enableCodeExecution, setEnableCodeExecution] = useState(initialData.enableCodeExecution || false);

    const [childAgents, setChildAgents] = useState(initialData.childAgents || []);
    const [isChildFormOpen, setIsChildFormOpen] = useState(false);
    const [editingChild, setEditingChild] = useState(null);

    const [availableGofannonTools, setAvailableGofannonTools] = useState([]);
    const [loadingTools, setLoadingTools] = useState(false);
    const [toolError, setToolError] = useState('');
    const [formError, setFormError] = useState('');

    const handleRefreshGofannonTools = async () => {
        setLoadingTools(true);
        setToolError('');
        try {
            const result = await fetchGofannonTools(); // Returns { success: bool, manifest?: array, message?: string }
            if (result.success && Array.isArray(result.manifest)) {
                setAvailableGofannonTools(result.manifest);
            } else {
                setToolError(result.message || "Could not load Gofannon tools or manifest is in an unexpected format.");
                setAvailableGofannonTools([]);
            }
        } catch (error) { // Should be less likely now as fetchGofannonTools handles its internal errors
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
        setSelectedTools(initialData.tools || []);
        setMaxLoops(initialData.maxLoops || 3);
        setEnableCodeExecution(initialData.enableCodeExecution || false);
        setChildAgents(initialData.childAgents || []);
        setFormError('');
    }, [initialData]);

    const handleSubmit = (e) => {
        e.preventDefault();
        setFormError('');

        if (!name.trim()) {
            setFormError("Agent Name is required.");
            return;
        }
        if ((agentType === 'SequentialAgent' || agentType === 'ParallelAgent') && childAgents.length === 0) {
            setFormError(`A ${agentType} requires at least one child agent.`);
            return;
        }

        const agentDataToSubmit = {
            name, description, agentType,
            model, instruction, tools: selectedTools,
            enableCodeExecution,
        };

        if (agentType === 'LoopAgent') {
            agentDataToSubmit.maxLoops = Number(maxLoops);
        }
        if (agentType === 'SequentialAgent' || agentType === 'ParallelAgent') {
            agentDataToSubmit.childAgents = childAgents;
        }

        if (initialData && initialData.platform) {
            agentDataToSubmit.platform = initialData.platform;
        }

        onSubmit(agentDataToSubmit);
    };

    const handleOpenChildForm = (childToEdit = null) => {
        setEditingChild(childToEdit);
        setIsChildFormOpen(true);
    };

    const handleCloseChildForm = () => {
        setIsChildFormOpen(false);
        setEditingChild(null);
    };

    const handleSaveChildAgent = (childData) => {
        if (editingChild) {
            setChildAgents(prev => prev.map(c => c.id === childData.id ? childData : c));
        } else {
            setChildAgents(prev => [...prev, childData]);
        }
    };

    const handleDeleteChildAgent = (childId) => {
        if (window.confirm("Are you sure you want to remove this child agent?")) {
            setChildAgents(prev => prev.filter(c => c.id !== childId));
        }
    };

    const showParentConfig = agentType === 'Agent' || agentType === 'LoopAgent';
    const showChildConfig = agentType === 'SequentialAgent' || agentType === 'ParallelAgent';

    return (
        <Paper elevation={3} sx={{ p: { xs: 2, md: 4 } }}>
            <Box component="form" onSubmit={handleSubmit} noValidate>
                <Grid container spacing={3}>
                    <Grid item xs={12}>
                        <TextField label="Agent Name" id="name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth variant="outlined" />
                    </Grid>
                    <Grid item xs={12}>
                        <TextField label="Description" id="description" value={description} onChange={(e) => setDescription(e.target.value)} multiline rows={3} fullWidth variant="outlined" />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <FormControl fullWidth variant="outlined">
                            <InputLabel id="agentType-label">Agent Type</InputLabel>
                            <Select labelId="agentType-label" id="agentType" value={agentType} onChange={(e) => setAgentType(e.target.value)} label="Agent Type">
                                {AGENT_TYPES.map(type => <MenuItem key={type} value={type}>{type}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Grid>

                    {showParentConfig && (
                        <>
                            <Grid item xs={12} sm={6}>
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
                            <Grid item xs={12}>
                                <TextField
                                    label={agentType === 'LoopAgent' ? "Looped Agent Instruction" : "Instruction (System Prompt)"}
                                    id="instruction" value={instruction} onChange={(e) => setInstruction(e.target.value)}
                                    multiline rows={5}
                                    placeholder="e.g., You are a helpful assistant."
                                    fullWidth variant="outlined"
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={enableCodeExecution}
                                            onChange={(e) => setEnableCodeExecution(e.target.checked)}
                                            name="enableCodeExecution"
                                        />
                                    }
                                    label="Enable Built-in Code Execution"
                                />
                                <FormHelperText sx={{ml:3.5, mt:-0.5}}>(For this agent or its looped child. Requires a Gemini 2 model compatible with code execution.)</FormHelperText>
                            </Grid>
                            <Grid item xs={12}>
                                <Typography variant="subtitle1" sx={{mb:1}}>
                                    {agentType === 'LoopAgent' ? "Tools for Looped Agent" : "Tools for Agent"}
                                </Typography>
                                <ToolSelector
                                    availableGofannonTools={availableGofannonTools}
                                    selectedTools={selectedTools}
                                    setSelectedTools={setSelectedTools}
                                    onRefreshGofannon={handleRefreshGofannonTools}
                                    loadingGofannon={loadingTools}
                                    gofannonError={toolError}
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
                                For Sequential/Parallel agents, configure Model, Instruction, Tools, and Code Execution within each Child Agent.
                                Any tools selected at this parent level for Sequential/Parallel agents are typically for context or reference and might not be directly executed by the orchestrator itself unless explicitly designed to do so.
                            </Typography>
                        </Grid>
                    )}

                    {showChildConfig && (
                        <Grid item xs={12}>
                            <Typography variant="h6" gutterBottom>Child Agents</Typography>
                            <Button
                                variant="outlined"
                                startIcon={<AddCircleOutlineIcon />}
                                onClick={() => handleOpenChildForm(null)}
                                sx={{ mb: 2 }}
                            >
                                Add Child Agent
                            </Button>
                            {childAgents.length > 0 ? (
                                <List dense sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                                    {childAgents.map((child, index) => (
                                        <ListItem key={child.id || index} divider={index < childAgents.length -1}>
                                            <ListItemText
                                                primary={child.name}
                                                secondary={`Model: ${child.model} | Tools: ${child.tools?.length || 0}${child.tools?.some(t => t.configuration) ? ' (some configured)' : ''} | Code Exec: ${child.enableCodeExecution ? 'Yes' : 'No'}`}
                                            />
                                            <ListItemSecondaryAction>
                                                <IconButton edge="end" aria-label="edit" onClick={() => handleOpenChildForm(child)}>
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
                                    No child agents added yet. A {agentType} requires at least one child.
                                </Typography>
                            )}
                        </Grid>
                    )}

                    {formError && <Grid item xs={12}><FormHelperText error sx={{fontSize: '1rem', textAlign:'center'}}>{formError}</FormHelperText></Grid>}

                    <Grid item xs={12}>
                        <Button
                            type="submit" variant="contained" color="primary" size="large"
                            disabled={isSaving} fullWidth
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
                childAgentData={editingChild}
                availableGofannonTools={availableGofannonTools}
                loadingGofannon={loadingTools}
                gofannonError={toolError}
                onRefreshGofannon={handleRefreshGofannonTools}
            />
        </Paper>
    );
};

export default AgentForm;  