import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './api';
import AdminApp from './admin/AdminApp';
import './base.css';
import './admin.css';
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <AdminApp />
    </AuthProvider>
  </React.StrictMode>,
);
