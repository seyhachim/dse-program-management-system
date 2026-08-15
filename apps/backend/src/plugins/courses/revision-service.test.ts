import { describe, expect, test } from "bun:test";
import { nextAcademicVersion } from "./revision-service.ts";

describe("nextAcademicVersion", () => {
  test.each([
    [{ major: 1, minor: 0 }, "Minor", { major: 1, minor: 1 }],
    [{ major: 1, minor: 4 }, "Minor", { major: 1, minor: 5 }],
    [{ major: 1, minor: 4 }, "Major", { major: 2, minor: 0 }],
    [{ major: 2, minor: 3 }, "Major", { major: 3, minor: 0 }],
  ] as const)("%o + %s -> %o", (current, type, expected) => {
    expect(nextAcademicVersion(current, type)).toEqual(expected);
  });
});
