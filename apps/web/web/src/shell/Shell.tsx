// The signed-in frame, laid out like the reference dashboards: a quiet sidebar (the New button, the main pages, the channels,
// setup progress and the account menu) and the page on a rounded panel beside it. On a phone the sidebar slides in from a
// top bar. Settings pages use their own sidebar (SettingsShell).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BookOpen, ChevronsUpDown, ImagePlus, LogOut, Menu, PenLine, Plus, Search, Settings, Sparkles, Upload } from 'lucide-react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NetworkIcon } from '@/components/network-icon';
import { cn } from '@/lib/utils';
import { api } from '../api';
import { useAppInfo } from '../app-info';
import { networkLabel } from '../lib/labels';
import type { ChannelsOverview, HomeOverview } from '../lib/overview';
import { useSession } from '../session';
import { EmptyBlock, LoadingBlock, PageHeader } from '@/components/kit';
import { ActivityMenu, ActivityProvider } from './activity';
import { PaletteProvider, shortcutLabel, usePalette } from './CommandPalette';
import { ErrorBoundary } from './ErrorBoundary';
import { MAIN } from './nav';
import { VeskLogo } from './VeskLogo';

const initials = (name: string, email: string) => (name || email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';

const navClass = ({ isActive }: { isActive: boolean }) => cn(
  'flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-sidebar-foreground/75 outline-none transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50 max-md:h-11 max-md:text-[15px]',
  isActive && 'bg-sidebar-accent/70 text-sidebar-foreground',
);

// What the sidebar shows besides the links: the channels with their upcoming posts and, for admins, the setup steps.
function useSidebarData(isAdmin: boolean) {
  const location = useLocation();
  const [channels, setChannels] = useState<ChannelsOverview | null>(null);
  const [setup, setSetup] = useState<HomeOverview['setup']>([]);
  useEffect(() => {
    let live = true;
    api.get<ChannelsOverview>('/api/overview/channels').then((c) => { if (live) setChannels(c); }).catch(() => undefined);
    if (isAdmin) api.get<HomeOverview>('/api/overview/home').then((h) => { if (live) setSetup(h.setup); }).catch(() => undefined);
    return () => { live = false; };
  }, [isAdmin, location.pathname]);
  return { channels, setup };
}

// The sidebar's Search button; it opens the command palette and shows the shortcut.
export function SearchButton() {
  const palette = usePalette();
  return (
    <Button variant="outline" className="h-8 w-full justify-start gap-2 bg-transparent px-2.5 text-[13px] font-normal text-muted-foreground shadow-none max-md:h-11" onClick={() => palette?.open()}>
      <Search className="size-4" aria-hidden="true" />
      <span className="flex-1 text-left">Search</span>
      <kbd className="rounded border bg-muted px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground max-md:hidden" aria-hidden="true">{shortcutLabel()}</kbd>
    </Button>
  );
}

function NewMenu({ isAdmin }: { isAdmin: boolean }) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="h-9 w-full rounded-full text-[13.5px] font-semibold max-md:h-11"><Plus aria-hidden="true" /> New</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuItem onSelect={() => navigate('/batches/ai-draft')}><Sparkles aria-hidden="true" /> Draft posts with AI</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/batches/new')}><PenLine aria-hidden="true" /> New batch by hand</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/vault/new')}><BookOpen aria-hidden="true" /> Add a fact</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/library?upload=1')}><ImagePlus aria-hidden="true" /> Upload pictures</DropdownMenuItem>
        {isAdmin && <DropdownMenuItem onSelect={() => navigate('/settings/looks/inspiration')}><Upload aria-hidden="true" /> Add a design reference</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Channels({ data, isAdmin }: { data: ChannelsOverview | null; isAdmin: boolean }) {
  const location = useLocation();
  const current = new URLSearchParams(location.search).get('network');
  if (!data) return null;
  const connected = data.channels.filter((c) => c.connected);
  if (connected.length === 0) {
    if (!isAdmin) return null;
    return <Link to="/settings/channels" className="rounded-md px-2.5 py-1 text-[12.5px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">Connect channels</Link>;
  }
  return (
    <ul aria-label="Channels" className="flex flex-wrap items-center gap-1 px-1.5">
      {connected.map((c) => {
        const active = location.pathname === '/publish' && current === c.network;
        const text = `${c.channelName || networkLabel(c.network)}: ${c.upcoming} ${c.upcoming === 1 ? 'post' : 'posts'} coming`;
        return (
          <li key={c.network}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link to={`/publish?network=${c.network}`} aria-label={`${networkLabel(c.network)}, ${text}`} className={cn('flex size-8 items-center justify-center rounded-md outline-none transition-colors hover:bg-sidebar-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 max-md:size-11', active && 'bg-sidebar-accent/70')}>
                  <NetworkIcon network={c.network} className="size-5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent>{text}</TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

function SetupCard({ steps }: { steps: HomeOverview['setup'] }) {
  const done = steps.filter((s) => s.done).length;
  if (!steps.length || done === steps.length) return null;
  const next = steps.find((s) => !s.done);
  return (
    <Link to="/home" aria-label={`Setup ${done} of ${steps.length} done. Next: ${next?.title ?? 'continue setting up'}`} className="block rounded-md px-2.5 py-1.5 outline-none transition-colors hover:bg-sidebar-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50">
      <div className="truncate text-[12px] text-muted-foreground">Setup {done}/{steps.length} · Next: {next?.title ?? 'continue'}</div>
      <div className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-border" aria-hidden="true">
        <div className="h-full rounded-full bg-primary" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
    </Link>
  );
}

export function AccountMenu({ side = 'top' }: { side?: 'top' | 'bottom' }) {
  const { me, signOut } = useSession();
  const { brand } = useAppInfo();
  const navigate = useNavigate();
  if (!me) return null;
  const isAdmin = me.role === 'admin';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" aria-label={`Account menu for ${me.name || me.email}`} className="h-auto min-h-11 w-full justify-start gap-2.5 px-2 py-1.5 hover:bg-sidebar-accent">
          {brand.logo
            ? <img src={brand.logo} alt="" className="size-8 shrink-0 rounded-md bg-white object-contain p-0.5" />
            : <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-[12px] font-semibold text-primary-foreground" aria-hidden="true">{initials(brand.name, '')}</span>}
          <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
            <span className="truncate text-[13px] font-semibold">{brand.name}</span>
            <span className="truncate text-[12px] font-normal text-muted-foreground">{me.name || me.email}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="start" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
          <span className="break-all text-[12.5px] text-muted-foreground">{me.email}</span>
          <span className="font-semibold">{brand.name}</span>
          <span className="text-[12px] text-muted-foreground">{isAdmin ? 'Admin' : 'Editor'}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate(isAdmin ? '/settings/brand' : '/settings/preferences')}><Settings aria-hidden="true" /> Settings</DropdownMenuItem>
        {isAdmin && <DropdownMenuItem onSelect={() => navigate('/settings/channels')}><Plus aria-hidden="true" /> Channels</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => { void signOut().then(() => navigate('/login', { replace: true })); }}><LogOut aria-hidden="true" /> Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarBody({ isAdmin }: { isAdmin: boolean }) {
  const { channels, setup } = useSidebarData(isAdmin);
  return (
    <>
      <NewMenu isAdmin={isAdmin} />
      <SearchButton />
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {MAIN.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={navClass}>
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">{label}</span>
            {to === '/publish' && channels && channels.upcoming > 0 && <span className="text-[12px] tabular-nums text-muted-foreground" aria-label={`${channels.upcoming} posts coming`}>{channels.upcoming}</span>}
          </NavLink>
        ))}
      </nav>
      <Channels data={channels} isAdmin={isAdmin} />
      <div className="mt-auto">
        {isAdmin && <SetupCard steps={setup} />}
      </div>
    </>
  );
}

export function AdminsOnly() {
  return (
    <>
      <PageHeader title="Admins only" />
      <EmptyBlock title="You do not have access to this page">
        This part of Vesk is for admins. If you need something changed here, ask an admin to do it for you.
      </EmptyBlock>
    </>
  );
}

// The page a path belongs to: its first segment, and for settings the second too (each settings page is its own screen).
const pageKey = (pathname: string) => { const [a, b] = pathname.split('/').filter(Boolean); return a === 'settings' ? `settings/${b ?? ''}` : (a ?? ''); };

// After a change of page, keyboard and screen-reader users start at the page's heading. Opening a sheet over the same page
// (/vault to /vault/:id) does not count, and a dialog or sheet that is open keeps its own focus.
function useMoveFocusOnPageChange(pathname: string) {
  const last = useRef(pageKey(pathname));
  useEffect(() => {
    const key = pageKey(pathname);
    if (key === last.current) return;
    last.current = key;
    const t = window.setTimeout(() => {
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return;
      const main = document.getElementById('main');
      const target = main?.querySelector<HTMLElement>('h1') ?? main;
      if (!target) return;
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(t);
  }, [pathname]);
}

// The rounded panel the page sits on, and the phone's top bar.
export function Frame({ sidebar, mobileTitle, children }: { sidebar: ReactNode; mobileTitle: ReactNode; children: ReactNode }) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { setMenuOpen(false); }, [location.pathname, location.search]);
  useMoveFocusOnPageChange(location.pathname);
  return (
    <PaletteProvider>
    <div className="relative min-h-dvh bg-frame md:grid md:h-dvh md:grid-cols-[15.5rem_minmax(0,1fr)] md:overflow-hidden">
      <a className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-foreground focus:px-3.5 focus:py-2.5 focus:text-background" href="#main">Skip to the content</a>
      <aside className="relative hidden h-dvh flex-col gap-3 overflow-y-auto bg-sidebar px-3 pb-3 pt-4 text-sidebar-foreground md:flex">{sidebar}</aside>
      <div className="flex min-w-0 flex-col md:h-dvh md:py-2 md:pr-2">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-frame px-3 md:hidden">
          <Button variant="ghost" size="icon" className="size-11" aria-label="Open the menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            <Menu aria-hidden="true" />
          </Button>
          <div className="min-w-0 flex-1">{mobileTitle}</div>
          <ActivityMenu />
        </header>
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="left" className="w-72 gap-3 overflow-y-auto bg-sidebar p-3 pt-4 sm:max-w-72">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <SheetDescription className="sr-only">Pages of Vesk</SheetDescription>
            {sidebar}
          </SheetContent>
        </Sheet>
        <main id="main" tabIndex={-1} className="relative min-h-0 flex-1 overflow-y-auto bg-background outline-none md:rounded-xl md:border">
          <div className="mx-auto max-w-[1440px] px-4 py-4 md:px-6 md:pb-8 md:pt-4">
            <ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
    </PaletteProvider>
  );
}

export function Shell({ admin = false }: { admin?: boolean }) {
  const { me, loading } = useSession();
  const location = useLocation();
  if (loading) return <div className="flex min-h-dvh items-center justify-center"><LoadingBlock /></div>;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  const isAdmin = me.role === 'admin';
  const sidebar = (
    <>
      <div className="flex items-center justify-between gap-1 px-1.5 max-md:pr-9">
        <Link to="/home" className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" aria-label="Vesk, home"><VeskLogo /></Link>
        <ActivityMenu />
      </div>
      <SidebarBody isAdmin={isAdmin} />
      <AccountMenu />
    </>
  );
  return (
    <ActivityProvider>
      <Frame sidebar={sidebar} mobileTitle={<Link to="/home" aria-label="Vesk, home"><VeskLogo /></Link>}>
        {admin && !isAdmin ? <AdminsOnly /> : <Outlet />}
      </Frame>
    </ActivityProvider>
  );
}
