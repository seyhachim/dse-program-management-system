import type { ReactNode } from "react";
import Link from "next/link";
import { PLOS, referenceKindLabel } from "@dse-pms/shared-types";
import {
  COURSE_DOCUMENT_STYLE,
  type CourseDocumentModel,
} from "./course-document-model";
import {
  contiguousRowSpans,
  programmePloCountLabel,
  splitLeadingWord,
} from "./plo-preview-format";

export const PAGE_WIDTH = COURSE_DOCUMENT_STYLE.page.preview.width;
const PAGE_HEIGHT = COURSE_DOCUMENT_STYLE.page.preview.height;
const PAGE_GAP = 40;

export function displayDocumentValue(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined || String(value).trim() === "")
    return "—";
  return String(value);
}

function joinValues(values: string[]): string {
  return values.length ? values.join(", ") : "—";
}

function referenceCitation(
  reference: CourseDocumentModel["references"][number],
): string {
  const parts = [
    reference.authors,
    reference.year ? `(${reference.year})` : "",
    reference.title,
    reference.publisher,
  ].filter(Boolean);
  return parts.length ? parts.join(". ") : "—";
}

function Page({ zoom, pageNumber, children }: { zoom: number; pageNumber: number; children: ReactNode }) {
  const scaledWidth = PAGE_WIDTH * zoom;
  const scaledHeight = PAGE_HEIGHT * zoom;
  return (
    <div className="relative mx-auto" style={{ width: scaledWidth, height: scaledHeight + PAGE_GAP }}>
      <article
        data-doc-page
        className="absolute left-0 top-0 overflow-hidden bg-white text-black shadow-md ring-1 ring-black/5 lining-nums"
        style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT, transform: `scale(${zoom})`, transformOrigin: "top left", fontFamily: COURSE_DOCUMENT_STYLE.fontFamily }}
      >
        {children}
      </article>
      <div className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground" style={{ top: scaledHeight + 8 }}>Page {pageNumber}</div>
    </div>
  );
}

function LabelCell({ number, children, className = "" }: { number: string; children: ReactNode; className?: string }) {
  return (
    <td className={["border border-black px-3 py-2.5 align-middle font-semibold break-words", className].join(" ")} style={{ backgroundColor: COURSE_DOCUMENT_STYLE.labelBackground }}>
      <div className="flex items-start gap-2"><span className="shrink-0 font-normal">{number}.</span><span className="min-w-0">{children}</span></div>
    </td>
  );
}

function ValueCell({ children, colSpan, className = "" }: { children?: ReactNode; colSpan?: number; className?: string }) {
  return <td colSpan={colSpan} className={["border border-black px-3 py-2.5 align-top break-words", className].join(" ")}>{children || "—"}</td>;
}

function Checkbox({ checked }: { checked: boolean }) {
  return <span className="inline-block w-4 text-center" aria-hidden="true">{checked ? "☑" : "☐"}</span>;
}

function CourseAvailability({ semester }: { semester: string }) {
  const normalized = semester.trim().toLowerCase();
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-1">
      <span className="whitespace-nowrap">1st Semester{" "}<Checkbox checked={normalized.includes("1") || normalized.includes("first")} /></span>
      <span className="whitespace-nowrap">2nd Semester{" "}<Checkbox checked={normalized.includes("2") || normalized.includes("second")} /></span>
    </div>
  );
}

