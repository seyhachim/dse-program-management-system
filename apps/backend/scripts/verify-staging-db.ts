import { PrismaClient } from "@prisma/client";

/**
 * Read-only preflight for a separately owned, explicitly marked staging DB.
 * MUST run before Prisma migrate deploy, seed, or server startup on staging.
 * Never log credentials or a full DATABASE_URL.
 */
export interface StagingIdentity {
  expectedHost: string;
  expectedDatabase: string;
  expectedMarker: string;
  connectionString: string;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error("Missing staging preflight setting: " + key);
  return value;
}

export function validateStagingTarget(env: NodeJS.ProcessEnv): StagingIdentity {
  if (env.DSE_STAGING_ENVIRONMENT !== "true") {
    throw new Error("Refusing database operation: DSE_STAGING_ENVIRONMENT must be true");
  }
  const connectionString = required(env, "DATABASE_URL");
  const expectedHost = required(env, "DSE_STAGING_DB_HOST").toLowerCase();
  const expectedDatabase = required(env, "DSE_STAGING_DB_NAME");
  const expectedMarker = required(env, "DSE_STAGING_DB_MARKER");
  const forbiddenHosts = required(env, "DSE_STAGING_FORBIDDEN_DB_HOSTS")
    .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);

  if (!forbiddenHosts.length || forbiddenHosts.includes(expectedHost)) {
    throw new Error("Staging hostname must differ from every production database host");
  }
  if (!/^DSE-PMS-STAGING:[a-zA-Z0-9_-]{16,80}$/.test(expectedMarker)) {
    throw new Error("Invalid staging database identity marker");
  }
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("Invalid staging DATABASE_URL");
  }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("Staging DATABASE_URL must use PostgreSQL");
  }
  // Only a separate managed Neon database is accepted for this $0 staging plan.
  // Never accept the production Supabase project, a production DB schema,
  // a local host, or a Render DB with a 30-day expiry.
  if (!hostname.endsWith(".neon.tech") || hostname !== expectedHost ||
      forbiddenHosts.includes(hostname)) {
    throw new Error("Staging database is not the explicitly approved Neon host");
  }
  const actualDatabase = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (actualDatabase !== expectedDatabase || !actualDatabase) {
    throw new Error("Staging database name does not match approved database");
  }
  if (!url.username || !url.password) {
    throw new Error("Staging database credentials are missing");
  }
  if (url.searchParams.get("sslmode") !== "require" && url.searchParams.get("sslmode") !== "verify-full") {
    throw new Error("Staging database must require TLS");
  }
  if (url.searchParams.has("schema") && url.searchParams.get("schema") !== "public") {
    throw new Error("Staging must use an independent database, not a shared schema");
  }
  return { connectionString, expectedHost, expectedDatabase, expectedMarker };
}

/**
 * A marker is installed by an operator on the already-verified empty Neon DB:
 * COMMENT ON DATABASE neondb IS 'DSE-PMS-STAGING:<random>';
 * This guard only reads the comment. It does not create/alter any DB object.
 */
export async function verifyStagingDatabase(
  config: StagingIdentity,
  runQuery: (url: string) => Promise<{ databaseName: string; databaseMarker: string | null }>,
): Promise<void> {
  const result = await runQuery(config.connectionString);
  if (result.databaseName !== config.expectedDatabase ||
      result.databaseMarker !== config.expectedMarker) {
    throw new Error("Staging database identity marker mismatch; refusing migration");
  }
}

export async function main(env = process.env): Promise<void> {
  const identity = validateStagingTarget(env);
  const client = new PrismaClient({
    datasources: { db: { url: identity.connectionString } },
    log: ["error"],
  });
  try {
    await verifyStagingDatabase(identity, async () => {
      const rows = await client.$queryRaw<Array<{ databaseName: string; databaseMarker: string | null }>>`
        SELECT current_database()::text AS "databaseName",
               shobj_description(oid, 'pg_database')::text AS "databaseMarker"
        FROM pg_database WHERE datname = current_database()
      `;
      if (rows.length !== 1) throw new Error("Cannot verify staging database identity");
      return rows[0]!;
    });
    // No database identifiers or credentials are printed.
    console.log("Staging database identity verified (read-only).");
  } catch {
    throw new Error("Staging DB preflight failed; do not run migrations or seed");
  } finally {
    await client.$disconnect();
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Staging preflight failed");
    process.exitCode = 1;
  });
}
