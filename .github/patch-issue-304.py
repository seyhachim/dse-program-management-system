from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:140]!r}")
    if text.count(old) != 1:
        raise SystemExit(f"anchor not unique in {path}: {old[:140]!r}")
    p.write_text(text.replace(old, new, 1))

# Prisma enum, relations, model.
replace_once(
    "apps/backend/prisma/schema.prisma",
    "enum StudentCompletionOutcomeType {\n  ProgrammeCompleted\n  GraduationAwarded\n}\n",
    "enum StudentCompletionOutcomeType {\n  ProgrammeCompleted\n  GraduationAwarded\n}\n\nenum ProgrammeOutcomeIndicatorType {\n  ProgressionRate\n  RetentionRate\n  CompletionRate\n  DropoutRate\n  CloAttainmentRate\n  PloAttainmentRate\n}\n",
)
replace_once(
    "apps/backend/prisma/schema.prisma",
    "  memberships StudentCohortMembership[]\n\n  @@unique([programmeId, code])",
    "  memberships StudentCohortMembership[]\n  outcomeIndicators ProgrammeOutcomeIndicator[]\n\n  @@unique([programmeId, code])",
)
replace_once(
    "apps/backend/prisma/schema.prisma",
    "model StudentCompletionOutcome {\n  id            String                       @id @default(uuid())\n  membershipId  String\n  membership    StudentCohortMembership      @relation(fields: [membershipId], references: [id], onDelete: Restrict)\n  outcomeType   StudentCompletionOutcomeType\n  outcomeDate   DateTime                     @db.Date\n  academicYear  String\n  awardName     String                       @default(\"\")\n  note          String                       @default(\"\")\n  recordedAt    DateTime                     @default(now())\n\n  @@unique([membershipId, outcomeType])\n  @@index([membershipId, outcomeDate])\n  @@index([outcomeType, academicYear, outcomeDate])\n}\n",
    "model StudentCompletionOutcome {\n  id            String                       @id @default(uuid())\n  membershipId  String\n  membership    StudentCohortMembership      @relation(fields: [membershipId], references: [id], onDelete: Restrict)\n  outcomeType   StudentCompletionOutcomeType\n  outcomeDate   DateTime                     @db.Date\n  academicYear  String\n  awardName     String                       @default(\"\")\n  note          String                       @default(\"\")\n  recordedAt    DateTime                     @default(now())\n\n  @@unique([membershipId, outcomeType])\n  @@index([membershipId, outcomeDate])\n  @@index([outcomeType, academicYear, outcomeDate])\n}\n\n/// Issue #304: immutable, versioned programme-level outcome indicator snapshot.\n/// Definition and calculation hashes make longitudinal comparability explicit.\nmodel ProgrammeOutcomeIndicator {\n  id                    String                        @id @default(uuid())\n  programmeId           String\n  programme             Programme                     @relation(fields: [programmeId], references: [id], onDelete: Restrict)\n  cohortId              String\n  cohort                StudentCohort                 @relation(fields: [cohortId], references: [id], onDelete: Restrict)\n  indicatorType         ProgrammeOutcomeIndicatorType\n  academicYear          String\n  periodKey             String\n  numerator             Int\n  denominator           Int\n  value                 Float?\n  definitionVersion     String\n  definition            Json\n  definitionHash        String\n  calculationVersion    String\n  sourceRefs            String[]                      @default([])\n  calculationHash       String                        @unique\n  supersedesIndicatorId String?\n  supersedesIndicator   ProgrammeOutcomeIndicator?    @relation(\"ProgrammeOutcomeIndicatorHistory\", fields: [supersedesIndicatorId], references: [id], onDelete: Restrict)\n  supersededBy          ProgrammeOutcomeIndicator[]   @relation(\"ProgrammeOutcomeIndicatorHistory\")\n  generatedAt           DateTime                      @default(now())\n\n  @@index([programmeId, indicatorType, academicYear])\n  @@index([cohortId, indicatorType, periodKey])\n  @@index([definitionHash, periodKey])\n  @@index([supersedesIndicatorId])\n}\n",
)
# Programme relation anchor.
replace_once(
    "apps/backend/prisma/schema.prisma",
    "  cohorts            StudentCohort[]",
    "  cohorts            StudentCohort[]\n  outcomeIndicators  ProgrammeOutcomeIndicator[]",
)

