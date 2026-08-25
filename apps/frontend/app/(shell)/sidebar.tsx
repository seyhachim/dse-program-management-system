"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
import { findMostSpecificActivePath } from "./sidebar-active-route";

function sidebarLabel(label: string, path: string): string {
  return path === "/courses" && label === "Course Management"
    ? "Courses & Specifications"
    : label;
}

/** Sidebar follows the canvas theme (white in light mode, near-black in dark), collapsible to icons. Nav items come from the plugin manifest, grouped into sections. */
export function AppSidebar() {
  const pathname = usePathname();
  const { me, loading } = useMe();
  // Only show nav the caller's roles are allowed to see. While `me` loads we show
  // skeletons rather than the full list, so restricted items never flash in.
  const groups = me ? getNavGroups(me.roles) : [];
  // "footer" is a special group label rendered in the sidebar footer (e.g. Help
  // & Support) instead of the main scrollable nav list.
  const footerRoutes = groups.find((g) => g.label === "footer")?.routes ?? [];
  const mainGroups = groups.filter((g) => g.label !== "footer");
  const activePath = findMostSpecificActivePath(
    pathname,
    groups.flatMap((group) => group.routes.map((route) => route.path)),
  );

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
                    const Icon = route.icon ? iconMap[route.icon] : undefined;
                    const active = activePath === route.path;
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
              const active = activePath === route.path;
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
