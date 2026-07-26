"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@dse-pms/ui";
import { useMe } from "@/lib/auth";
import { AUTH_MODE, getSupabase } from "@/lib/supabase";

/** First letter of each of the first two words in `name` (e.g. "Grace Hopper" → "GH"). */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/);
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

/** Profile pic (initials avatar), name, role title, and a dropdown with account info + sign out. */
export function TopbarUser() {
  const router = useRouter();
  const { me } = useMe();

  const signOut = async () => {
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
              <p className="text-xs capitalize text-muted-foreground">{me.role}</p>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        }
      />
      <DropdownMenuContent align="end">
        <div className="px-2 py-1.5 text-xs">
          <p className="text-foreground">{me.email}</p>
          <p className="capitalize text-muted-foreground">{me.role}</p>
        </div>
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
