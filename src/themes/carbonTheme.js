import { createTheme } from '@mui/material/styles';

// Based on IBM's Carbon Design System (White Theme)
// https://carbondesignsystem.com/guidelines/color/usage/
const carbonTheme = createTheme({
    palette: {
        mode: 'light',
        primary: {
            main: '#0f62fe', // Blue 60
        },
        secondary: {
            main: '#6f6f6f', // Gray 60
        },
        error: {
            main: '#da1e28', // Red 60
        },
        background: {
            default: '#f4f4f4', // Gray 10
            paper: '#ffffff',   // White
        },
        text: {
            primary: '#161616', // Gray 100
            secondary: '#525252', // Gray 80
        },
        userChatBubble: '#90EE90',
        machineChatBubble: '#D3D3D3'
    },
    typography: {
        fontFamily: '"IBM Plex Sans", "Helvetica", "Arial", sans-serif',
        h1: { fontSize: '2.625rem', fontWeight: 300 },
        h2: { fontSize: '2.25rem', fontWeight: 300 },
        h3: { fontSize: '1.75rem', fontWeight: 400 },
        h4: { fontSize: '1.5rem', fontWeight: 400 },
        h5: { fontSize: '1.25rem', fontWeight: 400 },
        h6: { fontSize: '1rem', fontWeight: 600 },
        button: {
            fontWeight: 600,
            letterSpacing: '0.5px',
        }
    },
    shape: {
        borderRadius: 0, // Sharp corners
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 0,
                    textTransform: 'none',
                },
                contained: {
                    boxShadow: 'none',
                    '&:hover': {
                        boxShadow: 'none',
                    }
                }
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    borderRadius: 0,
                    boxShadow: 'none',
                    border: '1px solid #e0e0e0', // Gray 20
                }
            }
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor: '#ffffff',
                    color: '#161616', // Default text color for the AppBar
                    boxShadow: 'none',
                    borderBottom: '1px solid #e0e0e0', // Gray 20
                    // Specifically target buttons inside the AppBar's toolbar
                    // to ensure their text color is black.
                    '& .MuiToolbar-root .MuiButton-root': {
                        color: '#161616',
                    },
                }
            }
        },
        MuiTabs: {
            styleOverrides: {
                indicator: {
                    backgroundColor: '#0f62fe', // Blue 60
                }
            }
        },
        MuiTab: {
            styleOverrides: {
                root: {
                    textTransform: 'none',
                    fontWeight: 600,
                }
            }
        }
    },
    // Custom branding properties
    customBranding: {
        appName: 'AgentLab UI',
        // You would need to add this logo to your /public/logos/ folder
        // logoUrl: '/logos/ibm_logo.svg',
    }
});

export default carbonTheme;