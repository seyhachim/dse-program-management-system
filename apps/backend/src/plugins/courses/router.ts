import { Router, type Request, type Response } from "express";
import {
  CreateCourseInput,
  CreateCourseSpecRevisionRequestSchema,
  ListCoursesQuery,
  SPEC_SECTION_SCHEMAS,
  UpdateCourseInput,
  type SpecSectionId,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme, PROGRAMME_WIDE_ROLES } from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { courseService, ReferenceError } from "./service.ts";
import { overlayCourseSpecTeachingAssignment } from "./teaching-assignment.ts";
import { CourseSpecLockedError } from "./spec-lock.ts";
import { canCreateCourseSpecRevision } from "./revision-authorization.ts";
import { courseSpecRevisionRequestService } from "./revision-request-service.ts";

/**
 * Get a required route parameter.
 */
function getRequiredParam(
  req: Request,
  res: Response,
  name: string,
): string | null {
  const value = req.params[name];

  if (!value || typeof value !== "string") {
    res.status(400).json({
      error: `${name} is required`,
    });
    return null;
  }

  return value;
}

/**
 * Get the authenticated user's ID.
 */
function getRequiredUserId(req: Request, res: Response): string | null {
  const userId = req.user?.id;

  if (!userId || typeof userId !== "string") {
    res.status(401).json({
      error: "Authenticated user is required",
    });
    return null;
  }

  return userId;
}

/**
 * Get the course owner scope.
 *
 * Programme-wide roles may access all courses, so they receive undefined.
 * Other authenticated users must have a valid user ID.
 */
function getOwnerScope(req: Request, res: Response): string | undefined | null {
  const isProgrammeWide = req.user!.roles.some((role) =>
    PROGRAMME_WIDE_ROLES.includes(role),
  );

  if (isProgrammeWide) {
    return undefined;
  }

  return getRequiredUserId(req, res);
}

/**
 * A lecturer may only see/edit courses they're assigned to; a caller holding
 * a programme-wide role for the course's own programme (globally, or scoped
 * to that specific programme — issue #147) may access any course in it.
 */
async function ensureCourseAccess(
  req: Request,
  res: Response,
  courseId: string,
): Promise<boolean> {
  const course = await courseService.getById(courseId);

  if (!course) {
    res.status(404).json({
      error: "Course not found",
    });
    return false;
  }

  if (hasAnyRoleInProgramme(req.user!, PROGRAMME_WIDE_ROLES, course.programmeId)) {
    return true;
  }

  const userId = req.user?.id;

  if (!userId) {
    res.status(401).json({
      error: "Authenticated user is required",
    });
    return false;
  }

  if (!(await courseService.lecturerCanAccess(courseId, userId))) {
    res.status(403).json({
      error: "You can only access your own courses",
    });
    return false;
  }

  return true;
}

/**
 * Course-specification content is editable only while the workflow is Draft
 * or Changes Requested. Programme-wide roles retain broad course access, but
 * they do not bypass content immutability once a specification enters review.
 */
async function ensureSpecEditable(
  req: Request,
  res: Response,
  courseId: string,
): Promise<boolean> {
  const spec = await courseService.getSpec(courseId);

  if (!spec) {
    res.status(404).json({
      error: "Course specification not found",
    });
    return false;
  }

  const reviewStatus = spec.review?.status;

  if (reviewStatus && !["draft", "changesRequested"].includes(reviewStatus)) {
    res.status(409).json({
      error:
        "Course specification is locked while it is in the review workflow",
    });
    return false;
  }

  return true;
}

