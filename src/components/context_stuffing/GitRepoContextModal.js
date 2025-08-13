// src/components/context_stuffing/GitRepoContextModal.js
import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Box, Grid, Typography } from '@mui/material';

const GitRepoContextModal = ({ open, onClose, onSubmit }) => {
    const [orgUser, setOrgUser] = useState('');
    const [repoName, setRepoName] = useState('');
    const [gitToken, setGitToken] = useState('');
    const [includeExt, setIncludeExt] = useState('');
    const [excludeExt, setExcludeExt] = useState('');
    const [directory, setDirectory] = useState('');
    const [branch, setBranch] = useState('main');
    const [formError, setFormError] = useState('');

    const handleSubmit = () => {
        if (!orgUser.trim() || !repoName.trim()) {
            setFormError('Organization/User and Repository Name are required.');
            return;
        }
        if (includeExt.trim() && excludeExt.trim()) {
            setFormError('Cannot use both Include and Exclude extensions. Please choose one or none.');
            return;
        }
        setFormError('');
        onSubmit({
            type: 'gitrepo',
            orgUser: orgUser.trim(), // Trim inputs
            repoName: repoName.trim(), // Trim inputs
            gitToken: gitToken.trim() || null,
            // Ensure extensions are dotless and lowercase
            includeExt: includeExt.trim() ? includeExt.split(',').map(e => e.trim().replace(/^\./, '').toLowerCase()) : [],
            excludeExt: excludeExt.trim() ? excludeExt.split(',').map(e => e.trim().replace(/^\./, '').toLowerCase()) : [],
            directory: directory.trim() || '', // Send empty string for root, backend will handle
            branch: branch.trim() || 'main', // Default to main if empty
        });
        handleClose();
    };

    const handleClose = () => {
        setOrgUser('');
        setRepoName('');
        setGitToken('');
        setIncludeExt('');
        setExcludeExt('');
        setDirectory('');
        setBranch('main');
        setFormError('');
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
            <DialogTitle>Stuff Git Repository Content</DialogTitle>
            <DialogContent>
                <Box component="form" noValidate autoComplete="off" sx={{ pt: 1 }}>
                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                autoFocus
                                required
                                margin="dense"
                                id="git-org-user"
                                label="Organization or User"
                                fullWidth
                                variant="outlined"
                                value={orgUser}
                                onChange={(e) => setOrgUser(e.target.value)}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                required
                                margin="dense"
                                id="git-repo-name"
                                label="Repository Name"
                                fullWidth
                                variant="outlined"
                                value={repoName}
                                onChange={(e) => setRepoName(e.target.value)}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                margin="dense"
                                id="git-branch"
                                label="Branch (Optional)"
                                fullWidth
                                variant="outlined"
                                value={branch}
                                onChange={(e) => setBranch(e.target.value)}
                                helperText="Branch to fetch from. Defaults to 'main' if blank."
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                margin="dense"
                                id="git-token"
                                label="GitHub Token (Optional)"
                                type="password"
                                fullWidth
                                variant="outlined"
                                value={gitToken}
                                onChange={(e) => setGitToken(e.target.value)}
                                helperText="Personal Access Token for private repos or increased rate limits. If blank, attempts public access or uses backend configuration."
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                margin="dense"
                                id="git-include-ext"
                                label="Include Extensions (Optional)"
                                fullWidth
                                variant="outlined"
                                value={includeExt}
                                onChange={(e) => setIncludeExt(e.target.value)}
                                helperText="Comma-separated, e.g., .py, .md, .txt. Only files with these extensions will be included."
                                disabled={!!excludeExt.trim()}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                margin="dense"
                                id="git-exclude-ext"
                                label="Exclude Extensions (Optional)"
                                fullWidth
                                variant="outlined"
                                value={excludeExt}
                                onChange={(e) => setExcludeExt(e.target.value)}
                                helperText="Comma-separated, e.g., .lock, .tmp. Files with these extensions will be excluded."
                                disabled={!!includeExt.trim()}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                margin="dense"
                                id="git-directory"
                                label="Directory Path (Optional)"
                                fullWidth
                                variant="outlined"
                                value={directory}
                                onChange={(e) => setDirectory(e.target.value)}
                                helperText="Specific directory to fetch files from (e.g., src/utils). Defaults to root if blank. Fetches recursively."
                            />
                        </Grid>
                        {formError && <Grid item xs={12}><Typography color="error">{formError}</Typography></Grid>}
                    </Grid>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Cancel</Button>
                <Button onClick={handleSubmit} variant="contained">Fetch & Add</Button>
            </DialogActions>
        </Dialog>
    );
};

export default GitRepoContextModal;