// src/pages/ChatPage.js
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getChatDetails, listenToChatMessages, addChatMessage, getModelsForProjects, getAgentsForProjects, getEventsForMessage } from '../services/firebaseService';
import { executeQuery } from '../services/agentService';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import {
    Container, Typography, Box, Paper, Button, TextField, Menu, MenuItem,
    Avatar, ButtonGroup, ListSubheader, Divider, CircularProgress, Chip, IconButton, Tooltip
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ModelTrainingIcon from '@mui/icons-material/ModelTraining';
import MessageActions from '../components/chat/MessageActions';
import AgentReasoningLogDialog from '../components/agents/AgentReasoningLogDialog';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import AttachmentIcon from '@mui/icons-material/Attachment';
import CancelIcon from '@mui/icons-material/Cancel';

// Markdown Imports
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { muiMarkdownComponentsConfig } from '../components/common/MuiMarkdownComponents';

// Context Stuffing Imports
import WebPageContextModal from '../components/context_stuffing/WebPageContextModal';
import GitRepoContextModal from '../components/context_stuffing/GitRepoContextModal';
import ImageContextModal from '../components/context_stuffing/ImageContextModal';
import PdfContextModal from '../components/context_stuffing/PdfContextModal';
import { fetchWebPageContent, fetchGitRepoContents, processPdfContent, uploadImageForContext } from '../services/contextService';

// Helper for user-friendly participant display
const parseParticipant = (str, models, agents, currentUser) => {
    if (!str) return { label: 'Unknown', icon: <PersonIcon /> };
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

// --- Tree Traversal Helpers ---
function getPathToLeaf(messagesMap, leafMessageId) {
    const path = [];
    let currId = leafMessageId;
    while (currId) {
        const msg = messagesMap[currId];
        if (!msg) break;
        path.unshift(msg);
        currId = msg.parentMessageId;
    }
    return path;
}

function getChildrenForMessage(messagesMap, parentId) {
    return Object.values(messagesMap)
        .filter(msg => msg.parentMessageId === parentId)
        .sort((a, b) => (a.timestamp?.seconds ?? 0) - (b.timestamp?.seconds ?? 0));
}

function findLeafOfBranch(messagesMap, branchRootId) {
    let current = messagesMap[branchRootId];
    if (!current) return branchRootId;
    while (true) {
        const children = getChildrenForMessage(messagesMap, current.id);
        if (children.length > 0) {
            current = children[children.length - 1]; // Get the last child
        } else {
            return current.id;
        }
    }
}


const ChatPage = () => {
    const { currentUser } = useAuth();
    const { chatId } = useParams();
    const chatEndRef = useRef(null);
    const [chat, setChat] = useState(null);
    const [messagesMap, setMessagesMap] = useState({});
    const [activeLeafMsgId, setActiveLeafMsgId] = useState(null);
    const [composerValue, setComposerValue] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);

    const [composerAction, setComposerAction] = useState({ type: 'text' });
    const [actionButtonAnchorEl, setActionButtonAnchorEl] = useState(null);
    const isMenuOpen = Boolean(actionButtonAnchorEl);

    const [agents, setAgents] = useState([]);
    const [models, setModels] = useState([]);

    const [isReasoningLogOpen, setIsReasoningLogOpen] = useState(false);
    const [selectedEventsForLog, setSelectedEventsForLog] = useState([]);
    const [loadingEvents, setLoadingEvents] = useState(false);

    // --- New Context State ---
    const [pendingContextParts, setPendingContextParts] = useState([]);
    const [contextModalType, setContextModalType] = useState(null);
    const [isContextModalOpen, setIsContextModalOpen] = useState(false);
    const [isContextLoading, setIsContextLoading] = useState(false);

    const conversationPath = useMemo(() => {
        if (!messagesMap || !activeLeafMsgId) return [];
        return getPathToLeaf(messagesMap, activeLeafMsgId);
    }, [messagesMap, activeLeafMsgId]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [conversationPath, sending, isContextLoading]);

    useEffect(() => {
        setLoading(true);
        let unsubscribe;
        const setupListener = async () => {
            try {
                const chatData = await getChatDetails(chatId);
                setChat(chatData);
                const [projAgents, projModels] = await Promise.all([
                    getAgentsForProjects(chatData.projectIds || []),
                    getModelsForProjects(chatData.projectIds || [])
                ]);
                setAgents(projAgents);
                setModels(projModels);
                unsubscribe = listenToChatMessages(chatId, (newMsgs) => {
                    const newMessagesMap = newMsgs.reduce((acc, m) => ({ ...acc, [m.id]: m }), {});
                    setMessagesMap(newMessagesMap);
                    setActiveLeafMsgId(prevLeafId => {
                        if (!prevLeafId || !newMessagesMap[prevLeafId]) {
                            const leafCandidates = newMsgs.filter(m => !newMsgs.some(x => x.parentMessageId === m.id));
                            return leafCandidates.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0)).pop()?.id || null;
                        }
                        return findLeafOfBranch(newMessagesMap, prevLeafId);
                    });
                });
            } catch (err) { setError(err.message); } finally { setLoading(false); }
        };
        setupListener();
        return () => { if (unsubscribe) unsubscribe(); };
    }, [chatId]);

    const handleFork = (msgId) => setActiveLeafMsgId(msgId);
    const handleNavigateBranch = (newLeafId) => setActiveLeafMsgId(newLeafId);

    const handleOpenReasoningLog = async (messageId) => {
        setLoadingEvents(true);
        setIsReasoningLogOpen(true);
        try {
            const events = await getEventsForMessage(chatId, messageId);
            setSelectedEventsForLog(events);
        } catch (err) {
            console.error("Failed to fetch events:", err);
            setSelectedEventsForLog([{ type: 'error', content: { text: `Failed to load log: ${err.message}` } }]);
        } finally {
            setLoadingEvents(false);
        }
    };
    const handleCloseReasoningLog = () => setIsReasoningLogOpen(false);

    const handleOpenMenu = (event) => setActionButtonAnchorEl(event.currentTarget);
    const handleCloseMenu = () => setActionButtonAnchorEl(null);

    const handleMenuActionSelect = (action) => {
        const { type, id, name } = action;
        if (type === 'text' || type === 'agent' || type === 'model') {
            setComposerAction({ type, id, name });
        } else if (type.startsWith('context-')) {
            const contextType = type.split('-')[1];
            setContextModalType(contextType);
            setIsContextModalOpen(true);
        }
        handleCloseMenu();
    };

    const handleActionSubmit = async (e) => {
        e.preventDefault();
        setSending(true);
        setError(null);
        try {
            const finalParts = [];
            if (composerAction.type === 'text') {
                if (!composerValue.trim() && pendingContextParts.length === 0) return;
                if (composerValue.trim()) {
                    finalParts.push({ text: composerValue });
                }
            }
            finalParts.push(...pendingContextParts.map(p => ({ file_data: p.file_data })));

            if (composerAction.type === 'text') {
                await addChatMessage(chatId, {
                    participant: `user:${currentUser.uid}`,
                    parts: finalParts,
                    parentMessageId: activeLeafMsgId
                });
                setComposerValue('');
                setPendingContextParts([]);
            } else if (composerAction.type === 'agent' || composerAction.type === 'model') {
                await executeQuery({
                    chatId,
                    agentId: composerAction.type === 'agent' ? composerAction.id : undefined,
                    modelId: composerAction.type === 'model' ? composerAction.id : undefined,
                    adkUserId: currentUser.uid,
                    parentMessageId: activeLeafMsgId,
                    stuffedContextItems: pendingContextParts.length > 0 ? pendingContextParts : null
                });
                setPendingContextParts([]);
            }
        } catch (err) { setError(err.message); } finally { setSending(false); }
    };

    // --- New Context Handling Logic ---
    const handleCloseContextModal = () => {
        setIsContextModalOpen(false);
        setContextModalType(null);
    };

    const handleContextSubmit = async (params) => {
        setIsContextLoading(true);
        setError(null);
        handleCloseContextModal();
        try {
            let result;
            if (params.type === 'webpage') result = await fetchWebPageContent(params.url);
            else if (params.type === 'gitrepo') result = await fetchGitRepoContents(params);
            else if (params.type === 'pdf') result = await processPdfContent(params);
            else if (params.type === 'image') result = await uploadImageForContext(params.file);
            else throw new Error("Unknown context type");

            if (result.success) {
                setPendingContextParts(prev => [...prev, {
                    name: result.name,
                    file_data: { file_uri: result.storageUrl, mime_type: result.mimeType }
                }]);
            } else {
                throw new Error(result.message || "Failed to process context item.");
            }
        } catch (err) { setError(`Failed to add context: ${err.message}`); } finally { setIsContextLoading(false); }
    };

    const removePendingContextPart = (index) => {
        setPendingContextParts(prev => prev.filter((_, i) => i !== index));
    };


    if (loading || !chat) return <Box sx={{ display: 'flex', justifyContent: 'center' }}><LoadingSpinner /></Box>;
    if (error && !conversationPath.length) return <ErrorMessage message={error} />;

    const sendButtonDisabled = sending || isContextLoading || (composerAction.type === 'text' && !composerValue.trim() && pendingContextParts.length === 0);

    return (
        <Container maxWidth="md" sx={{ py: 3 }}>
            <Paper sx={{ p: { xs: 2, md: 4 } }}>
                <Typography variant="h4" gutterBottom>{chat.title}</Typography>
                {error && <ErrorMessage message={error} />}

                <Box sx={{ bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider', p: 2, minHeight: 320, overflowY: 'auto', maxHeight: '60vh', display: 'flex', flexDirection: 'column' }}>
                    {conversationPath.map((msg) => {
                        const participant = parseParticipant(msg.participant, models, agents, currentUser);
                        const isAssistant = msg.participant?.startsWith('agent') || msg.participant?.startsWith('model');
                        return (
                            <Box key={msg.id} sx={{ position: 'relative', mb: 1, mt: 'auto' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                    {participant.icon}
                                    <Typography variant="subtitle2">{participant.label}</Typography>
                                </Box>
                                <Paper variant="outlined" sx={{ p: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap', mb: 0.5 }}>
                                    {(msg.parts || []).map((part, index) => {
                                        if (part.text) {
                                            return <ReactMarkdown key={index} components={muiMarkdownComponentsConfig} remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>;
                                        }
                                        if (part.file_data) {
                                            return (
                                                <Chip key={index} icon={<AttachmentIcon />} label={part.file_data.file_uri.split('/').pop()} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                                            );
                                        }
                                        return null;
                                    })}
                                    {msg.status === 'running' && (
                                        <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                                            <LoadingSpinner small />
                                            <Typography variant="caption" sx={{ ml: 1 }}>Thinking...</Typography>
                                        </Box>
                                    )}
                                    {msg.status === 'error' && (
                                        <Box sx={{ mt: 1 }}>
                                            <ErrorMessage message={(msg.errorDetails || []).join('\n')} severity="warning" />
                                        </Box>
                                    )}
                                </Paper>
                                <MessageActions
                                    message={msg} messagesMap={messagesMap} activePath={conversationPath}
                                    onNavigate={handleNavigateBranch} onFork={handleFork} onViewLog={handleOpenReasoningLog}
                                    getChildrenForMessage={getChildrenForMessage} findLeafOfBranch={findLeafOfBranch}
                                    isAssistantMessage={isAssistant}
                                />
                            </Box>
                        );
                    })}
                    <div ref={chatEndRef} />
                </Box>

                {pendingContextParts.length > 0 && (
                    <Box sx={{ mt: 2, p: 1, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
                        <Typography variant="caption" color="text.secondary">Pending attachments:</Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                            {pendingContextParts.map((part, index) => (
                                <Chip
                                    key={index} icon={<AttachmentIcon />} label={part.name}
                                    onDelete={() => removePendingContextPart(index)}
                                    deleteIcon={<CancelIcon />}
                                />
                            ))}
                        </Box>
                    </Box>
                )}

                <Box component="form" onSubmit={handleActionSubmit} sx={{ display: 'flex', alignItems: 'flex-end', mt: 2, gap: 1 }}>
                    {composerAction.type === 'text' && (
                        <TextField
                            value={composerValue} onChange={e => setComposerValue(e.target.value)} variant="outlined" size="small"
                            placeholder="Type your message..." sx={{ flexGrow: 1 }} disabled={sending || isContextLoading}
                            multiline maxRows={4}
                        />
                    )}
                    <ButtonGroup variant="contained" sx={{ flexShrink: 0, height: composerAction.type === 'text' ? 'auto' : 'fit-content', alignSelf: composerAction.type === 'text' ? 'auto' : 'center', ml: composerAction.type !== 'text' ? 'auto' : 0, mr: composerAction.type !== 'text' ? 'auto' : 0 }}>
                        <Button type="submit" disabled={sendButtonDisabled}>
                            {sending ? <CircularProgress size={24} color="inherit" /> : (composerAction.type === 'text' ? 'Send' : `Reply as '${composerAction.name}'`)}
                        </Button>
                        <Button size="small" onClick={handleOpenMenu} disabled={sending || isContextLoading}><ArrowDropDownIcon /></Button>
                    </ButtonGroup>
                    <Menu anchorEl={actionButtonAnchorEl} open={isMenuOpen} onClose={handleCloseMenu}>
                        <MenuItem onClick={() => handleMenuActionSelect({ type: 'text' })}>Text Message</MenuItem>
                        <Divider />
                        {models.length > 0 && <ListSubheader>Models</ListSubheader>}
                        {models.map(model => (<MenuItem key={model.id} onClick={() => handleMenuActionSelect({ type: 'model', id: model.id, name: model.name })}><ModelTrainingIcon sx={{ mr: 1 }} fontSize="small" /> {model.name}</MenuItem>))}
                        {agents.length > 0 && <ListSubheader>Agents</ListSubheader>}
                        {agents.map(agent => (<MenuItem key={agent.id} onClick={() => handleMenuActionSelect({ type: 'agent', id: agent.id, name: agent.name })}><SmartToyIcon sx={{ mr: 1 }} fontSize="small" /> {agent.name}</MenuItem>))}
                        <Divider />
                        <ListSubheader>Add Context</ListSubheader>
                        <MenuItem onClick={() => handleMenuActionSelect({ type: 'context-webpage' })}>Web Page</MenuItem>
                        <MenuItem onClick={() => handleMenuActionSelect({ type: 'context-gitrepo' })}>Git Repository</MenuItem>
                        <MenuItem onClick={() => handleMenuActionSelect({ type: 'context-pdf' })}>PDF Document</MenuItem>
                        <MenuItem onClick={() => handleMenuActionSelect({ type: 'context-image' })}>Image</MenuItem>
                    </Menu>
                </Box>
                {isContextLoading && <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', my: 1.5 }}> <CircularProgress size={20} sx={{ mr: 1 }} /> <Typography variant="body2" color="text.secondary">Processing context...</Typography> </Box>}
            </Paper>

            <AgentReasoningLogDialog open={isReasoningLogOpen} onClose={handleCloseReasoningLog} events={loadingEvents ? [] : selectedEventsForLog} />
            {isContextModalOpen && contextModalType === 'webpage' && (<WebPageContextModal open={isContextModalOpen} onClose={handleCloseContextModal} onSubmit={handleContextSubmit} />)}
            {isContextModalOpen && contextModalType === 'gitrepo' && (<GitRepoContextModal open={isContextModalOpen} onClose={handleCloseContextModal} onSubmit={handleContextSubmit} />)}
            {isContextModalOpen && contextModalType === 'pdf' && (<PdfContextModal open={isContextModalOpen} onClose={handleCloseContextModal} onSubmit={handleContextSubmit} />)}
            {isContextModalOpen && contextModalType === 'image' && (<ImageContextModal open={isContextModalOpen} onClose={handleCloseContextModal} onSubmit={handleContextSubmit} />)}
        </Container>
    );
}

export default ChatPage;