import { expect, test } from "bun:test";
import {
  BulkStudentPortalAccessResponse,
  CreateAccountInput,
  ManageProgrammeRoleInput,
  ResendInvitationResponse,
  Role,
  SelectedStudentPortalAccessRequest,
  StudentPortalAccessState,
  StudentPortalAccessStatusRequest,
  StudentPortalAccessStatusResponse,
} from "./auth.ts";

test("Role supports additive QA contributor and guardian roles", () => {
  expect(Role.options).toEqual([
    "admin",
    "program_coordinator",
    "program_secretary",
    "lecturer",
    "qa_contributor",
    "qa_reviewer",
    "student",
    "guardian",
  ]);
});

test("CreateAccountInput defaults role to lecturer", () => {
  const parsed = CreateAccountInput.parse({ name: "Ada", email: "ada@dse.dev" });
  expect(parsed.role).toBe("lecturer");
});

test("CreateAccountInput rejects a bad email", () => {
  const result = CreateAccountInput.safeParse({ name: "Ada", email: "nope" });
  expect(result.success).toBe(false);
});

test("CreateAccountInput rejects an empty name", () => {
  const result = CreateAccountInput.safeParse({ name: "", email: "ada@dse.dev" });
  expect(result.success).toBe(false);
});

test("CreateAccountInput rejects admin (manual/seed-only, not self-service invite)", () => {
  const result = CreateAccountInput.safeParse({
    name: "Ada",
    email: "ada@dse.dev",
    role: "admin",
  });
  expect(result.success).toBe(false);
});

test("CreateAccountInput rejects qa_contributor because it is granted additively", () => {
  const result = CreateAccountInput.safeParse({
    name: "Ada",
    email: "ada@dse.dev",
    role: "qa_contributor",
  });
  expect(result.success).toBe(false);
});

test("ManageProgrammeRoleInput only allows the additive QA contributor role", () => {
  const base = {
    userId: "11111111-1111-4111-8111-111111111111",
    programmeId: "dse",
  };
  expect(ManageProgrammeRoleInput.safeParse({ ...base, role: "qa_contributor" }).success).toBe(true);
  expect(ManageProgrammeRoleInput.safeParse({ ...base, role: "admin" }).success).toBe(false);
  expect(ManageProgrammeRoleInput.safeParse({ ...base, role: "qa_reviewer" }).success).toBe(false);
});

test("CreateAccountInput accepts student portal invites", () => {
  const result = CreateAccountInput.safeParse({
    name: "Ada",
    email: "ada@dse.dev",
    role: "student",
  });
  expect(result.success).toBe(true);
});

test("CreateAccountInput accepts guardian invites without granting a student relationship", () => {
  const result = CreateAccountInput.safeParse({
    name: "Parent One",
    email: "parent@dse.dev",
    role: "guardian",
  });
  expect(result.success).toBe(true);
});

test("CreateAccountInput accepts the programme/QA account roles", () => {
  for (const role of ["program_coordinator", "program_secretary", "qa_reviewer"] as const) {
    const result = CreateAccountInput.safeParse({ name: "Ada", email: "ada@dse.dev", role });
    expect(result.success).toBe(true);
  }
});

test("ResendInvitationResponse accepts the invited email and rejects invalid email", () => {
  expect(ResendInvitationResponse.safeParse({ email: "ada@dse.dev" }).success).toBe(true);
  expect(ResendInvitationResponse.safeParse({ email: "not-an-email" }).success).toBe(false);
});

test("SelectedStudentPortalAccessRequest accepts unique batches of up to 20 students", () => {
  const ids = Array.from({ length: 20 }, (_, index) =>
    `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
  );
  expect(SelectedStudentPortalAccessRequest.safeParse({ studentIds: ids.slice(0, 5) }).success).toBe(true);
  expect(SelectedStudentPortalAccessRequest.safeParse({ studentIds: [] }).success).toBe(false);
  expect(SelectedStudentPortalAccessRequest.safeParse({ studentIds: [...ids, "22222222-2222-4222-8222-222222222222"] }).success).toBe(false);
  expect(SelectedStudentPortalAccessRequest.safeParse({ studentIds: [ids[0], ids[0]] }).success).toBe(false);
  expect(SelectedStudentPortalAccessRequest.safeParse({ studentIds: ["not-a-uuid"] }).success).toBe(false);
});

test("BulkStudentPortalAccessResponse requires every student to have exactly one outcome", () => {
  const valid = {
    totalStudents: 10,
    newlyInvited: 3,
    resent: 2,
    existingAccountSkipped: 2,
    ineligibleSkipped: 2,
    failed: 1,
    eligible: 6,
    invited: 5,
    skipped: 4,
  };
  expect(BulkStudentPortalAccessResponse.safeParse(valid).success).toBe(true);
  expect(BulkStudentPortalAccessResponse.safeParse({ ...valid, resent: 3 }).success).toBe(false);
  expect(BulkStudentPortalAccessResponse.safeParse({ ...valid, invited: 4 }).success).toBe(false);
  expect(BulkStudentPortalAccessResponse.safeParse({ ...valid, skipped: 3 }).success).toBe(false);
  expect(BulkStudentPortalAccessResponse.safeParse({ ...valid, eligible: 7 }).success).toBe(false);
  expect(BulkStudentPortalAccessResponse.safeParse({ ...valid, totalStudents: 11 }).success).toBe(false);
});

test("StudentPortalAccessState exposes the roster-safe portal states", () => {
  expect(StudentPortalAccessState.options).toEqual([
    "not-invited",
    "invitation-pending",
    "active-account",
    "no-email",
    "inactive-student",
    "needs-attention",
    "status-unavailable",
  ]);
});

test("StudentPortalAccessStatusRequest accepts bounded student UUID batches", () => {
  const studentId = "11111111-1111-4111-8111-111111111111";
  expect(StudentPortalAccessStatusRequest.safeParse({ studentIds: [studentId] }).success).toBe(true);
  expect(StudentPortalAccessStatusRequest.safeParse({ studentIds: [] }).success).toBe(false);
  expect(
    StudentPortalAccessStatusRequest.safeParse({ studentIds: Array.from({ length: 101 }, () => studentId) }).success,
  ).toBe(false);
});

test("StudentPortalAccessStatusResponse strips unexpected auth fields", () => {
  const studentId = "11111111-1111-4111-8111-111111111111";
  const parsed = StudentPortalAccessStatusResponse.parse({
    items: [
      {
        studentId,
        status: "invitation-pending",
        authId: "secret-auth-id",
      },
    ],
  });

  expect(parsed).toEqual({
    items: [{ studentId, status: "invitation-pending" }],
  });
});