# Shared contract module.
Path("packages/shared-types/src/programme-outcome-indicators.ts").write_text(r'''import { z } from "zod";

export const PROGRAMME_OUTCOME_INDICATOR_TYPES = [
  "ProgressionRate", "RetentionRate", "CompletionRate", "DropoutRate", "CloAttainmentRate", "PloAttainmentRate",
] as const;
export const ProgrammeOutcomeIndicatorTypeSchema = z.enum(PROGRAMME_OUTCOME_INDICATOR_TYPES);

export const RecordProgrammeOutcomeIndicatorInput = z.object({
  programmeId: z.string().trim().min(1),
  cohortId: z.string().uuid(),
  indicatorType: ProgrammeOutcomeIndicatorTypeSchema,
  academicYear: z.string().trim().min(4).max(20),
  periodKey: z.string().trim().min(1).max(100),
  numerator: z.number().int().nonnegative(),
  denominator: z.number().int().nonnegative(),
  definitionVersion: z.string().trim().min(1).max(100),
  definition: z.record(z.string(), z.unknown()),
  calculationVersion: z.string().trim().min(1).max(100),
  sourceRefs: z.array(z.string().trim().min(1).max(500)).min(1),
}).superRefine((value, ctx) => {
  if (value.numerator > value.denominator) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["numerator"], message: "Numerator cannot exceed denominator" });
  }
});
export type RecordProgrammeOutcomeIndicatorInput = z.infer<typeof RecordProgrammeOutcomeIndicatorInput>;
''')
replace_once(
    "packages/shared-types/src/index.ts",
    'export * from "./student-progression.ts";',
    'export * from "./student-progression.ts";\nexport * from "./programme-outcome-indicators.ts";',
)
replace_once(
    "packages/shared-types/src/qa-evidence-candidates.ts",
    '  "graduation-outcomes",\n  "clo-attainment-snapshots",',
    '  "graduation-outcomes",\n  "programme-outcome-indicators",\n  "indicator-definition-history",\n  "clo-attainment-snapshots",',
)

# Indicator service.
Path("apps/backend/src/plugins/qa/evidence/programme-outcome-indicators.ts").write_text(r'''import { createHash } from "node:crypto";
import { Prisma, type ProgrammeOutcomeIndicator } from "@prisma/client";
import type { RecordProgrammeOutcomeIndicatorInput } from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const rate = (numerator: number, denominator: number) => denominator === 0 ? null : Math.round((numerator / denominator) * 10000) / 100;

export async function recordProgrammeOutcomeIndicator(
  input: RecordProgrammeOutcomeIndicatorInput,
): Promise<ProgrammeOutcomeIndicator> {
  const cohort = await prisma.studentCohort.findFirst({ where: { id: input.cohortId, programmeId: input.programmeId }, select: { id: true } });
  if (!cohort) throw new Error("Cohort not found in programme");
  if (input.numerator > input.denominator) throw new Error("Numerator cannot exceed denominator");

  const definitionHash = hash(input.definition);
  const normalizedSourceRefs = [...new Set(input.sourceRefs)].sort();
  const calculationHash = hash({
    programmeId: input.programmeId, cohortId: input.cohortId, indicatorType: input.indicatorType,
    academicYear: input.academicYear, periodKey: input.periodKey, numerator: input.numerator, denominator: input.denominator,
    definitionVersion: input.definitionVersion, definitionHash, calculationVersion: input.calculationVersion,
    sourceRefs: normalizedSourceRefs,
  });
  const existing = await prisma.programmeOutcomeIndicator.findUnique({ where: { calculationHash } });
  if (existing) return existing;
  const previous = await prisma.programmeOutcomeIndicator.findFirst({
    where: { programmeId: input.programmeId, cohortId: input.cohortId, indicatorType: input.indicatorType, periodKey: input.periodKey },
    orderBy: { generatedAt: "desc" },
  });
  return prisma.programmeOutcomeIndicator.create({
    data: {
      programmeId: input.programmeId, cohortId: input.cohortId, indicatorType: input.indicatorType,
      academicYear: input.academicYear, periodKey: input.periodKey, numerator: input.numerator, denominator: input.denominator,
      value: rate(input.numerator, input.denominator), definitionVersion: input.definitionVersion,
      definition: canonical(input.definition) as Prisma.InputJsonValue, definitionHash,
      calculationVersion: input.calculationVersion, sourceRefs: normalizedSourceRefs, calculationHash,
      supersedesIndicatorId: previous?.id ?? null,
    },
  });
}
''')

