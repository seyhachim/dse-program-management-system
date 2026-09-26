import type {
  MonitorClassResponsibilityView,
  SaveLecturerArrivalConfirmationResult,
  SaveTeachingSessionDeliveryInput,
  SaveTeachingSessionDeliveryResult,
  SaveTeachingSessionTimingResult,
  TeachingSessionMonitorContextView,
} from "@dse-pms/shared-types";
import { api } from "./api";

function deliveryPath(
  offeringId: string,
  meetingId: string,
  date: string,
  suffix:
    | "monitor-context"
    | "monitor-arrival"
    | "monitor-teaching-start"
    | "monitor-teaching-end"
    | "monitor-delivery",
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
  markArrived: (offeringId: string, meetingId: string, date: string) =>
    api.put<SaveLecturerArrivalConfirmationResult>(
      deliveryPath(offeringId, meetingId, date, "monitor-arrival"),
      {},
    ),
  markTeachingStarted: (offeringId: string, meetingId: string, date: string) =>
    api.put<SaveTeachingSessionTimingResult>(
      deliveryPath(offeringId, meetingId, date, "monitor-teaching-start"),
      {},
    ),
  markTeachingEnded: (offeringId: string, meetingId: string, date: string) =>
    api.put<SaveTeachingSessionTimingResult>(
      deliveryPath(offeringId, meetingId, date, "monitor-teaching-end"),
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
