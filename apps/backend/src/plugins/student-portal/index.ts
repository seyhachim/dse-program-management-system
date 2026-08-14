import { studentPortalManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createStudentPortalRouter } from "./router.ts";
import { studentPortalService, type StudentPortalService } from "./service.ts";

export const studentPortalPlugin: BackendPlugin<StudentPortalService> = {
  manifest: studentPortalManifest,
  router: createStudentPortalRouter(),
  service: studentPortalService,
};
