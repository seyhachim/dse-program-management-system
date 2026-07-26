import {
  BarChart3,
  Book,
  ClipboardList,
  FileCheck,
  FileText,
  GraduationCap,
  HelpCircle,
  History,
  Layers,
  LayoutDashboard,
  Presentation,
  RefreshCw,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  navForRole,
  navFromManifests,
  navGroupsForRole,
  pluginManifests,
  type NavGroup,
  type PluginRoute,
  type Role,
} from "@dse-pms/shared-types";

/**
 * Sidebar nav is generated automatically from the shared plugin manifest — the
 * same source of truth the backend registers routers against. Adding a plugin
 * to `pluginManifests` makes it appear here with no other change.
 */
export const iconMap: Record<string, LucideIcon> = {
  users: Users,
  book: Book,
  layers: Layers,
  presentation: Presentation,
  dashboard: LayoutDashboard,
  "clipboard-list": ClipboardList,
  "file-check": FileCheck,
  "graduation-cap": GraduationCap,
  "shield-check": ShieldCheck,
  "bar-chart": BarChart3,
  "refresh-cw": RefreshCw,
  "file-text": FileText,
  "user-cog": UserCog,
  settings: Settings,
  history: History,
  "help-circle": HelpCircle,
};

/** All nav routes, or — when a role is given — only those that role may see. */
export function getNavRoutes(role?: Role): PluginRoute[] {
  return role ? navForRole(pluginManifests, role) : navFromManifests(pluginManifests);
}

/** Nav routes for `role`, grouped into sidebar sections (see `NavGroup`). */
export function getNavGroups(role: Role): NavGroup[] {
  return navGroupsForRole(pluginManifests, role);
}
