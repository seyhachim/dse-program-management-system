import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const monthSource = readFileSync(
  new URL("./student-khmer-lunar-month.tsx", import.meta.url), "utf8",
);
const studentSource = readFileSync(
  new URL("./portal-academic-calendar.tsx", import.meta.url), "utf8",
);

describe("student Khmer lunar calendar UI", () => {
  test("adds a month grid while preserving semester and event timelines", () => {
    expect(studentSource).toContain("<StudentKhmerLunarMonth calendar={data} />");
    expect(studentSource).toContain("Semester overview");
    expect(studentSource).toContain("Academic timeline");
    expect(studentSource).toContain('if (data.status === "unavailable")');
  });

  test("offers date display choices, accessible navigation and Khmer typography", () => {
    expect(monthSource).toContain('label: "Gregorian"');
    expect(monthSource).toContain('label: "Both"');
    expect(monthSource).toContain('label: "Khmer lunar"');
    expect(monthSource).toContain('aria-label="Previous month"');
    expect(monthSource).toContain('aria-label="Next month"');
    expect(monthSource).toContain('aria-pressed={selected}');
    expect(monthSource).toContain('aria-current={isToday ? "date" : undefined}');
    expect(monthSource).toContain('lang="km"');
    expect(monthSource).toContain("grid-cols-7");
    expect(monthSource).toContain("sm:text-xs");
    expect(monthSource).toContain("md:block");
  });

  test("official calendar metadata remains sourced from authorized student payload only", () => {
    expect(monthSource).toContain("publishedItemsOnDate(calendar, cell.dateKey)");
    expect(monthSource).toContain("publishedItemsOnDate(calendar, selectedDate)");
    expect(monthSource).toContain("Official semester dates");
    expect(monthSource).not.toContain("getKhmerHolidays(");
  });
});
