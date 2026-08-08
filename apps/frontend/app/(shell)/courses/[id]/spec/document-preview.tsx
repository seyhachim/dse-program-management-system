"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2, Maximize2, Minus, Plus } from "lucide-react";
import { Button } from "@dse-pms/ui";
import { COURSE_DOCUMENT_STYLE, type CourseDocumentModel } from "./course-document-model";
import { exportCourseSpecWord } from "./document-export";

const PAGE_WIDTH = 1123;
const PAGE_HEIGHT = 794;
const VIEWER_PADDING = 24;
const PAGE_GAP = 40;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.1;

type DocumentPreviewProps = { document: CourseDocumentModel };

function displayValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || String(value).trim() === "") return "—";
  return String(value);
}

function joinValues(values: string[]): string {
  return values.length ? values.join(", ") : "—";
}

function Page({ zoom, pageNumber, children }: { zoom: number; pageNumber: number; children: ReactNode }) {
  const scaledWidth = PAGE_WIDTH * zoom;
  const scaledHeight = PAGE_HEIGHT * zoom;
  return (
    <div className="relative mx-auto" style={{ width: scaledWidth, height: scaledHeight + PAGE_GAP }}>
      <article
        className="absolute left-0 top-0 overflow-hidden bg-white text-black shadow-md ring-1 ring-black/5"
        style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT, transform: `scale(${zoom})`, transformOrigin: "top left", fontFamily: COURSE_DOCUMENT_STYLE.fontFamily }}
      >
        {children}
      </article>
      <div className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground" style={{ top: scaledHeight + 8 }}>
        Page {pageNumber}
      </div>
    </div>
  );
}

function LabelCell({ number, children, className = "" }: { number: string; children: ReactNode; className?: string }) {
  return (
    <td className={["border border-black px-3 py-2 align-middle font-semibold break-words", className].join(" ")} style={{ backgroundColor: COURSE_DOCUMENT_STYLE.labelBackground }}>
      <div className="flex items-start gap-2"><span className="shrink-0 font-normal">{number}.</span><span className="min-w-0">{children}</span></div>
    </td>
  );
}

function ValueCell({ children, colSpan, className = "" }: { children?: ReactNode; colSpan?: number; className?: string }) {
  return <td colSpan={colSpan} className={["border border-black px-3 py-2 align-top break-words", className].join(" ")}>{children || "—"}</td>;
}

function Checkbox({ checked }: { checked: boolean }) {
  return <span className="inline-block w-4 text-center font-serif" aria-hidden="true">{checked ? "☒" : "☐"}</span>;
}

function CourseAvailability({ semester }: { semester: string }) {
  const normalized = semester.trim().toLowerCase();
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1">
      <span className="whitespace-nowrap">1st Semester <Checkbox checked={normalized.includes("1") || normalized.includes("first")} /></span>
      <span className="whitespace-nowrap">2nd Semester <Checkbox checked={normalized.includes("2") || normalized.includes("second")} /></span>
    </div>
  );
}