# Registry adapters.
replace_once(
    "apps/backend/src/plugins/qa/evidence/registry.ts",
    '  switch (evidenceType) {\n    case "completion-records":',
    '''  switch (evidenceType) {\n    case "programme-outcome-indicators":\n      return prisma.$queryRaw<CandidateRow[]>`\n        SELECT\n          i.id AS "entityId",\n          'ProgrammeOutcomeIndicator' AS "entityType",\n          i."indicatorType"::text || ' — ' || c.code || ' — ' || i."periodKey" AS title,\n          CASE WHEN i.value IS NULL THEN i.numerator::text || '/' || i.denominator::text || ' (no rate for zero denominator).'\n               ELSE i.numerator::text || '/' || i.denominator::text || ' = ' || i.value::text || '%.' END AS summary,\n          NULL::text AS route,\n          i."generatedAt" AS "reportingDate",\n          jsonb_build_object(\n            'cohortId', i."cohortId", 'cohortCode', c.code, 'academicYear', i."academicYear",\n            'periodKey', i."periodKey", 'population', 'cohort-membership', 'indicatorType', i."indicatorType"::text,\n            'numerator', i.numerator, 'denominator', i.denominator, 'value', i.value,\n            'definitionVersion', i."definitionVersion", 'definitionHash', i."definitionHash",\n            'calculationVersion', i."calculationVersion", 'calculationHash', i."calculationHash",\n            'sourceRefs', array_to_string(i."sourceRefs", ',')\n          ) AS attributes\n        FROM "ProgrammeOutcomeIndicator" i\n        JOIN "StudentCohort" c ON c.id = i."cohortId"\n        WHERE i."programmeId" = ${programmeId}\n        ORDER BY i."indicatorType", c.code, i."periodKey", i."generatedAt"\n      `;\n\n    case "indicator-definition-history":\n      return prisma.$queryRaw<CandidateRow[]>`\n        SELECT\n          i."indicatorType"::text || ':' || i."definitionHash" AS "entityId",\n          'ProgrammeOutcomeIndicatorDefinition' AS "entityType",\n          i."indicatorType"::text || ' — definition ' || i."definitionVersion" AS title,\n          COUNT(*)::text || ' indicator snapshot(s), ' || COUNT(DISTINCT i."periodKey")::text || ' period(s).' AS summary,\n          NULL::text AS route,\n          MAX(i."generatedAt") AS "reportingDate",\n          jsonb_build_object(\n            'indicatorType', i."indicatorType"::text, 'definitionVersion', i."definitionVersion",\n            'definitionHash', i."definitionHash", 'calculationVersion', i."calculationVersion",\n            'periodCount', COUNT(DISTINCT i."periodKey"), 'firstPeriod', MIN(i."periodKey"), 'lastPeriod', MAX(i."periodKey")\n          ) AS attributes\n        FROM "ProgrammeOutcomeIndicator" i\n        WHERE i."programmeId" = ${programmeId}\n        GROUP BY i."indicatorType", i."definitionVersion", i."definitionHash", i."calculationVersion"\n        ORDER BY i."indicatorType", MAX(i."generatedAt") DESC\n      `;\n\n    case "completion-records":''',
)

