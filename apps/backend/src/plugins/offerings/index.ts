import { offeringsManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { attendanceService } from "./attendance-service.ts";
import { classDeliveryService } from "./class-delivery-service.ts";
import { classResponsibilityService } from "./class-responsibility-service.ts";
import { courseSectionPresenceService } from "./course-section-presence-service.ts";
import { portfolioTeachingEvidenceService } from "./portfolio-evidence-service.ts";
import { createOfferingRouter } from "./router.ts";
import { offeringService } from "./service.ts";
import { studentAttendanceHistoryService } from "./student-attendance-history-service.ts";

export const offeringsService = {
  ...offeringService,
  ...courseSectionPresenceService,
  ...portfolioTeachingEvidenceService,
  attendance: attendanceService,
  studentAttendanceHistory: studentAttendanceHistoryService,
  classResponsibilities: classResponsibilityService,
  classDelivery: classDeliveryService,
};

export type OfferingsService = typeof offeringsService;

export const offeringsPlugin: BackendPlugin<OfferingsService> = {
  manifest: offeringsManifest,
  router: createOfferingRouter(),
  service: offeringsService,
};
