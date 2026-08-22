import { graduationProjectsManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { graduationProjectsRouter } from "./router.ts";
import { graduationProjectsService, type GraduationProjectsService } from "./service.ts";

export const graduationProjectsPlugin: BackendPlugin<GraduationProjectsService> = {
  manifest: graduationProjectsManifest,
  router: graduationProjectsRouter,
  service: graduationProjectsService,
};
