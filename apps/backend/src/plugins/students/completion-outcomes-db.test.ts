import { afterAll, beforeAll, describe, expect, test } from "bun:test";
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
