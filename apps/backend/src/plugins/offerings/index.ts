import { offeringsManifest } from "@dse-pms/shared-types";
import { Router } from "express";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { offeringActivationExceptionService } from "./activation-exception-service.ts";
import { createOfferingActivationExceptionRouter } from "./activation-exception-router.ts";
import { attendanceService } from "./attendance-service.ts";
import { classDeliveryService } from "./class-delivery-service.ts";
import { classResponsibilityService } from "./class-responsibility-service.ts";
import { courseSectionPresenceService } from "./course-section-presence-service.ts";
import { curriculumBoundOfferingService } from "./curriculum-bound-service.ts";
import { createCurriculumBoundOfferingRouter } from "./curriculum-bound-router.ts";
import { portfolioTeachingEvidenceService } from "./portfolio-evidence-service.ts";
import { createOfferingRouter } from "./router.ts";
import { offeringService } from "./service.ts";
import { studentAttendanceHistoryService } from "./student-attendance-history-service.ts";
import { createTeachingLeaveRouter } from "./teaching-leave-router.ts";
import { teachingLeaveService } from "./teaching-leave-service.ts";
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
  teachingLeave: teachingLeaveService,
  curriculumBound: curriculumBoundOfferingService,
  activationExceptions: offeringActivationExceptionService,
};

export type OfferingsService = typeof offeringsService;

const router = Router();
// Static workflow routes are mounted before the legacy /:id offering router so
// reserved route segments are never interpreted as Offering ids.
router.use(createTeachingLeaveRouter());
router.use(createTeachingSessionDeliveryRouter());
router.use(createCurriculumBoundOfferingRouter());
router.use(createOfferingActivationExceptionRouter());
router.use(createOfferingRouter());

export const offeringsPlugin: BackendPlugin<OfferingsService> = {
  manifest: offeringsManifest,
  router,
  service: offeringsService,
};
