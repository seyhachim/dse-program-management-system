import { describe, expect, test } from "bun:test";
import {
  assertDevAuthMode,
  assertDevTokenSigningConfigured,
  parseGenTokenArgs,
  parseStudentPersonaArgs,
} from "./dev-auth-cli.ts";

describe("parseGenTokenArgs", () => {
  test("keeps the existing admin default when no args are provided", () => {
    expect(parseGenTokenArgs([])).toEqual({ role: "admin", email: undefined });
  });

  test("targets a specific role user by normalized email", () => {
    expect(parseGenTokenArgs(["--role", "student", "--email", " Developer@Example.COM "])).toEqual({
      role: "student",
      email: "developer@example.com",
    });
  });

  test("rejects unsupported roles", () => {
    expect(() => parseGenTokenArgs(["--role", "owner"])).toThrow("Invalid role");
  });

  test("rejects missing option values", () => {
    expect(() => parseGenTokenArgs(["--email"])).toThrow("--email requires a value");
  });
});

describe("parseStudentPersonaArgs", () => {
  test("requires a target email and defaults to the seeded Ada fixture", () => {
    expect(parseStudentPersonaArgs(["--email", "Developer@Example.com"])).toEqual({
      email: "developer@example.com",
      studentEmail: "ada@dse.dev",
    });
  });

  test("allows choosing another active seeded Student fixture", () => {
    expect(
      parseStudentPersonaArgs([
        "--email",
        "developer@example.com",
        "--student-email",
        "Alan@DSE.dev",
      ]),
    ).toEqual({
      email: "developer@example.com",
      studentEmail: "alan@dse.dev",
    });
  });

  test("rejects a missing or malformed target email", () => {
    expect(() => parseStudentPersonaArgs([])).toThrow("--email is required");
    expect(() => parseStudentPersonaArgs(["--email", "not-an-email"])).toThrow();
  });
});

describe("dev persona safety guards", () => {
  test("allows explicit dev auth only", () => {
    expect(() => assertDevAuthMode("dev")).not.toThrow();
  });

  test("fails closed for Supabase or an unset auth mode", () => {
    expect(() => assertDevAuthMode("supabase")).toThrow("AUTH_MODE=dev");
    expect(() => assertDevAuthMode(undefined)).toThrow("AUTH_MODE=dev");
  });

  test("requires token signing configuration before any persona write", () => {
    expect(() => assertDevTokenSigningConfigured("local-secret")).not.toThrow();
    expect(() => assertDevTokenSigningConfigured(undefined)).toThrow("No database changes were made");
    expect(() => assertDevTokenSigningConfigured("")).toThrow("No database changes were made");
  });
});
