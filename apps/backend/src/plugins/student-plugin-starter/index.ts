import { studentPluginStarterManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createStudentPluginStarterRouter } from "./router.ts";
import {
  studentPluginStarterService,
  type StudentPluginStarterService,
} from "./service.ts";

/**
 * Example only. Not imported into core/app.ts, so not activated by deployment.
 */
export const studentPluginStarter: BackendPlugin<StudentPluginStarterService> = {
  manifest: studentPluginStarterManifest,
  router: createStudentPluginStarterRouter(),
  service: studentPluginStarterService,
};
