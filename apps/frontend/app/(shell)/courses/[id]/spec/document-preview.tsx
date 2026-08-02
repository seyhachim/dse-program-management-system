"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  FileText,
  Loader2,
  Maximize2,
  Minus,
  Plus,
} from "lucide-react";

import { Button } from "@dse-pms/ui";

import {
  COURSE_DOCUMENT_STYLE,
  type CourseDocumentModel,
} from "./course-document-model";
import { exportCourseSpecWord } from "./document-export";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const PAGE_WIDTH = 1123;
const PAGE_HEIGHT = 794;

const VIEWER_PADDING = 24;
const PAGE_GAP = 40;

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.1;

/* -------------------------------------------------------------------------- */
/* Props                                                                      */
/* -------------------------------------------------------------------------- */

type DocumentPreviewProps = {
  document: CourseDocumentModel;
};

/* -------------------------------------------------------------------------- */
/* Generic helpers                                                            */
/* -------------------------------------------------------------------------- */

function displayValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || String(value).trim() === "") {
    return "—";
  }

  return String(value);
}

function joinValues(values: string[]): string {
  if (!values.length) {
    return "—";
  }

  return values.join(", ");
}

/* -------------------------------------------------------------------------- */
/* Preview page                                                               */
/* -------------------------------------------------------------------------- */

