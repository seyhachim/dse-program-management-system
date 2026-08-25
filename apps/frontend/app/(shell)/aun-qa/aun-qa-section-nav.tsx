"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getNavRoutes } from "@/lib/nav";
import { useMe } from "@/lib/auth";

const items = [
  { label: "Overview", path: "/aun-qa" },
  { label: "SAR Review", path: "/aun-qa/review" },
  { label: "SAR Preview", path: "/aun-qa/sar-preview" },
  { label: "Analysis", path: "/qa-dashboard" },
] as const;

export function AunQaSectionNav() {
  const pathname = usePathname();
  const { me } = useMe();
  const allowedPaths = new Set((me ? getNavRoutes(me.roles) : []).map((route) => route.path));

  return (
    <nav aria-label="AUN-QA workspace" className="mb-5 overflow-x-auto">
      <div className="inline-flex min-w-full gap-1 rounded-xl border border-border bg-muted/40 p-1 sm:min-w-0">
        {items
          .filter((item) => allowedPaths.has(item.path))
          .map((item) => {
            const active =
              pathname === item.path ||
              (item.path !== "/aun-qa" && pathname.startsWith(`${item.path}/`));

            return (
              <Link
                key={item.path}
                href={item.path}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
      </div>
    </nav>
  );
}
