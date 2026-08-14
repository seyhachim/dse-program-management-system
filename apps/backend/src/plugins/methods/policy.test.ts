import { expect, test } from "bun:test";
import type { Role } from "../../core/auth/token.ts";
import { canManageMethodVocabulary } from "./policy.ts";

function allowed(...roles: Role[]) {
  return canManageMethodVocabulary(roles);
}

test("admin can manage approved method vocabulary", () => {
  expect(allowed("admin")).toBe(true);
});

test("program coordinator (Head of Programme) can manage approved method vocabulary", () => {
  expect(allowed("program_coordinator")).toBe(true);
});

test("lecturer cannot manage approved method vocabulary", () => {
  expect(allowed("lecturer")).toBe(false);
});

test("programme secretary cannot manage approved method vocabulary", () => {
  expect(allowed("program_secretary")).toBe(false);
});

test("QA reviewer and student cannot manage approved method vocabulary", () => {
  expect(allowed("qa_reviewer")).toBe(false);
  expect(allowed("student")).toBe(false);
});

test("a multi-role user is allowed when one role is a vocabulary manager", () => {
  expect(allowed("lecturer", "program_coordinator")).toBe(true);
});
