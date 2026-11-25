import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type {
  AnnualEvidence, AnnualReportingWindow, AnnualSummary, AnnualTeaching, AnnualYear,
  ReviewAnnualTeachingInput, ReviewAnnualStaffInput, UpdateAnnualReportingWindowInput, ReviewAnnualSubmissionInput,
} from "@dse-pms/shared-types";
import { DEFAULT_PROGRAMME_ID } from "../../core/programme.ts";
import { prisma } from "../../core/db/prisma.ts";
import { lecturerService } from "./service.ts";
import { summarizeAnnualLecturers, type AnnualStaffInput } from "./annual-summary.ts";
import { annualEvidenceAttribution } from "./annual-attribution.ts";

export class AnnualNotFoundError extends Error {}
export class AnnualValidationError extends Error {}
type ReviewRow = { id:string; offeringId:string; lecturerId:string; verdict:"confirmed"|"not_delivered"; evidenceUrl:string };
type EvidenceRow = { role:string; description:string; updatedAt:Date; lecturerId:string; itemId:string; kind:string; title:string; organization:string; identifier:string; url:string; startDate:Date|null; endDate:Date|null; verificationStatus:"SelfDeclared"|"Verified"|"Rejected"; verifiedByEventId:string|null };
type SubmissionRow = { lecturerId:string; revision:string; note:string };
type SubmissionReviewRow = { id:string; lecturerId:string; fingerprint:string; decision:"verified"|"needs_changes"; reason:string; reviewedAt:Date; awaitingResubmission:boolean };
type PeriodRow = { startDate:Date; endDate:Date; evidenceUrl:string; reviewedAt:Date };
type StaffReviewRow = { lecturerId:string; employmentType:string; qualification:string; eventId:string|null };
const dateOnly = (value:Date|null):string|null => value?.toISOString().slice(0,10)??null;
type DeliveryRow = { offeringId:string; lecturerId:string; sessionId:string };
const normalized = (s:string) => s.replace(/[–—]/g,"-");
const matchesYear = (o:{term:string;academicCalendarPeriod:{calendar:{academicYearId:string}}|null},y:AnnualYear) =>
  o.academicCalendarPeriod ? o.academicCalendarPeriod.calendar.academicYearId===y.id
    : normalized(o.term).includes(normalized(y.label));

async function getYear(id:string,db:Prisma.TransactionClient=prisma):Promise<AnnualYear> {
  const year=await db.academicYear.findFirst({where:{id,programmeId:DEFAULT_PROGRAMME_ID},
    select:{id:true,label:true,startYear:true,endYear:true}});
  if(!year) throw new AnnualNotFoundError("Academic year not found for DSE");
  return year;
}

async function getReportingWindow(yearId:string,db:Prisma.TransactionClient=prisma):Promise<AnnualReportingWindow|null> {
  const rows=await db.$queryRaw<PeriodRow[]>`
    SELECT "startDate","endDate","evidenceUrl","reviewedAt"
    FROM lecturer_annual."AnnualReportingWindow" WHERE "academicYearId"=${yearId}`;
  const row=rows[0];
  return row?{startDate:dateOnly(row.startDate)!,endDate:dateOnly(row.endDate)!,
    evidenceUrl:row.evidenceUrl,reviewedAt:row.reviewedAt.toISOString()}:null;
}

