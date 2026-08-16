import { offeringsManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { attendanceService } from "./attendance-service.ts";
import { createOfferingRouter } from "./router.ts";
import { offeringService } from "./service.ts";

export const offeringsService = {
  ...offeringService,
  attendance: attendanceService,
};

export type OfferingsService = typeof offeringsService;

export const offeringsPlugin: BackendPlugin<OfferingsService> = {
  manifest: offeringsManifest,
  router: createOfferingRouter(),
  service: offeringsService,
};