function PreviewPage({
  zoom,
  pageNumber,
  children,
}: {
  zoom: number;
  pageNumber: number;
  children: ReactNode;
}) {
  const scaledWidth = PAGE_WIDTH * zoom;
  const scaledHeight = PAGE_HEIGHT * zoom;

  return (
    <div
      className="relative mx-auto"
      style={{
        width: scaledWidth,
        height: scaledHeight + PAGE_GAP,
      }}
    >
      <article
        className="absolute left-0 top-0 overflow-hidden bg-white text-black shadow-md ring-1 ring-black/5"
        style={{
          width: PAGE_WIDTH,
          height: PAGE_HEIGHT,

          transform: `scale(${zoom})`,
          transformOrigin: "top left",

          fontFamily: COURSE_DOCUMENT_STYLE.fontFamily,
        }}
      >
        {children}
      </article>

      <div
        className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground"
        style={{
          top: scaledHeight + 8,
        }}
      >
        Page {pageNumber}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Course Information table helpers                                           */
/* -------------------------------------------------------------------------- */

function LabelCell({
  number,
  children,
  className = "",
}: {
  number: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <td
      className={[
        "border border-black",
        "px-3 py-2",
        "align-middle",
        "font-semibold",
        "break-words",
        className,
      ].join(" ")}
      style={{
        backgroundColor: COURSE_DOCUMENT_STYLE.labelBackground,
      }}
    >
      <div className="flex items-start gap-2">
        <span className="shrink-0 font-normal">{number}.</span>

        <span className="min-w-0">{children}</span>
      </div>
    </td>
  );
}

function ValueCell({
  children,
  colSpan,
  className = "",
}: {
  children?: ReactNode;
  colSpan?: number;
  className?: string;
}) {
  return (
    <td
      colSpan={colSpan}
      className={[
        "border border-black",
        "px-3 py-2",
        "align-top",
        "break-words",
        className,
      ].join(" ")}
    >
      {children || "—"}
    </td>
  );
}

/* -------------------------------------------------------------------------- */
/* Checkbox                                                                   */
/* -------------------------------------------------------------------------- */

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      className="inline-block w-4 text-center font-serif"
      aria-hidden="true"
    >
      {checked ? "☑" : "☐"}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Course Type                                                                */
/* -------------------------------------------------------------------------- */

function CourseTypeDisplay({ value }: { value: string }) {
  const normalized = value.trim().toLowerCase();

  const isSelected = (...values: string[]) =>
    values.some((candidate) => normalized === candidate.toLowerCase());

  return (
    <div className="flex flex-wrap gap-x-8 gap-y-1">
      <span className="whitespace-nowrap">
        Basic <Checkbox checked={isSelected("Basic")} />
      </span>

      <span className="whitespace-nowrap">
        Core <Checkbox checked={isSelected("Core")} />
      </span>

      <span className="whitespace-nowrap">
        Elective <Checkbox checked={isSelected("Elective")} />
      </span>

      <span className="whitespace-nowrap">
        Specialization{" "}
        <Checkbox checked={isSelected("Specialization", "Specialisation")} />
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Course Availability                                                        */
/* -------------------------------------------------------------------------- */

function CourseAvailability({ semester }: { semester: string }) {
  const normalized = semester.trim().toLowerCase();

  const first = normalized.includes("1") || normalized.includes("first");

  const second = normalized.includes("2") || normalized.includes("second");

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1">
      <span className="whitespace-nowrap">
        1st Semester <Checkbox checked={first} />
      </span>

      <span className="whitespace-nowrap">
        2nd Semester <Checkbox checked={second} />
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Standard document tables                                                   */
/* -------------------------------------------------------------------------- */

function DocumentTable({ children }: { children: ReactNode }) {
  return (
    <table className="w-full table-fixed border-collapse font-serif text-[11px] leading-[1.35]">
      {children}
    </table>
  );
}

function TableHeaderCell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={[
        "border border-black",
        "bg-slate-50",
        "px-2 py-2",
        "text-left",
        "align-middle",
        "font-semibold",
        "break-words",
        className,
      ].join(" ")}
    >
      {children}
    </th>
  );
}

function TableCell({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <td
      className={[
        "border border-black",
        "px-2 py-2",
        "align-top",
        "break-words",
        "whitespace-normal",
        className,
      ].join(" ")}
    >
      {children || "—"}
    </td>
  );
}

/* -------------------------------------------------------------------------- */
/* Section heading                                                            */
/* -------------------------------------------------------------------------- */

function SectionTitle({
  number,
  children,
}: {
  number: string;
  children: ReactNode;
}) {
  return (
    <h2 className="mb-4 font-serif text-[16px] font-bold">
      {number}. {children}
    </h2>
  );
}

/* -------------------------------------------------------------------------- */
/* Main Component                                                             */
/* -------------------------------------------------------------------------- */

export function DocumentPreview({ document }: DocumentPreviewProps) {
  const viewerRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState(1);

  const [isExporting, setIsExporting] = useState(false);

  const info = document.courseInformation;

  /* ------------------------------------------------------------------------ */
  /* Zoom                                                                     */
  /* ------------------------------------------------------------------------ */

  const fitWidth = useCallback(() => {
    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    const availableWidth = viewer.clientWidth - VIEWER_PADDING * 2;

    if (availableWidth <= 0) {
      return;
    }

    const calculatedZoom = availableWidth / PAGE_WIDTH;

    const nextZoom = Math.min(calculatedZoom, 1);

    setZoom(Math.max(MIN_ZOOM, nextZoom));
  }, []);

  const zoomIn = () => {
    setZoom((current) =>
      Math.min(MAX_ZOOM, Number((current + ZOOM_STEP).toFixed(2))),
    );
  };

  const zoomOut = () => {
    setZoom((current) =>
      Math.max(MIN_ZOOM, Number((current - ZOOM_STEP).toFixed(2))),
    );
  };

  /* ------------------------------------------------------------------------ */
  /* Automatically fit page                                                   */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    fitWidth();

    const observer = new ResizeObserver(() => {
      fitWidth();
    });

    observer.observe(viewer);

    return () => {
      observer.disconnect();
    };
  }, [fitWidth]);

  /* ------------------------------------------------------------------------ */
  /* Download Word                                                            */
  /* ------------------------------------------------------------------------ */

  const handleDownloadWord = async () => {
    if (isExporting) {
      return;
    }

    try {
      setIsExporting(true);

      await exportCourseSpecWord(document);
    } catch (error) {
      console.error("Failed to export Course Specification:", error);
    } finally {
      setIsExporting(false);
    }
  };

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="space-y-4">
      {/* ================================================================== */}
      {/* Main toolbar                                                       */}
      {/* ================================================================== */}

      <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>

          <div>
            <h2 className="text-base font-semibold">Course Specification</h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Review the document below before downloading the Word version.
            </p>
          </div>
        </div>

        <Button
          type="button"
          onClick={handleDownloadWord}
          disabled={isExporting}
        >
          {isExporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}

          {isExporting ? "Generating..." : "Download Word"}
        </Button>
      </div>

      {/* ================================================================== */}
      {/* Document workspace                                                 */}
      {/* ================================================================== */}

      <div className="grid h-[calc(100vh-250px)] min-h-[650px] gap-4 lg:grid-cols-[210px_minmax(0,1fr)]">
        {/* ================================================================ */}
        {/* Sidebar                                                          */}
        {/* ================================================================ */}

        <aside className="min-h-0 space-y-4 overflow-y-auto pr-1">
          {/* Document information */}

          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold">Document Information</h3>

            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Course Code</dt>

                <dd className="mt-0.5 font-medium">
                  {displayValue(info.courseCode)}
                </dd>
              </div>

              <div>
                <dt className="text-xs text-muted-foreground">Course Title</dt>

                <dd className="mt-0.5 font-medium">
                  {displayValue(info.courseTitle)}
                </dd>
              </div>

              <div>
                <dt className="text-xs text-muted-foreground">Document</dt>

                <dd className="mt-0.5 font-medium">Course Specification</dd>
              </div>

              <div>
                <dt className="text-xs text-muted-foreground">Format</dt>

                <dd className="mt-0.5 font-medium">A4 Landscape</dd>
              </div>
            </dl>
          </div>

          {/* Contents */}

          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold">Contents</h3>

            <nav className="mt-3 space-y-1 text-sm">
              <a
                href="#course-information"
                className="block rounded-md px-2 py-2 transition-colors hover:bg-muted"
              >
                1. Course Information
              </a>

              <a
                href="#course-learning-outcomes"
                className="block rounded-md px-2 py-2 transition-colors hover:bg-muted"
              >
                2. Course Learning Outcomes
              </a>

              <a
                href="#weekly-teaching-plan"
                className="block rounded-md px-2 py-2 transition-colors hover:bg-muted"
              >
                3. Weekly Teaching Plan
              </a>

              <a
                href="#assessment"
                className="block rounded-md px-2 py-2 transition-colors hover:bg-muted"
              >
                4. Assessment
              </a>
            </nav>
          </div>
        </aside>

        {/* ================================================================ */}
        {/* Document Viewer                                                  */}
        {/* ================================================================ */}

        <main
          ref={viewerRef}
          className="relative min-h-0 overflow-auto rounded-lg border bg-muted/40"
        >
          {/* -------------------------------------------------------------- */}
          {/* Viewer controls                                                */}
          {/* -------------------------------------------------------------- */}

          <div className="sticky top-0 z-30 flex h-11 items-center justify-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
            <button
              type="button"
              onClick={zoomOut}
              disabled={zoom <= MIN_ZOOM}
              className="flex h-7 w-7 items-center justify-center rounded-md border bg-background transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              title="Zoom out"
              aria-label="Zoom out"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>

            <span className="min-w-[54px] text-center text-xs font-medium tabular-nums">
              {Math.round(zoom * 100)}%
            </span>

            <button
              type="button"
              onClick={zoomIn}
              disabled={zoom >= MAX_ZOOM}
              className="flex h-7 w-7 items-center justify-center rounded-md border bg-background transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              title="Zoom in"
              aria-label="Zoom in"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>

            <div className="mx-1 h-5 w-px bg-border" />

            <button
              type="button"
              onClick={fitWidth}
              className="flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium transition-colors hover:bg-muted"
              title="Fit page to viewer width"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Fit Width
            </button>
          </div>

          {/* -------------------------------------------------------------- */}
          {/* Pages container                                                */}
          {/* -------------------------------------------------------------- */}

          <div
            className="mx-auto"
            style={{
              width: PAGE_WIDTH * zoom + VIEWER_PADDING * 2,

              paddingTop: VIEWER_PADDING,

              paddingRight: VIEWER_PADDING,

              paddingBottom: VIEWER_PADDING,

              paddingLeft: VIEWER_PADDING,
            }}
          >
            {/* ============================================================ */}
            {/* PAGE 1                                                       */}
            {/* ============================================================ */}

            <PreviewPage zoom={zoom} pageNumber={1}>
              <div
                id="course-information"
                className="h-full scroll-mt-16 px-[54px] py-[48px]"
              >
                {/* Header */}

                <header>
                  <h1 className="font-serif text-[20px] font-bold uppercase tracking-tight">
                    {document.partTitle}
                  </h1>

                  <p className="mt-3 font-serif text-[13px] font-bold">
                    Course Information
                  </p>
                </header>

                {/* Course Information */}

                <table className="mt-4 w-full table-fixed border-collapse font-serif text-[12px] leading-[1.3]">
                  <colgroup>
                    <col className="w-[28%]" />
                    <col className="w-[25%]" />
                    <col className="w-[15%]" />
                    <col className="w-[32%]" />
                  </colgroup>

                  <tbody>
                    {/* 1 */}

                    <tr>
                      <LabelCell number="1">Programme Title</LabelCell>

                      <ValueCell colSpan={3}>
                        {displayValue(info.programmeTitle)}
                      </ValueCell>
                    </tr>

                    {/* 2 */}

                    <tr>
                      <LabelCell number="2">Course Title</LabelCell>

                      <ValueCell colSpan={3}>
                        {displayValue(info.courseTitle)}
                      </ValueCell>
                    </tr>

                    {/* 3 + 4 */}

                    <tr>
                      <LabelCell number="3">Course Code</LabelCell>

                      <ValueCell>{displayValue(info.courseCode)}</ValueCell>

                      <LabelCell number="4">No. of Credits</LabelCell>

                      <ValueCell>{displayValue(info.credits)}</ValueCell>
                    </tr>

                    {/* 5 */}

                    <tr>
                      <LabelCell number="5">Pre-requisites (If any)</LabelCell>

                      <ValueCell colSpan={3}>
                        {displayValue(info.prerequisites)}
                      </ValueCell>
                    </tr>

                    {/* 6 + 7 */}

                    <tr>
                      <LabelCell number="6">Course Instructor</LabelCell>

                      <ValueCell>{displayValue(info.instructor)}</ValueCell>

                      <LabelCell number="7">Qualification</LabelCell>

                      <ValueCell>{displayValue(info.qualification)}</ValueCell>
                    </tr>

                    {/* 8 + 9 */}

                    <tr>
                      <LabelCell number="8">Email</LabelCell>

                      <ValueCell>{displayValue(info.email)}</ValueCell>

                      <LabelCell number="9">Telephone No.</LabelCell>

                      <ValueCell>{displayValue(info.telephone)}</ValueCell>
                    </tr>

                    {/* 10 */}

                    <tr>
                      <LabelCell number="10">
                        Other Course Lecturer(s) (If any)
                      </LabelCell>

                      <ValueCell colSpan={3}>
                        {displayValue(info.otherLecturers)}
                      </ValueCell>
                    </tr>

                    {/* 11 */}

                    <tr>
                      <LabelCell number="11">Course Type</LabelCell>

                      <ValueCell colSpan={3}>
                        <CourseTypeDisplay value={info.courseType} />
                      </ValueCell>
                    </tr>

                    {/* 12 */}

                    <tr>
                      <LabelCell number="12">Course Availability</LabelCell>

                      <ValueCell>
                        <CourseAvailability semester={info.semester} />
                      </ValueCell>

                      <td
                        className="border border-black px-3 py-2 align-middle font-semibold"
                        style={{
                          backgroundColor:
                            COURSE_DOCUMENT_STYLE.labelBackground,
                        }}
                      >
                        Year
                      </td>

                      <ValueCell>{displayValue(info.programmeYear)}</ValueCell>
                    </tr>

                    {/* 13 */}

                    <tr>
                      <LabelCell number="13" className="align-middle">
                        Course Description / Synopsis
                      </LabelCell>

                      <ValueCell
                        colSpan={3}
                        className="whitespace-pre-wrap break-words leading-[1.45]"
                      >
                        {displayValue(info.description)}
                      </ValueCell>
                    </tr>
                  </tbody>
                </table>
              </div>
            </PreviewPage>

            {/* ============================================================ */}
            {/* PAGE 2                                                       */}
            {/* ============================================================ */}

            <PreviewPage zoom={zoom} pageNumber={2}>
              <div className="h-full px-[54px] py-[48px]">
                {/* -------------------------------------------------------- */}
                {/* CLOs                                                     */}
                {/* -------------------------------------------------------- */}

                <section id="course-learning-outcomes" className="scroll-mt-16">
                  <SectionTitle number="2">
                    Course Learning Outcomes
                  </SectionTitle>

                  {document.clos.length === 0 ? (
                    <p className="font-serif text-[12px]">
                      No Course Learning Outcomes have been added.
                    </p>
                  ) : (
                    <DocumentTable>
                      <colgroup>
                        <col className="w-[10%]" />
                        <col className="w-[78%]" />
                        <col className="w-[12%]" />
                      </colgroup>

                      <thead>
                        <tr>
                          <TableHeaderCell>CLO</TableHeaderCell>

                          <TableHeaderCell>Learning Outcome</TableHeaderCell>

                          <TableHeaderCell>Level</TableHeaderCell>
                        </tr>
                      </thead>

                      <tbody>
                        {document.clos.map((clo) => (
                          <tr key={clo.code}>
                            <TableCell className="font-medium">
                              {displayValue(clo.code)}
                            </TableCell>

                            <TableCell>{displayValue(clo.outcome)}</TableCell>

                            <TableCell>{displayValue(clo.level)}</TableCell>
                          </tr>
                        ))}
                      </tbody>
                    </DocumentTable>
                  )}
                </section>

                {/* -------------------------------------------------------- */}
                {/* Weekly Plan                                              */}
                {/* -------------------------------------------------------- */}

                <section
                  id="weekly-teaching-plan"
                  className="mt-8 scroll-mt-16"
                >
                  <SectionTitle number="3">Weekly Teaching Plan</SectionTitle>

                  {document.weeklyPlan.length === 0 ? (
                    <p className="font-serif text-[12px]">
                      No weekly teaching plan has been added.
                    </p>
                  ) : (
                    <DocumentTable>
                      <colgroup>
                        <col className="w-[8%]" />
                        <col className="w-[62%]" />
                        <col className="w-[18%]" />
                        <col className="w-[12%]" />
                      </colgroup>

                      <thead>
                        <tr>
                          <TableHeaderCell>Week</TableHeaderCell>

                          <TableHeaderCell>Topic</TableHeaderCell>

                          <TableHeaderCell>CLO</TableHeaderCell>

                          <TableHeaderCell>SLT</TableHeaderCell>
                        </tr>
                      </thead>

                      <tbody>
                        {document.weeklyPlan.map((week) => (
                          <tr key={week.id}>
                            <TableCell>{displayValue(week.week)}</TableCell>

                            <TableCell>{displayValue(week.topic)}</TableCell>

                            <TableCell>{joinValues(week.cloCodes)}</TableCell>

                            <TableCell>
                              {week.sltHours ? `${week.sltHours} h` : "—"}
                            </TableCell>
                          </tr>
                        ))}
                      </tbody>
                    </DocumentTable>
                  )}
                </section>

                {/* -------------------------------------------------------- */}
                {/* Assessment                                               */}
                {/* -------------------------------------------------------- */}

                <section id="assessment" className="mt-8 scroll-mt-16">
                  <SectionTitle number="4">Assessment</SectionTitle>

                  {document.assessments.length === 0 ? (
                    <p className="font-serif text-[12px]">
                      No assessments have been added.
                    </p>
                  ) : (
                    <DocumentTable>
                      <colgroup>
                        <col className="w-[45%]" />
                        <col className="w-[20%]" />
                        <col className="w-[20%]" />
                        <col className="w-[15%]" />
                      </colgroup>

                      <thead>
                        <tr>
                          <TableHeaderCell>Assessment</TableHeaderCell>

                          <TableHeaderCell>Type</TableHeaderCell>

                          <TableHeaderCell>CLO</TableHeaderCell>

                          <TableHeaderCell>Weight</TableHeaderCell>
                        </tr>
                      </thead>

                      <tbody>
                        {document.assessments.map((assessment) => (
                          <tr key={assessment.id}>
                            <TableCell>
                              {displayValue(assessment.name)}
                            </TableCell>

                            <TableCell>
                              {displayValue(assessment.type)}
                            </TableCell>

                            <TableCell>
                              {joinValues(assessment.cloCodes)}
                            </TableCell>

                            <TableCell>
                              {assessment.weight
                                ? `${assessment.weight}%`
                                : "—"}
                            </TableCell>
                          </tr>
                        ))}
                      </tbody>
                    </DocumentTable>
                  )}
                </section>
              </div>
            </PreviewPage>
          </div>
        </main>
      </div>
    </div>
  );
}
