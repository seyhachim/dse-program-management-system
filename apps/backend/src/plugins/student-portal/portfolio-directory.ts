import { Prisma, StudentPortfolioEvidenceOrigin as DbOrigin } from "@prisma/client";
import type {
  StudentProjectDirectoryItem,
  StudentProjectDirectoryPage,
  StudentProjectDirectoryQuery,
  StudentPortfolioEvidenceOrigin,
  StudentPortfolioVerificationState,
} from "@dse-pms/shared-types";
import {
  hasAnyRoleInProgramme,
  type AuthUser,
  type Role,
} from "../../core/auth/token.ts";
import { DEFAULT_PROGRAMME_ID } from "../../core/programme.ts";
import { prisma } from "../../core/db/prisma.ts";
import { PortalAccessError } from "./service.ts";

// Portfolio publication and student identity are the only records searched.
// Never broaden this query to private evidence without a separate consent model.
const DIRECTORY_ROLES: Role[] = ["admin", "program_coordinator", "program_secretary"];

const ORIGIN_TO_DB: Record<StudentPortfolioEvidenceOrigin, DbOrigin> = {
  external_project: DbOrigin.ExternalProject,
  course_assessment: DbOrigin.CourseAssessment,
  practicum: DbOrigin.Practicum,
  internship: DbOrigin.Internship,
  final_project: DbOrigin.FinalProject,
  competition: DbOrigin.Competition,
  achievement: DbOrigin.Achievement,
  other: DbOrigin.Other,
};
const ORIGIN_FROM_DB = Object.fromEntries(
  Object.entries(ORIGIN_TO_DB).map(([publicValue, dbValue]) => [dbValue, publicValue]),
) as Record<string, StudentPortfolioEvidenceOrigin>;

const STATE_TO_DB: Record<StudentPortfolioVerificationState, string> = {
  unverified: "Unverified",
  verified: "Verified",
  needs_changes: "NeedsChanges",
  revoked: "Revoked",
};
const STATE_FROM_DB = Object.fromEntries(
  Object.entries(STATE_TO_DB).map(([publicValue, dbValue]) => [dbValue, publicValue]),
) as Record<string, StudentPortfolioVerificationState>;

interface DirectoryRow {
  evidenceId: string;
  title: string;
  summary: string;
  studentName: string;
  publicSlug: string;
  courseCode: string | null;
  term: string | null;
  cohortCode: string | null;
  projectYear: number;
  origin: string;
  skills: string[];
  featured: boolean;
  verification: string;
}

function searchPattern(value: string): string {
  // Escape wildcard characters; a user search should not become an arbitrary wildcard query.
  return `%${value.replace(/[%_\\]/g, "\\$&")}%`;
}

/** Do not rely on UI roles, tokens' flat role union or mere possession of students:read. */
export function directoryProgrammeFor(actor: AuthUser, requested?: string): string {
  const defaultProgramme = actor.programmeRoles.find(
    (entry) => DIRECTORY_ROLES.includes(entry.role) && entry.programmeId !== null,
  )?.programmeId ?? DEFAULT_PROGRAMME_ID;
  const programmeId = requested ?? defaultProgramme;
  if (!hasAnyRoleInProgramme(actor, DIRECTORY_ROLES, programmeId)) {
    throw new PortalAccessError("You cannot browse student projects for this programme");
  }
  return programmeId;
}

