// src/pages/ProjectsPage.js
import React, { useState, useEffect } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getProjects } from '../services/projectService';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import {
    Container, Typography, Button, Box, Grid, Card, CardContent, CardActions
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';

const ProjectsPage = () => {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchProjects = async () => {
            if (!currentUser) return;
            try {
                setLoading(true);
                const fetchedProjects = await getProjects();
                setProjects(fetchedProjects);
            } catch (err) {
                console.error("Error fetching projects:", err);
                setError("Failed to load projects.");
            } finally {
                setLoading(false);
            }
        };
        fetchProjects();
    }, [currentUser]);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}><LoadingSpinner /></Box>;

    return (
        <Container maxWidth="lg">
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" component="h1">
                    Projects
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => navigate('/create-project')}
                >
                    New Project
                </Button>
            </Box>

            {error && <ErrorMessage message={error} />}

            {projects.length === 0 && !loading && (
                <Typography color="text.secondary" textAlign="center" sx={{ mt: 5 }}>
                    No projects found. Create your first project to get started.
                </Typography>
            )}

            <Grid container spacing={3}>
                {projects.map((project) => (
                    <Grid item xs={12} sm={6} md={4} key={project.id}>
                        <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                            <CardContent sx={{ flexGrow: 1 }}>
                                <Typography variant="h5" component="h2" gutterBottom>
                                    {project.name}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {project.description || 'No description provided.'}
                                </Typography>
                            </CardContent>
                            <CardActions>
                                <Button
                                    size="small"
                                    component={RouterLink}
                                    to={`/project/${project.id}`}
                                >
                                    View Details
                                </Button>
                            </CardActions>
                        </Card>
                    </Grid>
                ))}
            </Grid>
        </Container>
    );
};

export default ProjectsPage;