import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom'; // Added useLocation
import AgentForm from '../components/agents/AgentForm';
import { useAuth } from '../contexts/AuthContext';
import { createAgentInFirestore, getAgentDetails, updateAgentInFirestore } from '../services/agentFirestoreService';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import { Container, Typography, Box } from '@mui/material';
import { PLATFORM_IDS, getPlatformById } from '../constants/platformConstants'; // For default platform and title
import {
    DEFAULT_LITELLM_MODEL_STRING,
    DEFAULT_LITELLM_PROVIDER_ID, // Added import
    DEFAULT_LITELLM_BASE_MODEL_ID, // Added import
    MODEL_PROVIDERS_LITELLM      // Added import
} from '../constants/agentConstants';

const CreateAgentPage = ({ isEditMode = false }) => {
    const navigate = useNavigate();
    const location = useLocation(); // New
    const { currentUser } = useAuth();
    const { agentId } = useParams();

    const [initialAgentData, setInitialAgentData] = useState(null); // Will include childAgents, maxLoops etc.
    const [loading, setLoading] = useState(isEditMode);
    const [error, setError] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isEditMode && agentId && currentUser) {
            const fetchAgent = async () => {
                setLoading(true);
                setError(null);
                try {
                    const agent = await getAgentDetails(agentId);
                    if (agent.userId !== currentUser.uid) {
                        setError("You are not authorized to edit this agent.");
                        setInitialAgentData(null);
                        return;
                    }
                    // Logic to parse provider and base model from agent.litellm_model_string
                    let providerId = DEFAULT_LITELLM_PROVIDER_ID;
                    let baseModelId = DEFAULT_LITELLM_BASE_MODEL_ID;
                    if (agent.litellm_model_string) {
                        const foundProvider = MODEL_PROVIDERS_LITELLM.find(
                            p => p.prefix && agent.litellm_model_string.startsWith(p.prefix)
                        );
                        if (foundProvider) {
                            providerId = foundProvider.id;
                            const modelPart = agent.litellm_model_string.substring(foundProvider.prefix.length);
                            if (foundProvider.models.some(m => m.id === modelPart)) {
                                baseModelId = modelPart;
                            } else {
                                baseModelId = ''; // Model part not in predefined list for this provider
                            }
                        } else {
                            providerId = 'custom'; // Assume custom if no known prefix matches
                            baseModelId = '';
                        }
                    }

                    setInitialAgentData({
                        ...agent,
                        platform: agent.platform || PLATFORM_IDS.GOOGLE_VERTEX,
                        childAgents: agent.childAgents || [],
                        maxLoops: agent.maxLoops || 3,
                        // Set for the form's new state structure
                        selectedProviderId: providerId,
                        selectedBaseModelId: baseModelId,
                        // Keep original values for direct use if custom or for display/reference
                        litellm_model_string: agent.litellm_model_string || DEFAULT_LITELLM_MODEL_STRING,
                        litellm_api_base: agent.litellm_api_base || '',
                        litellm_api_key: agent.litellm_api_key || '',
                    });
                } catch (err) {
                    console.error("Error fetching agent for edit:", err);
                    setError(`Failed to load agent details: ${err.message}`);
                } finally {
                    setLoading(false);
                }
            };
            fetchAgent();
        } else if (!isEditMode) {
            const platformFromState = location.state?.platformId || PLATFORM_IDS.GOOGLE_VERTEX;
            if (platformFromState !== PLATFORM_IDS.GOOGLE_VERTEX) {
                setError(`Cannot create agent for platform ID "${platformFromState}" via this form. Please select Google Vertex AI.`);
                setLoading(false);
                return;
            }
            setInitialAgentData({
                name: '',
                description: '',
                agentType: 'Agent',
                selectedProviderId: DEFAULT_LITELLM_PROVIDER_ID,
                selectedBaseModelId: DEFAULT_LITELLM_BASE_MODEL_ID,
                litellm_model_string: DEFAULT_LITELLM_MODEL_STRING,
                litellm_api_base: '',
                litellm_api_key: '',
                instruction: '',
                tools: [],
                maxLoops: 3,
                childAgents: [],
                platform: platformFromState,
            });
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEditMode, agentId, currentUser, location.state]); // Added location.state


    const handleSaveAgent = async (agentData) => { // agentData now includes childAgents, maxLoops
        if (!currentUser) {
            setError("You must be logged in to save an agent.");
            return;
        }
        setIsSubmitting(true);
        setError(null);
        try {
            let newAgentId;
            const finalAgentData = {
                ...agentData,
                platform: agentData.platform || (initialAgentData?.platform || PLATFORM_IDS.GOOGLE_VERTEX), // Ensure platform is set
                childAgents: agentData.childAgents ? agentData.childAgents.map(ca => {
                    const { id, ...rest } = ca; // Remove client-side id
                    return rest;
                }) : []
            };


            if (isEditMode && agentId) {
                await updateAgentInFirestore(agentId, finalAgentData);
                newAgentId = agentId;
                alert("Agent updated successfully!");
            } else {
                if (!finalAgentData.platform) {
                    setError("Platform information is missing. Cannot create agent.");
                    setIsSubmitting(false);
                    return;
                }
                newAgentId = await createAgentInFirestore(currentUser.uid, finalAgentData);
                alert("Agent created successfully!");
            }
            navigate(`/agent/${newAgentId}`);
        } catch (err) {
            console.error("Error saving agent:", err);
            const errorMessage = `Failed to ${isEditMode ? 'update' : 'create'} agent. ${err.message || 'Please try again.'}`;
            setError(errorMessage);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <Box display="flex" justifyContent="center" py={5}><LoadingSpinner /></Box>;
    if (error && (!initialAgentData || (isEditMode && !initialAgentData))) return <Container><ErrorMessage message={error} /></Container>;

    // Ensure initialAgentData is available before rendering AgentForm
    if (!initialAgentData) {
        // This case should ideally be covered by loading or error states
        return <Box display="flex" justifyContent="center" py={5}><Typography>Loading agent data or preparing form...</Typography></Box>;
    }

    const pageTitlePlatformName = initialAgentData?.platform
        ? (getPlatformById(initialAgentData.platform)?.name || 'Agent') // Use platform name from constants
        : 'Agent'; // Fallback if platform somehow missing, though unlikely with new flow

    return (
        <Container maxWidth="md">
            <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 3 }}>
                {isEditMode ?
                    `Edit ${pageTitlePlatformName} Agent` :
                    `Create New ${pageTitlePlatformName} Agent`
                }
            </Typography>
            {error && !isSubmitting && <ErrorMessage message={error} sx={{ mb: 2 }} />}

            <AgentForm
                onSubmit={handleSaveAgent}
                initialData={initialAgentData}
                isSaving={isSubmitting}
            />
        </Container>
    );
};

export default CreateAgentPage;