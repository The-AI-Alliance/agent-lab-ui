// src/components/agents/AgentRunner.js
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { queryAgent } from '../../services/agentService';
import { listenToAgentRun } from '../../services/firebaseService'; // New import for listener
import ErrorMessage from '../common/ErrorMessage';
import AgentReasoningLogDialog from './AgentReasoningLogDialog';
import { muiMarkdownComponentsConfig } from '../common/MuiMarkdownComponents';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import {
    Paper, Typography, TextField, Button, Box, List, ListItem,
    ListItemText, Avatar, CircularProgress, IconButton, Tooltip, Alert, AlertTitle
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import DeveloperModeIcon from '@mui/icons-material/DeveloperMode';
import LiveTvIcon from '@mui/icons-material/LiveTv';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import DatasetLinkedIcon from '@mui/icons-material/DatasetLinked';

import ContextStuffingDropdown from '../context_stuffing/ContextStuffingDropdown';
import WebPageContextModal from '../context_stuffing/WebPageContextModal';
import GitRepoContextModal from '../context_stuffing/GitRepoContextModal';
import PdfContextModal from '../context_stuffing/PdfContextModal';
import ImageContextModal from '../components/context_stuffing/ImageContextModal';
import ContextDisplayBubble from '../context_stuffing/ContextDisplayBubble';
import ContextDetailsDialog from '../context_stuffing/ContextDetailsDialog';

import { fetchWebPageContent, fetchGitRepoContents, processPdfContent, uploadImageForContext } from '../../services/contextService';


// Helper function to extract artifact updates
const extractArtifactUpdates = (events) => {
    const updates = {};
    if (!events || !Array.isArray(events)) return null;

    events.forEach(event => {
        if (event && event.actions && event.actions.artifact_delta) {
            for (const [filename, versionInfo] of Object.entries(event.actions.artifact_delta)) {
                let versionDisplay = versionInfo;
                if (typeof versionInfo === 'object' && versionInfo !== null && 'version' in versionInfo) {
                    versionDisplay = versionInfo.version;
                } else if (typeof versionInfo === 'number') {
                    versionDisplay = versionInfo;
                } else if (typeof versionInfo === 'object' && versionInfo !== null) {
                    versionDisplay = JSON.stringify(versionInfo);
                }
                updates[filename] = versionDisplay;
            }
        }
    });
    return Object.keys(updates).length > 0 ? updates : null;
};


const AgentRunner = ({
                         agentResourceName,
                         agentFirestoreId,
                         adkUserId,
                         historicalRunData,
                         onSwitchToLiveChat,
                         isLiveModeEnabled
                     }) => {
    const [message, setMessage] = useState('');
    const [conversation, setConversation] = useState([]);
    const [isLoading, setIsLoading] = useState(false); // For the initial API call
    const [isStreaming, setIsStreaming] = useState(false); // For the Firestore listener phase
    const [lastEventSummary, setLastEventSummary] = useState(''); // For the "nice-to-have" feature
    const [error, setError] = useState(null);
    const [currentSessionId, setCurrentSessionId] = useState(null);

    const unsubscribeRunListener = useRef(null);
    const conversationEndRef = useRef(null);

    const [isReasoningLogOpen, setIsReasoningLogOpen] = useState(false);
    const [selectedEventsForLog, setSelectedEventsForLog] = useState([]);

    const [contextModalType, setContextModalType] = useState(null);
    const [isContextModalOpen, setIsContextModalOpen] = useState(false);
    const [isContextDetailsOpen, setIsContextDetailsOpen] = useState(false);
    const [selectedContextItemsForDetails, setSelectedContextItemsForDetails] = useState([]);
    const [isContextLoading, setIsContextLoading] = useState(false);

    const isHistoricalView = !!historicalRunData;

    const cleanupListener = useCallback(() => {
        if (unsubscribeRunListener.current) {
            unsubscribeRunListener.current();
            unsubscribeRunListener.current = null;
        }
    }, []);

    useEffect(() => {
        // Cleanup listener on component unmount
        return () => cleanupListener();
    }, [cleanupListener]);


    const scrollToBottom = () => {
        conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [conversation, lastEventSummary]);

    useEffect(() => {
        cleanupListener();
        if (isHistoricalView && historicalRunData) {
            const historicalConversation = [];
            historicalConversation.push({
                type: 'user',
                text: historicalRunData.inputMessage,
                timestamp: historicalRunData.timestamp?.toDate ? historicalRunData.timestamp.toDate() : new Date(),
            });

            const agentEvents = historicalRunData.outputEvents || [];
            const artifactUpdatesForHistorical = extractArtifactUpdates(agentEvents);
            let stuffedContextFromHistory = historicalRunData.stuffedContextItems || null;

            if (stuffedContextFromHistory && stuffedContextFromHistory.length > 0) {
                const userMessageIndex = historicalConversation.findIndex(msg => msg.type === 'user');
                const contextMessageTime = historicalRunData.timestamp?.toDate
                    ? new Date(historicalRunData.timestamp.toDate().getTime() - 1000)
                    : new Date();

                const contextBubble = {
                    type: 'stuffed_context_history',
                    items: stuffedContextFromHistory,
                    timestamp: contextMessageTime,
                };
                if (userMessageIndex !== -1) {
                    historicalConversation.splice(userMessageIndex, 0, contextBubble);
                } else {
                    historicalConversation.unshift(contextBubble);
                }
            }


            historicalConversation.push({
                type: 'agent',
                text: historicalRunData.finalResponseText || "Agent did not provide a text response.",
                events: agentEvents,
                timestamp: historicalRunData.timestamp?.toDate ? new Date(historicalRunData.timestamp.toDate().getTime() + 1000) : new Date(),
                queryErrorDetails: historicalRunData.queryErrorDetails || null,
                artifactUpdates: artifactUpdatesForHistorical
            });

            setConversation(historicalConversation);
            setMessage('');
            setError(null);
            setCurrentSessionId(null);
            setIsStreaming(false);
        } else if (!isHistoricalView) {
            if (conversation.some(c => c.type === 'stuffed_context_history')) {
                setConversation([]);
            }
        }
        //eslint-disable-next-line react-hooks/exhaustive-deps
    }, [historicalRunData, isHistoricalView]);


    const handleOpenReasoningLog = (events) => {
        setSelectedEventsForLog(events || []);
        setIsReasoningLogOpen(true);
    };
    const handleCloseReasoningLog = () => setIsReasoningLogOpen(false);

    const handleContextOptionSelected = (option) => {
        setContextModalType(option);
        setIsContextModalOpen(true);
    };
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
            }
            else if (params.type === 'gitrepo') {
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
                    newContextItems.push({
                        name: result.name,
                        type: 'image',
                        bytes: params.file.size,
                        storageUrl: result.storageUrl,
                        signedUrl: result.signedUrl,
                        mimeType: params.file.type
                    });
                } else {
                    throw new Error(result.message || "Failed to upload image.");
                }
            }

                const validContextItems = newContextItems.filter(item => item.type !== 'gitfile_error' && item.type !== 'gitfile_skipped' && item.type !== 'pdf_error');
            const errorContextItems = newContextItems.filter(item => item.type === 'gitfile_error' || item.type === 'gitfile_skipped' || item.type === 'pdf_error');

            if (validContextItems.length > 0) {
                setConversation(prev => [...prev, { type: 'stuffed_context', items: validContextItems, timestamp: new Date() }]);
            }
            if (errorContextItems.length > 0) {
                errorContextItems.forEach(errItem => { setConversation(prev => [...prev, { type: 'error', text: `Context Fetch Error for "${errItem.name}": ${errItem.content}`, timestamp: new Date() }]); });
                if (validContextItems.length === 0) setError("Some context items could not be fetched/processed. See chat for details.");
            }
        } catch (err) {
            console.error("Error stuffing context:", err);
            const displayError = err.details?.message || err.message || "An unexpected error occurred while fetching context.";
            setError(`Failed to stuff context: ${displayError}`);
            setConversation(prev => [...prev, { type: 'error', text: `Context Fetch Error: ${displayError}`, timestamp: new Date() }]);
        } finally {
            setIsContextLoading(false);
        }
    };

    const handleRunUpdate = (runData) => {
        if (!runData) {
            setError("The agent run was not found or an error occurred while listening for updates.");
            setIsStreaming(false);
            cleanupListener();
            return;
        }

        if(runData.adkSessionId && !currentSessionId) {
            setCurrentSessionId(runData.adkSessionId);
        }

        // Update the agent's message in the conversation
        const agentResponse = {
            type: 'agent',
            text: runData.finalResponseText || '', // Will be empty until the end
            events: runData.outputEvents || [],
            timestamp: new Date(),
            queryErrorDetails: runData.queryErrorDetails || null,
            artifactUpdates: extractArtifactUpdates(runData.outputEvents)
        };

        setConversation(prev => {
            const newConversation = [...prev];
            const lastMessageIndex = newConversation.findIndex(c => c.id === runData.id);
            if(lastMessageIndex > -1) {
                newConversation[lastMessageIndex] = {...agentResponse, id: runData.id};
            } else {
                newConversation.push({...agentResponse, id: runData.id});
            }
            return newConversation;
        });

        // Update last event summary
        const lastEvent = runData.outputEvents?.[runData.outputEvents.length - 1];
        if (lastEvent) {
            let summary = `Event: ${lastEvent.type}`;
            if (lastEvent.content?.parts?.[0]?.tool_code?.name) {
                summary = `Calling tool: ${lastEvent.content.parts[0].tool_code.name}`;
            } else if (lastEvent.author) {
                const authorName = lastEvent.author.split('_')[0];
                summary = `Received content from ${authorName}`;
            }
            setLastEventSummary(summary);
        }

        // Check if the run is complete
        if (runData.status === 'completed' || runData.status === 'error') {
            setIsStreaming(false);
            setLastEventSummary('');
            cleanupListener();
        }
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (isHistoricalView) return;
        cleanupListener();

        let lastProperMessageIndex = -1;
        for (let i = conversation.length - 1; i >= 0; i--) { if (['user', 'agent', 'error'].includes(conversation[i].type)) { lastProperMessageIndex = i; break; } }
        const recentContextMessages = conversation.slice(lastProperMessageIndex + 1);
        const activeContextItems = [];
        recentContextMessages.forEach(convItem => { if (convItem.type === 'stuffed_context' && convItem.items) { activeContextItems.push(...convItem.items); } });
        const userQueryText = message.trim();
        if (!userQueryText && activeContextItems.length === 0) return;

        let combinedMessageForAgent = userQueryText;
        if (activeContextItems.length > 0) {
            const contextString = activeContextItems.map(item => `File: ${item.name}\n\`\`\`\n${item.content}\n\`\`\`\n`).join('\n---\n');
            combinedMessageForAgent = `${contextString}\n---\nUser Query:\n${userQueryText || "[No explicit user query, process provided context]"}`;
        }

        const userMessageDisplay = userQueryText || (activeContextItems.length > 0 ? "[Sending context to agent]" : "[Empty message]");
        const userMessageEntry = { type: 'user', text: userMessageDisplay, timestamp: new Date() };
        setConversation(prev => [...prev, userMessageEntry]);

        setMessage('');
        setIsLoading(true); // Start loading for the initial API call
        setError(null);
        setLastEventSummary('');

        try {
            // This call now returns quickly with the runId
            const result = await queryAgent(agentResourceName, combinedMessageForAgent, adkUserId, currentSessionId, agentFirestoreId, activeContextItems);

            if (result.success && result.runId) {
                setIsLoading(false); // Initial call is done
                setIsStreaming(true); // Now we start streaming from Firestore

                // Add a placeholder for the agent's response
                setConversation(prev => [...prev, { type: 'agent', id: result.runId, text: '', events: [], timestamp: new Date() }]);

                // Start listening to the run document
                unsubscribeRunListener.current = listenToAgentRun(agentFirestoreId, result.runId, handleRunUpdate);
            } else {
                const errorMessage = result.message || "Failed to initiate agent run.";
                setError(errorMessage);
                setConversation(prev => [...prev, { type: 'error', text: `Failed to start: ${errorMessage}`, timestamp: new Date() }]);
                setIsLoading(false);
            }
        } catch (err) {
            const errorMessage = err.message || "An error occurred while initiating the agent query.";
            setError(errorMessage);
            setConversation(prev => [...prev, { type: 'error', text: errorMessage, timestamp: new Date() }]);
            setIsLoading(false);
        }
    };


    const handleResetSessionOrSwitchMode = () => {
        cleanupListener();
        if (isHistoricalView) {
            onSwitchToLiveChat();
        } else {
            setCurrentSessionId(null);
            setConversation([]);
            setError(null);
            setIsStreaming(false);
            setLastEventSummary('');
        }
    };

    const getAvatar = (type) => {
        if (type === 'user') return <Avatar sx={{ bgcolor: 'primary.main' }}><PersonIcon /></Avatar>;
        if (type === 'agent') return <Avatar sx={{ bgcolor: 'secondary.main' }}><SmartToyIcon /></Avatar>;
        if (type === 'stuffed_context' || type === 'stuffed_context_history') return <Avatar sx={{bgcolor: 'info.main', width: 32, height: 32 }}><DatasetLinkedIcon sx={{fontSize: '1rem'}}/></Avatar>;
        return <Avatar sx={{ bgcolor: 'error.main' }}><ErrorOutlineIcon /></Avatar>;
    };

    const runnerTitle = isHistoricalView ? "Run History Viewer" : "Run Agent (Live)";
    const canAttemptLiveChat = !isHistoricalView && isLiveModeEnabled;

    const hasNewContextToProcess = conversation.slice(
        conversation.slice().reverse().findIndex(m => ['user','agent','error'].includes(m.type)) +1
    ).some(m => m.type === 'stuffed_context');

    const sendButtonDisabled = isLoading || isStreaming || isContextLoading || isHistoricalView || (!message.trim() && !hasNewContextToProcess);
    const inputControlsDisabled = isLoading || isStreaming || isContextLoading || isHistoricalView;

    return (
        <Paper elevation={3} sx={{ p: { xs: 2, md: 3 }, mt: 4 }}>
            <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb:1}}>
                <Typography variant="h5" component="h2" gutterBottom>{runnerTitle}</Typography>
                {isLiveModeEnabled && (
                    <Button
                        onClick={handleResetSessionOrSwitchMode}
                        startIcon={isHistoricalView ? <LiveTvIcon /> : <RestartAltIcon />}
                        color={isHistoricalView ? "primary" : "warning"}
                        variant="outlined"
                        size="small"
                        disabled={!isHistoricalView && (isLoading || isContextLoading || isStreaming)}
                    >
                        {isHistoricalView ? "Back to Live Chat" : "Reset Live Chat"}
                    </Button>
                )}
            </Box>

            {isHistoricalView && historicalRunData && ( <Alert severity="info" sx={{mb:2}}>You are viewing a historical run from {new Date(historicalRunData.timestamp?.toDate()).toLocaleString()}.</Alert> )}
            {!isLiveModeEnabled && !isHistoricalView && ( <Alert severity="warning" sx={{mb:2}}>Live agent interaction is not available. The agent might not be deployed or accessible.</Alert> )}
            {!isHistoricalView && error && <ErrorMessage message={error} severity="error" sx={{ mb: 2 }} />}
            {isContextLoading && !isHistoricalView && <Box sx={{display: 'flex', justifyContent:'center', alignItems: 'center', my: 1.5}}> <CircularProgress size={20} sx={{mr:1}} /> <Typography variant="body2" color="text.secondary">Fetching context...</Typography> </Box> }

            <Box sx={{ height: '400px', overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2, mb: 2, bgcolor: 'background.paper', }}>
                <List>
                    {conversation.map((entry, index) => (
                        <ListItem key={entry.id || index} sx={{ display: 'flex', flexDirection: (entry.type === 'user' || entry.type === 'stuffed_context' || entry.type === 'stuffed_context_history') ? 'row-reverse' : 'row', mb: 1, alignItems: 'flex-start', }}>
                            { (entry.type !== 'stuffed_context' && entry.type !== 'stuffed_context_history') ? getAvatar(entry.type) : null }
                            { (entry.type === 'stuffed_context' || entry.type === 'stuffed_context_history') ? (
                                <Box sx={{ width: '100%', display: 'flex', justifyContent: 'flex-end', alignItems:'center', my: 0.5 }}>
                                    {getAvatar(entry.type)}
                                    <Box sx={{ml: (entry.type !== 'user' && entry.type !== 'stuffed_context' && entry.type !== 'stuffed_context_history') ? 1.5 : 0, mr: (entry.type === 'user' || entry.type === 'stuffed_context' || entry.type === 'stuffed_context_history') ? 1.5 : 0, maxWidth:'80%'}}>
                                        <ContextDisplayBubble contextMessage={entry} onOpenDetails={() => handleOpenContextDetails(entry.items)} />
                                    </Box>
                                </Box>
                            ) : (
                                <Paper elevation={1} sx={{ p: 1.5, ml: (entry.type !== 'user') ? 1.5 : 0, mr: (entry.type === 'user') ? 1.5 : 0, bgcolor: entry.type === 'user' ? 'primary.light' : entry.type === 'agent' ? (entry.queryErrorDetails ? 'warning.light' : 'grey.200') : 'error.light', color: entry.type === 'user' ? 'primary.contrastText' : entry.type === 'agent' ? (entry.queryErrorDetails ? 'warning.contrastText' : 'text.primary') : 'error.contrastText', maxWidth: '80%', wordBreak: 'break-word', position: 'relative', }}>
                                    <ListItemText disableTypography
                                                  primary={
                                                      entry.type === 'agent' && entry.text ? (
                                                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={muiMarkdownComponentsConfig}>{entry.text}</ReactMarkdown>
                                                      ) : entry.type === 'user' ? (
                                                          <Typography variant="body1">{entry.text}</Typography>
                                                      ) : (
                                                          <Typography variant="body1" color={entry.type === 'agent' && entry.queryErrorDetails ? 'warning.contrastText' : 'error.contrastText' }>{entry.text}</Typography>
                                                      )
                                                  }
                                                  secondary={<Typography variant="caption" sx={{ display: 'block', textAlign: entry.type === 'user' ? 'right' : 'left', mt: 0.5, color: entry.type === 'user' ? 'primary.contrastText' : entry.type === 'agent' ? (entry.queryErrorDetails ? 'warning.contrastText' : 'text.secondary') : 'error.contrastText', opacity: entry.type === 'user' ? 0.8 : 1, }}>{new Date(entry.timestamp).toLocaleTimeString()}{entry.type === 'agent' && currentSessionId && !isHistoricalView && ` (S: ...${currentSessionId.slice(-4)})`}{entry.type === 'agent' && isHistoricalView && historicalRunData?.adkSessionId && ` (S: ...${historicalRunData.adkSessionId.slice(-4)})`}</Typography>}
                                    />
                                    {entry.type === 'agent' && entry.artifactUpdates && (
                                        <Box mt={1} sx={{ borderTop: '1px dashed', borderColor: 'divider', pt: 1, opacity: 0.8}}>
                                            <Typography variant="caption" display="flex" alignItems="center" sx={{fontWeight: 'medium', color: entry.queryErrorDetails ? 'warning.contrastText' : 'text.secondary' }}> <Inventory2Icon fontSize="inherit" sx={{mr:0.5, verticalAlign: 'middle'}}/> Artifacts Updated: </Typography>
                                            <Box component="ul" sx={{pl: 2, m:0, listStyleType:'none'}}>
                                                {Object.entries(entry.artifactUpdates).map(([filename, version]) => ( <Typography component="li" key={filename} variant="caption" display="block" sx={{fontSize: '0.7rem', color: entry.queryErrorDetails ? 'warning.contrastText' : 'text.secondary'}}>{filename} (v{version})</Typography> ))}
                                            </Box>
                                        </Box>
                                    )}
                                    {entry.type === 'agent' && entry.queryErrorDetails && entry.queryErrorDetails.length > 0 && (
                                        <Alert severity="warning" sx={{ mt: 1, fontSize: '0.8rem', bgcolor: 'transparent', color: 'inherit', '& .MuiAlert-icon': { color: 'inherit', fontSize: '1.1rem', mr:0.5, pt:0.2 }, border: (theme) => `1px solid ${theme.palette.warning.dark}`, p:1, }} iconMapping={{ warning: <ErrorOutlineIcon fontSize="inherit" /> }} >
                                            <AlertTitle sx={{ fontSize: '0.9rem', fontWeight: 'bold', mb:0.5 }}>Agent Diagnostics:</AlertTitle>
                                            <Box component="ul" sx={{ margin: 0, paddingLeft: '20px', listStyleType: 'disc', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight:'150px', overflowY:'auto' }}>
                                                {entry.queryErrorDetails.map((err, i) => ( <Typography component="li" variant="caption" key={i} sx={{display:'list-item'}}>{typeof err === 'object' ? JSON.stringify(err) : err}</Typography>))}
                                            </Box>
                                            {(!entry.text || entry.text.trim() === "Agent responded." || entry.text.trim() === "") && ( <Typography variant="caption" display="block" sx={{mt:1, fontStyle:'italic'}}>The agent may not have provided a complete response due to these issues.</Typography> )}
                                        </Alert>
                                    )}
                                    {entry.type === 'agent' && entry.events && entry.events.length > 0 && (
                                        <Tooltip title="View Agent Reasoning Log" placement="top">
                                            <IconButton size="small" onClick={() => handleOpenReasoningLog(entry.events)} sx={{ position: 'absolute', bottom: 2, right: 2, color: (theme) => theme.palette.action.active, '&:hover': { bgcolor: (theme) => theme.palette.action.hover } }} aria-label="view agent reasoning" >
                                                <DeveloperModeIcon fontSize="inherit" />
                                            </IconButton>
                                        </Tooltip>
                                    )}
                                </Paper>
                            )}
                        </ListItem>
                    ))}
                    {(isLoading || isStreaming) && !isHistoricalView && (
                        <ListItem sx={{ justifyContent: 'flex-start', mb: 1 }}>
                            <Avatar sx={{ bgcolor: 'secondary.main' }}><SmartToyIcon /></Avatar>
                            <Paper elevation={1} sx={{ p: 1.5, ml: 1.5, bgcolor: 'grey.200', display: 'inline-flex', alignItems: 'center' }}>
                                <CircularProgress size={20} sx={{ mr: 1.5 }} />
                                <Typography variant="body2" color="text.secondary">
                                    {isLoading ? 'Initiating...' : `Agent is thinking... ${lastEventSummary && `(${lastEventSummary})`}`}
                                </Typography>
                            </Paper>
                        </ListItem>
                    )}
                    <div ref={conversationEndRef} />
                </List>
            </Box>

            {canAttemptLiveChat && (
                <Box component="form" onSubmit={handleSendMessage} sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
                    <TextField fullWidth variant="outlined"
                               value={message}
                               onChange={(e) => setMessage(e.target.value)}
                               placeholder={inputControlsDisabled ? "Agent is running..." : "Type your message to the agent..."}
                               disabled={inputControlsDisabled}
                               onKeyPress={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e);}}} size="small" multiline maxRows={5} />
                    <ContextStuffingDropdown onOptionSelected={handleContextOptionSelected} disabled={inputControlsDisabled} />
                    <Button type="submit" variant="contained" color="primary" disabled={sendButtonDisabled} endIcon={<SendIcon />} sx={{ height: '100%', alignSelf: 'stretch' }} >Send</Button>
                </Box>
            )}

            <AgentReasoningLogDialog open={isReasoningLogOpen} onClose={handleCloseReasoningLog} events={selectedEventsForLog} />
            {isContextModalOpen && contextModalType === 'webpage' && ( <WebPageContextModal open={isContextModalOpen} onClose={handleCloseContextModal} onSubmit={handleContextSubmit} /> )}
            {isContextModalOpen && contextModalType === 'gitrepo' && ( <GitRepoContextModal open={isContextModalOpen} onClose={handleCloseContextModal} onSubmit={handleContextSubmit} /> )}
            {isContextModalOpen && contextModalType === 'pdf' && ( <PdfContextModal open={isContextModalOpen} onClose={handleCloseContextModal} onSubmit={handleContextSubmit} /> )}
            {isContextModalOpen && contextModalType === 'image' && ( <ImageContextModal open={isContextModalOpen} onClose={handleCloseContextModal} onSubmit={handleContextSubmit} /> )}
            <ContextDetailsDialog open={isContextDetailsOpen} onClose={handleCloseContextDetails} contextItems={selectedContextItemsForDetails} />
        </Paper>
    );
};

export default AgentRunner;  