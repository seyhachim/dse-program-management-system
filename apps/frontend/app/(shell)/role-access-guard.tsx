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

  // The manifest route(s) governing the current path (longest matching prefix).
  // A path can be governed by more than one route — e.g. "/courses" has a
  // role-split "My Courses"/"Course Management" pair (issue #104) — so access is
  // allowed if *any* of them permits the caller's role, not just the first one
  // in manifest order.
  const candidates = getNavRoutes().filter(
    (r) => pathname === r.path || pathname.startsWith(`${r.path}/`),
  );
  const longestLength = candidates.length ? Math.max(...candidates.map((r) => r.path.length)) : 0;
  const matched = candidates.filter((r) => r.path.length === longestLength);

  const allowed = !me || matched.length === 0 || matched.some((r) => routeAllowsRole(r, me.roles));

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
