import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { main as verifyStaging, validateStagingTarget } from "./verify-staging-db.ts";

const HOST = "ep-lively-bonus-a1lpsxjs.ap-southeast-1.aws.neon.tech";
const DB = "dse_pr1365";
const MARKER = "DSE-PMS-STAGING:pr1365-isolated-20261125";
const MIGRATION = "20261125133000_curriculum_official_code_uniqueness";

function run(args: string[], extra: Record<string, string> = {}) {
  const result = Bun.spawnSync(["bun", ...args], {
    cwd: fileURLToPath(new URL("../../..", import.meta.url)),
    env: { ...process.env, ...extra },
    stdout: "inherit", stderr: "inherit", stdin: "ignore",
  });
  if (result.exitCode !== 0) throw new Error("Guarded staging command failed: " + args.join(" "));
}

async function main() {
  const target = validateStagingTarget(process.env);
  if (target.expectedHost !== HOST || target.expectedDatabase !== DB || target.expectedMarker !== MARKER) {
    throw new Error("This runner only accepts the dedicated PR #1365 staging database");
  }
  await verifyStaging();
  const db = new PrismaClient();
  try {
    const present = await db.$queryRaw<Array<{ snapshots: boolean }>>`
      SELECT to_regclass('curriculum_artifact."CourseSnapshot"') IS NOT NULL AS snapshots
    `;
    if (present[0]?.snapshots) {
      const duplicates = await db.$queryRaw<Array<{ groups: number }>>`
        SELECT count(*)::int AS groups FROM (
          SELECT "curriculumVersionId", "courseCodeSnapshot"
          FROM curriculum_artifact."CourseSnapshot" GROUP BY 1,2 HAVING count(*) > 1
        ) d
      `;
      if (duplicates[0]?.groups !== 0) throw new Error("Duplicate snapshot codes; stop migration");
    }
    console.log("Duplicate preflight passed (or fresh empty schema).");
    run(["run", "db:migrate:deploy"]);
    await verifyStaging();
    const applied = await db.$queryRaw<Array<{ valid: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM public."_prisma_migrations" WHERE migration_name = ${MIGRATION}
        AND finished_at IS NOT NULL AND rolled_back_at IS NULL) AS valid
    `;
    const constraints = await db.$queryRaw<Array<{ valid: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'curriculum_artifact."CourseSnapshot"'::regclass
        AND conname = 'CourseSnapshot_version_official_code_key' AND contype = 'u'
        AND condeferrable AND NOT condeferred AND convalidated) AS valid
    `;
    if (!applied[0]?.valid || !constraints[0]?.valid) throw new Error("Expected migration or unique constraint missing");
    run(["run", "--cwd", "apps/backend", "db:security:verify"]);
    // Only the named test runs. It creates fabricated, unique programme
    // records and leaves the synthetic correction Draft; no live data copied.
    run(["test", "apps/backend/src/plugins/programme/curriculum-import-db.test.ts", "--test-name-pattern", "full G6 corrective revision"], { CURRICULUM_DB_TESTS: "1" });
    run(["run", "--cwd", "apps/backend", "db:security:verify"]);
    console.log("PR #1365 isolated migration, security and corrective revision acceptance passed.");
  } finally {
    await db.$disconnect();
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Staging acceptance failed");
  process.exitCode = 1;
});
