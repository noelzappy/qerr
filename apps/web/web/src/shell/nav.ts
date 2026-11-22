// The one place the navigation is defined. Add a page here (and a <Route> in App.tsx) or it has no menu entry.
//   MAIN      the sidebar's pages: Home, Create, Facts, Pictures, Publish, Activity
//   SETTINGS  the settings pages, in groups; admin-only groups are hidden from editors
import { Activity, BookOpen, History, House, Images, LayoutTemplate, Lightbulb, CalendarDays, Palette, Route, SlidersHorizontal, Sparkles, SwatchBook, Users, type LucideIcon } from 'lucide-react';

// `onlyWithoutLook`: shown only while the brand uses classic layouts (no look is active).
export interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean; onlyWithoutLook?: boolean }
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
      { to: '/settings/looks', label: 'Looks', icon: SwatchBook },
      { to: '/settings/layouts', label: 'Classic layouts', icon: LayoutTemplate, onlyWithoutLook: true },
    ],
  },
  {
    title: 'Organisation',
    adminOnly: true,
    items: [
      { to: '/settings/team', label: 'Team', icon: Users },
      { to: '/settings/channels', label: 'Channels', icon: Route },
      { to: '/settings/ai', label: 'AI and search', icon: Sparkles },
    ],
  },
  { title: 'Records', adminOnly: true, items: [{ to: '/settings/audit', label: 'Audit log', icon: History }] },
];

// The settings groups a person sees: admin-only groups only for admins, and Classic layouts only while no look is active (while
// that is not yet known, `lookActive` is undefined and the entry is shown).
export function visibleSettings(isAdmin: boolean, lookActive: boolean | undefined): NavSection[] {
  return SETTINGS.filter((s) => !s.adminOnly || isAdmin).map((s) => ({ ...s, items: s.items.filter((i) => !(i.onlyWithoutLook && lookActive === true)) }));
}

// Settings pages that take the whole content area instead of the normal reading width.
export const WIDE_SETTINGS_PATHS = [/^\/settings\/layouts\/new$/, /^\/settings\/layouts\/[^/]+$/, /^\/settings\/looks(\/.*)?$/];
export const isWideSettingsPath = (pathname: string) => WIDE_SETTINGS_PATHS.some((r) => r.test(pathname));
