import { describe, expect, test } from "bun:test";
import {
  COURSE_SPEC_PREVIEW_DEFAULT_ZOOM,
  getCourseSpecPreviewLayout,
} from "./document-preview-layout";

describe("Course Specification preview role parity", () => {
  test("keeps the official document viewport identical for governance and lecturer roles", () => {
    const governance = getCourseSpecPreviewLayout(true);
    const lecturer = getCourseSpecPreviewLayout(false);

    expect(governance.gridClassName).toBe(lecturer.gridClassName);
    expect(governance.viewerClassName).toBe(lecturer.viewerClassName);
    expect(governance.gridClassName).toContain("lg:grid-cols-[250px_minmax(0,1fr)]");
    expect(governance.showDocumentStyleControl).toBe(true);
    expect(lecturer.showDocumentStyleControl).toBe(false);
  });

  test("keeps the preview grid shrinkable so the sidebar cannot force page-level horizontal overflow", () => {
    const layout = getCourseSpecPreviewLayout(false);

    expect(layout.gridClassName).toContain("min-w-0");
    expect(layout.gridClassName).toContain("minmax(0,1fr)");
  });

  test("uses a contained scrollable document viewer", () => {
    const layout = getCourseSpecPreviewLayout(false);

    expect(layout.viewerClassName).toContain("overflow-auto");
    expect(layout.viewerClassName).toContain("h-[70vh]");
    expect(layout.viewerClassName).toContain("lg:h-[72vh]");
  });

  test("defaults the browser preview to 90 percent", () => {
    expect(COURSE_SPEC_PREVIEW_DEFAULT_ZOOM).toBe(0.9);
  });
});
