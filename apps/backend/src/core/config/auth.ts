export type AuthMode = "dev" | "supabase" | "neon-staging";

type AuthEnv = NodeJS.ProcessEnv;

function requireHttpsUrl(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is required`);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${name} must be a valid URL`); }
  if (url.protocol !== "https:") throw new Error(`${name} must use https in production`);
  return value;
}

export interface AuthConfig {
  mode: AuthMode;
  supabaseJwksUrl?: string;
  neonAuthBaseUrl?: string;
}

/**
 * Fail-closed staging-only auth. Never activate this mode against any Supabase
 * database or in any real student service. A matching database-level marker is
 * also checked before startup in server.ts (and before migrate in Render).
 */
export function validateNeonStagingAuthEnvironment(env: AuthEnv): string {
  if (env.DSE_STAGING_ENVIRONMENT !== "true" ||
      env.DSE_STAGING_DB_MARKER !== "DSE-PMS-STAGING:20261107-neon-verified-01" ||
      env.DSE_STAGING_DB_NAME !== "neondb") {
    throw new Error("Neon staging auth requires the approved isolated staging database");
  }
  const host = "ep-purple-scene-a1py5uzt.ap-southeast-1.aws.neon.tech";
  if (env.DSE_STAGING_DB_HOST !== host) {
    throw new Error("Neon staging auth requires the approved isolated database host");
  }
  const actualDatabase = env.DATABASE_URL ?? "";
  let dbUrl: URL;
  try { dbUrl = new URL(actualDatabase); } catch { throw new Error("Neon staging database URL is invalid"); }
  if ((dbUrl.protocol !== "postgres:" && dbUrl.protocol !== "postgresql:") ||
      dbUrl.hostname !== host || dbUrl.pathname !== "/neondb" ||
      !["require", "verify-full"].includes(dbUrl.searchParams.get("sslmode") ?? "")) {
    throw new Error("Neon staging auth cannot connect to a non-staging database");
  }
  if (env.SUPABASE_URL || env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Neon staging auth must never use Supabase Admin credentials");
  }
  if (!env.CORS_ORIGIN || env.CORS_ORIGIN === "*") {
    throw new Error("Neon staging auth requires an explicit CORS allowlist");
  }
  const base = requireHttpsUrl("NEON_AUTH_BASE_URL", env.NEON_AUTH_BASE_URL);
  const expected = "https://ep-purple-scene-a1py5uzt.neonauth.ap-southeast-1.aws.neon.tech/neondb/auth";
  if (base !== expected) {
    throw new Error("Neon staging auth requires the approved branch issuer");
  }
  return base;
}

/** Production always uses Supabase except for a separately verified staging DB. */
export function resolveAuthConfig(env: AuthEnv = process.env): AuthConfig {
  const rawMode = env.AUTH_MODE;
  if (rawMode !== "dev" && rawMode !== "supabase" && rawMode !== "neon-staging") {
    throw new Error("AUTH_MODE must be explicitly set to 'dev', 'supabase' or 'neon-staging'");
  }
  if (rawMode === "neon-staging") {
    return { mode: rawMode, neonAuthBaseUrl: validateNeonStagingAuthEnvironment(env) };
  }
  if (env.NODE_ENV === "production" && rawMode !== "supabase") {
    throw new Error("Production requires AUTH_MODE=supabase");
  }
  if (rawMode === "supabase") {
    const jwksUrl = env.NODE_ENV === "production"
      ? requireHttpsUrl("SUPABASE_JWKS_URL", env.SUPABASE_JWKS_URL)
      : env.SUPABASE_JWKS_URL;
    if (!jwksUrl) throw new Error("SUPABASE_JWKS_URL is required when AUTH_MODE=supabase");
    return { mode: rawMode, supabaseJwksUrl: jwksUrl };
  }
  return { mode: rawMode };
}

export function validateAuthConfig(env: AuthEnv = process.env): void {
  resolveAuthConfig(env);
}
