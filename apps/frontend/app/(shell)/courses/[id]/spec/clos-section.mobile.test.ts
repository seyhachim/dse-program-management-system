import { describe, expect, test } from "bun:test";

describe("Course Specification CLO toolbar mobile layout", () => {
  test("stacks and constrains search/filter controls on narrow screens", async () => {
    const source = await Bun.file(
      new URL("./clos-section.tsx", import.meta.url),
    ).text();

    expect(source).toContain(
      'className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center"',
    );
    expect(source).toContain(
      'className="relative w-full min-w-0 sm:w-auto"',
    );
    expect(source).toContain(
      'className="h-9 w-full min-w-0 rounded-lg border border-border bg-card pl-8 pr-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:w-44"',
    );
    expect(source).toContain(
      'className="h-9 w-full min-w-0 rounded-lg border border-border bg-card pl-8 pr-8 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:w-auto"',
    );
  });

  test("preserves compact desktop toolbar and intentional table scrolling", async () => {
    const source = await Bun.file(
      new URL("./clos-section.tsx", import.meta.url),
    ).text();

    expect(source).toContain("sm:flex-row");
    expect(source).toContain("sm:w-44");
    expect(source).toContain("sm:w-auto");
    expect(source).toContain('className="overflow-x-auto"');
    expect(source).toContain('className="w-full min-w-[1080px] text-sm"');
  });
});
