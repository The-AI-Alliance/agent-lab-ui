// src/pages/ChatPage.js
import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getChatDetails, listenToChatMessages, addChatMessage, getModelsForProjects, getAgentsForProjects } from '../services/firebaseService';
import { executeQuery } from '../services/agentService';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import {
    Container,
    Typography,
    Box,
    Paper,
    Button,
    TextField,
    Menu,
    MenuItem,
    Avatar,
    ButtonGroup,
    ListSubheader,
    Divider,
    CircularProgress
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ModelTrainingIcon from '@mui/icons-material/ModelTraining';
import MessageActions from '../components/chat/MessageActions';
import AgentReasoningLogDialog from '../components/agents/AgentReasoningLogDialog';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';

// Markdown Imports
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { muiMarkdownComponentsConfig } from '../components/common/MuiMarkdownComponents';

// Context Stuffing Imports
import WebPageContextModal from '../components/context_stuffing/WebPageContextModal';
import GitRepoContextModal from '../components/context_stuffing/GitRepoContextModal';
import ImageContextModal from '../components/context_stuffing/ImageContextModal'; // New Import
import PdfContextModal from '../components/context_stuffing/PdfContextModal';
import ContextDisplayBubble from '../components/context_stuffing/ContextDisplayBubble';
import ContextDetailsDialog from '../components/context_stuffing/ContextDetailsDialog';
import DatasetLinkedIcon from '@mui/icons-material/DatasetLinked';
import { fetchWebPageContent, fetchGitRepoContents, processPdfContent, uploadImageForContext } from '../services/contextService';


// Helper for user-friendly participant display (user, agent, or model)
const parseParticipant = (str, models, agents, users, currentUser) => {
    if (!str) return { label: 'Unknown', icon: <PersonIcon /> };
    if (str === 'context_stuffed') return { label: 'Context', icon: <DatasetLinkedIcon /> };

    const [type, id] = str.split(':');
    if (type === 'user') {
        if (currentUser && id === currentUser.uid) return { label: 'You', icon: <Avatar src={currentUser.photoURL}>{currentUser.displayName?.slice(0,1)}</Avatar> };
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

function getPathToLeaf(messagesMap, leafMessageId) {
    const path = [];
    let currId = leafMessageId;
    while(currId) {
        const msg = messagesMap[currId];
        if (!msg) break;
        path.unshift(msg);
        currId = msg.parentMessageId;
    }
    return path;
}

function getChildrenForMessage(messagesMap, parentId) {
    // Returns list of message objects
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
            current = children.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0)).pop();
        } else {
            return current.id;
        }
    }
}

