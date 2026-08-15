import { Router } from "express";
import { RunQaLlmAnalysisSchema } from "@dse-pms/shared-types";
import { requireAuth } from "../../../core/auth/middleware.ts";
import { requirePermission } from "../../../core/permissions/index.ts";
import { canAccessQaProgramme } from "../router.ts";
import {
  QaAnalysisResourceNotFoundError,
  QaAnalysisScopeMismatchError,
} from "./service.ts";
import {
  QaLlmEvidenceContextUnavailableError,
  QaLlmOutputValidationError,
  QaLlmUnavailableError,
  runLlmAssistedQaAnalysis,
} from "./llm-engine.ts";
import { QaLlmProviderError } from "./llm-provider.ts";

export function createQaLlmRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.post(
    "/cycles/:cycleId/requirements/:requirementCode/llm-analysis",
    requirePermission("qa:write"),
    async (req, res) => {
      const cycleId = req.params.cycleId;
      const requirementCode = req.params.requirementCode;
      const parsed = RunQaLlmAnalysisSchema.safeParse(req.body);
      if (!cycleId || !requirementCode || !/^\d\.\d$/.test(requirementCode) || !parsed.success) {
        res.status(400).json({
          error: "Invalid LLM-assisted QA analysis request",
          details: parsed.success ? undefined : parsed.error.flatten(),
        });
        return;
      }
      if (!req.user || !canAccessQaProgramme(req.user, parsed.data.programmeId)) {
        res.status(403).json({ error: "You do not have QA access to this programme" });
        return;
      }

      try {
        res.status(201).json(
          await runLlmAssistedQaAnalysis(
            parsed.data.programmeId,
            cycleId,
            requirementCode,
          ),
        );
      } catch (error) {
        if (error instanceof QaLlmUnavailableError) {
          res.status(503).json({ error: error.message });
          return;
        }
        if (
          error instanceof QaLlmEvidenceContextUnavailableError ||
          error instanceof QaAnalysisScopeMismatchError
        ) {
          res.status(409).json({ error: error.message });
          return;
        }
        if (error instanceof QaAnalysisResourceNotFoundError) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error instanceof QaLlmProviderError || error instanceof QaLlmOutputValidationError) {
          res.status(502).json({ error: error.message });
          return;
        }
        res.status(500).json({ error: "Could not complete LLM-assisted QA analysis" });
      }
    },
  );

  return router;
}
