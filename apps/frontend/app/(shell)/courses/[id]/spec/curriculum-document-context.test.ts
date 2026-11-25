import { expect, test } from "bun:test";
import type { CurriculumCourseSpecBindings } from "@dse-pms/shared-types";
import { resolveBoundDocumentCode } from "./curriculum-document-context";

const context = { courseId: "course-g6", versionId: "spec-g6", curriculumVersionId: "g6", placementId: "placement-g6" };
const bindings: CurriculumCourseSpecBindings = {
  curriculumId: "curriculum", versionId: "g6", versionStatus: "Approved", activationReady: true, missingBindingCount: 0,
  bindings: [{ placementId: "placement-g6", courseId: "course-g6", courseCode: "AAI302", courseTitle: "Agentic AI Development",
    linkedVersion: { id: "spec-g6", courseId: "course-g6", versionMajor: 1, versionMinor: 0, version: "1.0", approvedAt: null, effectiveFrom: null },
    eligibleVersions: [{ id: "spec-g6", courseId: "course-g6", versionMajor: 1, versionMinor: 0, version: "1.0", approvedAt: null, effectiveFrom: null }] }],
};
test("exact approved curriculum context resolves the official document code", () => {
  expect(resolveBoundDocumentCode(bindings, context)).toBe("AAI302");
});
test("rejects Draft, wrong generation, wrong course, wrong placement and wrong specification", () => {
  expect(() => resolveBoundDocumentCode({ ...bindings, versionStatus: "Draft" }, context)).toThrow();
  expect(() => resolveBoundDocumentCode({ ...bindings, bindings: bindings.bindings.map((row) => ({ ...row, eligibleVersions: [] })) }, context)).toThrow();
  for (const bad of [{ curriculumVersionId: "g5" }, { courseId: "course-g5" }, { placementId: "other" }, { versionId: "spec-g5" }]) {
    expect(() => resolveBoundDocumentCode(bindings, { ...context, ...bad })).toThrow();
  }
});
