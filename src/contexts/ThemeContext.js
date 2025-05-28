import React, { createContext, useState, useMemo, useContext, useEffect } from 'react';
import { ThemeProvider as MuiThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import defaultTheme from '../themes/defaultTheme';
import clientATheme from '../themes/clientATheme';
import clientBTheme from '../themes/clientBTheme';
import carbonUI from '../themes/carbonUI';

const ThemeContext = createContext({
    toggleThemeMode: () => {}, // if you want light/dark toggle within a theme
    selectTheme: () => {},
    currentThemeKey: 'default',
});

export const availableThemes = {
    default: defaultTheme,
    clientA: clientATheme,
    clientB: clientBTheme,
    carbonUI: carbonUI,
};

export const getThemeByHostname = () => {
    if (typeof window === 'undefined') return 'default'; // For SSR or build environments
    const hostname = window.location.hostname;
    // For development, you can use localhost:3000?theme=clientA
    const urlParams = new URLSearchParams(window.location.search);
    const themeParam = urlParams.get('theme');

    if (themeParam && availableThemes[themeParam]) {
        return themeParam;
    }

    if (hostname.startsWith('clienta.')) return 'clientA'; // e.g. clienta.yourdomain.com
    if (hostname.startsWith('clientb.')) return 'clientB'; // e.g. clientb.yourdomain.com
    // Add more client-specific hostnames here
    // e.g., if (hostname === 'app.clienta.com') return 'clientA';

    // Fallback or default logic
    const storedTheme = localStorage.getItem('selectedThemeKey');
    if (storedTheme && availableThemes[storedTheme]) {
        return storedTheme;
    }

    return 'default';
};

export const CustomThemeProvider = ({ children }) => {
    const [themeKey, setThemeKey] = useState(getThemeByHostname());

    useEffect(() => {
        localStorage.setItem('selectedThemeKey', themeKey);
    }, [themeKey]);

    const selectTheme = (key) => {
        if (availableThemes[key]) {
            setThemeKey(key);
        } else {
            console.warn(`Theme ${key} not found. Falling back to default.`);
            setThemeKey('default');
        }
    };

    const activeTheme = useMemo(() => {
        return createTheme(availableThemes[themeKey] || defaultTheme);
    }, [themeKey]);

    // Example: if a theme supports light/dark mode itself
    // const toggleThemeMode = () => {
    //   setThemeKey(prev => {
    //     const currentIsDark = availableThemes[prev]?.palette?.mode === 'dark';
    //     // This logic would need to be more sophisticated if themes have different base modes
    //     // For simplicity, this example doesn't implement intra-theme mode toggling
    //     return prev;
    //   });
    // };

    return (
        <ThemeContext.Provider value={{ selectTheme, currentThemeKey: themeKey }}>
            <MuiThemeProvider theme={activeTheme}>
                <CssBaseline /> {/* Normalizes styles and applies background from theme */}
                {children}
            </MuiThemeProvider>
        </ThemeContext.Provider>
    );
};

export const useThemeSwitcher = () => useContext(ThemeContext);  