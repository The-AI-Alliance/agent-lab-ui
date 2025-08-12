import React, { createContext, useState, useMemo, useContext, useEffect } from 'react';
import { ThemeProvider as MuiThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import defaultTheme from '../themes/defaultTheme';
import clientATheme from '../themes/clientATheme';
import clientBTheme from '../themes/clientBTheme';
import carbonTheme from '../themes/carbonTheme';
import { useConfig } from './ConfigContext';

const ThemeContext = createContext({
    toggleThemeMode: () => {}, // if you want light/dark toggle within a theme
    selectTheme: () => {},
    currentThemeKey: 'default',
    isThemeFixedByConfig: false, // New flag
});

export const availableThemes = {
    default: defaultTheme,
    clientA: clientATheme,
    clientB: clientBTheme,
    carbon: carbonTheme,
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
    const { config } = useConfig();

    // Determine if theme is fixed by config
    const configThemeKey = config?.theme;
    const isConfigThemeValid = configThemeKey && availableThemes.hasOwnProperty(configThemeKey);

    // If config theme is valid, use it exclusively, else fallback to previous logic
    const initialThemeKey = isConfigThemeValid ? configThemeKey : getThemeByHostname();

    const [themeKey, setThemeKey] = useState(initialThemeKey);
    // We want to keep themeKey in sync if config.theme changes (and is valid)
    useEffect(() => {
        if (isConfigThemeValid) {
            setThemeKey(configThemeKey);
        }
    }, [configThemeKey, isConfigThemeValid]);

    useEffect(() => {
        // Only persist theme if not fixed by config
        if (!isConfigThemeValid) {
            localStorage.setItem('selectedThemeKey', themeKey);
        }
    }, [themeKey, isConfigThemeValid]);

    const selectTheme = (key) => {
        if (isConfigThemeValid) {
            // Ignore attempts to change theme if fixed by config
            console.warn("Theme is fixed by appConfig.json and cannot be changed.");
            return;
        }
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

    return (
        <ThemeContext.Provider value={{ selectTheme, currentThemeKey: themeKey, isThemeFixedByConfig: isConfigThemeValid }}>
            <MuiThemeProvider theme={activeTheme}>
                <CssBaseline /> {/* Normalizes styles and applies background from theme */}
                {children}
            </MuiThemeProvider>
        </ThemeContext.Provider>
    );
};

export const useThemeSwitcher = () => useContext(ThemeContext);