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
    expect(source).not.toContain("border: 1px solid #000;");
  });
});
