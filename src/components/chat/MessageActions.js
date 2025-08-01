// src/components/chat/MessageActions.js
// src/components/chat/MessageActions.js
import React from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import CallSplitIcon from '@mui/icons-material/CallSplit';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import DeveloperModeIcon from '@mui/icons-material/DeveloperMode';

const MessageActions = ({ message, messagesMap, activePath, onNavigate, onFork, onViewLog, getChildrenForMessage, findLeafOfBranch, isAssistantMessage }) => {     const children = getChildrenForMessage(messagesMap, message.id);
    const hasForks = children.length > 1;
    const isContextMessage = message.participant === 'context_stuffed';

    // Find which of my children is in the active path
    const activeChild = hasForks ? children.find(child => activePath.some(pathMsg => pathMsg.id === child.id)) : null;
    // Default to the latest fork if the active path doesn't contain any of the children
    const activeIndex = activeChild ? children.indexOf(activeChild) : children.length - 1;

    const handleNav = (direction) => {
        let newIndex = activeIndex + direction;
        if (newIndex < 0) newIndex = children.length - 1;
        if (newIndex >= children.length) newIndex = 0;
        const newBranchRootId = children[newIndex].id;
        const newLeafId = findLeafOfBranch(messagesMap, newBranchRootId);
        onNavigate(newLeafId);
    };

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: isContextMessage ? 'flex-end' : 'center', mt: 0.5, height: '34px', position: 'relative' }}>
            {hasForks && (
                <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'action.hover', borderRadius: 1, p: 0.2 }}>
                    <Tooltip title="Previous Fork">
                        <IconButton size="small" onClick={() => handleNav(-1)}><ChevronLeft /></IconButton>
                    </Tooltip>
                    <Typography variant="caption" sx={{ mx: 1, fontWeight: 'medium', whiteSpace: 'nowrap' }}>
                        Fork {activeIndex + 1} / {children.length}
                    </Typography>
                    <Tooltip title="Next Fork">
                        <IconButton size="small" onClick={() => handleNav(1)}><ChevronRight /></IconButton>
                    </Tooltip>
                </Box>
            )}
            <Box sx={{ position: isContextMessage ? 'static' : 'absolute', right: 0, top: '50%', transform: isContextMessage ? 'none' : 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
                {isAssistantMessage && (
                    <Tooltip title="View Agent Reasoning Log">
                        <IconButton size="small" onClick={() => onViewLog(message.id)}>
                            <DeveloperModeIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
                <Tooltip title="Create a new response from this point">
                    <IconButton size="small" onClick={() => onFork(message.id)}>
                        <CallSplitIcon fontSize="small" style={{ transform: "rotate(180deg)" }} />
                    </IconButton>
                </Tooltip>
            </Box>
        </Box>
    );
};

export default MessageActions;