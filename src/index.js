import React from 'react';
import ReactDOM from 'react-dom/client';
// import { HelmetProvider } from 'react-helmet-async'; // Ensure this is removed
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);

reportWebVitals();  