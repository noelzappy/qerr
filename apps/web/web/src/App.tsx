// Routes only. Each page file under pages/ is one screen; the shell supplies the frame and the route guards.
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppInfoProvider } from './app-info';
import { SessionProvider } from './session';
import { Shell } from './shell/Shell';
import { SettingsShell } from './shell/SettingsShell';
import { Home } from './pages/Home';
import { Publish } from './pages/Publish';
import { BrandSettingsPage } from './pages/settings/Brand';
import { ReferencesPage } from './pages/settings/References';
import { LayoutsPage } from './pages/settings/Layouts';
import { PreferencesPage } from './pages/settings/Preferences';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { AcceptInvite } from './pages/AcceptInvite';
import { Activity } from './pages/Activity';
import { AiSettings } from './pages/AiSettings';
import { Audit } from './pages/Audit';
import { BatchReview } from './pages/BatchReview';
import { Batches } from './pages/Batches';
import { BufferAccounts } from './pages/BufferAccounts';
import { Login } from './pages/Login';
import { ResetPassword } from './pages/ResetPassword';
import { Routing } from './pages/Routing';
import { Users } from './pages/Users';
import { Library } from './pages/Library';
import { Vault } from './pages/Vault';
import { ErrorBoundary } from './shell/ErrorBoundary';

export function App() {
  return (
    <ErrorBoundary>
      <AppInfoProvider>
      <SessionProvider>
        <TooltipProvider delayDuration={200}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route path="/accept-invite/:token" element={<AcceptInvite />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />
            <Route element={<Shell />}>
              <Route path="/home" element={<Home />} />
              <Route path="/create" element={<Batches />} />
              <Route path="/publish" element={<Publish />} />
              <Route path="/batches" element={<Navigate to="/create" replace />} />
              <Route path="/batches/new" element={<Batches />} />
              <Route path="/batches/ai-draft" element={<Batches />} />
              <Route path="/batches/:id" element={<BatchReview />} />
              <Route path="/batches/:id/schedule" element={<BatchReview />} />
              <Route path="/vault" element={<Vault />} />
              <Route path="/vault/:id" element={<Vault />} />
              <Route path="/library" element={<Library />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/activity/:id" element={<Activity />} />
            </Route>
            <Route element={<SettingsShell />}>
              <Route path="/settings/preferences" element={<PreferencesPage />} />
            </Route>
            <Route element={<SettingsShell admin />}>
              <Route path="/settings/brand" element={<BrandSettingsPage />} />
              <Route path="/settings/references" element={<ReferencesPage />} />
              <Route path="/settings/layouts" element={<LayoutsPage />} />
              <Route path="/settings/team" element={<Users />} />
              <Route path="/settings/accounts" element={<BufferAccounts />} />
              <Route path="/settings/channels" element={<Routing />} />
              <Route path="/settings/ai" element={<AiSettings />} />
              <Route path="/settings/audit" element={<Audit />} />
            </Route>
            <Route path="/settings" element={<Navigate to="/settings/preferences" replace />} />
            {/* The old addresses of the admin pages. */}
            <Route path="/admin/users" element={<Navigate to="/settings/team" replace />} />
            <Route path="/admin/accounts" element={<Navigate to="/settings/accounts" replace />} />
            <Route path="/admin/routing" element={<Navigate to="/settings/channels" replace />} />
            <Route path="/admin/ai" element={<Navigate to="/settings/ai" replace />} />
            <Route path="/admin/audit" element={<Navigate to="/settings/audit" replace />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </TooltipProvider>
        <Toaster position="bottom-right" closeButton />
      </SessionProvider>
      </AppInfoProvider>
    </ErrorBoundary>
  );
}
