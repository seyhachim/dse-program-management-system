import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { generateCloAttainmentSnapshots } from "./clo-attainment.ts";
import { getQaEvidenceCandidates } from "./service.ts";

const enabled = process.env.CLO_ATTAINMENT_DB_TESTS === "1";
const db = new PrismaClient();
const id = () => crypto.randomUUID();
const ids = { course: id(), spec1: id(), spec2: id(), clo1: id(), clo2: id(), assessment1: id(), assessment2: id(), assessment3: id(), offering1: id(), offering2: id(), student1: id(), student2: id(), enrollment1: id(), enrollment2: id() };

describe.skipIf(!enabled)("CLO attainment snapshot integrity", () => {
  beforeAll(async () => {
    await db.course.create({ data: { id: ids.course, code: `I303-${ids.course.slice(0, 6)}`, title: "Issue 303", programmeId: "dse" } });
    await db.courseSpec.create({ data: { id: ids.spec1, courseId: ids.course, versionMajor: 1, versionMinor: 0, revisionTriggers: [], reviewStatus: "Approved" } });
    await db.courseSpec.create({ data: { id: ids.spec2, courseId: ids.course, versionMajor: 1, versionMinor: 1, revisionTriggers: [], reviewStatus: "Approved" } });
    await db.courseSpecClo.create({ data: { id: ids.clo1, courseSpecId: ids.spec1, order: 0, description: "CLO one" } });
    await db.courseSpecClo.create({ data: { id: ids.clo2, courseSpecId: ids.spec2, order: 0, description: "CLO one revised" } });
    await db.courseSpecAssessmentItem.create({ data: { id: ids.assessment1, courseSpecId: ids.spec1, order: 0, name: "A1", type: "Exam", cloCodes: ["CLO1"] } });
    await db.courseSpecAssessmentItem.create({ data: { id: ids.assessment2, courseSpecId: ids.spec1, order: 1, name: "A2", type: "Project", cloCodes: ["CLO1"] } });
    await db.courseSpecAssessmentItem.create({ data: { id: ids.assessment3, courseSpecId: ids.spec2, order: 0, name: "A1 revised", type: "Exam", cloCodes: ["CLO1"] } });
    await db.offering.create({ data: { id: ids.offering1, courseId: ids.course, courseSpecId: ids.spec1, term: "2026-S1", sectionCode: "A" } });
    await db.offering.create({ data: { id: ids.offering2, courseId: ids.course, courseSpecId: ids.spec2, term: "2027-S1", sectionCode: "B" } });
    await db.student.create({ data: { id: ids.student1, name: "S1", email: `i303-${ids.student1}@example.test`, studentId: `I303-${ids.student1.slice(0,8)}` } });
    await db.student.create({ data: { id: ids.student2, name: "S2", email: `i303-${ids.student2}@example.test`, studentId: `I303-${ids.student2.slice(0,8)}` } });
    await db.enrollment.create({ data: { id: ids.enrollment1, offeringId: ids.offering1, studentId: ids.student1 } });
    await db.enrollment.create({ data: { id: ids.enrollment2, offeringId: ids.offering1, studentId: ids.student2 } });
    const now = new Date();
    await db.assessmentResult.createMany({ data: [
      { enrollmentId: ids.enrollment1, courseSpecId: ids.spec1, assessmentItemId: ids.assessment1, score: 80, maxScore: 100, finalizedAt: now },
      { enrollmentId: ids.enrollment1, courseSpecId: ids.spec1, assessmentItemId: ids.assessment2, score: 60, maxScore: 100, finalizedAt: now },
      { enrollmentId: ids.enrollment2, courseSpecId: ids.spec1, assessmentItemId: ids.assessment1, score: 50, maxScore: 100, finalizedAt: now },
      { enrollmentId: ids.enrollment2, courseSpecId: ids.spec1, assessmentItemId: ids.assessment2, score: 60, maxScore: 100, finalizedAt: now },
    ] });
  });
  afterAll(async () => { await db.$disconnect(); });

  test("creates deterministic exact-input snapshot and reuses identical calculation", async () => {
    const first = await generateCloAttainmentSnapshots({ programmeId: "dse", offeringId: ids.offering1, thresholdPercentage: 70 });
    expect(first).toHaveLength(1);
    expect(first[0]?.studentCount).toBe(2);
    expect(first[0]?.achievedCount).toBe(1);
    expect(first[0]?.achievedRate).toBe(50);
    expect(first[0]?.sourceAssessmentResultIds).toHaveLength(4);
    const again = await generateCloAttainmentSnapshots({ programmeId: "dse", offeringId: ids.offering1, thresholdPercentage: 70 });
    expect(again[0]?.id).toBe(first[0]?.id);
    expect(await db.qaCloAttainmentSnapshot.count({ where: { offeringId: ids.offering1, calculationVersion: "clo-attainment-v1" } })).toBe(1);
  });

  test("threshold and calculation version changes append new immutable snapshots", async () => {
    const original = await db.qaCloAttainmentSnapshot.findFirstOrThrow({ where: { offeringId: ids.offering1, calculationVersion: "clo-attainment-v1" }, orderBy: { generatedAt: "asc" } });
    const changed = await generateCloAttainmentSnapshots({ programmeId: "dse", offeringId: ids.offering1, thresholdPercentage: 75 });
    expect(changed[0]?.id).not.toBe(original.id);
    expect(changed[0]?.supersedesSnapshotId).toBe(original.id);
    const v2 = await generateCloAttainmentSnapshots({ programmeId: "dse", offeringId: ids.offering1, thresholdPercentage: 75, calculationVersion: "clo-attainment-v2" });
    expect(v2[0]?.calculationVersion).toBe("clo-attainment-v2");
    await expect(Promise.resolve(db.qaCloAttainmentSnapshot.update({ where: { id: original.id }, data: { achievedCount: 0 } }))).rejects.toThrow();
    await expect(Promise.resolve(db.qaCloAttainmentSnapshot.delete({ where: { id: original.id } }))).rejects.toThrow();
  });

  test("keeps CourseSpec versions distinct and handles an empty population", async () => {
    const snapshots = await generateCloAttainmentSnapshots({ programmeId: "dse", offeringId: ids.offering2 });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.courseSpecId).toBe(ids.spec2);
    expect(snapshots[0]?.cloId).toBe(ids.clo2);
    expect(snapshots[0]?.populationSize).toBe(0);
    expect(snapshots[0]?.studentCount).toBe(0);
    expect(snapshots[0]?.achievedRate).toBeNull();
  });

  test("Criterion 4 retrieval exposes exact version/offering scope and calculation lineage", async () => {
    const evidence = await getQaEvidenceCandidates("dse", "aun-qa-v4:4.5:research:c4-e05:evidence:3");
    const candidate = evidence.candidates.find((item) => item.attributes.offeringId === ids.offering1);
    expect(candidate?.scope?.courseSpecVersionId).toBe(ids.spec1);
    expect(candidate?.scope?.offeringId).toBe(ids.offering1);
    expect(candidate?.scope?.population).toBe("enrolled-students");
    expect(candidate?.periodKey).toBe("2026-S1");
    expect(candidate?.provenance?.authority).toBe("controlledInternalRecord");
    expect(candidate?.attributes.calculationHash).toBeTruthy();
  });
});
