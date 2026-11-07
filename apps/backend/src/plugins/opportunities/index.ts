import { opportunitiesManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createOpportunitiesRouter } from "./router.ts";
import { opportunitiesService } from "./service.ts";

export const opportunitiesPlugin: BackendPlugin<typeof opportunitiesService> = {
  manifest: opportunitiesManifest,
  router: createOpportunitiesRouter(),
  service: opportunitiesService,
};
