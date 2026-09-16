import { expect, test } from "bun:test";
import { githubLinkRedirect, githubLoginRedirect, safeGithubReturnPath } from "./github-auth";

test("OAuth return path allows internal destinations and preserves Telegram linking query", () => {
  expect(safeGithubReturnPath("/student-home?tab=courses")).toBe("/student-home?tab=courses");
  expect(safeGithubReturnPath("/telegram/link?token=example")).toBe("/telegram/link?token=example");
  expect(githubLoginRedirect("https://pms.example.edu"))
    .toBe("https://pms.example.edu/github-sign-in?callback=1");
  expect(githubLoginRedirect("https://pms.example.edu")).not.toContain("token");
  expect(githubLinkRedirect("https://pms.example.edu")).toBe("https://pms.example.edu/connect-github");
});

test("OAuth return path rejects external, protocol-relative, and backslash redirects", () => {
  for (const next of [null, "https://evil.example", "//evil.example", "/\\evil.example", "/safe\\evil.example"]) {
    expect(safeGithubReturnPath(next)).toBe("/");
  }
});
