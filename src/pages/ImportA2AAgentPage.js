// src/pages/ImportA2AAgentPage.js
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { fetchA2AAgentCard } from '../services/agentService';
import { createAgentInFirestore, getAgentDetails, updateAgentInFirestore } from '../services/agentFirestoreService';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import ProjectSelector from '../components/projects/ProjectSelector';

import {
    Container, Typography, Paper, TextField, Button, Box, CircularProgress,
    Grid, Alert, Link as MuiLink, AlertTitle
} from '@mui/material';

const A2ACardDisplay = ({ card, url }) => (
    <Paper variant="outlined" sx={{ p: 2, mt: 2, bgcolor: 'action.hover' }}>
        <AlertTitle>Agent Details Fetched</AlertTitle>
        <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Name</Typography>
                <Typography>{card.name}</Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">Version</Typography>
                <Typography>{card.version}</Typography>
            </Grid>
            <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary">Description</Typography>
                <Typography>{card.description}</Typography>
            </Grid>
            <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary">Endpoint URL</Typography>
                <MuiLink href={url} target="_blank" rel="noopener noreferrer" sx={{ wordBreak: 'break-all' }}>{url}</MuiLink>
            </Grid>
        </Grid>
    </Paper>
);

const ImportA2AAgentPage = ({ isEditMode = false }) => {
    const { agentId } = useParams();
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    const [step, setStep] = useState(isEditMode ? 2 : 1);
    const [endpointUrl, setEndpointUrl] = useState('');
    const [agentCard, setAgentCard] = useState(null);

    // Editable fields
    const [localName, setLocalName] = useState('');
    const [localDescription, setLocalDescription] = useState('');
    const [projectIds, setProjectIds] = useState([]);
    const [outputKey, setOutputKey] = useState('');

    const [loading, setLoading] = useState(isEditMode);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isEditMode && agentId) {
            const fetchAgent = async () => {
                setLoading(true);
                try {
                    const agent = await getAgentDetails(agentId);
                    if (agent.userId !== currentUser.uid || agent.platform !== 'a2a') {
                        setError("You are not authorized to edit this agent, or it is not an A2A agent.");
                        return;
                    }
                    setEndpointUrl(agent.endpointUrl);
                    setAgentCard(agent.agentCard);
                    setLocalName(agent.name);
                    setLocalDescription(agent.description);
                    setProjectIds(agent.projectIds || []);
                    setOutputKey(agent.outputKey || '');
                } catch (err) {
                    setError(`Failed to load agent: ${err.message}`);
                } finally {
                    setLoading(false);
                }
            };
            fetchAgent();
        }
    }, [isEditMode, agentId, currentUser]);

    const handleFetchCard = async () => {
        if (!endpointUrl.trim()) {
            setError('Endpoint URL is required.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const result = await fetchA2AAgentCard(endpointUrl.trim());
            if (result.success) {
                setAgentCard(result.agentCard);
                setLocalName(result.agentCard.name);
                setLocalDescription(result.agentCard.description);
                setStep(2);
            } else {
                throw new Error(result.message || "Failed to fetch agent card.");
            }
        } catch (err) {
            const message = err.details?.message || err.message || "An unknown error occurred.";
            setError(`Failed to fetch agent details: ${message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveAgent = async () => {
        if (!localName.trim()) {
            setError('Local Name is required.');
            return;
        }
        setIsSaving(true);
        setError('');
        try {
            const agentData = {
                name: localName.trim(),
                description: localDescription.trim(),
                projectIds,
                outputKey: outputKey.trim() || null,
                platform: 'a2a',
                endpointUrl: endpointUrl,
                agentCard: agentCard,
                agentType: 'A2AAgent', // To distinguish from ADK agent types
            };
            if (isEditMode) {
                await updateAgentInFirestore(agentId, agentData);
                navigate(`/agent/${agentId}`);
            } else {
                const newAgentId = await createAgentInFirestore(currentUser.uid, agentData);
                navigate(`/agent/${newAgentId}`);
            }
        } catch (err) {
            setError(`Failed to save agent: ${err.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    if (loading && isEditMode) return <LoadingSpinner />;

    return (
        <Container maxWidth="md">
            <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 3 }}>
                {isEditMode ? 'Edit A2A Compliant Agent' : 'Add A2A Compliant Agent'}
            </Typography>
            <Paper sx={{ p: { xs: 2, md: 4 } }}>
                {step === 1 && !isEditMode && (
                    <Box>
                        <Typography gutterBottom>Enter the root URL of the A2A compliant agent to fetch its details.</Typography>
                        <TextField
                            label="Agent Endpoint URL"
                            value={endpointUrl}
                            onChange={(e) => setEndpointUrl(e.target.value)}
                            required
                            fullWidth
                            variant="outlined"
                            margin="normal"
                            placeholder="e.g., http://localhost:10001/"
                        />
                        <Button
                            variant="contained"
                            onClick={handleFetchCard}
                            disabled={loading}
                            startIcon={loading ? <CircularProgress size={20} /> : null}
                        >
                            {loading ? 'Fetching...' : 'Fetch Agent Details'}
                        </Button>
                    </Box>
                )}

                {step === 2 && agentCard && (
                    <Grid container spacing={3}>
                        <Grid item xs={12}>
                            <Alert severity="success">
                                <A2ACardDisplay card={agentCard} url={endpointUrl} />
                            </Alert>
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                label="Local Name"
                                value={localName}
                                onChange={(e) => setLocalName(e.target.value)}
                                required
                                fullWidth
                                helperText="A name for this agent within AgentLab."
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                label="Local Description"
                                value={localDescription}
                                onChange={(e) => setLocalDescription(e.target.value)}
                                multiline
                                rows={2}
                                fullWidth
                                helperText="A local description for this agent."
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <ProjectSelector
                                selectedProjectIds={projectIds}
                                onSelectionChange={setProjectIds}
                                helperText="Associate this remote agent with projects."
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                label="Output Key (Optional)"
                                value={outputKey}
                                onChange={(e) => setOutputKey(e.target.value)}
                                fullWidth
                                helperText="If set, the agent's final text response is saved to this key in the session state."
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <Button
                                variant="contained"
                                color="primary"
                                onClick={handleSaveAgent}
                                disabled={isSaving}
                                startIcon={isSaving ? <CircularProgress size={20} /> : null}
                            >
                                {isSaving ? 'Saving...' : (isEditMode ? 'Update Agent' : 'Save Agent')}
                            </Button>
                        </Grid>
                    </Grid>
                )}
                {error && <ErrorMessage message={error} sx={{mt: 2}} />}
            </Paper>
        </Container>
    );
};

export default ImportA2AAgentPage;