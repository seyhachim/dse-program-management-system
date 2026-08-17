import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { getQaEvidenceCandidates } from "../qa/evidence/service.ts";

const enabled = process.env.COHORT_PROGRESSION_DB_TESTS === "1";
const db = new PrismaClient();
const ids = {
  student: crypto.randomUUID(),
  cohort1: crypto.randomUUID(),
  cohort2: crypto.randomUUID(),
  membership1: crypto.randomUUID(),
  membership2: crypto.randomUUID(),
};

const execute = <T>(query: PromiseLike<T>): Promise<T> => Promise.resolve(query);

describe.skipIf(!enabled)("cohort progression database integrity", () => {
  beforeAll(async () => {
    await db.student.create({
      data: {
        id: ids.student,
        name: "Issue 301 Student",
        email: `issue301-${ids.student}@example.test`,
        studentId: `I301-${ids.student.slice(0, 8)}`,
      },
    });
    await db.studentCohort.create({
      data: {
        id: ids.cohort1,
        programmeId: "dse",
        code: `I301-A-${ids.cohort1.slice(0, 6)}`,
        name: "Issue 301 cohort A",
        intakeYear: 2026,
        expectedGraduationYear: 2030,
      },
    });
    await db.studentCohort.create({
      data: {
        id: ids.cohort2,
        programmeId: "dse",
        code: `I301-B-${ids.cohort2.slice(0, 6)}`,
        name: "Issue 301 cohort B",
        intakeYear: 2027,
        expectedGraduationYear: 2031,
      },
    });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  test("preserves multi-period history and supports transfer between non-overlapping cohorts", async () => {
    await db.studentCohortMembership.create({
      data: {
        id: ids.membership1,
        cohortId: ids.cohort1,
        studentId: ids.student,
        joinedAt: new Date("2026-09-01"),
      },
    });
    const first = await db.studentProgressionRecord.create({
      data: {
        membershipId: ids.membership1,
        academicYear: "2026-2027",
        term: "Semester 1",
        periodStart: new Date("2026-09-01"),
        periodEnd: new Date("2027-01-31"),
        status: "Progressed",
      },
    });
    await db.studentProgressionRecord.create({
      data: {
        membershipId: ids.membership1,
        academicYear: "2026-2027",
        term: "Semester 2",
        periodStart: new Date("2027-02-01"),
        periodEnd: new Date("2027-06-30"),
        status: "Retained",
      },
    });
    await db.studentCohortMembership.update({
      where: { id: ids.membership1 },
      data: { exitedAt: new Date("2027-06-30"), exitReason: "Transferred" },
    });
    await db.studentCohortMembership.create({
      data: {
        id: ids.membership2,
        cohortId: ids.cohort2,
        studentId: ids.student,
        joinedAt: new Date("2027-07-01"),
      },
    });

    expect(await db.studentProgressionRecord.count({ where: { membershipId: ids.membership1 } })).toBe(2);
    expect(await db.studentProgressionRecord.count({ where: { membershipId: ids.membership2 } })).toBe(0);
    expect((await db.studentProgressionRecord.findUniqueOrThrow({ where: { id: first.id } })).status).toBe(
      "Progressed",
    );
  });

  test("rejects overlapping membership and duplicate academic period", async () => {
    await expect(
      execute(
        db.studentCohortMembership.create({
          data: { cohortId: ids.cohort1, studentId: ids.student, joinedAt: new Date("2027-05-01") },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      execute(
        db.studentProgressionRecord.create({
          data: {
            membershipId: ids.membership1,
            academicYear: "2026-2027",
            term: "Semester 1",
            periodStart: new Date("2026-09-01"),
            periodEnd: new Date("2027-01-31"),
            status: "Withdrawn",
          },
        }),
      ),
    ).rejects.toThrow();
  });

  test("rejects progression outside membership window and direct history rewrite", async () => {
    await expect(
      execute(
        db.studentProgressionRecord.create({
          data: {
            membershipId: ids.membership2,
            academicYear: "2027-2028",
            term: "Semester 0",
            periodStart: new Date("2027-06-01"),
            periodEnd: new Date("2027-06-30"),
            status: "Transferred",
          },
        }),
      ),
    ).rejects.toThrow();
    const row = await db.studentProgressionRecord.findFirstOrThrow({ where: { membershipId: ids.membership1 } });
    await expect(
      execute(db.studentProgressionRecord.update({ where: { id: row.id }, data: { status: "Graduated" } })),
    ).rejects.toThrow();
    await expect(execute(db.studentProgressionRecord.delete({ where: { id: row.id } }))).rejects.toThrow();
  });

  test("QA retrieval exposes exact cohort/time scope and institutional provenance", async () => {
    const membership = await getQaEvidenceCandidates("dse", "aun-qa-v4:8.1:research:c8-e01:evidence:1");
    const membershipCandidate = membership.candidates.find((item) => item.attributes.studentId === ids.student);
    expect(membershipCandidate?.scope?.cohortId).toBe(ids.cohort1);
    expect(membershipCandidate?.provenance?.authority).toBe("officialInstitutionalRecord");

    const progression = await getQaEvidenceCandidates("dse", "aun-qa-v4:8.1:research:c8-e01:evidence:2");
    const rows = progression.candidates.filter((item) => item.attributes.studentId === ids.student);
    expect(rows.length).toBe(2);
    expect(rows[0]?.scope?.academicYear).toBe("2026-2027");
    expect(rows[0]?.periodKey).toContain("2026-2027");
    expect(rows[0]?.provenance?.authority).toBe("officialInstitutionalRecord");
  });
});
