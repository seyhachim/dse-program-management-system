import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AnnualEvidence, AnnualSummary, AnnualTeaching, AnnualYear, ReviewAnnualTeachingInput } from "@dse-pms/shared-types";
import { DEFAULT_PROGRAMME_ID } from "../../core/programme.ts";
import { prisma } from "../../core/db/prisma.ts";
import { lecturerService } from "./service.ts";
import { summarizeAnnualLecturers, type AnnualStaffInput } from "./annual-summary.ts";

export class AnnualNotFoundError extends Error {}
export class AnnualValidationError extends Error {}
type ReviewRow = { id:string; offeringId:string; lecturerId:string; verdict:"confirmed"|"not_delivered"; evidenceUrl:string };
type EvidenceRow = { lecturerId:string; itemId:string; kind:string; title:string; organization:string; identifier:string; url:string; verificationStatus:"SelfDeclared"|"Verified"|"Rejected"; verifiedByEventId:string|null };
type DeliveryRow = { offeringId:string; lecturerId:string; sessionId:string };
const normalized = (s:string) => s.replace(/[–—]/g,"-");
const matchesYear = (o:{term:string;academicCalendarPeriod:{calendar:{academicYearId:string}}|null},y:AnnualYear) =>
  o.academicCalendarPeriod ? o.academicCalendarPeriod.calendar.academicYearId===y.id
    : normalized(o.term).includes(normalized(y.label));

async function getYear(id:string):Promise<AnnualYear> {
  const year=await prisma.academicYear.findFirst({where:{id,programmeId:DEFAULT_PROGRAMME_ID},
    select:{id:true,label:true,startYear:true,endYear:true}});
  if(!year) throw new AnnualNotFoundError("Academic year not found for DSE");
  return year;
}

