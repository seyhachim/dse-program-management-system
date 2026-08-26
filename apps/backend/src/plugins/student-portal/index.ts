import { Router } from "express";
import { studentPortalManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createStudentPortfolioCompleteRouter } from "./portfolio-complete-router.ts";
import { createStudentPortfolioEvidenceRouter } from "./portfolio-evidence-router.ts";
import { createStudentPortfolioPublicRouter } from "./portfolio-public-router.ts";
import { createStudentPortfolioRouter } from "./portfolio-router.ts";
import { createStudentPortalRouter } from "./router.ts";
import { studentPortalService, type StudentPortalService } from "./service.ts";

const router = Router();
// Public portfolio is intentionally mounted outside the authenticated Student Portal
// subrouter. It has its own privacy-filtered DTO and never reuses authenticated payloads.
router.use("/portfolio/public", createStudentPortfolioPublicRouter());

// Existing Student Portal keeps its global requireAuth boundary inside this child router.
router.use(createStudentPortalRouter());
router.use("/portfolio", createStudentPortfolioRouter());
router.use("/portfolio/evidence", createStudentPortfolioEvidenceRouter());
router.use("/portfolio", createStudentPortfolioCompleteRouter());

export const studentPortalPlugin: BackendPlugin<StudentPortalService> = {
  manifest: studentPortalManifest,
  router,
  service: studentPortalService,
};
