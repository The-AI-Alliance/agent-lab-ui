// src/components/chat/MessageBubble.js
import React from 'react';
import { Box, Paper, Typography, Avatar } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ModelTrainingIcon from '@mui/icons-material/ModelTraining';
import AttachmentIcon from '@mui/icons-material/Attachment';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { muiMarkdownComponentsConfig } from '../common/MuiMarkdownComponents';
import LoadingSpinner from '../common/LoadingSpinner';
import MessageActions from './MessageActions';
import ContextDisplayBubble from '../context_stuffing/ContextDisplayBubble';
import { getChildrenForMessage, findLeafOfBranch, extractContextItemsFromMessage } from '../../utils/chatUtils';
import { useTheme } from '@mui/material/styles';


const parseParticipant = (str, models, agents, currentUser) => {
    if (!str) return { label: 'Unknown', icon: <PersonIcon /> };
    if (str === 'context_stuffed') return { label: 'Context', icon: <AttachmentIcon color="info" /> };
    const [type, id] = str.split(':');
    if (type === 'user') {
        if (currentUser && id === currentUser.uid) return { label: 'You', icon: <Avatar src={currentUser.photoURL}>{currentUser.displayName?.slice(0, 1)}</Avatar> };
        return { label: 'User', icon: <PersonIcon /> };
    }
    if (type === 'agent') {
        const agent = agents.find(a => a.id === id);
        return { label: agent ? agent.name : `Agent: ${id}`, icon: <SmartToyIcon color="secondary" /> };
    }
    if (type === 'model') {
        const model = models.find(m => m.id === id);
        return { label: model ? model.name : `Model: ${id}`, icon: <ModelTrainingIcon color="primary" /> };
    }
    return { label: str, icon: <PersonIcon /> };
};

const MessageContent = ({ msg, isAssistant, messageContentCache }) => {
    const messageStatus = isAssistant ? (msg.status ?? 'initializing') : msg.status;

    if (messageStatus === 'initializing' || messageStatus === 'running') {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <LoadingSpinner small />
                <Typography variant="caption" sx={{ ml: 1 }}>
                    {messageStatus === 'running' ? 'Thinking…' : 'Initializing…'}
                </Typography>
            </Box>
        );
    }

    if (isAssistant) {
        const contentEntry = messageContentCache[msg.id];
        if (!contentEntry || contentEntry.status === 'loading') return <LoadingSpinner small />;
        if (contentEntry.status === 'error') return <Typography variant="caption" color="error"><i>(Error loading content)</i></Typography>;
        if (contentEntry.content) return <ReactMarkdown components={muiMarkdownComponentsConfig} remarkPlugins={[remarkGfm]}>{contentEntry.content}</ReactMarkdown>;
        return <Typography variant="caption" color="text.secondary"><i>(No text content in response)</i></Typography>;
    }

    // For user messages
    return (msg.parts || []).map((part, index) =>
        part.text ? <ReactMarkdown key={index} components={muiMarkdownComponentsConfig} remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown> : null
    );
};

const MessageBubble = ({ msg, models, agents, currentUser, messagesMap, activePath, isReadOnly, onFork, onNavigateBranch, onViewLog, onOpenContextDetails, messageContentCache }) => {
    const theme = useTheme();
    const participant = parseParticipant(msg.participant, models, agents, currentUser);
    const isAssistant = msg.participant?.startsWith('agent') || msg.participant?.startsWith('model');
    const isContextMessage = msg.participant === 'context_stuffed';

    const getBubbleSx = () => {
        const isUser = msg.participant?.startsWith('user:');
        if (!isUser && !isAssistant) return {};
        const userBg = theme.palette.userChatBubble || theme.palette.primary.light;
        const machineBg = theme.palette.machineChatBubble || theme.palette.secondary.light;
        const bg = isUser ? userBg : machineBg;
        const color = theme.palette.getContrastText ? theme.palette.getContrastText(bg) : undefined;
        return { bgcolor: bg, color: color, border: '1px solid', borderColor: 'transparent' };
    };

    return (
        <Box sx={{ position: 'relative', mb: 1, mt: 'auto' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                {participant.icon}
                <Typography variant="subtitle2">{participant.label}</Typography>
            </Box>

            {isContextMessage ? (
                <ContextDisplayBubble contextMessage={{ items: extractContextItemsFromMessage(msg) }} onOpenDetails={() => onOpenContextDetails(msg)} />
            ) : (
                <Paper sx={{ p: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap', mb: 0.5, borderRadius: 2, ...getBubbleSx() }}>
                    <MessageContent msg={msg} isAssistant={isAssistant} messageContentCache={messageContentCache} />
                </Paper>
            )}

            <MessageActions
                message={msg} messagesMap={messagesMap} activePath={activePath}
                onNavigate={onNavigateBranch} onFork={onFork} onViewLog={onViewLog}
                getChildrenForMessage={getChildrenForMessage} findLeafOfBranch={findLeafOfBranch}
                isAssistantMessage={isAssistant} isReadOnly={isReadOnly}
            />
        </Box>
    );
};

export default MessageBubble;