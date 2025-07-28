// src/components/context_stuffing/ImageContextModal.js
import React, { useState, useRef } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const ImageContextModal = ({ open, onClose, onSubmit }) => {
    const [selectedFile, setSelectedFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [error, setError] = useState('');
    const fileInputRef = useRef(null);

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            if (!ALLOWED_MIME_TYPES.includes(file.type)) {
                setError(`Invalid file type. Please upload a JPEG, PNG, or WebP image.`);
                return;
            }
            if (file.size > MAX_FILE_SIZE_BYTES) {
                setError(`File is too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
                return;
            }
            setSelectedFile(file);
            setPreviewUrl(URL.createObjectURL(file));
            setError('');
        }
    };

    const handleSubmit = () => {
        if (!selectedFile) {
            setError('Please select an image file to upload.');
            return;
        }
        onSubmit({ type: 'image', file: selectedFile });
        handleClose();
    };

    const handleClose = () => {
        setSelectedFile(null);
        setPreviewUrl('');
        setError('');
        if (fileInputRef.current) fileInputRef.current.value = "";
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle>Stuff Image Content</DialogTitle>
            <DialogContent>
                <Box component="form" noValidate autoComplete="off" sx={{ pt: 1, textAlign: 'center' }}>
                    <Button
                        variant="outlined"
                        component="label"
                        fullWidth
                        startIcon={<CloudUploadIcon />}
                        sx={{ mb: 2 }}
                    >
                        {selectedFile ? 'Change Image' : 'Select Image'}
                        <input
                            type="file"
                            hidden
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept={ALLOWED_MIME_TYPES.join(',')}
                        />
                    </Button>
                    {previewUrl && (
                        <Box sx={{ my: 2, border: '1px dashed grey', p: 1, display: 'inline-block' }}>
                            <img src={previewUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: '300px' }} />
                        </Box>
                    )}
                    {selectedFile && <Typography variant="body2" color="text.secondary">Selected: {selectedFile.name}</Typography>}
                    {error && <Typography color="error" sx={{ mt: 1 }}>{error}</Typography>}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Cancel</Button>
                <Button onClick={handleSubmit} variant="contained" disabled={!selectedFile}>
                    Upload & Add
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ImageContextModal;