import { Router, type Response } from "express";
import {
  QaSarSectionQuerySchema,
  SaveQaSarSectionSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme } from "../../../core/auth/token.ts";
import { requirePermission } from "../../../core/permissions/index.ts";
import {
  QaSarEvidenceReferenceError,
  QaSarResourceNotFoundError,
  QaSarScopeMismatchError,
  QaSarSectionLockedError,
  getQaSarSection,
  isSarRequirementAssignedToUser,
  saveQaSarSection,
} from "./service.ts";

function sendSarError(res: Response, error: unknown): void {
  if (error instanceof QaSarResourceNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (
    error instanceof QaSarScopeMismatchError ||
    error instanceof QaSarEvidenceReferenceError ||
    error instanceof QaSarSectionLockedError
  ) {
    res.status(409).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Could not complete the SAR operation" });
}

async function canReadSar(
  user: Parameters<typeof hasAnyRoleInProgramme>[0],
  programmeId: string,
  cycleId: string,
  requirementCode: string,
): Promise<boolean> {
  if (hasAnyRoleInProgramme(user, ["admin", "program_coordinator", "qa_reviewer"], programmeId)) return true;
  if (!hasAnyRoleInProgramme(user, ["qa_contributor"], programmeId)) return false;
  return isSarRequirementAssignedToUser(programmeId, cycleId, requirementCode, user.id);
}

async function canEditSar(
  user: Parameters<typeof hasAnyRoleInProgramme>[0],
  programmeId: string,
  cycleId: string,
  requirementCode: string,
): Promise<boolean> {
  if (hasAnyRoleInProgramme(user, ["admin", "program_coordinator"], programmeId)) return true;
  if (!hasAnyRoleInProgramme(user, ["qa_contributor"], programmeId)) return false;
  return isSarRequirementAssignedToUser(programmeId, cycleId, requirementCode, user.id);
}

export function createQaSarRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/cycles/:cycleId/requirements/:requirementCode/sar-section",
    requirePermission("qa:read"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const requirementCode = req.params.requirementCode;
      const parsed = QaSarSectionQuerySchema.safeParse(req.query);
      if (!cycleId || !requirementCode || !/^\d\.\d$/.test(requirementCode) || !parsed.success) {
        res.status(400).json({ error: "Invalid SAR section query" });
        return;
      }
      if (!(await canReadSar(req.user!, parsed.data.programmeId, cycleId, requirementCode))) {
        res.status(403).json({ error: "You do not have access to this SAR section" });
        return;
      }

      try {
        res.json(await getQaSarSection(parsed.data.programmeId, cycleId, requirementCode));
      } catch (error) {
        sendSarError(res, error);
      }
    },
  );

  router.put(
    "/cycles/:cycleId/requirements/:requirementCode/sar-section",
    requirePermission("qa:contribute"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const requirementCode = req.params.requirementCode;
      const parsed = SaveQaSarSectionSchema.safeParse(req.body);
      if (!cycleId || !requirementCode || !/^\d\.\d$/.test(requirementCode) || !parsed.success) {
        res.status(400).json({
          error: "Invalid SAR section content",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!(await canEditSar(req.user!, parsed.data.programmeId, cycleId, requirementCode))) {
        res.status(403).json({ error: "You cannot edit this SAR section" });
        return;
      }

      try {
        res.json(await saveQaSarSection(cycleId, requirementCode, parsed.data, req.user!.id));
      } catch (error) {
        sendSarError(res, error);
      }
    },
  );

  return router;
}
