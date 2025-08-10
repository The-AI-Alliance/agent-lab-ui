import { createTheme } from '@mui/material/styles';

// Client A wants a green and professional look
const clientATheme = createTheme({
    palette: {
        primary: {
            main: '#00695c', // Dark Teal
        },
        secondary: {
            main: '#ff8f00', // Amber for accents
        },
        background: {
            default: '#e8f5e9', // Very light green
            paper: '#ffffff',
        },
        userChatBubble: '#90EE90',
        machineChatBubble: '#D3D3D3'
    },
    typography: {
        fontFamily: '"Lato", "Arial", sans-serif', // Different font
        h1: {
            fontSize: '2.4rem',
            fontWeight: 700,
            color: '#004d40', // Darker teal for headings
        },
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 4, // Sharper buttons
                    textTransform: 'uppercase', // Uppercase button text
                },
                containedPrimary: {
                    color: '#ffffff', // White text on primary buttons
                }
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor: '#004d40', // Darker AppBar
                }
            }
        },
    },
    // Client A specific custom properties
    customBranding: {
        logoUrl: '/logos/clientA_logo.png', // Example
        welcomeMessageVariant: 'h5',
    }
});

export default clientATheme;  