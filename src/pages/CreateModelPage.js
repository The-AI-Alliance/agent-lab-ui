// src/pages/CreateModelPage.js
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { createModel, getModelDetails, updateModel } from '../services/modelService';
import ModelForm from '../components/models/ModelForm';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import { Container, Typography, Box } from '@mui/material';

const CreateModelPage = ({ isEditMode = false }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { currentUser } = useAuth();
    const { modelId } = useParams();

    const [initialModelData, setInitialModelData] = useState(null);
    const [loading, setLoading] = useState(isEditMode);
    const [error, setError] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isEditMode && modelId && currentUser) {
            const fetchModel = async () => {
                setLoading(true);
                try {
                    const model = await getModelDetails(modelId);
                    if (model.ownerId !== currentUser.uid) {
                        setError("You are not authorized to edit this model.");
                        return;
                    }
                    setInitialModelData(model);
                } catch (err) {
                    setError(`Failed to load model: ${err.message}`);
                } finally {
                    setLoading(false);
                }
            };
            fetchModel();
        } else {
            const preselectedProjectIds = location.state?.preselectedProjectIds || [];
            setInitialModelData({
                projectIds: preselectedProjectIds,
                temperature: 0.7,
                isPublic: false
            });
        }
    }, [isEditMode, modelId, currentUser, location.state]);

    const handleSaveModel = async (modelData) => {
        setIsSubmitting(true);
        setError(null);
        try {
            if (isEditMode) {
                await updateModel(modelId, modelData);
                navigate(`/model/${modelId}`);
            } else {
                const newModelId = await createModel(currentUser.uid, modelData);
                navigate(`/model/${newModelId}`);
            }
        } catch (err) {
            setError(`Failed to save model: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading || !initialModelData) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}><LoadingSpinner /></Box>;
    if (error) return <ErrorMessage message={error} />;

    return (
        <Container maxWidth="md">
            <Typography variant="h4" component="h1" gutterBottom sx={{ mb: 3 }}>
                {isEditMode ? 'Edit Model' : 'Create New Model'}
            </Typography>
            <ModelForm
                onSubmit={handleSaveModel}
                initialData={initialModelData}
                isSaving={isSubmitting}
            />
        </Container>
    );
};

export default CreateModelPage;  