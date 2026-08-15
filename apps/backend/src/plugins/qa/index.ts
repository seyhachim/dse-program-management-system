import { Router } from "express";
import { qaManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createQaLlmRouter } from "./analysis/llm-router.ts";
import { createQaAssignmentsRouter } from "./assignments/router.ts";
import { createQaEvidenceLibraryRouter } from "./evidence/router.ts";
import { createQaReviewRouter } from "./reviews/router.ts";
import { createQaRouter } from "./router.ts";
import { qaService, type QaService } from "./service.ts";
import { createQaWorkspaceRouter } from "./workspace/router.ts";

const router = Router();
router.use(createQaRouter());
router.use(createQaAssignmentsRouter());
router.use(createQaEvidenceLibraryRouter());
router.use(createQaWorkspaceRouter());
router.use(createQaLlmRouter());
router.use(createQaReviewRouter());

export const qaPlugin: BackendPlugin<QaService> = {
  manifest: qaManifest,
  router,
  service: qaService,
};
