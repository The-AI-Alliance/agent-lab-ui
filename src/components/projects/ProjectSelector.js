// src/components/projects/ProjectSelector.js
import React, { useState, useEffect } from 'react';
import { getProjects } from '../../services/projectService';
import { useAuth } from '../../contexts/AuthContext';
import {
    FormControl, InputLabel, Select, MenuItem, Chip, Box, OutlinedInput, Checkbox, ListItemText,
    FormHelperText, CircularProgress
} from '@mui/material';

const ITEM_HEIGHT = 48;
const ITEM_PADDING_TOP = 8;
const MenuProps = {
    PaperProps: {
        style: {
            maxHeight: ITEM_HEIGHT * 4.5 + ITEM_PADDING_TOP,
            width: 250,
        },
    },
};

const ProjectSelector = ({ selectedProjectIds, onSelectionChange, helperText, required }) => {
    const { currentUser } = useAuth();
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchProjects = async () => {
            if (!currentUser) return;
            try {
                setLoading(true);
                const fetchedProjects = await getProjects();
                setProjects(fetchedProjects);
                setError('');
            } catch (err) {
                console.error("Error fetching projects:", err);
                setError('Could not load projects.');
            } finally {
                setLoading(false);
            }
        };

        fetchProjects();
    }, [currentUser]);

    const handleChange = (event) => {
        const { target: { value } } = event;
        onSelectionChange(typeof value === 'string' ? value.split(',') : value);
    };

    return (
        <FormControl fullWidth required={required}>
            <InputLabel id="project-multiple-chip-label">Projects</InputLabel>
            <Select
                labelId="project-multiple-chip-label"
                id="project-multiple-chip"
                multiple
                value={selectedProjectIds}
                onChange={handleChange}
                input={<OutlinedInput id="select-multiple-chip" label="Projects" />}
                renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {selected.map((value) => {
                            const project = projects.find(p => p.id === value);
                            return <Chip key={value} label={project ? project.name : value} size="small" />;
                        })}
                    </Box>
                )}
                MenuProps={MenuProps}
                disabled={loading}
            >
                {loading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                        <CircularProgress size={24} />
                    </Box>
                )}
                {projects.map((project) => (
                    <MenuItem key={project.id} value={project.id}>
                        <Checkbox checked={selectedProjectIds.indexOf(project.id) > -1} />
                        <ListItemText primary={project.name} />
                    </MenuItem>
                ))}
            </Select>
            <FormHelperText>{error || helperText}</FormHelperText>
        </FormControl>
    );
};

export default ProjectSelector;