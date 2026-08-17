from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:120]!r}")
    if text.count(old) != 1:
        raise SystemExit(f"anchor not unique in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))

# Prisma enum + relations + model.
replace_once(
    "apps/backend/prisma/schema.prisma",
    "enum StudentProgressionStatus {\n  Progressed\n  Retained\n  Withdrawn\n  Inactive\n  Graduated\n  Transferred\n}\n",
    "enum StudentProgressionStatus {\n  Progressed\n  Retained\n  Withdrawn\n  Inactive\n  Graduated\n  Transferred\n}\n\nenum StudentCompletionOutcomeType {\n  ProgrammeCompleted\n  GraduationAwarded\n}\n",
)
replace_once(
    "apps/backend/prisma/schema.prisma",
    "  progressionRecords StudentProgressionRecord[]\n\n  @@unique([cohortId, studentId, joinedAt])",
    "  progressionRecords StudentProgressionRecord[]\n  completionOutcomes StudentCompletionOutcome[]\n\n  @@unique([cohortId, studentId, joinedAt])",
)
replace_once(
    "apps/backend/prisma/schema.prisma",
    "model StudentProgressionRecord {\n  id             String                   @id @default(uuid())\n  membershipId   String\n  membership     StudentCohortMembership  @relation(fields: [membershipId], references: [id], onDelete: Restrict)\n  academicYear   String\n  term           String\n  periodStart    DateTime                 @db.Date\n  periodEnd      DateTime                 @db.Date\n  status         StudentProgressionStatus\n  note           String                   @default(\"\")\n  recordedAt     DateTime                 @default(now())\n\n  @@unique([membershipId, academicYear, term])\n  @@index([membershipId, periodStart])\n  @@index([academicYear, term, status])\n}\n",
    "model StudentProgressionRecord {\n  id             String                   @id @default(uuid())\n  membershipId   String\n  membership     StudentCohortMembership  @relation(fields: [membershipId], references: [id], onDelete: Restrict)\n  academicYear   String\n  term           String\n  periodStart    DateTime                 @db.Date\n  periodEnd      DateTime                 @db.Date\n  status         StudentProgressionStatus\n  note           String                   @default(\"\")\n  recordedAt     DateTime                 @default(now())\n\n  @@unique([membershipId, academicYear, term])\n  @@index([membershipId, periodStart])\n  @@index([academicYear, term, status])\n}\n\n/// Issue #302: append-only authoritative completion/graduation evidence for one\n/// exact student cohort membership. Completion and award are separate events so\n/// later graduation does not rewrite the earlier programme-completion record.\nmodel StudentCompletionOutcome {\n  id            String                       @id @default(uuid())\n  membershipId  String\n  membership    StudentCohortMembership      @relation(fields: [membershipId], references: [id], onDelete: Restrict)\n  outcomeType   StudentCompletionOutcomeType\n  outcomeDate   DateTime                     @db.Date\n  academicYear  String\n  awardName     String                       @default(\"\")\n  note          String                       @default(\"\")\n  recordedAt    DateTime                     @default(now())\n\n  @@unique([membershipId, outcomeType])\n  @@index([membershipId, outcomeDate])\n  @@index([outcomeType, academicYear, outcomeDate])\n}\n",
)

# Shared contracts.
p = Path("packages/shared-types/src/student-progression.ts")
text = p.read_text()
text += '''\n\nexport const STUDENT_COMPLETION_OUTCOME_TYPES = ["ProgrammeCompleted", "GraduationAwarded"] as const;\nexport const StudentCompletionOutcomeTypeSchema = z.enum(STUDENT_COMPLETION_OUTCOME_TYPES);\n\nexport const RecordStudentCompletionOutcomeInput = z.object({\n  membershipId: z.string().uuid(),\n  outcomeType: StudentCompletionOutcomeTypeSchema,\n  outcomeDate: DateOnlySchema,\n  academicYear: z.string().trim().min(4).max(20),\n  awardName: z.string().trim().max(300).default(""),\n  note: z.string().trim().max(2000).default(""),\n});\nexport type RecordStudentCompletionOutcomeInput = z.infer<typeof RecordStudentCompletionOutcomeInput>;\n\nexport const ListStudentCompletionOutcomesQuery = z.object({\n  outcomeType: StudentCompletionOutcomeTypeSchema.optional(),\n  academicYear: z.string().trim().min(4).max(20).optional(),\n});\nexport type ListStudentCompletionOutcomesQuery = z.infer<typeof ListStudentCompletionOutcomesQuery>;\n'''
p.write_text(text)

# Student service imports and methods.
replace_once(
    "apps/backend/src/plugins/students/cohort-service.ts",
    "  ListStudentProgressionQuery,\n} from \"@dse-pms/shared-types\";",
    "  ListStudentProgressionQuery,\n  ListStudentCompletionOutcomesQuery,\n  RecordStudentCompletionOutcomeInput,\n} from \"@dse-pms/shared-types\";",
)
replace_once(
    "apps/backend/src/plugins/students/cohort-service.ts",
    "  studentHistory(cohortId: string, studentId: string) {\n    return prisma.studentCohortMembership.findMany({\n      where: { cohortId, studentId },\n      include: { cohort: true, progressionRecords: { orderBy: [{ periodStart: \"asc\" }, { recordedAt: \"asc\" }] } },\n      orderBy: { joinedAt: \"asc\" },\n    });\n  },\n};",
    '''  async recordCompletionOutcome(cohortId: string, input: RecordStudentCompletionOutcomeInput) {\n    const membership = await prisma.studentCohortMembership.findFirst({\n      where: { id: input.membershipId, cohortId },\n    });\n    if (!membership) throw Object.assign(new Error("Cohort membership not found"), { code: "P2025" });\n    return prisma.studentCompletionOutcome.create({\n      data: {\n        membershipId: input.membershipId,\n        outcomeType: input.outcomeType,\n        outcomeDate: asDate(input.outcomeDate),\n        academicYear: input.academicYear,\n        awardName: input.awardName,\n        note: input.note,\n      },\n      include: { membership: { include: { student: true, cohort: true } } },\n    });\n  },\n\n  listCompletionOutcomes(cohortId: string, query: ListStudentCompletionOutcomesQuery) {\n    return prisma.studentCompletionOutcome.findMany({\n      where: {\n        membership: { cohortId },\n        ...(query.outcomeType ? { outcomeType: query.outcomeType } : {}),\n        ...(query.academicYear ? { academicYear: query.academicYear } : {}),\n      },\n      include: { membership: { include: { student: true, cohort: true } } },\n      orderBy: [{ outcomeDate: "asc" }, { recordedAt: "asc" }],\n    });\n  },\n\n  async completionSummary(cohortId: string) {\n    const cohort = await prisma.studentCohort.findUnique({\n      where: { id: cohortId },\n      select: { id: true, programmeId: true, code: true, intakeYear: true, expectedGraduationYear: true, _count: { select: { memberships: true } } },\n    });\n    if (!cohort) throw Object.assign(new Error("Cohort not found"), { code: "P2025" });\n    const grouped = await prisma.studentCompletionOutcome.groupBy({\n      by: ["outcomeType"],\n      where: { membership: { cohortId } },\n      _count: { _all: true },\n    });\n    const completionCount = grouped.find((row) => row.outcomeType === "ProgrammeCompleted")?._count._all ?? 0;\n    const graduationCount = grouped.find((row) => row.outcomeType === "GraduationAwarded")?._count._all ?? 0;\n    const denominator = cohort._count.memberships;\n    return {\n      cohortId: cohort.id, programmeId: cohort.programmeId, cohortCode: cohort.code,\n      intakeYear: cohort.intakeYear, expectedGraduationYear: cohort.expectedGraduationYear,\n      populationSize: denominator, completionCount, graduationCount,\n      completionRate: denominator ? Math.round((completionCount / denominator) * 10000) / 100 : null,\n      graduationRate: denominator ? Math.round((graduationCount / denominator) * 10000) / 100 : null,\n    };\n  },\n\n  studentHistory(cohortId: string, studentId: string) {\n    return prisma.studentCohortMembership.findMany({\n      where: { cohortId, studentId },\n      include: {\n        cohort: true,\n        progressionRecords: { orderBy: [{ periodStart: "asc" }, { recordedAt: "asc" }] },\n        completionOutcomes: { orderBy: [{ outcomeDate: "asc" }, { recordedAt: "asc" }] },\n      },\n      orderBy: { joinedAt: "asc" },\n    });\n  },\n};''',
)

# Student router.
replace_once(
    "apps/backend/src/plugins/students/cohort-router.ts",
    "  ListStudentProgressionQuery,\n} from \"@dse-pms/shared-types\";",
    "  ListStudentProgressionQuery,\n  ListStudentCompletionOutcomesQuery,\n  RecordStudentCompletionOutcomeInput,\n} from \"@dse-pms/shared-types\";",
)
replace_once(
    "apps/backend/src/plugins/students/cohort-router.ts",
    '''  router.get("/:cohortId/students/:studentId/history", requirePermission("students:read"), async (req, res) => {\n    res.json(await studentCohortService.studentHistory(req.params.cohortId!, req.params.studentId!));\n  });\n\n  return router;''',
    '''  router.get("/:cohortId/completion-outcomes", requirePermission("students:read"), async (req, res) => {\n    const parsed = ListStudentCompletionOutcomesQuery.safeParse(req.query);\n    if (!parsed.success) return void res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });\n    res.json(await studentCohortService.listCompletionOutcomes(req.params.cohortId!, parsed.data));\n  });\n\n  router.post("/:cohortId/completion-outcomes", requirePermission("students:write"), async (req, res) => {\n    const parsed = RecordStudentCompletionOutcomeInput.safeParse(req.body);\n    if (!parsed.success) return void res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });\n    try { res.status(201).json(await studentCohortService.recordCompletionOutcome(req.params.cohortId!, parsed.data)); }\n    catch (err) {\n      res.status(notFound(err) ? 404 : conflict(err) ? 409 : 400).json({\n        error: notFound(err) ? "Cohort membership not found" : conflict(err) ? "Completion outcome already recorded for this membership" : (err instanceof Error ? err.message : "Could not record completion outcome"),\n      });\n    }\n  });\n\n  router.get("/:cohortId/completion-summary", requirePermission("students:read"), async (req, res) => {\n    try { res.json(await studentCohortService.completionSummary(req.params.cohortId!)); }\n    catch (err) { res.status(notFound(err) ? 404 : 400).json({ error: notFound(err) ? "Cohort not found" : "Could not calculate completion summary" }); }\n  });\n\n  router.get("/:cohortId/students/:studentId/history", requirePermission("students:read"), async (req, res) => {\n    res.json(await studentCohortService.studentHistory(req.params.cohortId!, req.params.studentId!));\n  });\n\n  return router;''',
)

# Applicability supports authoritative multiple cohorts while keeping legacy single-date callers.
replace_once(
    "apps/backend/src/plugins/qa/analysis/evidence-semantics.ts",
    "export interface QaApplicabilityContext {\n  cohortStartDate?: Date | null;\n  asOfDate: Date;\n}",
    "export interface QaApplicabilityContext {\n  cohortStartDate?: Date | null;\n  cohortStartDates?: Date[];\n  asOfDate: Date;\n}",
)
replace_once(
    "apps/backend/src/plugins/qa/analysis/evidence-semantics.ts",
    '''  if (!context.cohortStartDate) {\n    return {\n      state: "uncertain",\n      reason: "Cohort maturity cannot be established because the cohort start date is unavailable.",\n    };\n  }\n\n  const maturityDate = new Date(context.cohortStartDate);\n  maturityDate.setUTCFullYear(maturityDate.getUTCFullYear() + rule.minimumElapsedYears);\n\n  return context.asOfDate >= maturityDate\n    ? {\n        state: "applicable",\n        reason: `Cohort has reached the required ${rule.minimumElapsedYears}-year maturity threshold.`,\n      }\n    : {\n        state: "notApplicable",\n        reason: `Cohort has not yet reached the required ${rule.minimumElapsedYears}-year maturity threshold.`,\n      };''',
    '''  const cohortStartDates = context.cohortStartDates?.length\n    ? context.cohortStartDates\n    : context.cohortStartDate\n      ? [context.cohortStartDate]\n      : [];\n  if (cohortStartDates.length === 0) {\n    return {\n      state: "uncertain",\n      reason: "Cohort maturity cannot be established because authoritative cohort start data is unavailable.",\n    };\n  }\n\n  const matureCount = cohortStartDates.filter((start) => {\n    const maturityDate = new Date(start);\n    maturityDate.setUTCFullYear(maturityDate.getUTCFullYear() + rule.minimumElapsedYears);\n    return context.asOfDate >= maturityDate;\n  }).length;\n\n  if (matureCount > 0) {\n    return {\n      state: "applicable",\n      reason: `${matureCount} of ${cohortStartDates.length} authoritative cohort(s) have reached the required ${rule.minimumElapsedYears}-year maturity threshold.`,\n    };\n  }\n  return {\n    state: "notApplicable",\n    reason: `No authoritative cohort has yet reached the required ${rule.minimumElapsedYears}-year maturity threshold.`,\n  };''',
)

# Deterministic engine: use StudentCohort and pass mature cohort filter to evidence retrieval.
start = Path("apps/backend/src/plugins/qa/analysis/deterministic-engine.ts")
text = start.read_text()
old_start = text.index("type CohortStartRow = {")
old_end = text.index("\nexport async function runDeterministicQaAnalysis", old_start)
replacement = '''type StudentCohortMaturityRow = {\n  id: string;\n  intakeYear: number;\n};\n\nexport function cohortStartDateFromIntakeYear(intakeYear: number): Date {\n  return new Date(Date.UTC(intakeYear, 0, 1));\n}\n\nexport function matureStudentCohortIds(\n  rows: StudentCohortMaturityRow[],\n  asOfDate: Date,\n  minimumElapsedYears: number,\n): string[] {\n  return rows.filter((row) => {\n    const maturityDate = cohortStartDateFromIntakeYear(row.intakeYear);\n    maturityDate.setUTCFullYear(maturityDate.getUTCFullYear() + minimumElapsedYears);\n    return asOfDate >= maturityDate;\n  }).map((row) => row.id);\n}\n\nasync function resolveStudentCohorts(programmeId: string): Promise<StudentCohortMaturityRow[]> {\n  return prisma.studentCohort.findMany({\n    where: { programmeId, status: { in: ["Active", "Completed", "Archived"] } },\n    select: { id: true, intakeYear: true },\n    orderBy: [{ intakeYear: "asc" }, { code: "asc" }],\n  });\n}\n'''
start.write_text(text[:old_start] + replacement + text[old_end:])
replace_once(
    "apps/backend/src/plugins/qa/analysis/deterministic-engine.ts",
    "  const cohortStartDate = await resolveCohortStartDate(programmeId, cycle);",
    "  const studentCohorts = await resolveStudentCohorts(programmeId);\n  const cohortStartDates = studentCohorts.map((cohort) => cohortStartDateFromIntakeYear(cohort.intakeYear));",
)
replace_once(
    "apps/backend/src/plugins/qa/analysis/deterministic-engine.ts",
    '''    const applicability = evaluateApplicability(expectation.applicabilityRule, {\n      cohortStartDate,\n      asOfDate: cycle.reportingEnd,\n    });''',
    '''    const applicability = evaluateApplicability(expectation.applicabilityRule, {\n      cohortStartDates,\n      asOfDate: cycle.reportingEnd,\n    });\n    const matureCohortIds = expectation.applicabilityRule.kind === "cohortMaturity"\n      ? matureStudentCohortIds(studentCohorts, cycle.reportingEnd, expectation.applicabilityRule.minimumElapsedYears)\n      : undefined;''',
)
replace_once(
    "apps/backend/src/plugins/qa/analysis/deterministic-engine.ts",
    "        const result = await getQaEvidenceCandidates(programmeId, definition.id);",
    "        const result = await getQaEvidenceCandidates(programmeId, definition.id, { cohortIds: matureCohortIds });",
)

# QA evidence registry: types and candidates with optional cohort filtering.
replace_once(
    "packages/shared-types/src/qa-evidence-candidates.ts",
    '  "student-progression-records",\n  "clo-attainment-snapshots",',
    '  "student-progression-records",\n  "completion-records",\n  "graduation-outcomes",\n  "clo-attainment-snapshots",',
)
replace_once(
    "apps/backend/src/plugins/qa/evidence/registry.ts",
    "  switch (evidenceType) {\n    case \"clo-attainment-snapshots\":",
    '''  switch (evidenceType) {\n    case "completion-records":\n    case "graduation-outcomes": {\n      const outcomeType = evidenceType === "completion-records" ? "ProgrammeCompleted" : "GraduationAwarded";\n      return prisma.$queryRaw<CandidateRow[]>`\n        SELECT\n          o.id AS "entityId",\n          'StudentCompletionOutcome' AS "entityType",\n          s."studentId" || ' — ' || c.code || ' — ' || o."outcomeType"::text AS title,\n          CASE WHEN o."awardName" = '' THEN o."outcomeType"::text || ' on ' || o."outcomeDate"::text\n               ELSE o."outcomeType"::text || ': ' || o."awardName" || ' on ' || o."outcomeDate"::text END AS summary,\n          '/students' AS route,\n          o."outcomeDate" AS "reportingDate",\n          jsonb_build_object(\n            'cohortId', c.id, 'cohortCode', c.code, 'studentId', s.id,\n            'academicYear', o."academicYear", 'periodKey', o."academicYear",\n            'population', 'cohort-membership', 'outcomeType', o."outcomeType"::text,\n            'outcomeDate', o."outcomeDate"::text, 'awardName', o."awardName", 'finalized', true\n          ) AS attributes\n        FROM "StudentCompletionOutcome" o\n        JOIN "StudentCohortMembership" m ON m.id = o."membershipId"\n        JOIN "StudentCohort" c ON c.id = m."cohortId"\n        JOIN "Student" s ON s.id = m."studentId"\n        WHERE c."programmeId" = ${programmeId}\n          AND o."outcomeType"::text = ${outcomeType}\n        ORDER BY o."outcomeDate", c.code, s."studentId"\n      `;\n    }\n\n    case "clo-attainment-snapshots":''',
)
replace_once(
    "apps/backend/src/plugins/qa/evidence/registry.ts",
    '''export async function retrieveEvidenceCandidates(\n  programmeId: string,\n  definition: ExpectedEvidenceDefinition,\n): Promise<QaEvidenceCandidateResultView> {''',
    '''export async function retrieveEvidenceCandidates(\n  programmeId: string,\n  definition: ExpectedEvidenceDefinition,\n  options: { cohortIds?: string[] } = {},\n): Promise<QaEvidenceCandidateResultView> {''',
)
replace_once(
    "apps/backend/src/plugins/qa/evidence/registry.ts",
    '''  const rows = await queryRows(programmeId, definition.evidenceType);\n  return {''',
    '''  const rows = await queryRows(programmeId, definition.evidenceType);\n  const candidates = toCandidates(definition, rows);\n  const filteredCandidates = options.cohortIds === undefined\n    ? candidates\n    : candidates.filter((candidate) => {\n        const cohortId = candidate.attributes.cohortId;\n        return typeof cohortId === "string" && options.cohortIds!.includes(cohortId);\n      });\n  return {''',
)
replace_once(
    "apps/backend/src/plugins/qa/evidence/registry.ts",
    "    candidates: toCandidates(definition, rows),\n  };",
    "    candidates: filteredCandidates,\n  };",
)

# Evidence service option pass-through.
replace_once(
    "apps/backend/src/plugins/qa/evidence/service.ts",
    "  options: { topK?: number; embeddingProvider?: QaEmbeddingProvider | null } = {},",
    "  options: { topK?: number; embeddingProvider?: QaEmbeddingProvider | null; cohortIds?: string[] } = {},",
)
replace_once(
    "apps/backend/src/plugins/qa/evidence/service.ts",
    "    await retrieveEvidenceCandidates(programmeId, definition),",
    "    await retrieveEvidenceCandidates(programmeId, definition, { cohortIds: options.cohortIds }),",
)

# DB security inventory.
replace_once(
    "apps/backend/scripts/verify-db-security.ts",
    '  "QaCloAttainmentSnapshot",',
    '  "QaCloAttainmentSnapshot",\n  "StudentCompletionOutcome",',
)

# Migration.
Path("apps/backend/prisma/migrations/20260818030000_add_completion_graduation_outcomes").mkdir(parents=True, exist_ok=True)
Path("apps/backend/prisma/migrations/20260818030000_add_completion_graduation_outcomes/migration.sql").write_text(r'''-- Issue #302: append-only completion/graduation outcome evidence.
CREATE TYPE "StudentCompletionOutcomeType" AS ENUM ('ProgrammeCompleted', 'GraduationAwarded');

CREATE TABLE "StudentCompletionOutcome" (
  "id" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "outcomeType" "StudentCompletionOutcomeType" NOT NULL,
  "outcomeDate" DATE NOT NULL,
  "academicYear" TEXT NOT NULL,
  "awardName" TEXT NOT NULL DEFAULT '',
  "note" TEXT NOT NULL DEFAULT '',
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentCompletionOutcome_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentCompletionOutcome_membershipId_outcomeType_key" ON "StudentCompletionOutcome"("membershipId", "outcomeType");
CREATE INDEX "StudentCompletionOutcome_membershipId_outcomeDate_idx" ON "StudentCompletionOutcome"("membershipId", "outcomeDate");
CREATE INDEX "StudentCompletionOutcome_outcomeType_academicYear_outcomeDate_idx" ON "StudentCompletionOutcome"("outcomeType", "academicYear", "outcomeDate");
ALTER TABLE "StudentCompletionOutcome" ADD CONSTRAINT "StudentCompletionOutcome_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "StudentCohortMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION validate_student_completion_outcome() RETURNS trigger AS $$
DECLARE
  joined_date date;
  completion_date date;
BEGIN
  SELECT "joinedAt" INTO joined_date FROM "StudentCohortMembership" WHERE id = NEW."membershipId";
  IF joined_date IS NULL THEN RAISE EXCEPTION 'Cohort membership not found'; END IF;
  IF NEW."outcomeDate" < joined_date THEN RAISE EXCEPTION 'Completion outcome cannot predate cohort membership'; END IF;
  IF NEW."outcomeType" = 'GraduationAwarded' THEN
    SELECT "outcomeDate" INTO completion_date FROM "StudentCompletionOutcome"
      WHERE "membershipId" = NEW."membershipId" AND "outcomeType" = 'ProgrammeCompleted';
    IF completion_date IS NULL THEN RAISE EXCEPTION 'Graduation award requires a programme completion record'; END IF;
    IF NEW."outcomeDate" < completion_date THEN RAISE EXCEPTION 'Graduation award cannot predate programme completion'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION validate_student_completion_outcome() FROM PUBLIC;

CREATE OR REPLACE FUNCTION prevent_student_completion_outcome_rewrite() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Completion/graduation outcome history is append-only';
END;
$$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prevent_student_completion_outcome_rewrite() FROM PUBLIC;

DO $$ DECLARE api_role text; BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname = ANY (ARRAY['anon','authenticated','service_role']) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.validate_student_completion_outcome() FROM %I', api_role);
    EXECUTE format('REVOKE ALL ON FUNCTION public.prevent_student_completion_outcome_rewrite() FROM %I', api_role);
  END LOOP;
END $$;

CREATE TRIGGER "StudentCompletionOutcome_validate" BEFORE INSERT ON "StudentCompletionOutcome" FOR EACH ROW EXECUTE FUNCTION validate_student_completion_outcome();
CREATE TRIGGER "StudentCompletionOutcome_no_update" BEFORE UPDATE ON "StudentCompletionOutcome" FOR EACH ROW EXECUTE FUNCTION prevent_student_completion_outcome_rewrite();
CREATE TRIGGER "StudentCompletionOutcome_no_delete" BEFORE DELETE ON "StudentCompletionOutcome" FOR EACH ROW EXECUTE FUNCTION prevent_student_completion_outcome_rewrite();

ALTER TABLE "StudentCompletionOutcome" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "StudentCompletionOutcome" FROM PUBLIC;
DO $$ DECLARE api_role text; BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname = ANY (ARRAY['anon','authenticated','service_role']) LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', 'StudentCompletionOutcome', api_role);
  END LOOP;
END $$;
''')

# DB integration tests.
Path("apps/backend/src/plugins/students/completion-outcomes-db.test.ts").write_text(r'''import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { evaluateApplicability } from "../qa/analysis/evidence-semantics.ts";
import { getQaEvidenceCandidates } from "../qa/evidence/service.ts";
import { studentCohortService } from "./cohort-service.ts";

const enabled = process.env.COMPLETION_OUTCOMES_DB_TESTS === "1";
const db = new PrismaClient();
const id = () => crypto.randomUUID();
const ids = { mature: id(), immature: id(), s1: id(), s2: id(), s3: id(), m1: id(), m2: id(), m3: id() };
const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

const rejects = async (fn: () => Promise<unknown>) => {
  let failed = false;
  try { await fn(); } catch { failed = true; }
  expect(failed).toBe(true);
};

describe.skipIf(!enabled)("completion/graduation outcome integrity", () => {
  beforeAll(async () => {
    await db.studentCohort.createMany({ data: [
      { id: ids.mature, programmeId: "dse", code: `I302-M-${ids.mature.slice(0,5)}`, name: "Mature cohort", intakeYear: 2020, expectedGraduationYear: 2024, status: "Completed" },
      { id: ids.immature, programmeId: "dse", code: `I302-I-${ids.immature.slice(0,5)}`, name: "Immature cohort", intakeYear: 2025, expectedGraduationYear: 2029, status: "Active" },
    ] });
    await db.student.createMany({ data: [
      { id: ids.s1, name: "C1", email: `i302-${ids.s1}@example.test`, studentId: `I302-${ids.s1.slice(0,8)}` },
      { id: ids.s2, name: "C2", email: `i302-${ids.s2}@example.test`, studentId: `I302-${ids.s2.slice(0,8)}` },
      { id: ids.s3, name: "C3", email: `i302-${ids.s3}@example.test`, studentId: `I302-${ids.s3.slice(0,8)}` },
    ] });
    await db.studentCohortMembership.createMany({ data: [
      { id: ids.m1, cohortId: ids.mature, studentId: ids.s1, joinedAt: asDate("2020-09-01") },
      { id: ids.m2, cohortId: ids.mature, studentId: ids.s2, joinedAt: asDate("2020-09-01") },
      { id: ids.m3, cohortId: ids.immature, studentId: ids.s3, joinedAt: asDate("2025-09-01") },
    ] });
  });
  afterAll(async () => { await db.$disconnect(); });

  test("maturity is explicit: mature applies, all-immature is not applicable, missing is uncertain", () => {
    const rule = { kind: "cohortMaturity" as const, minimumElapsedYears: 4 };
    expect(evaluateApplicability(rule, { cohortStartDates: [asDate("2020-01-01"), asDate("2025-01-01")], asOfDate: asDate("2026-12-31") }).state).toBe("applicable");
    expect(evaluateApplicability(rule, { cohortStartDates: [asDate("2025-01-01")], asOfDate: asDate("2026-12-31") }).state).toBe("notApplicable");
    expect(evaluateApplicability(rule, { cohortStartDates: [], asOfDate: asDate("2026-12-31") }).state).toBe("uncertain");
  });

  test("records partial completion then graduation without rewriting completion", async () => {
    const completed = await studentCohortService.recordCompletionOutcome(ids.mature, { membershipId: ids.m1, outcomeType: "ProgrammeCompleted", outcomeDate: "2024-06-30", academicYear: "2023-2024", awardName: "", note: "requirements completed" });
    expect(completed.outcomeType).toBe("ProgrammeCompleted");
    let summary = await studentCohortService.completionSummary(ids.mature);
    expect(summary.populationSize).toBe(2);
    expect(summary.completionCount).toBe(1);
    expect(summary.completionRate).toBe(50);
    expect(summary.graduationRate).toBe(0);

    await studentCohortService.recordCompletionOutcome(ids.mature, { membershipId: ids.m1, outcomeType: "GraduationAwarded", outcomeDate: "2024-11-01", academicYear: "2024-2025", awardName: "Bachelor of Engineering in Data Science and Engineering", note: "" });
    summary = await studentCohortService.completionSummary(ids.mature);
    expect(summary.completionCount).toBe(1);
    expect(summary.graduationCount).toBe(1);
    expect(summary.graduationRate).toBe(50);
    expect(await db.studentCompletionOutcome.count({ where: { membershipId: ids.m1 } })).toBe(2);
  });

  test("rejects conflicting duplicate and graduation without completion", async () => {
    await rejects(() => studentCohortService.recordCompletionOutcome(ids.mature, { membershipId: ids.m1, outcomeType: "ProgrammeCompleted", outcomeDate: "2024-07-01", academicYear: "2023-2024", awardName: "", note: "conflict" }));
    await rejects(() => studentCohortService.recordCompletionOutcome(ids.mature, { membershipId: ids.m2, outcomeType: "GraduationAwarded", outcomeDate: "2024-11-01", academicYear: "2024-2025", awardName: "BEng", note: "" }));
    const row = await db.studentCompletionOutcome.findFirstOrThrow({ where: { membershipId: ids.m1, outcomeType: "ProgrammeCompleted" } });
    await rejects(() => Promise.resolve(db.studentCompletionOutcome.update({ where: { id: row.id }, data: { note: "rewrite" } })));
    await rejects(() => Promise.resolve(db.studentCompletionOutcome.delete({ where: { id: row.id } })));
  });

  test("Criterion 8 evidence filters to mature cohort ids with exact official scope", async () => {
    await studentCohortService.recordCompletionOutcome(ids.immature, { membershipId: ids.m3, outcomeType: "ProgrammeCompleted", outcomeDate: "2026-06-30", academicYear: "2025-2026", awardName: "", note: "synthetic early completion" });
    const completion = await getQaEvidenceCandidates("dse", "aun-qa-v4:8.1:research:c8-e02:evidence:1", { cohortIds: [ids.mature] });
    expect(completion.candidates.some((item) => item.scope?.cohortId === ids.immature)).toBe(false);
    const matureCandidate = completion.candidates.find((item) => item.scope?.cohortId === ids.mature);
    expect(matureCandidate?.scope?.population).toBe("cohort-membership");
    expect(matureCandidate?.scope?.academicYear).toBe("2023-2024");
    expect(matureCandidate?.provenance?.authority).toBe("officialInstitutionalRecord");

    const graduation = await getQaEvidenceCandidates("dse", "aun-qa-v4:8.1:research:c8-e02:evidence:2", { cohortIds: [ids.mature] });
    expect(graduation.candidates).toHaveLength(1);
    expect(graduation.candidates[0]?.scope?.cohortId).toBe(ids.mature);
  });
});
''')
