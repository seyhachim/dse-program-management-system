import { Router } from "express";
import {
  AssignClassResponsibilityInput,
  AttendanceDateSchema,
  CreateOfferingInput,
  EnrollInput,
  ListLecturerWorkloadQuery,
  ListOfferingsQuery,
  RevokeClassResponsibilityInput,
  SaveAttendanceInput,
  UpdateOfferingInput,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme, PROGRAMME_WIDE_ROLES, type Role } from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { attendanceService } from "./attendance-service.ts";
import {
  ClassResponsibilityConflictError,
  ClassResponsibilityEligibilityError,
  ClassResponsibilityNotFoundError,
  classResponsibilityService,
} from "./class-responsibility-service.ts";
import { CapacityError, offeringService, ReferenceError } from "./service.ts";

export function createOfferingRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", requirePermission("offerings:read"), async (req, res) => {
    const parsed = ListOfferingsQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    // Lecturers only ever see offerings they're assigned to (primary or
    // co-lecturer) — issue #104. Programme-wide roles see everything.
    const ownerScope = req.user!.roles.some((r) => PROGRAMME_WIDE_ROLES.includes(r)) ? undefined : req.user!.id;
    res.json(await offeringService.list(parsed.data, ownerScope));
  });

  // Must stay before /:id so "workload" is never interpreted as an offering id.
  router.get("/workload/me", requirePermission("offerings:read"), async (req, res) => {
    const parsed = ListLecturerWorkloadQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    res.json(await offeringService.workloadForLecturer(req.user!.id, parsed.data));
  });

  router.get("/:id/responsibilities", async (req, res) => {
    try {
      if (!(await assertCanManageClassResponsibilities(req, res))) return;
      res.json(await classResponsibilityService.list(req.params.id!));
    } catch (err) {
      handleClassResponsibilityError(err, res);
    }
  });

  router.get("/:id/responsibilities/history", async (req, res) => {
    try {
      if (!(await assertCanManageClassResponsibilities(req, res))) return;
      res.json(await classResponsibilityService.history(req.params.id!));
    } catch (err) {
      handleClassResponsibilityError(err, res);
    }
  });

  router.post("/:id/responsibilities", async (req, res) => {
    const parsed = AssignClassResponsibilityInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid class responsibility", details: parsed.error.flatten() });
      return;
    }
    try {
      if (!(await assertCanManageClassResponsibilities(req, res))) return;
      res.status(201).json(
        await classResponsibilityService.assign(
          req.params.id!,
          parsed.data.studentId,
          parsed.data.role,
          req.user!.id,
        ),
      );
    } catch (err) {
      handleClassResponsibilityError(err, res);
    }
  });

  router.delete("/:id/responsibilities/:assignmentId", async (req, res) => {
    const parsed = RevokeClassResponsibilityInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "A revocation reason is required", details: parsed.error.flatten() });
      return;
    }
    try {
      if (!(await assertCanManageClassResponsibilities(req, res))) return;
      const changed = await classResponsibilityService.revoke(
        req.params.id!,
        req.params.assignmentId!,
        req.user!.id,
        parsed.data.reason,
      );
      if (!changed) {
        res.status(409).json({ error: "Class responsibility assignment is already revoked" });
        return;
      }
      res.status(204).end();
    } catch (err) {
      handleClassResponsibilityError(err, res);
    }
  });

  router.get("/:id/attendance", requirePermission("offerings:read"), async (req, res) => {
    if (!(await assertOwnOfferingOrAdmin(req, res, "view attendance for"))) return;
    res.json(await attendanceService.list(req.params.id!));
  });

  router.get("/:id/attendance/:date", requirePermission("offerings:read"), async (req, res) => {
    if (!(await assertOwnOfferingOrAdmin(req, res, "view attendance for"))) return;
    const parsedDate = AttendanceDateSchema.safeParse(req.params.date);
    if (!parsedDate.success) {
      res.status(400).json({ error: "Invalid attendance date" });
      return;
    }
    res.json(await attendanceService.get(req.params.id!, parsedDate.data));
  });

  router.put("/:id/attendance/:date", requirePermission("offerings:write"), async (req, res) => {
    if (!(await assertOwnOfferingOrAdmin(req, res, "record attendance for"))) return;
    const parsedDate = AttendanceDateSchema.safeParse(req.params.date);
    const parsedBody = SaveAttendanceInput.safeParse(req.body);
    if (!parsedDate.success || !parsedBody.success) {
      res.status(400).json({
        error: "Invalid attendance data",
        details: parsedBody.success ? undefined : parsedBody.error.flatten(),
      });
      return;
    }
    try {
      res.json(await attendanceService.save(req.params.id!, parsedDate.data, parsedBody.data, req.user!.id));
    } catch (err) {
      handleError(err, res, "Could not save attendance");
    }
  });

  router.get("/:id", requirePermission("offerings:read"), async (req, res) => {
    const offering = await offeringService.getById(req.params.id!);
    if (!offering) {
      res.status(404).json({ error: "Offering not found" });
      return;
    }
    // A lecturer may only fetch an offering they're assigned to (issue #104);
    // a caller holding a programme-wide role for the offering's own course's
    // programme (globally, or scoped to that programme — issue #147) may
    // fetch any offering in it.
    if (!hasAnyRoleInProgramme(req.user!, PROGRAMME_WIDE_ROLES, offering.course?.programmeId ?? null)) {
      const isAssigned =
        offering.lecturer?.id === req.user!.id || offering.coLecturers.some((c) => c.id === req.user!.id);
      if (!isAssigned) {
        res.status(403).json({ error: "You can only access your own offerings" });
        return;
      }
    }
    res.json(offering);
  });

  // Scheduling an offering (term, capacity, status, lecturer assignment) is
  // curriculum-admin work, not something a lecturer does for their own class.
  router.post("/", requirePermission("offerings:manage"), async (req, res) => {
    const parsed = CreateOfferingInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    const targetProgrammeId = await offeringService.programmeIdForCourse(parsed.data.courseId);
    if (!targetProgrammeId) {
      res.status(400).json({ error: "Course does not exist" });
      return;
    }
    if (!hasAnyRoleInProgramme(req.user!, PROGRAMME_WIDE_ROLES, targetProgrammeId)) {
      res.status(403).json({ error: "You cannot create offerings for another programme" });
      return;
    }
    try {
      res.status(201).json(await offeringService.create(parsed.data));
    } catch (err) {
      handleError(err, res, "Could not create offering");
    }
  });

  router.patch("/:id", requirePermission("offerings:manage"), async (req, res) => {
    if (!(await assertOwnOfferingOrAdmin(req, res, "update"))) return;
    const parsed = UpdateOfferingInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    try {
      res.json(await offeringService.update(req.params.id!, parsed.data));
    } catch (err) {
      handleError(err, res, "Could not update offering");
    }
  });

  router.delete("/:id", requirePermission("offerings:manage"), async (req, res) => {
    if (!(await assertOwnOfferingOrAdmin(req, res, "delete"))) return;
    try {
      await offeringService.remove(req.params.id!);
      res.status(204).end();
    } catch {
      res.status(404).json({ error: "Offering not found" });
    }
  });

  // Enrollment management (links Students <-> this offering). A lecturer may only
  // manage the roster of an offering they're assigned to; admins can manage any.
  router.post("/:id/enrollments", requirePermission("offerings:write"), async (req, res) => {
    if (!(await assertOwnOfferingOrAdmin(req, res))) return;
    const parsed = EnrollInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    try {
      res.status(201).json(await offeringService.enroll(req.params.id!, parsed.data));
    } catch (err) {
      handleError(err, res, "Could not enroll students");
    }
  });

  router.delete(
    "/:id/enrollments/:studentId",
    requirePermission("offerings:write"),
    async (req, res) => {
      if (!(await assertOwnOfferingOrAdmin(req, res))) return;
      try {
        res.json(await offeringService.unenroll(req.params.id!, req.params.studentId!));
      } catch (err) {
        handleError(err, res, "Could not unenroll student");
      }
    },
  );

  return router;
}

