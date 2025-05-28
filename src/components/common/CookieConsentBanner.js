import React, { useState, useEffect } from 'react';
import { Paper, Typography, Button, Box } from '@mui/material';
import * as analyticsService from '../../services/analyticsService';

const CookieConsentBanner = () => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const consentStatus = localStorage.getItem('gdpr-consent-analytics');
        if (!consentStatus) { // Only show if no decision has been made
            setVisible(true);
        }
    }, []);

    const handleAccept = () => {
        analyticsService.grantAnalyticsConsent();
        setVisible(false);
    };

    const handleDecline = () => {
        analyticsService.denyAnalyticsConsent();
        setVisible(false);
    };

    if (!visible) {
        return null;
    }

    return (
        <Paper
            elevation={6}
            sx={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                p: 2,
                zIndex: (theme) => theme.zIndex.modal + 1, // Ensure it's above modals or snackbars
                borderTop: (theme) => `1px solid ${theme.palette.divider}`,
                backgroundColor: 'background.paper',
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                <Typography variant="body2" sx={{ mr: 2, mb: { xs: 1, sm: 0 } }}>
                    This website uses cookies to enhance user experience and analyze traffic. By clicking "Accept All", you consent to our use of cookies for analytics purposes.
                    {/* Example: <Link href="/privacy-policy" target="_blank" rel="noopener noreferrer" sx={{ml:1}}>Learn more</Link> */}
                </Typography>
                <Box sx={{display: 'flex', gap: 1}}>
                    <Button onClick={handleDecline} color="secondary" variant="outlined" size="small">
                        Decline
                    </Button>
                    <Button onClick={handleAccept} variant="contained" color="primary" size="small">
                        Accept All
                    </Button>
                </Box>
            </Box>
        </Paper>
    );
};

export default CookieConsentBanner;  