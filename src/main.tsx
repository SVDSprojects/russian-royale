import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './api';
import StudentApp from './student/StudentApp';
import './base.css';
import './student.css';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <StudentApp />
    </AuthProvider>
  </React.StrictMode>,
);
if (import.meta.env.PROD && 'serviceWorker' in navigator)
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
