import {
  BarChart3,
  Bell,
  Book,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  FileCheck,
  FileText,
  GraduationCap,
  HelpCircle,
  History,
  Layers,
  LayoutDashboard,
  Home,
  ChartNoAxesCombined,
  LibraryBig,
  Megaphone,
  Presentation,
  RefreshCw,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  communityManifest,
  curriculumWorkspaceManifest,
  navForRole,
  navFromManifests,
  navGroupsForRole,
  pluginManifests,
  type NavGroup,
  type PluginManifest,
  type PluginRoute,
  type Role,
} from "@dse-pms/shared-types";

/**
 * Sidebar nav is generated from shared feature manifests. Community of Practice
 * and Programme Curriculum are additive manifests while the legacy registry is
 * gradually split into feature-owned manifests.
 *
 * The rubric backend manifest intentionally has no route because lecturers reach
 * rubrics from Course Specification. The authenticated Rubric Bank is an admin /
 * programme-coordinator management surface, so the frontend adds that route to
 * the existing rubric manifest without introducing a second rubric domain.
 */
const rubricBankManifest: PluginManifest = {
  ...(pluginManifests.find((manifest) => manifest.id === "rubrics") ?? {
    id: "rubrics",
    name: "Rubric Library",
    version: "0.1.0",
  }),
  routes: [
    {
      label: "Rubric Bank",
      path: "/rubrics",
      icon: "library",
      roles: ["admin", "program_coordinator"],
      group: "Academic",
    },
  ],
};

const frontendManifests = [
  ...pluginManifests.filter((manifest) => manifest.id !== "rubrics"),
  rubricBankManifest,
  curriculumWorkspaceManifest,
  communityManifest,
];

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
  "check-square": CheckSquare,
  calendar: CalendarDays,
  library: LibraryBig,
  home: Home,
  chart: ChartNoAxesCombined,
  bell: Bell,
  megaphone: Megaphone,
};

/** All nav routes, or — when roles are given — only those the caller's roles may see. */
export function getNavRoutes(roles?: Role[]): PluginRoute[] {
  return roles ? navForRole(frontendManifests, roles) : navFromManifests(frontendManifests);
}

/** Nav routes for `roles` (union across all of them), grouped into sidebar sections. */
export function getNavGroups(roles: Role[]): NavGroup[] {
  return navGroupsForRole(frontendManifests, roles);
}
