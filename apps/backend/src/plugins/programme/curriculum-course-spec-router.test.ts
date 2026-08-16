import { describe, expect, test } from "bun:test";
import type { AuthUser } from "../../core/auth/token.ts";
import {
  canReadCurriculumCourseSpecs,
  canWriteCurriculumCourseSpecs,
} from "./curriculum-course-spec-router.ts";

function user(role: AuthUser["roles"][number], programmeId: string | null): AuthUser {
  return {
    id: crypto.randomUUID(),
    email: `${role}@example.test`,
    roles: [role],
    programmeRoles: [{ role, programmeId }],
  };
}

describe("curriculum CourseSpec binding authorization", () => {
  test("global admin can read and write any programme", () => {
    const admin = user("admin", null);
    expect(canReadCurriculumCourseSpecs(admin, "p1")).toBe(true);
    expect(canWriteCurriculumCourseSpecs(admin, "p2")).toBe(true);
  });

  test("coordinator is restricted to their programme", () => {
    const coordinator = user("program_coordinator", "p1");
    expect(canReadCurriculumCourseSpecs(coordinator, "p1")).toBe(true);
    expect(canWriteCurriculumCourseSpecs(coordinator, "p1")).toBe(true);
    expect(canReadCurriculumCourseSpecs(coordinator, "p2")).toBe(false);
    expect(canWriteCurriculumCourseSpecs(coordinator, "p2")).toBe(false);
  });

  test("secretary and QA reviewer are read-only", () => {
    for (const role of ["program_secretary", "qa_reviewer"] as const) {
      const reader = user(role, "p1");
      expect(canReadCurriculumCourseSpecs(reader, "p1")).toBe(true);
      expect(canWriteCurriculumCourseSpecs(reader, "p1")).toBe(false);
    }
  });

  test("lecturer and student cannot access privileged binding views", () => {
    for (const role of ["lecturer", "student"] as const) {
      const caller = user(role, "p1");
      expect(canReadCurriculumCourseSpecs(caller, "p1")).toBe(false);
      expect(canWriteCurriculumCourseSpecs(caller, "p1")).toBe(false);
    }
  });
});
