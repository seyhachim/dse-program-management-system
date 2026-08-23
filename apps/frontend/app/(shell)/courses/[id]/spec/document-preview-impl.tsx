"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  DEFAULT_COURSE_SPEC_DOCUMENT_THEME,
  type CourseSpecDocumentTheme,
  type CourseSpecGradingScaleBinding,
} from "@dse-pms/shared-types";
import {
  ChevronDown,
  Download,
  FileText,
  Loader2,
  Maximize2,
  Minus,
  Plus,
  Settings2,
} from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dse-pms/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { courseSpecDocumentThemeApi } from "@/lib/course-spec-document-theme";
import type { CourseDocumentModel } from "./course-document-model";
import { CourseSpecDocumentThemePanel } from "./course-spec-document-theme-panel";
import { exportCourseSpecWord } from "./document-export";
import { getCourseSpecPreviewLayout } from "./document-preview-layout";
import { exportCourseSpecPdf } from "./document-pdf-export";
import {
  PAGE_WIDTH,
  displayDocumentValue,
} from "./document-preview-pages";
import { ThemedDocumentPages } from "./themed-document-pages";

const VIEWER_PADDING = 24;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.1;
const EDITABLE_THEME_STATUSES = new Set(["Draft", "ChangesRequested"]);

const DOCUMENT_CONTENTS = [
  ["programme-overview", "Part 1. Programme Overview"],
  ["plo-taxonomy", "Part 1. PLO Taxonomy"],
  ["course-information", "1–13. Course Information"],
  ["clos", "14. CLOs"],
  ["mapping", "15. CLO–PLO Mapping"],
  ["slt", "16. Student Learning Time"],
  ["assessment-plan", "17. Assessment Plan"],
  ["lesson-plan", "18. Detailed Lesson Plan"],
  ["resources", "19. Required Resources"],
  ["references", "20. References / Textbooks"],
  ["responsibility", "21. Student Responsibility"],
  ["rubric", "22. Rubric"],
  ["policy", "23. Course Policy"],
  ["rating-scale", "24. Rating Scale"],
  ["spec-date", "25. Date"],
] as const;

type DocumentPreviewProps = {
  document: CourseDocumentModel;
  /** Exact CourseSpec id when rendering an immutable historical version. */
  courseSpecId?: string;
};

