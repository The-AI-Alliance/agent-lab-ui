// src/App.js
import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link as RouterLink, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ConfigProvider, useConfig } from './contexts/ConfigContext';
import { CustomThemeProvider } from './contexts/ThemeContext';

import Navbar from './components/layout/Navbar';
import HomePage from './pages/HomePage';
import AgentsPage from './pages/AgentsPage';
import CreateAgentPage from './pages/CreateAgentPage';
import AgentDetailsPage from './pages/AgentDetailsPage';
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
import AboutPage from "./pages/AboutPage";

import ProjectsPage from './pages/ProjectsPage';
import CreateProjectPage from './pages/CreateProjectPage';
import ProjectDetailsPage from './pages/ProjectDetailsPage';
import ModelsPage from './pages/ModelsPage';
import CreateModelPage from './pages/CreateModelPage';
import ModelDetailsPage from './pages/ModelDetailsPage';
import ChatPage from './pages/ChatPage';
import ToolsPage from './pages/ToolsPage';
import ImportA2AAgentPage from './pages/ImportA2AAgentPage';

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
                maxWidth={false}           // Disable maxWidth for full width
                disableGutters={true}      // Remove default padding
                sx={{
                    mt: { xs: '56px', sm: '64px' },
                    pb: 3,
                    minHeight: 'calc(100vh - (64px + 24px))',
                    px: { xs: 2, sm: 3, md: 6, lg: 10, xl: 12 }, // Responsive horizontal padding
                    // Optionally set a maxWidth on inner container for comfortable reading width
                }}
            >
                <Box
                    sx={{
                        width: '100%',
                        maxWidth: { xs: '100%', sm: '98%', md: '95%', lg: '90%', xl: '85%' },
                        mx: 'auto',
                        // You can add more styles here if needed
                    }}
                >
                    <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/unauthorized" element={<UnauthorizedPage />} />
                    <Route path="/about" element={<AboutPage />} />

                    {/* New Core Routes */}
                    <Route path="/projects" element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
                    <Route path="/create-project" element={<ProtectedRoute><CreateProjectPage /></ProtectedRoute>} />
                    <Route path="/project/:projectId" element={<ProtectedRoute><ProjectDetailsPage /></ProtectedRoute>} />

                    <Route path="/models" element={<ProtectedRoute><ModelsPage /></ProtectedRoute>} />
                    <Route path="/create-model" element={<ProtectedRoute><CreateModelPage /></ProtectedRoute>} />
                    <Route path="/model/:modelId" element={<ProtectedRoute><ModelDetailsPage /></ProtectedRoute>} />
                    <Route path="/model/:modelId/edit" element={<ProtectedRoute><CreateModelPage isEditMode={true} /></ProtectedRoute>} />

                    <Route path="/tools" element={<ProtectedRoute><ToolsPage /></ProtectedRoute>} />

                    <Route path="/agents" element={<ProtectedRoute><AgentsPage /></ProtectedRoute>} />
                    <Route path="/create-agent" element={<ProtectedRoute><CreateAgentPage /></ProtectedRoute>} />
                    <Route path="/agent/:agentId" element={<ProtectedRoute><AgentDetailsPage /></ProtectedRoute>} />
                    <Route path="/agent/:agentId/edit" element={<ProtectedRoute><CreateAgentPage isEditMode={true} /></ProtectedRoute>} />

                    <Route path="/import-a2a-agent" element={<ProtectedRoute><ImportA2AAgentPage /></ProtectedRoute>} />
                    <Route path="/agent/:agentId/edit-a2a" element={<ProtectedRoute><ImportA2AAgentPage isEditMode={true} /></ProtectedRoute>} />

                    <Route path="/chat/:chatId" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />

                    {/* Legacy/Utility Routes */}
                    <Route path="/dashboard" element={<ProtectedRoute><AgentsPage /></ProtectedRoute>} /> {/* Redirect old dashboard to agents page */}
                    <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                    <Route path="/admin" element={<ProtectedRoute requireAdmin={true}><AdminPage /></ProtectedRoute>} />
                    <Route path="/platform-under-construction/:platformId" element={<ProtectedRoute><PlatformUnderConstructionPage /></ProtectedRoute>} />

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
                </Box>
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