export function createCourseRouter(): Router {
  const router = Router();

  router.use(requireAuth);

  // ---------------------------------------------------------------------------
  // Courses
  // ---------------------------------------------------------------------------

  router.get("/", requirePermission("courses:read"), async (req, res) => {
    const parsed = ListCoursesQuery.safeParse(req.query);

    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid query",
        details: parsed.error.flatten(),
      });
      return;
    }

    const ownerScope = getOwnerScope(req, res);

    if (ownerScope === null) {
      return;
    }

    res.json(await courseService.list(parsed.data, ownerScope));
  });

  /**
   * Static route registered before "/:id" so "spec-progress"
   * isn't swallowed as a course id.
   */
  router.get(
    "/spec-progress",
    requirePermission("courses:read"),
    async (req, res) => {
      const ownerScope = getOwnerScope(req, res);

      if (ownerScope === null) {
        return;
      }

      res.json(await courseService.listSpecProgress(ownerScope));
    },
  );

  router.get(
    "/:id/approved-spec-versions",
    requirePermission("courses:read"),
    async (req, res) => {
      const courseId = getRequiredParam(req, res, "id");
      if (!courseId) return;
      if (!(await ensureCourseAccess(req, res, courseId))) return;
      res.json(await courseService.listApprovedSpecVersions(courseId));
    },
  );


  router.post(
    "/:id/spec/revisions",
    requirePermission("courses:review"),
    async (req, res) => {
      const courseId = getRequiredParam(req, res, "id");
      if (!courseId) return;
      const requestedById = getRequiredUserId(req, res);
      if (!requestedById) return;

      const course = await courseService.getById(courseId);
      if (!course) {
        res.status(404).json({ error: "Course not found" });
        return;
      }
      if (!canCreateCourseSpecRevision(req.user!, course.programmeId)) {
        res.status(403).json({
          error: "Only programme academic leadership may create a course specification revision",
        });
        return;
      }

      const parsed = CreateCourseSpecRevisionRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid revision request",
          details: parsed.error.flatten(),
        });
        return;
      }

      try {
        res.status(201).json(
          await courseSpecRevisionRequestService.create(
            courseId,
            requestedById,
            parsed.data,
          ),
        );
      } catch (err) {
        const code = (err as { code?: string }).code;
        const status =
          code === "COURSE_NOT_FOUND" ? 404 :
          code === "INVALID_OVERRIDE" ? 400 :
          code === "SOURCE_NOT_APPROVED" || code === "OPEN_REVISION_EXISTS" ? 409 : 409;
        res.status(status).json({
          error: err instanceof Error ? err.message : "Could not create course specification revision",
        });
      }
    },
  );

  router.get("/:id", requirePermission("courses:read"), async (req, res) => {
    const courseId = getRequiredParam(req, res, "id");

    if (!courseId) {
      return;
    }

    if (!(await ensureCourseAccess(req, res, courseId))) {
      return;
    }

    const course = await courseService.getDetailed(courseId);

    if (!course) {
      res.status(404).json({
        error: "Course not found",
      });
      return;
    }

    res.json(course);
  });

  // ---------------------------------------------------------------------------
  // Course administration
  // ---------------------------------------------------------------------------

  router.post("/", requirePermission("courses:manage"), async (req, res) => {
    const parsed = CreateCourseInput.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid body",
        details: parsed.error.flatten(),
      });
      return;
    }

    try {
      res.status(201).json(await courseService.create(parsed.data));
    } catch (err) {
      res.status(errStatus(err)).json({
        error: errMessage(err, "code") ?? "Could not create course",
      });
    }
  });

  router.patch(
    "/:id",
    requirePermission("courses:manage"),
    async (req, res) => {
      const courseId = getRequiredParam(req, res, "id");

      if (!courseId) {
        return;
      }

      if (!(await ensureCourseAccess(req, res, courseId))) {
        return;
      }

      const parsed = UpdateCourseInput.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid body",
          details: parsed.error.flatten(),
        });
        return;
      }

      try {
        res.json(await courseService.update(courseId, parsed.data));
      } catch (err) {
        res.status(errStatus(err)).json({
          error: errMessage(err, "code") ?? "Could not update course",
        });
      }
    },
  );

  router.delete(
    "/:id",
    requirePermission("courses:manage"),
    async (req, res) => {
      const courseId = getRequiredParam(req, res, "id");

      if (!courseId) {
        return;
      }

      if (!(await ensureCourseAccess(req, res, courseId))) {
        return;
      }

      try {
        await courseService.remove(courseId);
        res.status(204).end();
      } catch {
        res.status(404).json({
          error: "Course not found",
        });
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Course Specification
  // ---------------------------------------------------------------------------

  router.get(
    "/:id/spec",
    requirePermission("courses:read"),
    async (req, res) => {
      const courseId = getRequiredParam(req, res, "id");

      if (!courseId) {
        return;
      }

      if (!(await ensureCourseAccess(req, res, courseId))) {
        return;
      }

      const spec = await courseService.getSpec(courseId);

      if (!spec) {
        res.status(404).json({
          error: "Course not found",
        });
        return;
      }

      // Not a security boundary (ensureCourseAccess already gated this
      // course) — just which Offering's teaching-assignment data to overlay.
      const course = await courseService.getById(courseId);
      const lecturerScope = hasAnyRoleInProgramme(
        req.user!,
        PROGRAMME_WIDE_ROLES,
        course?.programmeId ?? null,
      )
        ? undefined
        : req.user!.id;
      await overlayCourseSpecTeachingAssignment(
        spec,
        courseId,
        lecturerScope,
      );

      res.json(spec);
    },
  );

  // ---------------------------------------------------------------------------
  // Submit Course Specification
  // ---------------------------------------------------------------------------

  router.post(
    "/:id/spec/submit",
    requirePermission("courses:write"),
    async (req, res) => {
      const courseId = getRequiredParam(req, res, "id");

      if (!courseId) {
        return;
      }

      const userId = getRequiredUserId(req, res);

      if (!userId) {
        return;
      }

      if (!(await ensureCourseAccess(req, res, courseId))) {
        return;
      }

      const note = typeof req.body?.note === "string" ? req.body.note : "";

      try {
        res.json(await courseService.submitSpec(courseId, userId, note));
      } catch (err) {
        res.status(errStatus(err)).json({
          error: errMessage(err, "") ?? "Could not submit course specification",
        });
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Course Specification Review
  // ---------------------------------------------------------------------------

  router.post(
    "/:id/spec/review/request-changes",
    requirePermission("courses:review"),
    async (req, res) => {
      const courseId = getRequiredParam(req, res, "id");
      if (!courseId) return;
      const reviewerId = getRequiredUserId(req, res);
      if (!reviewerId) return;
      if (!(await ensureCourseAccess(req, res, courseId))) return;

      const note = typeof req.body?.note === "string" ? req.body.note : "";
      try {
        res.json(await courseService.requestSpecChanges(courseId, reviewerId, note));
      } catch (err) {
        res.status(errStatus(err)).json({
          error: errMessage(err, "") ?? "Could not request changes",
        });
      }
    },
  );

  router.post(
    "/:id/spec/review/approve",
    requirePermission("courses:review"),
    async (req, res) => {
      const courseId = getRequiredParam(req, res, "id");
      if (!courseId) return;
      const reviewerId = getRequiredUserId(req, res);
      if (!reviewerId) return;
      if (!(await ensureCourseAccess(req, res, courseId))) return;

      const note = typeof req.body?.note === "string" ? req.body.note : "";
      try {
        res.json(await courseService.approveSpec(courseId, reviewerId, note));
      } catch (err) {
        res.status(errStatus(err)).json({
          error: errMessage(err, "") ?? "Could not approve course specification",
        });
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Save Course Specification Section
  // ---------------------------------------------------------------------------

  router.put(
    "/:id/spec/:sectionId",
    requirePermission("courses:write"),
    async (req, res) => {
      const courseId = getRequiredParam(req, res, "id");

      if (!courseId) {
        return;
      }

      const sectionIdParam = getRequiredParam(req, res, "sectionId");

      if (!sectionIdParam) {
        return;
      }

      if (!(await ensureCourseAccess(req, res, courseId))) {
        return;
      }

      if (!(await ensureSpecEditable(req, res, courseId))) {
        return;
      }

      if (!(sectionIdParam in SPEC_SECTION_SCHEMAS)) {
        res.status(400).json({
          error: `Section "${sectionIdParam}" cannot be saved yet`,
        });
        return;
      }

      const sectionId = sectionIdParam as SpecSectionId;

      const schema = SPEC_SECTION_SCHEMAS[sectionId];

      if (!schema) {
        res.status(400).json({
          error: `Section "${sectionId}" cannot be saved yet`,
        });
        return;
      }

      const parsed = schema.safeParse(req.body);

      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid body",
          details: parsed.error.flatten(),
        });
        return;
      }

      try {
        res.json(
          await courseService.saveSection(courseId, sectionId, parsed.data),
        );
      } catch (err) {
        res.status(errStatus(err)).json({
          error: errMessage(err, "code") ?? "Could not save section",
        });
      }
    },
  );

  return router;
}

/**
 * Map service/Prisma errors to HTTP status.
 */
function errStatus(err: unknown): number {
  if (err instanceof CourseSpecLockedError) {
    return 409;
  }

  if (err instanceof ReferenceError) {
    return 400;
  }

  const code = (err as { code?: string }).code;

  if (code === "P2002") {
    return 409;
  }

  if (code === "P2025") {
    return 404;
  }

  return 409;
}

function errMessage(err: unknown, uniqueField: string): string | null {
  if (err instanceof CourseSpecLockedError) {
    return err.message;
  }

  if (err instanceof ReferenceError) {
    return err.message;
  }

  const code = (err as { code?: string }).code;

  if (code === "P2002") {
    return `A course with that ${uniqueField} already exists`;
  }

  if (code === "P2025") {
    return "Course not found";
  }

  return null;
}
