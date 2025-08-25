// src/components/chat/ChatHeader.js
import React from 'react';
import { Typography, Box, IconButton, CircularProgress } from '@mui/material';
import ShareIcon from '@mui/icons-material/Share';
import CachedIcon from '@mui/icons-material/Cached';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

const ChatHeader = ({ chat, config, isReadOnly, shareId, sharing, unsharing, onShare, onCopyLink, onUnshare }) => {
    return (
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h4" gutterBottom sx={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {chat.title}
            </Typography>
            {config?.features?.enableChatSharing && !isReadOnly && (
                <Box>
                    {!shareId ? (
                        <IconButton onClick={onShare} disabled={sharing} aria-label="share chat" title="Share chat">
                            {sharing ? <CircularProgress size={20} /> : <ShareIcon />}
                        </IconButton>
                    ) : (
                        <>
                            <IconButton disabled={unsharing} aria-label="chat is shared" title="Chat is shared">
                                <CachedIcon />
                            </IconButton>
                            <IconButton onClick={onCopyLink} aria-label="copy share link" title="Copy share link">
                                <ContentCopyIcon />
                            </IconButton>
                            <IconButton onClick={onUnshare} disabled={unsharing} aria-label="unshare chat" title="Un-share chat">
                                {unsharing ? <CircularProgress size={20} /> : <DeleteOutlineIcon />}
                            </IconButton>
                        </>
                    )}
                </Box>
            )}
        </Box>
    );
};

export default ChatHeader;