import type {
  AddCurriculumCourseInput,
  CurriculumVersionSummary,
  ProgrammeCurriculumRead,
  ReorderCurriculumCoursesInput,
  UpdateCurriculumCourseInput,
} from "@dse-pms/shared-types";
import { api } from "./api";

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
    return api.get<ProgrammeCurriculumListItem[]>(`/api/programme/curricula/programmes/${CURRENT_PROGRAMME_ID}`);
  },
  get(curriculumId: string, versionId?: string): Promise<ProgrammeCurriculumRead> {
    const query = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";
    return api.get<ProgrammeCurriculumRead>(`/api/programme/curricula/${encodeURIComponent(curriculumId)}${query}`);
  },
  addCourse(versionId: string, input: AddCurriculumCourseInput): Promise<ProgrammeCurriculumRead> {
    return api.post<ProgrammeCurriculumRead>(`/api/programme/curricula/versions/${encodeURIComponent(versionId)}/courses`, input);
  },
  updateCourse(versionId: string, placementId: string, input: UpdateCurriculumCourseInput): Promise<ProgrammeCurriculumRead> {
    return api.patch<ProgrammeCurriculumRead>(`/api/programme/curricula/versions/${encodeURIComponent(versionId)}/courses/${encodeURIComponent(placementId)}`, input);
  },
  removeCourse(versionId: string, placementId: string, reason: string): Promise<ProgrammeCurriculumRead> {
    return api.delete<ProgrammeCurriculumRead>(`/api/programme/curricula/versions/${encodeURIComponent(versionId)}/courses/${encodeURIComponent(placementId)}`, { reason });
  },
  reorder(versionId: string, input: ReorderCurriculumCoursesInput): Promise<ProgrammeCurriculumRead> {
    return api.put<ProgrammeCurriculumRead>(`/api/programme/curricula/versions/${encodeURIComponent(versionId)}/reorder`, input);
  },
};

export function curriculumStatusLabel(status: CurriculumVersionSummary["status"]): string {
  return status;
}

export function curriculumVersionLabel(version: CurriculumVersionSummary): string {
  return `v${version.version}`;
}

export function revisionTriggerLabel(trigger: string): string {
  return trigger.replace(/([a-z])([A-Z])/g, "$1 $2");
}
