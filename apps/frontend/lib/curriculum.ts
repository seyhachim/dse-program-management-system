import type {
  CreateCurriculumRevisionInput,
  CurriculumVersionSummary,
  ProgrammeCurriculumRead,
  SaveCurriculumDraftInput,
} from "@dse-pms/shared-types";
import { api } from "./api";

/**
 * The PMS currently has one canonical programme row. Keep that implementation
 * detail in this API adapter so the React workspace does not depend on it.
 * Issue #143's multi-programme cutover only needs to replace this resolver.
 */
const CURRENT_PROGRAMME_ID = "dse";

export interface ProgrammeCurriculumListItem {
  id: string;
  programmeId: string;
  code: string;
  name: string;
  versions: CurriculumVersionSummary[];
}

export const curriculumApi = {
  list(): Promise<ProgrammeCurriculumListItem[]> {
    return api.get<ProgrammeCurriculumListItem[]>(
      `/api/programme/curricula/programmes/${CURRENT_PROGRAMME_ID}`,
    );
  },
  get(curriculumId: string, versionId?: string): Promise<ProgrammeCurriculumRead> {
    const query = versionId
      ? `?versionId=${encodeURIComponent(versionId)}`
      : "";
    return api.get<ProgrammeCurriculumRead>(
      `/api/programme/curricula/${encodeURIComponent(curriculumId)}${query}`,
    );
  },
  saveDraft(
    curriculumId: string,
    versionId: string,
    input: SaveCurriculumDraftInput,
  ): Promise<ProgrammeCurriculumRead> {
    return api.put<ProgrammeCurriculumRead>(
      `/api/programme/curricula/${encodeURIComponent(curriculumId)}/versions/${encodeURIComponent(versionId)}/draft`,
      input,
    );
  },
  createRevision(
    curriculumId: string,
    versionId: string,
    input: CreateCurriculumRevisionInput,
  ): Promise<ProgrammeCurriculumRead> {
    return api.post<ProgrammeCurriculumRead>(
      `/api/programme/curricula/${encodeURIComponent(curriculumId)}/versions/${encodeURIComponent(versionId)}/revisions`,
      input,
    );
  },
};

export function curriculumStatusLabel(status: CurriculumVersionSummary["status"]): string {
  switch (status) {
    case "Draft":
      return "Draft";
    case "Approved":
      return "Approved";
    case "Active":
      return "Active";
    case "Superseded":
      return "Superseded";
  }
}

export function curriculumVersionLabel(version: CurriculumVersionSummary): string {
  return `v${version.version}`;
}

export function revisionTriggerLabel(trigger: string): string {
  return trigger.replace(/([a-z])([A-Z])/g, "$1 $2");
}
