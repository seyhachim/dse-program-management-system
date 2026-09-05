"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { cn, useSidebar } from "@dse-pms/ui";
import { useMe } from "@/lib/auth";
import { getNavRoutes, iconMap } from "@/lib/nav";
import {
  deriveMobileNavItems,
  MOBILE_APP_SHELL_LAYOUT,
  MOBILE_MORE_NAV_ACTION,
  resolveActiveMobileNavPath,
} from "./mobile-app-navigation";

/**
 * Phone-only primary navigation. It intentionally exposes only a small set of
 * role-relevant destinations; the existing sidebar remains the complete menu
 * and is opened by the More action.
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const { me, loading } = useMe();
  const { toggleSidebar } = useSidebar();

  if (loading || !me) return null;

  const items = deriveMobileNavItems(me.roles, getNavRoutes(me.roles));
  const activePath = resolveActiveMobileNavPath(pathname, items);
  const moreIsActive = activePath === null;

  return (
    <nav
      aria-label="Primary mobile navigation"
      className={MOBILE_APP_SHELL_LAYOUT.bottomNav}
    >
      <div className={MOBILE_APP_SHELL_LAYOUT.bottomNavInner}>
        {items.map((item) => {
          const Icon = item.icon ? iconMap[item.icon] : undefined;
          const active = item.path === activePath;

          return (
            <Link
              key={item.path}
              href={item.path}
              aria-current={active ? "page" : undefined}
              className={cn(
                MOBILE_APP_SHELL_LAYOUT.bottomNavItem,
                active && MOBILE_APP_SHELL_LAYOUT.bottomNavItemActive,
              )}
            >
              {Icon ? (
                <Icon
                  aria-hidden="true"
                  className={MOBILE_APP_SHELL_LAYOUT.bottomNavIcon}
                />
              ) : null}
              <span className={MOBILE_APP_SHELL_LAYOUT.bottomNavLabel}>
                {item.label}
              </span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Open more navigation"
          className={cn(
            MOBILE_APP_SHELL_LAYOUT.bottomNavItem,
            moreIsActive && MOBILE_APP_SHELL_LAYOUT.bottomNavItemActive,
          )}
        >
          <Menu
            aria-hidden="true"
            className={MOBILE_APP_SHELL_LAYOUT.bottomNavIcon}
          />
          <span className={MOBILE_APP_SHELL_LAYOUT.bottomNavLabel}>
            {MOBILE_MORE_NAV_ACTION.label}
          </span>
        </button>
      </div>
    </nav>
  );
}
