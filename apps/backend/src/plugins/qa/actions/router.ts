import { Router, type Response } from "express";
import {
  CarryForwardQaImprovementActionSchema,
  CreateQaImprovementActionSchema,
  QaImprovementActionListQuerySchema,
  UpdateQaImprovementActionSchema,
  CreateQaImprovementActionFollowUpSchema,
  QaImprovementActionFollowUpListQuerySchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../../core/auth/middleware.ts";
import { requirePermission } from "../../../core/permissions/index.ts";
import { canAccessQaProgramme } from "../router.ts";
import {
  QaImprovementActionEligibilityError,
  QaImprovementActionLifecycleError,
  QaImprovementActionResourceNotFoundError,
  QaImprovementActionScopeMismatchError,
  carryForwardQaImprovementAction,
  createQaImprovementAction,
  listQaImprovementActions,
  updateQaImprovementAction,
} from "./service.ts";
import { createQaImprovementActionFollowUp, listQaImprovementActionFollowUps } from "./follow-up-service.ts";

function sendActionError(res: Response, error: unknown) {
  if (error instanceof QaImprovementActionResourceNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof QaImprovementActionScopeMismatchError) {
    res.status(409).json({ error: error.message });
    return;
  }
  if (
    error instanceof QaImprovementActionEligibilityError ||
    error instanceof QaImprovementActionLifecycleError
  ) {
    res.status(422).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Could not complete the QA improvement action operation" });
}

export function createQaActionRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/actions", requirePermission("qa:read"), async (req, res) => {
    const parsed = QaImprovementActionListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid QA improvement action query", details: parsed.error.flatten() });
      return;
    }
    if (!req.user || !canAccessQaProgramme(req.user, parsed.data.programmeId)) {
      res.status(403).json({ error: "You do not have QA access to this programme" });
      return;
    }
    try {
      res.json(
        await listQaImprovementActions(parsed.data.programmeId, {
          cycleId: parsed.data.cycleId,
          status: parsed.data.status,
        }),
      );
    } catch (error) {
      sendActionError(res, error);
    }
  });

  router.post("/actions", requirePermission("qa:write"), async (req, res) => {
    const parsed = CreateQaImprovementActionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid QA improvement action", details: parsed.error.flatten() });
      return;
    }
    if (!req.user || !canAccessQaProgramme(req.user, parsed.data.programmeId)) {
      res.status(403).json({ error: "You do not have QA access to this programme" });
      return;
    }
    try {
      res.status(201).json(await createQaImprovementAction(parsed.data));
    } catch (error) {
      sendActionError(res, error);
    }
  });

  router.put("/actions/:actionId", requirePermission("qa:write"), async (req, res) => {
    const actionId = req.params.actionId;
    const parsed = UpdateQaImprovementActionSchema.safeParse(req.body);
    if (!actionId || !parsed.success) {
      res.status(400).json({
        error: "Invalid QA improvement action update",
        details: parsed.success ? undefined : parsed.error.flatten(),
      });
      return;
    }
    if (!req.user || !canAccessQaProgramme(req.user, parsed.data.programmeId)) {
      res.status(403).json({ error: "You do not have QA access to this programme" });
      return;
    }
    try {
      res.json(await updateQaImprovementAction(actionId, parsed.data));
    } catch (error) {
      sendActionError(res, error);
    }
  });

  router.post(
    "/actions/:actionId/carry-forward",
    requirePermission("qa:write"),
    async (req, res) => {
      const actionId = req.params.actionId;
      const parsed = CarryForwardQaImprovementActionSchema.safeParse(req.body);
      if (!actionId || !parsed.success) {
        res.status(400).json({
          error: "Invalid QA improvement action carry-forward request",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!req.user || !canAccessQaProgramme(req.user, parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have QA access to this programme" });
        return;
      }
      try {
        res.status(201).json(await carryForwardQaImprovementAction(actionId, parsed.data));
      } catch (error) {
        sendActionError(res, error);
      }
    },
  );

  router.get("/actions/:actionId/follow-ups", requirePermission("qa:read"), async (req, res) => {
    const actionId = req.params.actionId;
    const parsed = QaImprovementActionFollowUpListQuerySchema.safeParse(req.query);
    if (!actionId || !parsed.success) { res.status(400).json({ error: "Invalid follow-up query" }); return; }
    if (!req.user || !canAccessQaProgramme(req.user, parsed.data.programmeId)) { res.status(403).json({ error: "You do not have QA access to this programme" }); return; }
    try { res.json(await listQaImprovementActionFollowUps(actionId, parsed.data.programmeId)); }
    catch (error) { sendActionError(res, error); }
  });

  router.post("/actions/:actionId/follow-ups", requirePermission("qa:write"), async (req, res) => {
    const actionId = req.params.actionId;
    const parsed = CreateQaImprovementActionFollowUpSchema.safeParse(req.body);
    if (!actionId || !parsed.success) { res.status(400).json({ error: "Invalid follow-up evidence link", details: parsed.success ? undefined : parsed.error.flatten() }); return; }
    if (!req.user || !canAccessQaProgramme(req.user, parsed.data.programmeId)) { res.status(403).json({ error: "You do not have QA access to this programme" }); return; }
    try { res.status(201).json(await createQaImprovementActionFollowUp(actionId, parsed.data, req.user.id)); }
    catch (error) { sendActionError(res, error); }
  });

  return router;
}
