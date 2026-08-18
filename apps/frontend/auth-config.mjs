export function validateProductionAuthConfig(env = process.env) {
  if (env.NODE_ENV !== "production") return;

  if (env.NEXT_PUBLIC_AUTH_MODE !== "supabase") {
    throw new Error("Production frontend builds require NEXT_PUBLIC_AUTH_MODE=supabase");
  }

  if (env.NEXT_PUBLIC_DEV_TOKEN) {
    throw new Error("NEXT_PUBLIC_DEV_TOKEN must not be configured in a production frontend build");
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
      "Production frontend builds require NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
}
