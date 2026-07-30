"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { routeAllowsRole } from "@dse-pms/shared-types";
import { useMe } from "@/lib/auth";
import { getNavRoutes } from "@/lib/nav";

/**
 * Backs up the role-filtered sidebar for direct-URL access: if a caller opens a
 * page their role isn't allowed to see (e.g. a lecturer typing `/lecturers`),
 * redirect them to the first page they *are* allowed to see. Nav visibility and
 * this guard read the same per-route `roles` from the shared plugin manifest, so
 * they can't disagree. The backend still enforces its own permission strings.
 */
export function RoleAccessGuard({ children }: { children: React.ReactNode }) {
  const { me, loading } = useMe();
  const pathname = usePathname();
  const router = useRouter();

  // The manifest route governing the current path (longest matching prefix).
  const matched = getNavRoutes()
    .filter((r) => pathname === r.path || pathname.startsWith(`${r.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];

  const allowed = !me || !matched || routeAllowsRole(matched, me.roles);

  useEffect(() => {
    if (loading || allowed) return;
    const home = getNavRoutes(me!.roles)[0];
    router.replace(home ? home.path : "/login");
  }, [loading, allowed, me, router]);

  // Hold rendering until the role is known and access confirmed, so a restricted
  // page never flashes before the redirect fires.
  if (loading || !allowed) return null;
  return <>{children}</>;
}
