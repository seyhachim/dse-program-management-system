export const COURSE_SPEC_PREVIEW_GRID_CLASS =
  "relative grid min-w-0 items-start gap-4 lg:grid-cols-[250px_minmax(0,1fr)] lg:[&>main]:absolute lg:[&>main]:inset-y-0 lg:[&>main]:right-0 lg:[&>main]:left-[calc(250px+1rem)]";

export const COURSE_SPEC_PREVIEW_PADDING = 24;
export const COURSE_SPEC_PREVIEW_MANUAL_MIN_ZOOM = 0.4;
export const COURSE_SPEC_PREVIEW_MAX_ZOOM = 1.5;

export type CourseSpecPreviewLayout = {
  gridClassName: string;
  showDocumentStyleControl: boolean;
};

/**
 * Fit Width is a viewport calculation, not a manual zoom action. In particular,
 * phone-sized viewers need to scale the fixed A4 landscape canvas below the
 * deliberate 40% manual zoom floor. Clamping auto-fit to the manual minimum
 * makes the page wider than the viewer and clips its left/right edges.
 */
export function getCourseSpecFitWidthZoom(
  viewerWidth: number,
  pageWidth: number,
): number | null {
  if (!Number.isFinite(viewerWidth) || !Number.isFinite(pageWidth)) return null;
  if (viewerWidth <= 0 || pageWidth <= 0) return null;

  const availableWidth = viewerWidth - COURSE_SPEC_PREVIEW_PADDING * 2;
  if (availableWidth <= 0) return null;

  return Math.min(availableWidth / pageWidth, COURSE_SPEC_PREVIEW_MAX_ZOOM);
}

export function getCourseSpecManualZoomIn(
  currentZoom: number,
  step: number,
): number {
  return Math.min(
    COURSE_SPEC_PREVIEW_MAX_ZOOM,
    Math.max(
      COURSE_SPEC_PREVIEW_MANUAL_MIN_ZOOM,
      Number((currentZoom + step).toFixed(2)),
    ),
  );
}

export function getCourseSpecManualZoomOut(
  currentZoom: number,
  step: number,
): number {
  return Math.max(
    COURSE_SPEC_PREVIEW_MANUAL_MIN_ZOOM,
    Number((currentZoom - step).toFixed(2)),
  );
}

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