# Longitudinal comparisons must stay within a stable definition fingerprint.
replace_once(
    "apps/backend/src/plugins/qa/analysis/deterministic-engine.ts",
    '''type BaseCandidateAssessment = Omit<AssessedCandidate, "temporalMatch"> & {\n  candidateDate: Date | null;\n};''',
    '''type BaseCandidateAssessment = Omit<AssessedCandidate, "temporalMatch"> & {\n  candidateDate: Date | null;\n  comparisonKey: string;\n};''',
)
replace_once(
    "apps/backend/src/plugins/qa/analysis/deterministic-engine.ts",
    '''function candidateDate(candidate: Candidate): Date | null {\n  if (!candidate.reportingDate) return null;\n  const parsed = new Date(candidate.reportingDate);\n  return Number.isNaN(parsed.getTime()) ? null : parsed;\n}\n''',
    '''function candidateDate(candidate: Candidate): Date | null {\n  if (!candidate.reportingDate) return null;\n  const parsed = new Date(candidate.reportingDate);\n  return Number.isNaN(parsed.getTime()) ? null : parsed;\n}\n\nfunction candidateComparisonKey(candidate: Candidate): string {\n  for (const key of ["definitionHash", "definitionVersion", "calculationVersion"] as const) {\n    const value = candidate.attributes[key];\n    if (typeof value === "string" && value.trim()) return `${key}:${value.trim()}`;\n  }\n  return "legacy-compatible-definition";\n}\n''',
)
replace_once(
    "apps/backend/src/plugins/qa/analysis/deterministic-engine.ts",
    '''      temporalRule,\n      candidateDate: candidateDate(candidate),\n    };''',
    '''      temporalRule,\n      candidateDate: candidateDate(candidate),\n      comparisonKey: candidateComparisonKey(candidate),\n    };''',
)
old = '''  const comparablePeriods = new Set(\n    baseAssessments\n      .filter(\n        (item) =>\n          item.scopeMatch === "exact" &&\n          item.authorityMatch === true &&\n          Boolean(item.candidate.periodKey) &&\n          Boolean(item.candidateDate) &&\n          item.candidateDate! <= cycle.reportingEnd,\n      )\n      .map((item) => item.candidate.periodKey as string),\n  ).size;\n\n  const assessed = baseAssessments.map(\n    ({ candidateDate: parsedCandidateDate, ...item }): AssessedCandidate => ({\n      ...item,\n      temporalMatch: matchEvidenceTime(temporalRule, {\n        cycleStart: cycle.reportingStart,\n        cycleEnd: cycle.reportingEnd,\n        candidateDate: parsedCandidateDate,\n        comparablePeriods,\n      }),\n    }),\n  );'''
new = '''  const periodsByDefinition = new Map<string, Set<string>>();\n  for (const item of baseAssessments) {\n    if (\n      item.scopeMatch !== "exact" || item.authorityMatch !== true || !item.candidate.periodKey ||\n      !item.candidateDate || item.candidateDate > cycle.reportingEnd\n    ) continue;\n    const periods = periodsByDefinition.get(item.comparisonKey) ?? new Set<string>();\n    periods.add(item.candidate.periodKey);\n    periodsByDefinition.set(item.comparisonKey, periods);\n  }\n\n  const assessed = baseAssessments.map(\n    ({ candidateDate: parsedCandidateDate, comparisonKey, ...item }): AssessedCandidate => ({\n      ...item,\n      temporalMatch: matchEvidenceTime(temporalRule, {\n        cycleStart: cycle.reportingStart,\n        cycleEnd: cycle.reportingEnd,\n        candidateDate: parsedCandidateDate,\n        comparablePeriods: periodsByDefinition.get(comparisonKey)?.size ?? 0,\n      }),\n    }),\n  );'''
replace_once("apps/backend/src/plugins/qa/analysis/deterministic-engine.ts", old, new)

# Security inventory.
replace_once(
    "apps/backend/scripts/verify-db-security.ts",
    '  "StudentCompletionOutcome",',
    '  "StudentCompletionOutcome",\n  "ProgrammeOutcomeIndicator",',
)

