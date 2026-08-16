import { Prisma } from "@prisma/client";
import type {
  CurriculumWorkflowAction,
  CurriculumWorkflowState,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { curriculumService } from "./curriculum-service.ts";

export class CurriculumWorkflowNotFoundError extends Error {}
export class CurriculumWorkflowTransitionError extends Error {}
export class CurriculumWorkflowValidationError extends Error {}

const SUBMITTED = "SubmittedForReview";
const CHANGES_REQUESTED = "ChangesRequested";

type WorkflowMarker = typeof SUBMITTED | typeof CHANGES_REQUESTED;

function workflowMarker(details: Prisma.JsonValue | null): WorkflowMarker | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const value = (details as Record<string, unknown>).workflowAction;
  return value === SUBMITTED || value === CHANGES_REQUESTED ? value : null;
}

async function draftReviewMarker(versionId: string): Promise<{ marker: WorkflowMarker | null; comment: string | null }> {
  const actions = await prisma.programmeCurriculumAuditAction.findMany({
    where: { curriculumVersionId: versionId, action: "MetadataUpdated" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
    select: { details: true, note: true },
  });
  for (const action of actions) {
    const marker = workflowMarker(action.details);
    if (marker) return { marker, comment: action.note || null };
  }
  return { marker: null, comment: null };
}

async function loadVersion(versionId: string) {
  const version = await prisma.programmeCurriculumVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      curriculumId: true,
      status: true,
      revisionType: true,
      revisionTriggers: true,
      revisionReason: true,
      changeSummary: true,
      cohortLabel: true,
      academicYear: true,
      effectiveFrom: true,
      curriculum: { select: { programmeId: true } },
      _count: { select: { courses: true } },
    },
  });
  if (!version) throw new CurriculumWorkflowNotFoundError("Curriculum version not found");
  return version;
}

export async function getCurriculumWorkflowState(versionId: string): Promise<CurriculumWorkflowState> {
  const version = await loadVersion(versionId);
  const marker = version.status === "Draft" ? await draftReviewMarker(version.id) : { marker: null, comment: null };

  const status =
    version.status === "Draft" && marker.marker === SUBMITTED
      ? "UnderReview"
      : version.status;

  const allowedActions: CurriculumWorkflowAction[] = [];
  if (status === "Draft") allowedActions.push("submit");
  if (status === "UnderReview") allowedActions.push("requestChanges", "approve");
  if (status === "Approved") allowedActions.push("activate");

  return {
    curriculumId: version.curriculumId,
    versionId: version.id,
    status,
    allowedActions,
    lastComment: marker.comment,
  };
}

function validateSubmission(version: Awaited<ReturnType<typeof loadVersion>>) {
  if (version._count.courses === 0) {
    throw new CurriculumWorkflowValidationError("A curriculum must contain at least one course before review");
  }
  if (!version.cohortLabel.trim() || !version.academicYear.trim()) {
    throw new CurriculumWorkflowValidationError("Cohort label and academic year are required before review");
  }
  if (
    version.revisionType !== "Initial" &&
    (!version.revisionReason.trim() ||
      !version.changeSummary.trim() ||
      version.revisionTriggers.length === 0)
  ) {
    throw new CurriculumWorkflowValidationError(
      "Revision reason, change summary, and at least one revision trigger are required before review",
    );
  }
}

async function appendReviewMarker(
  versionId: string,
  actorId: string,
  marker: WorkflowMarker,
  comment: string,
) {
  await prisma.programmeCurriculumAuditAction.create({
    data: {
      curriculumVersionId: versionId,
      actorId,
      action: "MetadataUpdated",
      note: comment,
      details: {
        workflowAction: marker,
        to: marker === SUBMITTED ? "UnderReview" : "Draft",
      },
    },
  });
}

