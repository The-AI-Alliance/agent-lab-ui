import React, { createContext, useState, useEffect, useContext } from 'react';

const ConfigContext = createContext({
    config: null,
    loadingConfig: true,
    configError: null,
});

export const ConfigProvider = ({ children }) => {
    const [config, setConfig] = useState(null);
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [configError, setConfigError] = useState(null);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                // Ensure the path is correct for accessing files in the public folder
                const response = await fetch(`${process.env.PUBLIC_URL}/appConfig.json`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch appConfig.json: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();
                setConfig(data);
            } catch (error) {
                console.error("Error loading application configuration:", error);
                setConfigError(error.message);
            } finally {
                setLoadingConfig(false);
            }
        };

        fetchConfig();
    }, []);

    return (
        <ConfigContext.Provider value={{ config, loadingConfig, configError }}>
            {children}
        </ConfigContext.Provider>
    );
};

export const useConfig = () => useContext(ConfigContext);