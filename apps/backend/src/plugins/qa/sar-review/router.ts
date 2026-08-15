import { Router, type Response } from "express";
import {
  CreateQaSarReviewSchema,
  QaSarReviewQuerySchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme } from "../../../core/auth/token.ts";
import { requirePermission } from "../../../core/permissions/index.ts";
import {
  QaSarResourceNotFoundError,
  QaSarScopeMismatchError,
  isSarRequirementAssignedToUser,
} from "../sar/service.ts";
import {
  QaSarReviewStateError,
  QaSarSubmissionNotReadyError,
  getQaSarReviewQueue,
  listQaSarSubmissionHistory,
  reviseApprovedQaSarSection,
  reviewQaSarSubmission,
  submitQaSarSection,
} from "./service.ts";

function sendError(res: Response, error: unknown): void {
  if (error instanceof QaSarResourceNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (
    error instanceof QaSarScopeMismatchError ||
    error instanceof QaSarReviewStateError ||
    error instanceof QaSarSubmissionNotReadyError
  ) {
    res.status(409).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Could not complete the SAR review operation" });
}

async function canWorkOnRequirement(
  user: Parameters<typeof hasAnyRoleInProgramme>[0],
  programmeId: string,
  cycleId: string,
  requirementCode: string,
): Promise<boolean> {
  if (hasAnyRoleInProgramme(user, ["admin", "program_coordinator"], programmeId)) return true;
  if (!hasAnyRoleInProgramme(user, ["qa_contributor"], programmeId)) return false;
  return isSarRequirementAssignedToUser(programmeId, cycleId, requirementCode, user.id);
}

async function canReadRequirementHistory(
  user: Parameters<typeof hasAnyRoleInProgramme>[0],
  programmeId: string,
  cycleId: string,
  requirementCode: string,
): Promise<boolean> {
  if (hasAnyRoleInProgramme(user, ["admin", "program_coordinator", "qa_reviewer"], programmeId)) return true;
  return canWorkOnRequirement(user, programmeId, cycleId, requirementCode);
}

export function createQaSarReviewRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/sar-review-queue", requirePermission("qa:review"), async (req, res) => {
    const parsed = QaSarReviewQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid SAR review queue query", details: parsed.error.flatten() });
      return;
    }
    if (!hasAnyRoleInProgramme(req.user!, ["admin", "program_coordinator", "qa_reviewer"], parsed.data.programmeId)) {
      res.status(403).json({ error: "You do not have SAR reviewer access to this programme" });
      return;
    }
    try {
      res.json(await getQaSarReviewQueue(parsed.data.programmeId));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get(
    "/cycles/:cycleId/requirements/:requirementCode/sar-submissions",
    requirePermission("qa:read"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const requirementCode = req.params.requirementCode;
      const parsed = QaSarReviewQuerySchema.safeParse(req.query);
      if (!cycleId || !requirementCode || !/^\d\.\d$/.test(requirementCode) || !parsed.success) {
        res.status(400).json({ error: "Invalid SAR submission history query" });
        return;
      }
      if (!(await canReadRequirementHistory(req.user!, parsed.data.programmeId, cycleId, requirementCode))) {
        res.status(403).json({ error: "You do not have access to this SAR submission history" });
        return;
      }
      try {
        res.json(await listQaSarSubmissionHistory(parsed.data.programmeId, cycleId, requirementCode));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.post(
    "/cycles/:cycleId/requirements/:requirementCode/sar-section/submit",
    requirePermission("qa:contribute"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const requirementCode = req.params.requirementCode;
      const parsed = QaSarReviewQuerySchema.safeParse(req.body);
      if (!cycleId || !requirementCode || !/^\d\.\d$/.test(requirementCode) || !parsed.success) {
        res.status(400).json({ error: "Invalid SAR submission request" });
        return;
      }
      if (!(await canWorkOnRequirement(req.user!, parsed.data.programmeId, cycleId, requirementCode))) {
        res.status(403).json({ error: "You cannot submit this SAR section" });
        return;
      }
      try {
        res.status(201).json(
          await submitQaSarSection(parsed.data.programmeId, cycleId, requirementCode, req.user!.id),
        );
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.post(
    "/cycles/:cycleId/requirements/:requirementCode/sar-section/revise",
    requirePermission("qa:contribute"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const requirementCode = req.params.requirementCode;
      const parsed = QaSarReviewQuerySchema.safeParse(req.body);
      if (!cycleId || !requirementCode || !/^\d\.\d$/.test(requirementCode) || !parsed.success) {
        res.status(400).json({ error: "Invalid SAR revision request" });
        return;
      }
      if (!(await canWorkOnRequirement(req.user!, parsed.data.programmeId, cycleId, requirementCode))) {
        res.status(403).json({ error: "You cannot revise this SAR section" });
        return;
      }
      try {
        await reviseApprovedQaSarSection(parsed.data.programmeId, cycleId, requirementCode);
        res.status(204).end();
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.post(
    "/sar-submissions/:submissionId/reviews",
    requirePermission("qa:review"),
    async (req, res) => {
      const submissionId = req.params.submissionId;
      const parsed = CreateQaSarReviewSchema.safeParse(req.body);
      if (!submissionId || !parsed.success) {
        res.status(400).json({
          error: "Invalid SAR review decision",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!hasAnyRoleInProgramme(req.user!, ["admin", "program_coordinator", "qa_reviewer"], parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have SAR reviewer access to this programme" });
        return;
      }
      try {
        res.status(201).json(await reviewQaSarSubmission(submissionId, parsed.data, req.user!.id));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  return router;
}
