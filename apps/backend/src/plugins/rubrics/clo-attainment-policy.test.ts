import { describe, expect, test } from "bun:test";
import type { AuthUser, Role } from "../../core/auth/token.ts";
import {
  bindCandidatePolicy, candidateStudentAttained, candidateDirectLevel,
  candidateIndirectScore, candidatePopulation, previewCandidateOverall,
} from "./clo-attainment-policy.ts";

function actor(role: Role = "program_coordinator", programmeId: string | null = "dse"): AuthUser {
  return { id: "synthetic", email: "synthetic@example.invalid", roles: [role], programmeRoles: [{ role, programmeId }] };
}
const reference = {
  id: "synthetic-revision-1", programmeId: "dse", topic: "obe", revision: 1,
  status: "verified", classification: "internal_staff", version: "synthetic-v1",
  locator: "Synthetic locator", verifiedAt: new Date("2026-01-01T00:00:00Z"),
};
const bind = (band: "candidate-a" | "candidate-b") => bindCandidatePolicy(actor(), "dse", reference, band);

describe("candidate CLO policy foundation (governance #1384)", () => {
  test("binds exact immutable register revision but never enables an official policy", () => {
    const a = bind("candidate-a");
    expect(a).toMatchObject({referenceId: reference.id, referenceRevision: 1, status: "candidate",
      activationAllowed: false, individualThreshold: 60, directWeight: 0.8, indirectWeight: 0.2,
      overallTarget: 2, courseTargetPercentage: 75});
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.lowerBounds)).toBe(true);
    expect(bindCandidatePolicy(actor(), "dse", {...reference, id: "next", revision: 2}, "candidate-a").referenceId).toBe("next");
    expect(a.referenceId).toBe(reference.id);
  });
  test("fails closed for invalid or unauthorized policy sources", () => {
    for (const role of ["student", "lecturer", "program_secretary", "qa_reviewer"] as const)
      expect(() => bindCandidatePolicy(actor(role), "dse", reference, "candidate-a")).toThrow();
    expect(() => bindCandidatePolicy(actor("program_coordinator", "other"), "dse", reference, "candidate-a")).toThrow();
    for (const invalid of [
      {...reference, programmeId: "other"}, {...reference, status: "pending"}, {...reference, status: "archived"},
      {...reference, topic: "ai"}, {...reference, classification: "public"}, {...reference, verifiedAt: null},
      {...reference, revision: 0}, {...reference, version: null}, {...reference, locator: null},
    ]) expect(() => bindCandidatePolicy(actor(), "dse", invalid, "candidate-a")).toThrow();
  });
  test("individual threshold, zero, unknown and invalid inputs", () => {
    expect(candidateStudentAttained(59.999)).toBe(false);
    expect(candidateStudentAttained(60)).toBe(true);
    expect(candidateStudentAttained(0)).toBe(false);
    expect(candidateStudentAttained(null)).toBeNull();
    for (const value of [-1, 101, NaN, Infinity])
      expect(() => candidateStudentAttained(value)).toThrow();
  });
  test("candidate A exact boundaries", () => {
    for (const [rate, level] of [[0,0],[39.999,0],[40,1],[49.999,1],[50,2],[69.999,2],[70,3],[100,3]] as const)
      expect(candidateDirectLevel(rate, "candidate-a")).toBe(level);
  });
  test("candidate B exact boundaries", () => {
    for (const [rate, level] of [[0,0],[59.999,0],[60,1],[69.999,1],[70,2],[79.999,2],[80,3],[100,3]] as const)
      expect(candidateDirectLevel(rate, "candidate-b")).toBe(level);
    expect(candidateDirectLevel(null, "candidate-b")).toBeNull();
    expect(() => candidateDirectLevel(101, "candidate-b")).toThrow();
    expect(() => candidateDirectLevel(75, "invalid" as "candidate-b")).toThrow();
  });
  test("survey normalization and weighted preview arithmetic, no premature rounding", () => {
    expect(candidateIndirectScore(1)).toBeCloseTo(0.6);
    expect(candidateIndirectScore(5)).toBe(3);
    expect(candidateIndirectScore(4.2)).toBeCloseTo(2.52);
    expect(() => candidateIndirectScore(0)).toThrow();
    expect(() => candidateIndirectScore(NaN)).toThrow();
    const a = previewCandidateOverall(bind("candidate-a"), 75, 4.2);
    const b = previewCandidateOverall(bind("candidate-b"), 75, 4.2);
    expect(a.overall).toBeCloseTo(2.904);
    expect(b.overall).toBeCloseTo(2.104);
    expect(a.official).toBe(false);
    expect(b.targetMet).toBe(true);
  });
  test("worked-example-shaped numeric regression: same arithmetic, divergent level policies", () => {
    // Synthetic scenarios exercising the handbook's combination rule without
    // treating the worked example's inconsistent band labels as normative.
    const cases = [
      {rate: 86, mean: 4.2, a: 2.904, b: 2.904},
      {rate: 77, mean: 3.9, a: 2.868, b: 2.068},
      {rate: 69.8, mean: 3.7, a: 2.044, b: 1.244},
      {rate: 61, mean: 3.2, a: 1.984, b: 1.184},
    ];
    for (const c of cases) {
      expect(previewCandidateOverall(bind("candidate-a"), c.rate, c.mean).overall).toBeCloseTo(c.a);
      expect(previewCandidateOverall(bind("candidate-b"), c.rate, c.mean).overall).toBeCloseTo(c.b);
    }
    // Independent weighted formula, conditional on a supplied direct level.
    expect((3 * 80 + 2.52 * 20) / 100).toBeCloseTo(2.904);
    expect((3 * 80 + 2.34 * 20) / 100).toBeCloseTo(2.868);
    expect((2 * 80 + 2.22 * 20) / 100).toBeCloseTo(2.044);
    expect((1 * 80 + 1.92 * 20) / 100).toBeCloseTo(1.184);
  });
  test("missing direct or indirect evidence is not zero or silently reweighted", () => {
    for (const result of [
      previewCandidateOverall(bind("candidate-a"), null, 4),
      previewCandidateOverall(bind("candidate-a"), 80, null),
      previewCandidateOverall(bind("candidate-a"), null, null),
    ]) {
      expect(result.overall).toBeNull();
      expect(result.targetMet).toBeNull();
    }
    expect(previewCandidateOverall(bind("candidate-a"), 0, 1).overall).toBeCloseTo(0.12);
    expect(previewCandidateOverall(bind("candidate-a"), 70, 1).targetMet).toBe(true);
    expect(previewCandidateOverall(bind("candidate-a"), 50, 2).targetMet).toBe(false);
  });
  test("snapshot count adapter preserves population and never assumes a missing mark is zero", () => {
    const partial = candidatePopulation({populationSize:40, studentCount:35, achievedCount:30});
    expect(partial.measuredRate).toBeCloseTo(85.7142857);
    expect(partial.coverage).toBe(87.5);
    expect(partial.missingCount).toBe(5);
    expect(partial.completePopulationRate).toBeNull();
    expect(candidatePopulation({populationSize:40,studentCount:40,achievedCount:30}).completePopulationRate).toBe(75);
    expect(candidatePopulation({populationSize:0,studentCount:0,achievedCount:0}).measuredRate).toBeNull();
    expect(() => candidatePopulation({populationSize:4,studentCount:5,achievedCount:2})).toThrow();
    expect(() => candidatePopulation({populationSize:4,studentCount:3,achievedCount:4})).toThrow();
  });
});
