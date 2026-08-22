import type {
  AddGraduationProjectPhaseInput,
  AssignGraduationProjectAdvisorInput,
  CreateGraduationProjectInput,
  CreateGraduationProjectMeetingInput,
  CreateGraduationProjectMilestoneInput,
  GraduationProjectAdvisorWorkload,
  GraduationProjectAdvisorView,
  GraduationProjectDetail,
  GraduationProjectMeetingView,
  GraduationProjectMemberView,
  GraduationProjectMilestoneView,
  GraduationProjectPhaseView,
  GraduationProjectReviewView,
  GraduationProjectSubmissionView,
  GraduationProjectSummary,
  LecturersServiceContract,
  ReviewGraduationProjectSubmissionInput,
  StudentsServiceContract,
  SubmitGraduationProjectMilestoneInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";

export class GraduationProjectNotFoundError extends Error {}
export class GraduationProjectValidationError extends Error {}
export class GraduationProjectConflictError extends Error {}

const students = () => registry.get<StudentsServiceContract>("students").service;
const lecturers = () => registry.get<LecturersServiceContract>("lecturers").service;
const iso = (value: Date | null) => value?.toISOString() ?? null;

interface ProjectRow { id: string; programmeId: string; cohortId: string | null; title: string; abstract: string; status: GraduationProjectSummary["status"]; createdAt: Date; updatedAt: Date }
interface MemberRow { projectId: string; studentId: string; role: GraduationProjectMemberView["role"]; joinedAt: Date }
interface AdvisorRow { id: string; projectId: string; lecturerId: string; role: GraduationProjectAdvisorView["role"]; assignedAt: Date; endedAt: Date | null; endReason: string }
interface PhaseRow { id: string; projectId: string; offeringId: string; courseCode: string; courseTitle: string; term: string; kind: GraduationProjectPhaseView["kind"]; status: GraduationProjectPhaseView["status"]; startedAt: Date | null; completedAt: Date | null; createdAt: Date }
interface MilestoneRow { id: string; projectId: string; phaseId: string | null; title: string; description: string; dueAt: Date | null; status: GraduationProjectMilestoneView["status"]; sortOrder: number; createdAt: Date }
interface SubmissionRow { id: string; milestoneId: string; version: number; submittedByStudentId: string; artifactUrl: string; notes: string; submittedAt: Date }
interface ReviewRow { id: string; submissionId: string; reviewerId: string; decision: GraduationProjectReviewView["decision"]; comment: string; createdAt: Date }
interface MeetingRow { id: string; projectId: string; occurredAt: Date; discussion: string; recommendations: string; nextActions: string; createdById: string; createdByName: string; createdAt: Date }

async function projectRow(id: string): Promise<ProjectRow> {
  const rows = await prisma.$queryRaw<ProjectRow[]>`
    SELECT "id", "programmeId", "cohortId", "title", "abstract", "status", "createdAt", "updatedAt"
    FROM graduation_projects."GraduationProject" WHERE "id" = ${id} LIMIT 1
  `;
  if (!rows[0]) throw new GraduationProjectNotFoundError("Graduation project not found");
  return rows[0];
}

async function membersFor(projectId: string): Promise<GraduationProjectMemberView[]> {
  const rows = await prisma.$queryRaw<MemberRow[]>`
    SELECT "projectId", "studentId", "role", "joinedAt"
    FROM graduation_projects."GraduationProjectMember" WHERE "projectId" = ${projectId} ORDER BY "joinedAt"
  `;
  const refs = await students().findByIds(rows.map((row) => row.studentId));
  const byId = new Map(refs.map((student) => [student.id, student]));
  return rows.flatMap((row) => {
    const student = byId.get(row.studentId);
    return student ? [{ studentId: row.studentId, studentNumber: student.studentId, studentName: student.name, role: row.role, joinedAt: row.joinedAt.toISOString() }] : [];
  });
}

async function advisorsFor(projectId: string): Promise<GraduationProjectAdvisorView[]> {
  const rows = await prisma.$queryRaw<AdvisorRow[]>`
    SELECT "id", "projectId", "lecturerId", "role", "assignedAt", "endedAt", "endReason"
    FROM graduation_projects."GraduationProjectAdvisorAssignment" WHERE "projectId" = ${projectId} ORDER BY "assignedAt"
  `;
  return Promise.all(rows.map(async (row) => {
    const lecturer = await lecturers().getById(row.lecturerId);
    return { id: row.id, lecturerId: row.lecturerId, lecturerName: lecturer?.name ?? "Former lecturer", role: row.role, assignedAt: row.assignedAt.toISOString(), endedAt: iso(row.endedAt), endReason: row.endReason };
  }));
}

async function phasesFor(projectId: string): Promise<GraduationProjectPhaseView[]> {
  const rows = await prisma.$queryRaw<PhaseRow[]>`
    SELECT p."id", p."projectId", p."offeringId", c."code" AS "courseCode", c."title" AS "courseTitle",
           o."term", p."kind", p."status", p."startedAt", p."completedAt", p."createdAt"
    FROM graduation_projects."GraduationProjectPhase" p
    JOIN public."Offering" o ON o."id" = p."offeringId"
    JOIN public."Course" c ON c."id" = o."courseId"
    WHERE p."projectId" = ${projectId} ORDER BY p."createdAt"
  `;
  return rows.map((row) => ({ ...row, startedAt: iso(row.startedAt), completedAt: iso(row.completedAt), createdAt: row.createdAt.toISOString() }));
}

async function milestonesFor(projectId: string): Promise<GraduationProjectMilestoneView[]> {
  const milestones = await prisma.$queryRaw<MilestoneRow[]>`
    SELECT "id", "projectId", "phaseId", "title", "description", "dueAt", "status", "sortOrder", "createdAt"
    FROM graduation_projects."GraduationProjectMilestone" WHERE "projectId" = ${projectId} ORDER BY "sortOrder", "createdAt"
  `;
  const result: GraduationProjectMilestoneView[] = [];
  for (const milestone of milestones) {
    const submissions = await prisma.$queryRaw<SubmissionRow[]>`
      SELECT "id", "milestoneId", "version", "submittedByStudentId", "artifactUrl", "notes", "submittedAt"
      FROM graduation_projects."GraduationProjectSubmission" WHERE "milestoneId" = ${milestone.id} ORDER BY "version"
    `;
    const submissionViews: GraduationProjectSubmissionView[] = [];
    for (const submission of submissions) {
      const [student, reviews] = await Promise.all([
        students().getById(submission.submittedByStudentId),
        prisma.$queryRaw<ReviewRow[]>`SELECT "id", "submissionId", "reviewerId", "decision", "comment", "createdAt" FROM graduation_projects."GraduationProjectReview" WHERE "submissionId" = ${submission.id} ORDER BY "createdAt"`,
      ]);
      const reviewViews = await Promise.all(reviews.map(async (review) => {
        const reviewer = await prisma.user.findUnique({ where: { id: review.reviewerId }, select: { name: true } });
        return { id: review.id, reviewerId: review.reviewerId, reviewerName: reviewer?.name ?? "Former reviewer", decision: review.decision, comment: review.comment, createdAt: review.createdAt.toISOString() };
      }));
      submissionViews.push({ id: submission.id, milestoneId: submission.milestoneId, version: submission.version, submittedByStudentId: submission.submittedByStudentId, submittedByStudentName: student?.name ?? "Former student", artifactUrl: submission.artifactUrl, notes: submission.notes, submittedAt: submission.submittedAt.toISOString(), reviews: reviewViews });
    }
    result.push({ id: milestone.id, projectId: milestone.projectId, phaseId: milestone.phaseId, title: milestone.title, description: milestone.description, dueAt: iso(milestone.dueAt), status: milestone.status, sortOrder: milestone.sortOrder, createdAt: milestone.createdAt.toISOString(), submissions: submissionViews });
  }
  return result;
}

async function meetingsFor(projectId: string): Promise<GraduationProjectMeetingView[]> {
  const rows = await prisma.$queryRaw<MeetingRow[]>`
    SELECT m."id", m."projectId", m."occurredAt", m."discussion", m."recommendations", m."nextActions", m."createdById", u."name" AS "createdByName", m."createdAt"
    FROM graduation_projects."GraduationProjectMeeting" m JOIN public."User" u ON u."id" = m."createdById"
    WHERE m."projectId" = ${projectId} ORDER BY m."occurredAt" DESC
  `;
  return rows.map((row) => ({ ...row, occurredAt: row.occurredAt.toISOString(), createdAt: row.createdAt.toISOString() }));
}

async function summary(id: string): Promise<GraduationProjectSummary> {
  const row = await projectRow(id);
  const [members, advisors, phases] = await Promise.all([membersFor(id), advisorsFor(id), phasesFor(id)]);
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), members, advisors, phases };
}

