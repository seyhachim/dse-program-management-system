import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createAssessmentTemplateRouter } from "./router.ts";
import {
  assessmentTemplateService,
  type AssessmentTemplateService,
} from "./service.ts";

export const assessmentTemplatePlugin: BackendPlugin<AssessmentTemplateService> = {
  manifest: {
    id: "assessment-template",
    name: "Assessment Template",
    version: "0.1.0",
    description: "Official §16/§17 assessment SLT and topic metadata.",
  },
  router: createAssessmentTemplateRouter(),
  service: assessmentTemplateService,
};
