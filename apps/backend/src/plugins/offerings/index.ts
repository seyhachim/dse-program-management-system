import { offeringsManifest } from "@dse-pms/shared-types";
import { Router } from "express";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { attendanceService } from "./attendance-service.ts";
import { classDeliveryService } from "./class-delivery-service.ts";
import { classResponsibilityService } from "./class-responsibility-service.ts";
import { courseSectionPresenceService } from "./course-section-presence-service.ts";
import { portfolioTeachingEvidenceService } from "./portfolio-evidence-service.ts";
import { createOfferingRouter } from "./router.ts";
import { offeringService } from "./service.ts";
import { studentAttendanceHistoryService } from "./student-attendance-history-service.ts";
import { createTeachingSessionDeliveryRouter } from "./teaching-session-delivery-router.ts";
import { teachingSessionDeliveryService } from "./teaching-session-delivery-service.ts";

export const offeringsService = {
  ...offeringService,
  ...courseSectionPresenceService,
  ...portfolioTeachingEvidenceService,
  attendance: attendanceService,
  studentAttendanceHistory: studentAttendanceHistoryService,
  classResponsibilities: classResponsibilityService,
  classDelivery: classDeliveryService,
  teachingSessionDelivery: teachingSessionDeliveryService,
};

export type OfferingsService = typeof offeringsService;

const router = Router();
// Monitor-delivery routes must be mounted before the legacy /:id offering route
// so static paths such as /monitor-assignments/me are never interpreted as ids.
router.use(createTeachingSessionDeliveryRouter());
router.use(createOfferingRouter());

export const offeringsPlugin: BackendPlugin<OfferingsService> = {
  manifest: offeringsManifest,
  router,
  service: offeringsService,
};
