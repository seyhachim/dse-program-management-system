import { describe, expect, test } from "bun:test";
import { getCourseSpecPreviewLayout } from "./document-preview-layout";

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
