import { Router } from "express";
import { requireAuth } from "../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme, type AuthUser, type Role } from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { CurriculumNotFoundError } from "./curriculum-service.ts";
import { curriculumHistoryService } from "./curriculum-history-service.ts";

const HISTORY_READ_ROLES: Role[] = [
  "admin",
  "program_coordinator",
  "program_secretary",
  "qa_reviewer",
];

function canRead(user: AuthUser, programmeId: string) {
  return hasAnyRoleInProgramme(user, HISTORY_READ_ROLES, programmeId);
}

async function authorize(
  req: Parameters<Parameters<Router["get"]>[1]>[0],
  res: Parameters<Parameters<Router["get"]>[1]>[1],
  curriculumId: string,
) {
  if (!req.user) return false;
  try {
    const programmeId = await curriculumHistoryService.programmeId(curriculumId);
    if (!canRead(req.user, programmeId)) {
      res.status(403).json({ error: "No curriculum history access for this programme" });
      return false;
    }
    return true;
  } catch (error) {
    if (error instanceof CurriculumNotFoundError) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Could not resolve curriculum history scope" });
    }
    return false;
  }
}

export function createCurriculumHistoryRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/curricula/:curriculumId/history",
    requirePermission("programme:read"),
    async (req, res) => {
      const curriculumId = req.params.curriculumId;
      if (!curriculumId) return void res.status(400).json({ error: "Curriculum id is required" });
      if (!(await authorize(req, res, curriculumId))) return;
      try {
        res.json(await curriculumHistoryService.history(curriculumId));
      } catch (error) {
        if (error instanceof CurriculumNotFoundError) res.status(404).json({ error: error.message });
        else res.status(500).json({ error: "Could not load curriculum history" });
      }
    },
  );

  router.get(
    "/curricula/:curriculumId/compare",
    requirePermission("programme:read"),
    async (req, res) => {
      const curriculumId = req.params.curriculumId;
      const fromVersionId = typeof req.query.fromVersionId === "string" ? req.query.fromVersionId : "";
      const toVersionId = typeof req.query.toVersionId === "string" ? req.query.toVersionId : "";
      if (!curriculumId || !fromVersionId || !toVersionId) {
        res.status(400).json({ error: "Curriculum id and both version ids are required" });
        return;
      }
      if (!(await authorize(req, res, curriculumId))) return;
      try {
        res.json(await curriculumHistoryService.compare(curriculumId, fromVersionId, toVersionId));
      } catch (error) {
        if (error instanceof CurriculumNotFoundError) res.status(404).json({ error: error.message });
        else res.status(500).json({ error: "Could not compare curriculum versions" });
      }
    },
  );

  return router;
}
