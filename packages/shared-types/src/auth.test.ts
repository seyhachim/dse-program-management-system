import { expect, test } from "bun:test";
import { CreateAccountInput, Role } from "./auth.ts";

test("Role supports all six roles from issue #101", () => {
  expect(Role.options).toEqual([
    "admin",
    "program_coordinator",
    "program_secretary",
    "lecturer",
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

test("CreateAccountInput rejects student (provisioned via Add Student, not an invite)", () => {
  const result = CreateAccountInput.safeParse({
    name: "Ada",
    email: "ada@dse.dev",
    role: "student",
  });
  expect(result.success).toBe(false);
});

test("CreateAccountInput accepts the programme/QA roles added for issue #101", () => {
  for (const role of ["program_coordinator", "program_secretary", "qa_reviewer"] as const) {
    const result = CreateAccountInput.safeParse({ name: "Ada", email: "ada@dse.dev", role });
    expect(result.success).toBe(true);
  }
});
