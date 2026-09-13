import { Router } from "express";
import { AttendanceDateSchema, RecheckAttendanceInput } from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme, type Role } from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import {
  AttendanceRecheckConflictError,
  attendanceRecheckService,
} from "./attendance-recheck-service.ts";
import { attendanceService } from "./attendance-service.ts";
import { offeringService, ReferenceError } from "./service.ts";

const ATTENDANCE_WIDE_ROLES: Role[] = ["admin", "program_coordinator", "program_secretary"];

export function createAttendanceRecheckRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/:id/attendance/students/:studentId/history",
    requirePermission("offerings:read"),
    async (req, res) => {
      if (!(await assertCanAccessAttendance(req, res, "view attendance history for"))) return;
      try {
        res.json(
          await attendanceRecheckService.history(req.params.id!, req.params.studentId!),
        );
      } catch (err) {
        handleAttendanceRecheckError(err, res, "Could not load student attendance history");
      }
    },
  );

  router.post(
    "/:id/attendance/:date/recheck",
    requirePermission("offerings:write"),
    async (req, res) => {
      if (!(await assertCanAccessAttendance(req, res, "recheck attendance for"))) return;
      const parsedDate = AttendanceDateSchema.safeParse(req.params.date);
      const parsedBody = RecheckAttendanceInput.safeParse(req.body);
      if (!parsedDate.success || !parsedBody.success) {
        res.status(400).json({
          error: "Invalid attendance recheck",
          details: parsedBody.success ? undefined : parsedBody.error.flatten(),
        });
        return;
      }
      try {
        await attendanceRecheckService.recheck(
          req.params.id!,
          parsedDate.data,
          parsedBody.data,
          req.user!.id,
        );
        res.json(await attendanceService.get(req.params.id!, parsedDate.data));
      } catch (err) {
        handleAttendanceRecheckError(err, res, "Could not recheck attendance");
      }
    },
  );

  return router;
}

async function assertCanAccessAttendance(
  req: import("express").Request,
  res: import("express").Response,
  action: string,
): Promise<boolean> {
  const offering = await offeringService.getById(req.params.id!);
  if (!offering) {
    res.status(404).json({ error: "Offering not found" });
    return false;
  }
  if (hasAnyRoleInProgramme(req.user!, ATTENDANCE_WIDE_ROLES, offering.course?.programmeId ?? null)) {
    return true;
  }
  const isAssigned =
    offering.lecturer?.id === req.user!.id ||
    offering.coLecturers.some((lecturer) => lecturer.id === req.user!.id);
  if (!isAssigned) {
    res.status(403).json({ error: `You can only ${action} your own offerings` });
    return false;
  }
  return true;
}

function handleAttendanceRecheckError(
  err: unknown,
  res: import("express").Response,
  fallback: string,
): void {
  if (err instanceof AttendanceRecheckConflictError) {
    res.status(409).json({ error: err.message });
    return;
  }
  if (err instanceof ReferenceError) {
    res.status(400).json({ error: err.message });
    return;
  }
  const code = (err as { code?: string }).code;
  if (code === "23505") {
    res.status(409).json({ error: "Check 2 has already been recorded for this student" });
    return;
  }
  console.error(fallback, err);
  res.status(500).json({ error: fallback });
}
