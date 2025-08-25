// src/components/models/ModelSelector.js
import React, { useState, useEffect } from 'react';
import { getModelsForProjects, getMyModels } from '../../services/modelService';
import { useAuth } from '../../contexts/AuthContext';
import {
    FormControl, InputLabel, Select, MenuItem, FormHelperText, CircularProgress, Box
} from '@mui/material';

const ModelSelector = ({ selectedModelId, onSelectionChange, projectIds = [], helperText, required, ...props }) => {
    const { currentUser } = useAuth();
    const [models, setModels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchModels = async () => {
            if (!currentUser) return;
            try {
                setLoading(true);
                let availableModels = [];
                if (projectIds.length > 0) {
                    availableModels = await getModelsForProjects(projectIds);
                } else {
                    // Fallback to user's own models if no project is selected
                    availableModels = await getMyModels(currentUser.uid);
                }
                setModels(availableModels);
                setError('');
            } catch (err) {
                console.error("Error fetching models:", err);
                setError('Could not load models.');
            } finally {
                setLoading(false);
            }
        };

        fetchModels();
    }, [currentUser, projectIds]);

    const handleChange = (event) => {
        onSelectionChange(event.target.value);
    };

    return (
        <FormControl fullWidth required={required} {...props}>
            <InputLabel id="model-select-label">Model</InputLabel>
            <Select
                labelId="model-select-label"
                id="model-select"
                value={selectedModelId}
                label="Model"
                onChange={handleChange}
                disabled={loading}
            >
                {loading ? (
                    <MenuItem value="">
                        <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                            <CircularProgress size={20} />
                        </Box>
                    </MenuItem>
                ) : models.length === 0 ? (
                    <MenuItem value="" disabled>
                        No models available for the selected project(s).
                    </MenuItem>
                ) : (
                    models.map((model) => (
                        <MenuItem key={model.id} value={model.id}>
                            {model.name}
                        </MenuItem>
                    ))
                )}
            </Select>
            <FormHelperText>{error || helperText}</FormHelperText>
        </FormControl>
    );
};

export default ModelSelector;