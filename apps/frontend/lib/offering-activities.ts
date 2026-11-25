import type {
  CreateOfferingActivityInput,
  OfferingActivityAuditView,
  OfferingActivityView,
  UpdateOfferingActivityInput,
} from "@dse-pms/shared-types";
import { api } from "./api";

const path = (offeringId: string) => "/api/offerings/" + encodeURIComponent(offeringId) + "/activities";

export const offeringActivitiesApi = {
  list(offeringId: string): Promise<OfferingActivityView[]> {
    return api.get<OfferingActivityView[]>(path(offeringId));
  },
  get(offeringId: string, id: string): Promise<OfferingActivityView> {
    return api.get<OfferingActivityView>(path(offeringId) + "/" + encodeURIComponent(id));
  },
  create(offeringId: string, input: CreateOfferingActivityInput): Promise<OfferingActivityView> {
    return api.post<OfferingActivityView>(path(offeringId), input);
  },
  update(offeringId: string, id: string, input: UpdateOfferingActivityInput): Promise<OfferingActivityView> {
    return api.patch<OfferingActivityView>(path(offeringId) + "/" + encodeURIComponent(id), input);
  },
  history(offeringId: string, id: string): Promise<OfferingActivityAuditView[]> {
    return api.get<OfferingActivityAuditView[]>(path(offeringId) + "/" + encodeURIComponent(id) + "/history");
  },
};
