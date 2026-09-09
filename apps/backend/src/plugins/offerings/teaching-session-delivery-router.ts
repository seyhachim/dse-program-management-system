import { Router } from "express";
import {
  ResolveTeachingSessionOccurrenceInputSchema,
  SaveTeachingSessionDeliveryInputSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import {
  ClassResponsibilityEligibilityError,
  ClassResponsibilityNotFoundError,
} from "./class-responsibility-service.ts";
import {
  TeachingSessionOccurrenceReferenceError,
  TeachingSessionOccurrenceValidationError,
} from "./class-delivery-service.ts";
import {
  TeachingSessionDeliveryReferenceError,
  TeachingSessionDeliveryValidationError,
  teachingSessionDeliveryService,
} from "./teaching-session-delivery-service.ts";

export function createTeachingSessionDeliveryRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  // Student-facing read projection used only to decide whether the current user
  // should see monitor actions. The write endpoints below always revalidate the
  // canonical responsibility + active enrollment at mutation time.
  router.get("/monitor-assignments/me", async (req, res) => {
    try {
      res.json(await teachingSessionDeliveryService.listMonitorAssignments(req.user!.id));
    } catch (err) {
      handleMonitorDeliveryError(err, res);
    }
  });

  // This is intentionally PUT rather than GET because resolving an exact recurring
  // meeting/date materializes the canonical TeachingSessionOccurrence idempotently.
  router.put(
    "/:id/meetings/:meetingId/occurrences/:date/monitor-context",
    async (req, res) => {
      const parsed = ResolveTeachingSessionOccurrenceInputSchema.safeParse({
        offeringMeetingId: req.params.meetingId,
        date: req.params.date,
      });
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid teaching session occurrence",
          details: parsed.error.flatten(),
        });
        return;
      }
      try {
        res.json(
          await teachingSessionDeliveryService.monitorContext(
            req.params.id!,
            parsed.data.offeringMeetingId,
            parsed.data.date,
            req.user!.id,
          ),
        );
      } catch (err) {
        handleMonitorDeliveryError(err, res);
      }
    },
  );

  router.put(
    "/:id/meetings/:meetingId/occurrences/:date/monitor-delivery",
    async (req, res) => {
      const occurrence = ResolveTeachingSessionOccurrenceInputSchema.safeParse({
        offeringMeetingId: req.params.meetingId,
        date: req.params.date,
      });
      const body = SaveTeachingSessionDeliveryInputSchema.safeParse(req.body);
      if (!occurrence.success || !body.success) {
        res.status(400).json({
          error: "Invalid teaching session delivery",
          details: {
            occurrence: occurrence.success ? undefined : occurrence.error.flatten(),
            delivery: body.success ? undefined : body.error.flatten(),
          },
        });
        return;
      }
      try {
        res.json(
          await teachingSessionDeliveryService.saveMonitorDelivery(
            req.params.id!,
            occurrence.data.offeringMeetingId,
            occurrence.data.date,
            body.data,
            req.user!.id,
          ),
        );
      } catch (err) {
        handleMonitorDeliveryError(err, res);
      }
    },
  );

  return router;
}

function handleMonitorDeliveryError(
  err: unknown,
  res: import("express").Response,
): void {
  if (err instanceof ClassResponsibilityEligibilityError) {
    res.status(403).json({ error: err.message });
    return;
  }
  if (
    err instanceof ClassResponsibilityNotFoundError ||
    err instanceof TeachingSessionOccurrenceReferenceError ||
    err instanceof TeachingSessionDeliveryReferenceError
  ) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (
    err instanceof TeachingSessionOccurrenceValidationError ||
    err instanceof TeachingSessionDeliveryValidationError
  ) {
    res.status(400).json({ error: err.message });
    return;
  }
  const code = (err as { code?: string }).code;
  if (code === "P2002" || code === "23505") {
    res.status(409).json({ error: "Teaching session delivery changed concurrently" });
    return;
  }
  console.error("Monitor teaching session delivery request failed", err);
  res.status(500).json({ error: "Could not complete teaching session delivery request" });
}
