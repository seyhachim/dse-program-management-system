import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client — the frontend's single source of the login session.
 * Local/test environments may omit the mode and fall back to `dev`; deployed
 * production builds are validated separately in next.config.mjs and must use
 * `supabase`. Explicit invalid values still fail instead of silently falling back.
 */
function resolveFrontendAuthMode(): "dev" | "supabase" {
  const mode = process.env.NEXT_PUBLIC_AUTH_MODE;
  if (!mode && process.env.NODE_ENV !== "production") return "dev";
  if (mode !== "dev" && mode !== "supabase") {
    throw new Error(
      "NEXT_PUBLIC_AUTH_MODE must be explicitly set to either 'dev' or 'supabase'",
    );
  }
  return mode;
}

export const AUTH_MODE = resolveFrontendAuthMode();

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY must be set when AUTH_MODE=supabase",
    );
  }
  client = createClient(url, anon);
  return client;
}
