"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { routeAllowsRole } from "@dse-pms/shared-types";
import { useMe } from "@/lib/auth";
import { useFinalProjectStudentEligibility } from "@/lib/final-project-access";
import { getNavRoutes } from "@/lib/nav";
import { RouteContentLoading } from "./shell-loading";

export function RoleAccessGuard({ children }: { children: React.ReactNode }) {
  const { me, loading } = useMe();
  const pathname = usePathname();
  const router = useRouter();
  const finalProjectAccess = useFinalProjectStudentEligibility(me?.id, me?.roles ?? []);

  const candidates = getNavRoutes().filter(
    (r) => pathname === r.path || pathname.startsWith(`${r.path}/`),
  );
  const longestLength = candidates.length
    ? Math.max(...candidates.map((r) => r.path.length))
    : 0;
  const matched = candidates.filter((r) => r.path.length === longestLength);
  const manifestAllowed =
    !me || matched.length === 0 || matched.some((r) => routeAllowsRole(r, me.roles));
  const parentPortalAllowed =
    !pathname.startsWith("/parent") || Boolean(me?.roles.includes("guardian"));
  const finalProjectStudentRoute = matched.some((route) => route.path === "/final-project/supervisors");
  const finalProjectAllowed =
    !finalProjectStudentRoute || !finalProjectAccess.required || finalProjectAccess.eligible;
  const accessLoading = loading || (finalProjectStudentRoute && finalProjectAccess.loading);
  const allowed = manifestAllowed && parentPortalAllowed && finalProjectAllowed;

  useEffect(() => {
    if (accessLoading || allowed) return;
    if (me?.roles.includes("guardian")) {
      router.replace("/parent");
      return;
    }
    const home = getNavRoutes(me!.roles, {
      finalProjectStudentEligible: finalProjectAccess.eligible,
    })[0];
    router.replace(home ? home.path : "/login");
  }, [accessLoading, allowed, finalProjectAccess.eligible, me, router]);

  if (accessLoading) return <RouteContentLoading />;
  if (!allowed) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          This page is not available for your account. Redirecting to an allowed page…
        </p>
      </main>
    );
  }
  return <>{children}</>;
}
