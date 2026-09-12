import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const directorySource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const profileSource = readFileSync(new URL("./[lecturerId]/page.tsx", import.meta.url), "utf8");

describe("Final Project supervisor discovery UI", () => {
  test("uses semantic PMS theme tokens instead of light-only supervisor colors", () => {
    for (const source of [directorySource, profileSource]) {
      expect(source).toContain("bg-card");
      expect(source).toContain("text-foreground");
      expect(source).toContain("text-muted-foreground");
      expect(source).toContain("border-border");
      expect(source).toContain("bg-success-bg text-success");
      expect(source).toContain("bg-inactive-bg text-inactive");
      expect(source).not.toContain("bg-white");
      expect(source).not.toContain("text-slate-");
      expect(source).not.toContain("bg-red-50");
      expect(source).not.toContain("text-red-700");
    }
  });

  test("keeps search and accepting state as client-side discovery filters", () => {
    expect(directorySource).toContain('new URLSearchParams({ programmeId: PROGRAMME_ID })');
    expect(directorySource).not.toContain('params.set("accepting", "true")');
    expect(directorySource).toContain("if (acceptingOnly && !item.acceptingStudents) return false;");
    expect(directorySource).toContain("acceptingOnly, items, search");
  });

  test("distinguishes no published profiles from a filtered no-match state", () => {
    expect(directorySource).toContain("!loading && !error && items.length === 0");
    expect(directorySource).toContain("Supervisor profiles are not published yet");
    expect(directorySource).toContain("!loading && !error && items.length > 0 && filtered.length === 0");
    expect(directorySource).toContain("No supervisors match these filters");
    expect(directorySource).toContain("Show all supervisors");
  });

  test("lets students recover from a no-match filter state", () => {
    expect(directorySource).toContain("function resetFilters()");
    expect(directorySource).toContain('setSearch("")');
    expect(directorySource).toContain("setAcceptingOnly(false)");
    expect(directorySource).toContain("onClick={resetFilters}");
  });

  test("gives empty supervisor profile sections intentional themed states", () => {
    expect(profileSource).toContain("No research or project tracks have been published yet");
    expect(profileSource).toContain("No example project ideas have been published yet");
    expect(profileSource).toContain("border-dashed border-border bg-muted/30");
  });

  test("keeps loading and error feedback accessible", () => {
    expect(directorySource).toContain('role="alert"');
    expect(directorySource).toContain('role="status"');
    expect(profileSource).toContain('role="alert"');
    expect(profileSource).toContain('role="status"');
    expect(directorySource).toContain("border-error/30 bg-error-bg");
    expect(profileSource).toContain("border-error/30 bg-error-bg");
  });
});
