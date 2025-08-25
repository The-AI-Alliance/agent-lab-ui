// src/pages/ModelDetailsPage.js
import React, { useState, useEffect } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { getModelDetails } from '../services/modelService';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import {
    Container, Typography, Box, Paper, Grid, Button, Chip
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';

const ModelDetailsPage = () => {
    const { modelId } = useParams();
    const [model, setModel] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchModel = async () => {
            try {
                setLoading(true);
                const modelData = await getModelDetails(modelId);
                setModel(modelData);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchModel();
    }, [modelId]);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}><LoadingSpinner /></Box>;
    if (error) return <ErrorMessage message={error} />;
    if (!model) return <Typography>Model not found.</Typography>;

    return (
        <Container maxWidth="md">
            <Paper elevation={3} sx={{ p: { xs: 2, md: 4 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Typography variant="h4" component="h1" gutterBottom>{model.name}</Typography>
                    <Button
                        variant="outlined"
                        component={RouterLink}
                        to={`/model/${model.id}/edit`}
                        startIcon={<EditIcon />}
                    >
                        Edit
                    </Button>
                </Box>
                <Chip label={model.isPublic ? 'Public' : 'Private'} size="small" sx={{ mb: 2 }}/>

                <Grid container spacing={2} sx={{ mt: 2 }}>
                    <Grid item xs={12}>
                        <Typography variant="h6">Description</Typography>
                        <Typography color="text.secondary">{model.description || 'N/A'}</Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <Typography variant="h6">Provider</Typography>
                        <Typography color="text.secondary">{model.provider}</Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <Typography variant="h6">Model String</Typography>
                        <Typography color="text.secondary" sx={{ wordBreak: 'break-all' }}>{model.modelString}</Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                        <Typography variant="h6">Temperature</Typography>
                        <Typography color="text.secondary">{model.temperature}</Typography>
                    </Grid>
                    <Grid item xs={12}>
                        <Typography variant="h6">System Instruction</Typography>
                        <Paper variant="outlined" sx={{ p: 1.5, my: 1, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', bgcolor: 'action.hover' }}>
                            {model.systemInstruction || 'N/A'}
                        </Paper>
                    </Grid>
                </Grid>
            </Paper>
        </Container>
    );
};

export default ModelDetailsPage;