const ChatPage = () => {
    const { currentUser } = useAuth();
    const { chatId } = useParams();
    const [chat, setChat] = useState(null);
    const [messagesMap, setMessagesMap] = useState({});
    const [activeLeafMsgId, setActiveLeafMsgId] = useState(null);
    const [composerValue, setComposerValue] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);

    // New Composer State
    const [composerAction, setComposerAction] = useState({ type: 'text' });
    const [actionButtonAnchorEl, setActionButtonAnchorEl] = useState(null);
    const isMenuOpen = Boolean(actionButtonAnchorEl);

    // Participants management
    const [agents, setAgents] = useState([]);
    const [models, setModels] = useState([]);

    // Reasoning Log Dialog State
    const [isReasoningLogOpen, setIsReasoningLogOpen] = useState(false);
    const [selectedEventsForLog, setSelectedEventsForLog] = useState([]);

    // Context Stuffing State
    const [contextModalType, setContextModalType] = useState(null);
    const [isContextModalOpen, setIsContextModalOpen] = useState(false);
    const [isContextDetailsOpen, setIsContextDetailsOpen] = useState(false);
    const [selectedContextItemsForDetails, setSelectedContextItemsForDetails] = useState([]);
    const [isContextLoading, setIsContextLoading] = useState(false);


    const conversationPath = useMemo(() => {
        if (!messagesMap || !activeLeafMsgId) return [];
        return getPathToLeaf(messagesMap, activeLeafMsgId);
    }, [messagesMap, activeLeafMsgId]);

    // Load chat metadata and set up listeners
    useEffect(() => {
        setLoading(true);
        let unsubscribe;

        const setupListener = async () => {
            try {
                const chatData = await getChatDetails(chatId);
                setChat(chatData);

                const projIds = chatData.projectIds || [];
                const [projAgents, projModels] = await Promise.all([
                    getAgentsForProjects(projIds),
                    getModelsForProjects(projIds)
                ]);
                setAgents(projAgents);
                setModels(projModels);

                unsubscribe = listenToChatMessages(chatId, (newMsgs) => {
                    const newMessagesMap = newMsgs.reduce((acc, m) => ({ ...acc, [m.id]: m }), {});
                    setMessagesMap(newMessagesMap);

                    setActiveLeafMsgId(prevLeafId => {
                        if (!prevLeafId || !newMessagesMap[prevLeafId]) {
                            const leafCandidates = newMsgs.filter(m => !newMsgs.some(x => x.parentMessageId === m.id));
                            return (leafCandidates.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0)).pop()?.id || null);
                        }
                        return findLeafOfBranch(newMessagesMap, prevLeafId);
                    });
                });
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        setupListener();
        return () => { if (unsubscribe) unsubscribe(); };
    }, [chatId]);

    const handleFork = (msgId) => {
        setActiveLeafMsgId(msgId);
    }
    const handleNavigateBranch = (newLeafId) => {
        setActiveLeafMsgId(newLeafId);
    };

    const handleOpenReasoningLog = (events) => {
        setSelectedEventsForLog(events || []);
        setIsReasoningLogOpen(true);
    };

    const handleCloseReasoningLog = () => {
        setIsReasoningLogOpen(false);
    };

    const handleOpenMenu = (event) => setActionButtonAnchorEl(event.currentTarget);
    const handleCloseMenu = () => setActionButtonAnchorEl(null);

    const handleMenuActionSelect = (action) => {
        const { type, id, name } = action;
        if (type === 'text' || type === 'agent' || type === 'model') {
            setComposerAction({ type, id, name });
        } else if (type.startsWith('context-')) {
            const contextType = type.split('-')[1]; // 'webpage', 'gitrepo', 'pdf', 'image'
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
                if (!composerValue.trim()) return;
                await addChatMessage(chatId, {
                    participant: `user:${currentUser.uid}`,
                    parts: [{ type: 'text', content: composerValue }],
                    parentMessageId: activeLeafMsgId
                });
                setComposerValue('');
            } else if (composerAction.type === 'agent' || composerAction.type === 'model') {
                let lastProperMessageIndex = -1;
                for (let i = conversationPath.length - 1; i >= 0; i--) {
                    if (conversationPath[i].participant !== 'context_stuffed') {
                        lastProperMessageIndex = i; break;
                    }
                }
                const recentContextMessages = conversationPath.slice(lastProperMessageIndex + 1);
                const activeContextItems = [];
                recentContextMessages.forEach(convItem => {
                    if (convItem.participant === 'context_stuffed' && convItem.contextItems) {
                        activeContextItems.push(...convItem.contextItems);
                    }
                });

                await executeQuery({
                    chatId,
                    agentId: composerAction.type === 'agent' ? composerAction.id : undefined,
                    modelId: composerAction.type === 'model' ? composerAction.id : undefined,
                    message: '', // No message content for direct agent/model invocation
                    adkUserId: currentUser.uid,
                    parentMessageId: activeLeafMsgId,
                    stuffedContextItems: activeContextItems.length > 0 ? activeContextItems : null
                });
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setSending(false);
        }
    };

    // --- Context Stuffing Logic ---
    const handleCloseContextModal = () => {
        setIsContextModalOpen(false);
        setContextModalType(null);
    };
    const handleOpenContextDetails = (items) => {
        setSelectedContextItemsForDetails(items);
        setIsContextDetailsOpen(true);
    };
    const handleCloseContextDetails = () => setIsContextDetailsOpen(false);
    const handleContextSubmit = async (params) => {
        setIsContextLoading(true);
        setError(null);
        let newContextItems = [];
        try {
            if (params.type === 'webpage') {
                const result = await fetchWebPageContent(params.url);
                if (result.success) {
                    newContextItems.push({ name: result.name, content: result.content, type: 'webpage', bytes: result.content?.length || 0 });
                } else { throw new Error(result.message || "Failed to fetch web page."); }
            } else if (params.type === 'gitrepo') {
                const result = await fetchGitRepoContents(params);
                if (result.success && result.items) {
                    newContextItems = result.items.map(item => ({ name: item.name, content: item.content, type: item.type, bytes: item.content?.length || 0 }));
                } else { throw new Error(result.message || "Failed to fetch Git repository contents."); }
            } else if (params.type === 'pdf') {
                const result = await processPdfContent(params);
                if (result.success) {
                    newContextItems.push({ name: result.name, content: result.content, type: result.type, bytes: result.content?.length || 0 });
                } else { throw new Error(result.message || "Failed to process PDF."); }
            } else if (params.type === 'image') {
                const result = await uploadImageForContext(params.file);
                if (result.success) {
                    newContextItems.push({ name: result.name, type: 'image', storageUrl: result.storageUrl, signedUrl: result.signedUrl, mimeType: params.file.type });
                } else { throw new Error(result.message || "Failed to upload image."); }
            }

            const validContextItems = newContextItems.filter(item => item.type !== 'gitfile_error' && item.type !== 'gitfile_skipped' && item.type !== 'pdf_error');
            const errorContextItems = newContextItems.filter(item => item.type === 'gitfile_error' || item.type === 'gitfile_skipped' || item.type === 'pdf_error');

            if (validContextItems.length > 0) {
                await addChatMessage(chatId, {
                    participant: 'context_stuffed',
                    parts: validContextItems.map(item => ({
                        type: item.type,
                        name: item.name,
                        ...(item.content && { content: item.content }), // For text-based context
                        ...(item.storageUrl && { storageUrl: item.storageUrl, signedUrl: item.signedUrl, mimeType: item.mimeType }), // For images
                    })),
                    contextItems: validContextItems,
                    parentMessageId: activeLeafMsgId
                });
            }
            if (errorContextItems.length > 0) {
                const errorContent = errorContextItems.map(err => `Context Fetch Error for "${err.name}": ${err.content}`).join('\n');
                await addChatMessage(chatId, { participant: `user:${currentUser.uid}`, parts: [{ type: 'text', content: errorContent }], parentMessageId: activeLeafMsgId});
            }
        } catch (err) {
            setError(`Failed to stuff context: ${err.message}`);
        } finally {
            setIsContextLoading(false);
            handleCloseContextModal();
        }
    };


    if (loading || !chat) return <Box sx={{display: 'flex', justifyContent: 'center'}}><LoadingSpinner /></Box>;
    if (error && !conversationPath.length) return <ErrorMessage message={error} />;

    const sendButtonDisabled = sending || (composerAction.type === 'text' && !composerValue.trim());

    return (
        <Container maxWidth="md" sx={{ py: 3 }}>
            <Paper sx={{ p: {xs: 2, md: 4} }}>
                <Typography variant="h4" gutterBottom>{chat.title}</Typography>
                {error && <ErrorMessage message={error} />}

                <Box sx={{ bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider', p: 2, minHeight: 320, overflowY: 'auto', maxHeight: '60vh' }}>
                    {conversationPath.map((msg) => {
                        if (msg.participant === 'context_stuffed') {
                            return (
                                <Box key={msg.id} sx={{ position: 'relative', mb: 1, display: 'flex', justifyContent: 'center'}}>
                                    <Box sx={{maxWidth: '80%'}}>
                                        <ContextDisplayBubble contextMessage={{items: msg.contextItems}} onOpenDetails={() => handleOpenContextDetails(msg.contextItems)} />
                                        <MessageActions message={msg} messagesMap={messagesMap} activePath={conversationPath} onNavigate={handleNavigateBranch} onFork={handleFork} onViewLog={handleOpenReasoningLog} getChildrenForMessage={getChildrenForMessage} findLeafOfBranch={findLeafOfBranch} />
                                    </Box>
                                </Box>
                            );
                        }
                        const participant = parseParticipant(msg.participant, models, agents, [], currentUser);
                        const messageParts = msg.parts || (msg.content ? [{ type: 'text', content: msg.content }] : []);
                        return (
                            <Box key={msg.id} sx={{ position: 'relative', mb: 1 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                    {participant.icon}
                                    <Typography variant="subtitle2">{participant.label}</Typography>
                                </Box>
                                <Paper variant="outlined" sx={{ p: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap', mb: 0.5,
                                    bgcolor: msg.participant?.startsWith('user') ? 'primary.light' : msg.participant?.startsWith('agent') ? 'grey.100' : 'secondary.light' }}>
                                    {messageParts.length > 0 ? (
                                        messageParts.map((part, index) => {
                                            if (part.type === 'text') {
                                                return (
                                                    <ReactMarkdown key={index} components={muiMarkdownComponentsConfig} remarkPlugins={[remarkGfm]}>
                                                        {part.content}
                                                    </ReactMarkdown>
                                                );
                                            }
                                            if (part.type === 'image' && part.signedUrl) {
                                                return (
                                                    <Box key={index} sx={{ my: 1, maxWidth: '300px' }}>
                                                        <img src={part.signedUrl} alt={part.name || 'uploaded image'} style={{ maxWidth: '100%', height: 'auto', borderRadius: '4px' }} />
                                                    </Box>
                                                );
                                            }
                                            return null;
                                        })
                                    ) : (
                                        <Typography variant="body1" sx={{ color: "text.secondary" }}>(no content)</Typography>
                                    )}
                                    {msg.run?.status === 'running' && (
                                        <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                                            <LoadingSpinner small />
                                            <Typography variant="caption" sx={{ ml: 1 }}>Thinking...</Typography>
                                        </Box>
                                    )}
                                    {msg.run?.status === 'error' && Array.isArray(msg.run.queryErrorDetails) && msg.run.queryErrorDetails.length > 0 && (
                                        <Box sx={{mt: 1}}>
                                            <ErrorMessage message={msg.run.queryErrorDetails.join('\n')} severity="warning"/>
                                        </Box>
                                    )}
                                </Paper>
                                <MessageActions
                                    message={msg}
                                    messagesMap={messagesMap}
                                    activePath={conversationPath}
                                    onNavigate={handleNavigateBranch}
                                    onFork={handleFork}
                                    onViewLog={handleOpenReasoningLog}
                                    getChildrenForMessage={getChildrenForMessage}
                                    findLeafOfBranch={findLeafOfBranch}
                                />
                            </Box>
                        );
                    })}
                    {isContextLoading && <Box sx={{display: 'flex', justifyContent:'center', alignItems: 'center', my: 1.5}}> <CircularProgress size={20} sx={{mr:1}} /> <Typography variant="body2" color="text.secondary">Processing context...</Typography> </Box> }
                </Box>

                <Box component="form" onSubmit={handleActionSubmit} sx={{ display: 'flex', alignItems: 'flex-end', mt: 2, gap: 1 }}>
                    {composerAction.type === 'text' && (
                        <TextField
                            value={composerValue}
                            onChange={e => setComposerValue(e.target.value)}
                            variant="outlined"
                            size="small"
                            placeholder="Type your message..."
                            sx={{ flexGrow: 1 }}
                            disabled={sending || isContextLoading}
                            multiline
                            maxRows={4}
                        />
                    )}
                    <ButtonGroup variant="contained" sx={{ flexShrink: 0, height: composerAction.type === 'text' ? 'auto' : 'fit-content', alignSelf: composerAction.type === 'text' ? 'auto' : 'center', ml: composerAction.type !== 'text' ? 'auto' : 0, mr: composerAction.type !== 'text' ? 'auto' : 0 }}>
                        <Button type="submit" disabled={sendButtonDisabled || isContextLoading}>
                            {composerAction.type === 'text' ? 'Send' : `Reply as '${composerAction.name}'`}
                        </Button>
                        <Button
                            size="small"
                            onClick={handleOpenMenu}
                            disabled={sending || isContextLoading}
                        >
                            <ArrowDropDownIcon />
                        </Button>
                    </ButtonGroup>
                    <Menu
                        anchorEl={actionButtonAnchorEl}
                        open={isMenuOpen}
                        onClose={handleCloseMenu}
                    >
                        <MenuItem onClick={() => handleMenuActionSelect({ type: 'text' })}>
                            Text Message
                        </MenuItem>
                        <Divider />

                        {models.length > 0 && <ListSubheader>Models</ListSubheader>}
                        {models.map(model => (
                            <MenuItem key={model.id} onClick={() => handleMenuActionSelect({type: 'model', id: model.id, name: model.name })}>
                                <ModelTrainingIcon sx={{mr: 1}} fontSize="small"/> {model.name}
                            </MenuItem>
                        ))}

                        {agents.length > 0 && <ListSubheader>Agents</ListSubheader>}
                        {agents.map(agent => (
                            <MenuItem key={agent.id} onClick={() => handleMenuActionSelect({ type: 'agent', id: agent.id, name: agent.name })}>
                                <SmartToyIcon sx={{mr: 1}} fontSize="small"/> {agent.name}
                            </MenuItem>
                        ))}
                        <Divider />

                        <ListSubheader>Context</ListSubheader>
                        <MenuItem onClick={() => handleMenuActionSelect({ type: 'context-webpage' })}>Web Page</MenuItem>
                        <MenuItem onClick={() => handleMenuActionSelect({ type: 'context-gitrepo' })}>Git Repository</MenuItem>
                        <MenuItem onClick={() => handleMenuActionSelect({ type: 'context-pdf' })}>PDF Document</MenuItem>
                        <MenuItem onClick={() => handleMenuActionSelect({ type: 'context-image' })}>Image</MenuItem>
                    </Menu>
                </Box>
            </Paper>

            <AgentReasoningLogDialog
                open={isReasoningLogOpen}
                onClose={handleCloseReasoningLog}
                events={selectedEventsForLog}
            />
            {isContextModalOpen && contextModalType === 'webpage' && ( <WebPageContextModal open={isContextModalOpen} onClose={handleCloseContextModal} onSubmit={handleContextSubmit} /> )}
            {isContextModalOpen && contextModalType === 'gitrepo' && ( <GitRepoContextModal open={isContextModalOpen} onClose={handleCloseContextModal} onSubmit={handleContextSubmit} /> )}
            {isContextModalOpen && contextModalType === 'pdf' && ( <PdfContextModal open={isContextModalOpen} onClose={handleCloseContextModal} onSubmit={handleContextSubmit} /> )}
            {isContextModalOpen && contextModalType === 'image' && ( <ImageContextModal open={isContextModalOpen} onClose={handleCloseContextModal} onSubmit={handleContextSubmit} /> )}
            <ContextDetailsDialog open={isContextDetailsOpen} onClose={handleCloseContextDetails} contextItems={selectedContextItemsForDetails} />

        </Container>
    );
}

export default ChatPage;