async function audit(projectId: string, actorId: string, action: string, metadata: object = {}): Promise<void> {
  await prisma.$executeRaw`INSERT INTO graduation_projects."GraduationProjectAuditEvent" ("id", "projectId", "actorId", "action", "metadata") VALUES (${crypto.randomUUID()}, ${projectId}, ${actorId}, ${action}, ${JSON.stringify(metadata)}::jsonb)`;
}

export const graduationProjectsService = {
  async get(id: string): Promise<GraduationProjectDetail> {
    const base = await summary(id);
    const [milestones, meetings] = await Promise.all([milestonesFor(id), meetingsFor(id)]);
    return { ...base, milestones, meetings };
  },

  async listForProgramme(programmeId: string): Promise<GraduationProjectSummary[]> {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM graduation_projects."GraduationProject" WHERE "programmeId" = ${programmeId} ORDER BY "updatedAt" DESC`;
    return Promise.all(rows.map((row) => summary(row.id)));
  },

  async listForLecturer(lecturerId: string): Promise<GraduationProjectSummary[]> {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT DISTINCT p."id" FROM graduation_projects."GraduationProject" p
      JOIN graduation_projects."GraduationProjectAdvisorAssignment" a ON a."projectId" = p."id"
      WHERE a."lecturerId" = ${lecturerId} AND a."endedAt" IS NULL ORDER BY p."id"
    `;
    return Promise.all(rows.map((row) => summary(row.id)));
  },

  async listForStudent(studentId: string): Promise<GraduationProjectSummary[]> {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT p."id" FROM graduation_projects."GraduationProject" p JOIN graduation_projects."GraduationProjectMember" m ON m."projectId" = p."id" WHERE m."studentId" = ${studentId} ORDER BY p."updatedAt" DESC
    `;
    return Promise.all(rows.map((row) => summary(row.id)));
  },

  async create(input: CreateGraduationProjectInput, actorId: string): Promise<GraduationProjectDetail> {
    const programme = await prisma.programme.findUnique({ where: { id: input.programmeId }, select: { id: true } });
    if (!programme) throw new GraduationProjectValidationError("Programme does not exist");
    if (input.cohortId) {
      const cohort = await prisma.studentCohort.findUnique({ where: { id: input.cohortId }, select: { programmeId: true } });
      if (!cohort || cohort.programmeId !== input.programmeId) throw new GraduationProjectValidationError("Cohort does not belong to the project programme");
    }
    const memberRefs = await students().findByIds(input.memberStudentIds);
    if (memberRefs.length !== input.memberStudentIds.length) throw new GraduationProjectValidationError("One or more project students do not exist");
    const leadId = input.leadStudentId ?? input.memberStudentIds[0]!;
    if (!input.memberStudentIds.includes(leadId)) throw new GraduationProjectValidationError("Lead student must be a project member");
    const id = crypto.randomUUID();
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO graduation_projects."GraduationProject" ("id", "programmeId", "cohortId", "title", "abstract", "createdById") VALUES (${id}, ${input.programmeId}, ${input.cohortId ?? null}, ${input.title}, ${input.abstract}, ${actorId})`;
      for (const studentId of input.memberStudentIds) await tx.$executeRaw`INSERT INTO graduation_projects."GraduationProjectMember" ("projectId", "studentId", "role") VALUES (${id}, ${studentId}, ${studentId === leadId ? "Lead" : "Member"})`;
      await tx.$executeRaw`INSERT INTO graduation_projects."GraduationProjectAuditEvent" ("id", "projectId", "actorId", "action", "metadata") VALUES (${crypto.randomUUID()}, ${id}, ${actorId}, 'ProjectCreated', ${JSON.stringify({ memberCount: input.memberStudentIds.length })}::jsonb)`;
    });
    return this.get(id);
  },

  async assignAdvisor(projectId: string, input: AssignGraduationProjectAdvisorInput, actorId: string): Promise<GraduationProjectDetail> {
    const project = await projectRow(projectId);
    const lecturer = await lecturers().getById(input.lecturerId);
    const scopedRole = await prisma.userRoleAssignment.findFirst({ where: { userId: input.lecturerId, programmeId: project.programmeId, role: { slug: "lecturer" } }, select: { id: true } });
    if (!lecturer || !scopedRole) throw new GraduationProjectValidationError("Advisor must be a lecturer in this programme");
    try {
      await prisma.$executeRaw`INSERT INTO graduation_projects."GraduationProjectAdvisorAssignment" ("id", "projectId", "lecturerId", "role", "assignedById") VALUES (${crypto.randomUUID()}, ${projectId}, ${input.lecturerId}, ${input.role}, ${actorId})`;
    } catch { throw new GraduationProjectConflictError("This advisor assignment conflicts with an active assignment"); }
    await audit(projectId, actorId, "AdvisorAssigned", input);
    return this.get(projectId);
  },

  async endAdvisor(projectId: string, assignmentId: string, reason: string, actorId: string): Promise<GraduationProjectDetail> {
    const count = await prisma.$executeRaw`UPDATE graduation_projects."GraduationProjectAdvisorAssignment" SET "endedAt" = CURRENT_TIMESTAMP, "endedById" = ${actorId}, "endReason" = ${reason} WHERE "id" = ${assignmentId} AND "projectId" = ${projectId} AND "endedAt" IS NULL`;
    if (count === 0) throw new GraduationProjectNotFoundError("Active advisor assignment not found");
    await audit(projectId, actorId, "AdvisorAssignmentEnded", { assignmentId, reason });
    return this.get(projectId);
  },

  async addPhase(projectId: string, input: AddGraduationProjectPhaseInput, actorId: string): Promise<GraduationProjectDetail> {
    const project = await projectRow(projectId);
    const offering = await prisma.offering.findUnique({ where: { id: input.offeringId }, include: { course: { select: { code: true, programmeId: true } }, enrollments: { select: { studentId: true } } } });
    if (!offering) throw new GraduationProjectValidationError("Offering does not exist");
    if (offering.course.programmeId !== project.programmeId || offering.course.code !== input.kind) throw new GraduationProjectValidationError("Phase must use the matching programme offering and course code");
    if (offering.programmeYear !== null && offering.programmeYear !== 4) throw new GraduationProjectValidationError("Graduation-project phases must use a Year-4 offering");
    const members = await membersFor(projectId);
    const enrolled = new Set(offering.enrollments.map((row) => row.studentId));
    if (members.some((member) => !enrolled.has(member.studentId))) throw new GraduationProjectValidationError("All project members must be enrolled in the selected offering");
    if (input.kind !== "FPR401") {
      const prior = await prisma.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM graduation_projects."GraduationProjectPhase" WHERE "projectId" = ${projectId} AND "kind" = 'FPR401' LIMIT 1`;
      if (!prior[0]) throw new GraduationProjectValidationError("Semester-II pathway requires an existing FPR401 project phase");
    }
    try {
      await prisma.$executeRaw`INSERT INTO graduation_projects."GraduationProjectPhase" ("id", "projectId", "offeringId", "kind", "status", "createdById") VALUES (${crypto.randomUUID()}, ${projectId}, ${input.offeringId}, ${input.kind}, ${input.status}, ${actorId})`;
    } catch { throw new GraduationProjectConflictError("This project already has that phase or a Semester-II pathway"); }
    await audit(projectId, actorId, "PhaseAdded", input);
    return this.get(projectId);
  },

  async createMilestone(projectId: string, input: CreateGraduationProjectMilestoneInput, actorId: string): Promise<GraduationProjectDetail> {
    await projectRow(projectId);
    await prisma.$executeRaw`INSERT INTO graduation_projects."GraduationProjectMilestone" ("id", "projectId", "phaseId", "title", "description", "dueAt", "sortOrder", "createdById") VALUES (${crypto.randomUUID()}, ${projectId}, ${input.phaseId ?? null}, ${input.title}, ${input.description}, ${input.dueAt ? new Date(input.dueAt) : null}, ${input.sortOrder}, ${actorId})`;
    await audit(projectId, actorId, "MilestoneCreated", { title: input.title, phaseId: input.phaseId ?? null });
    return this.get(projectId);
  },

  async submit(milestoneId: string, input: SubmitGraduationProjectMilestoneInput, studentId: string, actorId: string): Promise<GraduationProjectDetail> {
    const milestones = await prisma.$queryRaw<Array<{ projectId: string }>>`SELECT "projectId" FROM graduation_projects."GraduationProjectMilestone" WHERE "id" = ${milestoneId} LIMIT 1`;
    const projectId = milestones[0]?.projectId;
    if (!projectId) throw new GraduationProjectNotFoundError("Milestone not found");
    const member = await prisma.$queryRaw<Array<{ ok: boolean }>>`SELECT TRUE AS "ok" FROM graduation_projects."GraduationProjectMember" WHERE "projectId" = ${projectId} AND "studentId" = ${studentId} LIMIT 1`;
    if (!member[0]) throw new GraduationProjectValidationError("Only a project member may submit this milestone");
    await prisma.$transaction(async (tx) => {
      const versions = await tx.$queryRaw<Array<{ version: number }>>`SELECT COALESCE(MAX("version"), 0)::int + 1 AS "version" FROM graduation_projects."GraduationProjectSubmission" WHERE "milestoneId" = ${milestoneId}`;
      const version = versions[0]?.version ?? 1;
      await tx.$executeRaw`INSERT INTO graduation_projects."GraduationProjectSubmission" ("id", "milestoneId", "version", "submittedByStudentId", "artifactUrl", "notes") VALUES (${crypto.randomUUID()}, ${milestoneId}, ${version}, ${studentId}, ${input.artifactUrl}, ${input.notes})`;
      await tx.$executeRaw`UPDATE graduation_projects."GraduationProjectMilestone" SET "status" = 'Submitted', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${milestoneId}`;
    });
    await audit(projectId, actorId, "MilestoneSubmitted", { milestoneId });
    return this.get(projectId);
  },

  async review(submissionId: string, input: ReviewGraduationProjectSubmissionInput, reviewerId: string): Promise<GraduationProjectDetail> {
    const rows = await prisma.$queryRaw<Array<{ projectId: string; milestoneId: string }>>`
      SELECT m."projectId", s."milestoneId" FROM graduation_projects."GraduationProjectSubmission" s JOIN graduation_projects."GraduationProjectMilestone" m ON m."id" = s."milestoneId" WHERE s."id" = ${submissionId} LIMIT 1
    `;
    const row = rows[0];
    if (!row) throw new GraduationProjectNotFoundError("Submission not found");
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO graduation_projects."GraduationProjectReview" ("id", "submissionId", "reviewerId", "decision", "comment") VALUES (${crypto.randomUUID()}, ${submissionId}, ${reviewerId}, ${input.decision}, ${input.comment})`;
      await tx.$executeRaw`UPDATE graduation_projects."GraduationProjectMilestone" SET "status" = 'Reviewed', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${row.milestoneId}`;
    });
    await audit(row.projectId, reviewerId, "SubmissionReviewed", { submissionId, decision: input.decision });
    return this.get(row.projectId);
  },

  async addMeeting(projectId: string, input: CreateGraduationProjectMeetingInput, actorId: string): Promise<GraduationProjectDetail> {
    await projectRow(projectId);
    await prisma.$executeRaw`INSERT INTO graduation_projects."GraduationProjectMeeting" ("id", "projectId", "occurredAt", "discussion", "recommendations", "nextActions", "createdById") VALUES (${crypto.randomUUID()}, ${projectId}, ${new Date(input.occurredAt)}, ${input.discussion}, ${input.recommendations}, ${input.nextActions}, ${actorId})`;
    await audit(projectId, actorId, "SupervisionMeetingRecorded");
    return this.get(projectId);
  },

  async advisorWorkload(programmeId: string): Promise<GraduationProjectAdvisorWorkload[]> {
    const lecturerList = await lecturers().list();
    const scoped = await prisma.userRoleAssignment.findMany({ where: { programmeId, role: { slug: "lecturer" } }, select: { userId: true } });
    const allowed = new Set(scoped.map((row) => row.userId));
    const results: GraduationProjectAdvisorWorkload[] = [];
    for (const lecturer of lecturerList.filter((row) => allowed.has(row.id))) {
      const counts = await prisma.$queryRaw<Array<{ active: bigint; primary: bigint; co: bigint }>>`
        SELECT COUNT(*)::bigint AS "active", COUNT(*) FILTER (WHERE a."role" = 'Primary')::bigint AS "primary", COUNT(*) FILTER (WHERE a."role" = 'CoAdvisor')::bigint AS "co"
        FROM graduation_projects."GraduationProjectAdvisorAssignment" a JOIN graduation_projects."GraduationProject" p ON p."id" = a."projectId"
        WHERE a."lecturerId" = ${lecturer.id} AND a."endedAt" IS NULL AND p."programmeId" = ${programmeId}
      `;
      const count = counts[0]!;
      results.push({ lecturerId: lecturer.id, lecturerName: lecturer.name, activeProjectCount: Number(count.active), primaryProjectCount: Number(count.primary), coAdvisorProjectCount: Number(count.co) });
    }
    return results.sort((a, b) => a.activeProjectCount - b.activeProjectCount || a.lecturerName.localeCompare(b.lecturerName));
  },

  async programmeId(projectId: string): Promise<string> { return (await projectRow(projectId)).programmeId; },
  async activeAdvisor(projectId: string, lecturerId: string): Promise<boolean> {
    const rows = await prisma.$queryRaw<Array<{ ok: boolean }>>`SELECT TRUE AS "ok" FROM graduation_projects."GraduationProjectAdvisorAssignment" WHERE "projectId" = ${projectId} AND "lecturerId" = ${lecturerId} AND "endedAt" IS NULL LIMIT 1`;
    return Boolean(rows[0]);
  },
  async projectIdForSubmission(submissionId: string): Promise<string | null> {
    const rows = await prisma.$queryRaw<Array<{ projectId: string }>>`SELECT m."projectId" FROM graduation_projects."GraduationProjectSubmission" s JOIN graduation_projects."GraduationProjectMilestone" m ON m."id" = s."milestoneId" WHERE s."id" = ${submissionId} LIMIT 1`;
    return rows[0]?.projectId ?? null;
  },
  async studentForUser(userId: string): Promise<string | null> {
    const student = await prisma.student.findUnique({ where: { userId }, select: { id: true } });
    return student?.id ?? null;
  },
  async isMember(projectId: string, studentId: string): Promise<boolean> {
    const rows = await prisma.$queryRaw<Array<{ ok: boolean }>>`SELECT TRUE AS "ok" FROM graduation_projects."GraduationProjectMember" WHERE "projectId" = ${projectId} AND "studentId" = ${studentId} LIMIT 1`;
    return Boolean(rows[0]);
  },
};

export type GraduationProjectsService = typeof graduationProjectsService;
