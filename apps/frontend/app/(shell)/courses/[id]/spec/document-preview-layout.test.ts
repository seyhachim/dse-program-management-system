import { describe, expect, test } from "bun:test";
import {
  COURSE_SPEC_PREVIEW_MANUAL_MIN_ZOOM,
  COURSE_SPEC_PREVIEW_PADDING,
  getCourseSpecFitWidthZoom,
  getCourseSpecManualZoomIn,
  getCourseSpecManualZoomOut,
  getCourseSpecPreviewLayout,
} from "./document-preview-layout";

describe("Course Specification preview role parity", () => {
  test("keeps the official document viewport identical for governance and lecturer roles", () => {
    const governance = getCourseSpecPreviewLayout(true);
    const lecturer = getCourseSpecPreviewLayout(false);

    expect(governance.gridClassName).toBe(lecturer.gridClassName);
    expect(governance.gridClassName).toContain("lg:grid-cols-[250px_minmax(0,1fr)]");
    expect(governance.showDocumentStyleControl).toBe(true);
    expect(lecturer.showDocumentStyleControl).toBe(false);
  });

  test("keeps the preview grid shrinkable so the sidebar cannot force page-level horizontal overflow", () => {
    const layout = getCourseSpecPreviewLayout(false);

    expect(layout.gridClassName).toContain("min-w-0");
    expect(layout.gridClassName).toContain("minmax(0,1fr)");
  });

  test("uses the left information and Contents column to bound the desktop document scroller", () => {
    const layout = getCourseSpecPreviewLayout(false);

    expect(layout.gridClassName).toContain("relative");
    expect(layout.gridClassName).toContain("lg:[&>main]:absolute");
    expect(layout.gridClassName).toContain("lg:[&>main]:inset-y-0");
    expect(layout.gridClassName).toContain("lg:[&>main]:right-0");
    expect(layout.gridClassName).toContain(
      "lg:[&>main]:left-[calc(250px+1rem)]",
    );
    expect(layout.gridClassName).not.toContain("100vh");
    expect(layout.gridClassName).not.toContain("100dvh");
    expect(layout.gridClassName).not.toContain("min-h-[650px]");
  });

  test("keeps mobile flow content-driven by applying the bounded viewer only at desktop", () => {
    const layout = getCourseSpecPreviewLayout(false);
    const classes = layout.gridClassName.split(" ");

    expect(classes).not.toContain("[&>main]:absolute");
    expect(classes).toContain("lg:[&>main]:absolute");
  });

  test("re-runs Fit Width setup when the async official preview becomes ready", async () => {
    const source = await Bun.file(
      new URL("./document-preview-impl.tsx", import.meta.url),
    ).text();

    expect(source).toContain("if (!officialThemeReady) return;");
    expect(source).toContain("[fitWidth, officialThemeReady]");
  });
});

describe("Course Specification preview zoom", () => {
  const pageWidth = 1123;

  test("lets Fit Width scale below the 40% manual floor on phone-sized viewers", () => {
    for (const viewerWidth of [320, 360, 390, 430]) {
      const zoom = getCourseSpecFitWidthZoom(viewerWidth, pageWidth);

      expect(zoom).not.toBeNull();
      expect(zoom!).toBeLessThan(COURSE_SPEC_PREVIEW_MANUAL_MIN_ZOOM);
      expect(
        pageWidth * zoom! + COURSE_SPEC_PREVIEW_PADDING * 2,
      ).toBeLessThanOrEqual(viewerWidth + Number.EPSILON);
    }
  });

  test("keeps desktop Fit Width equal to the available-width ratio", () => {
    const viewerWidth = 1200;
    const expected =
      (viewerWidth - COURSE_SPEC_PREVIEW_PADDING * 2) / pageWidth;

    expect(getCourseSpecFitWidthZoom(viewerWidth, pageWidth)).toBeCloseTo(
      expected,
      10,
    );
  });

  test("keeps the existing manual zoom floor after a sub-40% auto-fit", () => {
    expect(getCourseSpecManualZoomIn(0.24, 0.1)).toBe(
      COURSE_SPEC_PREVIEW_MANUAL_MIN_ZOOM,
    );
    expect(
      getCourseSpecManualZoomOut(COURSE_SPEC_PREVIEW_MANUAL_MIN_ZOOM, 0.1),
    ).toBe(COURSE_SPEC_PREVIEW_MANUAL_MIN_ZOOM);
  });

  test("rejects unusable viewer or page widths instead of inventing a zoom", () => {
    expect(getCourseSpecFitWidthZoom(0, pageWidth)).toBeNull();
    expect(getCourseSpecFitWidthZoom(40, pageWidth)).toBeNull();
    expect(getCourseSpecFitWidthZoom(320, 0)).toBeNull();
  });
});
