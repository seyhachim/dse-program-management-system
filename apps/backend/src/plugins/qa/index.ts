import { Router } from "express";
import { qaManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createQaLlmRouter } from "./analysis/llm-router.ts";
import { createQaRouter } from "./router.ts";
import { qaService, type QaService } from "./service.ts";

const router = Router();
router.use(createQaRouter());
router.use(createQaLlmRouter());

export const qaPlugin: BackendPlugin<QaService> = {
  manifest: qaManifest,
  router,
  service: qaService,
};
