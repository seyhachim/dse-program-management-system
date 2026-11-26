import { describe, expect, test } from "bun:test";
import type { AuthUser } from "../../core/auth/token.ts";
import { bindCandidatePolicy } from "./clo-attainment-policy.ts";
import {
  calculateWeightedDirectPreview, type AssessmentPlan, type DirectScope,
  type InstrumentIdentity, type PlannedComponent, type ReleasedAssessment, type WeightedDirectInput,
} from "./weighted-direct-clo.ts";

const actor: AuthUser = { id: "synthetic", email: "synthetic@example.invalid",
  roles: ["program_coordinator"], programmeRoles: [{ role: "program_coordinator", programmeId: "dse" }] };
const scope: DirectScope = { programmeId: "dse", offeringId: "offering", courseSpecId: "spec-v1", cloId: "clo-1" };
const policy = bindCandidatePolicy(actor, "dse", { id: "policy-1", programmeId: "dse",
  topic: "obe", revision: 1, status: "verified", classification: "internal_staff", version: "test-v1",
  locator: "Synthetic locator", verifiedAt: new Date("2026-01-01T00:00:00Z") }, "candidate-b");
function component(id: string, maxScore: number, role: PlannedComponent["role"] = "direct",
  attribution: PlannedComponent["attribution"] = "individual"): PlannedComponent {
  return { id, maxScore, role, attribution };
}
function plan(id: string, components: PlannedComponent[], kind: InstrumentIdentity["kind"] = "criterion",
  assignmentKey: string | null = null): AssessmentPlan {
  return { assessmentItemId: id, mapping: "mapped", components, instrument: { kind,
    instrumentId: id+"-instrument", instrumentHash: id+"-version",
    assignmentKey, exclusiveCloId: kind === "whole-assessment" ? scope.cloId : null } };
}
function result(p: AssessmentPlan, scores: Record<string, number | null>, enrollmentId = "student-a"): ReleasedAssessment {
  return { scope: { ...scope, enrollmentId, assessmentItemId: p.assessmentItemId }, instrument: p.instrument!,
    sourceResultId: enrollmentId+":"+p.assessmentItemId, sourceRevisionId: "revision-1",
    release: "published-finalized", verified: true, scores: Object.entries(scores).map(([componentId, score]) =>
      ({componentId, scoreId: enrollmentId+":"+p.assessmentItemId+":"+componentId, score})) };
}
function fixture(plans: AssessmentPlan[], results: ReleasedAssessment[], weights: (number|null)[]): WeightedDirectInput {
  return { scope, policy, assessments: plans.map((p,i)=>({assessmentItemId:p.assessmentItemId,cloWeight:weights[i]!})),
    enrollmentIds:["student-a"], students:[{enrollmentId:"student-a",plans,results}] };
}

