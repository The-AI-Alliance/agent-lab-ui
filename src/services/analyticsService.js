// src/services/analyticsService.js

let gaIdInternal = null;
let consentGrantedForAnalyticsInternal = false;
let gaScriptLoadedInternal = false;
let configCallMade = false;

export const setupGoogleAnalytics = (trackingId) => {
    if (!trackingId) {
        console.warn("Google Analytics ID not provided. GA setup skipped.");
        return;
    }
    gaIdInternal = trackingId;
    console.log("GA: setupGoogleAnalytics called with ID:", trackingId);

    const storedConsent = localStorage.getItem('gdpr-consent-analytics');
    if (storedConsent === 'granted') {
        console.log("GA: Consent previously granted from localStorage.");
        window.gtag('consent', 'update', {
            'analytics_storage': 'granted'
        });
        consentGrantedForAnalyticsInternal = true;
        loadGaScriptAndConfigIfNeeded();
    } else if (storedConsent === 'denied') {
        console.log("GA: Consent previously denied from localStorage.");
        consentGrantedForAnalyticsInternal = false;
        window.gtag('consent', 'update', {
            'analytics_storage': 'denied'
        });
    } else {
        console.log("GA: No prior consent found in localStorage. Waiting for user interaction or programmatic grant.");
    }
};

export const grantAnalyticsConsent = () => {
    if (!gaIdInternal) {
        console.warn("GA ID not set up. Cannot process consent grant.");
        return;
    }
    console.log("GA: Analytics consent GRANTED.");
    localStorage.setItem('gdpr-consent-analytics', 'granted');
    window.gtag('consent', 'update', {
        'analytics_storage': 'granted'
    });
    consentGrantedForAnalyticsInternal = true;
    loadGaScriptAndConfigIfNeeded();
};

export const denyAnalyticsConsent = () => {
    console.log("GA: Analytics consent DENIED.");
    localStorage.setItem('gdpr-consent-analytics', 'denied');
    window.gtag('consent', 'update', {
        'analytics_storage': 'denied'
    });
    consentGrantedForAnalyticsInternal = false;
};

const loadGaScriptAndConfigIfNeeded = () => {
    if (!gaIdInternal || !consentGrantedForAnalyticsInternal) {
        return;
    }

    if (!gaScriptLoadedInternal) {
        if (document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${gaIdInternal}"]`)) {
            gaScriptLoadedInternal = true;
            console.log('GA: Script tag already present in DOM. Proceeding to config.');
            callGtagConfig();
        } else {
            const script = document.createElement('script');
            script.src = `https://www.googletagmanager.com/gtag/js?id=${gaIdInternal}`;
            script.async = true;
            script.onload = () => {
                console.log('GA: Script loaded successfully.');
                callGtagConfig();
            };
            script.onerror = () => {
                console.error('GA: Script failed to load.');
            };
            document.head.appendChild(script);
            gaScriptLoadedInternal = true;
            console.log('GA: Script tag injected.');
        }
    } else {
        callGtagConfig();
    }
};

const callGtagConfig = () => {
    if (gaIdInternal && consentGrantedForAnalyticsInternal && !configCallMade) {
        console.log(`GA: Calling gtag('config', '${gaIdInternal}')`);
        window.gtag('config', gaIdInternal);
        configCallMade = true;
        // Initial page view after config is handled by AppInitializer's route change effect
    }
}

export const logPageView = (path, title) => {
    if (!gaIdInternal || !consentGrantedForAnalyticsInternal || !gaScriptLoadedInternal || !configCallMade) {
        return;
    }
    console.log(`GA: Logging page_view for ${path} with title "${title}"`);
    window.gtag('event', 'page_view', {
        page_path: path,
        page_title: title, // Use the title passed from AppInitializer
    });
};

export const logEvent = (category, action, label, value) => {
    if (!gaIdInternal || !consentGrantedForAnalyticsInternal || !gaScriptLoadedInternal || !configCallMade) {
        return;
    }
    console.log(`GA: Logging event: Category=${category}, Action=${action}, Label=${label}`);
    window.gtag('event', action, {
        event_category: category,
        event_label: label,
        value: value,
    });
};  