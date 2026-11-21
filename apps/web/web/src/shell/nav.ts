// The one place the navigation is defined. Add a page here (and a <Route> in App.tsx) or it has no menu entry.
//   MAIN      the sidebar's pages, as in the reference dashboards: Home, Create, Publish, Activity
//   SETTINGS  the settings pages, in groups; admin-only groups are hidden from editors
import { Activity, Cable, History, House, Image, Lightbulb, CalendarDays, Palette, Route, SlidersHorizontal, Sparkles, Users, type LucideIcon } from 'lucide-react';

export interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean }
export interface NavSection { title: string; adminOnly?: boolean; items: NavItem[] }

export const MAIN: NavItem[] = [
  { to: '/home', label: 'Home', icon: House },
  { to: '/create', label: 'Create', icon: Lightbulb },
  { to: '/publish', label: 'Publish', icon: CalendarDays },
  { to: '/activity', label: 'Activity', icon: Activity },
];

// Pages under Create share a row of tabs.
export const CREATE_TABS = [
  { to: '/create', label: 'Batches' },
  { to: '/vault', label: 'Vault' },
  { to: '/library', label: 'Library' },
];

export const SETTINGS: NavSection[] = [
  { title: 'You', items: [{ to: '/settings/preferences', label: 'Preferences', icon: SlidersHorizontal }] },
  {
    title: 'Brand',
    adminOnly: true,
    items: [
      { to: '/settings/brand', label: 'Brand and look', icon: Palette },
      { to: '/settings/references', label: 'Design references', icon: Image },
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
