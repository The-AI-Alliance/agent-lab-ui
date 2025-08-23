// src/components/agents/AgentForm.js
import React, {useState, useEffect} from 'react';
import ToolSelector from '../tools/ToolSelector';
import ChildAgentFormDialog from './ChildAgentFormDialog';
import ExistingAgentSelectorDialog from './ExistingAgentSelectorDialog';
import { AGENT_TYPES } from '../../constants/agentConstants';
import { v4 as uuidv4 } from 'uuid';
import {
    TextField, Button, Select, MenuItem, FormControl, InputLabel,
    Paper, Grid, Box, CircularProgress, Typography, IconButton, List,
    ListItem, ListItemText, ListItemSecondaryAction, FormHelperText,
     Stack, Alert
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import LibraryAddIcon from '@mui/icons-material/LibraryAdd';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

// New Imports
import ProjectSelector from '../projects/ProjectSelector';
import ModelSelector from '../models/ModelSelector';
import { validateAgentName } from '../../utils/agentValidation';


const AgentForm = ({ onSubmit, initialData = {}, isSaving = false }) => {
    const [name, setName] = useState(initialData.name || '');
    const [description, setDescription] = useState(initialData.description || '');
    const [agentType, setAgentType] = useState(initialData.agentType || AGENT_TYPES[0]);

    // --- New State for Model and Project selection ---
    const [projectIds, setProjectIds] = useState(initialData.projectIds || []);
    const [modelId, setModelId] = useState(initialData.modelId || '');

    // --- State for Tools and Children (mostly unchanged) ---
    const [selectedTools, setSelectedTools] = useState(initialData.tools || []);
    const [maxLoops, setMaxLoops] = useState(initialData.maxLoops || 3);
    const [outputKey, setOutputKey] = useState(initialData.outputKey || '');
    const [usedCustomRepoUrls, setUsedCustomRepoUrls] = useState(initialData.usedCustomRepoUrls || []);
    const [usedMcpServerUrls, setUsedMcpServerUrls] = useState(initialData.usedMcpServerUrls || []);

    const [childAgents, setChildAgents] = useState(initialData.childAgents || []);
    const [isChildFormOpen, setIsChildFormOpen] = useState(false);
    const [isExistingAgentSelectorOpen, setIsExistingAgentSelectorOpen] = useState(false);
    const [editingChild, setEditingChild] = useState(null);

    const [formError, setFormError] = useState('');
    const [nameError, setNameError] = useState('');

    useEffect(() => {
        setChildAgents((initialData.childAgents || []).map(ca => ({ ...ca, id: ca.id || uuidv4() })));
    }, [initialData.childAgents]);


    const handleSelectedToolsChange = (newTools) => {
        setSelectedTools(newTools);
        const currentCustomRepoUrls = newTools
            .filter(st => st.type === 'custom_repo' && st.sourceRepoUrl)
            .map(st => st.sourceRepoUrl);
        setUsedCustomRepoUrls(Array.from(new Set(currentCustomRepoUrls)));

        const currentMcpServerUrls = newTools
            .filter(st => st.type === 'mcp' && st.mcpServerUrl)
            .map(st => st.mcpServerUrl);
        setUsedMcpServerUrls(Array.from(new Set(currentMcpServerUrls)));
    };

    const handleNameChange = (event) => {
        const newName = event.target.value;
        setName(newName);
        setNameError(validateAgentName(newName) || '');
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

        if ((agentType === 'Agent' || agentType === 'LoopAgent') && !modelId) {
            setFormError('A Model must be selected for this agent type.');
            return;
        }

        const agentDataToSubmit = {
            name, description, agentType, projectIds, modelId,
            tools: selectedTools,
            usedCustomRepoUrls,
            usedMcpServerUrls,
            outputKey: outputKey.trim() || null,
        };

        if (agentType === 'LoopAgent') {
            agentDataToSubmit.maxLoops = Number(maxLoops);
        }
        if (agentType === 'SequentialAgent' || agentType === 'ParallelAgent') {
            agentDataToSubmit.childAgents = childAgents.map(ca => {
                const { id, ...restOfConfig } = ca;
                return restOfConfig;
            });
            // Orchestrators don't use a top-level model, so clear it
            delete agentDataToSubmit.modelId;
        }

        // Add platform info if it exists (from create flow)
        if (initialData.platform) {
            agentDataToSubmit.platform = initialData.platform;
        }

        onSubmit(agentDataToSubmit);
    };

    // --- Child Agent Handlers (Unchanged) ---
    const handleOpenChildFormForNew = () => { setEditingChild(null); setIsChildFormOpen(true); };
    const handleOpenChildFormForEdit = (child) => { setEditingChild(child); setIsChildFormOpen(true); };
    const handleCloseChildForm = () => { setIsChildFormOpen(false); setEditingChild(null); };
    const handleDeleteChildAgent = (childId) => { if (window.confirm("Remove this step?")) { setChildAgents(prev => prev.filter(c => c.id !== childId)); } };
    const handleOpenExistingAgentSelector = () => { setIsExistingAgentSelectorOpen(true); };
    const handleExistingAgentSelected = (agentConfig) => {
        setChildAgents(prev => [...prev, { ...agentConfig, id: uuidv4() }]);
        setIsExistingAgentSelectorOpen(false);
    };
    const handleSaveChildAgent = (childData) => {
        if (editingChild?.id) {
            setChildAgents(prev => prev.map(c => c.id === editingChild.id ? { ...childData, id: editingChild.id } : c));
        } else {
            setChildAgents(prev => [...prev, { ...childData, id: uuidv4() }]);
        }
        setEditingChild(null);
    };


    const showParentConfig = agentType === 'Agent' || agentType === 'LoopAgent';
    const showChildConfig = agentType === 'SequentialAgent' || agentType === 'ParallelAgent';
    const childAgentSectionTitle = agentType === 'SequentialAgent' ? "Sequential Steps" : "Parallel Tasks";

    return (
        <Paper elevation={3} sx={{ p: { xs: 2, md: 4 } }}>
            <Box component="form" onSubmit={handleSubmit} noValidate>
                <Grid container spacing={3}>
                    <Grid item xs={12}>
                        <TextField
                            label="Agent Name" value={name} onChange={handleNameChange}
                            required fullWidth variant="outlined" error={!!nameError}
                            helperText={nameError || "Identifier for the agent. No spaces. Cannot be 'user'."}
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} multiline rows={2} fullWidth variant="outlined" />
                    </Grid>
                    <Grid item xs={12}>
                        <ProjectSelector
                            selectedProjectIds={projectIds}
                            onSelectionChange={setProjectIds}
                            helperText="Associate this agent with projects. This will determine which Models are available."
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <FormControl fullWidth variant="outlined">
                            <InputLabel id="agentType-label">Agent Type</InputLabel>
                            <Select labelId="agentType-label" value={agentType} onChange={(e) => setAgentType(e.target.value)} label="Agent Type">
                                {AGENT_TYPES.map(type => <MenuItem key={type} value={type}>{type}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Grid>

                    {showParentConfig && (
                        <>
                            <Grid item xs={12}>
                                <ModelSelector
                                    selectedModelId={modelId}
                                    onSelectionChange={setModelId}
                                    projectIds={projectIds}
                                    required
                                    helperText="Select a model. The model's system prompt and temperature will be used."
                                    disabled={projectIds.length === 0}
                                />
                                {projectIds.length === 0 && <FormHelperText error>Please select a project first to see available models.</FormHelperText>}
                            </Grid>
                            <Grid item xs={12}>
                                <TextField
                                    label="Output Key (Optional)"
                                    value={outputKey} onChange={(e) => setOutputKey(e.target.value)}
                                    fullWidth variant="outlined"
                                    helperText="If set, the agent's final text response is saved to this key in the session state."
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <Typography variant="subtitle1" sx={{mb:1}}>
                                    Tools
                                </Typography>
                                <ToolSelector
                                    selectedTools={selectedTools}
                                    onSelectedToolsChange={handleSelectedToolsChange}
                                    onUsedCustomRepoUrlsChange={setUsedCustomRepoUrls}
                                    onUsedMcpServerUrlsChange={setUsedMcpServerUrls}
                                />
                            </Grid>
                        </>
                    )}

                    {agentType === 'LoopAgent' && (
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="Max Loops" type="number"
                                value={maxLoops}
                                onChange={(e) => setMaxLoops(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                InputProps={{ inputProps: { min: 1 } }}
                                fullWidth variant="outlined"
                                helperText="Number of times the agent will run in a loop."
                            />
                        </Grid>
                    )}

                    {showChildConfig && (
                        <Grid item xs={12}>
                            <Typography variant="h6" gutterBottom>{childAgentSectionTitle}</Typography>
                            <Alert severity="info" sx={{mb: 2}}>For orchestrators, model and tool configurations are defined within each child step.</Alert>
                            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                                <Button variant="outlined" startIcon={<AddCircleOutlineIcon />} onClick={handleOpenChildFormForNew} >
                                    Add New Step
                                </Button>
                                <Button variant="outlined" color="secondary" startIcon={<LibraryAddIcon />} onClick={handleOpenExistingAgentSelector} >
                                    Add Existing Agent as Step
                                </Button>
                            </Stack>
                            {childAgents.length > 0 ? (
                                <List dense sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                                    {childAgents.map((child, index) => (
                                        <ListItem key={child.id || index} divider={index < childAgents.length -1}>
                                            <ListItemText
                                                primary={`${index + 1}. ${child.name}`}
                                                secondary={`Type: ${child.agentType || 'Agent'} | Model ID: ${child.modelId || 'N/A'}`}
                                            />
                                            <ListItemSecondaryAction>
                                                <IconButton onClick={() => handleOpenChildFormForEdit(child)}><EditIcon /></IconButton>
                                                <IconButton onClick={() => handleDeleteChildAgent(child.id)}><DeleteIcon /></IconButton>
                                            </ListItemSecondaryAction>
                                        </ListItem>
                                    ))}
                                </List>
                            ) : (
                                <Typography color="text.secondary">No steps added yet.</Typography>
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
                childAgentData={editingChild}
            />
            <ExistingAgentSelectorDialog
                open={isExistingAgentSelectorOpen}
                onClose={() => setIsExistingAgentSelectorOpen(false)}
                onAgentSelected={handleExistingAgentSelected}
            />
        </Paper>
    );
};

export default AgentForm;