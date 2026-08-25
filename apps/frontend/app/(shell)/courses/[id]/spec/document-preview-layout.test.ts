import { describe, expect, test } from "bun:test";
import { getCourseSpecPreviewLayout } from "./document-preview-layout";

describe("Course Specification preview role parity", () => {
  test("keeps the official document viewport identical for governance and lecturer roles", () => {
    const governance = getCourseSpecPreviewLayout(true);
    const lecturer = getCourseSpecPreviewLayout(false);

    expect(governance.gridClassName).toBe(lecturer.gridClassName);
    expect(governance.gridClassName).not.toContain("_280px");
    expect(governance.showDocumentStyleControl).toBe(true);
    expect(lecturer.showDocumentStyleControl).toBe(false);
  });

  test("lets the document workspace grow with the page stack instead of clipping it to a viewport calculation", () => {
    const layout = getCourseSpecPreviewLayout(false);

    expect(layout.gridClassName).toContain("items-start");
    expect(layout.gridClassName).not.toContain("100vh");
    expect(layout.gridClassName).not.toContain("100dvh");
    expect(layout.gridClassName).not.toContain("min-h-[650px]");
  });
});
