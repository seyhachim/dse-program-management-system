import { describe, expect, test } from "bun:test";
import type { AuthUser } from "../../core/auth/token.ts";
import {
  canManageGradingScales,
  canReadCourseSpecGradingScale,
  isCourseSpecReadableGradingScaleStatus,
} from "./grading-scale-router.ts";

function user(programmeRoles: AuthUser["programmeRoles"]): AuthUser {
  return {
    id: crypto.randomUUID(),
    email: "grading-scale-access@example.test",
    roles: [...new Set(programmeRoles.map((assignment) => assignment.role))],
    programmeRoles,
  };
}

describe("grading-scale read authorization", () => {
  test("only Admin and Programme Coordinator can browse management versions", () => {
    expect(
      canManageGradingScales(user([{ role: "admin", programmeId: null }]), "dse"),
    ).toBe(true);
    expect(
      canManageGradingScales(
        user([{ role: "program_coordinator", programmeId: "dse" }]),
        "dse",
      ),
    ).toBe(true);

    for (const role of ["lecturer", "program_secretary", "qa_reviewer"] as const) {
      expect(
        canManageGradingScales(user([{ role, programmeId: "dse" }]), "dse"),
      ).toBe(false);
    }
  });

  test("Programme Coordinator management access remains programme-scoped", () => {
    expect(
      canManageGradingScales(
        user([{ role: "program_coordinator", programmeId: "other" }]),
        "dse",
      ),
    ).toBe(false);
  });

  test("Course-Spec grading-scale reads allow programme readers", () => {
    for (const role of [
      "admin",
      "program_coordinator",
      "lecturer",
      "program_secretary",
      "qa_reviewer",
    ] as const) {
      expect(
        canReadCourseSpecGradingScale(
          user([{ role, programmeId: role === "admin" ? null : "dse" }]),
          "dse",
        ),
      ).toBe(true);
    }
  });

  test("Course-Spec grading-scale reads remain programme-scoped", () => {
    for (const role of ["lecturer", "program_secretary", "qa_reviewer"] as const) {
      expect(
        canReadCourseSpecGradingScale(
          user([{ role, programmeId: "other" }]),
          "dse",
        ),
      ).toBe(false);
    }
  });

  test("Course-Spec reads expose only Approved or Superseded versions", () => {
    expect(isCourseSpecReadableGradingScaleStatus("Approved")).toBe(true);
    expect(isCourseSpecReadableGradingScaleStatus("Superseded")).toBe(true);
    expect(isCourseSpecReadableGradingScaleStatus("Draft")).toBe(false);
  });
});
