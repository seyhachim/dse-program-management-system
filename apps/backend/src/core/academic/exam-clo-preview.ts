import { createHash } from "node:crypto";
import { z } from "zod";
import { verifyExamVariantSnapshot, type ExamVariantSnapshot, type ExamVariantScoreSummary } from "./exam-variant.ts";

export const EXAM_CLO_PREVIEW_VERSION = "exam-clo-preview-v1";
export const examCloScenarioSchema = z.number().finite().min(0).max(100).nullable();
export type ExamCloScenario = z.infer<typeof examCloScenarioSchema>;
export type ExamCloStatus = "ineligible"|"unassigned"|"ungraded"|"incomplete"|"unverified"|"changes-required"|"available";
export type ExamCloPreviewSource = {
  enrollmentId:string; eligible:boolean; assignmentId:string|null; assignmentRevision:number|null;
  snapshot:ExamVariantSnapshot|null; gradeRevision:number|null; dossierId:string|null;
  approvedDossierId:string|null; sampleOutcome:"Accepted"|"ChangesRequired"|null;
  summary:ExamVariantScoreSummary|null;
};
type Scope = {programmeId:string;courseSpecId:string;assessmentItemId:string;offeringId:string;activeCloCodes:readonly string[]};
const roles = ["direct","supporting"] as const;
type Role = typeof roles[number];
const round2 = (n:number) => Math.round(n*100)/100;
const order = (a:string,b:string) => a<b?-1:a>b?1:0;
function fail(message:string):never { throw new Error(message); }

/** Private diagnostic only. Threshold is a caller-selected scenario, not an
 * institutional policy. No result release, no official snapshot, no PLO claim.
 * Inputs must come from authorized exact-scope records and verified summaries.
 */
