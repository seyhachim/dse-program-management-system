import { programmeManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createCurriculumCourseSpecRouter } from "./curriculum-course-spec-router.ts";
import { createCurriculumDraftRouter } from "./curriculum-draft-router.ts";
import { createCurriculumHistoryRouter } from "./curriculum-history-router.ts";
import { createCurriculumWorkflowRouter } from "./curriculum-workflow-router.ts";
import { createProgrammeRouter } from "./router.ts";
import { programmeService, type ProgrammeService } from "./service.ts";

const programmeRouter = createProgrammeRouter();
programmeRouter.use(createCurriculumDraftRouter());
programmeRouter.use(createCurriculumWorkflowRouter());
programmeRouter.use(createCurriculumHistoryRouter());
programmeRouter.use(createCurriculumCourseSpecRouter());

export const programmePlugin: BackendPlugin<ProgrammeService> = {
  manifest: programmeManifest,
  router: programmeRouter,
  service: programmeService,
};
