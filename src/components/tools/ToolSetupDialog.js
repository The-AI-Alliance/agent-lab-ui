// src/components/tools/ToolSetupDialog.js
import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    TextField, Box, Typography
} from '@mui/material';

const ToolSetupDialog = ({ open, onClose, tool, onSave, existingConfiguration }) => {
    const [configValues, setConfigValues] = useState({});
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (tool && tool.setup_parameters) {
            const initialValues = {};
            tool.setup_parameters.forEach(param => {
                initialValues[param.name] = existingConfiguration?.[param.name] || param.default_value || '';
            });
            setConfigValues(initialValues);
        } else {
            setConfigValues({});
        }
        setErrors({}); // Reset errors when dialog opens or tool changes
    }, [tool, open, existingConfiguration]);

    const handleChange = (paramName, value) => {
        setConfigValues(prev => ({ ...prev, [paramName]: value }));
        if (errors[paramName]) {
            setErrors(prev => ({ ...prev, [paramName]: null }));
        }
    };

    const validate = () => {
        const newErrors = {};
        let isValid = true;
        if (tool && tool.setup_parameters) {
            tool.setup_parameters.forEach(param => {
                if (param.required && !configValues[param.name]?.trim()) {
                    newErrors[param.name] = `${param.label || param.name} is required.`;
                    isValid = false;
                }
            });
        }
        setErrors(newErrors);
        return isValid;
    };

    const handleSave = () => {
        if (validate()) {
            onSave(configValues); // Pass the collected configuration
            onClose();
        }
    };

    if (!tool || !tool.setup_parameters) {
        return null; // Or a fallback if dialog opened incorrectly
    }

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                Setup for <Typography component="span" fontWeight="bold">{tool.name}</Typography>
            </DialogTitle>
            <DialogContent>
                <Typography variant="body2" color="text.secondary" sx={{mb: 2}}>
                    Please provide the necessary configuration for this tool.
                </Typography>
                <Box component="form" noValidate autoComplete="off">
                    {tool.setup_parameters.map(param => (
                        <Box key={param.name} sx={{ mb: 2 }}>
                            <TextField
                                fullWidth
                                type={param.type === 'secret' ? 'password' : 'text'}
                                label={`${param.label || param.name}${param.required ? ' *' : ''}`}
                                value={configValues[param.name] || ''}
                                onChange={(e) => handleChange(param.name, e.target.value)}
                                error={!!errors[param.name]}
                                helperText={errors[param.name] || param.description}
                                variant="outlined"
                            />
                        </Box>
                    ))}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave} variant="contained" color="primary">
                    Save Configuration
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ToolSetupDialog;  