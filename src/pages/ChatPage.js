// src/pages/ChatPage.js
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useConfig } from '../contexts/ConfigContext';
import * as chatService from '../services/chatService';
import { executeQuery } from '../services/agentService';
import { fetchWebPageContent, fetchGitRepoContents, processPdfContent, uploadImageForContext } from '../services/contextService';
import { useChatManager } from '../hooks/useChatManager';
import { extractContextItemsFromMessage } from '../utils/chatUtils';

import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import ChatHeader from '../components/chat/ChatHeader';
import MessageList from '../components/chat/MessageList';
import ChatComposer from '../components/chat/ChatComposer';
import AgentReasoningLogDialog from '../components/agents/AgentReasoningLogDialog';
import ContextDetailsDialog from '../components/context_stuffing/ContextDetailsDialog';

import { Container, Box, Paper, Snackbar } from '@mui/material';

const ChatPage = ({ isReadOnly = false }) => {
    const { currentUser } = useAuth();
    const { config } = useConfig();
    const { chatId, sharedChatId } = useParams();
    const effectiveChatId = sharedChatId || chatId;

    const { chat, messagesMap, activeLeafMsgId, conversationPath, agents, models, loading, error, messageContentCache, setActiveLeafMsgId } = useChatManager(chatId, sharedChatId);

    const [sending, setSending] = useState(false);
    const [pageError, setPageError] = useState(null);
    const [isReasoningLogOpen, setIsReasoningLogOpen] = useState(false);
    const [selectedEventsForLog, setSelectedEventsForLog] = useState([]);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [isContextLoading, setIsContextLoading] = useState(false);
    const [contextDetailsOpen, setContextDetailsOpen] = useState(false);
    const [contextDetailsItems, setContextDetailsItems] = useState([]);
    const [shareId, setShareId] = useState(null);
    const [sharing, setSharing] = useState(false);
    const [unsharing, setUnsharing] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: "" });

    useEffect(() => {
        if (!isReadOnly && config?.features?.enableChatSharing) {
            chatService.getSharedChatIdForOriginal(effectiveChatId)
                .then(id => setShareId(id))
                .catch(console.error);
        }
    }, [effectiveChatId, isReadOnly, config]);

    const handleFork = (msgId) => !isReadOnly && setActiveLeafMsgId(msgId);
    const handleNavigateBranch = (newLeafId) => !isReadOnly && setActiveLeafMsgId(newLeafId);

    const handleOpenReasoningLog = async (messageId) => {
        setLoadingEvents(true);
        setIsReasoningLogOpen(true);
        try {
            const events = await chatService.getEventsForMessage(effectiveChatId, messageId);
            setSelectedEventsForLog(events);
        } catch (err) {
            setSelectedEventsForLog([{ type: 'error', content: { text: `Failed to load log: ${err.message}` } }]);
        } finally {
            setLoadingEvents(false);
        }
    };

    const handleActionSubmit = async (composerAction, composerValue) => {
        setSending(true);
        setPageError(null);
        try {
            if (composerAction.type === 'text') {
                const trimmed = composerValue.trim();
                if (trimmed) {
                    await chatService.addChatMessage(effectiveChatId, {
                        participant: `user:${currentUser.uid}`,
                        parts: [{ text: trimmed }],
                        parentMessageId: activeLeafMsgId
                    });
                }
            } else if (composerAction.type === 'agent' || composerAction.type === 'model') {
                await executeQuery({
                    chatId: effectiveChatId,
                    agentId: composerAction.type === 'agent' ? composerAction.id : undefined,
                    modelId: composerAction.type === 'model' ? composerAction.id : undefined,
                    adkUserId: currentUser.uid,
                    parentMessageId: activeLeafMsgId
                });
            }
        } catch (err) {
            setPageError(err.message);
        } finally {
            setSending(false);
        }
    };

    const handleContextSubmit = async (params) => {
        setIsContextLoading(true);
        setPageError(null);
        try {
            const commonParams = { chatId: effectiveChatId, parentMessageId: activeLeafMsgId };
            let result;
            if (params.type === 'webpage') result = await fetchWebPageContent({ ...params, ...commonParams });
            else if (params.type === 'gitrepo') result = await fetchGitRepoContents({ ...params, ...commonParams });
            else if (params.type === 'pdf') result = await processPdfContent({ ...params, ...commonParams });
            else if (params.type === 'image') result = await uploadImageForContext({ ...params, ...commonParams });
            else throw new Error("Unknown context type");
            if (!result?.success) throw new Error(result?.message || "Failed to process context.");
        } catch (err) {
            setPageError(`Failed to add context: ${err.message}`);
        } finally {
            setIsContextLoading(false);
        }
    };

    const openContextDetailsForMessage = (msg) => {
        setContextDetailsItems(extractContextItemsFromMessage(msg));
        setContextDetailsOpen(true);
    };

    const handleShare = async () => {
        setSharing(true);
        try {
            const newShareId = await chatService.shareChat(effectiveChatId);
            setShareId(newShareId);
            setSnackbar({ open: true, message: "Chat shared!" });
        } catch (err) {
            setSnackbar({ open: true, message: `Share failed: ${err.message}` });
        } finally {
            setSharing(false);
        }
    };

    const handleUnshare = async () => {
        if (!window.confirm("Are you sure you want to un-share this chat?")) return;
        setUnsharing(true);
        try {
            await chatService.unshareChat(shareId);
            setShareId(null);
            setSnackbar({ open: true, message: "Chat un-shared." });
        } catch (err) {
            setSnackbar({ open: true, message: `Failed to un-share chat: ${err.message}` });
        } finally {
            setUnsharing(false);
        }
    };

    const handleCopyLink = () => {
        const url = `${window.location.origin}/share/${shareId}`;
        navigator.clipboard.writeText(url);
        setSnackbar({ open: true, message: "Link copied to clipboard!" });
    };

    if (loading || !chat) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}><LoadingSpinner /></Box>;
    if ((error || pageError) && !conversationPath.length) return <ErrorMessage message={error || pageError} />;

    return (
        <Container sx={{ py: 3 }}>
            <Paper sx={{ p: { xs: 2, md: 4 } }}>
                <ChatHeader
                    chat={chat} config={config} isReadOnly={isReadOnly}
                    shareId={shareId} sharing={sharing} unsharing={unsharing}
                    onShare={handleShare} onCopyLink={handleCopyLink} onUnshare={handleUnshare}
                />

                {(error || pageError) && <ErrorMessage message={error || pageError} />}

                <MessageList
                    conversationPath={conversationPath}
                    models={models}
                    agents={agents}
                    currentUser={currentUser}
                    messagesMap={messagesMap}
                    activePath={conversationPath}
                    isReadOnly={isReadOnly}
                    onFork={handleFork}
                    onNavigateBranch={handleNavigateBranch}
                    onViewLog={handleOpenReasoningLog}
                    onOpenContextDetails={openContextDetailsForMessage}
                    messageContentCache={messageContentCache}
                />

                {!isReadOnly && (
                    <ChatComposer
                        models={models}
                        agents={agents}
                        isReadOnly={isReadOnly}
                        sending={sending}
                        isContextLoading={isContextLoading}
                        onActionSubmit={handleActionSubmit}
                        onContextSubmit={handleContextSubmit}
                    />
                )}
            </Paper>

            <AgentReasoningLogDialog open={isReasoningLogOpen} onClose={() => setIsReasoningLogOpen(false)} events={loadingEvents ? [] : selectedEventsForLog} />
            <ContextDetailsDialog open={contextDetailsOpen} onClose={() => setContextDetailsOpen(false)} contextItems={contextDetailsItems} />
            <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar(s => ({ ...s, open: false }))} message={snackbar.message} />
        </Container>
    );
}

export default ChatPage;