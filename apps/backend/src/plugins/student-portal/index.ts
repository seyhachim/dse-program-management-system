import { studentPortalManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createStudentPortfolioRouter } from "./portfolio-router.ts";
import { createStudentPortalRouter } from "./router.ts";
import { studentPortalService, type StudentPortalService } from "./service.ts";

const router = createStudentPortalRouter();
router.use("/portfolio", createStudentPortfolioRouter());

export const studentPortalPlugin: BackendPlugin<StudentPortalService> = {
  manifest: studentPortalManifest,
  router,
  service: studentPortalService,
};
