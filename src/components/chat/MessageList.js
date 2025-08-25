// src/components/chat/MessageList.js
import React, { useRef, useEffect } from 'react';
import { Box } from '@mui/material';
import MessageBubble from './MessageBubble';

const MessageList = ({ conversationPath, models, agents, currentUser, messagesMap, activePath, isReadOnly, onFork, onNavigateBranch, onViewLog, onOpenContextDetails, messageContentCache }) => {
    const chatEndRef = useRef(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [conversationPath]);

    return (
        <Box sx={{
            width: '100%', maxWidth: { xs: '100%', sm: '98%', md: '95%', lg: '90%', xl: '85%' },
            mx: 'auto', bgcolor: 'background.paper', borderRadius: 2, border: '1px solid',
            borderColor: 'divider', p: 2, minHeight: 320, overflowY: 'auto',
            maxHeight: '60vh', display: 'flex', flexDirection: 'column'
        }}>
            {conversationPath.map(msg => (
                <MessageBubble
                    key={msg.id}
                    msg={msg}
                    models={models}
                    agents={agents}
                    currentUser={currentUser}
                    messagesMap={messagesMap}
                    activePath={activePath}
                    isReadOnly={isReadOnly}
                    onFork={onFork}
                    onNavigateBranch={onNavigateBranch}
                    onViewLog={onViewLog}
                    onOpenContextDetails={onOpenContextDetails}
                    messageContentCache={messageContentCache}
                />
            ))}
            <div ref={chatEndRef} />
        </Box>
    );
};

export default MessageList;