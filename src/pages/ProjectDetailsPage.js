// src/pages/ProjectDetailsPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import { getProjectDetails, updateProject, deleteProject } from '../services/projectService';
import { getAgentsForProjects, updateAgentInFirestore } from '../services/agentFirestoreService';
import { getModelsForProjects, updateModel } from '../services/modelService';
import { getChatsForProjects, createChat, updateChat, deleteChat } from '../services/chatService';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import {
    Container, Typography, Box, Paper, Tabs, Tab, Button,
    List, ListItemText, ListItemButton, Dialog, DialogTitle, DialogContent, TextField, DialogActions,
    ListItem, IconButton, Tooltip, CircularProgress
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ChatIcon from '@mui/icons-material/Chat';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ModelTrainingIcon from '@mui/icons-material/ModelTraining';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import SaveIcon from '@mui/icons-material/Save';

import LinkOffIcon from '@mui/icons-material/LinkOff';

function TabPanel(props) {
    const { children, value, index, ...other } = props;
    return (
        <div role="tabpanel" hidden={value !== index} {...other}>
            {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
        </div>
    );
}

const ProjectDetailsPage = () => {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [project, setProject] = useState(null);
    const [agents, setAgents] = useState([]);
    const [models, setModels] = useState([]);
    const [chats, setChats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tabValue, setTabValue] = useState(0);
    const [isChatDialogOpen, setIsChatDialogOpen] = useState(false);
    const [newChatTitle, setNewChatTitle] = useState('');

    // State for managing chat operations
    const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
    const [chatToRename, setChatToRename] = useState(null);
    const [renamedChatTitle, setRenamedChatTitle] = useState('');
    const [deletingChatId, setDeletingChatId] = useState(null);

    // New state for project editing
    const [isEditingProject, setIsEditingProject] = useState(false);
    const [editedProjectName, setEditedProjectName] = useState('');
    const [editedProjectDescription, setEditedProjectDescription] = useState('');
    const [isSavingProject, setIsSavingProject] = useState(false);
    const [isDeletingProject, setIsDeletingProject] = useState(false);


    const fetchData = useCallback(async () => {
        if (!currentUser || !projectId) return;
        try {
            setLoading(true);
            const projectDetails = await getProjectDetails(projectId);
            setProject(projectDetails);

            const [projectAgents, projectModels, projectChats] = await Promise.all([
                getAgentsForProjects([projectId]),
                getModelsForProjects([projectId]),
                getChatsForProjects([projectId])
            ]);
            setAgents(projectAgents);
            setModels(projectModels);
            setChats(projectChats);
        } catch (err) {
            console.error("Error fetching project details:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [currentUser, projectId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleTabChange = (event, newValue) => {
        setTabValue(newValue);
    };

    const handleCreateNew = () => {
        const preselectedProject = { state: { preselectedProjectIds: [projectId] } };
        if (tabValue === 0) setIsChatDialogOpen(true); // Chats
        if (tabValue === 1) navigate('/create-agent', preselectedProject); // Agents
        if (tabValue === 2) navigate('/create-model', preselectedProject); // Models
    };

    const handleCreateChat = async () => {
        if (!newChatTitle.trim()) return;
        try {
            const newChatId = await createChat(currentUser.uid, {
                title: newChatTitle,
                projectIds: [projectId]
            });
            setIsChatDialogOpen(false);
            setNewChatTitle('');
            navigate(`/chat/${newChatId}`);
        } catch (err) {
            console.error("Error creating chat:", err);
            setError(`Failed to create chat: ${err.message}`);
        }
    };

    // Unlink model from project
    const handleUnlinkModel = async (model) => {
        if (!window.confirm(`Are you sure you want to unlink model "${model.name}" from this project?`)) return;
        try {
            // Remove projectId from model.projectIds array
            const newProjectIds = (model.projectIds || []).filter(pid => pid !== projectId);
            await updateModel(model.id, { projectIds: newProjectIds });
            // Update local state
            setModels(prev => prev.filter(m => m.id !== model.id));
        } catch (err) {
            console.error("Failed to unlink model:", err);
            setError(`Failed to unlink model: ${err.message}`);
        }
    };

    // Unlink agent from project
    const handleUnlinkAgent = async (agent) => {
        if (!window.confirm(`Are you sure you want to unlink agent "${agent.name}" from this project?`)) return;
        try {
            const newProjectIds = (agent.projectIds || []).filter(pid => pid !== projectId);
            await updateAgentInFirestore(agent.id, { projectIds: newProjectIds });
            setAgents(prev => prev.filter(a => a.id !== agent.id));
        } catch (err) {
            console.error("Failed to unlink agent:", err);
            setError(`Failed to unlink agent: ${err.message}`);
        }
    };

    const handleOpenRenameDialog = (chat) => {
        setChatToRename(chat);
        setRenamedChatTitle(chat.title);
        setIsRenameDialogOpen(true);
    };

    const handleCloseRenameDialog = () => {
        setIsRenameDialogOpen(false);
        setChatToRename(null);
        setRenamedChatTitle('');
    };

    const handleRenameChat = async () => {
        if (!renamedChatTitle.trim() || !chatToRename) return;
        try {
            await updateChat(chatToRename.id, { title: renamedChatTitle });
            setChats(prev => prev.map(c => c.id === chatToRename.id ? { ...c, title: renamedChatTitle } : c));
            handleCloseRenameDialog();
        } catch (err) {
            console.error("Error renaming chat:", err);
            setError(`Failed to rename chat: ${err.message}`);
        }
    };

    const handleDeleteChat = async (chatId, chatTitle) => {
        if (window.confirm(`Are you sure you want to delete the chat "${chatTitle}"? This will delete all its messages and cannot be undone.`)) {
            setDeletingChatId(chatId);
            setError(null);
            try {
                await deleteChat(chatId);
                setChats(prev => prev.filter(c => c.id !== chatId));
            } catch (err) {
                console.error("Error deleting chat:", err);
                setError(`Failed to delete chat: ${err.message}`);
            } finally {
                setDeletingChatId(null);
            }
        }
    };

    const handleEditProject = () => {
        setEditedProjectName(project.name);
        setEditedProjectDescription(project.description || '');
        setIsEditingProject(true);
    };

    const handleCancelEditProject = () => {
        setIsEditingProject(false);
    };

    const handleSaveProject = async () => {
        if (!editedProjectName.trim()) {
            setError("Project name cannot be empty.");
            return;
        }
        setIsSavingProject(true);
        setError(null);
        try {
            const updatedData = { name: editedProjectName.trim(), description: editedProjectDescription.trim() };
            await updateProject(projectId, updatedData);
            setProject(prev => ({ ...prev, ...updatedData }));
            setIsEditingProject(false);
        } catch (err) {
            console.error("Error updating project:", err);
            setError(`Failed to update project: ${err.message}`);
        } finally {
            setIsSavingProject(false);
        }
    };

    const handleDeleteProject = async () => {
        if (window.confirm(`Are you sure you want to delete the project "${project.name}"? This action cannot be undone.`)) {
            setIsDeletingProject(true);
            setError(null);
            try {
                await deleteProject(projectId);
                navigate('/projects');
            } catch (err) {
                console.error("Error deleting project:", err);
                setError(`Failed to delete project: ${err.message}`);
                setIsDeletingProject(false);
            }
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}><LoadingSpinner /></Box>;
    if (error && !project) return <ErrorMessage message={error} />;
    if (!project) return <Typography>Project not found.</Typography>;

    const tabLabels = ["Chats", "Agents", "Models"];

    return (
        <Container maxWidth="lg">
            {error && <ErrorMessage message={error} sx={{mb: 2}} severity="error" />}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box sx={{ flexGrow: 1 }}>
                    {isEditingProject ? (
                        <Box component="form" onSubmit={(e) => { e.preventDefault(); handleSaveProject(); }}>
                            <TextField
                                variant="standard"
                                value={editedProjectName}
                                onChange={(e) => setEditedProjectName(e.target.value)}
                                sx={{ '& .MuiInput-input': { fontSize: '2.125rem', fontWeight: 400 } }}
                                autoFocus
                            />
                            <TextField
                                variant="standard"
                                fullWidth
                                value={editedProjectDescription}
                                onChange={(e) => setEditedProjectDescription(e.target.value)}
                                placeholder="Project description"
                                sx={{ mt: 1 }}
                            />
                        </Box>
                    ) : (
                        <>
                            <Typography variant="h4" component="h1">{project.name}</Typography>
                            <Typography color="text.secondary">{project.description}</Typography>
                        </>
                    )}
                </Box>
                <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreateNew} disabled={isEditingProject}>
                    New {tabLabels[tabValue]}
                </Button>
            </Box>

            <Paper>
                <Box sx={{ borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Tabs value={tabValue} onChange={handleTabChange} sx={{flexGrow: 1}}>
                        <Tab icon={<ChatIcon />} label="Chats" />
                        <Tab icon={<SmartToyIcon />} label="Agents" />
                        <Tab icon={<ModelTrainingIcon />} label="Models" />
                    </Tabs>
                    <Box sx={{ p: 1, display: 'flex', gap: 1 }}>
                        {isEditingProject ? (
                            <>
                                <Button onClick={handleSaveProject} variant="contained" startIcon={<SaveIcon />} size="small" disabled={isSavingProject}>
                                    {isSavingProject ? 'Saving...' : 'Save'}
                                </Button>
                                <Button onClick={handleCancelEditProject} variant="outlined" size="small" disabled={isSavingProject}>
                                    Cancel
                                </Button>
                            </>
                        ) : (
                            isDeletingProject ? (
                                <CircularProgress size={24} />
                            ) : (
                                <>
                                    <Tooltip title="Edit Project">
                                        <IconButton onClick={handleEditProject}>
                                            <EditIcon />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Delete Project">
                                        <IconButton onClick={handleDeleteProject} color="error">
                                            <DeleteIcon />
                                        </IconButton>
                                    </Tooltip>
                                </>
                            )
                        )}
                    </Box>
                </Box>
                <TabPanel value={tabValue} index={0}>
                    <List>
                        {chats.map(chat => (
                            <ListItem
                                key={chat.id}
                                disablePadding
                                secondaryAction={
                                    deletingChatId === chat.id ? (
                                        <CircularProgress size={24} />
                                    ) : (
                                        <Box>
                                            <Tooltip title="Rename Chat">
                                                <IconButton edge="end" aria-label="rename" onClick={() => handleOpenRenameDialog(chat)}>
                                                    <EditIcon />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Tagging coming soon!">
                                                <span>
                                                    <IconButton edge="end" aria-label="tag" disabled>
                                                        <LocalOfferIcon />
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                            <Tooltip title="Delete Chat">
                                                <IconButton edge="end" aria-label="delete" color="error" onClick={() => handleDeleteChat(chat.id, chat.title)}>
                                                    <DeleteIcon />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    )
                                }
                            >
                                <ListItemButton component={RouterLink} to={`/chat/${chat.id}`}>
                                    <ListItemText
                                        primary={chat.title}
                                        secondary={`Last active: ${chat.lastInteractedAt?.toDate().toLocaleString()}`}
                                    />
                                </ListItemButton>
                            </ListItem>
                        ))}
                    </List>
                </TabPanel>
                <TabPanel value={tabValue} index={1}>
                    <List>
                        {agents.map(agent => (
                            <ListItem
                                key={agent.id}
                                secondaryAction={
                                    <Tooltip title="Unlink from Project">
                                        <IconButton edge="end" aria-label="unlink" onClick={() => handleUnlinkAgent(agent)}>
                                            <LinkOffIcon />
                                        </IconButton>
                                    </Tooltip>
                                }
                                disablePadding
                            >
                                <ListItemButton component={RouterLink} to={`/agent/${agent.id}/edit`}>
                                    <ListItemText primary={agent.name} secondary={agent.description} />
                                </ListItemButton>
                            </ListItem>
                        ))}
                    </List>
                </TabPanel>
                <TabPanel value={tabValue} index={2}>
                    <List>
                        {models.map(model => (
                            <ListItem
                                key={model.id}
                                secondaryAction={
                                    <Tooltip title="Unlink from Project">
                                        <IconButton edge="end" aria-label="unlink" onClick={() => handleUnlinkModel(model)}>
                                            <LinkOffIcon />
                                        </IconButton>
                                    </Tooltip>
                                }
                                disablePadding
                            >
                                <ListItemButton component={RouterLink} to={`/model/${model.id}`}>
                                    <ListItemText primary={model.name} secondary={model.description} />
                                </ListItemButton>
                            </ListItem>
                        ))}
                    </List>
                </TabPanel>
            </Paper>

            <Dialog open={isChatDialogOpen} onClose={() => setIsChatDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Start a New Chat</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Chat Title"
                        type="text"
                        fullWidth
                        variant="standard"
                        value={newChatTitle}
                        onChange={(e) => setNewChatTitle(e.target.value)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsChatDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateChat} disabled={!newChatTitle.trim()}>Create</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={isRenameDialogOpen} onClose={handleCloseRenameDialog} maxWidth="sm" fullWidth>
                <DialogTitle>Rename Chat</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="New Chat Title"
                        type="text"
                        fullWidth
                        variant="standard"
                        value={renamedChatTitle}
                        onChange={(e) => setRenamedChatTitle(e.target.value)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseRenameDialog}>Cancel</Button>
                    <Button onClick={handleRenameChat} disabled={!renamedChatTitle.trim() || renamedChatTitle === chatToRename?.title}>
                        Rename
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
};

export default ProjectDetailsPage;