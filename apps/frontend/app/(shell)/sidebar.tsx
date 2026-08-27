"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getNavGroups, iconMap } from "@/lib/nav";
import { useMe } from "@/lib/auth";
import {
  Sidebar as SidebarPrimitive,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarTrigger,
} from "@dse-pms/ui";

function sidebarLabel(label: string, path: string): string {
  return path === "/courses" && label === "Course Management"
    ? "Courses & Specifications"
    : label;
}

/** Sidebar follows the canvas theme (white in light mode, near-black in dark), collapsible to icons. Nav items come from the plugin manifest, grouped into sections. */
export function AppSidebar() {
  const pathname = usePathname();
  const { me, loading } = useMe();
  const [openParents, setOpenParents] = useState<Record<string, boolean>>(() => ({
    "/academic-calendar": pathname.startsWith("/academic-calendar/"),
  }));

  useEffect(() => {
    if (!pathname.startsWith("/academic-calendar/")) return;
    setOpenParents((current) => current["/academic-calendar"]
      ? current
      : { ...current, "/academic-calendar": true });
  }, [pathname]);

  // Only show nav the caller's roles are allowed to see. While `me` loads we show
  // skeletons rather than the full list, so restricted items never flash in.
  const groups = me ? getNavGroups(me.roles) : [];
  // "footer" is a special group label rendered in the sidebar footer (e.g. Help
  // & Support) instead of the main scrollable nav list.
  const footerRoutes = groups.find((g) => g.label === "footer")?.routes ?? [];
  const mainGroups = groups.filter((g) => g.label !== "footer");

  return (
    <SidebarPrimitive
      collapsible="icon"
      className="border-r-0 bg-sidebar text-sidebar-foreground"
    >
      <SidebarHeader>
        <div className="flex h-10 items-center justify-between gap-2 px-1">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG mark, no Next Image optimization needed */}
          <img
            src="/dse-logo.svg"
            alt="DSE-PMS"
            className="h-10 w-auto shrink-0 group-data-[collapsible=icon]:hidden"
          />
          {/* Desktop-only: on mobile the sidebar renders inside a hidden Sheet, so
              a trigger inside it can't be the sole way to open it. Topbar carries
              the matching trigger for md:hidden. */}
          <SidebarTrigger className="hidden hover:bg-sidebar-active hover:text-sidebar-foreground md:flex" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {loading ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {Array.from({ length: 3 }).map((_, i) => (
                  <SidebarMenuItem key={i}>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          mainGroups.map((group, i) => (
            <SidebarGroup key={group.label ?? `ungrouped-${i}`}>
              {group.label ? (
                <SidebarGroupLabel className="text-sidebar-muted">
                  {group.label}
                </SidebarGroupLabel>
              ) : null}
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.routes.map((route) => {
                    const parentRoute = group.routes.find(
                      (candidate) => candidate.path !== route.path && route.path.startsWith(`${candidate.path}/`),
                    );
                    if (parentRoute) return null;

                    const childRoutes = group.routes.filter(
                      (candidate) => candidate.path !== route.path && candidate.path.startsWith(`${route.path}/`),
                    );
                    const hasChildren = childRoutes.length > 0;
                    const childIsActive = childRoutes.some(
                      (candidate) => pathname === candidate.path || pathname.startsWith(`${candidate.path}/`),
                    );
                    const active = !childIsActive && (
                      pathname === route.path || pathname.startsWith(`${route.path}/`)
                    );
                    const label = sidebarLabel(route.label, route.path);
                    const Icon = route.icon ? iconMap[route.icon] : undefined;
                    const submenuOpen = childIsActive || Boolean(openParents[route.path]);

                    return (
                      <SidebarMenuItem key={`${route.path}-${route.label}`}>
                        <div className="relative">
                          <SidebarMenuButton
                            isActive={active}
                            tooltip={label}
                            className={hasChildren ? "pr-8" : undefined}
                            render={
                              <Link href={route.path}>
                                {Icon ? <Icon /> : null}
                                <span>{label}</span>
                              </Link>
                            }
                          />
                          {hasChildren ? (
                            <button
                              type="button"
                              aria-label={`${submenuOpen ? "Collapse" : "Expand"} ${label} submenu`}
                              aria-expanded={submenuOpen}
                              onClick={() => setOpenParents((current) => ({
                                ...current,
                                [route.path]: !submenuOpen,
                              }))}
                              className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:hidden"
                            >
                              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${submenuOpen ? "rotate-90" : ""}`} />
                            </button>
                          ) : null}
                        </div>

                        {hasChildren && submenuOpen ? (
                          <ul className="mt-0.5 space-y-px pl-7 group-data-[collapsible=icon]:hidden">
                            {childRoutes.map((child) => {
                              const ChildIcon = child.icon ? iconMap[child.icon] : undefined;
                              const childActive = pathname === child.path || pathname.startsWith(`${child.path}/`);
                              const childLabel = sidebarLabel(child.label, child.path);
                              return (
                                <li key={`${child.path}-${child.label}`}>
                                  <SidebarMenuButton
                                    isActive={childActive}
                                    tooltip={childLabel}
                                    className="h-8 text-xs text-sidebar-muted"
                                    render={
                                      <Link href={child.path}>
                                        {ChildIcon ? <ChildIcon className="h-3.5 w-3.5" /> : null}
                                        <span>{childLabel}</span>
                                      </Link>
                                    }
                                  />
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))
        )}
      </SidebarContent>

      <SidebarFooter>
        {footerRoutes.length > 0 ? (
          <SidebarMenu>
            {footerRoutes.map((route) => {
              const Icon = route.icon ? iconMap[route.icon] : undefined;
              const active =
                pathname === route.path ||
                pathname.startsWith(`${route.path}/`);
              const label = sidebarLabel(route.label, route.path);
              return (
                <SidebarMenuItem key={`${route.path}-${route.label}`}>
                  <SidebarMenuButton
                    isActive={active}
                    tooltip={label}
                    render={
                      <Link href={route.path}>
                        {Icon ? <Icon /> : null}
                        <span>{label}</span>
                      </Link>
                    }
                  />
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        ) : null}
        <p className="px-2 py-1 text-xs text-sidebar-muted group-data-[collapsible=icon]:hidden">
          DSE Program Management System
        </p>
      </SidebarFooter>
    </SidebarPrimitive>
  );
}