function Table({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <table className={["w-full table-fixed border-collapse font-serif text-[10px] leading-[1.3]", className].join(" ")}>{children}</table>;
}

function TH({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <th className={["border border-black bg-slate-50 px-2 py-1.5 text-left align-middle font-semibold break-words", className].join(" ")}>{children}</th>;
}

function TD({ children, className = "", colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={["border border-black px-2 py-1.5 align-top break-words whitespace-pre-wrap", className].join(" ")}>{children || "—"}</td>;
}

function SectionTitle({ number, children }: { number: string; children: ReactNode }) {
  return <h2 className="mb-3 font-serif text-[15px] font-bold">{number}. {children}</h2>;
}

function PageHeader({ document }: { document: CourseDocumentModel }) {
  return (
    <header className="mb-4 text-center font-serif">
      <p className="text-[11px] font-bold">Royal University of Phnom Penh</p>
      <p className="text-[10px]">Faculty of Engineering</p>
      <p className="text-[10px]">Department of Information Technology Engineering</p>
      <p className="mt-2 text-[13px] font-bold">{document.courseInformation.programmeTitle}</p>
      <p className="mt-2 text-[16px] font-bold">Course Specification</p>
    </header>
  );
}

function PageFooter({ courseCode, page }: { courseCode: string; page: number }) {
  return <div className="absolute bottom-[24px] left-[54px] right-[54px] flex justify-between border-t border-black pt-1 font-serif text-[8px]"><span>{courseCode || "Course Specification"}</span><span>{page}</span></div>;
}

function TaxonomyLegend() {
  return (
    <div className="mt-4 rounded border border-black p-2 font-serif text-[9px]">
      <p className="font-bold">Levels in Learning Domain</p>
      <div className="mt-1 grid grid-cols-3 gap-3">
        <div><p className="font-semibold">Cognitive</p><p>C1 Remembering · C2 Understanding · C3 Applying · C4 Analyzing · C5 Evaluating · C6 Creating</p></div>
        <div><p className="font-semibold">Affective</p><p>A1 Receiving · A2 Responding · A3 Valuing · A4 Organizing · A5 Internationalizing</p></div>
        <div><p className="font-semibold">Psychomotor</p><p>P1 Perception · P2 Set · P3 Guided Response · P4 Mechanism · P5 Complex over response · P6 Adaptation · P7 Origination</p></div>
      </div>
    </div>
  );
}

export function DocumentPreview({ document }: DocumentPreviewProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const info = document.courseInformation;

  const fitWidth = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const availableWidth = viewer.clientWidth - VIEWER_PADDING * 2;
    if (availableWidth <= 0) return;
    setZoom(Math.max(MIN_ZOOM, Math.min(availableWidth / PAGE_WIDTH, 1)));
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
    try { setIsExporting(true); await exportCourseSpecWord(document); }
    catch (error) { console.error("Failed to export Course Specification:", error); }
    finally { setIsExporting(false); }
  };

  const weeklyPages: CourseDocumentModel["weeklyPlan"][] = [];
  for (let i = 0; i < document.weeklyPlan.length; i += 7) weeklyPages.push(document.weeklyPlan.slice(i, i + 7));
  if (!weeklyPages.length) weeklyPages.push([]);

  const weeklyStartPage = 6;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted"><FileText className="h-5 w-5 text-muted-foreground" /></div><div><h2 className="text-base font-semibold">AUN Course Specification Preview</h2><p className="mt-1 text-sm text-muted-foreground">Preview the structured course data in the AUN-style Part 2 document layout.</p></div></div>
        <Button type="button" onClick={handleDownloadWord} disabled={isExporting}>{isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}{isExporting ? "Generating..." : "Download Word"}</Button>
      </div>

      <div className="grid h-[calc(100vh-250px)] min-h-[650px] gap-4 lg:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="min-h-0 space-y-4 overflow-y-auto pr-1">
          <div className="rounded-lg border bg-card p-4"><h3 className="text-sm font-semibold">Document Information</h3><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-xs text-muted-foreground">Course Code</dt><dd className="mt-0.5 font-medium">{displayValue(info.courseCode)}</dd></div><div><dt className="text-xs text-muted-foreground">Course Title</dt><dd className="mt-0.5 font-medium">{displayValue(info.courseTitle)}</dd></div><div><dt className="text-xs text-muted-foreground">Sections</dt><dd className="mt-0.5 font-medium">1–19</dd></div><div><dt className="text-xs text-muted-foreground">Format</dt><dd className="mt-0.5 font-medium">A4 Landscape</dd></div></dl></div>
          <div className="rounded-lg border bg-card p-4"><h3 className="text-sm font-semibold">Contents</h3><nav className="mt-3 space-y-1 text-sm"><a href="#course-information" className="block rounded-md px-2 py-2 hover:bg-muted">1–13. Course Information</a><a href="#clos" className="block rounded-md px-2 py-2 hover:bg-muted">14. CLOs</a><a href="#mapping" className="block rounded-md px-2 py-2 hover:bg-muted">15. CLO–PLO Mapping</a><a href="#slt" className="block rounded-md px-2 py-2 hover:bg-muted">16. Student Learning Time</a><a href="#assessment-plan" className="block rounded-md px-2 py-2 hover:bg-muted">17. Assessment Plan</a><a href="#lesson-plan" className="block rounded-md px-2 py-2 hover:bg-muted">18. Detailed Lesson Plan</a><a href="#student-responsibility" className="block rounded-md px-2 py-2 hover:bg-muted">21. Student Responsibility</a></nav></div>
        </aside>

        <main ref={viewerRef} className="relative min-h-0 overflow-auto rounded-lg border bg-muted/40">
          <div className="sticky top-0 z-30 flex h-11 items-center justify-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
            <button type="button" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, Number((z - ZOOM_STEP).toFixed(2))))} disabled={zoom <= MIN_ZOOM} className="flex h-7 w-7 items-center justify-center rounded-md border bg-background hover:bg-muted disabled:opacity-40"><Minus className="h-3.5 w-3.5" /></button>
            <span className="min-w-[54px] text-center text-xs font-medium tabular-nums">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, Number((z + ZOOM_STEP).toFixed(2))))} disabled={zoom >= MAX_ZOOM} className="flex h-7 w-7 items-center justify-center rounded-md border bg-background hover:bg-muted disabled:opacity-40"><Plus className="h-3.5 w-3.5" /></button>
            <div className="mx-1 h-5 w-px bg-border" />
            <button type="button" onClick={fitWidth} className="flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium hover:bg-muted"><Maximize2 className="h-3.5 w-3.5" />Fit Width</button>
          </div>

          <div className="mx-auto" style={{ width: PAGE_WIDTH * zoom + VIEWER_PADDING * 2, padding: VIEWER_PADDING }}>
            <Page zoom={zoom} pageNumber={1}>
              <div id="course-information" className="h-full px-[54px] py-[38px]">
                <PageHeader document={document} />
                <p className="mb-3 font-serif text-[12px] font-bold">{document.partTitle}</p>
                <Table><colgroup><col className="w-[28%]" /><col className="w-[24%]" /><col className="w-[16%]" /><col className="w-[32%]" /></colgroup><tbody>
                  <tr><LabelCell number="1">Programme Title</LabelCell><ValueCell colSpan={3}>{displayValue(info.programmeTitle)}</ValueCell></tr>
                  <tr><LabelCell number="2">Course Title</LabelCell><ValueCell colSpan={3}>{displayValue(info.courseTitle)}</ValueCell></tr>
                  <tr><LabelCell number="3">Course Code</LabelCell><ValueCell>{displayValue(info.courseCode)}</ValueCell><LabelCell number="4">No. of Credits</LabelCell><ValueCell>{displayValue(info.credits)}</ValueCell></tr>
                  <tr><LabelCell number="5">Pre-requisites (If any)</LabelCell><ValueCell colSpan={3}>{displayValue(info.prerequisites)}</ValueCell></tr>
                  <tr><LabelCell number="6">Course Instructor</LabelCell><ValueCell>{displayValue(info.instructor)}</ValueCell><LabelCell number="7">Qualification</LabelCell><ValueCell>{displayValue(info.qualification)}</ValueCell></tr>
                  <tr><LabelCell number="8">Email</LabelCell><ValueCell>{displayValue(info.email)}</ValueCell><LabelCell number="9">Telephone No.</LabelCell><ValueCell>{displayValue(info.telephone)}</ValueCell></tr>
                  <tr><LabelCell number="10">Other Course Lecturer(s) (If any)</LabelCell><ValueCell colSpan={3}>{displayValue(info.otherLecturers)}</ValueCell></tr>
                  <tr><LabelCell number="11">Course Type</LabelCell><ValueCell colSpan={3}>{displayValue(info.courseType)}</ValueCell></tr>
                  <tr><LabelCell number="12">Course Availability</LabelCell><ValueCell><CourseAvailability semester={info.semester} /></ValueCell><td className="border border-black bg-[#E2EEDB] px-3 py-2 align-middle font-semibold">Year</td><ValueCell>{displayValue(info.programmeYear)}</ValueCell></tr>
                  <tr><LabelCell number="13">Course Description / Synopsis</LabelCell><ValueCell colSpan={3} className="leading-[1.45]">{displayValue(info.description)}</ValueCell></tr>
                </tbody></Table>
                <PageFooter courseCode={info.courseCode} page={1} />
              </div>
            </Page>

            <Page zoom={zoom} pageNumber={2}>
              <div id="clos" className="h-full px-[54px] py-[42px]"><SectionTitle number="14">Course Learning Outcomes</SectionTitle>{document.clos.length === 0 ? <p className="font-serif text-[11px]">No Course Learning Outcomes have been added.</p> : <Table><colgroup><col className="w-[8%]" /><col className="w-[62%]" /><col className="w-[10%]" /><col className="w-[20%]" /></colgroup><thead><tr><TH>CLO</TH><TH>Description</TH><TH>C/A/P</TH><TH>PLO</TH></tr></thead><tbody>{document.clos.map((clo) => <tr key={clo.code}><TD className="font-medium">{clo.code}</TD><TD>{clo.outcome}</TD><TD>{displayValue(clo.level)}</TD><TD>{joinValues(clo.mappedPlos)}</TD></tr>)}</tbody></Table>}<TaxonomyLegend /><PageFooter courseCode={info.courseCode} page={2} /></div>
            </Page>

            <Page zoom={zoom} pageNumber={3}>
              <div id="mapping" className="h-full px-[54px] py-[42px]"><SectionTitle number="15">Mapping of the Course Learning Outcomes to the Programme Learning Outcomes, Teaching Methods and Assessment Methods</SectionTitle><Table><colgroup><col className="w-[8%]" /><col className="w-[15%]" /><col className="w-[9%]" /><col className="w-[34%]" /><col className="w-[34%]" /></colgroup><thead><tr><TH>CLO</TH><TH>PLO</TH><TH>C/A/P Level</TH><TH>Teaching Method</TH><TH>Assessment Methods</TH></tr></thead><tbody>{document.mapping.map((row) => <tr key={row.cloCode}><TD className="font-medium">{row.cloCode}</TD><TD>{joinValues(row.ploCodes)}</TD><TD>{displayValue(row.level)}</TD><TD>{joinValues(row.teachingMethods)}</TD><TD>{joinValues(row.assessmentMethods)}</TD></tr>)}</tbody></Table><p className="mt-4 font-serif text-[9px]">The mapping shown here is generated from the current CLO, PLO, teaching-method and assessment-method records stored in the PMS. No additional alignment values are inferred for the document.</p><PageFooter courseCode={info.courseCode} page={3} /></div>
            </Page>

            <Page zoom={zoom} pageNumber={4}>
              <div id="slt" className="h-full px-[54px] py-[42px]"><SectionTitle number="16">Distribution of Student Learning Time (SLT)</SectionTitle><Table><colgroup><col className="w-[5%]" /><col className="w-[29%]" /><col className="w-[8%]" /><col className="w-[7%]" /><col className="w-[7%]" /><col className="w-[7%]" /><col className="w-[7%]" /><col className="w-[9%]" /><col className="w-[11%]" /></colgroup><thead><tr><TH>Week</TH><TH>Course Content Outline / Topic</TH><TH>CLOs</TH><TH>L</TH><TH>T</TH><TH>P</TH><TH>O</TH><TH>Independent</TH><TH>Total SLT</TH></tr></thead><tbody>{document.weeklyPlan.map((week) => <tr key={week.id}><TD>{week.week}</TD><TD>{week.topic}</TD><TD>{joinValues(week.cloCodes)}</TD><TD>{displayValue(week.lectureHours)}</TD><TD>{displayValue(week.tutorialHours)}</TD><TD>{displayValue(week.practiceHours)}</TD><TD>{displayValue(week.otherHours)}</TD><TD>{displayValue(week.selfStudyHours)}</TD><TD>{week.sltHours ? `${week.sltHours} h` : "—"}</TD></tr>)}</tbody><tfoot><tr><TD colSpan={3} className="font-semibold">Total SLT for Course Content</TD><TD className="font-semibold">{document.weeklyPlan.reduce((s,w)=>s+(Number(w.lectureHours)||0),0)}</TD><TD className="font-semibold">{document.weeklyPlan.reduce((s,w)=>s+(Number(w.tutorialHours)||0),0)}</TD><TD className="font-semibold">{document.weeklyPlan.reduce((s,w)=>s+(Number(w.practiceHours)||0),0)}</TD><TD className="font-semibold">{document.weeklyPlan.reduce((s,w)=>s+(Number(w.otherHours)||0),0)}</TD><TD className="font-semibold">{document.weeklyPlan.reduce((s,w)=>s+(Number(w.selfStudyHours)||0),0)}</TD><TD className="font-semibold">{document.totals.courseContentSlt} h</TD></tr></tfoot></Table><div className="mt-5 rounded border border-black p-3 font-serif text-[10px]"><p className="font-bold">Assessment SLT</p><p className="mt-1">Assessment-specific SLT is not currently stored in the course assessment records, so no assessment SLT value is invented in this preview.</p><p className="mt-2">Grand Total SLT: <strong>Not available from current structured data</strong></p></div><PageFooter courseCode={info.courseCode} page={4} /></div>
            </Page>

            <Page zoom={zoom} pageNumber={5}>
              <div id="assessment-plan" className="h-full px-[54px] py-[42px]"><SectionTitle number="17">Course Assessment Plan</SectionTitle><Table><colgroup><col className="w-[7%]" /><col className="w-[10%]" /><col className="w-[23%]" /><col className="w-[9%]" /><col className="w-[8%]" /><col className="w-[8%]" /><col className="w-[10%]" /><col className="w-[15%]" /><col className="w-[10%]" /></colgroup><thead><tr><TH>CLO</TH><TH>PLO</TH><TH>Assessment</TH><TH>Group / Individual</TH><TH>Weight %</TH><TH>C/A/P</TH><TH>Due Week</TH><TH>Format / Submission</TH><TH>Feedback</TH></tr></thead><tbody>{document.assessments.map((assessment) => <tr key={assessment.id}><TD>{joinValues(assessment.cloCodes)}</TD><TD>{joinValues(assessment.mappedPlos)}</TD><TD>{displayValue(assessment.name)}</TD><TD>{assessment.mode === "group" ? "G" : "I"}</TD><TD>{assessment.weight ? `${assessment.weight}%` : "—"}</TD><TD>{joinValues(assessment.capLevels)}</TD><TD>{displayValue(assessment.dueWeek)}</TD><TD>{joinValues([assessment.format, assessment.submissionMethod].filter(Boolean))}</TD><TD>{joinValues([assessment.feedbackMethod, assessment.feedbackTimeline].filter(Boolean))}</TD></tr>)}</tbody><tfoot><tr><TD colSpan={4} className="font-semibold">Total Weightage</TD><TD className="font-semibold">{document.totals.assessmentWeight}%</TD><TD colSpan={4}></TD></tr></tfoot></Table><p className="mt-4 font-serif text-[9px]">Assessment SLT is omitted here because the current CourseSpecAssessmentItem data model does not contain an assessment-duration/SLT field.</p><PageFooter courseCode={info.courseCode} page={5} /></div>
            </Page>

            {weeklyPages.map((weeks, index) => <Page zoom={zoom} pageNumber={weeklyStartPage + index} key={`lesson-${index}`}><div id={index === 0 ? "lesson-plan" : undefined} className="h-full px-[54px] py-[42px]"><SectionTitle number="18">Course Outline / Detailed Lesson Plan{weeklyPages.length > 1 ? ` — Weeks ${weeks[0]?.week ?? ""}–${weeks[weeks.length-1]?.week ?? ""}` : ""}</SectionTitle><Table><colgroup><col className="w-[5%]" /><col className="w-[18%]" /><col className="w-[10%]" /><col className="w-[22%]" /><col className="w-[20%]" /><col className="w-[15%]" /><col className="w-[10%]" /></colgroup><thead><tr><TH>Week</TH><TH>Topic</TH><TH>CLO</TH><TH>Lesson Learning Outcomes</TH><TH>Teaching Method / Activity</TH><TH>Assessment</TH><TH>Resources</TH></tr></thead><tbody>{weeks.map((week) => <tr key={week.id}><TD>{week.week}</TD><TD>{week.topic}</TD><TD>{joinValues(week.cloCodes)}</TD><TD>{week.lloItems.length ? week.lloItems.map((item,i)=><div key={i}>LLO{i+1}: {item}</div>) : "—"}</TD><TD>{joinValues(week.teachingMethods.length ? week.teachingMethods : week.learningActivities)}</TD><TD>{joinValues([week.assessment, ...week.assessmentMethods].filter(Boolean))}</TD><TD>{joinValues(week.resources)}</TD></tr>)}</tbody></Table><div className="mt-4 grid grid-cols-3 gap-3 font-serif text-[9px]"><div className="rounded border border-black p-2"><strong>Learning Activities</strong><p className="mt-1">{joinValues(weeks.flatMap((w)=>w.learningActivities))}</p></div><div className="rounded border border-black p-2"><strong>Active Learning Strategies</strong><p className="mt-1">{joinValues(weeks.flatMap((w)=>w.activeLearningStrategies))}</p></div><div className="rounded border border-black p-2"><strong>Teaching Resources</strong><p className="mt-1">{joinValues(weeks.flatMap((w)=>w.resources))}</p></div></div><PageFooter courseCode={info.courseCode} page={weeklyStartPage + index} /></div></Page>)}

            <Page zoom={zoom} pageNumber={weeklyStartPage + weeklyPages.length}>
              <div id="resources" className="h-full px-[54px] py-[42px]">
                <SectionTitle number="19">Required Resources to Deliver the Course</SectionTitle>
                {document.resources.length === 0 ? (
                  <p className="font-serif text-[11px]">No additional required resources have been confirmed.</p>
                ) : (
                  <Table>
                    <colgroup><col className="w-[18%]" /><col className="w-[30%]" /><col className="w-[24%]" /><col className="w-[18%]" /><col className="w-[10%]" /></colgroup>
                    <thead><tr><TH>Type</TH><TH>Resource / Description</TH><TH>Link</TH><TH>Notes</TH><TH>Weekly Plan Evidence</TH></tr></thead>
                    <tbody>{document.resources.map((resource) => (
                      <tr key={resource.id}>
                        <TD>{displayValue(resource.resourceType)}</TD>
                        <TD>{displayValue(resource.title)}</TD>
                        <TD>{resource.url ? resource.url : "—"}</TD>
                        <TD>{displayValue(resource.notes)}</TD>
                        <TD>{joinValues(resource.evidenceWeeks)}</TD>
                      </tr>
                    ))}</tbody>
                  </Table>
                )}
                <p className="mt-4 font-serif text-[9px]">Resources listed here are lecturer-confirmed requirements. Weekly Plan evidence is shown only as provenance for the requirement; it is not a quality judgment.</p>
                <PageFooter courseCode={info.courseCode} page={weeklyStartPage + weeklyPages.length} />
              </div>
            </Page>

            <Page zoom={zoom} pageNumber={weeklyStartPage + weeklyPages.length + 1}>
              <div id="student-responsibility" className="h-full px-[54px] py-[42px]">
                <SectionTitle number="21">Student Responsibility</SectionTitle>
                {document.studentResponsibilities.length === 0 ? (
                  <p className="font-serif text-[11px]">No student responsibilities have been added.</p>
                ) : (
                  <ol className="list-decimal space-y-3 pl-6 font-serif text-[11px] leading-[1.5]">
                    {document.studentResponsibilities.map((item) => (
                      <li key={item.id} className="pl-1">{item.text}</li>
                    ))}
                  </ol>
                )}
                <PageFooter courseCode={info.courseCode} page={weeklyStartPage + weeklyPages.length + 1} />
              </div>
            </Page>
          </div>
        </main>
      </div>
    </div>
  );
}
