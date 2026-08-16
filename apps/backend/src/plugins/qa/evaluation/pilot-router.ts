import { Router, type Response } from "express";
import { requireAuth } from "../../../core/auth/middleware.ts";
import { requirePermission } from "../../../core/permissions/index.ts";
import { QaLlmProviderError } from "../analysis/llm-provider.ts";
import { QaEvaluationResourceNotFoundError } from "./service.ts";
import { initializeQaPilotScenarios } from "./pilot-scenarios.ts";
import {
  QaPilotLlmOutputValidationError,
  QaPilotLlmUnavailableError,
  QaPilotReferenceRequiredError,
  QaPilotScenarioError,
  getQaPilotStatus,
  runDeterministicQaPilotScenario,
  runLlmQaPilotScenario,
} from "./pilot-runner.ts";

function sendPilotError(res: Response, error: unknown) {
  if (error instanceof QaEvaluationResourceNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof QaPilotReferenceRequiredError) {
    res.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof QaPilotScenarioError || error instanceof QaPilotLlmOutputValidationError) {
    res.status(422).json({ error: error.message });
    return;
  }
  if (error instanceof QaPilotLlmUnavailableError) {
    res.status(503).json({ error: error.message });
    return;
  }
  if (error instanceof QaLlmProviderError) {
    res.status(502).json({ error: error.message });
    return;
  }
  res.status(500).json({ error: "Could not complete the controlled QA pilot operation" });
}

export function createQaPilotRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/evaluation/pilot/status", requirePermission("qa:read"), async (_req, res) => {
    try {
      res.json(await getQaPilotStatus());
    } catch (error) {
      sendPilotError(res, error);
    }
  });

  router.post(
    "/evaluation/pilot/initialize",
    requirePermission("qa:write"),
    async (_req, res) => {
      try {
        res.status(201).json(await initializeQaPilotScenarios());
      } catch (error) {
        sendPilotError(res, error);
      }
    },
  );

  router.post(
    "/evaluation/pilot/scenarios/:scenarioId/run-deterministic",
    requirePermission("qa:write"),
    async (req, res) => {
      const scenarioId = req.params.scenarioId;
      if (!scenarioId) {
        res.status(400).json({ error: "Pilot scenario id is required" });
        return;
      }
      try {
        res.status(201).json(await runDeterministicQaPilotScenario(scenarioId));
      } catch (error) {
        sendPilotError(res, error);
      }
    },
  );

  router.post(
    "/evaluation/pilot/scenarios/:scenarioId/run-llm",
    requirePermission("qa:write"),
    async (req, res) => {
      const scenarioId = req.params.scenarioId;
      if (!scenarioId) {
        res.status(400).json({ error: "Pilot scenario id is required" });
        return;
      }
      try {
        res.status(201).json(await runLlmQaPilotScenario(scenarioId));
      } catch (error) {
        sendPilotError(res, error);
      }
    },
  );

  return router;
}
