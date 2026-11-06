import type { Opportunity } from "@prisma/client";
import type {
  CreateOpportunityInput, OpportunityDetailView, OpportunityExperienceReviewView,
  OpportunityExperienceView, OpportunityKind, OpportunityStatus,
  OpportunityView, SubmitOpportunityExperienceInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { hasAnyRoleInProgramme, type AuthUser, type Role } from "../../core/auth/token.ts";
import { registry } from "../../core/plugins/registry.ts";

const READ_ROLES: Role[] = ["student", "lecturer", "admin", "program_coordinator", "program_secretary"];
const STAFF_ROLES: Role[] = ["admin", "program_coordinator"];
const MAX_LIST_SIZE = 100;

type SafePortfolioEvidence = {
  studentUserId: string;
  studentName: string;
  evidenceTitle: string;
  publicPortfolioSlug: string;
};

function publicEvidence(evidenceId: string): Promise<SafePortfolioEvidence | null> {
  return registry.get<{ getPublicOpportunityEvidence(id: string): Promise<SafePortfolioEvidence | null> }>("student-portal")
    .service.getPublicOpportunityEvidence(evidenceId);
}

export class OpportunityError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function requireRole(actor: AuthUser, programmeId: string, roles: Role[]): void {
  if (!hasAnyRoleInProgramme(actor, roles, programmeId)) {
    throw new OpportunityError(403, "No permission for this programme");
  }
}

/** Application deadlines are calendar dates, inclusive through the local day in Cambodia. */
export function cambodiaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Phnom_Penh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function deadlineStillOpen(deadline: string | null, today: string): boolean {
  return deadline === null || deadline >= today;
}

function deadlineCutoff(now: Date): Date {
  return new Date(cambodiaToday(now) + "T00:00:00.000Z");
}
function isActive(row: Opportunity, now: Date): boolean {
  return row.status === "Published" && deadlineStillOpen(
    row.deadline ? row.deadline.toISOString().slice(0, 10) : null,
    cambodiaToday(now),
  );
}

function dto(row: Opportunity): OpportunityView {
  return {
    id: row.id, programmeId: row.programmeId, type: row.type as OpportunityKind,
    title: row.title, organizer: row.organizer, summary: row.summary,
    eligibility: row.eligibility, sourceUrl: row.sourceUrl,
    applicationUrl: row.applicationUrl,
    deadline: row.deadline ? row.deadline.toISOString().slice(0, 10) : null,
    status: row.status as OpportunityStatus,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

function audit(tx: Pick<typeof prisma, "opportunityAuditEvent">, opportunityId: string, actorId: string, action: string, details = "") {
  return tx.opportunityAuditEvent.create({ data: { opportunityId, actorId, action, details } });
}

async function activeOpportunity(actor: AuthUser, id: string, now: Date): Promise<Opportunity> {
  const row = await prisma.opportunity.findUnique({ where: { id } });
  if (!row) throw new OpportunityError(404, "Opportunity not found");
  requireRole(actor, row.programmeId, READ_ROLES);
  if (!isActive(row, now)) throw new OpportunityError(404, "Opportunity is not currently available");
  return row;
}

export const opportunitiesService = {
  async list(actor: AuthUser, programmeId: string, now = new Date()): Promise<OpportunityView[]> {
    requireRole(actor, programmeId, READ_ROLES);
    const rows = await prisma.opportunity.findMany({
      where: {
        programmeId, status: "Published",
        OR: [{ deadline: null }, { deadline: { gte: deadlineCutoff(now) } }],
      },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: MAX_LIST_SIZE,
    });
    return rows.map(dto);
  },

  async detail(actor: AuthUser, id: string, now = new Date()): Promise<OpportunityDetailView> {
    const row = await activeOpportunity(actor, id, now);
    const links = await prisma.opportunityExperience.findMany({
      where: { opportunityId: id, status: "Approved" },
      take: 25,
      orderBy: { reviewedAt: "desc" },
    });
    const experiences = (await Promise.all(links.map(async (link): Promise<OpportunityExperienceView | null> => {
      const evidence = await publicEvidence(link.evidenceId);
      if (!evidence) return null; // Re-check consented source's current public/verified state.
      return {
        id: link.id,
        outcome: link.outcome as OpportunityExperienceView["outcome"],
        studentName: evidence.studentName,
        evidenceTitle: evidence.evidenceTitle,
        publicPortfolioSlug: evidence.publicPortfolioSlug,
      };
    }))).filter((value): value is OpportunityExperienceView => value !== null);
    return { ...dto(row), experiences };
  },

  async manage(actor: AuthUser, programmeId: string): Promise<OpportunityView[]> {
    requireRole(actor, programmeId, STAFF_ROLES);
    const rows = await prisma.opportunity.findMany({
      where: { programmeId },
      take: MAX_LIST_SIZE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map(dto);
  },

  async create(actor: AuthUser, input: CreateOpportunityInput): Promise<OpportunityView> {
    requireRole(actor, input.programmeId, STAFF_ROLES);
    const programme = await prisma.programme.findUnique({ where: { id: input.programmeId }, select: { id: true } });
    if (!programme) throw new OpportunityError(404, "Programme not found");
    const row = await prisma.$transaction(async (tx) => {
      const opportunity = await tx.opportunity.create({
        data: {
          ...input,
          deadline: input.deadline ? new Date(input.deadline + "T00:00:00.000Z") : null,
          createdById: actor.id,
          status: "Draft",
        },
      });
      await audit(tx, opportunity.id, actor.id, "Created");
      return opportunity;
    });
    return dto(row);
  },

  async publish(actor: AuthUser, id: string, now = new Date()): Promise<OpportunityView> {
    const row = await prisma.opportunity.findUnique({ where: { id } });
    if (!row) throw new OpportunityError(404, "Opportunity not found");
    requireRole(actor, row.programmeId, STAFF_ROLES);
    if (row.status !== "Draft") throw new OpportunityError(409, "Only draft opportunities may be published");
    if (!deadlineStillOpen(row.deadline?.toISOString().slice(0, 10) ?? null, cambodiaToday(now))) {
      throw new OpportunityError(409, "The deadline has passed; verify or replace this draft");
    }
    return dto(await prisma.$transaction(async (tx) => {
      const result = await tx.opportunity.updateMany({
        where: { id, status: "Draft" },
        data: { status: "Published", publishedAt: now, publishedById: actor.id },
      });
      if (!result.count) throw new OpportunityError(409, "Opportunity was modified by another reviewer");
      await audit(tx, id, actor.id, "Published");
      return tx.opportunity.findUniqueOrThrow({ where: { id } });
    }));
  },

  async archive(actor: AuthUser, id: string): Promise<OpportunityView> {
    const row = await prisma.opportunity.findUnique({ where: { id } });
    if (!row) throw new OpportunityError(404, "Opportunity not found");
    requireRole(actor, row.programmeId, STAFF_ROLES);
    if (row.status === "Archived") throw new OpportunityError(409, "Already archived");
    return dto(await prisma.$transaction(async (tx) => {
      const result = await tx.opportunity.updateMany({
        where: { id, status: row.status },
        data: { status: "Archived" },
      });
      if (!result.count) throw new OpportunityError(409, "Opportunity was modified by another reviewer");
      await audit(tx, id, actor.id, "Archived");
      return tx.opportunity.findUniqueOrThrow({ where: { id } });
    }));
  },

  async submitExperience(actor: AuthUser, id: string, input: SubmitOpportunityExperienceInput) {
    const row = await activeOpportunity(actor, id, new Date());
    requireRole(actor, row.programmeId, ["student"]);
    const evidence = await publicEvidence(input.evidenceId);
    if (!evidence || evidence.studentUserId !== actor.id) {
      throw new OpportunityError(403, "Choose your own public, verified competition or achievement evidence");
    }
    const existing = await prisma.opportunityExperience.findUnique({
      where: { opportunityId_evidenceId: { opportunityId: id, evidenceId: input.evidenceId } },
    });
    if (existing && existing.consentedById !== actor.id) throw new OpportunityError(403, "This submission belongs to another student");
    return prisma.$transaction(async (tx) => {
      if (existing) {
        if (existing.status !== "Hidden") throw new OpportunityError(409, "This evidence has already been submitted");
        const updated = await tx.opportunityExperience.update({
          where: { id: existing.id },
          data: { outcome: input.outcome, status: "Pending", consentedAt: new Date(), reviewedAt: null, reviewedById: null },
        });
        await audit(tx, id, actor.id, "ExperienceResubmitted", input.evidenceId);
        return { id: updated.id, status: updated.status };
      }
      const created = await tx.opportunityExperience.create({
        data: { opportunityId: id, evidenceId: input.evidenceId, outcome: input.outcome, consentedById: actor.id },
      });
      await audit(tx, id, actor.id, "ExperienceConsented", input.evidenceId);
      return { id: created.id, status: created.status };
    });
  },

  async reviewList(actor: AuthUser, programmeId: string): Promise<OpportunityExperienceReviewView[]> {
    requireRole(actor, programmeId, STAFF_ROLES);
    const items = await prisma.opportunityExperience.findMany({
      where: { opportunity: { programmeId }, status: { in: ["Pending", "Approved"] } },
      include: { opportunity: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
      take: MAX_LIST_SIZE,
    });
    return Promise.all(items.map(async (item) => {
      const evidence = await publicEvidence(item.evidenceId);
      return {
        id: item.id, opportunityId: item.opportunityId,
        opportunityTitle: item.opportunity.title, evidenceId: item.evidenceId,
        outcome: item.outcome as OpportunityExperienceReviewView["outcome"],
        status: item.status as OpportunityExperienceReviewView["status"], consentedAt: item.consentedAt.toISOString(),
        publicStudent: evidence ? {
          id: item.id, outcome: item.outcome as OpportunityExperienceView["outcome"],
          studentName: evidence.studentName, evidenceTitle: evidence.evidenceTitle,
          publicPortfolioSlug: evidence.publicPortfolioSlug,
        } : null,
      };
    }));
  },

  async reviewExperience(actor: AuthUser, id: string, action: "approve" | "hide") {
    const item = await prisma.opportunityExperience.findUnique({
      where: { id }, include: { opportunity: true },
    });
    if (!item) throw new OpportunityError(404, "Experience not found");
    requireRole(actor, item.opportunity.programmeId, STAFF_ROLES);
    if (action === "approve") {
      if (item.status !== "Pending") throw new OpportunityError(409, "Only pending experiences may be approved");
      if (!isActive(item.opportunity, new Date())) throw new OpportunityError(409, "Opportunity must be active");
      const evidence = await publicEvidence(item.evidenceId);
      if (!evidence || evidence.studentUserId !== item.consentedById) {
        throw new OpportunityError(409, "Evidence is no longer public, verified or owned by consenting student");
      }
    } else if (item.status === "Hidden") {
      throw new OpportunityError(409, "Already hidden");
    }
    const target = action === "approve" ? "Approved" : "Hidden";
    return prisma.$transaction(async (tx) => {
      const changed = await tx.opportunityExperience.updateMany({
        where: { id, status: item.status },
        data: { status: target, reviewedById: actor.id, reviewedAt: new Date() },
      });
      if (!changed.count) throw new OpportunityError(409, "Experience was reviewed by another staff member");
      await audit(tx, item.opportunityId, actor.id, "Experience" + target, item.evidenceId);
      return { id, status: target };
    });
  },
};
