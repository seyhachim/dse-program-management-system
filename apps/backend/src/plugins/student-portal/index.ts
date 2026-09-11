import { Router } from "express";
import { studentPortalManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createOpenSlotAssignmentRouter } from "./open-slot-assignment-router.ts";
import { openSlotAssignmentProjectionService } from "./open-slot-assignment-service.ts";
import { parentAcademicProjectionService } from "./parent-projection.ts";
import { createStudentPortfolioCompleteRouter } from "./portfolio-complete-router.ts";
import { createStudentPortfolioEvidenceRouter } from "./portfolio-evidence-router.ts";
import { createStudentPortfolioPublicRouter } from "./portfolio-public-router.ts";
import { createStudentPortfolioRouter } from "./portfolio-router.ts";
import { createStudentPortalRouter } from "./router.ts";
import { createStudentScheduleImpactRouter } from "./schedule-impact-router.ts";
import { studentScheduleImpactProjectionService } from "./schedule-impact-service.ts";
import { studentPortalService } from "./service.ts";

const router = Router();
// Public portfolio is intentionally mounted outside the authenticated Student Portal
// subrouter. It has its own privacy-filtered DTO and never reuses authenticated payloads.
router.use("/portfolio/public", createStudentPortfolioPublicRouter());

// Existing Student Portal keeps its global requireAuth boundary inside this child router.
router.use(createOpenSlotAssignmentRouter());
router.use(createStudentScheduleImpactRouter());
router.use(createStudentPortalRouter());
router.use("/portfolio", createStudentPortfolioRouter());
router.use("/portfolio/evidence", createStudentPortfolioEvidenceRouter());
router.use("/portfolio", createStudentPortfolioCompleteRouter());

export const studentPortalPluginService = {
  ...studentPortalService,
  openSlotAssignments: openSlotAssignmentProjectionService,
  scheduleImpacts: studentScheduleImpactProjectionService,
  parentProjection: parentAcademicProjectionService,
};

export type StudentPortalPluginService = typeof studentPortalPluginService;

export const studentPortalPlugin: BackendPlugin<StudentPortalPluginService> = {
  manifest: studentPortalManifest,
  router,
  service: studentPortalPluginService,
};
