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
});
