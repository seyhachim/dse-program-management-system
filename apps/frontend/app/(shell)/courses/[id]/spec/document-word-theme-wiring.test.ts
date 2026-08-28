import { describe, expect, test } from "bun:test";

const PREVIEW_SOURCE = new URL("./document-preview-impl.tsx", import.meta.url);
const EXPORT_SOURCE = new URL("./document-export-impl.ts", import.meta.url);
const RENDERER_SOURCE = new URL("./document-word-renderer.ts", import.meta.url);

describe("Course Specification saved-theme DOCX wiring", () => {
  test("passes the exact saved version theme from Preview to the Word renderer", async () => {
    const [preview, exporter] = await Promise.all([
      Bun.file(PREVIEW_SOURCE).text(),
      Bun.file(EXPORT_SOURCE).text(),
    ]);

    expect(preview).toContain(
      "await exportCourseSpecWord(resolvedDocument, savedTheme)",
    );
    expect(exporter).toContain("theme: CourseSpecDocumentTheme");
    expect(exporter).toContain(
      "return exportCourseSpecWordRenderer(presentationDocument, theme)",
    );
    expect(preview).not.toContain(
      "exportCourseSpecWord(resolvedDocument, themeDraft)",
    );
  });

  test("maps governance typography, spacing, margins, and page furniture in DOCX", async () => {
    const source = await Bun.file(RENDERER_SOURCE).text();

    expect(source).toContain("resolveCourseSpecWordTheme(theme)");
    expect(source).toContain("characterSpacing: wordTheme.characterSpacingTwips");
    expect(source).toContain("after: wordTheme.paragraphAfterTwips");
    expect(source).toContain("line: wordTheme.lineTwips");
    expect(source).toContain("margins: tableCellMargins()");
    expect(source).toContain("top: wordTheme.marginTopTwips");
    expect(source).toContain("bottom: wordTheme.marginBottomTwips");
    expect(source).toContain("left: wordTheme.marginLeftTwips");
    expect(source).toContain("right: wordTheme.marginRightTwips");
    expect(source).toContain("if (!wordTheme.showHeader) return undefined");
    expect(source).toContain("if (!wordTheme.showFooter) return undefined");
    expect(source).toContain("wordTheme.showPageNumbers");
    expect(source).toContain("PageNumber.CURRENT");
  });

  test("serializes renderer calls so one version theme cannot leak into another export", async () => {
    const source = await Bun.file(RENDERER_SOURCE).text();

    expect(source).toContain("let exportQueue: Promise<void> = Promise.resolve()");
    expect(source).toContain("exportQueue.then(() =>");
    expect(source).toContain("exportCourseSpecWordInternal(document, theme)");
  });
});
