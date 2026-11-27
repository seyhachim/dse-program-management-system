import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * #1303: local-only wrapper for potentially mutating Prisma operations.
 * This is a fail-closed convenience guard, NOT proof that a localhost port
 * cannot be a tunnel. Use only a PostgreSQL instance owned by the student.
 */
export type StudentPluginLocalAction = "migrate" | "seed" | "verify";

export interface StudentPluginLocalTarget {
  host: string;
  database: string;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const LOCAL_DB_PATTERN = /^dse_pms_student_plugins(?:_[a-z0-9_]+)?$/;

function reject(reason: string): never {
  // Never include connection strings, passwords or tokens in errors.
  throw new Error(`Refusing student-plugin local operation: ${reason}`);
}

export function validateStudentPluginLocalTarget(
  env: Record<string, string | undefined>,
): StudentPluginLocalTarget {
  if (env.DSE_STUDENT_PLUGIN_LOCAL !== "true") {
    reject("DSE_STUDENT_PLUGIN_LOCAL=true is required");
  }
  if (env.AUTH_MODE !== "dev" || env.NODE_ENV === "production") {
    reject("local AUTH_MODE=dev and non-production NODE_ENV are required");
  }
  if (env.NEXT_PUBLIC_AUTH_MODE && env.NEXT_PUBLIC_AUTH_MODE !== "dev") {
    reject("frontend authentication must be local dev mode");
  }
  if (env.DSE_STAGING_ENVIRONMENT === "true") {
    reject("staging is not a student development database");
  }

  for (const variable of [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_JWKS_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEON_AUTH_URL",
    "DSE_STAGING_DB_HOST",
    "DSE_STAGING_DB_MARKER",
  ]) {
    if (env[variable]?.trim()) reject("hosted service configuration must be absent");
  }
  if (env.TELEGRAM_PMS_ENABLED === "true" || env.TELEGRAM_PUBLIC_ENABLED === "true") {
    reject("Telegram integrations must be disabled");
  }

  const value = env.DATABASE_URL;
  if (!value) reject("DATABASE_URL is required");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    reject("invalid DATABASE_URL");
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    reject("PostgreSQL URL is required");
  }
  if (!LOCAL_HOSTS.has(parsed.hostname.toLowerCase())) {
    reject("PostgreSQL host must be local loopback");
  }
  if (!parsed.username || !parsed.password) {
    reject("separate local development database credentials are required");
  }

  let database: string;
  try {
    database = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    reject("invalid database name");
  }
  if (!LOCAL_DB_PATTERN.test(database)) {
    reject("database name must begin with dse_pms_student_plugins");
  }

  // Disallow query-string overrides such as host/socket. The only supported
  // Prisma parameter for this isolated workflow is schema=public.
  for (const [key, setting] of parsed.searchParams) {
    if (key !== "schema" || setting !== "public") {
      reject("unsupported database URL query parameter");
    }
  }

  return { host: parsed.hostname.toLowerCase(), database };
}

const ACTIONS: Record<StudentPluginLocalAction, readonly string[]> = {
  migrate: ["run", "db:migrate:deploy"],
  seed: ["run", "seed"],
  verify: ["run", "--cwd", "apps/backend", "db:security:verify"],
};

function isAction(value: string | undefined): value is StudentPluginLocalAction {
  return value === "migrate" || value === "seed" || value === "verify";
}

if (import.meta.main) {
  const action = process.argv[2];
  if (!isAction(action) || process.argv.length !== 3) {
    console.error("Usage: bun apps/backend/scripts/student-plugin-local.ts migrate|seed|verify");
    process.exitCode = 2;
  } else {
    try {
      const target = validateStudentPluginLocalTarget(process.env);
      console.log(`Verified local student-plugin target (${target.host}, ${target.database}).`);
      const result = spawnSync("bun", [...ACTIONS[action]], {
        cwd: resolve(import.meta.dir, "../../.."),
        env: process.env,
        stdio: "inherit",
        shell: false,
      });
      if (result.error) throw result.error;
      process.exitCode = result.status ?? 1;
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Student-plugin guard failed");
      process.exitCode = 1;
    }
  }
}
