import { describe, expect, test } from "bun:test";
import {
  assertExamVariantRecordedTotal,
  createExamVariantSnapshot,
  resolveExamVariant,
  summarizeExamVariantScores,
  verifyExamVariantSnapshot,
  type ExamVariantSnapshot,
} from "./exam-variant.ts";

const scope = { programmeId: "synthetic-programme", courseSpecId: "spec-1", assessmentItemId: "exam-1" };
const hash = "marking-scheme-v1:" + "a".repeat(64);
function paper(id: string, maxima: number[], revision = 1) {
  return createExamVariantSnapshot({
    ...scope, variantId: id, revision, instrumentId: "instrument-" + id,
    instrumentHash: hash, examMaximum: 100,
    questions: maxima.map((maxPoints, i) => ({
      questionId: "Q" + (i + 1), maxPoints,
      cloCode: i === 0 ? "CLO1" : i === 1 ? "CLO2" : "CLO3",
      evidence: i === 1 ? "supporting" : "direct",
    })),
  });
}
// Synthetic definitions only, not the administered TSA301 exams or their keys.
const variants = [paper("M1-A", [70, 10, 20]), paper("M1-B", [60, 20, 20]),
  paper("M2-A", [50, 10, 40]), paper("M2-B", [50, 15, 35]), paper("M2-C", [40, 20, 40])];
const ref = (v: ExamVariantSnapshot) => ({ variantId: v.variantId, variantHash: v.variantHash });
function fixture(v = variants[0]!) {
  const offeringId = v.variantId.startsWith("M1") ? "offering-M1" : "offering-M2";
  const context = { ...scope, offeringId, enrollmentId: "synthetic-enrollment-" + offeringId,
    examMaximum: 100, activeCloCodes: ["CLO1", "CLO2", "CLO3", "CLO4"] };
  const permissions = variants.map((item) => ({
    ...scope, offeringId: item.variantId.startsWith("M1") ? "offering-M1" : "offering-M2", ...ref(item),
  }));
  const assignment = { ...scope, offeringId, enrollmentId: context.enrollmentId, ...ref(v), confirmed: true as const };
  const submission = { ...scope, offeringId, enrollmentId: context.enrollmentId, ...ref(v),
    marks: v.questions.map((q) => ({ questionId: q.questionId, maxPoints: q.maxPoints, score: q.maxPoints * 0.8 })) };
  return { input: { context, variants, permissions, assignment }, submission };
}

