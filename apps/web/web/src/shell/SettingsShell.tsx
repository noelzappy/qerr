// The settings frame: the same panel as the rest of the app, with a sidebar of settings pages in groups and a way back.
import { ArrowLeft } from 'lucide-react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useSession } from '../session';
import { LoadingBlock } from '@/components/kit';
import { ActivityProvider } from './activity';
import { isWideSettingsPath, SETTINGS } from './nav';
import { AccountMenu, AdminsOnly, Frame, SearchButton } from './Shell';

// `wide` lets a page use the whole content area; the layout editor's two paths are wide without the flag.
export function SettingsShell({ admin = false, wide = false }: { admin?: boolean; wide?: boolean }) {
  const { me, loading } = useSession();
  const location = useLocation();
  if (loading) return <div className="flex min-h-dvh items-center justify-center"><LoadingBlock /></div>;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  const isAdmin = me.role === 'admin';
  const sidebar = (
    <>
      <div className="flex flex-col gap-1">
        <Link to="/home" className="flex min-h-9 items-center gap-2 rounded-md px-2 text-[13.5px] font-medium text-sidebar-foreground/80 outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 max-md:min-h-11">
          <ArrowLeft className="size-4" aria-hidden="true" /> Back to the app
        </Link>
        <div className="px-2 pt-1 text-[17px] font-semibold tracking-tight">Settings</div>
      </div>
      <SearchButton />
      <nav aria-label="Settings" className="flex flex-col gap-5">
        {SETTINGS.filter((s) => !s.adminOnly || isAdmin).map((section) => (
          <div key={section.title} className="flex flex-col gap-0.5">
            <div className="px-2.5 pb-1 text-[12px] font-medium text-muted-foreground">{section.title}</div>
            {section.items.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => cn(
                  'flex min-h-9 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium text-sidebar-foreground/80 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50 max-md:min-h-11',
                  isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="mt-auto"><AccountMenu /></div>
    </>
  );
  return (
    <ActivityProvider>
      <Frame sidebar={sidebar} mobileTitle={<span className="font-semibold">Settings</span>}>
        <div className={cn('mx-auto', wide || isWideSettingsPath(location.pathname) ? 'max-w-none' : 'max-w-4xl')}>{admin && !isAdmin ? <AdminsOnly /> : <Outlet />}</div>
      </Frame>
    </ActivityProvider>
  );
}
