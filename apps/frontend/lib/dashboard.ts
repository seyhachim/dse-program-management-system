import type { DashboardSummary } from "@dse-pms/shared-types";
import { api } from "./api";

export const dashboardApi = {
  summary(): Promise<DashboardSummary> {
    return api.get<DashboardSummary>("/api/dashboard/summary");
  },
};
