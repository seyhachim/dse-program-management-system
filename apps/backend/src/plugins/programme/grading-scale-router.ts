import {
  ApproveProgrammeGradingScaleSchema,
  BindCourseSpecGradingScaleSchema,
  CreateProgrammeGradingScaleRevisionSchema,
  CreateProgrammeGradingScaleSchema,
  UpdateProgrammeGradingScaleDraftSchema,
} from "@dse-pms/shared-types";
import { Router, type Response } from "express";
import { requireAuth } from "../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme, type AuthUser, type Role } from "../../core/auth/token.ts";
import { prisma } from "../../core/db/prisma.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { DEFAULT_PROGRAMME_ID } from "../../core/programme.ts";
import { GradingScaleValidationError } from "./grading-scale-domain.ts";
import {
  GradingScaleAuthorizationError,
  GradingScaleConflictError,
  GradingScaleNotFoundError,
  gradingScaleService,
} from "./grading-scale-service.ts";

const PROGRAMME_MANAGERS: Role[] = ["admin", "program_coordinator"];
const COURSE_SPEC_GRADING_SCALE_READERS: Role[] = [
  "admin",
  "program_coordinator",
  "program_secretary",
  "lecturer",
  "qa_reviewer",
];

export function canManageGradingScales(
  user: AuthUser,
  programmeId: string,
): boolean {
  return hasAnyRoleInProgramme(user, PROGRAMME_MANAGERS, programmeId);
}

export function canReadCourseSpecGradingScale(
  user: AuthUser,
  programmeId: string,
): boolean {
  return hasAnyRoleInProgramme(
    user,
    COURSE_SPEC_GRADING_SCALE_READERS,
    programmeId,
  );
}

export function isCourseSpecReadableGradingScaleStatus(status: string): boolean {
  return status === "Approved" || status === "Superseded";
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof GradingScaleNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof GradingScaleAuthorizationError) {
    res.status(403).json({ error: error.message });
    return;
  }
  if (error instanceof GradingScaleConflictError) {
    res.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof GradingScaleValidationError) {
    res.status(400).json({ error: error.message });
    return;
  }
  console.error("Programme grading-scale request failed", error);
  res.status(500).json({ error: "Could not update programme grading scale" });
}

async function programmeForScale(scaleId: string): Promise<string | null> {
  const scale = await prisma.programmeGradingScale.findUnique({
    where: { id: scaleId },
    select: { programmeId: true },
  });
  return scale?.programmeId ?? null;
}

async function programmeForVersion(versionId: string): Promise<string | null> {
  const version = await prisma.programmeGradingScaleVersion.findUnique({
    where: { id: versionId },
    select: { gradingScale: { select: { programmeId: true } } },
  });
  return version?.gradingScale.programmeId ?? null;
}

async function programmeForCourse(courseId: string): Promise<string | null> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { programmeId: true },
  });
  return course?.programmeId ?? null;
}

