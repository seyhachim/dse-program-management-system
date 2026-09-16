import { studentsManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createStudentRouter } from "./router.ts";
import { getCanonicalSectionRoster } from "./section-roster-read.ts";
import { studentService } from "./service.ts";

const studentsPluginService = {
  ...studentService,
  getSectionRoster: getCanonicalSectionRoster,
};

export type StudentService = typeof studentsPluginService;

/**
 * Students plugin definition: the shared manifest + this plugin's Express router
 * + its public service. Registered into the core registry at boot.
 */
export const studentsPlugin: BackendPlugin<StudentService> = {
  manifest: studentsManifest,
  router: createStudentRouter(),
  service: studentsPluginService,
};
