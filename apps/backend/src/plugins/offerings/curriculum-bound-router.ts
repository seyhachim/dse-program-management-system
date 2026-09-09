import { Router } from "express";
import {
  CreateCurriculumBoundOfferingInputSchema,
  OfferingCurriculumPlacementsQuerySchema,
  OfferingCurriculumVersionsQuerySchema,
  UpdateCurriculumBoundOfferingInputSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme, PROGRAMME_WIDE_ROLES } from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import {
  CurriculumBoundOfferingConflictError,
  CurriculumBoundOfferingReferenceError,
  curriculumBoundOfferingService,
} from "./curriculum-bound-service.ts";
import { offeringService } from "./service.ts";

function handleError(error: unknown, res: import("express").Response): void {
  if (error instanceof CurriculumBoundOfferingConflictError) {
    res.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof CurriculumBoundOfferingReferenceError) {
    res.status(400).json({ error: error.message });
    return;
  }
  console.error("Curriculum-bound Offering request failed", error);
  res.status(500).json({ error: "Could not process curriculum-bound Offering request" });
}

function canManage(req: import("express").Request, programmeId: string): boolean {
  return Boolean(req.user && hasAnyRoleInProgramme(req.user, PROGRAMME_WIDE_ROLES, programmeId));
}

export function createCurriculumBoundOfferingRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/curriculum-versions",
    requirePermission("offerings:manage"),
    async (req, res) => {
      const parsed = OfferingCurriculumVersionsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid curriculum-version query", details: parsed.error.flatten() });
        return;
      }
      if (!canManage(req, parsed.data.programmeId)) {
        res.status(403).json({ error: "You cannot manage Offerings for another programme" });
        return;
      }
      try {
        res.json(await curriculumBoundOfferingService.listCurriculumVersions(parsed.data.programmeId));
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get(
    "/curriculum-placements",
    requirePermission("offerings:manage"),
    async (req, res) => {
      const parsed = OfferingCurriculumPlacementsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid curriculum-placement query", details: parsed.error.flatten() });
        return;
      }
      if (!canManage(req, parsed.data.programmeId)) {
        res.status(403).json({ error: "You cannot manage Offerings for another programme" });
        return;
      }
      try {
        res.json(
          await curriculumBoundOfferingService.listCurriculumPlacements(
            parsed.data.programmeId,
            parsed.data.curriculumVersionId,
            parsed.data.studyYear,
            parsed.data.semester,
          ),
        );
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.get(
    "/curriculum-binding/:id",
    requirePermission("offerings:manage"),
    async (req, res) => {
      const offering = await offeringService.getById(req.params.id!);
      if (!offering?.course) {
        res.status(404).json({ error: "Offering not found" });
        return;
      }
      if (!canManage(req, offering.course.programmeId)) {
        res.status(403).json({ error: "You cannot manage this Offering" });
        return;
      }
      try {
        const binding = await curriculumBoundOfferingService.getBinding(req.params.id!);
        if (!binding) {
          res.status(404).json({ error: "Offering has no pinned curriculum placement" });
          return;
        }
        res.json(binding);
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.post(
    "/curriculum-bound",
    requirePermission("offerings:manage"),
    async (req, res) => {
      const parsed = CreateCurriculumBoundOfferingInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid curriculum-bound Offering", details: parsed.error.flatten() });
        return;
      }
      const targetProgrammeId = await offeringService.programmeIdForCourse(parsed.data.offering.courseId);
      if (!targetProgrammeId) {
        res.status(400).json({ error: "Course does not exist" });
        return;
      }
      if (!canManage(req, targetProgrammeId)) {
        res.status(403).json({ error: "You cannot create Offerings for another programme" });
        return;
      }
      try {
        res.status(201).json(
          await curriculumBoundOfferingService.create(parsed.data, req.user!.id),
        );
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  router.patch(
    "/curriculum-bound/:id",
    requirePermission("offerings:manage"),
    async (req, res) => {
      const parsed = UpdateCurriculumBoundOfferingInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid curriculum-bound Offering update", details: parsed.error.flatten() });
        return;
      }
      const offering = await offeringService.getById(req.params.id!);
      if (!offering?.course) {
        res.status(404).json({ error: "Offering not found" });
        return;
      }
      if (!canManage(req, offering.course.programmeId)) {
        res.status(403).json({ error: "You cannot update this Offering" });
        return;
      }
      try {
        res.json(
          await curriculumBoundOfferingService.update(req.params.id!, parsed.data, req.user!.id),
        );
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  return router;
}
