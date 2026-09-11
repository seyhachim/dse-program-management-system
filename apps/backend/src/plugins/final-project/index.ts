import { finalProjectManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createFinalProjectRouter } from "./router.ts";
import { finalProjectService, type FinalProjectService } from "./service.ts";

export const finalProjectPlugin: BackendPlugin<FinalProjectService> = {
  manifest: finalProjectManifest,
  router: createFinalProjectRouter(),
  service: finalProjectService,
};
