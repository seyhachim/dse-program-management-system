import { describe, expect, test } from "bun:test";
import type { AuthUser, Role } from "../../../core/auth/token.ts";
import { evidenceAccess, evidenceSourceHash, isSupportedWorkReference, transitionEvidence } from "./assessment-evidence-policy.ts";

function actor(role: Role, programmeId: string | null = "p1"): AuthUser {
  return { id: "actor", email: "synthetic@example.invalid", roles: [role], programmeRoles: [{ role, programmeId }] };
}
describe("assessment evidence authorization", () => {
  test("only assigned programme lecturer contributes; programme leadership reviews", () => {
    expect(evidenceAccess(actor("lecturer"), "p1", ["actor"])).toEqual({ read: true, contribute: true, review: false });
    expect(evidenceAccess(actor("lecturer"), "p1", ["other"])).toEqual({ read: false, contribute: false, review: false });
    expect(evidenceAccess(actor("program_coordinator"), "p1", [])).toEqual({ read: true, contribute: false, review: true });
  });
  test("denies cross-programme, students, guardians, secretaries and generic QA roles", () => {
    for (const role of ["student", "guardian", "program_secretary", "qa_contributor", "qa_reviewer"] as const)
      expect(evidenceAccess(actor(role), "p1", ["actor"]).read).toBe(false);
    expect(evidenceAccess(actor("lecturer", "p2"), "p1", ["actor"]).read).toBe(false);
    expect(evidenceAccess(actor("program_coordinator", "p2"), "p1", []).read).toBe(false);
    expect(evidenceAccess(actor("admin", null), "p1", []).review).toBe(true);
  });
});
describe("assessment evidence transitions", () => {
  const draft = { status: "draft", sourceHash: "a" };
  const submitted = { status: "submitted", sourceHash: "a" };
  test("creates, submits, reviews, requests changes and revises", () => {
    expect(transitionEvidence(null, "create", "a", false, true, false)).toBe("draft");
    expect(transitionEvidence(draft, "submit", "a", false, true, true)).toBe("submitted");
    expect(transitionEvidence(submitted, "verify", "a", true, false, true)).toBe("verified");
    expect(transitionEvidence(submitted, "request_changes", "a", true, false, true)).toBe("changes_requested");
    expect(transitionEvidence({ status: "verified", sourceHash: "a" }, "revise", "b", false, true, true)).toBe("draft");
  });
  test("fails closed for missing work, stale source, wrong state and wrong actor", () => {
    expect(transitionEvidence(draft, "submit", "a", false, true, false)).toBeNull();
    expect(transitionEvidence(draft, "submit", "b", false, true, true)).toBeNull();
    expect(transitionEvidence(submitted, "verify", "b", true, false, true)).toBeNull();
    expect(transitionEvidence(submitted, "verify", "a", false, true, true)).toBeNull();
    expect(transitionEvidence(draft, "verify", "a", true, false, true)).toBeNull();
    expect(transitionEvidence(null, "create", "a", true, false, true)).toBeNull();
    expect(transitionEvidence(submitted, "revise", "a", true, false, true)).toBeNull();
  });
  test("corrections and item-level changes alter provenance even when total is unchanged", () => {
    expect(evidenceSourceHash({ score: 10, correctionIds: [] })).not.toBe(evidenceSourceHash({ score: 10, correctionIds: ["synthetic"] }));
    expect(evidenceSourceHash({ score: 10, criterionScores: [4, 6] })).not.toBe(evidenceSourceHash({ score: 10, criterionScores: [6, 4] }));
  });
});
describe("restricted work-reference shape", () => {
  test("supports credential-free Drive, Docs and Colab document URLs", () => {
    expect(isSupportedWorkReference("https://drive.google.com/file/d/synthetic-id/view")).toBe(true);
    expect(isSupportedWorkReference("https://docs.google.com/document/d/synthetic-id/edit")).toBe(true);
    expect(isSupportedWorkReference("https://colab.research.google.com/drive/synthetic-id")).toBe(true);
  });
  test("rejects arbitrary hosts, share tokens, credentials and non-document URLs", () => {
    for (const url of [
      "http://drive.google.com/file/d/id/view", "https://drive.google.com.evil.invalid/file/d/id/view",
      "https://a:b@drive.google.com/file/d/id/view", "https://drive.google.com/file/d/id/view?token=secret",
      "https://drive.google.com/file/d/id/view#secret", "https://drive.google.com/drive/folders/id",
      "https://drive.google.com:444/file/d/id/view", "javascript:alert(1)", "https://127.0.0.1/file/d/id/view",
    ]) expect(isSupportedWorkReference(url)).toBe(false);
  });
});
