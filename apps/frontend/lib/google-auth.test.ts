import { expect, test } from "bun:test";
import { googleLinkRedirect, googleLoginRedirect, safeGoogleReturnPath } from "./google-auth";

test("Google pilot redirects use fixed same-origin callbacks and keep return data out of provider URLs", () => {
  expect(googleLoginRedirect("https://pms.example.edu"))
    .toBe("https://pms.example.edu/google-sign-in?callback=1");
  expect(googleLinkRedirect("https://pms.example.edu"))
    .toBe("https://pms.example.edu/connect-google?callback=1");
  expect(googleLoginRedirect("https://pms.example.edu")).not.toContain("token");
  expect(safeGoogleReturnPath("/student-home?tab=courses")).toBe("/student-home?tab=courses");
  expect(safeGoogleReturnPath("/telegram/link?token=example")).toBe("/telegram/link?token=example");
});

test("Google pilot rejects external and ambiguous return paths", () => {
  for (const next of [null, "", "https://evil.example", "//evil.example", "/\\evil.example", "/safe\\evil.example"]) {
    expect(safeGoogleReturnPath(next)).toBe("/");
  }
});
