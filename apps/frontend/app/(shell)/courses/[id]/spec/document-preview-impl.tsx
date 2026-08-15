"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  FileText,
  Loader2,
  Maximize2,
  Minus,
  Plus,
} from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@dse-pms/ui";
import type { CourseDocumentModel } from "./course-document-model";
import { exportCourseSpecWord } from "./document-export";
import { exportCourseSpecPdf } from "./document-pdf-export";
import {
  DocumentPages,
  PAGE_WIDTH,
  displayDocumentValue,
} from "./document-preview-pages";

const VIEWER_PADDING = 24;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.1;

type DocumentPreviewProps = { document: CourseDocumentModel };

export function DocumentPreview({ document }: DocumentPreviewProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const printRootRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const info = document.courseInformation;

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
    if (isExporting) return;
    try {
      setIsExporting(true);
      await exportCourseSpecWord(document);
    } catch (error) {
      console.error("Failed to export Course Specification:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (isExporting) return;
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
              Preview the required programme Part 1 cover and structured course
              specification.
            </p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" disabled={isExporting} />}
          >
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {isExporting ? "Generating..." : "Download"}
            <ChevronDown className="ml-1.5 h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={handleDownloadWord}
              disabled={isExporting}
            >
              <Download className="h-3.5 w-3.5" />
              Download Word
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDownloadPdf} disabled={isExporting}>
              <Download className="h-3.5 w-3.5" />
              Download PDF
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid h-[calc(100vh-250px)] min-h-[650px] gap-4 lg:grid-cols-[210px_minmax(0,1fr)]">
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
            </dl>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold">Contents</h3>
            <nav className="mt-3 space-y-1 text-sm">
              <a href="#programme-overview" className="block rounded-md px-2 py-2 hover:bg-muted">Part 1. Programme Overview</a>
              <a href="#plo-taxonomy" className="block rounded-md px-2 py-2 hover:bg-muted">Part 1. PLO Taxonomy</a>
              <a href="#course-information" className="block rounded-md px-2 py-2 hover:bg-muted">1–13. Course Information</a>
              <a href="#clos" className="block rounded-md px-2 py-2 hover:bg-muted">14. CLOs</a>
              <a href="#mapping" className="block rounded-md px-2 py-2 hover:bg-muted">15. CLO–PLO Mapping</a>
              <a href="#slt" className="block rounded-md px-2 py-2 hover:bg-muted">16. Student Learning Time</a>
              <a href="#assessment-plan" className="block rounded-md px-2 py-2 hover:bg-muted">17. Assessment Plan</a>
              <a href="#lesson-plan" className="block rounded-md px-2 py-2 hover:bg-muted">18. Detailed Lesson Plan</a>
              <a href="#resources" className="block rounded-md px-2 py-2 hover:bg-muted">19. Required Resources</a>
              <a href="#references" className="block rounded-md px-2 py-2 hover:bg-muted">20. References / Textbooks</a>
              <a href="#responsibility" className="block rounded-md px-2 py-2 hover:bg-muted">21. Student Responsibility</a>
              <a href="#rubric" className="block rounded-md px-2 py-2 hover:bg-muted">22. Rubric</a>
              <a href="#policy" className="block rounded-md px-2 py-2 hover:bg-muted">23. Course Policy</a>
              <a href="#rating-scale" className="block rounded-md px-2 py-2 hover:bg-muted">24. Rating Scale</a>
              <a href="#spec-date" className="block rounded-md px-2 py-2 hover:bg-muted">25. Date</a>
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
                setZoom((z) =>
                  Math.max(MIN_ZOOM, Number((z - ZOOM_STEP).toFixed(2))),
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
                setZoom((z) =>
                  Math.min(MAX_ZOOM, Number((z + ZOOM_STEP).toFixed(2))),
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
            <DocumentPages document={document} zoom={zoom} />
          </div>
        </main>
      </div>
    </div>
  );
}
