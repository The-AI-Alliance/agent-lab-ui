// src/App.js
import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link as RouterLink, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ConfigProvider, useConfig } from './contexts/ConfigContext';
import { CustomThemeProvider } from './contexts/ThemeContext';
// Helmet import removed

import Navbar from './components/layout/Navbar';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import CreateAgentPage from './pages/CreateAgentPage';
import AgentPage from './pages/AgentPage';
import SettingsPage from './pages/SettingsPage';
import ProtectedRoute from './components/routing/ProtectedRoute';
import AdminPage from './pages/AdminPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import LoadingSpinner from './components/common/LoadingSpinner';
import CookieConsentBanner from './components/common/CookieConsentBanner';
import * as analyticsService from './services/analyticsService';

// MUI Imports for App Layout
import { Box, Container, Typography, Link as MuiLink } from '@mui/material';
import PlatformUnderConstructionPage from "./pages/PlatformUnderConstructionPage";

// Helper function to update meta tags
const updateMetaTagContent = (metaId, content) => {
    const element = document.getElementById(metaId);
    if (element) {
        element.setAttribute('content', content);
    } else {
        console.warn(`Meta tag with id "${metaId}" not found.`);
    }
};


function AppInitializer() {
    const { config, loadingConfig, configError } = useConfig();
    const location = useLocation();

    // Effect for setting document title and meta description
    useEffect(() => {
        if (!loadingConfig && config) {
            document.title = config.appTitle || "AgentLabUI";
            updateMetaTagContent('meta-description', config.appDescription || "Build & Deploy AI Agents");
        } else if (!loadingConfig && !config && !configError) { // Fallback if config is null but no error
            document.title = "AgentLabUI"; // Default title
            updateMetaTagContent('meta-description', "AI Agent Prototyping Platform"); // Default description
        }
        // If configError, title/meta will remain as set in index.html or last successful update
    }, [config, loadingConfig, configError]);


    // Effect for GA setup (runs once config is loaded)
    useEffect(() => {
        if (!loadingConfig && config) {
            if (config.googleAnalyticsId) {
                analyticsService.setupGoogleAnalytics(config.googleAnalyticsId);
                if (!config.features?.gdprCookieConsent) {
                    console.warn("GA: GDPR consent feature is off, but GA ID is present. Automatically granting analytics consent. Ensure compliance.");
                    if (localStorage.getItem('gdpr-consent-analytics') !== 'denied') {
                        analyticsService.grantAnalyticsConsent();
                    }
                }
            }
            if (configError) {
                console.error("App Configuration Error:", configError);
            }
        }
    }, [config, loadingConfig, configError]);

    // Effect for tracking page views on route changes
    useEffect(() => {
        if (!loadingConfig && config && config.googleAnalyticsId) {
            // GA will pick up document.title automatically if not explicitly sent.
            // This ensures the title used by GA is the one most recently set by the effect above or by specific pages.
            analyticsService.logPageView(location.pathname + location.search, document.title);
        }
    }, [location, config, loadingConfig]);

    if (loadingConfig) {
        return <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh"><LoadingSpinner /></Box>;
    }

    if (configError) {
        return (
            <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="100vh" textAlign="center" p={3}>
                <Typography variant="h5" color="error" gutterBottom>Application Configuration Error</Typography>
                <Typography>Could not load application settings. Please try refreshing the page or contact support.</Typography>
                <Typography variant="caption" color="textSecondary" sx={{mt: 1}}>Details: {configError}</Typography>
            </Box>
        );
    }

    return (
        <>
            {/* Meta tags are now updated directly via DOM manipulation */}
            <AppContent />
            {config?.features?.gdprCookieConsent && <CookieConsentBanner />}
        </>
    );
}


function AppContent() {
    return (
        <>
            <Navbar />
            <Container
                component="main"
                maxWidth="lg"
                sx={{
                    mt: { xs: '56px', sm: '64px' },
                    pb: 3,
                    minHeight: 'calc(100vh - (64px + 24px))'
                }}
            >
                <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/unauthorized" element={<UnauthorizedPage />} />
                    <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                    <Route path="/create-agent" element={<ProtectedRoute><CreateAgentPage /></ProtectedRoute>} />
                    <Route path="/agent/:agentId/edit" element={<ProtectedRoute><CreateAgentPage isEditMode={true} /></ProtectedRoute>} />
                    <Route path="/agent/:agentId" element={<ProtectedRoute><AgentPage /></ProtectedRoute>} />
                    <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                    <Route path="/platform-under-construction/:platformId" element={<ProtectedRoute><PlatformUnderConstructionPage /></ProtectedRoute>} />
                    <Route path="/admin" element={<ProtectedRoute requireAdmin={true}><AdminPage /></ProtectedRoute>} />
                    <Route path="*" element={
                        <Box textAlign="center" py={10}>
                            <Typography variant="h3" component="h1" gutterBottom>
                                404 - Page Not Found
                            </Typography>
                            <MuiLink component={RouterLink} to="/" variant="h6">
                                Go Home
                            </MuiLink>
                        </Box>
                    } />
                </Routes>
            </Container>
        </>
    );
}

function App() {
    return (
        <ConfigProvider>
            <CustomThemeProvider>
                <AuthProvider>
                    <Router>
                        <AppInitializer />
                    </Router>
                </AuthProvider>
            </CustomThemeProvider>
        </ConfigProvider>
    );
}
export default App;  