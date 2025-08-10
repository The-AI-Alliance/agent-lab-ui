// src/components/context_stuffing/ContextDetailsDialog.js
import React from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    Typography, Accordion, AccordionSummary, AccordionDetails, Chip
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DescriptionIcon from '@mui/icons-material/Description'; // Generic file icon

const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const ContextDetailsDialog = ({ open, onClose, contextItems }) => {
    if (!contextItems || contextItems.length === 0) {
        return (
            <Dialog open={open} onClose={onClose}>
                <DialogTitle>Context Details</DialogTitle>
                <DialogContent><Typography>No context items to display.</Typography></DialogContent>
                <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
            </Dialog>
        );
    }

    const renderContent = (item) => {
        const previewType = item.preview?.type;
        const previewValue = item.preview?.value;

        // Prefer preview when available
        if (previewType === 'image_url' && previewValue) {
            return <img src={previewValue} alt={item.name || 'context image'} style={{ maxWidth: '100%', height: 'auto', borderRadius: 4 }} />;
        }

        // Fallback for images if preview not set but signedUrl is usable
        if (item.type === 'image' && item.signedUrl) {
            return <img src={item.signedUrl} alt={item.name || 'context image'} style={{ maxWidth: '100%', height: 'auto', borderRadius: 4 }} />;
        }

        // Textual previews (webpage/pdf/git repo)
        const textToShow = previewValue || item.content || "Content not available or empty.";
        return (
            <Typography component="span" variant="body2" sx={{ fontFamily: 'monospace' }}>
                {textToShow}
            </Typography>
        );
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth scroll="paper">
            <DialogTitle>
                Stuffed Context Details ({contextItems.length} item{contextItems.length !== 1 ? 's' : ''})
            </DialogTitle>
            <DialogContent dividers>
                {contextItems.map((item, index) => (
                    <Accordion key={item.name + index} sx={{ mb: 1 }} TransitionProps={{ unmountOnExit: true }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <DescriptionIcon sx={{ mr: 1, color: 'text.secondary' }} />
                            <Typography
                                sx={{
                                    width: { xs: '40%', sm: '60%' },
                                    flexShrink: 0,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                }}
                                title={item.name}
                            >
                                {item.name}
                            </Typography>
                            <Chip
                                label={item.type?.toUpperCase() || 'UNKNOWN'}
                                size="small"
                                variant="outlined"
                                sx={{ mx: 1 }} />
                            <Typography sx={{ color: 'text.secondary', ml: 'auto' }}>
                                {formatBytes(item.bytes || (item.content ? item.content.length : 0))}
                            </Typography>
                        </AccordionSummary>
                        <AccordionDetails sx={{ bgcolor: 'background.default', borderTop: '1px solid', borderColor: 'divider' }}>
                            <Typography
                                component="pre"
                                sx={{
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    maxHeight: '400px',
                                    overflowY: 'auto',
                                    bgcolor: 'action.hover',
                                    p: 1.5,
                                    borderRadius: 1,
                                    fontFamily: item.type === 'image' ? 'inherit' : 'monospace',
                                    fontSize: '0.8rem',
                                    '& img': {
                                        maxWidth: '100%',
                                        height: 'auto',
                                        borderRadius: 1,
                                    }
                                }}
                            >
                                {renderContent(item)}
                            </Typography>
                        </AccordionDetails>
                    </Accordion>
                ))}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    );
};

export default ContextDetailsDialog;