const CLASS_RESPONSIBILITY_ADMIN_ROLES: Role[] = ["admin", "program_coordinator"];
const OFFERING_ROSTER_WIDE_ROLES: Role[] = ["admin", "program_coordinator", "program_secretary"];

async function assertCanManageClassResponsibilities(
  req: import("express").Request,
  res: import("express").Response,
): Promise<boolean> {
  const programmeId = await classResponsibilityService.programmeIdForOffering(req.params.id!);
  if (!hasAnyRoleInProgramme(req.user!, CLASS_RESPONSIBILITY_ADMIN_ROLES, programmeId)) {
    res.status(403).json({ error: "Only an administrator or programme coordinator can manage class responsibilities" });
    return false;
  }
  return true;
}

/**
 * True (and untouched response) if the caller may manage this offering —
 * scheduling (PATCH/DELETE), its roster, or section delivery records: a
 * programme-wide role scoped to the offering's programme, the primary lecturer,
 * or an assigned co-lecturer.
 */
async function assertOwnOfferingOrAdmin(
  req: import("express").Request,
  res: import("express").Response,
  action = "manage enrollment for",
): Promise<boolean> {
  const offering = await offeringService.getById(req.params.id!);
  if (!offering) {
    res.status(404).json({ error: "Offering not found" });
    return false;
  }
  if (hasAnyRoleInProgramme(req.user!, OFFERING_ROSTER_WIDE_ROLES, offering.course?.programmeId ?? null)) {
    return true;
  }
  const isAssigned =
    offering.lecturer?.id === req.user!.id || offering.coLecturers.some((c) => c.id === req.user!.id);
  if (!isAssigned) {
    res.status(403).json({ error: `You can only ${action} your own offerings` });
    return false;
  }
  return true;
}

function handleClassResponsibilityError(err: unknown, res: import("express").Response): void {
  if (err instanceof ClassResponsibilityNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof ClassResponsibilityEligibilityError) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof ClassResponsibilityConflictError) {
    res.status(409).json({ error: err.message });
    return;
  }
  const code = (err as { code?: string }).code;
  if (code === "P2002" || code === "23505") {
    res.status(409).json({ error: "Another active class responsibility conflicts with this assignment" });
    return;
  }
  console.error("Class responsibility request failed", err);
  res.status(500).json({ error: "Could not complete the class responsibility request" });
}

function handleError(err: unknown, res: import("express").Response, fallback: string): void {
  if (err instanceof ReferenceError) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof CapacityError) {
    res.status(409).json({ error: err.message });
    return;
  }
  const code = (err as { code?: string }).code;
  if (code === "P2002") {
    res.status(409).json({ error: "That course, term, and class section already exist" });
    return;
  }
  if (code === "P2025") {
    res.status(404).json({ error: "Offering not found" });
    return;
  }
  res.status(409).json({ error: fallback });
}
