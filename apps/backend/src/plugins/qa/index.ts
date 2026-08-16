import { Router } from "express";
import { qaManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createQaActionRouter } from "./actions/router.ts";
import { createQaLlmRouter } from "./analysis/llm-router.ts";
import { createQaAssignmentsRouter } from "./assignments/router.ts";
import { createQaEvidenceLibraryRouter } from "./evidence/router.ts";
import { createQaEvaluationRouter } from "./evaluation/router.ts";
import { createQaPilotRouter } from "./evaluation/pilot-router.ts";
import { createQaReviewRouter } from "./reviews/router.ts";
import { createQaRouter } from "./router.ts";
import { createQaSarProgressRouter } from "./sar-review/progress-router.ts";
import { createQaSarReviewRouter } from "./sar-review/router.ts";
import { createQaSarRouter } from "./sar/router.ts";
import { qaService, type QaService } from "./service.ts";
import { createQaWorkspaceRouter } from "./workspace/router.ts";

const router = Router();
router.use(createQaRouter());
router.use(createQaAssignmentsRouter());
router.use(createQaEvidenceLibraryRouter());
router.use(createQaWorkspaceRouter());
router.use(createQaSarRouter());
router.use(createQaSarReviewRouter());
router.use(createQaSarProgressRouter());
router.use(createQaLlmRouter());
router.use(createQaReviewRouter());
router.use(createQaActionRouter());
router.use(createQaEvaluationRouter());
router.use(createQaPilotRouter());

export const qaPlugin: BackendPlugin<QaService> = {
  manifest: qaManifest,
  router,
  service: qaService,
};