function themesEqual(
  left: CourseSpecDocumentTheme,
  right: CourseSpecDocumentTheme,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function DocumentPreview({
  document,
  courseSpecId,
}: DocumentPreviewProps) {
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const { me } = useMe();
  const viewerRef = useRef<HTMLDivElement>(null);
  const printRootRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [gradingScaleBinding, setGradingScaleBinding] =
    useState<CourseSpecGradingScaleBinding | null>(null);
  const [gradingScaleLoading, setGradingScaleLoading] = useState(true);
  const [gradingScaleError, setGradingScaleError] = useState<string | null>(null);
  const [themeDraft, setThemeDraft] = useState<CourseSpecDocumentTheme>(
    DEFAULT_COURSE_SPEC_DOCUMENT_THEME,
  );
  const [savedTheme, setSavedTheme] = useState<CourseSpecDocumentTheme>(
    DEFAULT_COURSE_SPEC_DOCUMENT_THEME,
  );
  const [programmeDefault, setProgrammeDefault] =
    useState<CourseSpecDocumentTheme>(DEFAULT_COURSE_SPEC_DOCUMENT_THEME);
  const [themeCourseSpecId, setThemeCourseSpecId] = useState<string | null>(null);
  const [themeReviewStatus, setThemeReviewStatus] = useState<string | null>(null);
  const [themeLoading, setThemeLoading] = useState(true);
  const [themeError, setThemeError] = useState<string | null>(null);
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeMessage, setThemeMessage] = useState<string | null>(null);
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);

  const canManageTheme =
    me?.roles.some(
      (role) => role === "admin" || role === "program_coordinator",
    ) ?? false;
  const previewLayout = getCourseSpecPreviewLayout(canManageTheme);
  const versionThemeEditable =
    themeCourseSpecId !== null &&
    themeReviewStatus !== null &&
    EDITABLE_THEME_STATUSES.has(themeReviewStatus);
  const effectiveCourseSpecId = courseSpecId ?? themeCourseSpecId;
  const themeDirty =
    canManageTheme && !themesEqual(themeDraft, savedTheme);

  useEffect(() => {
    let cancelled = false;
    setThemeLoading(true);
    setThemeError(null);
    setThemeMessage(null);

    courseSpecDocumentThemeApi
      .get(courseId, courseSpecId)
      .then((response) => {
        if (cancelled) return;
        setThemeDraft(response.theme);
        setSavedTheme(response.theme);
        setProgrammeDefault(response.programmeDefault);
        setThemeCourseSpecId(response.courseSpecId);
        setThemeReviewStatus(response.reviewStatus);
      })
      .catch(() => {
        if (!cancelled) {
          setThemeCourseSpecId(null);
          setThemeReviewStatus(null);
          setThemeError(
            "The version-scoped document style could not be loaded. Preview and downloads are blocked so Admin and Lecturer cannot produce different official documents.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setThemeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [courseId, courseSpecId]);

  useEffect(() => {
    if (themeLoading || themeError) {
      setGradingScaleLoading(themeLoading);
      return;
    }

    let cancelled = false;
    setGradingScaleLoading(true);
    setGradingScaleError(null);

    const bindingPath = effectiveCourseSpecId
      ? `/api/programme/grading-scales/course-specs/${encodeURIComponent(courseId)}/versions/${encodeURIComponent(effectiveCourseSpecId)}`
      : `/api/programme/grading-scales/course-specs/${encodeURIComponent(courseId)}`;

    api
      .get<CourseSpecGradingScaleBinding>(bindingPath)
      .then((binding) => {
        if (!cancelled) setGradingScaleBinding(binding);
      })
      .catch(() => {
        if (!cancelled) {
          setGradingScaleBinding(null);
          setGradingScaleError(
            "The programme grading scale could not be loaded. Preview is available, but downloads are disabled to avoid producing an incomplete academic document.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setGradingScaleLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [courseId, effectiveCourseSpecId, themeError, themeLoading]);

  const resolvedDocument = useMemo<CourseDocumentModel>(
    () => ({
      ...document,
      gradingScale:
        gradingScaleBinding?.gradingScaleVersion ?? document.gradingScale,
    }),
    [document, gradingScaleBinding],
  );

  const info = resolvedDocument.courseInformation;
  const gradingScaleReady = resolvedDocument.gradingScale !== null;
  const officialThemeReady = !themeLoading && !themeError;
  const exportDisabled =
    isExporting ||
    !officialThemeReady ||
    gradingScaleLoading ||
    !gradingScaleReady ||
    themeDirty;

  const fitWidth = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const availableWidth = viewer.clientWidth - VIEWER_PADDING * 2;
    if (availableWidth <= 0) return;
    setZoom(
      Math.max(MIN_ZOOM, Math.min(availableWidth / PAGE_WIDTH, MAX_ZOOM)),
    );
  }, []);

  useEffect(() => {
    fitWidth();
    const viewer = viewerRef.current;
    if (!viewer) return;
    const observer = new ResizeObserver(fitWidth);
    observer.observe(viewer);
    return () => observer.disconnect();
  }, [fitWidth]);

  const handleDownloadWord = async () => {
    if (exportDisabled) return;
    try {
      setIsExporting(true);
      await exportCourseSpecWord(resolvedDocument);
    } catch (error) {
      console.error("Failed to export Course Specification:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (exportDisabled) return;
    try {
      setIsExporting(true);
      const printRoot = printRootRef.current;
      if (printRoot) await exportCourseSpecPdf(printRoot, info.courseCode);
    } catch (error) {
      console.error("Failed to export Course Specification PDF:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const saveVersionTheme = async () => {
    if (!versionThemeEditable) return;
    setThemeSaving(true);
    setThemeMessage(null);
    try {
      const saved = await courseSpecDocumentThemeApi.updateVersion(
        courseId,
        themeDraft,
        effectiveCourseSpecId ?? undefined,
      );
      setThemeDraft(saved);
      setSavedTheme(saved);
      setThemeMessage(
        "Style saved for this Course Specification version. Admin and Lecturer now see the same official formatting.",
      );
    } catch (error) {
      setThemeMessage(
        error instanceof Error
          ? error.message
          : "Could not save document style.",
      );
    } finally {
      setThemeSaving(false);
    }
  };

  const saveProgrammeDefault = async () => {
    setThemeSaving(true);
    setThemeMessage(null);
    try {
      const saved = await courseSpecDocumentThemeApi.updateProgrammeDefault(
        courseId,
        themeDraft,
      );
      setProgrammeDefault(saved);
      setThemeMessage(
        "Programme default saved for future Course Spec versions. The current official preview stays on its saved version theme until you save for this version.",
      );
    } catch (error) {
      setThemeMessage(
        error instanceof Error
          ? error.message
          : "Could not save programme default.",
      );
    } finally {
      setThemeSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-base font-semibold">
              AUN Course Specification Preview
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Official saved preview for the selected Course Specification version.
            </p>
            {gradingScaleError ? (
              <p className="mt-2 max-w-2xl text-xs text-destructive">
                {gradingScaleError}
              </p>
            ) : null}
            {themeError ? (
              <p className="mt-2 max-w-2xl text-xs text-destructive">
                {themeError}
              </p>
            ) : null}
            {themeDirty ? (
              <p className="mt-2 max-w-2xl text-xs font-medium text-amber-700 dark:text-amber-300">
                Unsaved style settings are staged in Document Style. The official preview remains on the saved version theme so Admin and Lecturer stay identical. Save for this version to apply them.
              </p>
            ) : null}
            {themeMessage ? (
              <p className="mt-2 max-w-2xl text-xs text-muted-foreground">
                {themeMessage}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {previewLayout.showDocumentStyleControl ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setThemeDialogOpen(true)}
              disabled={!officialThemeReady}
            >
              <Settings2 className="mr-2 h-4 w-4" />
              Document Style
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button type="button" disabled={exportDisabled} />}
            >
              {isExporting || gradingScaleLoading || themeLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {isExporting
                ? "Generating..."
                : themeLoading
                  ? "Loading style..."
                  : gradingScaleLoading
                    ? "Loading policy..."
                    : "Download"}
              <ChevronDown className="ml-1.5 h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={handleDownloadWord}
                disabled={exportDisabled}
              >
                <Download className="h-3.5 w-3.5" />
                Download Word
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleDownloadPdf}
                disabled={exportDisabled}
              >
                <Download className="h-3.5 w-3.5" />
                Download PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {!officialThemeReady ? (
        <div className="flex min-h-[360px] items-center justify-center rounded-lg border bg-muted/30 p-6 text-center">
          <div className="max-w-lg">
            {themeLoading ? (
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
            ) : null}
            <p className="mt-3 text-sm font-medium">
              {themeLoading
                ? "Loading the version-scoped document style…"
                : "Official preview unavailable"}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              The PMS only renders an official Course Specification after its exact saved style is available, so different roles cannot silently receive different formatting.
            </p>
          </div>
        </div>
      ) : (
        <div className={previewLayout.gridClassName}>
          <aside className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-sm font-semibold">Document Information</h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Course Code</dt>
                  <dd className="mt-0.5 font-medium">
                    {displayDocumentValue(info.courseCode)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Course Title</dt>
                  <dd className="mt-0.5 font-medium">
                    {displayDocumentValue(info.courseTitle)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Sections</dt>
                  <dd className="mt-0.5 font-medium">Part 1 + Sections 1–25</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Format</dt>
                  <dd className="mt-0.5 font-medium">A4 Landscape</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Version source</dt>
                  <dd className="mt-0.5 break-all font-medium">
                    {effectiveCourseSpecId ?? "Programme default / not started"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Grading Scale</dt>
                  <dd className="mt-0.5 font-medium">
                    {resolvedDocument.gradingScale
                      ? `${resolvedDocument.gradingScale.name} · v${resolvedDocument.gradingScale.version}`
                      : gradingScaleLoading
                        ? "Loading…"
                        : "Unavailable"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Official style</dt>
                  <dd className="mt-0.5 font-medium">
                    {savedTheme.bodyFontFamily} · {savedTheme.bodyFontSizePt} pt
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-sm font-semibold">Contents</h3>
              <nav className="mt-3 space-y-1 text-sm">
                {DOCUMENT_CONTENTS.map(([id, label]) => (
                  <a
                    key={id}
                    href={`#${id}`}
                    className="block rounded-md px-2 py-2 hover:bg-muted"
                  >
                    {label}
                  </a>
                ))}
              </nav>
            </div>
          </aside>

          <main
            ref={viewerRef}
            className="relative min-h-0 overflow-auto rounded-lg border bg-muted/40"
          >
            <div className="sticky top-0 z-30 flex h-11 items-center justify-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
              <button
                type="button"
                onClick={() =>
                  setZoom((current) =>
                    Math.max(
                      MIN_ZOOM,
                      Number((current - ZOOM_STEP).toFixed(2)),
                    ),
                  )
                }
                disabled={zoom <= MIN_ZOOM}
                className="flex h-7 w-7 items-center justify-center rounded-md border bg-background hover:bg-muted disabled:opacity-40"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[54px] text-center text-xs font-medium tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() =>
                  setZoom((current) =>
                    Math.min(
                      MAX_ZOOM,
                      Number((current + ZOOM_STEP).toFixed(2)),
                    ),
                  )
                }
                disabled={zoom >= MAX_ZOOM}
                className="flex h-7 w-7 items-center justify-center rounded-md border bg-background hover:bg-muted disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <div className="mx-1 h-5 w-px bg-border" />
              <button
                type="button"
                onClick={fitWidth}
                className="flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium hover:bg-muted"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Fit Width
              </button>
            </div>

            <div
              ref={printRootRef}
              className="mx-auto"
              style={{
                width: PAGE_WIDTH * zoom + VIEWER_PADDING * 2,
                padding: VIEWER_PADDING,
              }}
            >
              <ThemedDocumentPages
                document={resolvedDocument}
                zoom={zoom}
                theme={savedTheme}
              />
            </div>
          </main>
        </div>
      )}

      {previewLayout.showDocumentStyleControl ? (
        <Dialog open={themeDialogOpen} onOpenChange={setThemeDialogOpen}>
          <DialogContent className="p-0 sm:max-w-xl">
            <DialogHeader className="sr-only">
              <DialogTitle>Course Specification Document Style</DialogTitle>
            </DialogHeader>
            <div className="max-h-[85vh] overflow-y-auto p-4">
              <CourseSpecDocumentThemePanel
                value={themeDraft}
                programmeDefault={programmeDefault}
                onChange={setThemeDraft}
                onSaveVersion={saveVersionTheme}
                onSaveProgrammeDefault={saveProgrammeDefault}
                onResetToProgrammeDefault={() => {
                  setThemeDraft(programmeDefault);
                  setThemeMessage(
                    "Programme default loaded into the style form. The official preview remains unchanged until you save for this version.",
                  );
                }}
                saving={themeSaving}
                versionEditable={versionThemeEditable}
              />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
