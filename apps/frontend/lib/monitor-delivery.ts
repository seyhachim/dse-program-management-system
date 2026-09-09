import type {
  MonitorClassResponsibilityView,
  SaveTeachingSessionDeliveryInput,
  SaveTeachingSessionDeliveryResult,
  TeachingSessionMonitorContextView,
} from "@dse-pms/shared-types";
import { api } from "./api";

function deliveryPath(
  offeringId: string,
  meetingId: string,
  date: string,
  suffix: "monitor-context" | "monitor-delivery",
): string {
  return `/api/offerings/${encodeURIComponent(offeringId)}/meetings/${encodeURIComponent(
    meetingId,
  )}/occurrences/${encodeURIComponent(date)}/${suffix}`;
}

export const monitorDeliveryApi = {
  assignments: () =>
    api.get<MonitorClassResponsibilityView[]>("/api/offerings/monitor-assignments/me"),
  context: (offeringId: string, meetingId: string, date: string) =>
    api.put<TeachingSessionMonitorContextView>(
      deliveryPath(offeringId, meetingId, date, "monitor-context"),
      {},
    ),
  save: (
    offeringId: string,
    meetingId: string,
    date: string,
    input: SaveTeachingSessionDeliveryInput,
  ) =>
    api.put<SaveTeachingSessionDeliveryResult>(
      deliveryPath(offeringId, meetingId, date, "monitor-delivery"),
      input,
    ),
};
