// src/components/agents/AgentList.js
import React from 'react';
import { Grid } from '@mui/material';
import AgentListItem from './AgentListItem';

const AgentList = ({ agents, onDeleteAgentConfig, onCopyAgent, onTogglePublic }) => {
    return (
        <Grid container spacing={3} alignItems="stretch">
            {agents.map(agent => (
                <Grid item xs={12} sm={6} md={4} key={agent.id}>
                    <AgentListItem
                        agent={agent}
                        onDeleteAgentConfig={onDeleteAgentConfig}
                        onCopyAgent={onCopyAgent}
                        onTogglePublic={onTogglePublic}
                    />
                </Grid>
            ))}
        </Grid>
    );
};

export default AgentList;  