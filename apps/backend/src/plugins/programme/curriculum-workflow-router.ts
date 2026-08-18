import { Router } from "express";
import {
  CurriculumRequestChangesSchema,
  CurriculumWorkflowCommentSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme, type AuthUser, type Role } from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import {
  CurriculumWorkflowNotFoundError,
  CurriculumWorkflowTransitionError,
  CurriculumWorkflowValidationError,
  curriculumWorkflowService,
} from "./curriculum-workflow-service.ts";

const WORKFLOW_ROLES: Role[] = ["admin", "program_coordinator"];

function canManage(user: AuthUser, programmeId: string) {
  return hasAnyRoleInProgramme(user, WORKFLOW_ROLES, programmeId);
}

function sendError(res: Parameters<Parameters<Router["post"]>[1]>[1], error: unknown) {
  if (error instanceof CurriculumWorkflowNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof CurriculumWorkflowTransitionError) {
    res.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof CurriculumWorkflowValidationError) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Could not update curriculum workflow" });
}

async function authorize(req: Parameters<Parameters<Router["get"]>[1]>[0], res: Parameters<Parameters<Router["get"]>[1]>[1], versionId: string) {
  if (!req.user) return false;
  try {
    const programmeId = await curriculumWorkflowService.programmeId(versionId);
    if (!canManage(req.user, programmeId)) {
      res.status(403).json({ error: "No curriculum workflow access for this programme" });
      return false;
    }
    return true;
  } catch (error) {
    sendError(res, error);
    return false;
  }
}

export function createCurriculumWorkflowRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/curricula/versions/:versionId/workflow",
    requirePermission("programme:read"),
    async (req, res) => {
      const versionId = req.params.versionId;
      if (!versionId) return void res.status(400).json({ error: "Curriculum version id is required" });
      if (!(await authorize(req, res, versionId))) return;
      try {
        res.json(await curriculumWorkflowService.state(versionId));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.post(
    "/curricula/versions/:versionId/workflow/submit",
    requirePermission("programme:write"),
    async (req, res) => {
      const versionId = req.params.versionId;
      if (!versionId || !req.user) return void res.status(400).json({ error: "Curriculum version id is required" });
      const parsed = CurriculumWorkflowCommentSchema.safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: "Invalid workflow comment", details: parsed.error.flatten() });
      if (!(await authorize(req, res, versionId))) return;
      try {
        res.json(await curriculumWorkflowService.submit(versionId, req.user.id, parsed.data.comment));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.post(
    "/curricula/versions/:versionId/workflow/request-changes",
    requirePermission("programme:write"),
    async (req, res) => {
      const versionId = req.params.versionId;
      if (!versionId || !req.user) return void res.status(400).json({ error: "Curriculum version id is required" });
      const parsed = CurriculumRequestChangesSchema.safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: "A reason for requested changes is required", details: parsed.error.flatten() });
      if (!(await authorize(req, res, versionId))) return;
      try {
        res.json(await curriculumWorkflowService.requestChanges(versionId, req.user.id, parsed.data.comment));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  for (const [path, action] of [
    ["approve", curriculumWorkflowService.approve],
    ["activate", curriculumWorkflowService.activate],
  ] as const) {
    router.post(
      `/curricula/versions/:versionId/workflow/${path}`,
      requirePermission("programme:write"),
      async (req, res) => {
        const versionId = req.params.versionId;
        if (!versionId || !req.user) return void res.status(400).json({ error: "Curriculum version id is required" });
        const parsed = CurriculumWorkflowCommentSchema.safeParse(req.body);
        if (!parsed.success) return void res.status(400).json({ error: "Invalid workflow comment", details: parsed.error.flatten() });
        if (!(await authorize(req, res, versionId))) return;
        try {
          res.json(await action(versionId, req.user.id, parsed.data.comment));
        } catch (error) {
          sendError(res, error);
        }
      },
    );
  }

  return router;
}
