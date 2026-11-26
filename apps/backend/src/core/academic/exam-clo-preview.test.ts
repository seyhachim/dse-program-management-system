import { describe, expect, test } from "bun:test";
import { createExamVariantSnapshot, summarizeExamVariantScores } from "./exam-variant.ts";
import { buildExamCloPreview, type ExamCloPreviewSource } from "./exam-clo-preview.ts";
const scope={programmeId:"dse",courseSpecId:"spec",assessmentItemId:"exam",offeringId:"m1",activeCloCodes:["CLO1","CLO2","CLO3"]};
const paperScope={programmeId:scope.programmeId,courseSpecId:scope.courseSpecId,assessmentItemId:scope.assessmentItemId};
function source(i:number,max:number,score:number|null,support:number|null):ExamCloPreviewSource{
  const enrollmentId="e"+i;
  const snapshot=createExamVariantSnapshot({...paperScope,variantId:"paper"+i,revision:1,instrumentId:"scheme"+i,instrumentHash:"marking-scheme-v1:"+"a".repeat(64),examMaximum:100,questions:[
    {questionId:"part-a",maxPoints:max,cloCode:"CLO1",evidence:"direct"},
    {questionId:"part-b",maxPoints:100-max,cloCode:"CLO1",evidence:"supporting"}]});
  const exactScope={...paperScope,offeringId:scope.offeringId,enrollmentId};
  const v={variantId:snapshot.variantId,variantHash:snapshot.variantHash};
  const summary=summarizeExamVariantScores({context:{...exactScope,examMaximum:100,activeCloCodes:scope.activeCloCodes},
    variants:[snapshot],permissions:[{...paperScope,offeringId:scope.offeringId,...v}],assignment:{...exactScope,...v,confirmed:true}},
    {...exactScope,...v,marks:[{questionId:"part-a",maxPoints:max,score},{questionId:"part-b",maxPoints:100-max,score:support}]});
  return {enrollmentId,eligible:true,assignmentId:"a"+i,assignmentRevision:1,snapshot,gradeRevision:1,dossierId:"d"+i,approvedDossierId:"d"+i,sampleOutcome:null,summary};
}
const blank:ExamCloPreviewSource={enrollmentId:"unassigned",eligible:true,assignmentId:null,assignmentRevision:null,snapshot:null,gradeRevision:null,dossierId:null,approvedDossierId:null,sampleOutcome:null,summary:null};
describe("exam CLO preview",()=>{
  test("five unequal paper denominators, separate roles and actual zero",()=>{
    const rows=[source(1,20,10,80),source(2,80,80,0),source(3,40,0,60),source(4,60,30,40),source(5,30,15,70)];
    const report=buildExamCloPreview(scope,rows,50);
    expect(report.official).toBe(false);
    expect(report.byPaper).toHaveLength(5);
    expect(report.rows.find(r=>r.cloCode==="CLO1"&&r.role==="direct")).toMatchObject({available:5,meanPercentage:50,meetsScenarioCount:4,meetsScenarioRate:80});
    expect(report.rows.find(r=>r.cloCode==="CLO1"&&r.role==="supporting")).toMatchObject({available:5,meanPercentage:80,meetsScenarioCount:null,meetsScenarioRate:null});
    expect(report.students.find(s=>s.enrollmentId==="e3")?.evidence[0]).toMatchObject({earnedPoints:0,percentage:0,state:"available",meetsScenario:false});
    expect(report.rows.find(r=>r.cloCode==="CLO2"&&r.role==="direct")).toMatchObject({notMapped:5,meanPercentage:null,meetsScenarioRate:null});
    expect(buildExamCloPreview(scope,[...rows].reverse(),50).calculationHash).toBe(report.calculationHash);
    expect(buildExamCloPreview(scope,rows,null).rows[0]?.meetsScenarioCount).toBeNull();
    expect(buildExamCloPreview(scope,rows,75).calculationHash).not.toBe(report.calculationHash);
  });
  test("distinguishes absent, incomplete, historical, rejected sample and ineligible",()=>{
    const partial=source(1,20,10,null), historical={...source(2,20,10,20),dossierId:null};
    const rejected={...source(3,20,10,20),sampleOutcome:"ChangesRequired" as const};
    const ungraded={...source(4,20,10,20),gradeRevision:null,summary:null,dossierId:null};
    const inactive={...source(5,20,10,20),eligible:false};
    const report=buildExamCloPreview(scope,[partial,historical,rejected,ungraded,inactive,blank],50);
    expect(report.students.map(s=>s.status)).toEqual(["incomplete","unverified","changes-required","ungraded","ineligible","unassigned"]);
    expect(report.rows[0]).toMatchObject({population:6,eligible:5,mapped:4,missing:4,available:0,unknownMapping:1,meanPercentage:null,meetsScenarioRate:null});
    expect(report.students.every(s=>s.evidence.every(e=>e.earnedPoints===null&&e.percentage===null))).toBe(true);
    expect(buildExamCloPreview(scope,[],null).rows[0]).toMatchObject({population:0,available:0,meanPercentage:null});
  });
  test("rejects duplicate and mismatched evidence or threshold",()=>{
    const row=source(1,20,10,20);
    expect(()=>buildExamCloPreview(scope,[row,row],50)).toThrow("Duplicate enrollment");
    expect(()=>buildExamCloPreview({...scope,offeringId:"m2"},[row],50)).toThrow("Exam score provenance mismatch");
    expect(()=>buildExamCloPreview(scope,[{...row,enrollmentId:"different"}],50)).toThrow("Exam score provenance mismatch");
    expect(()=>buildExamCloPreview(scope,[row],101)).toThrow();
  });
});