export function buildExamCloPreview(scope:Scope,sources:readonly ExamCloPreviewSource[],scenarioInput:unknown) {
  const threshold=examCloScenarioSchema.parse(scenarioInput);
  if(!scope.activeCloCodes.length||new Set(scope.activeCloCodes).size!==scope.activeCloCodes.length) fail("Invalid active CLO scope");
  if(new Set(sources.map(s=>s.enrollmentId)).size!==sources.length) fail("Duplicate enrollment");
  const students=[...sources].sort((a,b)=>order(a.enrollmentId,b.enrollmentId)).map(s=>{
    const paper=s.snapshot?verifyExamVariantSnapshot(s.snapshot):null;
    if(paper&&(paper.programmeId!==scope.programmeId||paper.courseSpecId!==scope.courseSpecId||
      paper.assessmentItemId!==scope.assessmentItemId||paper.questions.some(q=>!scope.activeCloCodes.includes(q.cloCode)))) fail("Exam evidence scope mismatch");
    if(Boolean(paper)!==Boolean(s.assignmentId)||Boolean(paper)!==(s.assignmentRevision!==null)||
      (s.assignmentRevision!==null&&(!Number.isSafeInteger(s.assignmentRevision)||s.assignmentRevision<1))) fail("Incomplete assignment provenance");
    const sum=s.summary;
    if((s.gradeRevision!==null)!==Boolean(sum)||(!paper&&sum)||(s.gradeRevision!==null&&(!Number.isSafeInteger(s.gradeRevision)||s.gradeRevision<1))) fail("Incomplete grade provenance");
    if(sum&&paper&&(sum.enrollmentId!==s.enrollmentId||sum.offeringId!==scope.offeringId||sum.programmeId!==scope.programmeId||
      sum.courseSpecId!==scope.courseSpecId||sum.assessmentItemId!==scope.assessmentItemId||
      sum.variantId!==paper.variantId||sum.variantHash!==paper.variantHash||sum.instrumentId!==paper.instrumentId||
      sum.instrumentHash!==paper.instrumentHash||sum.maximumPoints!==paper.examMaximum||
      sum.rows.length!==paper.questions.length||sum.rows.some((r,i)=>{const q=paper.questions[i];return !q||r.questionId!==q.questionId||
      r.maxPoints!==q.maxPoints||r.cloCode!==q.cloCode||r.evidence!==q.evidence||
      (r.score!==null&&(!Number.isFinite(r.score)||r.score<0||r.score>q.maxPoints));})||
      sum.complete!==sum.rows.every(r=>r.score!==null))) fail("Exam score provenance mismatch");
    const status:ExamCloStatus=!s.eligible?"ineligible":!paper?"unassigned":!sum?"ungraded":!sum.complete?"incomplete":
      !s.dossierId||s.dossierId!==s.approvedDossierId?"unverified":s.sampleOutcome==="ChangesRequired"?"changes-required":"available";
    const evidence=scope.activeCloCodes.flatMap(cloCode=>roles.map(role=>{
      const questions=paper?.questions.filter(q=>q.cloCode===cloCode&&q.evidence===role)??[];
      const plannedMaximum=questions.length?questions.reduce((n,q)=>n+q.maxPoints,0):null;
      const state=!s.eligible?"ineligible" as const:!paper?"unassigned" as const:!questions.length?"not-mapped" as const:status;
      const scored=state==="available"&&sum?sum.rows.filter(q=>q.cloCode===cloCode&&q.evidence===role):[];
      const earnedPoints=scored.length?scored.reduce((n,q)=>n+(q.score??0),0):null;
      const percentage=earnedPoints!==null&&plannedMaximum!==null?round2(earnedPoints/plannedMaximum*100):null;
      // Existing QA engine compares rounded per-assessment percentages. Use
      // identical rounding here, but never classify supporting evidence as achieved.
      return {cloCode,role,state,plannedMaximum,earnedPoints,percentage,
        meetsScenario:role==="direct"&&percentage!==null&&threshold!==null?percentage>=threshold:null,
        questionIds:questions.map(q=>q.questionId)};
    }));
    return {enrollmentId:s.enrollmentId,eligible:s.eligible,status,assignmentId:s.assignmentId,assignmentRevision:s.assignmentRevision,
      variantId:paper?.variantId??null,variantHash:paper?.variantHash??null,instrumentHash:paper?.instrumentHash??null,
      gradeRevision:s.gradeRevision,dossierId:s.dossierId,approvedDossierId:s.approvedDossierId,sampleOutcome:s.sampleOutcome,evidence};
  });
  function summarize(pop:typeof students) {
    return scope.activeCloCodes.flatMap(cloCode=>roles.map(role=>{
      const rows=pop.map(s=>s.evidence.find(e=>e.cloCode===cloCode&&e.role===role)!);
      const available=rows.filter(e=>e.state==="available");
      const eligible=rows.filter(e=>e.state!=="ineligible");
      const notMapped=rows.filter(e=>e.state==="not-mapped").length;
      const unknownMapping=rows.filter(e=>e.state==="unassigned").length;
      const mapped=eligible.length-notMapped-unknownMapping;
      const meetsScenarioCount=role==="direct"&&threshold!==null?available.filter(e=>e.meetsScenario).length:null;
      return {cloCode,role,population:rows.length,eligible:eligible.length,mapped,notMapped,unknownMapping,
        available:available.length,missing:mapped-available.length,
        // Do not pool earned/max across variants. Each learner has one normalized percentage.
        meanPercentage:available.length?round2(available.reduce((n,e)=>n+e.percentage!,0)/available.length):null,
        meetsScenarioCount,meetsScenarioRate:meetsScenarioCount!==null&&available.length?round2(meetsScenarioCount/available.length*100):null};
    }));
  }
  const hashes=[...new Set(students.flatMap(s=>s.variantHash?[s.variantHash]:[]))].sort(order);
  const byPaper=hashes.map(variantHash=>{
    const pop=students.filter(s=>s.variantHash===variantHash);
    return {variantId:pop[0]!.variantId!,variantHash,population:pop.length,rows:summarize(pop)};
  });
  const payload={calculationVersion:EXAM_CLO_PREVIEW_VERSION,kind:"private-exam-draft-preview" as const,
    official:false as const,scope:{...scope,activeCloCodes:[...scope.activeCloCodes]},scenarioThreshold:threshold,
    population:students.length,students,rows:summarize(students),byPaper};
  return {...payload,calculationHash:createHash("sha256").update(JSON.stringify(payload)).digest("hex")};
}
