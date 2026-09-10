import { Router } from "express";
import {
  ListLecturerWorkloadQuery,
  ListOfferingsQuery,
  ReplaceMeetingLecturerAssignmentsSchema,
  SubmitTeachingLeaveRequestSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme, PROGRAMME_WIDE_ROLES } from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import {
  MeetingLecturerAssignmentAuthorizationError,
  MeetingLecturerAssignmentNotFoundError,
  MeetingLecturerAssignmentValidationError,
  meetingLecturerAssignmentService,
} from "./meeting-lecturer-assignment-service.ts";
import { offeringService } from "./service.ts";

/**
 * Meeting-level lecturer scope must run before the legacy Offering router and
 * teaching-leave router. It narrows lecturer-facing schedule projections while
 * leaving programme-wide Offering views complete.
 */
export function createMeetingLecturerAssignmentRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  // Override the lecturer-scoped Offering list so Home/Overview derives next
  // class only from the signed-in lecturer's assigned recurring meetings.
  router.get("/", requirePermission("offerings:read"), async (req, res) => {
    const parsed = ListOfferingsQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    const lecturerScope = req.user!.roles.some((role) => PROGRAMME_WIDE_ROLES.includes(role))
      ? undefined
      : req.user!.id;
    const offerings = await offeringService.list(parsed.data, lecturerScope);
    res.json(await meetingLecturerAssignmentService.scopeOfferings(offerings, lecturerScope));
  });

  // Override the lecturer workload route so Teaching Schedule and scheduled
  // weekly hours use only explicitly assigned recurring meetings.
  router.get("/workload/me", requirePermission("offerings:read"), async (req, res) => {
    const parsed = ListLecturerWorkloadQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    const summary = await offeringService.workloadForLecturer(req.user!.id, parsed.data);
    res.json(await meetingLecturerAssignmentService.scopeWorkload(summary, req.user!.id));
  });

  // Defence in depth: even a direct API caller cannot request leave for a
  // recurring class time allocated to another lecturer. Invalid payloads fall
  // through so the canonical teaching-leave router keeps its existing 400 shape.
  router.post("/teaching-leave/requests", async (req, res, next) => {
    const parsed = SubmitTeachingLeaveRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      next();
      return;
    }
    try {
      await meetingLecturerAssignmentService.assertLecturerOwnsOccurrences(
        req.user!.id,
        parsed.data.occurrences,
      );
      next();
    } catch (error) {
      handleMeetingLecturerError(error, res);
    }
  });

  router.get(
    "/:id/meeting-lecturers",
    requirePermission("offerings:manage"),
    async (req, res) => {
      if (!(await assertProgrammeOfferingManager(req, res))) return;
      try {
        res.json(await meetingLecturerAssignmentService.get(req.params.id!));
      } catch (error) {
        handleMeetingLecturerError(error, res);
      }
    },
  );

  router.put(
    "/:id/meeting-lecturers",
    requirePermission("offerings:manage"),
    async (req, res) => {
      if (!(await assertProgrammeOfferingManager(req, res))) return;
      const parsed = ReplaceMeetingLecturerAssignmentsSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid meeting lecturer assignments",
          details: parsed.error.flatten(),
        });
        return;
      }
      try {
        res.json(
          await meetingLecturerAssignmentService.replace(
            req.params.id!,
            req.user!.id,
            parsed.data,
          ),
        );
      } catch (error) {
        handleMeetingLecturerError(error, res);
      }
    },
  );

  return router;
}

async function assertProgrammeOfferingManager(
  req: import("express").Request,
  res: import("express").Response,
): Promise<boolean> {
  const offering = await offeringService.getById(req.params.id!);
  if (!offering) {
    res.status(404).json({ error: "Offering not found" });
    return false;
  }
  if (!hasAnyRoleInProgramme(req.user!, PROGRAMME_WIDE_ROLES, offering.course?.programmeId ?? null)) {
    res.status(403).json({ error: "You cannot assign class times for another programme" });
    return false;
  }
  return true;
}

function handleMeetingLecturerError(
  error: unknown,
  res: import("express").Response,
): void {
  if (error instanceof MeetingLecturerAssignmentNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof MeetingLecturerAssignmentAuthorizationError) {
    res.status(403).json({ error: error.message });
    return;
  }
  if (error instanceof MeetingLecturerAssignmentValidationError) {
    res.status(400).json({ error: error.message });
    return;
  }
  console.error("Meeting lecturer assignment request failed", error);
  res.status(500).json({ error: "Could not complete the meeting lecturer assignment request" });
}
