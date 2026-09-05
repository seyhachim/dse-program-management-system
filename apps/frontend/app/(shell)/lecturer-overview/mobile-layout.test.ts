import { describe, expect, test } from "bun:test";
import { MOBILE_SHELL_LAYOUT } from "../mobile-shell-layout";
import { LECTURER_OVERVIEW_LAYOUT } from "./mobile-layout";

describe("mobile PWA layout", () => {
  test("keeps the fixed topbar compact on phones", () => {
    expect(MOBILE_SHELL_LAYOUT.topbar).toContain("h-16");
    expect(MOBILE_SHELL_LAYOUT.topbar).toContain("px-3");
    expect(MOBILE_SHELL_LAYOUT.topbarLeading).toContain("min-w-0");
    expect(MOBILE_SHELL_LAYOUT.title).toContain("truncate");
    expect(MOBILE_SHELL_LAYOUT.subtitle).toContain("hidden");
    expect(MOBILE_SHELL_LAYOUT.subtitle).toContain("md:block");
  });

  test("uses phone-friendly account controls", () => {
    expect(MOBILE_SHELL_LAYOUT.userTrigger).toContain("min-h-11");
    expect(MOBILE_SHELL_LAYOUT.userDetails).toContain("hidden");
    expect(MOBILE_SHELL_LAYOUT.userDetails).toContain("md:block");
  });

  test("uses a compact two-column lecturer summary on phones", () => {
    expect(LECTURER_OVERVIEW_LAYOUT.main).toContain("p-3");
    expect(LECTURER_OVERVIEW_LAYOUT.summaryGrid).toContain("grid-cols-2");
    expect(LECTURER_OVERVIEW_LAYOUT.summaryGrid).toContain("xl:grid-cols-5");
    expect(LECTURER_OVERVIEW_LAYOUT.summaryFinalCard).toContain("col-span-2");
    expect(LECTURER_OVERVIEW_LAYOUT.summaryFinalCard).toContain("xl:col-span-1");
  });

  test("keeps the period filter and assignments native to the viewport", () => {
    expect(LECTURER_OVERVIEW_LAYOUT.periodField).toContain("w-full");
    expect(LECTURER_OVERVIEW_LAYOUT.periodSelect).toContain("h-11");
    expect(LECTURER_OVERVIEW_LAYOUT.mobileAssignments).toContain("md:hidden");
    expect(LECTURER_OVERVIEW_LAYOUT.desktopAssignments).toContain("hidden");
    expect(LECTURER_OVERVIEW_LAYOUT.desktopAssignments).toContain("md:block");
  });
});
