// The one place the navigation is defined. Add a page here (and a <Route> in App.tsx) or it has no menu entry.
//   MAIN      the sidebar's pages: Home, Create, Facts, Pictures, Publish, Activity
//   SETTINGS  the settings pages, in groups; admin-only groups are hidden from editors
import { Activity, BookOpen, Cable, History, House, Image, Images, LayoutTemplate, Lightbulb, CalendarDays, Palette, Route, SlidersHorizontal, Sparkles, Users, type LucideIcon } from 'lucide-react';

export interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean }
export interface NavSection { title: string; adminOnly?: boolean; items: NavItem[] }

export const MAIN: NavItem[] = [
  { to: '/home', label: 'Home', icon: House },
  { to: '/create', label: 'Create', icon: Lightbulb },
  { to: '/vault', label: 'Facts', icon: BookOpen },
  { to: '/library', label: 'Pictures', icon: Images },
  { to: '/publish', label: 'Publish', icon: CalendarDays },
  { to: '/activity', label: 'Activity', icon: Activity },
];

export const SETTINGS: NavSection[] = [
  { title: 'You', items: [{ to: '/settings/preferences', label: 'Preferences', icon: SlidersHorizontal }] },
  {
    title: 'Brand',
    adminOnly: true,
    items: [
      { to: '/settings/brand', label: 'Brand and look', icon: Palette },
      { to: '/settings/references', label: 'Design references', icon: Image },
      { to: '/settings/layouts', label: 'Layouts', icon: LayoutTemplate },
    ],
  },
  {
    title: 'Organisation',
    adminOnly: true,
    items: [
      { to: '/settings/team', label: 'Team', icon: Users },
      { to: '/settings/accounts', label: 'Buffer accounts', icon: Cable },
      { to: '/settings/channels', label: 'Channels', icon: Route },
      { to: '/settings/ai', label: 'AI and search', icon: Sparkles },
    ],
  },
  { title: 'Records', adminOnly: true, items: [{ to: '/settings/audit', label: 'Audit log', icon: History }] },
];

// Settings pages that take the whole content area instead of the normal reading width.
export const WIDE_SETTINGS_PATHS = [/^\/settings\/layouts\/new$/, /^\/settings\/layouts\/[^/]+$/];
export const isWideSettingsPath = (pathname: string) => WIDE_SETTINGS_PATHS.some((r) => r.test(pathname));
