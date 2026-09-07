import { describe, expect, test } from "bun:test";

const THEME_PATH = new URL("./themed-document-pages.tsx", import.meta.url);

describe("Section 16 preview style", () => {
  test("keeps every official SLT page compact enough for the landscape page", async () => {
    const source = await Bun.file(THEME_PATH).text();
    expect(source).toContain(".section16-page .section16-content-table");
    expect(source).toContain(".section16-page .section16-assessment-table");
    expect(source).toContain("font-size: 7.5pt !important");
    expect(source).toContain("padding: 1.25pt 1pt !important");
    expect(source).toContain("table-layout: fixed !important");
  });
});