// One consistent snapshot for source validation and the append-only write.
// PostgreSQL may abort competing serializable writers; retry only known
// transient conflicts, never bypass validation or publish a partial report.
async function consistentAnnualWrite<T>(
  yearId:string,work:(tx:Prisma.TransactionClient)=>Promise<T>,release=false,
):Promise<T>{
  for(let attempt=0;;attempt++){
    try{
      return await prisma.$transaction(async tx=>{
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${yearId}))::text AS "locked"`;
        return work(tx);
      },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});
    }catch(error){
      const e=error as {code?:string;meta?:{code?:string}};
      const retryable=e.code==="P2034"||
        e.code==="P2010"&&(["40001","40P01"].includes(e.meta?.code??"")||
          release&&e.meta?.code==="23505");
      if(!retryable||attempt>=2)throw error;
    }
  }
}

export const lecturerAnnualService = {
  years():Promise<AnnualYear[]> {
    return prisma.academicYear.findMany({where:{programmeId:DEFAULT_PROGRAMME_ID},
      select:{id:true,label:true,startYear:true,endYear:true},
      orderBy:[{startYear:"desc"},{endYear:"desc"}]});
  },

  async summary(yearId:string,db:Prisma.TransactionClient=prisma):Promise<AnnualSummary> {
    const year=await getYear(yearId,db);
    const [people,offerings,reviews,links,submissions,period,staffReviews,submissionReviews]=await Promise.all([
      db.user.findMany({where:{roleAssignments:{some:{role:{slug:"lecturer"},
        OR:[{programmeId:DEFAULT_PROGRAMME_ID},{programmeId:null}]}}},
        select:{id:true,name:true},
        orderBy:{name:"asc"}}),
      db.offering.findMany({where:{course:{programmeId:DEFAULT_PROGRAMME_ID},
        OR:[{academicCalendarPeriod:{calendar:{academicYearId:year.id}}},
          {academicCalendarPeriodId:null,term:{contains:normalized(year.label)}},
          {academicCalendarPeriodId:null,term:{contains:year.label}}]},
        select:{id:true,term:true,sectionCode:true,lecturerId:true,
          course:{select:{code:true,title:true}},coLecturers:{select:{lecturerId:true}},
          academicCalendarPeriod:{select:{calendar:{select:{academicYearId:true}}}}}}),
      db.$queryRaw<ReviewRow[]>`
        SELECT "id","offeringId","lecturerId","verdict","evidenceUrl"
        FROM lecturer_annual."AnnualTeachingReview"
        WHERE "academicYearId"=${year.id}`,
      db.$queryRaw<EvidenceRow[]>`
        SELECT l."lecturerId",l."itemId",p."kind"::text AS "kind",p."title",
          p."organization",p."identifier",p."url",p."startDate",p."endDate",p."role",p."description",p."updatedAt",
          p."verificationStatus"::text AS "verificationStatus",
          (SELECT v."id" FROM lecturer_portfolio."LecturerPortfolioVerification" v
            WHERE v."itemId"=p."id" AND v."action"='Verified'
            ORDER BY v."createdAt" DESC,v."id" DESC LIMIT 1) AS "verifiedByEventId"
        FROM lecturer_annual."AnnualEvidenceLink" l
        JOIN lecturer_portfolio."LecturerPortfolioItem" p ON p."id"=l."itemId"
        WHERE l."academicYearId"=${year.id}`,
      db.$queryRaw<SubmissionRow[]>`
        SELECT "lecturerId","revision","note" FROM lecturer_annual."AnnualSubmission"
        WHERE "academicYearId"=${year.id}`,
      getReportingWindow(year.id,db),
      db.$queryRaw<StaffReviewRow[]>`
        SELECT s."lecturerId",s."employmentType",s."qualification",
          (SELECT e."id" FROM lecturer_annual."AnnualStaffReviewEvent" e
           WHERE e."academicYearId"=s."academicYearId" AND e."lecturerId"=s."lecturerId"
           ORDER BY e."createdAt" DESC,e."id" DESC LIMIT 1) AS "eventId"
        FROM lecturer_annual."AnnualStaffReview" s WHERE s."academicYearId"=${year.id}`,
      db.$queryRaw<SubmissionReviewRow[]>`
        SELECT DISTINCT ON (e."lecturerId") e."id",e."lecturerId",e."fingerprint",e."decision",e."reason",e."reviewedAt",
          (e."decision"='needs_changes' AND s."submittedAt"<=e."reviewedAt") AS "awaitingResubmission"
        FROM lecturer_annual."AnnualSubmissionReviewEvent" e
        JOIN lecturer_annual."AnnualSubmission" s ON s."academicYearId"=e."academicYearId" AND s."lecturerId"=e."lecturerId"
        WHERE e."academicYearId"=${year.id}
        ORDER BY e."lecturerId",e."reviewedAt" DESC,e."id" DESC`,
    ]);
    const eligible=offerings.filter(o=>matchesYear(o,year));
    const ids=eligible.map(o=>o.id);
    const delivered:DeliveryRow[]=ids.length ? await db.$queryRaw<DeliveryRow[]>(Prisma.sql`
      SELECT d."offeringId",l."lecturerId",d."id" AS "sessionId"
      FROM pms_attendance."TeachingSessionDelivery" d
      JOIN pms_attendance."TeachingSessionDeliveryLecturer" l ON l."deliveryId"=d."id"
      WHERE d."classOccurred"=true AND d."offeringId" IN (${Prisma.join(ids)})
    `) : [];
    const staff=new Map<string,AnnualStaffInput>();
    for(const p of people) staff.set(p.id,{lecturerId:p.id,name:p.name,
      qualification:null,employmentType:null,staffSnapshotStatus:"missing",
      staffReviewEventId:null,submitted:false,teaching:[],evidence:[]});
    const relevantIds=[...new Set([
      ...eligible.flatMap(o=>[o.lecturerId,...o.coLecturers.map(c=>c.lecturerId)]),
      ...delivered.map(d=>d.lecturerId),...reviews.map(r=>r.lecturerId),
      ...links.map(l=>l.lecturerId),...submissions.map(s=>s.lecturerId),
      ...staffReviews.map(r=>r.lecturerId),
    ].filter((id):id is string=>Boolean(id)))];
    const missing=relevantIds.filter(id=>!staff.has(id));
    if(missing.length) {
      const historical=await db.user.findMany({where:{id:{in:missing}},
        select:{id:true,name:true}});
      for(const p of historical) staff.set(p.id,{lecturerId:p.id,name:p.name,
        qualification:null,employmentType:null,staffSnapshotStatus:"missing",
        staffReviewEventId:null,submitted:false,teaching:[],evidence:[]});
    }
    for(const r of staffReviews){const p=staff.get(r.lecturerId);if(p){
      p.employmentType=r.employmentType;p.qualification=r.qualification;
      p.staffSnapshotStatus="verified";p.staffReviewEventId=r.eventId;
    }}
    for(const s of submissions) {const p=staff.get(s.lecturerId);if(p)p.submitted=true;}
    const deliveryBy=new Map<string,string[]>();
    for(const d of delivered){const k=d.offeringId+":"+d.lecturerId;
      deliveryBy.set(k,[...(deliveryBy.get(k)??[]),d.sessionId]);}
    const reviewBy=new Map(reviews.map(r=>[r.offeringId+":"+r.lecturerId,r]));
    for(const o of eligible){
      const lecturerIds=new Set<string>([
        ...(o.lecturerId?[o.lecturerId]:[]),...o.coLecturers.map(c=>c.lecturerId),
        ...delivered.filter(d=>d.offeringId===o.id).map(d=>d.lecturerId),
        ...reviews.filter(r=>r.offeringId===o.id).map(r=>r.lecturerId),
      ]);
      for(const lecturerId of lecturerIds){
        const person=staff.get(lecturerId);if(!person)continue;
        const key=o.id+":"+lecturerId, review=reviewBy.get(key);
        const sessions=[...new Set(deliveryBy.get(key)??[])];
        const teaching:AnnualTeaching={
          offeringId:o.id,courseCode:o.course.code,courseTitle:o.course.title,
          term:o.term,sectionCode:o.sectionCode,
          role:o.lecturerId===lecturerId?"Primary Lecturer":
            o.coLecturers.some(c=>c.lecturerId===lecturerId)?"Co-Lecturer":"Recorded Delivery",
          deliveredSessions:sessions.length,deliveredSessionIds:sessions,
          reviewId:review?.id??null,verdict:review?.verdict??null,
          evidenceUrl:review?.evidenceUrl??"",
          confirmed:review?.verdict==="confirmed"||sessions.length>0,
          discrepancy:review?.verdict==="not_delivered"&&sessions.length>0,
        };
        person.teaching.push(teaching);
      }
    }
    const kinds:Record<string,AnnualEvidence["kind"]>={
      Qualification:"qualification",ResearchInterest:"research_interest",
      ResearchProject:"research_project",Publication:"publication",
      ProfessionalDevelopment:"professional_development",Certification:"certification",
      Membership:"membership",ExternalProfile:"external_profile",
      Supervision:"supervision",AcademicService:"academic_service",Other:"other",
    };
    const statuses={SelfDeclared:"self_declared",Verified:"verified",Rejected:"rejected"} as const;
    for(const l of links){
      const person=staff.get(l.lecturerId),kind=kinds[l.kind];
      if(!person||!kind)continue;
      const startDate=dateOnly(l.startDate),endDate=dateOnly(l.endDate);
      person.evidence.push({id:l.itemId,kind,title:l.title,
        organization:l.organization,identifier:l.identifier,url:l.url,
        startDate,endDate,role:l.role,description:l.description,updatedAt:l.updatedAt.toISOString(),attribution:annualEvidenceAttribution(period,startDate,endDate),
        verificationStatus:statuses[l.verificationStatus],verifiedByEventId:l.verifiedByEventId});
    }
    const result=summarizeAnnualLecturers(year,[...staff.values()].sort((a,b)=>a.name.localeCompare(b.name)),
      new Date().toISOString(),period);
    const byLecturer=new Map(submissions.map(s=>[s.lecturerId,s]));
    const reviewByLecturer=new Map(submissionReviews.map(s=>[s.lecturerId,s]));
    for(const person of result.staff){
      const submission=byLecturer.get(person.lecturerId);
      if(!submission)continue;
      person.submissionNote=submission.note;
      // A decision applies to exactly the evidence the coordinator saw. Changing
      // a source record, review event, dates, note or resubmitting invalidates it.
      const fingerprint=createHash("sha256").update(JSON.stringify({
        year:year.id,revision:submission.revision,note:submission.note,period,
        employmentType:person.employmentType,qualification:person.qualification,
        staffReviewEventId:person.staffReviewEventId,
        teaching:person.teaching.map(t=>({...t,deliveredSessionIds:[...t.deliveredSessionIds].sort()}))
          .sort((a,b)=>a.offeringId.localeCompare(b.offeringId)),
        evidence:[...person.evidence].sort((a,b)=>a.id.localeCompare(b.id)),
      })).digest("hex");
      person.submissionFingerprint=fingerprint;
      const review=reviewByLecturer.get(person.lecturerId);
      if(review){
        const stale=review.fingerprint!==fingerprint;
        person.submissionReview={id:review.id,reason:review.reason,reviewedAt:review.reviewedAt.toISOString(),stale};
        // Editing a source is not a lecturer declaration. A returned record stays
        // returned until a new explicit submit, even when its fingerprint changes.
        person.submissionStatus=review.awaitingResubmission?"needs_changes":stale?"submitted":review.decision;
      }
    }
    result.statistics.evidenceGaps=result.staff.filter(p=>p.submissionStatus!=="verified" ||
      p.staffSnapshotStatus==="missing"&&p.classification!=="unconfirmed" ||
      p.evidence.some(e=>e.attribution!=="in_period") ||
      p.teaching.some(t=>t.discrepancy||!t.confirmed&&t.verdict===null)).length;
    result.notes.push("Annual submission review applies to the current source fingerprint. Returned records require explicit lecturer resubmission; changed verified records require a fresh review.");
    return result;
  },

  async linkOwnEvidence(yearId:string,lecturerId:string,itemId:string):Promise<void>{
    const year=await getYear(yearId);
    if(!(await lecturerService.getById(lecturerId)))throw new AnnualNotFoundError("Lecturer not found");
    const period=await getReportingWindow(year.id);
    if(!period)throw new AnnualValidationError("Coordinator must configure the reporting window first");
    const rows=await prisma.$queryRaw<{id:string;startDate:Date|null;endDate:Date|null}[]>`
      SELECT "id","startDate","endDate" FROM lecturer_portfolio."LecturerPortfolioItem"
      WHERE "id"=${itemId} AND "lecturerId"=${lecturerId} LIMIT 1`;
    if(!rows.length)throw new AnnualNotFoundError("Portfolio item not owned by lecturer");
    const attribution=annualEvidenceAttribution(period,dateOnly(rows[0]!.startDate),dateOnly(rows[0]!.endDate));
    if(attribution!=="in_period")
      throw new AnnualValidationError("Activity dates must overlap the approved reporting window");
    await prisma.$executeRaw`
      INSERT INTO lecturer_annual."AnnualEvidenceLink" ("academicYearId","lecturerId","itemId")
      VALUES (${year.id},${lecturerId},${itemId})
      ON CONFLICT ("academicYearId","itemId") DO NOTHING`;
  },

  async unlinkOwnEvidence(yearId:string,lecturerId:string,itemId:string):Promise<void>{
    const year=await getYear(yearId);
    await prisma.$executeRaw`
      DELETE FROM lecturer_annual."AnnualEvidenceLink"
      WHERE "academicYearId"=${year.id} AND "lecturerId"=${lecturerId} AND "itemId"=${itemId}`;
  },

  async configureReportingWindow(yearId:string,actorId:string,input:UpdateAnnualReportingWindowInput):Promise<void>{
    const year=await getYear(yearId);
    const from=new Date(input.startDate+"T00:00:00.000Z"),
      to=new Date(input.endDate+"T00:00:00.000Z");
    if(Number.isNaN(from.getTime())||Number.isNaN(to.getTime())||
       from.toISOString().slice(0,10)!==input.startDate||
       to.toISOString().slice(0,10)!==input.endDate||
       to<from)
      throw new AnnualValidationError("Invalid reporting window dates");
    await prisma.$transaction(async tx=>{
      const previous=await tx.$queryRaw<PeriodRow[]>`
        SELECT "startDate","endDate","evidenceUrl","reviewedAt"
        FROM lecturer_annual."AnnualReportingWindow"
        WHERE "academicYearId"=${year.id} FOR UPDATE`;
      await tx.$executeRaw`
        INSERT INTO lecturer_annual."AnnualReportingWindow"
          ("academicYearId","startDate","endDate","evidenceUrl","reason","reviewedById")
        VALUES (${year.id},${from},${to},${input.evidenceUrl},${input.reason},${actorId})
        ON CONFLICT ("academicYearId") DO UPDATE
          SET "startDate"=EXCLUDED."startDate","endDate"=EXCLUDED."endDate",
            "evidenceUrl"=EXCLUDED."evidenceUrl","reason"=EXCLUDED."reason",
            "reviewedById"=EXCLUDED."reviewedById","reviewedAt"=CURRENT_TIMESTAMP`;
      await tx.$executeRaw`
        INSERT INTO lecturer_annual."AnnualReportingWindowEvent"
          ("id","academicYearId","previousStartDate","previousEndDate",
           "startDate","endDate","evidenceUrl","reason","actorId")
        VALUES (${randomUUID()},${year.id},
          ${previous[0]?.startDate??null},${previous[0]?.endDate??null},
          ${from},${to},${input.evidenceUrl},${input.reason},${actorId})`;
    });
  },

  async reviewAnnualStaff(yearId:string,actorId:string,input:ReviewAnnualStaffInput):Promise<void>{
    const year=await getYear(yearId);
    if(actorId===input.lecturerId)throw new AnnualValidationError("Cannot self-verify annual staff history");
    const report=await this.summary(year.id);
    if(!report.staff.some(p=>p.lecturerId===input.lecturerId))throw new AnnualNotFoundError("Lecturer is not in the annual DSE roster");
    await prisma.$transaction(async tx=>{
      const previous=await tx.$queryRaw<StaffReviewRow[]>`
        SELECT "lecturerId","employmentType","qualification",NULL::text AS "eventId"
        FROM lecturer_annual."AnnualStaffReview"
        WHERE "academicYearId"=${year.id} AND "lecturerId"=${input.lecturerId} FOR UPDATE`;
      await tx.$executeRaw`
        INSERT INTO lecturer_annual."AnnualStaffReview"
          ("academicYearId","lecturerId","employmentType","qualification",
            "evidenceUrl","reason","reviewedById")
        VALUES (${year.id},${input.lecturerId},${input.employmentType},
          ${input.qualification},${input.evidenceUrl},${input.reason},${actorId})
        ON CONFLICT ("academicYearId","lecturerId") DO UPDATE SET
          "employmentType"=EXCLUDED."employmentType","qualification"=EXCLUDED."qualification",
          "evidenceUrl"=EXCLUDED."evidenceUrl","reason"=EXCLUDED."reason",
          "reviewedById"=EXCLUDED."reviewedById","reviewedAt"=CURRENT_TIMESTAMP`;
      await tx.$executeRaw`
        INSERT INTO lecturer_annual."AnnualStaffReviewEvent"
          ("id","academicYearId","lecturerId","previousEmploymentType",
           "previousQualification","employmentType","qualification",
           "evidenceUrl","reason","actorId")
        VALUES (${randomUUID()},${year.id},${input.lecturerId},
          ${previous[0]?.employmentType??null},${previous[0]?.qualification??null},
          ${input.employmentType},${input.qualification},
          ${input.evidenceUrl},${input.reason},${actorId})`;
    });
  },

  async submitOwn(yearId:string,lecturerId:string,note:string):Promise<void>{
    const year=await getYear(yearId);
    if(!(await lecturerService.getById(lecturerId)))throw new AnnualNotFoundError("Lecturer not found");
    if(!(await getReportingWindow(year.id)))throw new AnnualValidationError("Coordinator must configure the reporting window first");
    await prisma.$executeRaw`
      INSERT INTO lecturer_annual."AnnualSubmission" ("academicYearId","lecturerId","note","revision","submittedAt")
      VALUES (${year.id},${lecturerId},${note},${randomUUID()},clock_timestamp())
      ON CONFLICT ("academicYearId","lecturerId")
      DO UPDATE SET "note"=EXCLUDED."note","revision"=EXCLUDED."revision","submittedAt"=clock_timestamp()`;
  },

  async reviewSubmission(yearId:string,actorId:string,input:ReviewAnnualSubmissionInput):Promise<void>{
    if(actorId===input.lecturerId)throw new AnnualValidationError("Cannot review your own annual submission");
    return consistentAnnualWrite(yearId,async tx=>{
      const report=await this.summary(yearId,tx);
    const person=report.staff.find(p=>p.lecturerId===input.lecturerId);
    if(!person?.submissionFingerprint)throw new AnnualNotFoundError("No annual submission to review");
    if(person.submissionFingerprint!==input.fingerprint)
      throw new AnnualValidationError("Submission or source evidence changed. Reload and review the current record.");
    if(input.decision==="verified"&&person.submissionStatus==="needs_changes")
      throw new AnnualValidationError("Lecturer must explicitly resubmit the returned annual record before approval");
    if(input.decision==="verified"&&(
      !report.reportingWindow ||
      person.classification!=="unconfirmed"&&person.staffSnapshotStatus!=="verified" ||
      person.evidence.some(e=>e.verificationStatus==="self_declared"||e.attribution!=="in_period") ||
      person.teaching.some(t=>t.discrepancy||!t.confirmed&&t.verdict===null)))
      throw new AnnualValidationError("Resolve staffing, teaching and evidence review items before verifying the annual submission");
    await tx.$executeRaw`
      INSERT INTO lecturer_annual."AnnualSubmissionReviewEvent"
        ("id","academicYearId","lecturerId","fingerprint","decision","reason","actorId","reviewedAt")
      VALUES (${randomUUID()},${yearId},${input.lecturerId},${input.fingerprint},${input.decision},${input.reason},${actorId},clock_timestamp())`;
    });
  },

  async reviewTeaching(yearId:string,actorId:string,input:ReviewAnnualTeachingInput):Promise<void>{
    const year=await getYear(yearId);
    if(actorId===input.lecturerId)throw new AnnualValidationError("You cannot review your own teaching");
    const offering=await prisma.offering.findFirst({
      where:{id:input.offeringId,course:{programmeId:DEFAULT_PROGRAMME_ID}},
      select:{term:true,lecturerId:true,coLecturers:{select:{lecturerId:true}},
        academicCalendarPeriod:{select:{calendar:{select:{academicYearId:true}}}}}});
    if(!offering||!matchesYear(offering,year))
      throw new AnnualValidationError("Offering does not belong to this academic year");
    const assigned=offering.lecturerId===input.lecturerId ||
      offering.coLecturers.some(c=>c.lecturerId===input.lecturerId);
    if(!assigned) {
      const actual=await prisma.$queryRaw<{id:string}[]>`
        SELECT d."id" FROM pms_attendance."TeachingSessionDelivery" d
        JOIN pms_attendance."TeachingSessionDeliveryLecturer" l ON l."deliveryId"=d."id"
        WHERE d."offeringId"=${input.offeringId} AND l."lecturerId"=${input.lecturerId}
        AND d."classOccurred"=true LIMIT 1`;
      if(!actual.length)throw new AnnualValidationError("No assignment or delivered session for lecturer");
    }
    await prisma.$transaction(async tx=>{
      const prior=await tx.$queryRaw<{id:string;verdict:string}[]>`
        SELECT "id","verdict" FROM lecturer_annual."AnnualTeachingReview"
        WHERE "academicYearId"=${year.id} AND "offeringId"=${input.offeringId}
          AND "lecturerId"=${input.lecturerId} FOR UPDATE`;
      const rows=await tx.$queryRaw<{id:string}[]>`
        INSERT INTO lecturer_annual."AnnualTeachingReview"
          ("id","academicYearId","offeringId","lecturerId","verdict","evidenceUrl","reason","reviewedById")
        VALUES (${randomUUID()},${year.id},${input.offeringId},${input.lecturerId},
          ${input.verdict},${input.evidenceUrl},${input.reason},${actorId})
        ON CONFLICT ("academicYearId","offeringId","lecturerId")
        DO UPDATE SET "verdict"=EXCLUDED."verdict","evidenceUrl"=EXCLUDED."evidenceUrl",
          "reason"=EXCLUDED."reason","reviewedById"=EXCLUDED."reviewedById",
          "reviewedAt"=CURRENT_TIMESTAMP RETURNING "id"`;
      await tx.$executeRaw`
        INSERT INTO lecturer_annual."AnnualTeachingReviewEvent"
          ("id","reviewId","previousVerdict","newVerdict","reason","evidenceUrl","actorId")
        VALUES (${randomUUID()},${rows[0]!.id},${prior[0]?.verdict??null},
          ${input.verdict},${input.reason},${input.evidenceUrl},${actorId})`;
    });
  },

  async release(yearId:string,actorId:string):Promise<AnnualSummary>{
    return consistentAnnualWrite(yearId,async tx=>{
      const summary=await this.summary(yearId,tx);
    if(!summary.reportingWindow)
      throw new AnnualValidationError("Set and verify the academic-year reporting window before release");
    if(summary.statistics.staffSnapshotsMissing>0)
      throw new AnnualValidationError("Review annual employment and qualifications for all verified contributors before release");
    if(summary.statistics.unattributedEvidence>0)
      throw new AnnualValidationError("Remove or correct undated/out-of-period evidence before release");
    if(summary.staff.some(p=>p.submissionStatus==="submitted"||p.submissionStatus==="needs_changes"))
      throw new AnnualValidationError("Complete coordinator review of submitted annual records before release");
      const rows=await tx.$queryRaw<{version:number}[]>`
        SELECT (COALESCE(MAX("version"),0)+1)::integer AS "version"
        FROM lecturer_annual."AnnualReportRelease" WHERE "academicYearId"=${yearId}`;
      const released={...summary,releaseVersion:rows[0]!.version};
      await tx.$executeRaw`
        INSERT INTO lecturer_annual."AnnualReportRelease"
          ("id","academicYearId","version","summary","createdById")
        VALUES (${randomUUID()},${yearId},${released.releaseVersion},
          ${JSON.stringify(released)}::jsonb,${actorId})`;
      return released;
    },true);
  },

  async latestRelease(yearId:string):Promise<AnnualSummary>{
    await getYear(yearId);
    const rows=await prisma.$queryRaw<{summary:AnnualSummary}[]>`
      SELECT "summary" FROM lecturer_annual."AnnualReportRelease"
      WHERE "academicYearId"=${yearId} ORDER BY "version" DESC LIMIT 1`;
    if(!rows.length)throw new AnnualNotFoundError("No approved annual report released yet");
    return rows[0]!.summary;
  },
};
