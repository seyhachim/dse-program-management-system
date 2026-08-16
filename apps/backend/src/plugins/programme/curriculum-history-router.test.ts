import { describe, expect, test } from "bun:test";
import type { AuthUser } from "../../core/auth/token.ts";
import { canReadCurriculumHistory } from "./curriculum-history-router.ts";

function user(programmeRoles: AuthUser["programmeRoles"]): AuthUser {
  return {
    id: crypto.randomUUID(),
    email: "history-access@example.test",
    roles: [...new Set(programmeRoles.map((assignment) => assignment.role))],
    programmeRoles,
  };
}

describe("curriculum history programme authorization", () => {
  test("allows global admin and privileged roles scoped to the curriculum programme", () => {
    expect(canReadCurriculumHistory(user([{ role: "admin", programmeId: null }]), "dse")).toBe(true);
    expect(canReadCurriculumHistory(user([{ role: "program_coordinator", programmeId: "dse" }]), "dse")).toBe(true);
    expect(canReadCurriculumHistory(user([{ role: "program_secretary", programmeId: "dse" }]), "dse")).toBe(true);
    expect(canReadCurriculumHistory(user([{ role: "qa_reviewer", programmeId: "dse" }]), "dse")).toBe(true);
  });

  test("denies cross-programme privileged roles and non-privileged roles", () => {
    expect(canReadCurriculumHistory(user([{ role: "program_coordinator", programmeId: "other" }]), "dse")).toBe(false);
    expect(canReadCurriculumHistory(user([{ role: "student", programmeId: "dse" }]), "dse")).toBe(false);
    expect(canReadCurriculumHistory(user([{ role: "lecturer", programmeId: "dse" }]), "dse")).toBe(false);
  });
});
