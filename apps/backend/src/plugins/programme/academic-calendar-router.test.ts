import { describe, expect, test } from "bun:test";
import type { AuthUser } from "../../core/auth/token.ts";
import { canReadAcademicCalendar, canWriteAcademicCalendar } from "./academic-calendar-router.ts";
function user(programmeRoles: AuthUser["programmeRoles"]): AuthUser { return { id: crypto.randomUUID(), email: "calendar-access@example.test", roles: [...new Set(programmeRoles.map((assignment) => assignment.role))], programmeRoles }; }
describe("academic calendar programme authorization", () => {
  test("allows programme-scoped staff reads but limits writes to coordinator/admin", () => {
    expect(canReadAcademicCalendar(user([{ role: "admin", programmeId: null }]), "dse")).toBe(true);
    expect(canReadAcademicCalendar(user([{ role: "program_coordinator", programmeId: "dse" }]), "dse")).toBe(true);
    expect(canReadAcademicCalendar(user([{ role: "program_secretary", programmeId: "dse" }]), "dse")).toBe(true);
    expect(canWriteAcademicCalendar(user([{ role: "program_coordinator", programmeId: "dse" }]), "dse")).toBe(true);
    expect(canWriteAcademicCalendar(user([{ role: "program_secretary", programmeId: "dse" }]), "dse")).toBe(false);
  });
  test("fails closed across programmes and for student/lecturer roles", () => {
    expect(canReadAcademicCalendar(user([{ role: "program_coordinator", programmeId: "other" }]), "dse")).toBe(false);
    expect(canWriteAcademicCalendar(user([{ role: "program_coordinator", programmeId: "other" }]), "dse")).toBe(false);
    expect(canReadAcademicCalendar(user([{ role: "student", programmeId: "dse" }]), "dse")).toBe(false);
    expect(canReadAcademicCalendar(user([{ role: "lecturer", programmeId: "dse" }]), "dse")).toBe(false);
  });
});
