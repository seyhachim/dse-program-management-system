import { Router } from "express";
import { qaManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createQaLlmRouter } from "./analysis/llm-router.ts";
import { createQaAssignmentsRouter } from "./assignments/router.ts";
import { createQaReviewRouter } from "./reviews/router.ts";
import { createQaRouter } from "./router.ts";
import { qaService, type QaService } from "./service.ts";

const router = Router();
router.use(createQaRouter());
router.use(createQaAssignmentsRouter());
router.use(createQaLlmRouter());
router.use(createQaReviewRouter());

export const qaPlugin: BackendPlugin<QaService> = {
  manifest: qaManifest,
  router,
  service: qaService,
};
