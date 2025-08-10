import { createTheme } from '@mui/material/styles';

// Client B wants a modern, dark, and vibrant look
const clientBTheme = createTheme({
    palette: {
        mode: 'dark', // Dark mode!
        primary: {
            main: '#90caf9', // Light blue for dark mode
        },
        secondary: {
            main: '#f48fb1', // Pink accent
        },
        background: {
            default: '#121212',
            paper: '#1e1e1e',
        },
        userChatBubble: '#90EE90',
        machineChatBubble: '#D3D3D3'
    },
    typography: {
        fontFamily: '"Montserrat", "Verdana", sans-serif',
        h1: {
            fontSize: '2.5rem',
            fontWeight: 500,
            letterSpacing: '0.05em',
        },
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 20, // Pill-shaped buttons
                    padding: '8px 20px',
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    border: '1px solid #333',
                }
            }
        }
    },
    // Client B specific custom properties
    customBranding: {
        logoUrl: '/logos/clientB_logo.svg', // Example
        featureFlags: {
            showAdvancedAnalytics: true,
        }
    }
});

export default clientBTheme;  