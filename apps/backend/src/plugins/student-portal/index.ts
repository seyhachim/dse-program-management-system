import { Router } from "express";
import { studentPortalManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { parentAcademicProjectionService } from "./parent-projection.ts";
import { createStudentPortfolioCompleteRouter } from "./portfolio-complete-router.ts";
import { createStudentPortfolioEvidenceRouter } from "./portfolio-evidence-router.ts";
import { createStudentPortfolioPublicRouter } from "./portfolio-public-router.ts";
import { createStudentPortfolioRouter } from "./portfolio-router.ts";
import { createStudentPortalRouter } from "./router.ts";
import { createStudentScheduleImpactRouter } from "./schedule-impact-router.ts";
import { studentScheduleImpactProjectionService } from "./schedule-impact-service.ts";
import { studentPortalService } from "./service.ts";
import { createStudentAttendanceRouter } from "./student-attendance-router.ts";
import { studentPortalAttendanceService } from "./student-attendance-service.ts";

const router = Router();
router.use("/portfolio/public", createStudentPortfolioPublicRouter());

router.use(createStudentScheduleImpactRouter());
router.use(createStudentPortalRouter());
router.use(createStudentAttendanceRouter());
router.use("/portfolio", createStudentPortfolioRouter());
router.use("/portfolio/evidence", createStudentPortfolioEvidenceRouter());
router.use("/portfolio", createStudentPortfolioCompleteRouter());

export const studentPortalPluginService = {
  ...studentPortalService,
  scheduleImpacts: studentScheduleImpactProjectionService,
  attendance: studentPortalAttendanceService,
  parentProjection: parentAcademicProjectionService,
};

export type StudentPortalPluginService = typeof studentPortalPluginService;

export const studentPortalPlugin: BackendPlugin<StudentPortalPluginService> = {
  manifest: studentPortalManifest,
  router,
  service: studentPortalPluginService,
};
