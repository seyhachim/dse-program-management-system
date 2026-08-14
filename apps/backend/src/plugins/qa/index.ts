import { qaManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createQaRouter } from "./router.ts";
import { qaService, type QaService } from "./service.ts";

export const qaPlugin: BackendPlugin<QaService> = {
  manifest: qaManifest,
  router: createQaRouter(),
  service: qaService,
};
