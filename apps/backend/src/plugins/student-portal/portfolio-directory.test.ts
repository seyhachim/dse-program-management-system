import { describe, expect, test } from "bun:test";
import { StudentProjectDirectoryQuery } from "@dse-pms/shared-types";
import type { AuthUser } from "../../core/auth/token.ts";
import { directoryProgrammeFor } from "./portfolio-directory.ts";

function actor(role: AuthUser["roles"][number], programmeId: string | null): AuthUser {
  return {
    id: "test-user",
    email: "test@example.edu",
    roles: [role],
    programmeRoles: [{ role, programmeId }],
  };
}

describe("student project directory access and query contract", () => {
  test("denies students, ordinary lecturers and QA contributors", () => {
    for (const role of ["student", "lecturer", "qa_contributor"] as const) {
      expect(() => directoryProgrammeFor(actor(role, "dse"), "dse")).toThrow();
    }
  });

  test("enforces the actor's actual programme grant", () => {
    const coordinator = actor("program_coordinator", "dse");
    expect(directoryProgrammeFor(coordinator)).toBe("dse");
    expect(directoryProgrammeFor(coordinator, "dse")).toBe("dse");
    expect(() => directoryProgrammeFor(coordinator, "another-programme")).toThrow();
    expect(directoryProgrammeFor(actor("program_secretary", "dse"), "dse")).toBe("dse");
    expect(directoryProgrammeFor(actor("admin", null), "another-programme")).toBe("another-programme");
  });

  test("bounds search and pagination rather than running unbounded queries", () => {
    expect(StudentProjectDirectoryQuery.parse({ page: "2", limit: "12", year: "2026" })).toMatchObject({
      q: "",
      page: 2,
      limit: 12,
      year: 2026,
    });
    expect(StudentProjectDirectoryQuery.safeParse({ limit: "10000" }).success).toBe(false);
    expect(StudentProjectDirectoryQuery.safeParse({ page: "-1" }).success).toBe(false);
    expect(StudentProjectDirectoryQuery.safeParse({ q: "x".repeat(121) }).success).toBe(false);
    expect(StudentProjectDirectoryQuery.safeParse({ year: "hello" }).success).toBe(false);
    expect(StudentProjectDirectoryQuery.safeParse({ verification: "self_verified" }).success).toBe(false);
  });
});
