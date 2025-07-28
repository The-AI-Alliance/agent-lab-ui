// src/components/agents/AgentListItem.js
import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Card, CardContent, CardActions, Typography, Button, Chip, Box, Switch, FormControlLabel } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import { getPlatformById } from '../../constants/platformConstants';
import { styled } from '@mui/material/styles';
import { useAuth } from '../../contexts/AuthContext';

const StyledCard = styled(Card)(({ theme }) => ({
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    height: '100%',
    transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
    '&:hover': {
        transform: 'translateY(-4px)',
        boxShadow: theme.shadows[6],
    }
}));

const getStatusChipColor = (status) => {
    // ... (existing implementation)
    switch (status) {
        case 'deployed': return 'success';
        case 'deploying_initiated':
        case 'deploying_in_progress':
        case 'deploying': return 'warning';
        case 'error':
        case 'error_not_found_after_init':
        case 'error_resource_vanished':
            return 'error';
        default: return 'default';
    }
};

const canDeleteAgentConfig = (status, isOwnerOrAdmin, platform) => {
    if (!isOwnerOrAdmin) return false;
    if (platform === 'a2a') return true;
    const nonDeletableStatuses = ['deployed', 'deploying_initiated', 'deploying_in_progress'];
    return !status || !nonDeletableStatuses.includes(status);
};

const AgentListItem = ({ agent, onDeleteAgentConfig, onCopyAgent, onTogglePublic }) => {
    const { currentUser } = useAuth();
    const platformInfo = agent.platform ? getPlatformById(agent.platform) : null;

    const isOwner = currentUser && agent.userId === currentUser.uid;
    const isAdmin = currentUser && currentUser.permissions?.isAdmin;
    const canManage = isOwner || isAdmin;

    const showDeleteButton = canDeleteAgentConfig(agent.deploymentStatus, canManage, agent.platform);

    const getEditLink = () => {
        if (agent.platform === 'a2a') {
            return `/agent/${agent.id}/edit-a2a`;
        }
        return `/agent/${agent.id}/edit`;
    };


    return (
        <StyledCard>
            <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="h5" component="h2" gutterBottom noWrap title={agent.name} sx={{pr: 1, mb: 0}}>
                        {agent.name}
                    </Typography>
                    {canManage && (
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={!!agent.isPublic}
                                    onChange={(e) => onTogglePublic(agent, e.target.checked)}
                                    size="small"
                                />
                            }
                            label="Public"
                            labelPlacement="start"
                            sx={{ ml: 1, mr: -1.5, mt: -0.5, color: 'text.secondary', '& .MuiTypography-root': { fontSize: '0.8rem' } }}
                        />
                    )}
                </Box>
                <Box sx={{ mb: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                    {agent.platform !== 'a2a' && (
                        <Chip
                            label={agent.deploymentStatus?.replace(/_/g, ' ') || 'Not Deployed'}
                            color={getStatusChipColor(agent.deploymentStatus)}
                            size="small"
                            sx={{ lineHeight: '1.3' }}
                        />
                    )}
                    {platformInfo && (
                        <Chip
                            label={platformInfo.name}
                            size="small"
                            variant="outlined"
                            title={`Platform: ${platformInfo.name}`}
                            sx={{ lineHeight: '1.3' }}
                        />
                    )}
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    Type: <Typography component="span" fontWeight="medium">{agent.agentType || 'Agent'}</Typography>
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5,  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={agent.litellm_model_string || agent.endpointUrl || 'N/A'}>
                    {agent.platform === 'a2a' ? 'Endpoint: ' : 'Model: '}
                    <Typography component="span" fontWeight="medium">
                        {agent.platform === 'a2a' ? (agent.endpointUrl || 'N/A') : (agent.litellm_model_string || 'N/A (LiteLLM)')}
                    </Typography>
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{fontSize: '0.7rem'}}>
                    Owner: {agent.userId === currentUser?.uid ? "You" : agent.userId?.substring(0,8)+'...'}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{
                    mt: 0.5, mb: 2,
                    display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2,
                    overflow: 'hidden', textOverflow: 'ellipsis', minHeight: '2.5em'
                }}>
                    {agent.description || "No description."}
                </Typography>
            </CardContent>
            <CardActions sx={{ justifyContent: 'flex-end', pt: 0, px:2, pb:2, gap: 1 }}>

                {currentUser && onCopyAgent && (
                    <Button
                        size="small"
                        variant="outlined"
                        onClick={() => onCopyAgent(agent)}
                        startIcon={<ContentCopyIcon />}
                    >
                        Copy
                    </Button>
                )}

                {canManage && (
                    <Button
                        size="small"
                        variant="outlined"
                        color="secondary"
                        component={RouterLink}
                        to={getEditLink()}
                        startIcon={<EditIcon />}
                    >
                        Edit
                    </Button>
                )}
                {showDeleteButton && onDeleteAgentConfig && canManage && (
                    <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        onClick={() => onDeleteAgentConfig(agent)}
                        startIcon={<DeleteIcon />}
                    >
                        Delete
                    </Button>
                )}
            </CardActions>
        </StyledCard>
    );
};

export default AgentListItem;  