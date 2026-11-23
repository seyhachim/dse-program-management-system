import { randomUUID } from "node:crypto";
import type { Opportunity } from "@prisma/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateOpportunityInput, OpportunityDetailView, OpportunityExperienceReviewView,
  OpportunityExperienceView, OpportunityKind, OpportunityStatus,
  OpportunityView, SubmitOpportunityExperienceInput, UpdateOpportunityInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { hasAnyRoleInProgramme, type AuthUser, type Role } from "../../core/auth/token.ts";
import { registry } from "../../core/plugins/registry.ts";

const READ_ROLES: Role[] = ["student", "lecturer", "admin", "program_coordinator", "program_secretary"];
const STAFF_ROLES: Role[] = ["admin", "program_coordinator"];
const MAX_LIST_SIZE = 100;
export const POSTER_BUCKET = "opportunity-posters";
export const MAX_POSTER_BYTES = 5 * 1024 * 1024;
let posterClient: SupabaseClient | null = null;

function getPosterClient(): SupabaseClient {
  if (posterClient) return posterClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new OpportunityError(503, "Poster uploads are not configured");
  posterClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return posterClient;
}

function publicPosterUrl(path: string | null): string | null {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  if (!path || !url) return null;
  return `${url}/storage/v1/object/public/${POSTER_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Validate actual image signatures, not just the browser-provided MIME label. */
export function posterExtension(file: Uint8Array, mime: string): "png" | "jpg" | "webp" {
  if (!file.length || file.length > MAX_POSTER_BYTES) throw new OpportunityError(400, "Poster must be 5 MB or smaller");
  if (mime === "image/png" && file.length >= 8 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => file[i] === byte)) return "png";
  if (mime === "image/jpeg" && file.length >= 4 &&
      file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff) return "jpg";
  if (mime === "image/webp" && file.length >= 12 &&
      String.fromCharCode(...file.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...file.slice(8, 12)) === "WEBP") return "webp";
  throw new OpportunityError(400, "Choose a valid JPG, PNG or WebP image");
}

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
    posterUrl: publicPosterUrl(row.posterPath),
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

  async updateDraft(actor: AuthUser, id: string, input: UpdateOpportunityInput): Promise<OpportunityView> {
    const row = await prisma.opportunity.findUnique({ where: { id } });
    if (!row) throw new OpportunityError(404, "Opportunity not found");
    requireRole(actor, row.programmeId, STAFF_ROLES);
    if (row.status !== "Draft") throw new OpportunityError(409, "Only drafts can be edited; archive and restore first");
    return dto(await prisma.$transaction(async (tx) => {
      const result = await tx.opportunity.updateMany({
        where: { id, status: "Draft" },
        data: {
          ...input, deadline: input.deadline ? new Date(input.deadline + "T00:00:00.000Z") : null,
        },
      });
      if (!result.count) throw new OpportunityError(409, "Opportunity changed during review");
      await audit(tx, id, actor.id, "DraftUpdated");
      return tx.opportunity.findUniqueOrThrow({ where: { id } });
    }));
  },

  async restoreToDraft(actor: AuthUser, id: string): Promise<OpportunityView> {
    const row = await prisma.opportunity.findUnique({ where: { id } });
    if (!row) throw new OpportunityError(404, "Opportunity not found");
    requireRole(actor, row.programmeId, STAFF_ROLES);
    if (row.status !== "Archived") throw new OpportunityError(409, "Only archived opportunities can be restored");
    return dto(await prisma.$transaction(async (tx) => {
      const result = await tx.opportunity.updateMany({
        where: { id, status: "Archived" },
        data: { status: "Draft", publishedAt: null, publishedById: null },
      });
      if (!result.count) throw new OpportunityError(409, "Opportunity changed during review");
      await audit(tx, id, actor.id, "RestoredToDraft");
      return tx.opportunity.findUniqueOrThrow({ where: { id } });
    }));
  },

  async uploadPoster(actor: AuthUser, id: string, file: Uint8Array, mime: string): Promise<OpportunityView> {
    const row = await prisma.opportunity.findUnique({ where: { id } });
    if (!row) throw new OpportunityError(404, "Opportunity not found");
    requireRole(actor, row.programmeId, STAFF_ROLES);
    if (row.status !== "Draft") throw new OpportunityError(409, "Restore to draft before changing the poster");
    const extension = posterExtension(file, mime);
    const client = getPosterClient();
    const path = `${id}/${randomUUID()}.${extension}`;
    const bucket = client.storage.from(POSTER_BUCKET);
    const result = await bucket.upload(path, file, { upsert: false, contentType: mime, cacheControl: "3600" });
    if (result.error) throw new OpportunityError(502, "Poster could not be uploaded to storage");
    try {
      const updated = await prisma.$transaction(async (tx) => {
        const changed = await tx.opportunity.updateMany({
          where: { id, status: "Draft" }, data: { posterPath: path },
        });
        if (!changed.count) throw new OpportunityError(409, "Opportunity changed during upload");
        await audit(tx, id, actor.id, "PosterUpdated");
        return tx.opportunity.findUniqueOrThrow({ where: { id } });
      });
      if (row.posterPath) await bucket.remove([row.posterPath]);
      return dto(updated);
    } catch (cause) {
      await bucket.remove([path]);
      throw cause;
    }
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

  async myExperiences(actor: AuthUser, id: string) {
    const opportunity = await activeOpportunity(actor, id, new Date());
    requireRole(actor, opportunity.programmeId, ["student"]);
    const rows = await prisma.opportunityExperience.findMany({
      where: { opportunityId: id, consentedById: actor.id },
      select: { id: true, evidenceId: true, outcome: true, status: true, consentedAt: true },
      orderBy: { consentedAt: "desc" },
      take: 25,
    });
    return rows.map((row) => ({
      ...row,
      outcome: row.outcome as "Winner" | "Finalist" | "Participant",
      status: row.status as "Pending" | "Approved" | "Hidden",
      consentedAt: row.consentedAt.toISOString(),
    }));
  },

  /** Student opt-out persists even if portfolio evidence is later republished. */
  async withdrawExperience(actor: AuthUser, opportunityId: string, experienceId: string) {
    const row = await prisma.opportunityExperience.findFirst({
      where: { id: experienceId, opportunityId, consentedById: actor.id },
      include: { opportunity: { select: { programmeId: true } } },
    });
    if (!row) throw new OpportunityError(404, "Experience not found");
    requireRole(actor, row.opportunity.programmeId, ["student"]);
    if (row.status === "Hidden") throw new OpportunityError(409, "Experience is already hidden");
    return prisma.$transaction(async (tx) => {
      const changed = await tx.opportunityExperience.updateMany({
        where: { id: experienceId, status: row.status, consentedById: actor.id },
        // Review fields represent the actor/time of the last visibility decision,
        // which can be a student's voluntary withdrawal or a staff review.
        data: { status: "Hidden", reviewedById: actor.id, reviewedAt: new Date() },
      });
      if (!changed.count) throw new OpportunityError(409, "Experience was modified");
      await audit(tx, opportunityId, actor.id, "ExperienceWithdrawn", row.evidenceId);
      return { id: experienceId, status: "Hidden" as const };
    });
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

  async reviewExperience(actor: AuthUser, id: string, action: "approve" | "hide", reason = "") {
    if (reason.length > 1000) throw new OpportunityError(400, "Review note is too long");
    if (action === "approve" && reason.trim().length < 12) {
      throw new OpportunityError(400, "Record an official result URL or staff verification evidence before approving");
    }
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
      await audit(tx, item.opportunityId, actor.id, "Experience" + target,
        JSON.stringify({ evidenceId: item.evidenceId, reviewerEvidence: reason.trim() }));
      return { id, status: target };
    });
  },
};
