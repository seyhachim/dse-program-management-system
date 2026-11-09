import { describe, expect, test } from "bun:test";
import type { AnnualEvidence, AnnualTeaching, AnnualYear } from "@dse-pms/shared-types";
import { summarizeAnnualLecturers, type AnnualStaffInput } from "./annual-summary.ts";
import { annualReportCsv, annualReportExcelXml } from "./annual-export.ts";

const year:AnnualYear={id:"year-2025",label:"2025–2026",startYear:2025,endYear:2026};
const nextYear:AnnualYear={id:"year-2026",label:"2026–2027",startYear:2026,endYear:2027};
function teaching(offeringId:string, overrides:Partial<AnnualTeaching>={}):AnnualTeaching {
  return {offeringId,courseCode:"TSA301",courseTitle:"Time Series Analysis",term:"2025–2026",
    sectionCode:"M1",role:"Primary Lecturer",deliveredSessions:1,deliveredSessionIds:["session-"+offeringId],
    reviewId:"review-"+offeringId,verdict:"confirmed",evidenceUrl:"https://example.edu/source",
    confirmed:true,discrepancy:false,...overrides};
}
function evidence(id:string,kind:AnnualEvidence["kind"],status:AnnualEvidence["verificationStatus"],
  identifier=""):AnnualEvidence {
  return {id,kind,title:kind==="publication"?"Shared Paper":"Training",
    identifier,organization:"RUPP",url:"https://example.edu/"+id,
    verificationStatus:status,verifiedByEventId:status==="verified"?"review-"+id:null};
}
function person(id:string,overrides:Partial<AnnualStaffInput>={}):AnnualStaffInput {
  return {lecturerId:id,name:"Lecturer "+id,employmentType:"Part-time",qualification:"Master's",
    submitted:false,teaching:[],evidence:[],...overrides};
}
const report=(people:AnnualStaffInput[],target=year)=>
  summarizeAnnualLecturers(target,people,"2026-11-09T00:00:00.000Z");

describe("annual lecturer MVP acceptance scenarios",()=>{
  test("1. Previous-year teaching survives no teaching next year",()=>{
    const old=report([person("l1",{teaching:[teaching("o1")]})]);
    const current=report([person("l1")],nextYear);
    expect(old.statistics.activeTeaching).toBe(1);
    expect(current.statistics.activeTeaching).toBe(0);
    expect(old.staff[0]!.teaching[0]!.offeringId).toBe("o1");
  });
  test("2. One-semester part-time lecturer is one annual person",()=>{
    const r=report([person("l1",{teaching:[teaching("o1"),teaching("o2")]})]);
    expect(r.statistics.activeTeaching).toBe(1);
    expect(r.staff[0]!.teaching).toHaveLength(2);
  });
  test("3. Supervision without teaching is other contributor",()=>{
    const r=report([person("l2",{evidence:[evidence("a1","supervision","verified")]})]);
    expect(r.staff[0]!.classification).toBe("other_contributor");
    expect(r.statistics.activeTeaching).toBe(0);
    expect(r.statistics.otherContributors).toBe(1);
  });
  test("4. Missing submission is unreported, not zero achievements",()=>{
    const r=report([person("l3")]);
    expect(r.staff[0]!.submissionStatus).toBe("unreported");
    expect(r.statistics.unreported).toBe(1);
    expect(r.statistics.evidenceGaps).toBe(1);
  });
  test("5. Rejected training and self-declared activities excluded from verified counts",()=>{
    const r=report([person("l1",{submitted:true,evidence:[
      evidence("a1","professional_development","rejected"),
      evidence("a2","professional_development","self_declared")]} )]);
    expect(r.statistics.verifiedCpdActivities).toBe(0);
    expect(r.staff[0]!.verifiedActivityCount).toBe(0);
    expect(r.staff[0]!.evidence).toHaveLength(2);
    expect(r.staff[0]!.evidence.find(e => e.id === "a1")?.verificationStatus).toBe("rejected");
  });
  test("6. Two contributors to one DOI are counted as one publication",()=>{
    const r=report([
      person("l1",{evidence:[evidence("item-1","publication","verified","https://doi.org/10.1234/ABC")]}),
      person("l2",{evidence:[evidence("item-2","publication","verified","10.1234/abc")]}),
    ]);
    expect(r.statistics.distinctPublications).toBe(1);
    expect(r.statistics.otherContributors).toBe(2);
  });
  test("7. Export carries reviewed source identifiers and unreported status",()=>{
    const r=report([person("l1",{submitted:false,teaching:[teaching("o1")],
      evidence:[evidence("item-id","publication","verified","10.abc/x")]})]);
    const csv=annualReportCsv({...r,releaseVersion:1});
    const excel=annualReportExcelXml({...r,releaseVersion:1});
    for(const source of ["o1","review-o1","session-o1","item-id","review-item-id","unreported"]){
      expect(csv).toContain(source);
      expect(excel).toContain(source);
    }
    expect(excel).toContain("<Workbook");
  });
  test("A negative review cannot erase an existing authoritative delivered session",()=>{
    const r=report([person("l1",{teaching:[teaching("o1",{
      verdict:"not_delivered",deliveredSessions:1,deliveredSessionIds:["session-o1"],
      confirmed:false,discrepancy:false,
    })]})]);
    expect(r.statistics.activeTeaching).toBe(1);
    expect(r.staff[0]!.teaching[0]!.discrepancy).toBe(true);
    expect(r.statistics.evidenceGaps).toBe(1);
  });
  test("Only assignment without delivery or coordinator confirmation is not active",()=>{
    const r=report([person("l1",{teaching:[teaching("o1",{
      verdict:null,reviewId:null,deliveredSessions:0,deliveredSessionIds:[],confirmed:false,
    })]})]);
    expect(r.statistics.activeTeaching).toBe(0);
  });
});
