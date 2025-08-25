// src/pages/CreateProjectPage.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { createProject } from '../services/projectService';
import {
    Container, Typography, Paper, TextField, Button, Box, CircularProgress, FormHelperText
} from '@mui/material';

const CreateProjectPage = () => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name.trim()) {
            setError('Project name is required.');
            return;
        }
        setIsSaving(true);
        setError('');
        try {
            const projectData = { name, description };
            const newProjectId = await createProject(currentUser.uid, projectData);
            navigate(`/project/${newProjectId}`);
        } catch (err) {
            console.error("Error creating project:", err);
            setError(`Failed to create project: ${err.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Container maxWidth="sm">
            <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 3 }}>
                Create New Project
            </Typography>
            <Paper component="form" onSubmit={handleSubmit} noValidate sx={{ p: { xs: 2, md: 4 } }}>
                <TextField
                    label="Project Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    fullWidth
                    variant="outlined"
                    margin="normal"
                />
                <TextField
                    label="Description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    multiline
                    rows={4}
                    fullWidth
                    variant="outlined"
                    margin="normal"
                />
                {error && <FormHelperText error sx={{ my: 1 }}>{error}</FormHelperText>}
                <Box sx={{ mt: 2 }}>
                    <Button
                        type="submit"
                        variant="contained"
                        color="primary"
                        disabled={isSaving}
                        fullWidth
                        size="large"
                        startIcon={isSaving ? <CircularProgress size={20} color="inherit" /> : null}
                    >
                        {isSaving ? 'Creating...' : 'Create Project'}
                    </Button>
                </Box>
            </Paper>
        </Container>
    );
};

export default CreateProjectPage;  