import { Router, type NextFunction, type Request, type Response } from "express";
import {
  ListSupervisorDiscoveryQuery,
  ProgrammeSupervisorOverviewQuery,
  UpdateSupervisorProfileInput,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import {
  canEditOwnSupervisorProfile,
  canManageSupervisorOverview,
  canReadSupervisorDiscovery,
} from "./authorization.ts";
import { finalProjectService, FinalProjectNotFoundError } from "./service.ts";

export function createFinalProjectRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/supervisors", requireDiscoveryReader, async (req, res) => {
    const parsed = ListSupervisorDiscoveryQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    res.json(await finalProjectService.listPublished(parsed.data));
  });

  router.get("/supervisors/:lecturerId", requireDiscoveryReader, async (req, res) => {
    const programmeId = readProgrammeId(req);
    if (!programmeId) {
      res.status(400).json({ error: "programmeId is required" });
      return;
    }
    try {
      res.json(await finalProjectService.getPublished(programmeId, req.params.lecturerId!));
    } catch (err) {
      if (err instanceof FinalProjectNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.get("/supervisor-profile/me", requireLecturerOwner, async (req, res) => {
    const programmeId = readProgrammeId(req);
    if (!programmeId) {
      res.status(400).json({ error: "programmeId is required" });
      return;
    }
    res.json(await finalProjectService.getOwn(programmeId, req.user!.id));
  });

  router.put("/supervisor-profile/me", async (req, res) => {
    const parsed = UpdateSupervisorProfileInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    if (!canEditOwnSupervisorProfile(req.user!, parsed.data.programmeId, req.user!.id)) {
      res.status(403).json({ error: "Supervisor profile updates require the Lecturer role in this programme" });
      return;
    }
    res.json(await finalProjectService.upsertOwn(req.user!.id, parsed.data));
  });

  router.get("/supervisor-overview", requireProgrammeManager, async (req, res) => {
    const parsed = ProgrammeSupervisorOverviewQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    if (!canManageSupervisorOverview(req.user!, parsed.data.programmeId)) {
      res.status(403).json({ error: "Supervisor overview requires Admin or Programme Coordinator role in this programme" });
      return;
    }
    res.json(await finalProjectService.programmeOverview(parsed.data.programmeId));
  });

  return router;
}

function readProgrammeId(req: Request): string | null {
  const value = req.query.programmeId;
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function requireDiscoveryReader(req: Request, res: Response, next: NextFunction): void {
  const programmeId = readProgrammeId(req);
  if (!programmeId) {
    res.status(400).json({ error: "programmeId is required" });
    return;
  }
  if (canReadSupervisorDiscovery(req.user!, programmeId)) {
    next();
    return;
  }
  res.status(403).json({ error: "Final Project discovery is not available for this programme" });
}

function requireLecturerOwner(req: Request, res: Response, next: NextFunction): void {
  const programmeId = readProgrammeId(req);
  if (!programmeId) {
    res.status(400).json({ error: "programmeId is required" });
    return;
  }
  if (canEditOwnSupervisorProfile(req.user!, programmeId, req.user!.id)) {
    next();
    return;
  }
  res.status(403).json({ error: "Supervisor profile access requires the Lecturer role in this programme" });
}

function requireProgrammeManager(req: Request, res: Response, next: NextFunction): void {
  const programmeId = readProgrammeId(req);
  if (!programmeId) {
    res.status(400).json({ error: "programmeId is required" });
    return;
  }
  if (canManageSupervisorOverview(req.user!, programmeId)) {
    next();
    return;
  }
  res.status(403).json({ error: "Supervisor overview requires Admin or Programme Coordinator role in this programme" });
}
