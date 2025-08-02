// src/components/context_stuffing/ContextDisplayBubble.js
import React from 'react';
import { Paper, Typography, IconButton, Tooltip, Box } from '@mui/material';
import InfoIcon from '@mui/icons-material/Info'; // Or a more specific icon
import DatasetLinkedIcon from '@mui/icons-material/DatasetLinked'; // Example icon

const ContextDisplayBubble = ({ contextMessage, onOpenDetails }) => {
    const itemCount = contextMessage.items?.length || 0;
    let summaryText = `Context Stuffed: ${itemCount} item${itemCount !== 1 ? 's' : ''} added.`;

    if (itemCount === 1 && contextMessage.items[0]) {
        const item = contextMessage.items[0];
        const itemTypeDisplay = item.type?.replace(/_/g, ' ') || 'item';
        summaryText = `Context Added: "${item.name}" (${itemTypeDisplay})`;
    }


    return (
        <Paper
            elevation={1}
            sx={{
                p: 1.5,
                bgcolor: 'info.light', // Or a custom context color
                color: 'info.contrastText',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderRadius: 2,
                my: 1, // Matches existing ListItem margin in AgentRunner
            }}
        >
            <Box sx={{display: 'flex', alignItems: 'center'}}>
                <DatasetLinkedIcon sx={{ mr: 1, opacity: 0.8 }} />
                <Typography variant="body2" sx={{flexGrow: 1}}>{summaryText}</Typography>
            </Box>
            <Tooltip title="View Context Details">
                <IconButton onClick={onOpenDetails} size="small" sx={{ color: 'info.contrastText', opacity: 0.9 }}>
                    <InfoIcon fontSize="small" />
                </IconButton>
            </Tooltip>
        </Paper>
    );
};

export default ContextDisplayBubble;  