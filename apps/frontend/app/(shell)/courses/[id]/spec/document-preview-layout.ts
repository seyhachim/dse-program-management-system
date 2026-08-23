export const COURSE_SPEC_PREVIEW_GRID_CLASS =
  "grid h-[calc(100vh-250px)] min-h-[650px] gap-4 lg:grid-cols-[210px_minmax(0,1fr)]";

export type CourseSpecPreviewLayout = {
  gridClassName: string;
  showDocumentStyleControl: boolean;
};

/**
 * Role differences are controls only. The official document viewport must keep
 * the same geometry for governance and lecturer access so Fit Width resolves
 * to the same zoom for the same browser width.
 */
export function getCourseSpecPreviewLayout(
  canManageTheme: boolean,
): CourseSpecPreviewLayout {
  return {
    gridClassName: COURSE_SPEC_PREVIEW_GRID_CLASS,
    showDocumentStyleControl: canManageTheme,
  };
}
