import { Router, type Response } from "express";
import {
  CreateResearchInterventionLogSchema,
  CreateResearchInterventionSchema,
  ResearchScopeSchema,
  UpdateResearchInterventionSchema,
  UpdateResearchInterventionStatusSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme } from "../../../core/auth/token.ts";
import {
  ActionResearchAuthorizationError,
  ActionResearchConflictError,
  ActionResearchNotFoundError,
  ActionResearchScopeMismatchError,
} from "./service.ts";
import { ActionResearchLifecycleError } from "./policy.ts";
import {
  createResearchIntervention,
  createResearchInterventionLog,
  listResearchInterventions,
  updateResearchIntervention,
  updateResearchInterventionStatus,
} from "./intervention-service.ts";

const MANAGER_ROLES = ["admin", "program_coordinator"] as const;
const PARTICIPANT_ROLES = [
  "admin",
  "program_coordinator",
  "lecturer",
  "qa_reviewer",
] as const;

function sendInterventionError(res: Response, error: unknown): void {
  if (error instanceof ActionResearchNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof ActionResearchAuthorizationError) {
    res.status(403).json({ error: error.message });
    return;
  }
  if (
    error instanceof ActionResearchScopeMismatchError ||
    error instanceof ActionResearchConflictError ||
    error instanceof ActionResearchLifecycleError
  ) {
    res.status(409).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Could not complete the Action Research intervention operation" });
}

function canManageProject(
  req: Parameters<typeof hasAnyRoleInProgramme>[0],
  programmeId: string,
): boolean {
  return hasAnyRoleInProgramme(req, [...MANAGER_ROLES], programmeId);
}

function canAccessWorkspace(
  req: Parameters<typeof hasAnyRoleInProgramme>[0],
  programmeId: string,
): boolean {
  return hasAnyRoleInProgramme(req, [...PARTICIPANT_ROLES], programmeId);
}

export function createActionResearchInterventionRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/action-research/cycles/:cycleId/interventions", async (req, res) => {
    const cycleId = req.params.cycleId;
    const parsed = ResearchScopeSchema.safeParse(req.query);
    if (!cycleId || !parsed.success) {
      res.status(400).json({ error: "Invalid intervention query" });
      return;
    }
    if (!canAccessWorkspace(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "You cannot access Action Research for this programme" });
      return;
    }
    try {
      res.json(await listResearchInterventions(
        cycleId,
        parsed.data.programmeId,
        req.user!.id,
        canManageProject(req.user!, parsed.data.programmeId),
      ));
    } catch (error) {
      sendInterventionError(res, error);
    }
  });

  router.post("/action-research/cycles/:cycleId/interventions", async (req, res) => {
    const cycleId = req.params.cycleId;
    const parsed = CreateResearchInterventionSchema.safeParse(req.body);
    if (!cycleId || !parsed.success) {
      res.status(400).json({
        error: "Invalid intervention plan",
        details: parsed.success ? undefined : parsed.error.flatten(),
      });
      return;
    }
    if (!canAccessWorkspace(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "You cannot create interventions for this programme" });
      return;
    }
    try {
      res.status(201).json(await createResearchIntervention(cycleId, parsed.data, req.user!.id));
    } catch (error) {
      sendInterventionError(res, error);
    }
  });

  router.put("/action-research/interventions/:interventionId", async (req, res) => {
    const interventionId = req.params.interventionId;
    const parsed = UpdateResearchInterventionSchema.safeParse(req.body);
    if (!interventionId || !parsed.success) {
      res.status(400).json({
        error: "Invalid intervention update",
        details: parsed.success ? undefined : parsed.error.flatten(),
      });
      return;
    }
    if (!canAccessWorkspace(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "You cannot update interventions for this programme" });
      return;
    }
    try {
      res.json(await updateResearchIntervention(interventionId, parsed.data, req.user!.id));
    } catch (error) {
      sendInterventionError(res, error);
    }
  });

  router.patch("/action-research/interventions/:interventionId/status", async (req, res) => {
    const interventionId = req.params.interventionId;
    const parsed = UpdateResearchInterventionStatusSchema.safeParse(req.body);
    if (!interventionId || !parsed.success) {
      res.status(400).json({
        error: "Invalid intervention status update",
        details: parsed.success ? undefined : parsed.error.flatten(),
      });
      return;
    }
    if (!canAccessWorkspace(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "You cannot update interventions for this programme" });
      return;
    }
    try {
      res.json(await updateResearchInterventionStatus(
        interventionId,
        parsed.data.programmeId,
        parsed.data.status,
        req.user!.id,
      ));
    } catch (error) {
      sendInterventionError(res, error);
    }
  });

  router.post("/action-research/interventions/:interventionId/logs", async (req, res) => {
    const interventionId = req.params.interventionId;
    const parsed = CreateResearchInterventionLogSchema.safeParse(req.body);
    if (!interventionId || !parsed.success) {
      res.status(400).json({
        error: "Invalid intervention fidelity record",
        details: parsed.success ? undefined : parsed.error.flatten(),
      });
      return;
    }
    if (!canAccessWorkspace(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "You cannot record intervention fidelity for this programme" });
      return;
    }
    try {
      res.status(201).json(await createResearchInterventionLog(
        interventionId,
        parsed.data,
        req.user!.id,
      ));
    } catch (error) {
      sendInterventionError(res, error);
    }
  });

  return router;
}
