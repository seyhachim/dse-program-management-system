export const COURSE_SPEC_PREVIEW_GRID_CLASS =
  "grid items-start gap-4 lg:grid-cols-[210px_minmax(0,1fr)]";

export type CourseSpecPreviewLayout = {
  gridClassName: string;
  showDocumentStyleControl: boolean;
};

/**
 * Role differences are controls only. The official document viewport must keep
 * the same geometry for governance and lecturer access so Fit Width resolves
 * to the same zoom for the same browser width.
 *
 * The document workspace intentionally does not impose a fixed viewport height.
 * Pages flow vertically like a desktop word processor while horizontal overflow
 * from manual zoom remains contained by the viewer canvas.
 */
export function getCourseSpecPreviewLayout(
  canManageTheme: boolean,
): CourseSpecPreviewLayout {
  return {
    gridClassName: COURSE_SPEC_PREVIEW_GRID_CLASS,
    showDocumentStyleControl: canManageTheme,
  };
}
