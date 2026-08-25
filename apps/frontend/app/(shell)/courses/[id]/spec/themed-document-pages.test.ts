import { describe, expect, test } from "bun:test";

const SOURCE_PATH = new URL("./themed-document-pages.tsx", import.meta.url);

describe("Course Specification theme boundaries", () => {
  test("keeps the programme overview template-controlled while theming other pages", async () => {
    const source = await Bun.file(SOURCE_PATH).text();

    expect(source).toContain(
      "article[data-doc-page] > div:not(#programme-overview):not(#plo-taxonomy)",
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

  test("locks the Part 1 header to the approved Times New Roman sizes", async () => {
    const source = await Bun.file(SOURCE_PATH).text();

    expect(source).toContain("#programme-overview header > p");
    expect(source).toContain('font-family: "Times New Roman", Times, serif !important;');
    expect(source).toContain("font-size: 11pt !important;");
    expect(source).toContain("font-weight: 700 !important;");
    expect(source).toContain("#programme-overview h1");
    expect(source).toContain("font-size: 14pt !important;");
  });

  test("does not draw a full-page outer frame", async () => {
    const source = await Bun.file(SOURCE_PATH).text();

    expect(source).not.toContain("article[data-doc-page]::before");
  });

  test("renders the complete PLO block as a compact full-width Part 1 continuation row", async () => {
    const source = await Bun.file(SOURCE_PATH).text();

    expect(source).toContain(
      "article[data-doc-page] > #plo-taxonomy",
    );
    expect(source).toContain("height: auto !important;");
    expect(source).toContain("margin: 42px 54px 0;");
    expect(source).toContain("padding: 8px !important;");
    expect(source).toContain("border: 1px solid #000;");
    expect(source).toContain(
      "article[data-doc-page] > #plo-taxonomy > h2",
    );
    expect(source).toContain("font-size: 10px !important;");
    expect(source).toContain(":not(#programme-overview):not(#plo-taxonomy)");

    expect(source).not.toContain("data-plo-count-label");
    expect(source).not.toContain(
      "#programme-overview .grid.border.border-black::after",
    );
    expect(source).not.toContain("margin: 0 54px;");
    expect(source).not.toContain("padding: 38px 54px !important;");
  });
});