describe("governance weighted direct CLO preview (#1384)", () => {
  test("Appendix D-shaped regression uses explicit task weights, excludes unmapped task, retains raw precision", () => {
    const a=plan("a",[component("a1",10)]);
    const b=plan("b",[component("b1",10),component("b2",20)],"question","assignment-v1");
    const c: AssessmentPlan={assessmentItemId:"c",mapping:"not-mapped",instrument:null,components:[]};
    const d=plan("d",[component("d1",40)]);
    const out=calculateWeightedDirectPreview(fixture([a,b,c,d],
      [result(a,{a1:9}),result(b,{b1:8,b2:18}),result(d,{d1:34})],[20,30,20,30]));
    expect(out.students[0]?.percentage).toBeCloseTo(86.875,8);
    expect(out.students[0]?.expectedWeight).toBe(80);
    expect(out.students[0]?.attained).toBe(true);
    expect(out.population.completePopulationRate).toBe(100);
    expect(out.directLevel).toBe(3);
    expect(out.official).toBe(false);
  });
  test("weighted evidence differs from unweighted averages, no course grade field required", () => {
    const a=plan("a",[component("a1",10)]), b=plan("b",[component("b1",100)]);
    const out=calculateWeightedDirectPreview(fixture([a,b],[result(a,{a1:9}),result(b,{b1:50})],[20,80]));
    expect(out.students[0]?.percentage).toBeCloseTo(58,8);
    expect(out.students[0]?.attained).toBe(false);
  });
  test("sums component points once per assessment, ignores supporting and shared group marks", () => {
    const a=plan("a",[component("a1",10),component("a2",30),component("s",50,"supporting","shared-group")]);
    const b=plan("b",[component("b1",100,"supporting")]);
    const out=calculateWeightedDirectPreview(fixture([a,b],[result(a,{a1:10,a2:15,s:50}),result(b,{b1:100})],[100,null]));
    expect(out.students[0]?.percentage).toBe(62.5);
    expect(out.students[0]?.assessments.find(x=>x.assessmentItemId==="b")?.state).toBe("supporting-only");
  });
  test("rejects shared-group direct mapping but accepts separately attributable contribution", () => {
    const a=plan("a",[component("a1",10,"direct","shared-group")]);
    expect(()=>calculateWeightedDirectPreview(fixture([a],[result(a,{a1:10})],[100]))).toThrow();
    const b=plan("b",[component("b1",10,"direct","individual-contribution")]);
    expect(calculateWeightedDirectPreview(fixture([b],[result(b,{b1:6})],[100])).students[0]?.attained).toBe(true);
  });
  test("missing direct component and missing assessment are not zero or reweighted", () => {
    const a=plan("a",[component("a1",10),component("a2",10)]), b=plan("b",[component("b1",10)]);
    const out=calculateWeightedDirectPreview(fixture([a,b],[result(a,{a1:10,a2:null})],[50,50]));
    expect(out.students[0]?.percentage).toBeNull();
    expect(out.students[0]?.attained).toBeNull();
    expect(out.students[0]?.completedWeight).toBe(0);
    expect(out.population.studentCount).toBe(0);
    expect(out.directLevel).toBeNull();
  });
  test("unresolved mapping prevents classification, no-mapping and zero remain distinct", () => {
    const a=plan("a",[component("a1",10)]);
    const b:AssessmentPlan={assessmentItemId:"b",mapping:"unresolved",instrument:null,components:[]};
    const out=calculateWeightedDirectPreview(fixture([a,b],[result(a,{a1:10})],[50,50]));
    expect(out.students[0]?.status).toBe("unresolved");
    expect(out.students[0]?.percentage).toBeNull();
    const zero=calculateWeightedDirectPreview(fixture([a],[result(a,{a1:0})],[100]));
    expect(zero.students[0]?.percentage).toBe(0);
    expect(zero.students[0]?.attained).toBe(false);
    expect(zero.population.studentCount).toBe(1);
    const none=calculateWeightedDirectPreview(fixture([{...b,mapping:"not-mapped"}],[],[null]));
    expect(none.students[0]?.status).toBe("no-direct-evidence");
  });
  test("different exact exam papers normalize independently, not pooled raw marks", () => {
    const a=plan("exam",[component("qa",20)],"question","assignment-a-v1");
    const b=plan("exam",[component("qb",100)],"question","assignment-b-v1");
    const second={...b,instrument:{...b.instrument!,instrumentId:"paper-b",instrumentHash:"paper-b-hash"}};
    const input=fixture([a],[result(a,{qa:16})],[100]);
    const out=calculateWeightedDirectPreview({...input,enrollmentIds:["student-b","student-a"],
      students:[...input.students,{enrollmentId:"student-b",plans:[second],results:[result(second,{qb:50},"student-b")]}]});
    expect(out.students.map(s=>s.percentage)).toEqual([80,50]);
    expect(out.population.completePopulationRate).toBe(50);
    expect(out.directLevel).toBe(0);
  });
  test("rejects stale paper, wrong enrolment or scope, draft evidence and unknown component", () => {
    const a=plan("exam",[component("q",20)],"question","assignment-v1");
    const r=result(a,{q:10});
    const bad: ReleasedAssessment[]=[
      {...r,instrument:{...r.instrument,assignmentKey:"assignment-v2"}},
      {...r,instrument:{...r.instrument,instrumentHash:"other"}},
      {...r,scope:{...r.scope,enrollmentId:"other"}},
      {...r,scope:{...r.scope,offeringId:"other"}},
      {...r,scope:{...r.scope,courseSpecId:"other"}},
      {...r,scope:{...r.scope,cloId:"other"}},
      {...r,release:"draft" as ReleasedAssessment["release"]},
      {...r,verified:false as true},
      {...r,scores:[{componentId:"other",scoreId:"unknown",score:10}]},
    ];
    for(const invalid of bad) expect(()=>calculateWeightedDirectPreview(fixture([a],[invalid],[100]))).toThrow();
  });
  test("rejects duplicates, invalid marks and missing explicit CLO weights", () => {
    const a=plan("a",[component("a1",10)]);
    const r=result(a,{a1:6});
    expect(()=>calculateWeightedDirectPreview(fixture([a],[r],[null]))).toThrow();
    expect(()=>calculateWeightedDirectPreview(fixture([a],[r],[0]))).toThrow();
    expect(()=>calculateWeightedDirectPreview(fixture([a],[r,r],[100]))).toThrow();
    expect(()=>calculateWeightedDirectPreview(fixture([a],[{...r,scores:[...r.scores,...r.scores]}],[100]))).toThrow();
    expect(()=>calculateWeightedDirectPreview(fixture([a],[result(a,{a1:11})],[100]))).toThrow();
    expect(()=>calculateWeightedDirectPreview(fixture([a],[result(a,{a1:NaN})],[100]))).toThrow();
  });
  test("whole-assessment evidence requires exclusive explicit CLO and never falls back from missing criterion scores", () => {
    const a=plan("a",[component("total",10)],"whole-assessment");
    expect(calculateWeightedDirectPreview(fixture([a],[result(a,{total:6})],[100])).students[0]?.percentage).toBe(60);
    const bad={...a,instrument:{...a.instrument!,exclusiveCloId:"another"}};
    expect(()=>calculateWeightedDirectPreview(fixture([bad],[result(bad,{total:6})],[100]))).toThrow();
    const rubric=plan("a",[component("criterion",10)]);
    expect(()=>calculateWeightedDirectPreview(fixture([rubric],[result(a,{total:6})],[100]))).toThrow();
  });
  test("exact population, incomplete coverage and duplicate direct attribution", () => {
    const a=plan("a",[component("a1",10)]);
    const input=fixture([a],[result(a,{a1:7})],[100]);
    expect(()=>calculateWeightedDirectPreview({...input,enrollmentIds:["student-a","student-b"]})).toThrow();
    const out=calculateWeightedDirectPreview({...input,enrollmentIds:["student-a","student-b"],
      students:[...input.students,{enrollmentId:"student-b",plans:[a],results:[]}]});
    expect(out.population.coverage).toBe(50);
    expect(out.population.measuredRate).toBe(100);
    expect(out.population.completePopulationRate).toBeNull();
    expect(out.directLevel).toBeNull();
    const copied={...result(a,{a1:7},"student-b"),sourceResultId:result(a,{a1:7}).sourceResultId};
    expect(()=>calculateWeightedDirectPreview({...input,enrollmentIds:["student-a","student-b"],
      students:[...input.students,{enrollmentId:"student-b",plans:[a],results:[copied]}]})).toThrow();
    const empty=calculateWeightedDirectPreview({...input,enrollmentIds:[],students:[]});
    expect(empty.population.completePopulationRate).toBeNull();
  });
  test("different assessment coverage prevents a class level even when each score is complete", () => {
    const a=plan("a",[component("a1",10)]), b=plan("b",[component("b1",10)]);
    const unmapped:AssessmentPlan={assessmentItemId:"b",mapping:"not-mapped",instrument:null,components:[]};
    const input=fixture([a,b],[result(a,{a1:6}),result(b,{b1:6})],[20,80]);
    const out=calculateWeightedDirectPreview({...input,enrollmentIds:["student-a","student-b"],
      students:[...input.students,{enrollmentId:"student-b",plans:[a,unmapped],results:[result(a,{a1:6},"student-b")]}]});
    expect(out.students.map(s=>s.percentage)).toEqual([60,60]);
    expect(out.population.completePopulationRate).toBe(100);
    expect(out.comparableAssessmentCoverage).toBe(false);
    expect(out.directLevel).toBeNull();
  });
  test("versioned calculation hash stable across order and changes on revision/correction", () => {
    const a=plan("a",[component("a1",10),component("a2",10)]), b=plan("b",[component("b1",10)]);
    const r=result(a,{a1:6,a2:8}), s=result(b,{b1:5});
    const first=calculateWeightedDirectPreview(fixture([a,b],[r,s],[50,50]));
    const reordered=calculateWeightedDirectPreview(fixture([b,{...a,components:[...a.components].reverse()}],
      [s,{...r,scores:[...r.scores].reverse()}],[50,50]));
    expect(first.calculationHash).toBe(reordered.calculationHash);
    expect(first.calculationHash).not.toBe(calculateWeightedDirectPreview(fixture([a,b],[{...r,sourceRevisionId:"rev-2"},s],[50,50])).calculationHash);
    expect(()=>calculateWeightedDirectPreview({...fixture([a,b],[r,s],[50,50]),scope:{...scope,programmeId:"other"}})).toThrow();
  });
});