describe("multi-variant exam domain (#1371)", () => {
  test("five synthetic variants use one assessment, one exact paper and its own CLO denominators", () => {
    for (const variant of variants) {
      const { input, submission } = fixture(variant);
      const result = summarizeExamVariantScores(input, submission);
      expect(result.assessmentItemId).toBe(scope.assessmentItemId);
      expect(result.variantHash).toBe(variant.variantHash);
      expect(result.instrumentId).toBe(variant.instrumentId);
      expect(result.maximumPoints).toBe(100);
      expect(result.earnedPoints).toBeCloseTo(80, 10);
      expect(result.cloEvidence.map((e) => e.maximumPoints)).toEqual(variant.questions.map((q) => q.maxPoints));
      expect(result.cloEvidence.map((e) => e.percentage)).toEqual([80, 80, 80]);
      expect(result.cloEvidence.some((e) => e.cloCode === "CLO4")).toBe(false);
    }
  });

  test("snapshot is canonical, immutable and detached from input; tampering fails", () => {
    const { variantHash, ...definition } = variants[0]!;
    const mutable = JSON.parse(JSON.stringify(definition));
    const snapshot = createExamVariantSnapshot(mutable);
    expect(snapshot.variantHash).toBe(variantHash);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.questions)).toBe(true);
    expect(Object.isFrozen(snapshot.questions[0])).toBe(true);
    mutable.questions[0].evidence = "supporting";
    expect(snapshot.questions[0]!.evidence).toBe("direct");
    expect(() => verifyExamVariantSnapshot({ ...mutable, variantHash })).toThrow(/integrity/);
    expect(verifyExamVariantSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  });

  test("definition rejects duplicate IDs, mismatched maxima, invalid marks and extra fields", () => {
    const { variantHash: _hash, ...definition } = variants[0]!;
    expect(() => createExamVariantSnapshot({ ...definition, questions: [definition.questions[0], definition.questions[0]] })).toThrow(/Duplicate/);
    expect(() => createExamVariantSnapshot({ ...definition, examMaximum: 101 })).toThrow(/maxima/);
    for (const maxPoints of [0, -1, NaN, Infinity]) {
      expect(() => createExamVariantSnapshot({ ...definition, questions: [{ ...definition.questions[0], maxPoints }] })).toThrow();
    }
    expect(() => createExamVariantSnapshot({ ...definition, answerKey: "not allowed" })).toThrow();
    expect(() => createExamVariantSnapshot({ ...definition, instrumentHash: "legacy-rubric" })).toThrow();
  });

  test("unconfirmed, missing, cross-enrollment, cross-offering and cross-assessment assignments are rejected", () => {
    const { input } = fixture();
    for (const assignment of [null, { ...input.assignment, confirmed: false },
      { ...input.assignment, enrollmentId: "different" }, { ...input.assignment, offeringId: "offering-M2" },
      { ...input.assignment, assessmentItemId: "other" }, { ...input.assignment, courseSpecId: "other" },
      { ...input.assignment, programmeId: "other" }]) {
      expect(() => resolveExamVariant({ ...input, assignment })).toThrow();
    }
  });

  test("old assignment resolves its exact snapshot, never the latest revision", () => {
    const { input } = fixture();
    const newer = paper("M1-A", [60, 10, 30], 2);
    expect(resolveExamVariant({ ...input, variants: [...variants, newer] }).variantHash).toBe(input.assignment.variantHash);
    expect(() => resolveExamVariant({ ...input, variants: [newer] })).toThrow(/not found/);
    expect(() => resolveExamVariant({ ...input, variants: [...variants, variants[0]] })).toThrow(/Duplicate/);
    const conflicting = paper("M1-A", [60, 10, 30], 1);
    expect(() => resolveExamVariant({ ...input, variants: [...variants, conflicting] })).toThrow(/Duplicate/);
  });

  test("requires exact permitted section/version, common maximum, and active CLOs", () => {
    const { input } = fixture();
    expect(() => resolveExamVariant({ ...input, permissions: [] })).toThrow(/permitted/);
    expect(() => resolveExamVariant({ ...input, permissions: [...input.permissions, input.permissions[0]] })).toThrow(/permitted/);
    const wrongSection = { ...input.assignment, ...ref(variants[2]!) };
    expect(() => resolveExamVariant({ ...input, assignment: wrongSection })).toThrow(/permitted/);
    expect(() => resolveExamVariant({ ...input, context: { ...input.context, examMaximum: 50 } })).toThrow(/maximum/);
    expect(() => resolveExamVariant({ ...input, context: { ...input.context, activeCloCodes: ["CLO1"] } })).toThrow(/inactive/);
    expect(() => resolveExamVariant({ ...input, context: { ...input.context, activeCloCodes: ["CLO1", "CLO1"] } })).toThrow(/Duplicate active/);
  });

  test("zero is marked, omitted and explicit null are incomplete; no partial evidence", () => {
    const { input, submission } = fixture();
    const partial = summarizeExamVariantScores(input, { ...submission, marks: [
      { ...submission.marks[0], score: 0 }, { ...submission.marks[1], score: null },
    ] });
    expect(partial.rows.map((r) => r.score)).toEqual([0, null, null]);
    expect(partial.complete).toBe(false);
    expect(partial.earnedPoints).toBeNull();
    expect(partial.cloEvidence).toEqual([]);
    const zero = summarizeExamVariantScores(input, { ...submission, marks: submission.marks.map((m) => ({ ...m, score: 0 })) });
    expect(zero.complete).toBe(true);
    expect(zero.earnedPoints).toBe(0);
    expect(zero.cloEvidence.map((e) => e.percentage)).toEqual([0, 0, 0]);
  });

  test("rejects duplicate, unknown, wrong-max and non-finite/out-of-range marks", () => {
    const { input, submission } = fixture();
    const first = submission.marks[0]!;
    for (const mark of [{ ...first, questionId: "unknown" }, { ...first, maxPoints: first.maxPoints + 1 },
      { ...first, score: first.maxPoints + 1 }, { ...first, score: -1 }, { ...first, score: Infinity },
      { ...first, score: NaN }, { ...first, score: "10" }]) {
      expect(() => summarizeExamVariantScores(input, { ...submission, marks: [mark] })).toThrow();
    }
    expect(() => summarizeExamVariantScores(input, { ...submission, marks: [first, first] })).toThrow(/Duplicate/);
  });

  test("score envelope is bound to the exact enrollment and version even with colliding question labels", () => {
    const { input, submission } = fixture();
    for (const wrong of [{ ...submission, enrollmentId: "different" }, { ...submission, offeringId: "offering-M2" },
      { ...submission, assessmentItemId: "other" }, { ...submission, ...ref(variants[1]!) }]) {
      expect(() => summarizeExamVariantScores(input, wrong)).toThrow(/scope or version/);
    }
  });

  test("direct and supporting marks for the same CLO remain separate denominators", () => {
    const { input, submission } = fixture();
    const { variantHash: _hash, ...definition } = variants[0]!;
    const v = createExamVariantSnapshot({ ...definition, questions: definition.questions.map((q, i) =>
      i === 1 ? { ...q, cloCode: "CLO1" } : q) });
    const result = summarizeExamVariantScores({
      ...input, variants: [v], assignment: { ...input.assignment, ...ref(v) },
      permissions: [{ ...input.permissions[0], ...ref(v) }],
    }, { ...submission, ...ref(v), marks: submission.marks.map((m, i) => ({ ...m, score: i === 1 ? 0 : m.maxPoints })) });
    expect(result.cloEvidence.filter((e) => e.cloCode === "CLO1").map((e) => [e.evidence, e.percentage, e.maximumPoints])).toEqual([
      ["direct", 100, 70], ["supporting", 0, 10],
    ]);
    expect(result.earnedPoints).toBe(90);
  });

  test("historical total guard accepts matching complete evidence only, without mutating inputs", () => {
    const { input, submission } = fixture();
    const before = JSON.stringify({ input, submission });
    const result = summarizeExamVariantScores(input, submission);
    assertExamVariantRecordedTotal(result, { score: 80, maxScore: 100 });
    expect(() => assertExamVariantRecordedTotal(result, { score: 79, maxScore: 100 })).toThrow(/reconcile/);
    expect(() => assertExamVariantRecordedTotal(result, { score: 80, maxScore: 90 })).toThrow(/reconcile/);
    const incomplete = summarizeExamVariantScores(input, { ...submission, marks: [] });
    expect(() => assertExamVariantRecordedTotal(incomplete, { score: 80, maxScore: 100 })).toThrow(/reconcile/);
    expect(JSON.stringify({ input, submission })).toBe(before);
  });
});
