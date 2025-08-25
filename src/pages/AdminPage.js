// src/pages/AdminPage.js
import React, { useState, useEffect } from 'react';
import { getUsersForAdminReview, updateUserPermissions } from '../services/userService';
import UserPermissionDialog from '../components/admin/UserPermissionDialog';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import {
    Container, Typography, Paper, List, ListItem, ListItemText,
    ListItemSecondaryAction, IconButton, Alert
} from '@mui/material';
import EditPermissionsIcon from '@mui/icons-material/EditAttributes'; // Example icon
import { useAuth } from '../contexts/AuthContext';

const AdminPage = () => {
    const [usersForReview, setUsersForReview] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedUser, setSelectedUser] = useState(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const { currentUser } = useAuth(); // For checking if current admin is trying to edit themselves

    const fetchUsers = async () => {
        setLoading(true);
        setError(null);
        try {
            const users = await getUsersForAdminReview();
            setUsersForReview(users);
        } catch (err) {
            console.error("Error fetching users for review:", err);
            setError("Failed to load users. " + err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleOpenDialog = (user) => {
        if (user.id === currentUser.uid) {
            alert("Admins cannot change their own permissions through this panel for safety. Please use Firestore console if necessary.");
            return;
        }
        setSelectedUser(user);
        setIsDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setSelectedUser(null);
        setIsDialogOpen(false);
    };

    const handleSavePermissions = async (userId, permissionsData) => {
        try {
            await updateUserPermissions(userId, permissionsData);
            // Refresh list after saving
            fetchUsers();
            // Optionally show a success message (Snackbar)
        } catch (err) {
            console.error("Error saving permissions from AdminPage:", err);
            setError("Failed to save permissions. " + err.message);
            // Error will be shown in dialog or here
        }
    };

    if (loading) return <Container sx={{ py: 3 }}><LoadingSpinner /></Container>;


    return (
        <Container maxWidth="md" sx={{ py: 3 }}>
            <Typography variant="h4" component="h1" gutterBottom>
                Admin Panel - User Permissions
            </Typography>
            <Paper elevation={3} sx={{ p: { xs: 2, md: 3 } }}>
                <Typography variant="h6" component="h2" gutterBottom>
                    Users Awaiting Permission Setup
                </Typography>
                {error && <ErrorMessage message={error} sx={{ mb: 2 }} />}
                {usersForReview.length === 0 && !error && (
                    <Alert severity="info">No users currently require permission setup.</Alert>
                )}
                <List>
                    {usersForReview.map(user => (
                        <ListItem key={user.id} divider button onClick={() => handleOpenDialog(user)}>
                            <ListItemText
                                primary={user.displayName || user.email}
                                secondary={`UID: ${user.id} | Joined: ${user.createdAt?.toDate ? user.createdAt.toDate().toLocaleDateString() : 'N/A'}`}
                            />
                            <ListItemSecondaryAction>
                                <IconButton edge="end" aria-label="edit permissions" onClick={() => handleOpenDialog(user)}
                                            disabled={user.id === currentUser.uid}
                                >
                                    <EditPermissionsIcon />
                                </IconButton>
                            </ListItemSecondaryAction>
                        </ListItem>
                    ))}
                </List>
            </Paper>

            {selectedUser && (
                <UserPermissionDialog
                    open={isDialogOpen}
                    onClose={handleCloseDialog}
                    user={selectedUser}
                    onSave={handleSavePermissions}
                />
            )}
        </Container>
    );
};

export default AdminPage;