import { expect, test } from "bun:test";
import type { MeResponse, Rubric } from "@dse-pms/shared-types";
import {
  canArchiveRubric,
  canDeleteRubric,
  canEditRubric,
  canManageRubric,
  rubricLockLabel,
} from "./rubrics";

type Viewer = Pick<MeResponse, "id" | "roles" | "permissions">;

const owner: Viewer = {
  id: "owner-user",
  roles: ["lecturer"],
  permissions: ["rubrics:read", "rubrics:write"],
};
const otherLecturer: Viewer = {
  id: "other-user",
  roles: ["lecturer"],
  permissions: ["rubrics:read", "rubrics:write"],
};
const coordinator: Viewer = {
  id: "coordinator-user",
  roles: ["program_coordinator"],
  permissions: ["rubrics:read", "rubrics:write"],
};

function rubric(status: Rubric["status"], assessmentUsageCount = 0): Rubric {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Assessment Rubric",
    type: "Assignment",
    description: "",
    levels: [{ label: "Excellent", points: 4 }],
    criteria: [],
    status,
    owner: { id: owner.id, name: "Owner" },
    assessmentUsageCount,
    createdAt: "2026-08-16T00:00:00.000Z",
    updatedAt: "2026-08-16T00:00:00.000Z",
  };
}

test("frontend management actions follow owner/elevated policy", () => {
  const draft = rubric("Draft");
  expect(canManageRubric(owner, draft)).toBe(true);
  expect(canManageRubric(otherLecturer, draft)).toBe(false);
  expect(canManageRubric(coordinator, draft)).toBe(true);
  expect(canEditRubric(owner, draft)).toBe(true);
  expect(canDeleteRubric(owner, draft)).toBe(true);
});

test("linked and published rubrics do not expose unsafe edit/delete actions", () => {
  const linkedDraft = rubric("Draft", 1);
  const active = rubric("Active", 2);
  expect(canEditRubric(owner, linkedDraft)).toBe(false);
  expect(canDeleteRubric(owner, linkedDraft)).toBe(false);
  expect(rubricLockLabel(linkedDraft)).toContain("Linked to 1 assessment");

  expect(canEditRubric(owner, active)).toBe(false);
  expect(canDeleteRubric(owner, active)).toBe(false);
  expect(canArchiveRubric(owner, active)).toBe(true);
});
