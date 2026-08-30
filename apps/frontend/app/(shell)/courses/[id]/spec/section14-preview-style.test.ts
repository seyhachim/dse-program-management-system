import { describe, expect, test } from "bun:test";

const THEME_PATH = new URL("./themed-document-pages.tsx", import.meta.url);

describe("Section 14 preview layout", () => {
  test("wraps and constrains the approved grouped header", async () => {
    const source = await Bun.file(THEME_PATH).text();
    expect(source).toContain(".section14-header-row:first-child");
    expect(source).toContain("height: 44px");
    expect(source).toContain("white-space: normal !important");
    expect(source).toContain("overflow-wrap: anywhere !important");
    expect(source).toContain("font-size: 8.5pt !important");
  });
});
