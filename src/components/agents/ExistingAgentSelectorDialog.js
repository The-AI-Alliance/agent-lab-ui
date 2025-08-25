// src/components/agents/ExistingAgentSelectorDialog.js
import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    List, ListItemButton, ListItemText, CircularProgress, Alert, Typography, Box
} from '@mui/material';
import { getMyAgents } from '../../services/agentFirestoreService'; // UPDATED
import { useAuth } from '../../contexts/AuthContext';

const ExistingAgentSelectorDialog = ({ open, onClose, onAgentSelected }) => {
    const { currentUser } = useAuth();
    const [availableAgents, setAvailableAgents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (open && currentUser) {
            setLoading(true);
            setError(null);
            getMyAgents(currentUser.uid) // UPDATED
                .then(agents => {
                    setAvailableAgents(agents);
                })
                .catch(err => {
                    console.error("Error fetching existing agents:", err);
                    setError("Could not load existing agents. " + err.message);
                })
                .finally(() => setLoading(false));
        }
    }, [open, currentUser]);

    const handleSelectAgent = (agentConfig) => {
        onAgentSelected(agentConfig); // Pass the full config
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Select Existing Agent as a Step</DialogTitle>
            <DialogContent>
                {loading && <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}><CircularProgress /></Box>}
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                {!loading && !error && availableAgents.length === 0 && (
                    <Typography>No suitable existing agents found to add as a step.</Typography>
                )}
                {!loading && !error && availableAgents.length > 0 && (
                    <List dense>
                        {availableAgents.map(agent => (
                            <ListItemButton key={agent.id} onClick={() => handleSelectAgent(agent)}>
                                <ListItemText
                                    primary={agent.name}
                                    secondary={`Type: ${agent.agentType || 'Agent'} | Model: ${agent.litellm_model_string || 'N/A'}`}
                                />
                            </ListItemButton>
                        ))}
                    </List>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
            </DialogActions>
        </Dialog>
    );
};

export default ExistingAgentSelectorDialog;