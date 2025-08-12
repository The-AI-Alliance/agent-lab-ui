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
    Avatar, ButtonGroup, ListSubheader, Divider, CircularProgress
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ModelTrainingIcon from '@mui/icons-material/ModelTraining';
import MessageActions from '../components/chat/MessageActions';
import AgentReasoningLogDialog from '../components/agents/AgentReasoningLogDialog';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import AttachmentIcon from '@mui/icons-material/Attachment';

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

// Re-integrated Context Display/Revealer
import ContextDisplayBubble from '../components/context_stuffing/ContextDisplayBubble';
import ContextDetailsDialog from '../components/context_stuffing/ContextDetailsDialog';

// Helper for user-friendly participant display
const parseParticipant = (str, models, agents, currentUser) => {
    if (!str) return { label: 'Unknown', icon: <PersonIcon /> };

    // Special system message for context stuffing
    if (str === 'context_stuffed') {
        return { label: 'Context', icon: <AttachmentIcon color="info" /> };
    }

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

const convertPartToContextItem = (part) => {
    if (!part) return null;
    if (part.file_data) {
        const uri = part.file_data?.file_uri || '';
        const mime = part.file_data?.mime_type || '';
        const name = uri.split('/').pop() || 'Attachment';
        let type = 'file';
        if (mime.startsWith('image/')) type = 'image';
        else if (mime.includes('pdf')) type = 'pdf';
        return {
            name,
            type,
            bytes: null,
            content: null,
            signedUrl: uri,
            mimeType: mime,
            preview: part.preview || null
        };
    }
    if (part.text) {
        return {
            name: 'Text Context',
            type: 'text',
            content: part.text,
            bytes: null,
            signedUrl: null,
            mimeType: 'text/plain',
            preview: part.preview || null
        };
    }
    return null;
};

const extractContextItemsFromMessage = (msg) => {
    // For context messages, convert each part (including preview if present)
    if (msg?.participant === 'context_stuffed') {
        if (Array.isArray(msg.parts) && msg.parts.length > 0) {
            return msg.parts
                .map(convertPartToContextItem)
                .filter(Boolean);
        }
    }
    // Backward compatibility fallbacks (older fields)
    return msg.items || msg.contextItems || msg.stuffedContextItems || [];
};

const ChatPage = () => {
    const theme = useTheme();
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
    const [contextModalType, setContextModalType] = useState(null);
    const [isContextModalOpen, setIsContextModalOpen] = useState(false);
    const [isContextLoading, setIsContextLoading] = useState(false);

    // Re-integrated details dialog state
    const [contextDetailsOpen, setContextDetailsOpen] = useState(false);
    const [contextDetailsItems, setContextDetailsItems] = useState([]);

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
            if (composerAction.type === 'text') {
                const trimmed = composerValue.trim();
                if (trimmed.length > 0) {
                    const finalParts = [{ text: trimmed }];
                    await addChatMessage(chatId, {
                        participant: `user:${currentUser.uid}`,
                        parts: finalParts,
                        parentMessageId: activeLeafMsgId
                    });
                    setComposerValue('');
                }
            } else if (composerAction.type === 'agent' || composerAction.type === 'model') {
                await executeQuery({
                    chatId,
                    agentId: composerAction.type === 'agent' ? composerAction.id : undefined,
                    modelId: composerAction.type === 'model' ? composerAction.id : undefined,
                    adkUserId: currentUser.uid,
                    parentMessageId: activeLeafMsgId
                });
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
            if (params.type === 'webpage') {
                result = await fetchWebPageContent({ url: params.url, chatId, parentMessageId: activeLeafMsgId });
            } else if (params.type === 'gitrepo') {
                result = await fetchGitRepoContents({ ...params, chatId, parentMessageId: activeLeafMsgId });
            } else if (params.type === 'pdf') {
                result = await processPdfContent({ ...params, chatId, parentMessageId: activeLeafMsgId });
            } else if (params.type === 'image') {
                result = await uploadImageForContext({ file: params.file, chatId, parentMessageId: activeLeafMsgId });
            } else {
                throw new Error("Unknown context type");
            }

            if (!result?.success) {
                throw new Error(result?.message || "Failed to process context item.");
            }
            // No need to handle local state; the backend creates the context message and the listener will update the UI.
        } catch (err) { setError(`Failed to add context: ${err.message}`); } finally { setIsContextLoading(false); }
    };

    // Context details dialog open helper
    const openContextDetailsForMessage = (msg) => {
        const items = extractContextItemsFromMessage(msg);
        setContextDetailsItems(items);
        setContextDetailsOpen(true);
    };

    // Bubble color styling based on theme
    const getBubbleSxForMessage = (msg) => {
        const isUserMsg = msg.participant?.startsWith('user:');
        const isAssistantMsg = msg.participant?.startsWith('agent') || msg.participant?.startsWith('model');

        if (!isUserMsg && !isAssistantMsg) return {};

        const userBg = theme.palette.userChatBubble || theme.palette.primary.light;
        const machineBg = theme.palette.machineChatBubble || theme.palette.secondary.light;

        const bg = isUserMsg ? userBg : machineBg;
        const color = theme.palette.getContrastText ? theme.palette.getContrastText(bg) : undefined;

        return {
            bgcolor: bg,
            color: color,
            border: '1px solid',
            borderColor: 'transparent',
        };
    };

    if (loading || !chat) return <Box sx={{ display: 'flex', justifyContent: 'center' }}><LoadingSpinner /></Box>;
    if (error && !conversationPath.length) return <ErrorMessage message={error} />;

    const sendButtonDisabled = sending || isContextLoading || (composerAction.type === 'text' && !composerValue.trim());

    return (
        <Container sx={{ py: 3 }}>
            <Paper sx={{ p: { xs: 2, md: 4 } }}>
                <Typography variant="h4" gutterBottom>{chat.title}</Typography>
                {error && <ErrorMessage message={error} />}

                <Box
                    sx={{
                        width: '100%',
                        maxWidth: { xs: '100%', sm: '98%', md: '95%', lg: '90%', xl: '85%' },
                        mx: 'auto',
                        bgcolor: 'background.paper',
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'divider',
                        p: 2,
                        minHeight: 320,
                        overflowY: 'auto',
                        maxHeight: '60vh',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    {conversationPath.map((msg) => {
                        const participant = parseParticipant(msg.participant, models, agents, currentUser);
                        const isAssistant = msg.participant?.startsWith('agent') || msg.participant?.startsWith('model');
                        const isContextMessage = msg.participant === 'context_stuffed';
                        const fileDataParts = (msg.parts || []).filter(p => p.file_data);

                        // Derive pseudo-status: for assistant messages only, missing status means 'initializing'
                        const messageStatus = isAssistant ? (msg.status != null ? msg.status : 'initializing') : msg.status;

                        return (
                            <Box key={msg.id} sx={{ position: 'relative', mb: 1, mt: 'auto' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                    {participant.icon}
                                    <Typography variant="subtitle2">{participant.label}</Typography>
                                </Box>

                                {isContextMessage ? (
                                    <ContextDisplayBubble
                                        contextMessage={{ items: extractContextItemsFromMessage(msg) }}
                                        onOpenDetails={() => openContextDetailsForMessage(msg)}
                                    />
                                ) : (
                                    <Paper
                                        sx={{
                                            p: 1.5,
                                            wordBreak: 'break-word',
                                            whiteSpace: 'pre-wrap',
                                            mb: 0.5,
                                            borderRadius: 2,
                                            ...getBubbleSxForMessage(msg),
                                        }}
                                    >
                                        {messageStatus === 'initializing' ? (
                                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                <LoadingSpinner small />
                                                <Typography variant="caption" sx={{ ml: 1 }}>
                                                    Initializing…
                                                </Typography>
                                            </Box>
                                        ) : messageStatus === 'running' ? (
                                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                <LoadingSpinner small />
                                                <Typography variant="caption" sx={{ ml: 1 }}>
                                                    Thinking…
                                                </Typography>
                                            </Box>
                                        ) : (
                                            (msg.parts || []).map((part, index) => {
                                                if (part.text) {
                                                    return (
                                                        <ReactMarkdown
                                                            key={index}
                                                            components={muiMarkdownComponentsConfig}
                                                            remarkPlugins={[remarkGfm]}
                                                        >
                                                            {part.text}
                                                        </ReactMarkdown>
                                                    );
                                                }
                                                // do not render file_data chips inside the user's/assistant's message anymore
                                                return null;
                                            })
                                        )}
                                    </Paper>
                                )}

                                {/* Render each legacy file_data as its own context bubble below the message */}
                                {fileDataParts.map((part, idx) => {
                                    const item = convertPartToContextItem(part);
                                    const openDetails = () => {
                                        setContextDetailsItems([item]);
                                        setContextDetailsOpen(true);
                                    };
                                    return (
                                        <Box key={`${msg.id}-ctx-${idx}`} sx={{ mb: 0.5 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                                <AttachmentIcon color="info" />
                                                <Typography variant="subtitle2">Context</Typography>
                                            </Box>
                                            <ContextDisplayBubble
                                                contextMessage={{ items: [item] }}
                                                onOpenDetails={openDetails}
                                            />
                                        </Box>
                                    );
                                })}

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
            {/* Context details dialog */}
            <ContextDetailsDialog open={contextDetailsOpen} onClose={() => setContextDetailsOpen(false)} contextItems={contextDetailsItems} />

            {isContextModalOpen && contextModalType === 'webpage' && (<WebPageContextModal open={isContextModalOpen} onClose={handleCloseContextModal} onSubmit={handleContextSubmit} />)}
            {isContextModalOpen && contextModalType === 'gitrepo' && (<GitRepoContextModal open={isContextModalOpen} onClose={handleCloseContextModal} onSubmit={handleContextSubmit} />)}
            {isContextModalOpen && contextModalType === 'pdf' && (<PdfContextModal open={isContextModalOpen} onClose={handleCloseContextModal} onSubmit={handleContextSubmit} />)}
            {isContextModalOpen && contextModalType === 'image' && (<ImageContextModal open={isContextModalOpen} onClose={handleCloseContextModal} onSubmit={handleContextSubmit} />)}
        </Container>
    );
}

export default ChatPage;