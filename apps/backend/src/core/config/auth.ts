export type AuthMode = "dev" | "supabase";

type AuthEnv = NodeJS.ProcessEnv;

function requireHttpsUrl(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  if (url.protocol !== "https:") {
    throw new Error(`${name} must use https in production`);
  }

  return value;
}

export interface AuthConfig {
  mode: AuthMode;
  supabaseJwksUrl?: string;
}

/**
 * Resolve authentication configuration without silently falling back to dev auth.
 * Production is Supabase-only; local/test environments may explicitly opt into dev auth.
 */
export function resolveAuthConfig(env: AuthEnv = process.env): AuthConfig {
  const rawMode = env.AUTH_MODE;
  if (rawMode !== "dev" && rawMode !== "supabase") {
    throw new Error("AUTH_MODE must be explicitly set to either 'dev' or 'supabase'");
  }

  if (env.NODE_ENV === "production" && rawMode !== "supabase") {
    throw new Error("Production requires AUTH_MODE=supabase; development JWT auth is not allowed");
  }

  if (rawMode === "supabase") {
    const jwksUrl = env.NODE_ENV === "production"
      ? requireHttpsUrl("SUPABASE_JWKS_URL", env.SUPABASE_JWKS_URL)
      : env.SUPABASE_JWKS_URL;

    if (!jwksUrl) {
      throw new Error("SUPABASE_JWKS_URL is required when AUTH_MODE=supabase");
    }

    return { mode: rawMode, supabaseJwksUrl: jwksUrl };
  }

  return { mode: rawMode };
}

/** Validate runtime authentication configuration before the API starts listening. */
export function validateAuthConfig(env: AuthEnv = process.env): void {
  resolveAuthConfig(env);
}