export const curriculumWorkflowService = {
  state: getCurriculumWorkflowState,

  async submit(versionId: string, actorId: string, comment: string) {
    const version = await loadVersion(versionId);
    const state = await getCurriculumWorkflowState(versionId);
    if (state.status === "UnderReview") return state;
    if (state.status !== "Draft") {
      throw new CurriculumWorkflowTransitionError(`Cannot submit a ${state.status} curriculum for review`);
    }
    validateSubmission(version);
    await appendReviewMarker(version.id, actorId, SUBMITTED, comment);
    return getCurriculumWorkflowState(version.id);
  },

  async requestChanges(versionId: string, actorId: string, comment: string) {
    const state = await getCurriculumWorkflowState(versionId);
    if (state.status !== "UnderReview") {
      throw new CurriculumWorkflowTransitionError("Changes can only be requested from Under Review");
    }
    await appendReviewMarker(versionId, actorId, CHANGES_REQUESTED, comment);
    return getCurriculumWorkflowState(versionId);
  },

  async approve(versionId: string, actorId: string, comment: string) {
    const version = await loadVersion(versionId);
    const state = await getCurriculumWorkflowState(versionId);
    if (state.status === "Approved") return state;
    if (state.status !== "UnderReview") {
      throw new CurriculumWorkflowTransitionError("Only an Under Review curriculum can be approved");
    }
    validateSubmission(version);
    await prisma.$transaction(async (tx) => {
      await tx.programmeCurriculumVersion.update({
        where: { id: versionId },
        data: { status: "Approved", approvedAt: new Date() },
      });
      await tx.programmeCurriculumAuditAction.create({
        data: {
          curriculumVersionId: versionId,
          actorId,
          action: "Approved",
          note: comment,
          details: { from: "UnderReview", to: "Approved" },
        },
      });
    });
    return getCurriculumWorkflowState(versionId);
  },

  async activate(versionId: string, actorId: string, comment: string) {
    const initial = await loadVersion(versionId);
    if (initial.status === "Active") return getCurriculumWorkflowState(versionId);
    if (initial.status !== "Approved") {
      throw new CurriculumWorkflowTransitionError("Only an Approved curriculum can be activated");
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await prisma.$transaction(
          async (tx) => {
            const target = await tx.programmeCurriculumVersion.findUnique({
              where: { id: versionId },
              select: { id: true, curriculumId: true, status: true },
            });
            if (!target) throw new CurriculumWorkflowNotFoundError("Curriculum version not found");
            if (target.status === "Active") return;
            if (target.status !== "Approved") {
              throw new CurriculumWorkflowTransitionError("Only an Approved curriculum can be activated");
            }

            const previous = await tx.programmeCurriculumVersion.findFirst({
              where: {
                curriculumId: target.curriculumId,
                status: "Active",
                id: { not: target.id },
              },
              select: { id: true },
            });

            if (previous) {
              await tx.programmeCurriculumVersion.update({
                where: { id: previous.id },
                data: { status: "Superseded" },
              });
              await tx.programmeCurriculumAuditAction.create({
                data: {
                  curriculumVersionId: previous.id,
                  actorId,
                  action: "Superseded",
                  note: `Superseded by curriculum version ${target.id}`,
                  details: { supersededByVersionId: target.id },
                },
              });
            }

            await tx.programmeCurriculumVersion.update({
              where: { id: target.id },
              data: { status: "Active" },
            });
            await tx.programmeCurriculumAuditAction.create({
              data: {
                curriculumVersionId: target.id,
                actorId,
                action: "Activated",
                note: comment,
                details: { from: "Approved", to: "Active", supersededVersionId: previous?.id ?? null },
              },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        return getCurriculumWorkflowState(versionId);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) {
          continue;
        }
        throw error;
      }
    }
    throw new CurriculumWorkflowTransitionError("Could not activate curriculum due to concurrent changes");
  },

  async programmeId(versionId: string) {
    return (await loadVersion(versionId)).curriculum.programmeId;
  },

  async read(versionId: string) {
    const version = await loadVersion(versionId);
    return curriculumService.getById(version.curriculumId, version.id);
  },
};
