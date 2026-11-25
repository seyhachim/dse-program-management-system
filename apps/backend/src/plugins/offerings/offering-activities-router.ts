import { Router, type Request, type Response } from "express";
import {
  CreateOfferingActivityInputSchema,
  UpdateOfferingActivityInputSchema,
  CreateVisitParticipantSchema,
  UpdateVisitParticipantSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { hasAnyRoleInProgramme, type AuthUser, type Role } from "../../core/auth/token.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { offeringService } from "./service.ts";
import { visitParticipantsService, VisitParticipantNotFoundError, VisitParticipantConflictError } from "./visit-participants-service.ts";
import {
  OfferingActivityConflictError,
  OfferingActivityNotFoundError,
  offeringActivitiesService,
} from "./offering-activities-service.ts";

const MANAGERS: Role[] = ["admin", "program_coordinator", "program_secretary"];
type ActivityScope = { programmeId: string | null; lecturerId: string | null; coLecturerIds: string[] };
export function canManageOfferingActivities(user: AuthUser, scope: ActivityScope): boolean {
  return hasAnyRoleInProgramme(user, MANAGERS, scope.programmeId) ||
    scope.lecturerId === user.id || scope.coLecturerIds.includes(user.id);
}
async function authorize(req: Request, res: Response): Promise<boolean> {
  const scope = await offeringService.accessScope(req.params.id!);
  if (!scope) {
    res.status(404).json({ error: "Offering not found" });
    return false;
  }
  if (!canManageOfferingActivities(req.user!, scope)) {
    res.status(403).json({ error: "Only the offering teaching team or programme managers can access course activities" });
    return false;
  }
  return true;
}
function fail(res: Response, error: unknown): void {
  if (error instanceof VisitParticipantNotFoundError || error instanceof OfferingActivityNotFoundError) {
    res.status(404).json({ error: error.message });
  } else if (error instanceof VisitParticipantConflictError || error instanceof OfferingActivityConflictError) {
    res.status(409).json({ error: error.message });
  } else if ((error as { code?: string }).code === "P2002") {
    res.status(409).json({ error: "Participant is already recorded for this visit" });
  } else if ((error as { code?: string }).code === "P2003") {
    res.status(404).json({ error: "Offering or user not found" });
  } else {
    console.error("Course activity request failed", error);
    res.status(500).json({ error: "Could not complete the course activity request" });
  }
}

export function createOfferingActivitiesRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/:id/activities", requirePermission("offerings:read"), async (req, res) => {
    try {
      if (!(await authorize(req, res))) return;
      res.json(await offeringActivitiesService.list(req.params.id!));
    } catch (error) { fail(res, error); }
  });

  router.post("/:id/activities", requirePermission("offerings:write"), async (req, res) => {
    const parsed = CreateOfferingActivityInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid course activity", details: parsed.error.flatten() });
      return;
    }
    try {
      if (!(await authorize(req, res))) return;
      res.status(201).json(await offeringActivitiesService.create(req.params.id!, req.user!.id, parsed.data));
    } catch (error) { fail(res, error); }
  });

  router.get("/:id/activities/:activityId", requirePermission("offerings:read"), async (req, res) => {
    try {
      if (!(await authorize(req, res))) return;
      res.json(await offeringActivitiesService.get(req.params.id!, req.params.activityId!));
    } catch (error) { fail(res, error); }
  });

  router.get("/:id/activities/:activityId/history", requirePermission("offerings:read"), async (req, res) => {
    try {
      if (!(await authorize(req, res))) return;
      res.json(await offeringActivitiesService.history(req.params.id!, req.params.activityId!));
    } catch (error) { fail(res, error); }
  });

  router.patch("/:id/activities/:activityId", requirePermission("offerings:write"), async (req, res) => {
    const parsed = UpdateOfferingActivityInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid course activity update", details: parsed.error.flatten() });
      return;
    }
    try {
      if (!(await authorize(req, res))) return;
      res.json(await offeringActivitiesService.update(
        req.params.id!, req.params.activityId!, req.user!.id, parsed.data,
      ));
    } catch (error) { fail(res, error); }
  });


  // Staff-only trip participation, separate from semester attendance.
  router.get("/:id/activities/:activityId/participants", requirePermission("offerings:read"), async (req, res) => {
    try {
      if (!(await authorize(req, res))) return;
      res.json(await visitParticipantsService.list(req.params.id!, req.params.activityId!));
    } catch (error) { fail(res, error); }
  });

  router.post("/:id/activities/:activityId/participants", requirePermission("offerings:write"), async (req, res) => {
    const parsed = CreateVisitParticipantSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid trip participation entry", details: parsed.error.flatten() });
    try {
      if (!(await authorize(req, res))) return;
      res.status(201).json(await visitParticipantsService.create(req.params.id!, req.params.activityId!, req.user!.id, parsed.data));
    } catch (error) { fail(res, error); }
  });

  router.patch("/:id/activities/:activityId/participants/:participantId", requirePermission("offerings:write"), async (req, res) => {
    const parsed = UpdateVisitParticipantSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid participant update", details: parsed.error.flatten() });
    try {
      if (!(await authorize(req, res))) return;
      res.json(await visitParticipantsService.update(
        req.params.id!, req.params.activityId!, req.params.participantId!, req.user!.id, parsed.data,
      ));
    } catch (error) { fail(res, error); }
  });

  return router;
}
