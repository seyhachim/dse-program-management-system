import { describe, expect, test } from "bun:test";

const THEME_PATH = new URL("./themed-document-pages.tsx", import.meta.url);

describe("Section 14 preview layout", () => {
  test("wraps and constrains the approved grouped header", async () => {
    const source = await Bun.file(THEME_PATH).text();
    expect(source).toContain(".section14-header-row:first-child");
    expect(source).toContain(".section14-table > table");
    expect(source).toContain("table-layout: fixed !important");
    expect(source).toContain("max-width: 100% !important");
    expect(source).toContain("min-width: 0 !important");
    expect(source).toContain("height: 44px");
    expect(source).toContain("white-space: normal !important");
    expect(source).toContain("overflow-wrap: anywhere !important");
    expect(source).toContain("font-size: 8.5pt !important");
    expect(source).toContain(".section14-header-table");
    expect(source).toContain(".section14-body-table");
  });

  test("reserves explicit space for CLO, description, PLO, C, A, and P", async () => {
    const source = await Bun.file(THEME_PATH).text();
    expect(source).toContain("colgroup col:nth-child(1)");
    expect(source).toContain("width: 7% !important");
    expect(source).toContain("colgroup col:nth-child(2)");
    expect(source).toContain("width: 58% !important");
    expect(source).toContain("colgroup col:nth-child(3)");
    expect(source).toContain("width: 8% !important");
    expect(source).toContain("colgroup col:nth-child(4)");
    expect(source).toContain("colgroup col:nth-child(5)");
    expect(source).toContain("colgroup col:nth-child(6)");
    expect(source).toContain("width: 9% !important");
  });
});
