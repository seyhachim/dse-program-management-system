import type {
  CreateVisitParticipantInput, UpdateVisitParticipantInput, VisitParticipantView,
  VisitParticipantsWorkspace,
  CreateDseNewsInput, EditDseNewsInput, ChangeDseNewsStatusInput, ChangeDseNewsPublicStatusInput, DseNewsView,
} from "@dse-pms/shared-types";
import { api } from "./api";

const activityPath = (offeringId: string, activityId: string) =>
  "/api/offerings/" + encodeURIComponent(offeringId) + "/activities/" +
  encodeURIComponent(activityId) + "/participants";

export const visitParticipantsApi = {
  list: (offeringId: string, activityId: string) =>
    api.get<VisitParticipantsWorkspace>(activityPath(offeringId, activityId)),
  add: (offeringId: string, activityId: string, input: CreateVisitParticipantInput) =>
    api.post<VisitParticipantView>(activityPath(offeringId, activityId), input),
  update: (offeringId: string, activityId: string, participantId: string, input: UpdateVisitParticipantInput) =>
    api.patch<VisitParticipantView>(activityPath(offeringId, activityId) + "/" + encodeURIComponent(participantId), input),
};

const newsBase = "/api/student-portal/news";
export const dseNewsApi = {
  listPublished: () => api.get<DseNewsView[]>(newsBase),
  getPublished: (id: string) => api.get<DseNewsView>(newsBase + "/" + encodeURIComponent(id)),
  listManaged: () => api.get<DseNewsView[]>(newsBase + "/manage"),
  getManaged: (id: string) => api.get<DseNewsView>(newsBase + "/manage/" + encodeURIComponent(id)),
  create: (data: CreateDseNewsInput) => api.post<DseNewsView>(newsBase + "/manage", data),
  edit: (id: string, data: EditDseNewsInput) => api.patch<DseNewsView>(newsBase + "/manage/" + encodeURIComponent(id), data),
  uploadMedia: (id: string, kind: "cover" | "gallery", alt: string, file: File) =>
    api.uploadFile<DseNewsView>(newsBase + "/manage/" + encodeURIComponent(id) + "/media?kind=" + kind + "&alt=" + encodeURIComponent(alt), file),
  removeMedia: (id: string, mediaId: string) =>
    api.delete<DseNewsView>(newsBase + "/manage/" + encodeURIComponent(id) + "/media/" + encodeURIComponent(mediaId)),
  changePublicStatus: (id: string, data: ChangeDseNewsPublicStatusInput) =>
    api.post<DseNewsView>(newsBase + "/manage/" + encodeURIComponent(id) + "/public-status", data),
  changeStatus: (id: string, data: ChangeDseNewsStatusInput) =>
    api.post<DseNewsView>(newsBase + "/manage/" + encodeURIComponent(id) + "/status", data),
};
