import type { Opportunity } from "@prisma/client";
import type {
  OpportunityInterestOverviewItem, OpportunityInterestSummary, OpportunityInterestedStudent,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { hasAnyRoleInProgramme, type AuthUser, type Role } from "../../core/auth/token.ts";
import { OpportunityError } from "./service.ts";

const READ_ROLES: Role[] = ["student", "lecturer", "admin", "program_coordinator", "program_secretary"];
const STUDENT_ROLES: Role[] = ["student"];
const ROSTER_ROLES: Role[] = ["lecturer", "admin", "program_coordinator"];

function requireProgrammeRole(actor: AuthUser, programmeId: string, roles: Role[]): void {
  if (!hasAnyRoleInProgramme(actor, roles, programmeId)) {
    throw new OpportunityError(403, "No permission for this programme");
  }
}

/** Exact exclusive cutoff in Phnom Penh time; no verified deadline means no sign-ups. */
export function interestOpen(
  opportunity: Pick<Opportunity, "status" | "deadline" | "deadlineTime">,
  now = new Date(),
): boolean {
  if (opportunity.status !== "Published" || !opportunity.deadline) return false;
  const day = opportunity.deadline.toISOString().slice(0, 10);
  if (!opportunity.deadlineTime) {
    // Last millisecond of the Cambodia local deadline date is included.
    return now.getTime() <= new Date(day + "T23:59:59.999+07:00").getTime();
  }
  return now.getTime() < new Date(day + "T" + opportunity.deadlineTime + ":00+07:00").getTime();
}

async function findOpportunity(actor: AuthUser, id: string) {
  const row = await prisma.opportunity.findUnique({ where: { id } });
  if (!row) throw new OpportunityError(404, "Opportunity not found");
  requireProgrammeRole(actor, row.programmeId, READ_ROLES);
  return row;
}

async function assertStudent(actor: AuthUser, programmeId: string) {
  requireProgrammeRole(actor, programmeId, STUDENT_ROLES);
  const student = await prisma.student.findUnique({
    where: { userId: actor.id },
    select: { id: true, status: true },
  });
  if (!student || student.status !== "Active") {
    throw new OpportunityError(403, "An active PMS student profile is required");
  }
}

export const opportunityInterestService = {
  async summary(actor: AuthUser, id: string, now = new Date()): Promise<OpportunityInterestSummary> {
    const row = await findOpportunity(actor, id);
    // Do not expose archived or expired opportunity data through this endpoint.
    const day = row.deadline?.toISOString().slice(0, 10) ?? null;
    const cambodiaDay = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Phnom_Penh", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(now);
    if (row.status !== "Published" || (day && day < cambodiaDay)) {
      throw new OpportunityError(404, "Opportunity is not available");
    }
    const count = await prisma.opportunityInterest.count({
      where: { opportunityId: id, status: "Joined" },
    });
    const joined = hasAnyRoleInProgramme(actor, STUDENT_ROLES, row.programmeId)
      ? Boolean(await prisma.opportunityInterest.findFirst({
          where: { opportunityId: id, userId: actor.id, status: "Joined" },
          select: { id: true },
        }))
      : false;
    return { count, joined, canJoin: interestOpen(row, now) };
  },

  async join(actor: AuthUser, id: string, now = new Date()): Promise<OpportunityInterestSummary> {
    const row = await findOpportunity(actor, id);
    await assertStudent(actor, row.programmeId);
    if (!interestOpen(row, now)) throw new OpportunityError(409, "The registration interest deadline has closed");
    await prisma.$transaction(async (tx) => {
      // Recheck inside transaction; no student can mark interest in a draft or archived opportunity.
      const current = await tx.opportunity.findUnique({ where: { id } });
      if (!current || !interestOpen(current, new Date())) {
        throw new OpportunityError(409, "This opportunity is no longer open");
      }
      const existing = await tx.opportunityInterest.findUnique({
        where: { opportunityId_userId: { opportunityId: id, userId: actor.id } },
      });
      if (existing?.status === "Joined") return;
      await tx.opportunityInterest.upsert({
        where: { opportunityId_userId: { opportunityId: id, userId: actor.id } },
        create: { opportunityId: id, userId: actor.id, status: "Joined", joinedAt: now },
        update: { status: "Joined", joinedAt: now, withdrawnAt: null },
      });
      await tx.opportunityAuditEvent.create({
        data: { opportunityId: id, actorId: actor.id, action: "InterestJoined" },
      });
    });
    return this.summary(actor, id);
  },

  async withdraw(actor: AuthUser, id: string, now = new Date()): Promise<OpportunityInterestSummary> {
    const row = await findOpportunity(actor, id);
    await assertStudent(actor, row.programmeId);
    await prisma.$transaction(async (tx) => {
      const updated = await tx.opportunityInterest.updateMany({
        where: { opportunityId: id, userId: actor.id, status: "Joined" },
        data: { status: "Withdrawn", withdrawnAt: now },
      });
      if (updated.count) {
        await tx.opportunityAuditEvent.create({
          data: { opportunityId: id, actorId: actor.id, action: "InterestWithdrawn" },
        });
      }
    });
    // On archive / expiry no student-specific data is returned, though withdrawal persists.
    if (row.status !== "Published" || (row.deadline &&
        row.deadline.toISOString().slice(0, 10) < new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Phnom_Penh", year: "numeric", month: "2-digit", day: "2-digit",
        }).format(now))) {
      return { count: 0, joined: false, canJoin: false };
    }
    return this.summary(actor, id);
  },

  async overview(actor: AuthUser, programmeId: string): Promise<OpportunityInterestOverviewItem[]> {
    requireProgrammeRole(actor, programmeId, ROSTER_ROLES);
    const rows = await prisma.opportunity.findMany({
      where: { programmeId, status: { in: ["Published", "Archived"] } },
      orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, title: true, status: true, deadline: true, deadlineTime: true },
    });
    const counts = rows.length
      ? await prisma.opportunityInterest.groupBy({
          by: ["opportunityId"],
          where: { opportunityId: { in: rows.map((r) => r.id) }, status: "Joined" },
          _count: { _all: true },
        })
      : [];
    const countsById = new Map(counts.map((r) => [r.opportunityId, r._count._all]));
    return rows.map((r) => ({
      id: r.id, title: r.title, status: r.status as OpportunityInterestOverviewItem["status"],
      deadline: r.deadline?.toISOString().slice(0, 10) ?? null, deadlineTime: r.deadlineTime,
      count: countsById.get(r.id) ?? 0,
    }));
  },

  async students(actor: AuthUser, id: string): Promise<OpportunityInterestedStudent[]> {
    const row = await prisma.opportunity.findUnique({ where: { id }, select: { programmeId: true } });
    if (!row) throw new OpportunityError(404, "Opportunity not found");
    requireProgrammeRole(actor, row.programmeId, ROSTER_ROLES);
    const interests = await prisma.opportunityInterest.findMany({
      where: { opportunityId: id, status: "Joined" },
      orderBy: { joinedAt: "asc" },
      select: {
        joinedAt: true,
        user: { select: {
          name: true,
          studentProfile: { select: {
            name: true, studentId: true,
            cohortMemberships: {
              where: { exitedAt: null, cohort: { programmeId: row.programmeId } },
              take: 1, orderBy: { joinedAt: "desc" },
              select: { progressionRecords: {
                orderBy: { periodStart: "desc" }, take: 1,
                select: { programmeYear: true },
              } },
            },
          } },
        } },
      },
    });
    return interests.map((interest) => {
      const student = interest.user.studentProfile;
      const year = student?.cohortMemberships[0]?.progressionRecords[0]?.programmeYear;
      return {
        name: student?.name ?? interest.user.name,
        studentId: student?.studentId ?? null,
        yearGroup: year && year >= 1 ? "Year " + year : "Not recorded",
        joinedAt: interest.joinedAt.toISOString(),
      };
    });
  },
};