# Migration.
Path("apps/backend/prisma/migrations/20260818040000_add_programme_outcome_indicators").mkdir(parents=True, exist_ok=True)
Path("apps/backend/prisma/migrations/20260818040000_add_programme_outcome_indicators/migration.sql").write_text(r'''-- Issue #304: immutable, versioned programme outcome indicators.
CREATE TYPE "ProgrammeOutcomeIndicatorType" AS ENUM ('ProgressionRate','RetentionRate','CompletionRate','DropoutRate','CloAttainmentRate','PloAttainmentRate');
CREATE TABLE "ProgrammeOutcomeIndicator" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "cohortId" TEXT NOT NULL,
  "indicatorType" "ProgrammeOutcomeIndicatorType" NOT NULL,
  "academicYear" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "numerator" INTEGER NOT NULL,
  "denominator" INTEGER NOT NULL,
  "value" DOUBLE PRECISION,
  "definitionVersion" TEXT NOT NULL,
  "definition" JSONB NOT NULL,
  "definitionHash" TEXT NOT NULL,
  "calculationVersion" TEXT NOT NULL,
  "sourceRefs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "calculationHash" TEXT NOT NULL,
  "supersedesIndicatorId" TEXT,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgrammeOutcomeIndicator_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProgrammeOutcomeIndicator_counts" CHECK ("numerator" >= 0 AND "denominator" >= 0 AND "numerator" <= "denominator"),
  CONSTRAINT "ProgrammeOutcomeIndicator_value" CHECK (("denominator" = 0 AND "value" IS NULL) OR ("denominator" > 0 AND "value" >= 0 AND "value" <= 100)),
  CONSTRAINT "ProgrammeOutcomeIndicator_sources" CHECK (cardinality("sourceRefs") > 0)
);
CREATE UNIQUE INDEX "ProgrammeOutcomeIndicator_calculationHash_key" ON "ProgrammeOutcomeIndicator"("calculationHash");
CREATE INDEX "ProgrammeOutcomeIndicator_programmeId_indicatorType_academicYear_idx" ON "ProgrammeOutcomeIndicator"("programmeId","indicatorType","academicYear");
CREATE INDEX "ProgrammeOutcomeIndicator_cohortId_indicatorType_periodKey_idx" ON "ProgrammeOutcomeIndicator"("cohortId","indicatorType","periodKey");
CREATE INDEX "ProgrammeOutcomeIndicator_definitionHash_periodKey_idx" ON "ProgrammeOutcomeIndicator"("definitionHash","periodKey");
CREATE INDEX "ProgrammeOutcomeIndicator_supersedesIndicatorId_idx" ON "ProgrammeOutcomeIndicator"("supersedesIndicatorId");
ALTER TABLE "ProgrammeOutcomeIndicator" ADD CONSTRAINT "ProgrammeOutcomeIndicator_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgrammeOutcomeIndicator" ADD CONSTRAINT "ProgrammeOutcomeIndicator_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "StudentCohort"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgrammeOutcomeIndicator" ADD CONSTRAINT "ProgrammeOutcomeIndicator_supersedesIndicatorId_fkey" FOREIGN KEY ("supersedesIndicatorId") REFERENCES "ProgrammeOutcomeIndicator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_programme_outcome_indicator_rewrite() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Programme outcome indicators are immutable; create a superseding indicator instead'; END;
$$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prevent_programme_outcome_indicator_rewrite() FROM PUBLIC;
DO $$ DECLARE api_role text; BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname = ANY (ARRAY['anon','authenticated','service_role']) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.prevent_programme_outcome_indicator_rewrite() FROM %I', api_role);
  END LOOP;
END $$;
CREATE TRIGGER "ProgrammeOutcomeIndicator_no_update" BEFORE UPDATE ON "ProgrammeOutcomeIndicator" FOR EACH ROW EXECUTE FUNCTION prevent_programme_outcome_indicator_rewrite();
CREATE TRIGGER "ProgrammeOutcomeIndicator_no_delete" BEFORE DELETE ON "ProgrammeOutcomeIndicator" FOR EACH ROW EXECUTE FUNCTION prevent_programme_outcome_indicator_rewrite();
ALTER TABLE "ProgrammeOutcomeIndicator" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "ProgrammeOutcomeIndicator" FROM PUBLIC;
DO $$ DECLARE api_role text; BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname = ANY (ARRAY['anon','authenticated','service_role']) LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', 'ProgrammeOutcomeIndicator', api_role);
  END LOOP;
END $$;
''')

