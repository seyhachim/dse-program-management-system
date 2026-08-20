import { Router, type Response } from "express";
import {
  PublicQuestionEventFilterSchema,
  PublicQuestionReviewUpdateSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { hasPublicInfoManagementScope } from "./public-programme-info-router.ts";
import { publicQuestionAnalyticsService } from "./public-question-analytics-service.ts";

function programmeIdOr403(
  req: Parameters<Parameters<Router["get"]>[1]>[0],
  res: Response,
): string | null {
  const programmeId = req.params.programmeId;
  if (!programmeId) {
    res.status(400).json({ error: "Programme id is required" });
    return null;
  }
  if (!hasPublicInfoManagementScope(req.user, programmeId)) {
    res.status(403).json({ error: "No public-information analytics access for this programme" });
    return null;
  }
  return programmeId;
}

function sendError(res: Response, error: unknown, fallback: string): void {
  const message = error instanceof Error ? error.message : "";
  if (message === "Public question event not found") {
    res.status(404).json({ error: message });
    return;
  }
  console.error(fallback, error);
  res.status(500).json({ error: fallback });
}

export function createPublicQuestionAnalyticsRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    "/programmes/:programmeId/question-events",
    requirePermission("programme:read"),
    async (req, res) => {
      const programmeId = programmeIdOr403(req, res);
      if (!programmeId) return;
      const parsed = PublicQuestionEventFilterSchema.safeParse({
        state: typeof req.query.state === "string" ? req.query.state : undefined,
        q: typeof req.query.q === "string" ? req.query.q : undefined,
      });
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid question-event filters", details: parsed.error.flatten() });
        return;
      }
      try {
        res.json(await publicQuestionAnalyticsService.list(programmeId, parsed.data));
      } catch (error) {
        sendError(res, error, "Could not load Ask DSE information gaps");
      }
    },
  );

  router.patch(
    "/programmes/:programmeId/question-events/:id",
    requirePermission("programme:write"),
    async (req, res) => {
      const programmeId = programmeIdOr403(req, res);
      if (!programmeId) return;
      const eventId = req.params.id;
      if (!eventId) {
        res.status(400).json({ error: "Question event id is required" });
        return;
      }
      const parsed = PublicQuestionReviewUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid review state", details: parsed.error.flatten() });
        return;
      }
      try {
        await publicQuestionAnalyticsService.setReviewState(programmeId, eventId, parsed.data.state);
        res.status(204).send();
      } catch (error) {
        sendError(res, error, "Could not update Ask DSE information gap");
      }
    },
  );

  router.post(
    "/programmes/:programmeId/question-events/:id/faq-draft",
    requirePermission("programme:write"),
    async (req, res) => {
      const programmeId = programmeIdOr403(req, res);
      if (!programmeId) return;
      const eventId = req.params.id;
      if (!eventId) {
        res.status(400).json({ error: "Question event id is required" });
        return;
      }
      try {
        const result = await publicQuestionAnalyticsService.createFaqDraft(programmeId, eventId);
        res.status(result.created ? 201 : 200).json(result);
      } catch (error) {
        sendError(res, error, "Could not create FAQ draft from Ask DSE information gap");
      }
    },
  );

  return router;
}
