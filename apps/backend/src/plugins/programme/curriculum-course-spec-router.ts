import { Router } from "express";
import { BindCurriculumCourseSpecSchema } from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme, type AuthUser, type Role } from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import {
  CurriculumCourseSpecConflictError,
  CurriculumCourseSpecNotFoundError,
  CurriculumCourseSpecValidationError,
  curriculumCourseSpecService,
} from "./curriculum-course-spec-service.ts";

const READ_ROLES: Role[] = ["admin", "program_coordinator", "program_secretary", "qa_reviewer"];
const WRITE_ROLES: Role[] = ["admin", "program_coordinator"];

export function canReadCurriculumCourseSpecs(user: AuthUser, programmeId: string) {
  return hasAnyRoleInProgramme(user, READ_ROLES, programmeId);
}

export function canWriteCurriculumCourseSpecs(user: AuthUser, programmeId: string) {
  return hasAnyRoleInProgramme(user, WRITE_ROLES, programmeId);
}

function sendError(res: Parameters<Parameters<Router["get"]>[1]>[1], error: unknown) {
  if (error instanceof CurriculumCourseSpecNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof CurriculumCourseSpecConflictError) {
    res.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof CurriculumCourseSpecValidationError) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Could not manage curriculum CourseSpec bindings" });
}

export function createCurriculumCourseSpecRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/curricula/versions/:versionId/course-spec-bindings",
    requirePermission("programme:read"),
    async (req, res) => {
      const versionId = req.params.versionId;
      if (!versionId || !req.user) {
        res.status(400).json({ error: "Curriculum version id is required" });
        return;
      }
      try {
        const programmeId = await curriculumCourseSpecService.programmeId(versionId);
        if (!canReadCurriculumCourseSpecs(req.user, programmeId)) {
          res.status(403).json({ error: "No curriculum CourseSpec read access for this programme" });
          return;
        }
        res.json(await curriculumCourseSpecService.list(versionId));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.put(
    "/curricula/versions/:versionId/courses/:placementId/course-spec-version",
    requirePermission("programme:write"),
    async (req, res) => {
      const versionId = req.params.versionId;
      const placementId = req.params.placementId;
      if (!versionId || !placementId || !req.user) {
        res.status(400).json({ error: "Curriculum version and placement ids are required" });
        return;
      }
      const parsed = BindCurriculumCourseSpecSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid CourseSpec binding", details: parsed.error.flatten() });
        return;
      }
      try {
        const programmeId = await curriculumCourseSpecService.programmeId(versionId);
        if (!canWriteCurriculumCourseSpecs(req.user, programmeId)) {
          res.status(403).json({ error: "No curriculum CourseSpec write access for this programme" });
          return;
        }
        res.json(
          await curriculumCourseSpecService.bind(
            versionId,
            placementId,
            req.user.id,
            parsed.data,
          ),
        );
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  return router;
}
