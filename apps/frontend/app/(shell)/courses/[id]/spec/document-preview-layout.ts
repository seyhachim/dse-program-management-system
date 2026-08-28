export const COURSE_SPEC_PREVIEW_GRID_CLASS =
  "relative grid min-w-0 items-start gap-4 lg:grid-cols-[250px_minmax(0,1fr)] lg:[&>main]:absolute lg:[&>main]:inset-y-0 lg:[&>main]:right-0 lg:[&>main]:left-[calc(250px+1rem)]";

export type CourseSpecPreviewLayout = {
  gridClassName: string;
  showDocumentStyleControl: boolean;
};

/**
 * Role differences are controls only. The official document viewport must keep
 * the same geometry for governance and lecturer access so Fit Width resolves
 * to the same zoom for the same browser width.
 *
 * On desktop, the left information/Contents column stays in normal flow and
 * therefore defines the preview workspace height. The document viewer is
 * absolutely positioned into the second-column area and fills that exact height,
 * so its existing `overflow-auto` becomes the Word-style page scroller instead
 * of allowing the A4 page stack to extend the outer application page.
 *
 * On narrow layouts the absolute-positioning variants do not apply, so the
 * sidebar and document viewer return to ordinary content-driven vertical flow.
 */
export function getCourseSpecPreviewLayout(
  canManageTheme: boolean,
): CourseSpecPreviewLayout {
  return {
    gridClassName: COURSE_SPEC_PREVIEW_GRID_CLASS,
    showDocumentStyleControl: canManageTheme,
  };
}
