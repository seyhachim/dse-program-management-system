import { Router } from "express";
import { programmeManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createCurriculumCourseSpecRouter } from "./curriculum-course-spec-router.ts";
import { createCurriculumDraftRouter } from "./curriculum-draft-router.ts";
import { createCurriculumHistoryRouter } from "./curriculum-history-router.ts";
import { createCurriculumImportRouter } from "./curriculum-import-router.ts";
import { createCurriculumWorkflowRouter } from "./curriculum-workflow-router.ts";
import { createGradingScaleRouter } from "./grading-scale-router.ts";
import { createPublicProgrammeInfoRouter } from "./public-programme-info-router.ts";
import { createPublicProgrammeReadRouter } from "./public-programme-read-router.ts";
import { createProgrammeRouter } from "./router.ts";
import { programmeService, type ProgrammeService } from "./service.ts";

const programmeRouter = Router();

// Public read routes must be mounted before the authenticated Programme router.
// They expose only explicit published/public DTO projections and define no
// mutation routes. The existing management surface remains fully authenticated.
programmeRouter.use("/public", createPublicProgrammeReadRouter());

const authenticatedProgrammeRouter = createProgrammeRouter();
authenticatedProgrammeRouter.use(createGradingScaleRouter());
authenticatedProgrammeRouter.use(createCurriculumDraftRouter());
authenticatedProgrammeRouter.use(createCurriculumWorkflowRouter());
authenticatedProgrammeRouter.use(createCurriculumHistoryRouter());
authenticatedProgrammeRouter.use(createCurriculumCourseSpecRouter());
authenticatedProgrammeRouter.use(createCurriculumImportRouter());
authenticatedProgrammeRouter.use("/public-information", createPublicProgrammeInfoRouter());
programmeRouter.use(authenticatedProgrammeRouter);

export const programmePlugin: BackendPlugin<ProgrammeService> = {
  manifest: programmeManifest,
  router: programmeRouter,
  service: programmeService,
};
