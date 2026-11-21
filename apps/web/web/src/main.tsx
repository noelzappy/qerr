import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { App } from './App';
import { initTheme } from './lib/theme';
import './index.css';

initTheme();

// A data router (it makes useBlocker available, for the unsaved-changes guard). One catch-all route renders the app, whose
// own <Routes> in App.tsx stay the single place where addresses are listed.
const router = createBrowserRouter([{ path: '*', element: <App /> }]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
