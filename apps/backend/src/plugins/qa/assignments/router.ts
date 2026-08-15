import { Router } from "express";
import { z } from "zod";
import {
  QaRequirementAssignmentScopeSchema,
  UpsertQaRequirementAssignmentSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme } from "../../../core/auth/token.ts";
import { requirePermission } from "../../../core/permissions/index.ts";
import {
  QaAssignmentAssigneeError,
  QaAssignmentResourceNotFoundError,
  QaAssignmentScopeMismatchError,
  deleteQaRequirementAssignment,
  listMyQaRequirementAssignments,
  listQaRequirementAssignments,
  upsertQaRequirementAssignment,
} from "./service.ts";

const RequirementCodeSchema = z.string().regex(/^\d\.\d$/);

function sendAssignmentError(res: Parameters<Parameters<Router["get"]>[1]>[1], error: unknown) {
  if (error instanceof QaAssignmentResourceNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (
    error instanceof QaAssignmentScopeMismatchError ||
    error instanceof QaAssignmentAssigneeError
  ) {
    res.status(409).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Could not complete the QA assignment operation" });
}

export function createQaAssignmentsRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/cycles/:cycleId/assignments",
    requirePermission("qa:manage"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const parsed = QaRequirementAssignmentScopeSchema.safeParse(req.query);
      if (!cycleId || !parsed.success) {
        res.status(400).json({
          error: "Invalid QA assignment query",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (
        !hasAnyRoleInProgramme(
          req.user!,
          ["admin", "program_coordinator"],
          parsed.data.programmeId,
        )
      ) {
        res.status(403).json({ error: "You cannot manage QA assignments for this programme" });
        return;
      }

      try {
        res.json(await listQaRequirementAssignments(parsed.data.programmeId, cycleId));
      } catch (error) {
        sendAssignmentError(res, error);
      }
    },
  );

  router.get(
    "/cycles/:cycleId/my-work",
    requirePermission("qa:contribute"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const parsed = QaRequirementAssignmentScopeSchema.safeParse(req.query);
      if (!cycleId || !parsed.success) {
        res.status(400).json({
          error: "Invalid QA work query",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (
        !hasAnyRoleInProgramme(
          req.user!,
          ["admin", "program_coordinator", "qa_reviewer", "qa_contributor"],
          parsed.data.programmeId,
        )
      ) {
        res.status(403).json({ error: "You do not have QA contributor access to this programme" });
        return;
      }

      try {
        res.json(
          await listMyQaRequirementAssignments(
            parsed.data.programmeId,
            cycleId,
            req.user!.id,
          ),
        );
      } catch (error) {
        sendAssignmentError(res, error);
      }
    },
  );

  router.put(
    "/cycles/:cycleId/requirements/:requirementCode/assignment",
    requirePermission("qa:manage"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const requirementCode = req.params.requirementCode;
      const parsedCode = RequirementCodeSchema.safeParse(requirementCode);
      const parsed = UpsertQaRequirementAssignmentSchema.safeParse(req.body);
      if (!cycleId || !parsedCode.success || !parsed.success) {
        res.status(400).json({
          error: "Invalid QA requirement assignment",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (
        !hasAnyRoleInProgramme(
          req.user!,
          ["admin", "program_coordinator"],
          parsed.data.programmeId,
        )
      ) {
        res.status(403).json({ error: "You cannot manage QA assignments for this programme" });
        return;
      }

      try {
        res.json(
          await upsertQaRequirementAssignment(
            cycleId,
            parsedCode.data,
            parsed.data,
            req.user!.id,
          ),
        );
      } catch (error) {
        sendAssignmentError(res, error);
      }
    },
  );

  router.delete(
    "/cycles/:cycleId/requirements/:requirementCode/assignment",
    requirePermission("qa:manage"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const requirementCode = req.params.requirementCode;
      const parsedCode = RequirementCodeSchema.safeParse(requirementCode);
      const parsed = QaRequirementAssignmentScopeSchema.safeParse(req.query);
      if (!cycleId || !parsedCode.success || !parsed.success) {
        res.status(400).json({
          error: "Invalid QA requirement assignment removal",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (
        !hasAnyRoleInProgramme(
          req.user!,
          ["admin", "program_coordinator"],
          parsed.data.programmeId,
        )
      ) {
        res.status(403).json({ error: "You cannot manage QA assignments for this programme" });
        return;
      }

      try {
        await deleteQaRequirementAssignment(
          parsed.data.programmeId,
          cycleId,
          parsedCode.data,
        );
        res.status(204).end();
      } catch (error) {
        sendAssignmentError(res, error);
      }
    },
  );

  return router;
}
