import { expect, test } from "bun:test";
import { githubLinkRedirect, githubLoginRedirect, safeGithubReturnPath } from "./github-auth";

test("OAuth return path allows internal destinations and preserves Telegram linking query", () => {
  expect(safeGithubReturnPath("/student-home?tab=courses")).toBe("/student-home?tab=courses");
  expect(safeGithubReturnPath("/telegram/link?token=example")).toBe("/telegram/link?token=example");
  expect(githubLoginRedirect("https://pms.example.edu", "/telegram/link?token=example"))
    .toBe("https://pms.example.edu/github-sign-in?next=%2Ftelegram%2Flink%3Ftoken%3Dexample");
  expect(githubLinkRedirect("https://pms.example.edu")).toBe("https://pms.example.edu/connect-github");
});

test("OAuth return path rejects external, protocol-relative, and backslash redirects", () => {
  for (const next of [null, "https://evil.example", "//evil.example", "/\\evil.example", "/safe\\evil.example"]) {
    expect(safeGithubReturnPath(next)).toBe("/");
  }
});
