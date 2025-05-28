// src/components/tools/ToolSelector.js
import React, { useMemo, useState } from 'react'; // Added useState
import {
    Typography, Button, Checkbox, FormControlLabel, FormGroup,
    Box, CircularProgress, Alert, Paper, Grid, FormHelperText, IconButton, Tooltip // Added IconButton, Tooltip
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SettingsIcon from '@mui/icons-material/Settings'; // For editing config
import CheckCircleIcon from '@mui/icons-material/CheckCircle'; // To show configured

import ToolSetupDialog from './ToolSetupDialog'; // Import the new dialog

// Renamed and defined ADK function tools
const PREDEFINED_ADK_FUNCTION_TOOLS = [
    {
        id: 'google_search_adk',
        name: 'Google Search (ADK Built-in)',
        description: 'Enables Google Search via ADK (Requires Gemini 2 model compatible with tool use).',
        type: 'adk_builtin_search' // Specific type for backend to identify
    },
    {
        id: 'vertex_ai_search_adk',
        name: 'Vertex AI Search (ADK Built-in)',
        description: 'Enables Vertex AI Search (Requires Gemini 2 model). Datastore ID configuration is not yet supported in this UI.',
        type: 'adk_builtin_vertex_search',
        requiresConfig: true // To disable or handle differently in UI
    },
];

const ToolSelector = ({
                          availableGofannonTools,
                          selectedTools, // Expects selectedTools to be [{ id, name, ..., configuration: {...} }]
                          setSelectedTools,
                          onRefreshGofannon,
                          loadingGofannon,
                          gofannonError
                      }) => {

    const [isSetupDialogOpen, setIsSetupDialogOpen] = useState(false);
    const [toolForSetup, setToolForSetup] = useState(null);
    const [existingConfigForSetup, setExistingConfigForSetup] = useState(null);


    const groupedGofannonTools = useMemo(() => {
        if (!availableGofannonTools || availableGofannonTools.length === 0) {
            return {};
        }
        return availableGofannonTools.reduce((acc, tool) => {
            const modulePath = tool.module_path || '';
            const lastDotIndex = modulePath.lastIndexOf('.');
            let packageName = 'Uncategorized';

            if (lastDotIndex !== -1) {
                packageName = modulePath.substring(0, lastDotIndex);
            } else if (modulePath) {
                packageName = `Module: ${modulePath}`;
            }

            if (!acc[packageName]) {
                acc[packageName] = [];
            }
            acc[packageName].push(tool);
            return acc;
        }, {});
    }, [availableGofannonTools]);

    const openSetupDialog = (toolManifestEntry, existingConfig = null) => {
        setToolForSetup(toolManifestEntry);
        setExistingConfigForSetup(existingConfig);
        setIsSetupDialogOpen(true);
    };

    const handleToolToggle = (toolManifestEntry, source) => {
        const isCurrentlySelected = selectedTools.some(st => st.id === toolManifestEntry.id);

        if (isCurrentlySelected) {
            // Deselecting: remove from selectedTools
            setSelectedTools(selectedTools.filter(st => st.id !== toolManifestEntry.id));
        } else {
            // Selecting
            let toolBaseData;
            if (source === 'gofannon') {
                toolBaseData = {
                    id: toolManifestEntry.id,
                    name: toolManifestEntry.name,
                    module_path: toolManifestEntry.module_path,
                    class_name: toolManifestEntry.class_name,
                    type: 'gofannon'
                };
            } else if (source === 'adk_builtin') {
                toolBaseData = {
                    id: toolManifestEntry.id,
                    name: toolManifestEntry.name,
                    type: toolManifestEntry.type
                };
            } else {
                return; // Should not happen
            }

            // Check if tool needs setup
            if (source === 'gofannon' && toolManifestEntry.setup_parameters && toolManifestEntry.setup_parameters.length > 0) {
                openSetupDialog(toolManifestEntry, null); // Pass null as no existing config for a new selection
                                                          // The actual adding to selectedTools happens in handleSaveSetup
            } else {
                // No setup needed, add directly
                setSelectedTools([...selectedTools, toolBaseData]);
            }
        }
    };

    const handleSaveSetup = (toolConfiguration) => {
        // toolForSetup is the manifest entry, not the selectedTool object yet
        if (!toolForSetup) return;

        const newSelectedTool = {
            id: toolForSetup.id,
            name: toolForSetup.name,
            module_path: toolForSetup.module_path, // Specific to Gofannon
            class_name: toolForSetup.class_name,   // Specific to Gofannon
            type: 'gofannon', // Assuming setup is only for Gofannon for now
            configuration: toolConfiguration,
        };

        // If editing, replace. If new, add.
        const existingToolIndex = selectedTools.findIndex(st => st.id === toolForSetup.id);
        if (existingToolIndex > -1) {
            const updatedSelectedTools = [...selectedTools];
            updatedSelectedTools[existingToolIndex] = newSelectedTool;
            setSelectedTools(updatedSelectedTools);
        } else {
            setSelectedTools([...selectedTools, newSelectedTool]);
        }
        setIsSetupDialogOpen(false);
        setToolForSetup(null);
        setExistingConfigForSetup(null);
    };

    const handleEditConfiguration = (toolId) => {
        const toolManifestEntry = availableGofannonTools.find(t => t.id === toolId);
        const selectedToolEntry = selectedTools.find(st => st.id === toolId);
        if (toolManifestEntry && selectedToolEntry) {
            openSetupDialog(toolManifestEntry, selectedToolEntry.configuration || {});
        }
    };


    const isToolConfigured = (toolId) => {
        const tool = selectedTools.find(st => st.id === toolId);
        return tool && tool.configuration && Object.keys(tool.configuration).length > 0;
    };


    return (
        <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6" component="h3">Select Gofannon Tools</Typography>
                <Button
                    variant="outlined"
                    size="small"
                    onClick={onRefreshGofannon}
                    disabled={loadingGofannon}
                    startIcon={loadingGofannon ? <CircularProgress size={16} /> : <RefreshIcon />}
                >
                    {loadingGofannon ? 'Refreshing...' : 'Refresh'}
                </Button>
            </Box>
            {gofannonError && <Alert severity="error" sx={{ mb: 1 }}>{gofannonError}</Alert>}
            {loadingGofannon && <Box sx={{display:'flex', justifyContent:'center', my:2}}><CircularProgress size={24} /></Box>}

            {!loadingGofannon && Object.keys(groupedGofannonTools).length > 0 ? (
                Object.entries(groupedGofannonTools)
                    .sort(([pkgA], [pkgB]) => pkgA.localeCompare(pkgB))
                    .map(([packageName, toolsInPackage]) => (
                        <Box key={packageName} sx={{ mb: 2 }}>
                            <Typography
                                variant="subtitle1"
                                component="h4"
                                sx={{ mt: 1, mb: 0.5, pb: 0.5, borderBottom: '1px solid', borderColor: 'divider', fontWeight: 'medium' }}
                            >
                                {packageName}
                            </Typography>
                            <FormGroup sx={{ pl: 1 }}>
                                <Grid container spacing={0}>
                                    {toolsInPackage
                                        .sort((a, b) => a.name.localeCompare(b.name))
                                        .map(tool => {
                                            const isSelected = selectedTools.some(st => st.id === tool.id);
                                            const configured = isToolConfigured(tool.id);
                                            const requiresSetup = tool.setup_parameters && tool.setup_parameters.length > 0;

                                            return (
                                                <Grid item xs={12} sm={6} key={tool.id} sx={{display: 'flex', alignItems: 'center'}}>
                                                    <FormControlLabel
                                                        control={
                                                            <Checkbox
                                                                checked={isSelected}
                                                                onChange={() => handleToolToggle(tool, 'gofannon')}
                                                                name={tool.id}
                                                                size="small"
                                                            />
                                                        }
                                                        label={
                                                            <Typography variant="body2" title={tool.description || tool.name}>
                                                                {tool.name}
                                                            </Typography>
                                                        }
                                                        sx={{ mr: 0, flexGrow:1 }}
                                                    />
                                                    {isSelected && requiresSetup && (
                                                        <Tooltip title={configured ? "Edit Configuration" : "Setup Tool"}>
                                                            <IconButton onClick={() => handleEditConfiguration(tool.id)} size="small">
                                                                {configured ? <CheckCircleIcon color="success" fontSize="small" /> : <SettingsIcon color="warning" fontSize="small" />}
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                </Grid>
                                            );
                                        })}
                                </Grid>
                            </FormGroup>
                        </Box>
                    ))
            ) : (
                !loadingGofannon && <Typography variant="body2" color="text.secondary">No Gofannon tools loaded or available. Click refresh.</Typography>
            )}

            {/* ADK Built-in Function Tools Section */}
            {PREDEFINED_ADK_FUNCTION_TOOLS.length > 0 && (
                <Box mt={3}>
                    <Typography variant="h6" component="h3" mb={1}>Select ADK Built-in Tools</Typography>
                    <FormGroup sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}>
                        <Grid container spacing={1}>
                            {PREDEFINED_ADK_FUNCTION_TOOLS.map(tool => (
                                <Grid item xs={12} sm={6} key={tool.id}>
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={selectedTools.some(st => st.id === tool.id)}
                                                onChange={() => handleToolToggle(tool, 'adk_builtin')}
                                                name={tool.id}
                                                disabled={tool.requiresConfig}
                                                size="small"
                                            />
                                        }
                                        label={<Typography variant="body2" title={tool.description}>{tool.name}</Typography>}
                                    />
                                    {tool.requiresConfig && <FormHelperText sx={{ml:3.5, mt:-0.5}}>Setup via UI pending</FormHelperText>}
                                </Grid>
                            ))}
                        </Grid>
                    </FormGroup>
                </Box>
            )}

            {selectedTools.length > 0 && (
                <Box mt={2}>
                    <Typography variant="subtitle1" component="h4">Selected Tools ({selectedTools.length}):</Typography>
                    <Box component="ul" sx={{ pl: 2, listStyle: 'disc', maxHeight: 100, overflowY: 'auto' }}>
                        {selectedTools.map(st => (
                            <Typography component="li" variant="body2" key={st.id} color="text.secondary">
                                {st.name} ({
                                st.type === 'adk_builtin_search' ? 'ADK Search' :
                                    st.type === 'adk_builtin_vertex_search' ? 'ADK Vertex Search' :
                                        st.type === 'gofannon' ? `Gofannon${st.configuration ? ' (Configured)' : ''}` :
                                            st.type || 'Unknown'
                            })
                            </Typography>
                        ))}
                    </Box>
                </Box>
            )}

            {toolForSetup && (
                <ToolSetupDialog
                    open={isSetupDialogOpen}
                    onClose={() => {
                        setIsSetupDialogOpen(false);
                        setToolForSetup(null); // Important to clear
                        setExistingConfigForSetup(null);
                    }}
                    tool={toolForSetup}
                    onSave={handleSaveSetup}
                    existingConfiguration={existingConfigForSetup}
                />
            )}
        </Paper>
    );
};

export default ToolSelector;  