export function createGradingScaleRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/grading-scales",
    requirePermission("programme:read"),
    async (req, res) => {
      if (!req.user) return void res.status(401).json({ error: "Not authenticated" });
      const programmeId =
        typeof req.query.programmeId === "string"
          ? req.query.programmeId
          : DEFAULT_PROGRAMME_ID;
      if (!canManageGradingScales(req.user, programmeId)) {
        return void res.status(403).json({
          error: "Only programme managers can browse grading-scale versions",
        });
      }
      try {
        res.json(await gradingScaleService.list(programmeId));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.post(
    "/grading-scales",
    requirePermission("programme:write"),
    async (req, res) => {
      if (!req.user) return void res.status(401).json({ error: "Not authenticated" });
      const parsed = CreateProgrammeGradingScaleSchema.safeParse(req.body);
      if (!parsed.success) {
        return void res.status(400).json({
          error: "Invalid grading scale",
          details: parsed.error.flatten(),
        });
      }
      if (!canManageGradingScales(req.user, parsed.data.programmeId)) {
        return void res.status(403).json({ error: "No grading-scale write access for this programme" });
      }
      try {
        res.status(201).json(await gradingScaleService.create(req.user.id, parsed.data));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.get(
    "/grading-scales/versions/:versionId",
    requirePermission("programme:read"),
    async (req, res) => {
      if (!req.user) return void res.status(401).json({ error: "Not authenticated" });
      const versionId = req.params.versionId;
      if (!versionId) return void res.status(400).json({ error: "Version id is required" });
      const programmeId = await programmeForVersion(versionId);
      if (!programmeId) return void res.status(404).json({ error: "Grading-scale version not found" });
      if (!canManageGradingScales(req.user, programmeId)) {
        return void res.status(403).json({
          error: "Only programme managers can view grading-scale versions directly",
        });
      }
      try {
        res.json(await gradingScaleService.getVersion(versionId));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.post(
    "/grading-scales/:gradingScaleId/revisions",
    requirePermission("programme:write"),
    async (req, res) => {
      if (!req.user) return void res.status(401).json({ error: "Not authenticated" });
      const gradingScaleId = req.params.gradingScaleId;
      if (!gradingScaleId) return void res.status(400).json({ error: "Grading scale id is required" });
      const parsed = CreateProgrammeGradingScaleRevisionSchema.safeParse(req.body);
      if (!parsed.success) {
        return void res.status(400).json({ error: "Invalid revision", details: parsed.error.flatten() });
      }
      const programmeId = await programmeForScale(gradingScaleId);
      if (!programmeId) return void res.status(404).json({ error: "Grading scale not found" });
      if (!canManageGradingScales(req.user, programmeId)) {
        return void res.status(403).json({ error: "No grading-scale write access for this programme" });
      }
      try {
        res.status(201).json(
          await gradingScaleService.createRevision(
            gradingScaleId,
            req.user.id,
            parsed.data,
          ),
        );
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.put(
    "/grading-scales/versions/:versionId",
    requirePermission("programme:write"),
    async (req, res) => {
      if (!req.user) return void res.status(401).json({ error: "Not authenticated" });
      const versionId = req.params.versionId;
      if (!versionId) return void res.status(400).json({ error: "Version id is required" });
      const parsed = UpdateProgrammeGradingScaleDraftSchema.safeParse(req.body);
      if (!parsed.success) {
        return void res.status(400).json({ error: "Invalid grading-scale draft", details: parsed.error.flatten() });
      }
      const programmeId = await programmeForVersion(versionId);
      if (!programmeId) return void res.status(404).json({ error: "Grading-scale version not found" });
      if (!canManageGradingScales(req.user, programmeId)) {
        return void res.status(403).json({ error: "No grading-scale write access for this programme" });
      }
      try {
        res.json(await gradingScaleService.updateDraft(versionId, req.user.id, parsed.data));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.post(
    "/grading-scales/versions/:versionId/approve",
    requirePermission("programme:write"),
    async (req, res) => {
      if (!req.user) return void res.status(401).json({ error: "Not authenticated" });
      const versionId = req.params.versionId;
      if (!versionId) return void res.status(400).json({ error: "Version id is required" });
      const parsed = ApproveProgrammeGradingScaleSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return void res.status(400).json({ error: "Invalid approval", details: parsed.error.flatten() });
      }
      const programmeId = await programmeForVersion(versionId);
      if (!programmeId) return void res.status(404).json({ error: "Grading-scale version not found" });
      if (!canManageGradingScales(req.user, programmeId)) {
        return void res.status(403).json({ error: "No grading-scale approval access for this programme" });
      }
      try {
        res.json(await gradingScaleService.approve(versionId, req.user.id, parsed.data));
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.get(
    "/grading-scales/course-specs/:courseId/versions/:courseSpecId",
    requirePermission("programme:read"),
    async (req, res) => {
      if (!req.user) return void res.status(401).json({ error: "Not authenticated" });
      const courseId = req.params.courseId;
      const courseSpecId = req.params.courseSpecId;
      if (!courseId || !courseSpecId) {
        return void res.status(400).json({ error: "Course id and Course Specification id are required" });
      }

      const spec = await prisma.courseSpec.findFirst({
        where: { id: courseSpecId, courseId },
        select: {
          id: true,
          gradingScaleVersionId: true,
          course: { select: { programmeId: true } },
        },
      });
      if (!spec) {
        return void res.status(404).json({ error: "Course Specification version not found" });
      }
      if (!canReadCourseSpecGradingScale(req.user, spec.course.programmeId)) {
        return void res.status(403).json({ error: "No grading-scale access for this programme" });
      }

      try {
        const gradingScaleVersion = spec.gradingScaleVersionId
          ? await gradingScaleService.getVersion(spec.gradingScaleVersionId)
          : null;
        res.json({
          courseId,
          courseSpecId: spec.id,
          gradingScaleVersion:
            gradingScaleVersion &&
            isCourseSpecReadableGradingScaleStatus(gradingScaleVersion.status)
              ? gradingScaleVersion
              : null,
        });
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.get(
    "/grading-scales/course-specs/:courseId",
    requirePermission("programme:read"),
    async (req, res) => {
      if (!req.user) return void res.status(401).json({ error: "Not authenticated" });
      const courseId = req.params.courseId;
      if (!courseId) return void res.status(400).json({ error: "Course id is required" });
      const programmeId = await programmeForCourse(courseId);
      if (!programmeId) return void res.status(404).json({ error: "Course not found" });
      if (!canReadCourseSpecGradingScale(req.user, programmeId)) {
        return void res.status(403).json({ error: "No grading-scale access for this programme" });
      }
      try {
        const binding = await gradingScaleService.courseBinding(courseId);
        res.json({
          ...binding,
          gradingScaleVersion:
            binding.gradingScaleVersion &&
            isCourseSpecReadableGradingScaleStatus(
              binding.gradingScaleVersion.status,
            )
              ? binding.gradingScaleVersion
              : null,
        });
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  router.put(
    "/grading-scales/course-specs/:courseId",
    requirePermission("programme:write"),
    async (req, res) => {
      if (!req.user) return void res.status(401).json({ error: "Not authenticated" });
      const courseId = req.params.courseId;
      if (!courseId) return void res.status(400).json({ error: "Course id is required" });
      const parsed = BindCourseSpecGradingScaleSchema.safeParse(req.body);
      if (!parsed.success) {
        return void res.status(400).json({ error: "Invalid grading-scale binding", details: parsed.error.flatten() });
      }
      const programmeId = await programmeForCourse(courseId);
      if (!programmeId) return void res.status(404).json({ error: "Course not found" });
      if (!canManageGradingScales(req.user, programmeId)) {
        return void res.status(403).json({ error: "Only programme managers can select a grading-scale version" });
      }
      try {
        res.json(
          await gradingScaleService.bindCourseSpec(
            courseId,
            parsed.data.gradingScaleVersionId,
          ),
        );
      } catch (error) {
        sendError(res, error);
      }
    },
  );

  return router;
}