export const lecturerAnnualService = {
  years():Promise<AnnualYear[]> {
    return prisma.academicYear.findMany({where:{programmeId:DEFAULT_PROGRAMME_ID},
      select:{id:true,label:true,startYear:true,endYear:true},
      orderBy:[{startYear:"desc"},{endYear:"desc"}]});
  },

  async summary(yearId:string):Promise<AnnualSummary> {
    const year=await getYear(yearId);
    const [people,offerings,reviews,links,submissions]=await Promise.all([
      prisma.user.findMany({where:{roleAssignments:{some:{role:{slug:"lecturer"},
        OR:[{programmeId:DEFAULT_PROGRAMME_ID},{programmeId:null}]}}},
        select:{id:true,name:true,qualification:true,lecturerProfile:{select:{employmentType:true}}},
        orderBy:{name:"asc"}}),
      prisma.offering.findMany({where:{course:{programmeId:DEFAULT_PROGRAMME_ID},
        OR:[{academicCalendarPeriod:{calendar:{academicYearId:year.id}}},
          {academicCalendarPeriodId:null,term:{contains:normalized(year.label)}},
          {academicCalendarPeriodId:null,term:{contains:year.label}}]},
        select:{id:true,term:true,sectionCode:true,lecturerId:true,
          course:{select:{code:true,title:true}},coLecturers:{select:{lecturerId:true}},
          academicCalendarPeriod:{select:{calendar:{select:{academicYearId:true}}}}}}),
      prisma.$queryRaw<ReviewRow[]>`
        SELECT "id","offeringId","lecturerId","verdict","evidenceUrl"
        FROM lecturer_annual."AnnualTeachingReview"
        WHERE "academicYearId"=${year.id}`,
      prisma.$queryRaw<EvidenceRow[]>`
        SELECT l."lecturerId",l."itemId",p."kind"::text AS "kind",p."title",
          p."organization",p."identifier",p."url",
          p."verificationStatus"::text AS "verificationStatus",
          (SELECT v."id" FROM lecturer_portfolio."LecturerPortfolioVerification" v
            WHERE v."itemId"=p."id" AND v."action"='Verified'
            ORDER BY v."createdAt" DESC,v."id" DESC LIMIT 1) AS "verifiedByEventId"
        FROM lecturer_annual."AnnualEvidenceLink" l
        JOIN lecturer_portfolio."LecturerPortfolioItem" p ON p."id"=l."itemId"
        WHERE l."academicYearId"=${year.id}`,
      prisma.$queryRaw<{lecturerId:string}[]>`
        SELECT "lecturerId" FROM lecturer_annual."AnnualSubmission"
        WHERE "academicYearId"=${year.id}`,
    ]);
    const eligible=offerings.filter(o=>matchesYear(o,year));
    const ids=eligible.map(o=>o.id);
    const delivered:DeliveryRow[]=ids.length ? await prisma.$queryRaw<DeliveryRow[]>(Prisma.sql`
      SELECT d."offeringId",l."lecturerId",d."id" AS "sessionId"
      FROM pms_attendance."TeachingSessionDelivery" d
      JOIN pms_attendance."TeachingSessionDeliveryLecturer" l ON l."deliveryId"=d."id"
      WHERE d."classOccurred"=true AND d."offeringId" IN (${Prisma.join(ids)})
    `) : [];
    const staff=new Map<string,AnnualStaffInput>();
    for(const p of people) staff.set(p.id,{lecturerId:p.id,name:p.name,
      qualification:p.qualification??null,employmentType:p.lecturerProfile?.employmentType??null,
      submitted:false,teaching:[],evidence:[]});
    const relevantIds=[...new Set([
      ...eligible.flatMap(o=>[o.lecturerId,...o.coLecturers.map(c=>c.lecturerId)]),
      ...delivered.map(d=>d.lecturerId),...reviews.map(r=>r.lecturerId),
      ...links.map(l=>l.lecturerId),...submissions.map(s=>s.lecturerId),
    ].filter((id):id is string=>Boolean(id)))];
    const missing=relevantIds.filter(id=>!staff.has(id));
    if(missing.length) {
      const historical=await prisma.user.findMany({where:{id:{in:missing}},
        select:{id:true,name:true,qualification:true,lecturerProfile:{select:{employmentType:true}}}});
      for(const p of historical) staff.set(p.id,{lecturerId:p.id,name:p.name,
        qualification:p.qualification??null,employmentType:p.lecturerProfile?.employmentType??null,
        submitted:false,teaching:[],evidence:[]});
    }
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
      person.evidence.push({id:l.itemId,kind,title:l.title,
        organization:l.organization,identifier:l.identifier,url:l.url,
        verificationStatus:statuses[l.verificationStatus],verifiedByEventId:l.verifiedByEventId});
    }
    return summarizeAnnualLecturers(year,[...staff.values()].sort((a,b)=>a.name.localeCompare(b.name)),
      new Date().toISOString());
  },

  async linkOwnEvidence(yearId:string,lecturerId:string,itemId:string):Promise<void>{
    const year=await getYear(yearId);
    if(!(await lecturerService.getById(lecturerId)))throw new AnnualNotFoundError("Lecturer not found");
    const rows=await prisma.$queryRaw<{id:string}[]>`
      SELECT "id" FROM lecturer_portfolio."LecturerPortfolioItem"
      WHERE "id"=${itemId} AND "lecturerId"=${lecturerId} LIMIT 1`;
    if(!rows.length)throw new AnnualNotFoundError("Portfolio item not owned by lecturer");
    await prisma.$executeRaw`
      INSERT INTO lecturer_annual."AnnualEvidenceLink" ("academicYearId","lecturerId","itemId")
      VALUES (${year.id},${lecturerId},${itemId})
      ON CONFLICT ("academicYearId","itemId") DO NOTHING`;
  },

  async submitOwn(yearId:string,lecturerId:string,note:string):Promise<void>{
    const year=await getYear(yearId);
    if(!(await lecturerService.getById(lecturerId)))throw new AnnualNotFoundError("Lecturer not found");
    await prisma.$executeRaw`
      INSERT INTO lecturer_annual."AnnualSubmission" ("academicYearId","lecturerId","note")
      VALUES (${year.id},${lecturerId},${note})
      ON CONFLICT ("academicYearId","lecturerId")
      DO UPDATE SET "note"=EXCLUDED."note","submittedAt"=CURRENT_TIMESTAMP`;
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
    const summary=await this.summary(yearId);
    return prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${yearId}))::text AS "locked"`;
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
    });
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
