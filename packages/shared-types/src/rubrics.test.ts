import { expect, test } from "bun:test";
import { PublicRubricSchema, RubricSchema } from "./rubrics.ts";

const activeRubric = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Final Project Rubric",
  type: "Project" as const,
  description: "Published project assessment rubric",
  levels: [
    { label: "Excellent", points: 4 },
    { label: "Good", points: 3 },
  ],
  criteria: [
    {
      id: "criterion-1",
      name: "Technical quality",
      descriptors: ["Strong implementation", "Mostly correct implementation"],
    },
  ],
  status: "Active" as const,
};

test("public rubric contract accepts published rubric content", () => {
  expect(PublicRubricSchema.parse(activeRubric)).toEqual(activeRubric);
});

test("authenticated rubric contract accepts assessment usage metadata", () => {
  expect(RubricSchema.parse({
    ...activeRubric,
    owner: { id: "internal-user", name: "Lecturer" },
    assessmentUsageCount: 2,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
  }).assessmentUsageCount).toBe(2);
});

test("public rubric contract rejects non-published statuses", () => {
  expect(() => PublicRubricSchema.parse({ ...activeRubric, status: "Draft" })).toThrow();
  expect(() => PublicRubricSchema.parse({ ...activeRubric, status: "Archived" })).toThrow();
});

test("public rubric contract strips management-only fields", () => {
  const parsed = PublicRubricSchema.parse({
    ...activeRubric,
    owner: { id: "internal-user", name: "Lecturer" },
    assessmentUsageCount: 3,
    createdAt: "2026-08-15T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
  });

  expect("owner" in parsed).toBe(false);
  expect("assessmentUsageCount" in parsed).toBe(false);
  expect("createdAt" in parsed).toBe(false);
  expect("updatedAt" in parsed).toBe(false);
});
