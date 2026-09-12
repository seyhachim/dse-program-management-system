import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Final Project lecturer supervisor profile UI", () => {
  test("uses semantic PMS theme tokens instead of light-only colors", () => {
    expect(source).toContain("bg-card");
    expect(source).toContain("border-border");
    expect(source).toContain("text-foreground");
    expect(source).toContain("text-foreground-secondary");
    expect(source).toContain("text-muted-foreground");
    expect(source).toContain("bg-background");
    expect(source).toContain("placeholder:text-muted-foreground");
    expect(source).toContain("bg-primary");
    expect(source).toContain("text-primary-foreground");
    expect(source).not.toContain("bg-white");
    expect(source).not.toContain("text-slate-");
    expect(source).not.toContain("bg-red-50");
    expect(source).not.toContain("text-red-700");
    expect(source).not.toContain("bg-emerald-50");
    expect(source).not.toContain("text-emerald-700");
  });

  test("keeps form feedback accessible and semantic", () => {
    expect(source).toContain('role="alert"');
    expect(source).toContain('role="status"');
    expect(source).toContain("border-error/30 bg-error-bg");
    expect(source).toContain("border-success/30 bg-success-bg");
  });

  test("keeps existing supervisor profile API and payload behavior", () => {
    expect(source).toContain("/api/final-project/supervisor-profile/me?programmeId=${PROGRAMME_ID}");
    expect(source).toContain('api.put<SupervisorDiscoveryProfileView>("/api/final-project/supervisor-profile/me", body)');
    expect(source).toContain("programmeId: PROGRAMME_ID");
    expect(source).toContain("supervisionStatement: statement");
    expect(source).toContain("acceptingStudents");
    expect(source).toContain("isPublished");
    expect(source).toContain("tracks,");
    expect(source).toContain("projectIdeas,");
  });
});
