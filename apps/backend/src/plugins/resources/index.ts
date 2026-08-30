import { resourcesManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createResourceRouter } from "./router.ts";
import { resourceService, type ResourceService } from "./service.ts";

/** Programme resources/inventory foundation: catalogue, locations and responsibilities. */
export const resourcesPlugin: BackendPlugin<ResourceService> = {
  manifest: resourcesManifest,
  router: createResourceRouter(),
  service: resourceService,
};
