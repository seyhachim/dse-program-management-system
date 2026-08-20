import { Router } from "express";
import type {
  CourseSectionPresence,
  OfferingsServiceContract,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { PROGRAMME_WIDE_ROLES } from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { registry } from "../../core/plugins/registry.ts";
import { courseService } from "./service.ts";

function offerings(): OfferingsServiceContract {
  return registry.get<OfferingsServiceContract>("offerings").service;
}

/**
 * Return global section-existence metadata only for courses the caller is
 * already authorized to see. Responsible Lecturers therefore learn whether a
 * class exists without receiving another lecturer's Offering details.
 */
export function createCourseSectionPresenceRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/section-presence",
    requirePermission("courses:read"),
    async (req, res) => {
      const lecturerScope = req.user!.roles.some((role) =>
        PROGRAMME_WIDE_ROLES.includes(role),
      )
        ? undefined
        : req.user!.id;

      const visibleCourses = await courseService.list({}, lecturerScope);
      const courseIds = visibleCourses.map((course) => course.id);
      const courseIdsWithSections = new Set(
        await offerings().courseIdsWithOfferings(courseIds),
      );

      const presence: CourseSectionPresence[] = courseIds.map((courseId) => ({
        courseId,
        hasSections: courseIdsWithSections.has(courseId),
      }));

      res.json(presence);
    },
  );

  return router;
}
