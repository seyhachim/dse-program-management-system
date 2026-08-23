import { studentHandbookManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createStudentHandbookRouter } from "./router.ts";
import * as service from "./service.ts";

export type StudentHandbookService = typeof service;

export const studentHandbookPlugin: BackendPlugin<StudentHandbookService> = {
  manifest: studentHandbookManifest,
  router: createStudentHandbookRouter(),
  service,
};