# DB tests.
Path("apps/backend/src/plugins/qa/evidence/programme-outcome-indicators-db.test.ts").write_text(r'''import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { getQaEvidenceCandidates } from "./service.ts";
import { recordProgrammeOutcomeIndicator } from "./programme-outcome-indicators.ts";

const enabled = process.env.PROGRAMME_INDICATOR_DB_TESTS === "1";
const db = new PrismaClient();
const cohortId = crypto.randomUUID();

const base = { programmeId: "dse", cohortId, indicatorType: "ProgressionRate" as const, definitionVersion: "progression-v1", definition: { numerator: "students progressed", denominator: "students with period status" }, calculationVersion: "calc-v1" };

describe.skipIf(!enabled)("programme outcome indicator integrity", () => {
  beforeAll(async () => {
    await db.studentCohort.create({ data: { id: cohortId, programmeId: "dse", code: `I304-${cohortId.slice(0,6)}`, name: "Indicator cohort", intakeYear: 2020, expectedGraduationYear: 2024, status: "Completed" } });
  });
  afterAll(async () => { await db.$disconnect(); });

  test("persists comparable indicator history with exact lineage", async () => {
    for (const [year, numerator] of [["2022-2023", 8], ["2023-2024", 9], ["2024-2025", 10]] as const) {
      await recordProgrammeOutcomeIndicator({ ...base, academicYear: year, periodKey: year, numerator, denominator: 10, sourceRefs: [`StudentProgressionRecord:${year}`] });
    }
    const evidence = await getQaEvidenceCandidates("dse", "aun-qa-v4:8.4:research:c8-e04:evidence:1");
    const rows = evidence.candidates.filter((item) => item.scope?.cohortId === cohortId);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((item) => item.attributes.definitionHash)).size).toBe(1);
    expect(rows.every((item) => item.provenance?.authority === "controlledInternalRecord")).toBe(true);
    expect(rows.map((item) => item.periodKey).sort()).toEqual(["2022-2023", "2023-2024", "2024-2025"]);
  });

  test("definition changes are separately visible and supersede same-period history", async () => {
    const changed = await recordProgrammeOutcomeIndicator({ ...base, academicYear: "2024-2025", periodKey: "2024-2025", numerator: 9, denominator: 10, definitionVersion: "progression-v2", definition: { numerator: "students advanced without retention", denominator: "all active cohort members" }, sourceRefs: ["StudentProgressionRecord:2024-2025:v2"] });
    expect(changed.supersedesIndicatorId).toBeTruthy();
    const definitions = await getQaEvidenceCandidates("dse", "aun-qa-v4:8.4:research:c8-e04:evidence:2");
    const versions = new Set(definitions.candidates.filter((item) => item.attributes.indicatorType === "ProgressionRate").map((item) => item.attributes.definitionVersion));
    expect(versions.has("progression-v1")).toBe(true);
    expect(versions.has("progression-v2")).toBe(true);
  });

  test("identical inputs are idempotent and historical rows are immutable", async () => {
    const input = { ...base, academicYear: "2023-2024", periodKey: "2023-2024", numerator: 9, denominator: 10, sourceRefs: ["StudentProgressionRecord:2023-2024"] };
    const first = await recordProgrammeOutcomeIndicator(input);
    const again = await recordProgrammeOutcomeIndicator(input);
    expect(again.id).toBe(first.id);
    let failed = false;
    try { await db.programmeOutcomeIndicator.update({ where: { id: first.id }, data: { numerator: 1 } }); } catch { failed = true; }
    expect(failed).toBe(true);
  });

  test("supports zero-denominator missing-population periods without inventing a rate", async () => {
    const missing = await recordProgrammeOutcomeIndicator({ ...base, indicatorType: "CompletionRate", academicYear: "2021-2022", periodKey: "2021-2022", numerator: 0, denominator: 0, definitionVersion: "completion-v1", definition: { numerator: "completed", denominator: "eligible mature cohort" }, sourceRefs: ["StudentCompletionOutcome:none"] });
    expect(missing.value).toBeNull();
  });
});
''')

# Unit regression for comparable definitions.
p = Path("apps/backend/src/plugins/qa/analysis/deterministic-engine.test.ts")
text = p.read_text()
insert = '''\n  it("does not combine periods across changed indicator definitions", () => {\n    const longitudinalDefinition = definition({ kind: "longitudinal", minimumPeriods: 3 });\n    const candidates = [\n      { ...candidate({ key: "v1-p1", ...expectedScope, reportingDate: "2023-06-01T00:00:00.000Z", periodKey: "2023" }), attributes: { definitionHash: "hash-v1" } },\n      { ...candidate({ key: "v1-p2", ...expectedScope, reportingDate: "2024-06-01T00:00:00.000Z", periodKey: "2024" }), attributes: { definitionHash: "hash-v1" } },\n      { ...candidate({ key: "v2-p3", ...expectedScope, reportingDate: "2025-06-01T00:00:00.000Z", periodKey: "2025" }), attributes: { definitionHash: "hash-v2" } },\n    ];\n    const assessed = assessCandidates("dse", expectation({ kind: "longitudinal", minimumPeriods: 3 }), longitudinalDefinition, result(candidates), cycle);\n    expect(assessed.assessed.every((item) => item.temporalMatch === "insufficientHistory")).toBe(true);\n    expect(assessed.finding.result.candidates).toHaveLength(0);\n  });\n'''
anchor = '\n  it("accepts longitudinal evidence once three eligible distinct periods exist", () => {'
if anchor not in text: raise SystemExit("deterministic test anchor missing")
p.write_text(text.replace(anchor, insert + anchor, 1))
