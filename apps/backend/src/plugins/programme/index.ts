import { programmeManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createCurriculumDraftRouter } from "./curriculum-draft-router.ts";
import { createProgrammeRouter } from "./router.ts";
import { programmeService, type ProgrammeService } from "./service.ts";

const programmeRouter = createProgrammeRouter();
programmeRouter.use(createCurriculumDraftRouter());

export const programmePlugin: BackendPlugin<ProgrammeService> = {
  manifest: programmeManifest,
  router: programmeRouter,
  service: programmeService,
};
