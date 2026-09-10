import { Router, type NextFunction, type Request, type Response } from "express";
import { UpsertFinalProjectSupervisorProfileInput } from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import type { AuthUser } from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { DEFAULT_PROGRAMME_ID } from "../../core/programme.ts";
import {
  canManageFinalProject,
  canReadFinalProject,
  canWriteOwnSupervisorProfile,
} from "./scope.ts";
import { finalProjectService } from "./service.ts";

type ScopeCheck = (user: AuthUser, programmeId: string) => boolean;

function requireScope(check: ScopeCheck, message: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (!check(user, DEFAULT_PROGRAMME_ID)) {
      res.status(403).json({ error: message });
      return;
    }
    next();
  };
}

export function createFinalProjectRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/discovery",
    requirePermission("final-project:read"),
    requireScope(canReadFinalProject, "Final Project access is not available in this programme"),
    async (_req, res, next) => {
      try {
        res.json(await finalProjectService.listDiscovery(DEFAULT_PROGRAMME_ID));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/me",
    requirePermission("final-project:write"),
    requireScope(canWriteOwnSupervisorProfile, "Lecturer role is required in this programme"),
    async (req, res, next) => {
      try {
        res.json(await finalProjectService.getOwnProfile(req.user!.id, DEFAULT_PROGRAMME_ID));
      } catch (error) {
        next(error);
      }
    },
  );

  router.put(
    "/me",
    requirePermission("final-project:write"),
    requireScope(canWriteOwnSupervisorProfile, "Lecturer role is required in this programme"),
    async (req, res, next) => {
      const parsed = UpsertFinalProjectSupervisorProfileInput.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      try {
        res.json(
          await finalProjectService.upsertOwnProfile(
            req.user!.id,
            DEFAULT_PROGRAMME_ID,
            parsed.data,
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/overview",
    requirePermission("final-project:manage"),
    requireScope(canManageFinalProject, "Programme final-project management access is required"),
    async (_req, res, next) => {
      try {
        res.json(await finalProjectService.overview(DEFAULT_PROGRAMME_ID));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
