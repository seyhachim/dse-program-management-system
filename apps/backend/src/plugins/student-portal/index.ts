import { studentPortalManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createStudentPortfolioCompleteRouter } from "./portfolio-complete-router.ts";
import { createStudentPortfolioEvidenceRouter } from "./portfolio-evidence-router.ts";
import { createStudentPortfolioPublicRouter } from "./portfolio-public-router.ts";
import { createStudentPortfolioRouter } from "./portfolio-router.ts";
import { createStudentPortalRouter } from "./router.ts";
import { studentPortalService, type StudentPortalService } from "./service.ts";

const router = createStudentPortalRouter();
// Public router is mounted separately and contains no authenticated DTO reuse.
router.use("/portfolio/public", createStudentPortfolioPublicRouter());
router.use("/portfolio", createStudentPortfolioRouter());
router.use("/portfolio/evidence", createStudentPortfolioEvidenceRouter());
router.use("/portfolio", createStudentPortfolioCompleteRouter());

export const studentPortalPlugin: BackendPlugin<StudentPortalService> = {
  manifest: studentPortalManifest,
  router,
  service: studentPortalService,
};