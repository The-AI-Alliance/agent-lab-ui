// src/components/chat/ChatComposer.js
import React, { useState } from 'react';
import {
    Box, TextField, ButtonGroup, Button, Menu, MenuItem, Divider,
    ListSubheader, CircularProgress
} from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ModelTrainingIcon from '@mui/icons-material/ModelTraining';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import WebPageContextModal from '../context_stuffing/WebPageContextModal';
import GitRepoContextModal from '../context_stuffing/GitRepoContextModal';
import PdfContextModal from '../context_stuffing/PdfContextModal';
import ImageContextModal from '../context_stuffing/ImageContextModal';
import Typography from '@mui/material/Typography';

const ChatComposer = ({ models, agents, isReadOnly, sending, isContextLoading, onActionSubmit, onContextSubmit }) => {
    const [composerValue, setComposerValue] = useState('');
    const [composerAction, setComposerAction] = useState({ type: 'text' });
    const [actionButtonAnchorEl, setActionButtonAnchorEl] = useState(null);
    const isMenuOpen = Boolean(actionButtonAnchorEl);
    const [contextModalType, setContextModalType] = useState(null);
    const isContextModalOpen = Boolean(contextModalType);

    const handleOpenMenu = (event) => setActionButtonAnchorEl(event.currentTarget);
    const handleCloseMenu = () => setActionButtonAnchorEl(null);

    const handleMenuActionSelect = (action) => {
        if (action.type.startsWith('context-')) {
            setContextModalType(action.type.split('-')[1]);
        } else {
            setComposerAction(action);
        }
        handleCloseMenu();
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();
        onActionSubmit(composerAction, composerValue);
        if (composerAction.type === 'text') {
            setComposerValue('');
        }
    };

    const handleCloseContextModal = () => setContextModalType(null);

    const sendButtonDisabled = sending || isContextLoading || (composerAction.type === 'text' && !composerValue.trim());

    return (
        <>
            <Box component="form" onSubmit={handleFormSubmit} sx={{ display: 'flex', alignItems: 'flex-end', mt: 2, gap: 1 }}>
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

            {isContextModalOpen && contextModalType === 'webpage' && (<WebPageContextModal open={isContextModalOpen} onClose={handleCloseContextModal} onSubmit={onContextSubmit} />)}
            {isContextModalOpen && contextModalType === 'gitrepo' && (<GitRepoContextModal open={isContextModalOpen} onClose={handleCloseContextModal} onSubmit={onContextSubmit} />)}
            {isContextModalOpen && contextModalType === 'pdf' && (<PdfContextModal open={isContextModalOpen} onClose={handleCloseContextModal} onSubmit={onContextSubmit} />)}
            {isContextModalOpen && contextModalType === 'image' && (<ImageContextModal open={isContextModalOpen} onClose={handleCloseContextModal} onSubmit={onContextSubmit} />)}
        </>
    );
};

export default ChatComposer;