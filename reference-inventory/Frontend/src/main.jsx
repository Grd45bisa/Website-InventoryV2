import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.jsx';
import { AppProvider } from './context/AppContext.jsx';
import './index.css';

// Force clear site data/local storage on application update (preserving auth session)
const APP_VERSION = 'v1.0.8';
if (typeof window !== 'undefined') {
  const storedVersion = window.localStorage.getItem('docuflow_app_version');
  if (storedVersion !== APP_VERSION) {
    const keysToKeep = ['docuflow_access_token', 'docuflow_refresh_token', 'docuflow_user'];
    const keptValues = {};
    keysToKeep.forEach((key) => {
      keptValues[key] = window.localStorage.getItem(key);
    });

    window.localStorage.clear();
    window.sessionStorage.clear();

    keysToKeep.forEach((key) => {
      if (keptValues[key] !== null) {
        window.localStorage.setItem(key, keptValues[key]);
      }
    });

    window.localStorage.setItem('docuflow_app_version', APP_VERSION);
    window.location.reload();
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppProvider>
          <App />
        </AppProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
