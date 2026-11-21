// The settings frame: the same panel as the rest of the app, with a sidebar of settings pages in groups and a way back.
import { ArrowLeft } from 'lucide-react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useSession } from '../session';
import { LoadingBlock } from '@/components/kit';
import { ActivityProvider } from './activity';
import { SETTINGS } from './nav';
import { AccountMenu, AdminsOnly, Frame } from './Shell';

export function SettingsShell({ admin = false }: { admin?: boolean }) {
  const { me, loading } = useSession();
  const location = useLocation();
  if (loading) return <div className="flex min-h-dvh items-center justify-center"><LoadingBlock /></div>;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  const isAdmin = me.role === 'admin';
  const sidebar = (
    <>
      <Link to="/home" className="flex min-h-9 items-center gap-2 rounded-md px-2 text-[15px] font-semibold outline-none hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <ArrowLeft className="size-4" aria-hidden="true" /> Settings
      </Link>
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
        <div className="mx-auto max-w-4xl">{admin && !isAdmin ? <AdminsOnly /> : <Outlet />}</div>
      </Frame>
    </ActivityProvider>
  );
}
