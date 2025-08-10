import { createTheme } from '@mui/material/styles';
import { red } from '@mui/material/colors';

// A base theme to start with
const defaultTheme = createTheme({
    palette: {
        primary: {
            main: '#556cd6', // Example: A shade of blue/purple
        },
        secondary: {
            main: '#19857b', // Example: A shade of green
        },
        error: {
            main: red.A400,
        },
        background: {
            default: '#f4f6f8', // A light grey background
            paper: '#ffffff',   // White for cards, paper elements
        },
        userChatBubble: '#90EE90',
        machineChatBubble: '#D3D3D3'
    },
    typography: {
        fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
        h1: {
            fontSize: '2.2rem',
            fontWeight: 700,
        },
        h2: {
            fontSize: '1.8rem',
            fontWeight: 600,
        },
        h3: {
            fontSize: '1.5rem',
            fontWeight: 600,
        }
        // You can define more typography variants
    },
    components: {
        MuiAppBar: {
            styleOverrides: {
                root: {
                    boxShadow: 'none', // Flatter AppBar
                    borderBottom: '1px solid rgba(0, 0, 0, 0.12)',
                }
            }
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 8, // Slightly more rounded buttons
                    textTransform: 'none', // Keep button text case as is
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    borderRadius: 12, // Rounded cards
                    boxShadow: '0px 4px 20px rgba(0,0,0,0.05)' // Softer shadow
                }
            }
        }
        // Add more global component overrides here
    },
});

export default defaultTheme;  