import type {
  CanonicalRosterSyncApplyResult,
  CanonicalRosterSyncInput,
  CanonicalRosterSyncPreview,
} from "@dse-pms/shared-types";
import { api } from "./api";

const BASE = "/api/offerings/roster-sync";

export const offeringRosterSyncApi = {
  preview(input: CanonicalRosterSyncInput): Promise<CanonicalRosterSyncPreview> {
    return api.post<CanonicalRosterSyncPreview>(`${BASE}/preview`, input);
  },
  apply(input: CanonicalRosterSyncInput): Promise<CanonicalRosterSyncApplyResult> {
    return api.post<CanonicalRosterSyncApplyResult>(`${BASE}/apply`, input);
  },
};
