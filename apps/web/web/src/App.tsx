// Routes only. Each page file under pages/ is one screen; the shell supplies the frame and the route guards.
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppInfoProvider } from './app-info';
import { SessionProvider } from './session';
import { Shell } from './shell/Shell';
import { SettingsShell } from './shell/SettingsShell';
import { Home } from './pages/Home';
import { Publish } from './pages/Publish';
import { BrandSettingsPage } from './pages/settings/Brand';
import { DesignRoute, LookRoute } from './pages/settings/looks/LookRoutes';
import { LooksPage } from './pages/settings/looks/LooksPage';
import { LayoutsPage } from './pages/settings/Layouts';
import { LayoutEditorRoute } from './pages/settings/layouts/EditorRoute';
import { PreferencesPage } from './pages/settings/Preferences';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { AcceptInvite } from './pages/AcceptInvite';
import { Activity } from './pages/Activity';
import { AiSettings } from './pages/AiSettings';
import { Audit } from './pages/Audit';
import { BatchReview } from './pages/BatchReview';
import { Batches } from './pages/Batches';
import { PostPage } from './pages/batches/PostPage';
import { ChannelsPage } from './pages/Channels';
import { Login } from './pages/Login';
import { ResetPassword } from './pages/ResetPassword';
import { Users } from './pages/Users';
import { Library } from './pages/Library';
import { LibraryItemPage } from './pages/library/LibraryItemPage';
import { UploadPage } from './pages/library/UploadPage';
import { Vault } from './pages/Vault';
import { VaultItemPage } from './pages/vault/VaultItemPage';
import { ErrorBoundary } from './shell/ErrorBoundary';
import { UnsavedGuardHost } from '@/hooks/use-unsaved-guard';

export function App() {
  return (
    <ErrorBoundary>
      <AppInfoProvider>
      <SessionProvider>
        <TooltipProvider delayDuration={200}>
          <UnsavedGuardHost />
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
              <Route path="/batches/:id/posts/new" element={<PostPage />} />
              <Route path="/batches/:id/posts/:postId" element={<PostPage />} />
              <Route path="/vault" element={<Vault />} />
              <Route path="/vault/:id" element={<VaultItemPage />} />
              <Route path="/library" element={<Library />} />
              <Route path="/library/upload" element={<UploadPage />} />
              <Route path="/library/:id" element={<LibraryItemPage />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/activity/:id" element={<Activity />} />
            </Route>
            <Route element={<SettingsShell />}>
              <Route path="/settings/preferences" element={<PreferencesPage />} />
            </Route>
            <Route element={<SettingsShell admin />}>
              <Route path="/settings/brand/:section?" element={<BrandSettingsPage />} />
              <Route path="/settings/looks" element={<LooksPage />} />
              <Route path="/settings/looks/inspiration" element={<LooksPage tab="inspiration" />} />
              <Route path="/settings/looks/series" element={<LooksPage tab="series" />} />
              <Route path="/settings/looks/:slug" element={<LookRoute />} />
              <Route path="/settings/looks/:slug/designs/:id" element={<DesignRoute />} />
              <Route path="/settings/layouts" element={<LayoutsPage />} />
              <Route path="/settings/layouts/new" element={<LayoutEditorRoute mode="new" />} />
              <Route path="/settings/layouts/:id" element={<LayoutEditorRoute mode="edit" />} />
              <Route path="/settings/team" element={<Users />} />
              <Route path="/settings/channels" element={<ChannelsPage />} />
              <Route path="/settings/ai" element={<AiSettings />} />
              <Route path="/settings/audit" element={<Audit />} />
            </Route>
            {/* Design references moved into Looks (Inspiration); Buffer accounts into Channels. */}
            <Route path="/settings/references" element={<Navigate to="/settings/looks/inspiration" replace />} />
            <Route path="/settings/accounts" element={<Navigate to="/settings/channels#accounts" replace />} />
            <Route path="/settings" element={<Navigate to="/settings/preferences" replace />} />
            {/* The old addresses of the admin pages. */}
            <Route path="/admin/users" element={<Navigate to="/settings/team" replace />} />
            <Route path="/admin/accounts" element={<Navigate to="/settings/channels#accounts" replace />} />
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
