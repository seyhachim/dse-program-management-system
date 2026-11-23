const STAGING_API = "https://dse-pms-staging-isolated-free.onrender.com";
const STAGING_NEON_AUTH = "https://ep-purple-scene-a1py5uzt.neonauth.ap-southeast-1.aws.neon.tech/neondb/auth";

/**
 * Staging preview is a distinct, exact-host allowlisted deployment. This never
 * relaxes the production Supabase-only build rules for the actual live app.
 */
export function validateProductionAuthConfig(env = process.env) {
  if (env.NODE_ENV !== "production") return;
  if (env.NEXT_PUBLIC_DEV_TOKEN) {
    throw new Error("NEXT_PUBLIC_DEV_TOKEN must not be configured in production builds");
  }
  if (env.NEXT_PUBLIC_AUTH_MODE === "neon-staging") {
    if (env.VERCEL_ENV === "production" ||
        env.NEXT_PUBLIC_STAGING_MODE !== "true" ||
        env.NEXT_PUBLIC_API_URL !== STAGING_API ||
        env.NEXT_PUBLIC_NEON_AUTH_BASE_URL !== STAGING_NEON_AUTH ||
        (env.VERCEL_ENV && env.VERCEL_ENV !== "preview")) {
      throw new Error("Neon staging auth is only permitted on the exact isolated preview backend and branch");
    }
    return;
  }
  if (env.NEXT_PUBLIC_AUTH_MODE !== "supabase") {
    throw new Error("Production frontend builds require NEXT_PUBLIC_AUTH_MODE=supabase");
  }
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("Production frontend builds require NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
}
