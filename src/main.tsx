import { PreferencesProvider, initializeTheme } from './student/preferences';
import './student/preferences.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './api';
import StudentApp from './student/StudentApp';
import './base.css';
import './student.css';
import { IdentityProvider } from './student/Identity';
initializeTheme();
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <PreferencesProvider>
        <IdentityProvider><StudentApp /></IdentityProvider>
      </PreferencesProvider>
    </AuthProvider>
  </React.StrictMode>,
);
if (import.meta.env.PROD && 'serviceWorker' in navigator)
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
