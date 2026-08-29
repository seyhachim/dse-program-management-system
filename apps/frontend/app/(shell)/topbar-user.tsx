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

/** Profile pic (initials avatar), name, role title(s), and a dropdown with account info, theme and sign out. */
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
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-accent"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {initialsOf(me.name)}
            </div>
            <div className="text-left leading-tight">
              <p className="text-sm font-medium text-foreground">{me.name}</p>
              <p className="text-xs capitalize text-muted-foreground">{rolesOf(me.roles)}</p>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
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
