import { Router } from "express";
import {
  AddCurriculumCourseSchema,
  RemoveCurriculumCourseSchema,
  ReorderCurriculumCoursesSchema,
  UpdateCurriculumCourseSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme } from "../../core/auth/token.ts";
import { prisma } from "../../core/db/prisma.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import {
  CurriculumDraftConflictError,
  CurriculumDraftMutationError,
  CurriculumDraftNotFoundError,
  curriculumDraftService,
} from "./curriculum-draft-service.ts";

const WRITE_ROLES = ["admin", "program_coordinator"] as const;

function canWriteProgramme(
  user: NonNullable<Express.Request["user"]>,
  programmeId: string,
) {
  return hasAnyRoleInProgramme(user, [...WRITE_ROLES], programmeId);
}

async function getPlacementScope(placementId: string) {
  const placement = await prisma.programmeCurriculumCourse.findUnique({
    where: { id: placementId },
    select: {
      curriculumVersion: {
        select: {
          id: true,
          curriculum: { select: { programmeId: true } },
        },
      },
    },
  });
  return placement
    ? {
        versionId: placement.curriculumVersion.id,
        programmeId: placement.curriculumVersion.curriculum.programmeId,
      }
    : null;
}

function sendError(res: Parameters<Parameters<Router["post"]>[1]>[1], error: unknown) {
  if (error instanceof CurriculumDraftNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof CurriculumDraftConflictError) {
    res.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof CurriculumDraftMutationError) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Could not update curriculum draft" });
}

export function createCurriculumDraftRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.post(
    "/curricula/versions/:versionId/courses",
    requirePermission("programme:write"),
    async (req, res) => {
      if (!req.user) return;
      const versionId = req.params.versionId;
      if (!versionId) {
        res.status(400).json({ error: "Curriculum version id is required" });
        return;
      }
      const parsed = AddCurriculumCourseSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid curriculum course", details: parsed.error.flatten() });
        return;
      }
      try {
        const context = await curriculumDraftService.getDraftContext(versionId);
        if (!canWriteProgramme(req.user, context.curriculum.programmeId)) {
          res.status(403).json({ error: "No curriculum write access for this programme" });
          return;
        }
        res.status(201).json(await curriculumDraftService.addCourse(versionId, req.user.id, parsed.data));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.patch(
    "/curricula/versions/:versionId/courses/:placementId",
    requirePermission("programme:write"),
    async (req, res) => {
      if (!req.user) return;
      const versionId = req.params.versionId;
      const placementId = req.params.placementId;
      if (!versionId || !placementId) {
        res.status(400).json({ error: "Curriculum version and placement ids are required" });
        return;
      }
      const parsed = UpdateCurriculumCourseSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid curriculum course update", details: parsed.error.flatten() });
        return;
      }
      try {
        const context = await curriculumDraftService.getDraftContext(versionId);
        const placementScope = await getPlacementScope(placementId);
        if (!placementScope) {
          res.status(404).json({ error: "Curriculum course placement not found" });
          return;
        }
        if (placementScope.versionId !== versionId) {
          res.status(409).json({ error: "Placement does not belong to the selected curriculum version" });
          return;
        }
        if (
          placementScope.programmeId !== context.curriculum.programmeId ||
          !canWriteProgramme(req.user, placementScope.programmeId)
        ) {
          res.status(403).json({ error: "No curriculum write access for this placement" });
          return;
        }
        res.json(await curriculumDraftService.updateCourse(placementId, req.user.id, parsed.data));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.delete(
    "/curricula/versions/:versionId/courses/:placementId",
    requirePermission("programme:write"),
    async (req, res) => {
      if (!req.user) return;
      const versionId = req.params.versionId;
      const placementId = req.params.placementId;
      if (!versionId || !placementId) {
        res.status(400).json({ error: "Curriculum version and placement ids are required" });
        return;
      }
      const parsed = RemoveCurriculumCourseSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Removal reason is required", details: parsed.error.flatten() });
        return;
      }
      try {
        const context = await curriculumDraftService.getDraftContext(versionId);
        const placementScope = await getPlacementScope(placementId);
        if (!placementScope) {
          res.status(404).json({ error: "Curriculum course placement not found" });
          return;
        }
        if (placementScope.versionId !== versionId) {
          res.status(409).json({ error: "Placement does not belong to the selected curriculum version" });
          return;
        }
        if (
          placementScope.programmeId !== context.curriculum.programmeId ||
          !canWriteProgramme(req.user, placementScope.programmeId)
        ) {
          res.status(403).json({ error: "No curriculum write access for this placement" });
          return;
        }
        res.json(await curriculumDraftService.removeCourse(placementId, req.user.id, parsed.data.reason));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.put(
    "/curricula/versions/:versionId/reorder",
    requirePermission("programme:write"),
    async (req, res) => {
      if (!req.user) return;
      const versionId = req.params.versionId;
      if (!versionId) {
        res.status(400).json({ error: "Curriculum version id is required" });
        return;
      }
      const parsed = ReorderCurriculumCoursesSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid curriculum reorder", details: parsed.error.flatten() });
        return;
      }
      try {
        const context = await curriculumDraftService.getDraftContext(versionId);
        if (!canWriteProgramme(req.user, context.curriculum.programmeId)) {
          res.status(403).json({ error: "No curriculum write access for this programme" });
          return;
        }
        res.json(await curriculumDraftService.reorderCourses(versionId, req.user.id, parsed.data));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  return router;
}
