import { describe, expect, test } from "bun:test";

const SOURCE_PATH = new URL("./themed-document-pages.tsx", import.meta.url);

describe("Course Specification theme boundaries", () => {
  test("keeps the programme overview template-controlled while theming other pages", async () => {
    const source = await Bun.file(SOURCE_PATH).text();

    expect(source).toContain(
      "article[data-doc-page] > div:not(#programme-overview)",
    );
    expect(source).toContain(
      "> div:not(#programme-overview) p",
    );
    expect(source).toContain(
      "> div:not(#programme-overview) h1",
    );
    expect(source).not.toContain(
      "article[data-doc-page] #programme-overview > div",
    );
  });

  test("does not draw a full-page outer frame", async () => {
    const source = await Bun.file(SOURCE_PATH).text();

    expect(source).not.toContain("article[data-doc-page]::before");
  });

  test("keeps the complete PLO block inside the Part 1 continuation row", async () => {
    const source = await Bun.file(SOURCE_PATH).text();

    expect(source).toContain("data-plo-count-label");
    expect(source).toContain(
      "#programme-overview .grid.border.border-black::after",
    );
    expect(source).toContain("PROGRAM LEARNING OUTCOME (PLOs)");
    expect(source).toContain("grid-column: 1 / -1;");
    expect(source).toContain("border-top: 1px solid #000;");
    expect(source).toContain(
      "article[data-doc-page] > #plo-taxonomy",
    );
    expect(source).toContain("margin: 0 30px;");
    expect(source).toContain("border-left: 1px solid #000;");
    expect(source).toContain("border-right: 1px solid #000;");
    expect(source).toContain("border-bottom: 1px solid #000;");
    expect(source).toContain("border-top: 0;");
    expect(source).toContain(
      "article[data-doc-page] > #plo-taxonomy > h2 + p",
    );
  });
});