function sourceQuery(programmeId: string, query: StudentProjectDirectoryQuery): Prisma.Sql {
  const filters: Prisma.Sql[] = [
    Prisma.sql`e."isPublic" = true AND e."archivedAt" IS NULL`,
    Prisma.sql`p."isPublic" = true AND p."publicSlug" IS NOT NULL`,
    Prisma.sql`s."status" = 'Active'`,
    // A student has to belong to the selected programme through an actual
    // cohort membership or course enrolment. Student has no programmeId field.
    Prisma.sql`(
      EXISTS (
        SELECT 1 FROM "StudentCohortMembership" membership
        JOIN "StudentCohort" sc ON sc."id" = membership."cohortId"
        WHERE membership."studentId" = s."id" AND sc."programmeId" = ${programmeId}
      )
      OR EXISTS (
        SELECT 1 FROM "Enrollment" enrolment
        JOIN "Offering" enrolledOffering ON enrolledOffering."id" = enrolment."offeringId"
        JOIN "Course" enrolledCourse ON enrolledCourse."id" = enrolledOffering."courseId"
        WHERE enrolment."studentId" = s."id" AND enrolledCourse."programmeId" = ${programmeId}
      )
    )`,
    // Match the exact eligibility of public portfolio academic-linked evidence.
    // Revoked enrolment, an unapproved CourseSpec or inactive assessment fails closed.
    Prisma.sql`(
      e."sourceOfferingId" IS NULL
      OR (
        c."programmeId" = ${programmeId}
        AND o."courseSpecId" = e."sourceCourseSpecId"
        AND cs."reviewStatus" = 'Approved'
        AND a."status" = 'Active'
        AND EXISTS (
          SELECT 1 FROM "Enrollment" proof
          WHERE proof."studentId" = e."studentId"
            AND proof."offeringId" = e."sourceOfferingId"
        )
      )
    )`,
  ];
  if (query.q) {
    const q = searchPattern(query.q);
    filters.push(Prisma.sql`(
      e."title" ILIKE ${q} OR s."name" ILIKE ${q}
      OR e."summary" ILIKE ${q} OR c."code" ILIKE ${q}
      OR array_to_string(e."skills", ' ') ILIKE ${q}
    )`);
  }
  if (query.course) filters.push(Prisma.sql`c."code" ILIKE ${searchPattern(query.course)}`);
  if (query.cohort) filters.push(Prisma.sql`cohort."code" ILIKE ${searchPattern(query.cohort)}`);
  if (query.skill) filters.push(Prisma.sql`EXISTS (
    SELECT 1 FROM unnest(e."skills") AS skill WHERE skill ILIKE ${searchPattern(query.skill)}
  )`);
  if (query.origin) filters.push(Prisma.sql`e."origin" = ${ORIGIN_TO_DB[query.origin]}::"StudentPortfolioEvidenceOrigin"`);
  if (query.verification) filters.push(Prisma.sql`COALESCE(v."newState"::text, 'Unverified') = ${STATE_TO_DB[query.verification]}`);
  if (query.year) filters.push(Prisma.sql`EXTRACT(YEAR FROM COALESCE(e."startDate", e."createdAt"))::int = ${query.year}`);

  return Prisma.sql`
    FROM "StudentPortfolioEvidence" e
    JOIN "StudentPortfolioProfile" p ON p."studentId" = e."studentId"
    JOIN "Student" s ON s."id" = e."studentId"
    LEFT JOIN "Offering" o ON o."id" = e."sourceOfferingId"
    LEFT JOIN "Course" c ON c."id" = o."courseId"
    LEFT JOIN "CourseSpec" cs ON cs."id" = e."sourceCourseSpecId"
    LEFT JOIN "CourseSpecAssessmentItem" a
      ON a."courseSpecId" = e."sourceCourseSpecId" AND a."id" = e."sourceAssessmentItemId"
    LEFT JOIN LATERAL (
      SELECT sc."code"
      FROM "StudentCohortMembership" m
      JOIN "StudentCohort" sc ON sc."id" = m."cohortId"
      WHERE m."studentId" = s."id" AND sc."programmeId" = ${programmeId}
      ORDER BY m."joinedAt" DESC, m."id" DESC LIMIT 1
    ) cohort ON true
    LEFT JOIN LATERAL (
      SELECT ve."newState" FROM "StudentPortfolioVerificationEvent" ve
      WHERE ve."evidenceId" = e."id"
      ORDER BY ve."createdAt" DESC, ve."id" DESC LIMIT 1
    ) v ON true
    WHERE ${Prisma.join(filters, " AND ")}
  `;
}

function toItem(row: DirectoryRow): StudentProjectDirectoryItem {
  const origin = ORIGIN_FROM_DB[row.origin];
  const verification = STATE_FROM_DB[row.verification];
  if (!origin || !verification) throw new Error("Unsupported portfolio evidence status");
  return {
    evidenceId: row.evidenceId,
    title: row.title,
    summary: row.summary,
    studentName: row.studentName,
    publicSlug: row.publicSlug,
    courseCode: row.courseCode,
    term: row.term,
    cohortCode: row.cohortCode,
    projectYear: row.projectYear,
    origin,
    skills: row.skills,
    featured: row.featured,
    verification,
  };
}

export const studentPortfolioDirectoryService = {
  async list(actor: AuthUser, query: StudentProjectDirectoryQuery): Promise<StudentProjectDirectoryPage> {
    const programmeId = directoryProgrammeFor(actor, query.programmeId);
    const from = sourceQuery(programmeId, query);
    const offset = (query.page - 1) * query.limit;
    const [rows, counts] = await Promise.all([
      prisma.$queryRaw<DirectoryRow[]>(Prisma.sql`
        SELECT e."id" AS "evidenceId", e."title", e."summary",
          s."name" AS "studentName", p."publicSlug",
          c."code" AS "courseCode", o."term", cohort."code" AS "cohortCode",
          EXTRACT(YEAR FROM COALESCE(e."startDate", e."createdAt"))::int AS "projectYear",
          e."origin"::text AS "origin", e."skills", e."isFeatured" AS "featured",
          COALESCE(v."newState"::text, 'Unverified') AS "verification"
        ${from}
        ORDER BY e."isFeatured" DESC, e."updatedAt" DESC, e."id" DESC
        LIMIT ${query.limit} OFFSET ${offset}
      `),
      prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "total" ${from}
      `),
    ]);
    return {
      programmeId,
      page: query.page,
      limit: query.limit,
      total: Number(counts[0]?.total ?? 0n),
      items: rows.map(toItem),
    };
  },
};
