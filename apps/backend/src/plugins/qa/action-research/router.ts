import { Router, type Response } from "express";
import {
  CreateResearchAssignmentSchema,
  CreateResearchProjectSchema,
  LockResearchBaselineSchema,
  ResearchProjectListQuerySchema,
  ResearchProjectPageQuerySchema,
  ResearchScopeSchema,
  ReviewResearchProtocolSchema,
  SaveResearchProtocolSchema,
  UpdateResearchAssignmentStatusSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme } from "../../../core/auth/token.ts";
import { listMyActionResearchOptimized } from "./my-work.ts";
import {
  InvalidResearchProjectPageCursorError,
  listResearchProjectPage,
} from "./project-pagination.ts";
import {
  ActionResearchAuthorizationError,
  ActionResearchConflictError,
  ActionResearchNotFoundError,
  ActionResearchScopeMismatchError,
  assertCycleProgramme,
  assertProjectProgramme,
  assertProtocolProgramme,
  createResearchAssignment,
  createResearchProject,
  getResearchProject,
  listResearchAssignments,
  listResearchProjects,
  lockResearchBaseline,
  reviewResearchProtocol,
  saveResearchProtocol,
  submitResearchProtocol,
  updateResearchAssignmentStatus,
} from "./service.ts";

const MANAGER_ROLES = ["admin", "program_coordinator"] as const;
const PARTICIPANT_ROLES = [
  "admin",
  "program_coordinator",
  "lecturer",
  "qa_reviewer",
  "qa_contributor",
] as const;
const REVIEWER_ROLES = ["admin", "program_coordinator", "qa_reviewer"] as const;

function sendActionResearchError(res: Response, error: unknown): void {
  if (error instanceof InvalidResearchProjectPageCursorError) {
    res.status(400).json({ error: error.message });
    return;
  }
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
    error instanceof ActionResearchConflictError
  ) {
    res.status(409).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Could not complete the Action Research operation" });
}

function canManage(req: Parameters<typeof hasAnyRoleInProgramme>[0], programmeId: string): boolean {
  return hasAnyRoleInProgramme(req, [...MANAGER_ROLES], programmeId);
}

function canParticipate(req: Parameters<typeof hasAnyRoleInProgramme>[0], programmeId: string): boolean {
  return hasAnyRoleInProgramme(req, [...PARTICIPANT_ROLES], programmeId);
}

function canReview(req: Parameters<typeof hasAnyRoleInProgramme>[0], programmeId: string): boolean {
  return hasAnyRoleInProgramme(req, [...REVIEWER_ROLES], programmeId);
}

