// src/pages/AgentDetailsPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link as RouterLink, useNavigate } from 'react-router-dom';
import { getAgentDetails } from '../services/agentFirestoreService';
import { getModelDetails } from '../services/modelService';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import AgentDetailsDisplay from '../components/agents/AgentDetailsDisplay';
import { PLATFORM_IDS, getPlatformById } from '../constants/platformConstants';
import ChildAgentsDisplay from '../components/agents/ChildAgentsDisplay';
import DeploymentControls from '../components/agents/DeploymentControls';
import { checkAgentDeploymentStatus, deployAgent, deleteAgentDeployment } from '../services/agentService';


import {
    Container, Typography, Box, Paper, Grid, Button, Link as MuiLink, Alert,
    Divider, AlertTitle
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';

// A simple display for A2A Agent Card details
const A2ACardDisplay = ({ agent }) => {
    if (!agent || !agent.agentCard) return null;
    const card = agent.agentCard;

    return (
        <Paper variant="outlined" sx={{ p: 2, mt: 2, bgcolor: 'action.hover' }}>
            <Typography variant="h6" gutterBottom>A2A Agent Card</Typography>
            <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" color="text.secondary">Endpoint URL</Typography>
                    <MuiLink href={agent.endpointUrl} target="_blank" rel="noopener noreferrer" sx={{ wordBreak: 'break-all' }}>{agent.endpointUrl}</MuiLink>
                </Grid>
                <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" color="text.secondary">Version</Typography>
                    <Typography>{card.version}</Typography>
                </Grid>
                <Grid item xs={12}>
                    <Typography variant="subtitle2" color="text.secondary">Description</Typography>
                    <Typography>{card.description}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" color="text.secondary">Input Modes</Typography>
                    <Typography>{card.defaultInputModes?.join(', ') || 'N/A'}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                    <Typography variant="subtitle2" color="text.secondary">Output Modes</Typography>
                    <Typography>{card.defaultOutputModes?.join(', ') || 'N/A'}</Typography>
                </Grid>
                {card.skills && card.skills.length > 0 && (
                    <Grid item xs={12}>
                        <Typography variant="subtitle2" color="text.secondary">Skills</Typography>
                        <Box>
                            {card.skills.map(skill => (
                                <Alert severity="info" key={skill.id} sx={{mt: 1}}>
                                    <AlertTitle>{skill.name}</AlertTitle>
                                    <Typography variant="caption">{skill.description}</Typography>
                                </Alert>
                            ))}
                        </Box>
                    </Grid>
                )}
            </Grid>
        </Paper>
    );
};


const AgentDetailsPage = () => {
    const { agentId } = useParams();
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [agent, setAgent] = useState(null);
    const [model, setModel] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Deployment state
    const [isDeploying, setIsDeploying] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isCheckingStatus, setIsCheckingStatus] = useState(false);
    const [pollingIntervalId, setPollingIntervalId] = useState(null);
    const [deploymentError, setDeploymentError] = useState(null);

    const fetchAgent = useCallback(async () => {
        if (!agentId) return;
        try {
            const agentData = await getAgentDetails(agentId);
            setAgent(agentData);

            if (agentData.platform === PLATFORM_IDS.GOOGLE_VERTEX && agentData.modelId) {
                const modelData = await getModelDetails(agentData.modelId);
                setModel(modelData);
            }
        } catch (err) {
            setError(err.message);
        }
    }, [agentId]);

    useEffect(() => {
        setLoading(true);
        fetchAgent().finally(() => setLoading(false));
    }, [fetchAgent]);

    const handleManualStatusRefresh = useCallback(async () => {
        if (!agentId || isCheckingStatus) return;
        setIsCheckingStatus(true);
        try {
            await checkAgentDeploymentStatus(agentId);
            await fetchAgent(); // Re-fetch agent to get the latest status from Firestore
        } catch (err) {
            console.error("Error on manual status refresh:", err);
            setError("Failed to refresh deployment status.");
        } finally {
            setIsCheckingStatus(false);
        }
    }, [agentId, isCheckingStatus, fetchAgent]);

    // This effect manages the polling interval based on deployment status.
    useEffect(() => {
        if (agent && ['deploying_initiated', 'deploying_in_progress'].includes(agent.deploymentStatus)) {
            const newIntervalId = setInterval(handleManualStatusRefresh, 15000); // Poll every 15 seconds
            setPollingIntervalId(newIntervalId);

            // Cleanup function to stop polling when status changes or component unmounts
            return () => {
                clearInterval(newIntervalId);
                setPollingIntervalId(null);
            };
        }
    }, [agent, handleManualStatusRefresh]);

    const handleDeploy = async () => {
        if (!agent || isDeploying) return;
        setIsDeploying(true);
        setDeploymentError(null);
        try {
            const result = await deployAgent(agent, agentId);
            if (!result.success && result.wasTimeout) {
                setDeploymentError(result.message);
            }
            await fetchAgent(); // Refresh agent data
        } catch (err) {
            console.error("Deployment failed:", err);
            setDeploymentError(err.message || "An unexpected error occurred during deployment.");
        } finally {
            setIsDeploying(false);
        }
    };

    const handleDeleteDeployment = async () => {
        if (!agent || !agent.vertexAiResourceName || isDeleting) return;
        if (!window.confirm("Are you sure you want to delete the Vertex AI deployment? This action cannot be undone.")) return;
        setIsDeleting(true);
        setDeploymentError(null);
        try {
            await deleteAgentDeployment(agent.vertexAiResourceName, agentId);
            await fetchAgent(); // Refresh agent data
        } catch (err) {
            console.error("Deletion failed:", err);
            setDeploymentError(err.message || "An unexpected error occurred during deletion.");
        } finally {
            setIsDeleting(false);
        }
    };


    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}><LoadingSpinner /></Box>;
    if (error && !agent) return <ErrorMessage message={error} />;
    if (!agent) return <Typography>Agent not found.</Typography>;

    const isOwner = currentUser && agent.userId === currentUser.uid;
    const platformInfo = agent.platform ? getPlatformById(agent.platform) : { name: 'Unknown' };

    const getEditLink = () => {
        if (agent.platform === PLATFORM_IDS.A2A) return `/agent/${agent.id}/edit-a2a`;
        return `/agent/${agent.id}/edit`;
    };

    const isDeployable = agent.platform === PLATFORM_IDS.GOOGLE_VERTEX;
    const isChatCompatible = agent.platform === PLATFORM_IDS.GOOGLE_VERTEX || agent.platform === PLATFORM_IDS.A2A;

    return (
        <Container maxWidth="lg">
            {agent && (
                <Paper elevation={3} sx={{ p: { xs: 2, md: 4 }, mb: 4 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                        <Box>
                            <Typography variant="h4" component="h1">{agent.name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                                Platform: {platformInfo.name} | Agent ID: {agent.id}
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            {isChatCompatible && (
                                <Button
                                    variant="contained"
                                    onClick={() => navigate('/projects')}
                                    startIcon={<PlayCircleOutlineIcon />}
                                    title="Go to Projects to start a new chat with this agent"
                                >
                                    Start Chat
                                </Button>
                            )}
                            {isOwner && (
                                <Button variant="outlined" component={RouterLink} to={getEditLink()} startIcon={<EditIcon />}>
                                    Edit
                                </Button>
                            )}
                        </Box>
                    </Box>
                    <Divider sx={{ my: 2 }} />

                    {isDeployable && (
                        <>
                            <Box>
                                {deploymentError && <ErrorMessage message={deploymentError} severity="warning" sx={{ mb: 2 }} />}
                                <DeploymentControls
                                    agent={agent}
                                    isDeploying={isDeploying}
                                    isDeleting={isDeleting}
                                    isCheckingStatus={isCheckingStatus}
                                    pollingIntervalId={pollingIntervalId}
                                    onDeploy={handleDeploy}
                                    onDeleteDeployment={handleDeleteDeployment}
                                    onManualStatusRefresh={handleManualStatusRefresh}
                                    isLoadingPage={loading}
                                />
                            </Box>
                            <Divider sx={{ my: 3 }} />
                        </>
                    )}

                    {agent.platform === PLATFORM_IDS.A2A ? (
                        <A2ACardDisplay agent={agent} />
                    ) : (
                        <AgentDetailsDisplay agent={agent} model={model} />
                    )}
                    <ChildAgentsDisplay agent={agent} />
                </Paper>
            )}
        </Container>
    );
};

export default AgentDetailsPage;