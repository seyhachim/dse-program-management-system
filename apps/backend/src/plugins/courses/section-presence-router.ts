import { Router } from "express";
import type {
  CourseSectionPresence,
  OfferingsServiceContract,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import {
  hasAnyRoleInProgramme,
  PROGRAMME_WIDE_ROLES,
  type AuthUser,
} from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { registry } from "../../core/plugins/registry.ts";
import { courseService } from "./service.ts";

function offerings(): OfferingsServiceContract {
  return registry.get<OfferingsServiceContract>("offerings").service;
}

async function visibleCoursesForSectionPresence(user: AuthUser) {
  const programmeWideAssignments = user.programmeRoles.filter((assignment) =>
    PROGRAMME_WIDE_ROLES.includes(assignment.role),
  );

  if (
    programmeWideAssignments.some((assignment) => assignment.programmeId === null)
  ) {
    return courseService.list({}, undefined);
  }

  const lecturerVisible = await courseService.list({}, user.id);
  if (
    !programmeWideAssignments.some(
      (assignment) => assignment.programmeId !== null,
    )
  ) {
    return lecturerVisible;
  }

  const programmeVisible = (await courseService.list({}, undefined)).filter(
    (course) =>
      hasAnyRoleInProgramme(
        user,
        PROGRAMME_WIDE_ROLES,
        course.programmeId,
      ),
  );
  const visibleById = new Map(
    lecturerVisible.map((course) => [course.id, course]),
  );

  for (const course of programmeVisible) {
    visibleById.set(course.id, course);
  }

  return [...visibleById.values()].sort((a, b) =>
    a.code.localeCompare(b.code),
  );
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
      const visibleCourses = await visibleCoursesForSectionPresence(req.user!);
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
