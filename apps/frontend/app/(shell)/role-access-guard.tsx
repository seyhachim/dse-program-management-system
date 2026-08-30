"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { routeAllowsRole } from "@dse-pms/shared-types";
import { useMe } from "@/lib/auth";
import { getNavRoutes } from "@/lib/nav";
import { RouteContentLoading } from "./shell-loading";

export function RoleAccessGuard({ children }: { children: React.ReactNode }) {
  const { me, loading } = useMe();
  const pathname = usePathname();
  const router = useRouter();

  const candidates = getNavRoutes().filter(
    (r) => pathname === r.path || pathname.startsWith(`${r.path}/`),
  );
  const longestLength = candidates.length
    ? Math.max(...candidates.map((r) => r.path.length))
    : 0;
  const matched = candidates.filter((r) => r.path.length === longestLength);
  const allowed =
    !me || matched.length === 0 || matched.some((r) => routeAllowsRole(r, me.roles));

  useEffect(() => {
    if (loading || allowed) return;
    const home = getNavRoutes(me!.roles)[0];
    router.replace(home ? home.path : "/login");
  }, [loading, allowed, me, router]);

  if (loading) return <RouteContentLoading />;
  if (!allowed) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          This page is not available for your role. Redirecting to an allowed page…
        </p>
      </main>
    );
  }
  return <>{children}</>;
}
