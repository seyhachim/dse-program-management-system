import { expect, test } from "bun:test";
import type { UpdateRubricInput } from "@dse-pms/shared-types";
import {
  canManageAllRubrics,
  canManageRubric,
  canReadRubric,
  rubricDeleteConflict,
  rubricUpdateConflict,
  type RubricActor,
  type RubricLifecycleSnapshot,
} from "./service.ts";

const owner: RubricActor = { id: "owner-user", roles: ["lecturer"] };
const otherLecturer: RubricActor = { id: "other-user", roles: ["lecturer"] };
const admin: RubricActor = { id: "admin-user", roles: ["admin"] };
const coordinator: RubricActor = { id: "coordinator-user", roles: ["program_coordinator"] };
const reviewer: RubricActor = { id: "reviewer-user", roles: ["qa_reviewer"] };

function snapshot(
  status: RubricLifecycleSnapshot["status"] = "Draft",
  assessmentUsageCount = 0,
): RubricLifecycleSnapshot {
  return { ownerId: owner.id, status, assessmentUsageCount };
}

function update(input: UpdateRubricInput): UpdateRubricInput {
  return input;
}

test("rubric management is owner-scoped with Admin/Coordinator override", () => {
  expect(canManageAllRubrics(owner)).toBe(false);
  expect(canManageRubric(owner, owner.id)).toBe(true);
  expect(canManageRubric(otherLecturer, owner.id)).toBe(false);
  expect(canManageRubric(admin, owner.id)).toBe(true);
  expect(canManageRubric(coordinator, owner.id)).toBe(true);
  expect(canManageRubric(reviewer, owner.id)).toBe(false);
});

test("private rubric reads are owner/elevated only while Active rubrics remain readable", () => {
  expect(canReadRubric(owner, snapshot("Draft"))).toBe(true);
  expect(canReadRubric(otherLecturer, snapshot("Draft"))).toBe(false);
  expect(canReadRubric(reviewer, snapshot("Archived"))).toBe(false);
  expect(canReadRubric(admin, snapshot("Archived"))).toBe(true);
  expect(canReadRubric(reviewer, snapshot("Active"))).toBe(true);
});

test("published rubric content is immutable but Active can be archived", () => {
  expect(rubricUpdateConflict(snapshot("Active"), update({ name: "Changed" }))).not.toBeNull();
  expect(rubricUpdateConflict(snapshot("Active"), update({ status: "Archived" }))).toBeNull();
  expect(rubricUpdateConflict(snapshot("Active"), update({ status: "Active" }))).toBeNull();
});

test("archived rubrics are immutable", () => {
  expect(rubricUpdateConflict(snapshot("Archived"), update({ description: "Changed" }))).not.toBeNull();
  expect(rubricUpdateConflict(snapshot("Archived"), update({ status: "Active" }))).not.toBeNull();
  expect(rubricUpdateConflict(snapshot("Archived"), update({ status: "Archived" }))).toBeNull();
});

test("linked Draft rubrics cannot change scoring content but may publish/archive", () => {
  const linked = snapshot("Draft", 2);
  expect(rubricUpdateConflict(linked, update({ criteria: [] }))).not.toBeNull();
  expect(rubricUpdateConflict(linked, update({ levels: [] }))).not.toBeNull();
  expect(rubricUpdateConflict(linked, update({ status: "Active" }))).toBeNull();
  expect(rubricUpdateConflict(linked, update({ status: "Archived" }))).toBeNull();
});

test("physical deletion is limited to unlinked Draft rubrics", () => {
  expect(rubricDeleteConflict(snapshot("Draft", 0))).toBeNull();
  expect(rubricDeleteConflict(snapshot("Draft", 1))).not.toBeNull();
  expect(rubricDeleteConflict(snapshot("Active", 0))).not.toBeNull();
  expect(rubricDeleteConflict(snapshot("Archived", 0))).not.toBeNull();
});
