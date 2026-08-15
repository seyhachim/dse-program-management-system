import { expect, test } from "bun:test";
import { CreateAccountInput, Role } from "./auth.ts";

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