function Table({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <table className={["w-full table-fixed border-collapse text-[10px] leading-[1.3]", className].join(" ")}>{children}</table>;
}

function TH({ children, className = "", colSpan, rowSpan }: { children: ReactNode; className?: string; colSpan?: number; rowSpan?: number }) {
  return <th colSpan={colSpan} rowSpan={rowSpan} className={["border border-black bg-slate-50 px-2 py-1.5 text-left align-middle font-semibold break-words", className].join(" ")}>{children}</th>;
}

function TD({ children, className = "", colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={["border border-black px-2 py-1.5 align-top break-words whitespace-pre-wrap", className].join(" ")}>{children || "—"}</td>;
}

function BlankTD({ className = "" }: { className?: string }) {
  return <td className={["border border-black px-2 py-1.5 align-top", className].join(" ")}>&nbsp;</td>;
}

function SectionTitle({ number, children }: { number: string; children: ReactNode }) {
  return <h2 className="mb-3 text-[15px] font-bold">{number}. {children}</h2>;
}

function PartTwoRow({ children }: { children: ReactNode }) {
  return (
    <Table className="part-two-continuation-table">
      <colgroup><col className="w-[28%]" /><col className="w-[24%]" /><col className="w-[16%]" /><col className="w-[32%]" /></colgroup>
      <tbody><tr><ValueCell colSpan={4} className="part-two-continuation-cell">{children}</ValueCell></tr></tbody>
    </Table>
  );
}

function PageHeader({ document }: { document: CourseDocumentModel }) {
  return (
    <header className="mb-4 text-center">
      <p className="text-[11px] font-bold">Royal University of Phnom Penh</p>
      <p className="text-[10px]">Faculty of Engineering</p>
      <p className="text-[10px]">Department of Information Technology Engineering</p>
      <p className="mt-2 text-[13px] font-bold">{document.courseInformation.programmeTitle}</p>
      <p className="mt-2 text-[16px] font-bold">Course Specification</p>
    </header>
  );
}

function PageFooter({ courseCode, page }: { courseCode: string; page: number }) {
  return <div className="absolute bottom-[24px] left-[54px] right-[54px] flex justify-between border-t border-black pt-1 text-[8px]"><span>{courseCode || "Course Specification"}</span><span>{page}</span></div>;
}

function ProgrammeProfilePage({ document }: { document: CourseDocumentModel }) {
  const profile = document.programmeProfile;
  const preview = COURSE_DOCUMENT_STYLE.page.preview;
  const logo = COURSE_DOCUMENT_STYLE.logo;
  return (
    <div className="h-full" style={{ paddingLeft: `${preview.programmePaddingX}px`, paddingRight: `${preview.programmePaddingX}px`, paddingTop: `${preview.programmePaddingY}px` }}>
      <header className="relative min-h-[112px] text-center">
        <img src="/rupp-logo.png" alt="Royal University of Phnom Penh" className="absolute top-0 object-contain" style={{ left: `-${logo.width * 0.152}px`, width: `${logo.width}px`, height: `${logo.height}px`, maxWidth: `${logo.width}px`, maxHeight: `${logo.height}px`, objectFit: "contain", display: "block" }} />
        <p className="text-[11px] font-bold leading-[1.1]">Royal University of Phnom Penh</p>
        <p className="text-[10px] font-bold leading-[1.1]">Faculty of Engineering</p>
        <p className="text-[10px] font-bold leading-[1.1]">Department of Information Technology Engineering</p>
        <p className="text-[10px] font-bold leading-[1.1]">{document.courseInformation.programmeTitle}</p>
        <p className="mt-2 text-[13px] font-bold">Course Specification</p>
      </header>
      <h1 className="mb-2 text-[13px] font-bold uppercase">PART 1: VISION, MISSION, GOALS, AND OBJECTIVES</h1>
      <div className="grid w-full border border-black text-[10px] leading-[1.2]" style={{ gridTemplateColumns: "34% 66%" }}>
        <section className="border-b border-r border-black p-2"><h2 className="text-[10px] font-bold uppercase">Program Vision:</h2><p className="mt-1">{displayDocumentValue(profile.vision)}</p></section>
        <section className="border-b border-black p-2"><h2 className="text-[10px] font-bold uppercase">Program Mission</h2><ol className="mt-1 space-y-1">{profile.mission.length ? profile.mission.map((item, index) => <li key={`mission-${index}`}><strong>Mission {index + 1}:</strong> {item}</li>) : <li>—</li>}</ol></section>
        <section className="border-b border-r border-black p-2"><h2 className="text-[10px] font-bold uppercase">Program Goals</h2><p className="mt-1">Our program aims to:</p><ul className="mt-1 list-disc list-inside space-y-0.5 pl-2">{profile.goals.length ? profile.goals.map((item, index) => <li key={`goal-${index}`}>{item}</li>) : <li>—</li>}</ul></section>
        <section className="border-b border-black p-2"><h2 className="text-[10px] font-bold uppercase">Program Educational Philosophy</h2><ul className="mt-1 list-disc list-inside space-y-0.5 pl-2">{profile.educationalPhilosophy.length ? profile.educationalPhilosophy.map((item) => <li key={item.code}><strong>{item.code}: {item.title}:</strong>{" "}{item.description}</li>) : <li>—</li>}</ul></section>
        <section className="p-2" style={{ gridColumn: "1 / -1" }}><h2 className="text-[10px] font-bold uppercase">Program Educational Objectives (PEOs)</h2><p className="mt-1">What graduates are expected to achieve within 3–5 years of graduation:</p><ul className="mt-1 list-disc list-inside space-y-0.5 pl-2">{profile.peos.length ? profile.peos.map((item) => <li key={item.code}><strong>{item.code}: {item.title}:</strong>{" "}{item.description}</li>) : <li>—</li>}</ul></section>
      </div>
    </div>
  );
}

const TAXONOMY = {
  Cognitive: [["1", "Remembering", "C1"], ["2", "Understanding", "C2"], ["3", "Applying", "C3"], ["4", "Analyzing", "C4"], ["5", "Evaluating", "C5"], ["6", "Creating", "C6"]],
  Affective: [["1", "Receiving", "A1"], ["2", "Responding", "A2"], ["3", "Valuing", "A3"], ["4", "Organizing", "A4"], ["5", "Internationalizing", "A5"]],
  Psychomotor: [["1", "Perception", "P1"], ["2", "Set", "P2"], ["3", "Guided Response", "P3"], ["4", "Mechanism", "P4"], ["5", "Complex over response", "P5"], ["6", "Adaptation", "P6"], ["7", "Origination", "P7"]],
} as const;

function TaxonomyLegend() {
  return (
    <div className="mt-4 text-[9.5px] leading-[1.15]">
      <p className="mb-1 text-[9.5px]">* Levels in Learning Domain: Knowledge (Cognitive-C), Attitude (Affective-A), Skills (Psychomotor-P)</p>
      <div className="grid grid-cols-3 border border-black">
        {Object.entries(TAXONOMY).map(([domain, rows], domainIndex) => (
          <div key={domain} className={domainIndex < 2 ? "border-r border-black p-2" : "p-2"}>
            <p className="mb-1 text-[10px] font-bold text-left">{domain}</p>
            <table className="w-full border-collapse text-[9.5px] leading-[1.15]">
              <tbody>{rows.map(([number, label, code]) => <tr key={code}><td className="w-[12%] border border-black px-1 py-[2px] text-center">{number}</td><td className="border border-black px-1.5 py-[2px] text-left">{label}</td><td className="w-[13%] border border-black px-1 py-[2px] text-center">{code}</td></tr>)}</tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

function learningDomain(level: string) {
  const normalized = level.trim().toUpperCase();
  return { cognitive: normalized.startsWith("C") ? normalized : "", affective: normalized.startsWith("A") ? normalized : "", psychomotor: normalized.startsWith("P") ? normalized : "" };
}

function CloPloMatrix({ mapping, mode }: { mapping: CourseDocumentModel["mapping"]; mode: "percent" | "hours" }) {
  const heading = mode === "percent"
    ? "Programme Learning Outcomes — Percentages"
    : "Programme Learning Outcomes — Total Hours for Student Learning Time (SLT) including learning and assessment";
  return (
    <Table>
      <colgroup><col className="w-[6%]" />{PLOS.map((plo) => <col key={plo.id} className="w-[9.4%]" />)}</colgroup>
      <thead><tr><TH rowSpan={2}>CLO</TH><TH colSpan={PLOS.length} className="text-center">{heading}</TH></tr><tr>{PLOS.map((plo) => <TH key={plo.id} className="text-center">{plo.id}</TH>)}</tr></thead>
      <tbody>{mapping.map((row) => <tr key={row.cloCode}><TD className="font-medium text-center">{row.cloCode}</TD>{PLOS.map((plo) => {
        if (!row.ploCodes.includes(plo.id)) return <BlankTD key={plo.id} className="text-center" />;
        return <TD key={plo.id} className="text-center">{mode === "percent" ? row.focusCode && row.focusPercent != null ? `${row.focusCode} (${row.focusPercent}%)` : "—" : displayDocumentValue(row.sltHours)}</TD>;
      })}</tr>)}</tbody>
    </Table>
  );
}

function compactSltValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || String(value).trim() === "") return "";
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric === 0) return "";
  return Number.isFinite(numeric) ? String(numeric) : String(value);
}

function SltCell({
  value,
  className = "",
  colSpan,
}: {
  value: string | number | null | undefined;
  className?: string;
  colSpan?: number;
}) {
  const display = compactSltValue(value);
  return (
    <td
      colSpan={colSpan}
      className={["border border-black px-1 py-[1px] align-middle", className].join(" ")}
    >
      {display || " "}
    </td>
  );
}

function AssessmentSltTable({
  document,
  category,
}: {
  document: CourseDocumentModel;
  category: "continuous" | "final";
}) {
  const label = category === "continuous" ? "Continuous Assessment" : "Final Assessment";
  const assessments = document.assessments.filter(
    (assessment) => assessment.assessmentCategory === category,
  );
  const paddedRows = Array.from(
    { length: Math.max(5, assessments.length) },
    (_, index) => assessments[index] ?? null,
  );
  const categoryTotal =
    category === "continuous"
      ? document.totals.continuousAssessmentSlt
      : document.totals.finalAssessmentSlt;

  return (
    <Table className="section16-assessment-table mt-4 text-[8px] leading-[1.05]">
      <colgroup>
        <col style={{ width: "3%" }} />
        <col style={{ width: "38%" }} />
        <col style={{ width: "6%" }} />
        <col style={{ width: "16%" }} />
        <col style={{ width: "19%" }} />
        <col style={{ width: "13%" }} />
        <col style={{ width: "5%" }} />
      </colgroup>
      <thead>
        <tr>
          <TH rowSpan={2} colSpan={2} className="bg-[#E2EEDB] text-center font-normal">{label}</TH>
          <TH rowSpan={2} className="bg-[#E2EEDB] text-center font-normal">%</TH>
          <TH colSpan={2} className="bg-[#E2EEDB] text-center font-normal">Face to Face (F2F)</TH>
          <TH rowSpan={2} className="bg-[#E2EEDB] text-center font-normal">NF2F<br />Independent Learning<br />(Asynchronous)</TH>
          <TH rowSpan={2} className="bg-[#E2EEDB] text-center font-normal">Total<br />SLT</TH>
        </tr>
        <tr>
          <TH className="bg-[#E2EEDB] text-center font-normal">Physical</TH>
          <TH className="bg-[#E2EEDB] text-center font-normal">Online/Technology-mediated<br />(Synchronous)</TH>
        </tr>
      </thead>
      <tbody>
        {paddedRows.map((assessment, index) => (
          <tr key={assessment?.id ?? `${category}-blank-${index}`}>
            <SltCell value={index + 1} className="text-center" />
            <SltCell value={assessment?.name ?? ""} />
            <SltCell value={assessment?.weight ?? ""} className="text-center" />
            <SltCell value={assessment?.physicalSltHours ?? ""} className="text-center" />
            <SltCell value={assessment?.onlineSltHours ?? ""} className="text-center" />
            <SltCell value={assessment?.independentSltHours ?? ""} className="text-center" />
            <SltCell value={assessment?.totalSltHours ?? ""} className="text-center" />
          </tr>
        ))}
        <tr>
          <td colSpan={6} className="border border-black px-1 py-[1px] text-right align-middle font-semibold">
            Total SLT for {label}:
          </td>
          <SltCell value={categoryTotal} className="bg-[#FFF2CC] text-center font-semibold" />
        </tr>
      </tbody>
    </Table>
  );
}

export function DocumentPages({ document, zoom }: { document: CourseDocumentModel; zoom: number }) {
  const info = document.courseInformation;
  const weeklyPages: CourseDocumentModel["weeklyPlan"][] = [];
  for (let i = 0; i < document.weeklyPlan.length; i += 7) weeklyPages.push(document.weeklyPlan.slice(i, i + 7));
  if (!weeklyPages.length) weeklyPages.push([]);
  const weeklyStartPage = 9;
  const resourcesPage = weeklyStartPage + weeklyPages.length;
  const referencesPage = resourcesPage + 1;
  const responsibilityPage = referencesPage + 1;
  const rubricPages: CourseDocumentModel["rubrics"][] = document.rubrics.length ? document.rubrics.map((rubric) => [rubric]) : [[]];
  const rubricStartPage = responsibilityPage + 1;
  const policyPage = rubricStartPage + rubricPages.length;
  const ratingScalePage = policyPage + 1;
  const datePage = ratingScalePage + 1;
  const majorRowSpans = contiguousRowSpans(document.plos, (plo) => plo.major);
  const capRowSpans = contiguousRowSpans(document.plos, (plo) => plo.cap);

  return (
    <>
      <Page zoom={zoom} pageNumber={1}><div id="programme-overview" className="h-full"><ProgrammeProfilePage document={document} /></div></Page>
      <Page zoom={zoom} pageNumber={2}><div id="plo-taxonomy" className="h-full px-[30px] py-[18px]">
        <h2 className="text-[13px] font-bold">PROGRAM LEARNING OUTCOME (PLOs)</h2><p className="mb-2 mt-1 text-[10px]">Our program has {programmePloCountLabel(document.plos.length)} PLOs:</p>
        {document.plos.length === 0 ? <p className="text-[11px]">No programme learning outcomes have been configured.</p> : <><table className="w-full table-fixed border-collapse text-[9.5px] leading-[1.16]"><colgroup><col className="w-[19%]" /><col className="w-[19%]" /><col className="w-[35%]" /><col className="w-[12%]" /><col className="w-[15%]" /></colgroup><thead><tr><th colSpan={2} className="border border-black px-1.5 py-1 text-center align-middle font-bold">CQF Learning Domains</th><th rowSpan={2} className="border border-black px-1.5 py-1 text-center align-middle font-bold">PLO</th><th rowSpan={2} className="border border-black px-1.5 py-1 text-center align-middle font-bold">Specific/Generic</th><th rowSpan={2} className="border border-black px-1.5 py-1 text-center align-middle font-bold">Learning/Assessment Domains</th></tr><tr><th className="border border-black px-1.5 py-1 text-center align-middle font-bold">Major Domain</th><th className="border border-black px-1.5 py-1 text-center align-middle font-bold">Learning Domain</th></tr></thead><tbody>{document.plos.map((plo, index) => { const { leadingWord, remainder } = splitLeadingWord(plo.description); const majorRowSpan = majorRowSpans[index] ?? 0; const capRowSpan = capRowSpans[index] ?? 0; return <tr key={plo.id}>{majorRowSpan > 0 ? <td rowSpan={majorRowSpan} className="border border-black px-1.5 py-1 align-middle">{displayDocumentValue(plo.major)}</td> : null}<td className="border border-black px-1.5 py-1 align-middle">{displayDocumentValue(plo.learningDomain)}</td><td className="border border-black px-1.5 py-1 align-middle"><strong>{plo.code}: {leadingWord}</strong>{remainder ? ` ${remainder}` : ""}</td><td className="border border-black px-1.5 py-1 text-center align-middle">{displayDocumentValue(plo.specificOrGeneric)}</td>{capRowSpan > 0 ? <td rowSpan={capRowSpan} className="border border-black px-1.5 py-1 text-center align-middle">{displayDocumentValue(plo.cap)}</td> : null}</tr>; })}</tbody></table><div className="mt-2 text-[9px] leading-[1.25]"><p>*</p><p><strong>Specific (Subject-Specific) PLOs:</strong> Directly related to data science and engineering knowledge, tools, and technical skills)</p><p><strong>Generic PLOs:</strong> Transferable skills applicable across disciplines and professions</p></div></>}
        <PageFooter courseCode={info.courseCode} page={2} />
      </div></Page>

      <Page zoom={zoom} pageNumber={3}><div id="course-information" className="h-full px-[54px] py-[34px]">
        <PageHeader document={document} />
        <p className="mb-1 text-[12px] font-bold">{document.partTitle}</p>
        <p className="mb-3 text-[11px] font-bold">{COURSE_DOCUMENT_STYLE.courseInfoTitle}</p>
        <Table><colgroup><col className="w-[28%]" /><col className="w-[24%]" /><col className="w-[16%]" /><col className="w-[32%]" /></colgroup><tbody>
          <tr><LabelCell number="1">Programme Title</LabelCell><ValueCell colSpan={3}>{displayDocumentValue(info.programmeTitle)}</ValueCell></tr>
          <tr><LabelCell number="2">Course Title</LabelCell><ValueCell colSpan={3}>{displayDocumentValue(info.courseTitle)}</ValueCell></tr>
          <tr><LabelCell number="3">Course Code</LabelCell><ValueCell>{displayDocumentValue(info.courseCode)}</ValueCell><LabelCell number="4">No. of Credits</LabelCell><ValueCell>{displayDocumentValue(info.credits)}</ValueCell></tr>
          <tr><LabelCell number="5">Pre-requisites (If any)</LabelCell><ValueCell colSpan={3}>{displayDocumentValue(info.prerequisites)}</ValueCell></tr>
          <tr><LabelCell number="6">Course Instructor</LabelCell><ValueCell>{displayDocumentValue(info.instructor)}</ValueCell><LabelCell number="7">Qualification</LabelCell><ValueCell>{displayDocumentValue(info.qualification)}</ValueCell></tr>
          <tr><LabelCell number="8">Email</LabelCell><ValueCell>{displayDocumentValue(info.email)}</ValueCell><LabelCell number="9">Telephone No.</LabelCell><ValueCell>{displayDocumentValue(info.telephone)}</ValueCell></tr>
          <tr><LabelCell number="10">Other Course Lecturer(s) (If any)</LabelCell><ValueCell colSpan={3}>{displayDocumentValue(info.otherLecturers)}</ValueCell></tr>
          <tr><LabelCell number="11">Course Type</LabelCell><ValueCell colSpan={3}>{displayDocumentValue(info.courseType)}</ValueCell></tr>
          <tr><LabelCell number="12">Course Availability</LabelCell><ValueCell><CourseAvailability semester={info.semester} /></ValueCell><td className="border border-black bg-[#E2EEDB] px-3 py-2.5 align-middle font-semibold">Year</td><ValueCell>{displayDocumentValue(info.programmeYear)}</ValueCell></tr>
          <tr><LabelCell number="13">Course Description / Synopsis</LabelCell><ValueCell colSpan={3} className="leading-[1.45]">{displayDocumentValue(info.description)}</ValueCell></tr>
        </tbody></Table><PageFooter courseCode={info.courseCode} page={3} />
      </div></Page>

      <Page zoom={zoom} pageNumber={4}><div id="clos" className="h-full px-[54px] py-[42px]" style={{ display: "block" }}><PartTwoRow>
        <div className="mb-1 flex items-baseline gap-2 text-[13px]"><span>14.</span><span className="font-bold">Course Learning Outcomes</span></div>
        <p className="mb-2 pl-[28px] text-[9px]">Here are the CLOs of this course:</p>
        <div className="section14-table"><Table className="text-[10.5px] leading-[1.22]"><colgroup><col className="w-[7%]" /><col className="w-[58%]" /><col className="w-[8%]" /><col className="w-[9%]" /><col className="w-[9%]" /><col className="w-[9%]" /></colgroup><thead><tr className="section14-header-row"><TH rowSpan={2} colSpan={2} className="bg-[#E2EEDB] text-center font-normal">Description of the course learning outcomes – CLOs. At the end of the course, students will be able to:</TH><TH rowSpan={2} className="bg-[#E2EEDB] text-center font-normal">PLO</TH><TH colSpan={3} className="bg-[#E2EEDB] text-center font-normal">Levels in Learning Domain:<br />Knowledge (Cognitive-C), Attitude<br />(Affective-A), Skills (Psychomotor-P)</TH></tr><tr className="section14-header-row"><TH className="bg-[#E2EEDB] text-center font-normal">C</TH><TH className="bg-[#E2EEDB] text-center font-normal">A</TH><TH className="bg-[#E2EEDB] text-center font-normal">P</TH></tr></thead><tbody>{document.clos.length ? document.clos.map((clo) => { const domain = learningDomain(clo.level); return <tr key={clo.code}><TD className="text-center align-middle">{clo.code}</TD><TD className="text-left align-middle">{clo.outcome}</TD><TD className="text-center align-middle">{joinValues(clo.mappedPlos)}</TD><TD className="text-center align-middle">{domain.cognitive || " "}</TD><TD className="text-center align-middle">{domain.affective || " "}</TD><TD className="text-center align-middle">{domain.psychomotor || " "}</TD></tr>; }) : <tr><TD colSpan={6}>No Course Learning Outcomes have been added.</TD></tr>}</tbody></Table></div>
        <TaxonomyLegend />
      </PartTwoRow><PageFooter courseCode={info.courseCode} page={4} /></div></Page>

      <Page zoom={zoom} pageNumber={5}><div id="mapping" className="h-full px-[54px] py-[42px]"><PartTwoRow>
        <SectionTitle number="15">Mapping of the Course Learning Outcomes to the Programme Learning Outcomes, Teaching Methods and Assessment Methods</SectionTitle>
        <CloPloMatrix mapping={document.mapping} mode="hours" />
        <p className="mt-2 text-[9px]">1 Credit = 40 Student Learning Time (SLT)</p>
        <div className="mt-4"><CloPloMatrix mapping={document.mapping} mode="percent" /></div>
        <div className="mt-3 text-[9px] leading-[1.45]">
          <p>*</p>
          <p>• <strong>Fully (F)</strong> indicates a focus of more than 50% of the total SLT on this PLO.</p>
          <p>• <strong>Moderate (M)</strong> indicates a focus of 31%–50% of the total SLT on this PLO.</p>
          <p>• <strong>Partial (P)</strong> indicates a focus of less than 30% of the total SLT on this PLO.</p>
        </div>
      </PartTwoRow><PageFooter courseCode={info.courseCode} page={5} /></div></Page>

      <Page zoom={zoom} pageNumber={6}><div className="h-full px-[54px] py-[42px]"><PartTwoRow>
        <SectionTitle number="15">Mapping of the Course Learning Outcomes (continued)</SectionTitle>
        <Table><colgroup><col className="w-[8%]" /><col className="w-[15%]" /><col className="w-[9%]" /><col className="w-[34%]" /><col className="w-[34%]" /></colgroup><thead><tr><TH>CLO</TH><TH>PLO</TH><TH>C/A/P Level</TH><TH>Teaching Method</TH><TH>Assessment Methods</TH></tr></thead><tbody>{document.mapping.map((row) => <tr key={row.cloCode}><TD className="font-medium">{row.cloCode}</TD><TD>{joinValues(row.ploCodes)}</TD><TD>{displayDocumentValue(row.level)}</TD><TD>{joinValues(row.teachingMethods)}</TD><TD>{joinValues(row.assessmentMethods)}</TD></tr>)}</tbody></Table>
      </PartTwoRow><PageFooter courseCode={info.courseCode} page={6} /></div></Page>

      <Page zoom={zoom} pageNumber={7}><div id="slt" className="h-full px-[54px] py-[42px]"><PartTwoRow>
        <SectionTitle number="16">Distribution of Student Learning Time (SLT)</SectionTitle>
        <p className="mb-3 text-[8.5px]">* Lecture (L), Tutoring (T), Practice (P), Other (O)</p>
        <Table className="section16-content-table text-[8px] leading-[1.05]">
          <colgroup>
            <col style={{ width: "3.125%" }} />
            <col style={{ width: "39.583%" }} />
            <col style={{ width: "5.208%" }} />
            {Array.from({ length: 8 }, (_, index) => <col key={`activity-col-${index}`} style={{ width: "4.167%" }} />)}
            <col style={{ width: "11.458%" }} />
            <col style={{ width: "7.292%" }} />
          </colgroup>
          <thead>
            <tr>
              <TH rowSpan={4} colSpan={2} className="bg-[#E2EEDB] text-center font-normal">Course Content Outline and subtopics</TH>
              <TH rowSpan={4} className="bg-[#E2EEDB] text-center font-normal">CLOs</TH>
              <TH colSpan={9} className="bg-[#E2EEDB] text-center font-normal">Learning and Teaching Activities</TH>
              <TH rowSpan={4} className="bg-[#E2EEDB] text-center font-normal">Total<br />SLT</TH>
            </tr>
            <tr>
              <TH colSpan={8} className="bg-[#E2EEDB] text-center font-normal">Face to Face (F2F)</TH>
              <TH rowSpan={3} className="bg-[#E2EEDB] text-center font-normal">NF2F<br />Independent Learning<br />(Asynchronous)</TH>
            </tr>
            <tr>
              <TH colSpan={4} className="bg-[#E2EEDB] text-center font-normal">Physical</TH>
              <TH colSpan={4} className="bg-[#E2EEDB] text-center font-normal">Online/Technology-mediated<br />(Synchronous)</TH>
            </tr>
            <tr>
              {(["L", "T", "P", "O", "L", "T", "P", "O"] as const).map((label, index) => (
                <TH key={`${label}-${index}`} className="bg-[#E2EEDB] text-center font-normal">{label}</TH>
              ))}
            </tr>
          </thead>
          <tbody>
            {document.weeklyPlan.map((week) => (
              <tr key={week.id}>
                <SltCell value={week.week} className="text-center" />
                <td className="border border-black px-1 py-[1px] align-middle">
                  <strong>Topic {week.week}:</strong>{" "}{week.topic}
                </td>
                <SltCell value={week.cloCodes.join(", ")} className="text-center" />
                <SltCell value={week.lectureHours} className="text-center" />
                <SltCell value={week.tutorialHours} className="text-center" />
                <SltCell value={week.practiceHours} className="text-center" />
                <SltCell value={week.otherHours} className="text-center" />
                <SltCell value="" className="text-center" />
                <SltCell value="" className="text-center" />
                <SltCell value="" className="text-center" />
                <SltCell value="" className="text-center" />
                <SltCell value={week.selfStudyHours} className="text-center" />
                <SltCell value={week.sltHours} className="text-center" />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="border border-black px-1 py-[1px] text-right align-middle font-semibold">Total SLT for Course Content</td>
              <SltCell value={document.weeklyPlan.reduce((sum, week) => sum + (Number(week.lectureHours) || 0), 0)} className="text-center font-semibold" />
              <SltCell value={document.weeklyPlan.reduce((sum, week) => sum + (Number(week.tutorialHours) || 0), 0)} className="text-center font-semibold" />
              <SltCell value={document.weeklyPlan.reduce((sum, week) => sum + (Number(week.practiceHours) || 0), 0)} className="text-center font-semibold" />
              <SltCell value={document.weeklyPlan.reduce((sum, week) => sum + (Number(week.otherHours) || 0), 0)} className="text-center font-semibold" />
              <SltCell value="" className="text-center" />
              <SltCell value="" className="text-center" />
              <SltCell value="" className="text-center" />
              <SltCell value="" className="text-center" />
              <SltCell value={document.weeklyPlan.reduce((sum, week) => sum + (Number(week.selfStudyHours) || 0), 0)} className="text-center font-semibold" />
              <SltCell value={document.totals.courseContentSlt} className="text-center font-semibold" />
            </tr>
          </tfoot>
        </Table>
        <AssessmentSltTable document={document} category="continuous" />
        <AssessmentSltTable document={document} category="final" />
      </PartTwoRow><PageFooter courseCode={info.courseCode} page={7} /></div></Page>

      <Page zoom={zoom} pageNumber={8}><div id="assessment-plan" className="h-full px-[54px] py-[42px]"><PartTwoRow><SectionTitle number="17">Course Assessment Plan</SectionTitle><Table><colgroup><col className="w-[7%]" /><col className="w-[8%]" /><col className="w-[10%]" /><col className="w-[23%]" /><col className="w-[7%]" /><col className="w-[7%]" /><col className="w-[10%]" /><col className="w-[14%]" /><col className="w-[14%]" /></colgroup><thead><tr><TH>CLOs</TH><TH>PLO</TH><TH>C/A/P Level</TH><TH>Assessment &amp; Description</TH><TH>G/I</TH><TH>Weight (%)</TH><TH>SLT</TH><TH>Evaluation Definition</TH><TH>Rubric</TH></tr></thead><tbody>{document.assessments.map((assessment) => <tr key={assessment.id}><TD>{joinValues(assessment.cloCodes)}</TD><TD>{joinValues(assessment.mappedPlos)}</TD><TD>{joinValues(assessment.capLevels)}</TD><TD><p className="font-semibold">{displayDocumentValue(assessment.name)}</p>{assessment.description ? <p className="mt-1 text-[9px] text-slate-700">{assessment.description}</p> : null}</TD><TD className="text-center">{assessment.mode === "group" ? "G" : "I"}</TD><TD>{assessment.weight ? `${assessment.weight}%` : "—"}</TD><TD>{assessment.totalSltHours > 0 ? `${assessment.totalSltHours} h` : "—"}</TD><TD>{displayDocumentValue(assessment.evaluationDefinition)}</TD><TD>{assessment.rubricName && assessment.rubricUrl ? <Link href={assessment.rubricUrl} className="font-semibold text-blue-700 underline underline-offset-2">{assessment.rubricName} ↗</Link> : assessment.rubricName ? assessment.rubricName : "—"}</TD></tr>)}</tbody><tfoot><tr><TD colSpan={5} className="font-semibold">Total Weightage</TD><TD className="font-semibold">{document.totals.assessmentWeight}%</TD><TD className="font-semibold">{document.totals.assessmentSlt} h</TD><TD colSpan={2}></TD></tr></tfoot></Table></PartTwoRow><PageFooter courseCode={info.courseCode} page={8} /></div></Page>

      {weeklyPages.map((weeks, index) => <Page zoom={zoom} pageNumber={weeklyStartPage + index} key={`lesson-${index}`}><div id={index === 0 ? "lesson-plan" : undefined} className="h-full px-[54px] py-[42px]"><PartTwoRow><SectionTitle number="18">Course Outline / Detailed Lesson Plan{weeklyPages.length > 1 ? ` — Weeks ${weeks[0]?.week ?? ""}–${weeks[weeks.length - 1]?.week ?? ""}` : ""}</SectionTitle><Table><colgroup><col className="w-[5%]" /><col className="w-[9%]" /><col className="w-[15%]" /><col className="w-[8%]" /><col className="w-[20%]" /><col className="w-[18%]" /><col className="w-[15%]" /><col className="w-[10%]" /></colgroup><thead><tr><TH>Week</TH><TH>Hour (L/T/P/O)</TH><TH>Topic</TH><TH>CLO</TH><TH>Lesson Learning Outcomes</TH><TH>Teaching Method / Activity</TH><TH>Assessment</TH><TH>Resources</TH></tr></thead><tbody>{weeks.map((week) => <tr key={week.id}><TD>{week.week}</TD><TD>{[week.lectureHours, week.tutorialHours, week.practiceHours, week.otherHours].map((h) => h || "0").join("/")}</TD><TD>{week.topic}</TD><TD>{joinValues(week.cloCodes)}</TD><TD>{week.lloItems.length ? week.lloItems.map((item, i) => <div key={i}>LLO{i + 1}: {item}</div>) : "—"}</TD><TD>{joinValues(week.teachingMethods.length ? week.teachingMethods : week.learningActivities)}</TD><TD>{joinValues([week.assessment, ...week.assessmentMethods].filter(Boolean))}</TD><TD>{joinValues(week.resources)}</TD></tr>)}</tbody></Table><div className="mt-4 grid grid-cols-3 gap-3 text-[9px]"><div className="rounded border border-black p-2"><strong>Learning Activities</strong><p className="mt-1">{joinValues(weeks.flatMap((w) => w.learningActivities))}</p></div><div className="rounded border border-black p-2"><strong>Active Learning Strategies</strong><p className="mt-1">{joinValues(weeks.flatMap((w) => w.activeLearningStrategies))}</p></div><div className="rounded border border-black p-2"><strong>Teaching Resources</strong><p className="mt-1">{joinValues(weeks.flatMap((w) => w.resources))}</p></div></div></PartTwoRow><PageFooter courseCode={info.courseCode} page={weeklyStartPage + index} /></div></Page>)}
      <Page zoom={zoom} pageNumber={resourcesPage}><div id="resources" className="h-full px-[54px] py-[42px]"><PartTwoRow><SectionTitle number="19">Required Resources to Deliver the Course</SectionTitle>{document.resources.length === 0 ? <p className="text-[11px]">No required resources have been confirmed.</p> : <Table><colgroup><col className="w-[18%]" /><col className="w-[27%]" /><col className="w-[25%]" /><col className="w-[30%]" /></colgroup><thead><tr><TH>Resource Type</TH><TH>Resource Name / Description</TH><TH>Link</TH><TH>Notes</TH></tr></thead><tbody>{document.resources.map((resource) => <tr key={resource.id}><TD>{displayDocumentValue(resource.resourceType)}</TD><TD>{displayDocumentValue(resource.title)}</TD><TD>{displayDocumentValue(resource.url)}</TD><TD>{displayDocumentValue(resource.notes)}</TD></tr>)}</tbody></Table>}</PartTwoRow><PageFooter courseCode={info.courseCode} page={resourcesPage} /></div></Page>
      <Page zoom={zoom} pageNumber={referencesPage}><div id="references" className="h-full px-[54px] py-[42px]"><PartTwoRow><SectionTitle number="20">References / Textbooks</SectionTitle>{document.references.length === 0 ? <p className="text-[11px]">No references have been recorded.</p> : <Table><colgroup><col className="w-[13%]" /><col className="w-[45%]" /><col className="w-[12%]" /><col className="w-[15%]" /><col className="w-[15%]" /></colgroup><thead><tr><TH>Kind</TH><TH>Citation</TH><TH>ISBN</TH><TH>Link</TH><TH>Notes</TH></tr></thead><tbody>{document.references.map((reference) => <tr key={reference.id}><TD>{referenceKindLabel(reference.kind)}</TD><TD>{referenceCitation(reference)}</TD><TD>{displayDocumentValue(reference.isbn)}</TD><TD>{displayDocumentValue(reference.url)}</TD><TD>{displayDocumentValue(reference.notes)}</TD></tr>)}</tbody></Table>}</PartTwoRow><PageFooter courseCode={info.courseCode} page={referencesPage} /></div></Page>
      <Page zoom={zoom} pageNumber={responsibilityPage}><div id="responsibility" className="h-full px-[54px] py-[42px]"><PartTwoRow><SectionTitle number="21">Student Responsibility</SectionTitle>{document.responsibilities.length === 0 ? <p className="text-[11px]">No student responsibilities have been recorded.</p> : <ul className="list-disc space-y-1.5 pl-5 text-[11px] leading-[1.4]">{document.responsibilities.map((item, index) => <li key={index}>{item}</li>)}</ul>}</PartTwoRow><PageFooter courseCode={info.courseCode} page={responsibilityPage} /></div></Page>
      {rubricPages.map((rubrics, index) => <Page zoom={zoom} pageNumber={rubricStartPage + index} key={`rubric-${index}`}><div id="rubric" className="h-full px-[54px] py-[42px]"><PartTwoRow><SectionTitle number="22">Rubric{rubricPages.length > 1 ? ` (${index + 1} of ${rubricPages.length})` : ""}</SectionTitle>{rubrics.length === 0 ? <p className="text-[11px]">No assessment has a rubric linked from the Rubric Library.</p> : <div className="space-y-4">{rubrics.map((rubric, ri) => <div key={ri}><p className="text-[11px] font-bold">{rubric.assessmentName} — {rubric.name} ({rubric.type})</p><p className="mt-0.5 text-[10px] text-slate-600">Rating Scale: {rubric.scaleSummary}</p><Table className="mt-1.5"><colgroup><col className="w-[22%]" />{rubric.levels.map((_level, i) => <col key={i} style={{ width: `${78 / rubric.levels.length}%` }} />)}</colgroup><thead><tr><TH>Criteria</TH>{rubric.levels.map((level, i) => <TH key={i} className="text-center">{level.points} – {level.label}</TH>)}</tr></thead><tbody>{rubric.criteria.map((criterion, ci) => <tr key={ci}><TD className="font-semibold">{criterion.name}</TD>{rubric.levels.map((_level, li) => <TD key={li}>{criterion.descriptors[li] ?? "—"}</TD>)}</tr>)}</tbody></Table></div>)}</div>}</PartTwoRow><PageFooter courseCode={info.courseCode} page={rubricStartPage + index} /></div></Page>)}
      <Page zoom={zoom} pageNumber={policyPage}><div id="policy" className="h-full px-[54px] py-[42px]"><PartTwoRow><SectionTitle number="23">Course Policy</SectionTitle><div className="space-y-3 text-[11px] leading-[1.4]">{[["Attendance & Preparation", document.policy.attendancePreparation], ["Academic Integrity", document.policy.academicIntegrity], ["Homework & Assignments", document.policy.assignmentsLateSubmission], ["Examinations", document.policy.examinationRules], ["Penalties", document.policy.penaltiesConsequences]].map(([label, value]) => <div key={label}><p className="font-bold">{label}</p><p className="mt-0.5 whitespace-pre-wrap">{displayDocumentValue(value)}</p></div>)}</div></PartTwoRow><PageFooter courseCode={info.courseCode} page={policyPage} /></div></Page>
      <Page zoom={zoom} pageNumber={ratingScalePage}><div id="rating-scale" className="h-full px-[54px] py-[42px]"><PartTwoRow><SectionTitle number="24">Rating Scale</SectionTitle>{document.gradingScale?.grades.length ? <Table><colgroup><col className="w-[25%]" /><col className="w-[25%]" /><col className="w-[25%]" /><col className="w-[25%]" /></colgroup><thead><tr><TH>Letter Grade</TH><TH>Grade Point</TH><TH>Score</TH><TH>Explanation</TH></tr></thead><tbody>{document.gradingScale.grades.map((grade) => <tr key={grade.id}><TD className="text-center">{grade.letterGrade}</TD><TD className="text-center">{grade.gradePoint.toFixed(2)}</TD><TD className="text-center">{grade.scoreLabel}</TD><TD>{grade.explanation}</TD></tr>)}</tbody></Table> : <p className="text-[11px]">No approved programme grading scale is bound to this Course Specification.</p>}</PartTwoRow><PageFooter courseCode={info.courseCode} page={ratingScalePage} /></div></Page>
      <Page zoom={zoom} pageNumber={datePage}><div id="spec-date" className="h-full px-[54px] py-[42px]"><PartTwoRow><SectionTitle number="25">Date</SectionTitle><Table><colgroup><col className="w-[50%]" /><col className="w-[50%]" /></colgroup><thead><tr><TH>Item</TH><TH>Date</TH></tr></thead><tbody><tr><TD>Course Specification Last Revised / Approved</TD><TD>{displayDocumentValue(document.specDate)}</TD></tr></tbody></Table></PartTwoRow><PageFooter courseCode={info.courseCode} page={datePage} /></div></Page>
    </>
  );
}
