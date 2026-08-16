import { Router, type Response } from "express";
import {
  CreateQaEvaluationHumanRatingSchema,
  CreateQaEvaluationScenarioSchema,
  QaEvaluationRunQuerySchema,
  SetQaEvaluationGoldSchema,
} from "@dse-pms/shared-types";
import { requireAuth } from "../../../core/auth/middleware.ts";
import { requirePermission } from "../../../core/permissions/index.ts";
import {
  QaEvaluationIntegrityError,
  QaEvaluationResourceNotFoundError,
  QaEvaluationScopeMismatchError,
  createQaEvaluationHumanRating,
  createQaEvaluationScenario,
  exportQaEvaluationData,
  getQaEvaluationMetrics,
  listQaEvaluationRuns,
  listQaEvaluationScenarios,
  setQaEvaluationGold,
} from "./service.ts";

function sendEvaluationError(res: Response, error: unknown) {
  if (error instanceof QaEvaluationResourceNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof QaEvaluationScopeMismatchError) {
    res.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof QaEvaluationIntegrityError) {
    res.status(422).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Could not complete the QA research evaluation operation" });
}

export function createQaEvaluationRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/evaluation/scenarios", requirePermission("qa:read"), async (_req, res) => {
    try {
      res.json(await listQaEvaluationScenarios());
    } catch (error) {
      sendEvaluationError(res, error);
    }
  });

  router.post("/evaluation/scenarios", requirePermission("qa:write"), async (req, res) => {
    const parsed = CreateQaEvaluationScenarioSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid QA evaluation scenario", details: parsed.error.flatten() });
      return;
    }
    try {
      res.status(201).json(await createQaEvaluationScenario(parsed.data));
    } catch (error) {
      sendEvaluationError(res, error);
    }
  });

  router.put(
    "/evaluation/scenarios/:scenarioId/gold",
    requirePermission("qa:write"),
    async (req, res) => {
      const scenarioId = req.params.scenarioId;
      const parsed = SetQaEvaluationGoldSchema.safeParse(req.body);
      if (!scenarioId || !parsed.success) {
        res.status(400).json({
          error: "Invalid QA evaluation gold annotation",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      try {
        res.json(await setQaEvaluationGold(scenarioId, parsed.data, req.user!.id));
      } catch (error) {
        sendEvaluationError(res, error);
      }
    },
  );

  router.get("/evaluation/runs", requirePermission("qa:read"), async (req, res) => {
    const parsed = QaEvaluationRunQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid QA evaluation run query", details: parsed.error.flatten() });
      return;
    }
    try {
      res.json(await listQaEvaluationRuns(parsed.data));
    } catch (error) {
      sendEvaluationError(res, error);
    }
  });

  router.post(
    "/evaluation/runs/:runId/ratings",
    requirePermission("qa:write"),
    async (req, res) => {
      const runId = req.params.runId;
      const parsed = CreateQaEvaluationHumanRatingSchema.safeParse(req.body);
      if (!runId || !parsed.success) {
        res.status(400).json({
          error: "Invalid QA evaluation human rating",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      try {
        res.status(201).json(
          await createQaEvaluationHumanRating(runId, parsed.data, req.user!.id),
        );
      } catch (error) {
        sendEvaluationError(res, error);
      }
    },
  );

  router.get("/evaluation/metrics", requirePermission("qa:read"), async (req, res) => {
    const parsed = QaEvaluationRunQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid QA evaluation metrics query", details: parsed.error.flatten() });
      return;
    }
    try {
      res.json(await getQaEvaluationMetrics(parsed.data));
    } catch (error) {
      sendEvaluationError(res, error);
    }
  });

  router.get("/evaluation/export", requirePermission("qa:read"), async (_req, res) => {
    try {
      res.setHeader("Content-Disposition", 'attachment; filename="qa-evaluation-export.json"');
      res.json(await exportQaEvaluationData());
    } catch (error) {
      sendEvaluationError(res, error);
    }
  });

  return router;
}
