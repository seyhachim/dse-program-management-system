import { expect, test } from "bun:test";
import {
  CreateAccountInput,
  ManageProgrammeRoleInput,
  ResendInvitationResponse,
  Role,
} from "./auth.ts";

test("Role supports the additive QA contributor role", () => {
  expect(Role.options).toEqual([
    "admin",
    "program_coordinator",
    "program_secretary",
    "lecturer",
    "qa_contributor",
    "qa_reviewer",
    "student",
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
