import { dashboardManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createDashboardRouter } from "./router.ts";
import { dashboardService, type DashboardService } from "./service.ts";

export const dashboardPlugin: BackendPlugin<DashboardService> = {
  manifest: dashboardManifest,
  router: createDashboardRouter(),
  service: dashboardService,
};
