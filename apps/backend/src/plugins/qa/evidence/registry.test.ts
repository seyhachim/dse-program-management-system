import { expect, test } from "bun:test";
import { evidenceTypeSupportReason } from "./registry.ts";

test("registry distinguishes deterministic sources from deferred document sources", () => {
  expect(
    evidenceTypeSupportReason({
      id: "e1",
      evidenceType: "clo-plo-mappings",
      sourceDomain: "courseSpec",
    }),
  ).toContain("Deterministic retrieval");

  expect(
    evidenceTypeSupportReason({
      id: "e2",
      evidenceType: "supporting-cv",
      sourceDomain: "document",
    }),
  ).toContain("#189");
});

test("registry does not pretend CLO achievement is already a persisted source", () => {
  expect(
    evidenceTypeSupportReason({
      id: "e3",
      evidenceType: "clo-achievement",
      sourceDomain: "assessment",
    }),
  ).toContain("does not yet persist");
});

test("registry refuses unsafe programme-scoped rubric retrieval", () => {
  expect(
    evidenceTypeSupportReason({
      id: "e4",
      evidenceType: "rubrics",
      sourceDomain: "assessment",
    }),
  ).toContain("no stable programme/course/assessment foreign key");
});
