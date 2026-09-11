import type { PortalScheduleImpact } from "@dse-pms/shared-types";
import { api } from "./api";

export const studentScheduleApi = {
  impacts: () =>
    api.get<PortalScheduleImpact[]>("/api/student-portal/schedule-impacts"),
};
