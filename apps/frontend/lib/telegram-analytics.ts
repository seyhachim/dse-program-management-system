import type { TelegramAnalyticsDashboard } from "@dse-pms/shared-types";
import { api } from "./api";

export const telegramAnalyticsApi = {
  dashboard(programmeId: string, days = 30) {
    const query = new URLSearchParams({ days: String(days) });
    return api.get<TelegramAnalyticsDashboard>(
      `/api/programme/public-information/programmes/${encodeURIComponent(programmeId)}/telegram-analytics?${query.toString()}`,
    );
  },
};
