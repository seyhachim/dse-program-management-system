"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LogOut, Moon, Settings, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@dse-pms/ui";
import { useMe } from "@/lib/auth";
import { clearProtectedQueryCache } from "@/lib/query-client";
import { AUTH_MODE, getSupabase } from "@/lib/supabase";
import { MOBILE_SHELL_LAYOUT } from "./mobile-shell-layout";

/** First letter of each of the first two words in `name` (e.g. "Grace Hopper" → "GH"). */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/);
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

/** Comma-joined role titles (e.g. "Admin, Lecturer") — a caller can hold more than one role (issue #77). */
function rolesOf(roles: string[]): string {
  return roles.join(", ");
}

/** Profile pic, identity, role title(s), and account menu. Identity collapses to the avatar on phones. */
export function TopbarUser() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { me } = useMe();
  const { setTheme, resolvedTheme } = useTheme();
  // Avoid a hydration mismatch: the resolved theme is only known client-side.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const signOut = async () => {
    // Remove protected completed reads before another identity can be established.
    // The auth-state listener repeats this eviction on logout/user switch as a
    // second safety boundary.
    clearProtectedQueryCache(queryClient);
    await getSupabase().auth.signOut();
    router.replace("/login");
  };

  if (!me) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Open account menu for ${me.name}`}
            className={MOBILE_SHELL_LAYOUT.userTrigger}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {initialsOf(me.name)}
            </div>
            <div className={MOBILE_SHELL_LAYOUT.userDetails}>
              <p className="max-w-40 truncate text-sm font-medium text-foreground">{me.name}</p>
              <p className="max-w-40 truncate text-xs capitalize text-muted-foreground">
                {rolesOf(me.roles)}
              </p>
            </div>
            <ChevronDown className={MOBILE_SHELL_LAYOUT.userChevron} />
          </button>
        }
      />
      <DropdownMenuContent align="end">
        <div className="px-2 py-1.5 text-xs">
          <p className="text-foreground">{me.email}</p>
          <p className="capitalize text-muted-foreground">{rolesOf(me.roles)}</p>
        </div>
        <DropdownMenuSeparator />
        {me.roles.includes("lecturer") ? (
          <DropdownMenuItem onClick={() => router.push("/account-settings")}>
            <Settings />
            Account Settings
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {mounted && resolvedTheme === "dark" ? <Moon /> : <Sun />}
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => setTheme("light")}>Light</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>Dark</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}>System</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {AUTH_MODE === "supabase" ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={signOut}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
