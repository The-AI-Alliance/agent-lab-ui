import { createTheme } from '@mui/material/styles';
import { grey, blueGrey } from '@mui/material/colors';

const carbonLikeTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0f62fe', // IBM Carbon blue
    },
    secondary: {
      main: '#393939', // Carbon neutral color
    },
    background: {
      default: '#f4f4f4', // Carbon g10 background
      paper: '#ffffff',
    },
    text: {
      primary: '#161616', // Almost black
      secondary: '#525252', // Neutral text
    },
  },
  typography: {
    fontFamily: '"IBM Plex Sans", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '2.25rem',
      fontWeight: 600,
      color: '#161616',
    },
    h2: {
      fontSize: '1.75rem',
      fontWeight: 600,
    },
    h3: {
      fontSize: '1.5rem',
      fontWeight: 500,
    },
    body1: {
      fontSize: '1rem',
      color: '#161616',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          textTransform: 'none',
          fontWeight: 600,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
          color: '#161616',
          boxShadow: 'none',
          borderBottom: '1px solid #e0e0e0',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 0,
        },
      },
    },
  },
});

export default carbonLikeTheme;
