export const COURSE_SPEC_PREVIEW_GRID_CLASS =
  "grid min-w-0 items-start gap-4 lg:grid-cols-[250px_minmax(0,1fr)]";

export const COURSE_SPEC_PREVIEW_VIEWER_CLASS =
  "relative h-[70vh] min-h-[420px] overflow-auto rounded-lg border bg-muted/40 lg:h-[72vh] lg:min-h-[560px]";

export const COURSE_SPEC_PREVIEW_DEFAULT_ZOOM = 0.9;

export type CourseSpecPreviewLayout = {
  gridClassName: string;
  viewerClassName: string;
  showDocumentStyleControl: boolean;
};

/**
 * Role differences are controls only. The official document viewport must keep
 * the same geometry for governance and lecturer access.
 *
 * The 250px desktop sidebar gives the Contents navigation enough usable width
 * after card padding/scrollbar space without allowing it to force the document
 * canvas wider than its container. The document column stays minmax(0, 1fr), so
 * horizontal zoom overflow stays inside the preview viewer.
 *
 * The preview viewer intentionally behaves like an embedded document browser:
 * it has its own vertical/horizontal scrolling area while the surrounding PMS
 * page remains stable. The default visual zoom is 90%; Fit Width stays available
 * as an explicit user action rather than silently overriding that default.
 */
export function getCourseSpecPreviewLayout(
  canManageTheme: boolean,
): CourseSpecPreviewLayout {
  return {
    gridClassName: COURSE_SPEC_PREVIEW_GRID_CLASS,
    viewerClassName: COURSE_SPEC_PREVIEW_VIEWER_CLASS,
    showDocumentStyleControl: canManageTheme,
  };
}