export function createActionResearchRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/action-research/projects/page", async (req, res) => {
    const parsed = ResearchProjectPageQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid Action Research project page query", details: parsed.error.flatten() });
      return;
    }
    if (!canManage(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "You cannot manage Action Research for this programme" });
      return;
    }
    try {
      res.json(await listResearchProjectPage(parsed.data));
    } catch (error) {
      sendActionResearchError(res, error);
    }
  });

  router.get("/action-research/projects", async (req, res) => {
    const parsed = ResearchProjectListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid Action Research query", details: parsed.error.flatten() });
      return;
    }
    if (!canManage(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "You cannot manage Action Research for this programme" });
      return;
    }
    try {
      res.json(await listResearchProjects(parsed.data.programmeId));
    } catch (error) {
      sendActionResearchError(res, error);
    }
  });

  router.post("/action-research/projects", async (req, res) => {
    const parsed = CreateResearchProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid Action Research project", details: parsed.error.flatten() });
      return;
    }
    if (!canManage(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "You cannot create Action Research for this programme" });
      return;
    }
    try {
      res.status(201).json(await createResearchProject(parsed.data, req.user!.id));
    } catch (error) {
      sendActionResearchError(res, error);
    }
  });

  router.get("/action-research/projects/:projectId", async (req, res) => {
    const projectId = req.params.projectId;
    const parsed = ResearchScopeSchema.safeParse(req.query);
    if (!projectId || !parsed.success) {
      res.status(400).json({ error: "Invalid Action Research project query" });
      return;
    }
    try {
      await assertProjectProgramme(projectId, parsed.data.programmeId);
      const project = await getResearchProject(projectId);
      const assigned = project.assignments.some((item) => item.assigneeId === req.user!.id);
      if (!canManage(req.user!, parsed.data.programmeId) && !assigned) {
        res.status(403).json({ error: "You are not assigned to this Action Research project" });
        return;
      }
      res.json(project);
    } catch (error) {
      sendActionResearchError(res, error);
    }
  });

  router.get("/action-research/projects/:projectId/assignments", async (req, res) => {
    const projectId = req.params.projectId;
    const parsed = ResearchScopeSchema.safeParse(req.query);
    if (!projectId || !parsed.success) {
      res.status(400).json({ error: "Invalid Action Research assignment query" });
      return;
    }
    if (!canManage(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "You cannot manage Action Research assignments" });
      return;
    }
    try {
      await assertProjectProgramme(projectId, parsed.data.programmeId);
      res.json(await listResearchAssignments(projectId));
    } catch (error) {
      sendActionResearchError(res, error);
    }
  });

  router.post("/action-research/projects/:projectId/assignments", async (req, res) => {
    const projectId = req.params.projectId;
    const parsed = CreateResearchAssignmentSchema.safeParse(req.body);
    if (!projectId || !parsed.success) {
      res.status(400).json({ error: "Invalid Action Research assignment", details: parsed.success ? undefined : parsed.error.flatten() });
      return;
    }
    if (!canManage(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "You cannot manage Action Research assignments" });
      return;
    }
    try {
      res.status(201).json(await createResearchAssignment(projectId, parsed.data, req.user!.id));
    } catch (error) {
      sendActionResearchError(res, error);
    }
  });

  router.get("/action-research/my-work", async (req, res) => {
    const parsed = ResearchProjectListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid Action Research work query", details: parsed.error.flatten() });
      return;
    }
    if (!canParticipate(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "You cannot access Action Research for this programme" });
      return;
    }
    try {
      res.json(await listMyActionResearchOptimized(parsed.data.programmeId, req.user!.id));
    } catch (error) {
      sendActionResearchError(res, error);
    }
  });

  router.patch("/action-research/assignments/:assignmentId/status", async (req, res) => {
    const assignmentId = req.params.assignmentId;
    const parsed = UpdateResearchAssignmentStatusSchema.safeParse(req.body);
    if (!assignmentId || !parsed.success) {
      res.status(400).json({ error: "Invalid assignment status update", details: parsed.success ? undefined : parsed.error.flatten() });
      return;
    }
    if (!canParticipate(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "You cannot update Action Research for this programme" });
      return;
    }
    try {
      res.json(await updateResearchAssignmentStatus(assignmentId, req.user!.id, parsed.data.status));
    } catch (error) {
      sendActionResearchError(res, error);
    }
  });

  router.put("/action-research/cycles/:cycleId/protocol", async (req, res) => {
    const cycleId = req.params.cycleId;
    const parsed = SaveResearchProtocolSchema.safeParse(req.body);
    if (!cycleId || !parsed.success) {
      res.status(400).json({ error: "Invalid research protocol", details: parsed.success ? undefined : parsed.error.flatten() });
      return;
    }
    if (!canParticipate(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "You cannot edit this research protocol" });
      return;
    }
    try {
      await assertCycleProgramme(cycleId, parsed.data.programmeId);
      res.json(await saveResearchProtocol(cycleId, parsed.data, req.user!.id));
    } catch (error) {
      sendActionResearchError(res, error);
    }
  });

  router.post("/action-research/cycles/:cycleId/protocol/submit", async (req, res) => {
    const cycleId = req.params.cycleId;
    const parsed = ResearchScopeSchema.safeParse(req.body);
    if (!cycleId || !parsed.success) {
      res.status(400).json({ error: "Invalid protocol submission" });
      return;
    }
    if (!canParticipate(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "You cannot submit this research protocol" });
      return;
    }
    try {
      res.json(await submitResearchProtocol(cycleId, parsed.data.programmeId, req.user!.id));
    } catch (error) {
      sendActionResearchError(res, error);
    }
  });

  router.post("/action-research/protocols/:protocolId/review", async (req, res) => {
    const protocolId = req.params.protocolId;
    const parsed = ReviewResearchProtocolSchema.safeParse(req.body);
    if (!protocolId || !parsed.success) {
      res.status(400).json({ error: "Invalid protocol review", details: parsed.success ? undefined : parsed.error.flatten() });
      return;
    }
    if (!canReview(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "You cannot review Action Research protocols for this programme" });
      return;
    }
    try {
      await assertProtocolProgramme(protocolId, parsed.data.programmeId);
      res.json(await reviewResearchProtocol(protocolId, parsed.data, req.user!.id));
    } catch (error) {
      sendActionResearchError(res, error);
    }
  });

  router.post("/action-research/cycles/:cycleId/baseline-lock", async (req, res) => {
    const cycleId = req.params.cycleId;
    const parsed = LockResearchBaselineSchema.safeParse(req.body);
    if (!cycleId || !parsed.success) {
      res.status(400).json({ error: "Invalid baseline lock", details: parsed.success ? undefined : parsed.error.flatten() });
      return;
    }
    if (!canReview(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "You cannot lock the baseline for this programme" });
      return;
    }
    try {
      res.status(201).json(await lockResearchBaseline(cycleId, parsed.data, req.user!.id));
    } catch (error) {
      sendActionResearchError(res, error);
    }
  });

  return router;
}