import { describe, expect, test } from "bun:test";
import { rolesForAuthenticatedSession } from "./service.ts";

describe("rolesForAuthenticatedSession", () => {
  test("uses the narrower authenticated persona roles when supplied", () => {
    expect(
      rolesForAuthenticatedSession(["admin", "lecturer", "student"], ["student"]),
    ).toEqual(["student"]);
  });

  test("keeps database roles for callers without an explicit session scope", () => {
    expect(rolesForAuthenticatedSession(["admin", "qa_reviewer"])).toEqual([
      "admin",
      "qa_reviewer",
    ]);
  });

  test("deduplicates authenticated roles", () => {
    expect(rolesForAuthenticatedSession(["student"], ["student", "student"])).toEqual([
      "student",
    ]);
  });
});
