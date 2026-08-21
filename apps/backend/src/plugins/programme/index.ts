import { Router } from "express";
import { programmeManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createCurriculumCourseSpecRouter } from "./curriculum-course-spec-router.ts";
import { createCurriculumDraftRouter } from "./curriculum-draft-router.ts";
import { createCurriculumHistoryRouter } from "./curriculum-history-router.ts";
import { createCurriculumImportRouter } from "./curriculum-import-router.ts";
import { createCurriculumWorkflowRouter } from "./curriculum-workflow-router.ts";
import { createGradingScaleRouter } from "./grading-scale-router.ts";
import { publicCurriculumReadService } from "./public-curriculum-read-service.ts";
import { createPublicProgrammeInfoRouter } from "./public-programme-info-router.ts";
import { createPublicProgrammeReadRouter } from "./public-programme-read-router.ts";
import { publicProgrammeReadService } from "./public-programme-read-service.ts";
import { createPublicQuestionAnalyticsRouter } from "./public-question-analytics-router.ts";
import { publicQuestionAnalyticsService } from "./public-question-analytics-service.ts";
import { publicProgrammeSearchService } from "./public-programme-search-service.ts";
import { createProgrammeRouter } from "./router.ts";
import { programmeService } from "./service.ts";

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
authenticatedProgrammeRouter.use("/public-information", createPublicQuestionAnalyticsRouter());
programmeRouter.use(authenticatedProgrammeRouter);

export const programmeBackendService = {
  ...programmeService,
  publicRead: publicProgrammeReadService,
  publicCurriculumRead: publicCurriculumReadService,
  publicSearch: publicProgrammeSearchService,
  publicQuestionAnalytics: publicQuestionAnalyticsService,
};

export type ProgrammeBackendService = typeof programmeBackendService;

export const programmePlugin: BackendPlugin<ProgrammeBackendService> = {
  manifest: programmeManifest,
  router: programmeRouter,
  service: programmeBackendService,
};
