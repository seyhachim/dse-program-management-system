import { describe, expect, test } from "bun:test";
import {
  getCourseSpecFitWidthZoom,
  getCourseSpecManualZoom,
  getCourseSpecPreviewLayout,
} from "./document-preview-layout";

const PAGE_WIDTH = 1123;
const VIEWER_PADDING = 24;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.1;

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

  test("allows automatic Fit Width below the manual 40% floor on phone widths", () => {
    for (const viewerWidth of [320, 360, 390, 430]) {
      const zoom = getCourseSpecFitWidthZoom(
        viewerWidth,
        PAGE_WIDTH,
        VIEWER_PADDING,
        MAX_ZOOM,
      );

      expect(zoom).not.toBeNull();
      expect(zoom!).toBeLessThan(MIN_ZOOM);
      expect(PAGE_WIDTH * zoom! + VIEWER_PADDING * 2).toBeCloseTo(
        viewerWidth,
        8,
      );
    }
  });

  test("keeps desktop Fit Width equivalent when the calculated zoom is above 40%", () => {
    const zoom = getCourseSpecFitWidthZoom(
      900,
      PAGE_WIDTH,
      VIEWER_PADDING,
      MAX_ZOOM,
    );

    expect(zoom).toBeCloseTo((900 - VIEWER_PADDING * 2) / PAGE_WIDTH, 8);
    expect(zoom!).toBeGreaterThan(MIN_ZOOM);
  });

  test("retains the manual zoom floor after an automatic sub-40% fit", () => {
    expect(
      getCourseSpecManualZoom(0.24, ZOOM_STEP, MIN_ZOOM, MAX_ZOOM),
    ).toBe(MIN_ZOOM);
    expect(
      getCourseSpecManualZoom(MIN_ZOOM, -ZOOM_STEP, MIN_ZOOM, MAX_ZOOM),
    ).toBe(MIN_ZOOM);
    expect(
      getCourseSpecManualZoom(MAX_ZOOM, ZOOM_STEP, MIN_ZOOM, MAX_ZOOM),
    ).toBe(MAX_ZOOM);
  });

  test("rejects unusable Fit Width geometry instead of producing an invalid zoom", () => {
    expect(
      getCourseSpecFitWidthZoom(40, PAGE_WIDTH, VIEWER_PADDING, MAX_ZOOM),
    ).toBeNull();
    expect(
      getCourseSpecFitWidthZoom(320, 0, VIEWER_PADDING, MAX_ZOOM),
    ).toBeNull();
  });

  test("re-runs Fit Width setup when the async official preview becomes ready", async () => {
    const source = await Bun.file(
      new URL("./document-preview-impl.tsx", import.meta.url),
    ).text();

    expect(source).toContain("if (!officialThemeReady) return;");
    expect(source).toContain("[fitWidth, officialThemeReady]");
  });
});
