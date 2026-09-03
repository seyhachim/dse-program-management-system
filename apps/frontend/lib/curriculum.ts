import type {
  AddCurriculumCourseInput,
  BindCurriculumCourseSpecInput,
  BindProgrammeCurriculumCompetencyFrameworkInput,
  CreateInitialCurriculumInput,
  CreateProgrammeCompetencyFrameworkVersionInput,
  CurriculumArtifactView,
  CurriculumComparison,
  CurriculumCourseSpecBindings,
  CurriculumImportApplyInput,
  CurriculumImportPreview,
  CurriculumJsonUpload,
  CurriculumVersionHistory,
  CurriculumVersionSummary,
  CurriculumWorkflowState,
  ProgrammeCompetencyFrameworkVersion,
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

const workflowPath = (versionId: string) =>
  `/api/programme/curricula/versions/${encodeURIComponent(versionId)}/workflow`;
const importPath = (versionId: string) =>
  `/api/programme/curricula/versions/${encodeURIComponent(versionId)}/import-json`;
const artifactPath = (versionId: string) =>
  `/api/programme/curricula/versions/${encodeURIComponent(versionId)}/artifact`;

export const curriculumApi = {
  list(): Promise<ProgrammeCurriculumListItem[]> {
    return api.get<ProgrammeCurriculumListItem[]>(`/api/programme/curricula/programmes/${CURRENT_PROGRAMME_ID}`);
  },
  createInitial(input: CreateInitialCurriculumInput): Promise<ProgrammeCurriculumRead> {
    return api.post<ProgrammeCurriculumRead>(`/api/programme/curricula/programmes/${CURRENT_PROGRAMME_ID}`, input);
  },
  get(curriculumId: string, versionId?: string): Promise<ProgrammeCurriculumRead> {
    const query = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";
    return api.get<ProgrammeCurriculumRead>(`/api/programme/curricula/${encodeURIComponent(curriculumId)}${query}`);
  },
  listCompetencyFrameworkVersions(): Promise<ProgrammeCompetencyFrameworkVersion[]> {
    return api.get<ProgrammeCompetencyFrameworkVersion[]>(
      `/api/programme/competency-frameworks/programmes/${CURRENT_PROGRAMME_ID}`,
    );
  },
  createCompetencyFrameworkSnapshot(
    input: CreateProgrammeCompetencyFrameworkVersionInput,
  ): Promise<ProgrammeCompetencyFrameworkVersion> {
    return api.post<ProgrammeCompetencyFrameworkVersion>(
      `/api/programme/competency-frameworks/programmes/${CURRENT_PROGRAMME_ID}`,
      input,
    );
  },
  bindCompetencyFramework(
    versionId: string,
    input: BindProgrammeCurriculumCompetencyFrameworkInput,
  ): Promise<ProgrammeCurriculumRead> {
    return api.put<ProgrammeCurriculumRead>(
      `/api/programme/curricula/versions/${encodeURIComponent(versionId)}/competency-framework`,
      input,
    );
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
  previewJson(versionId: string, input: CurriculumJsonUpload): Promise<CurriculumImportPreview> {
    return api.post<CurriculumImportPreview>(`${importPath(versionId)}/preview`, input);
  },
  applyJson(versionId: string, input: CurriculumImportApplyInput): Promise<CurriculumArtifactView> {
    return api.post<CurriculumArtifactView>(`${importPath(versionId)}/apply`, input);
  },
  artifact(versionId: string): Promise<CurriculumArtifactView> {
    return api.get<CurriculumArtifactView>(artifactPath(versionId));
  },
  exportArtifact(versionId: string): Promise<CurriculumArtifactView> {
    return api.get<CurriculumArtifactView>(`${artifactPath(versionId)}/export`);
  },
  workflow(versionId: string): Promise<CurriculumWorkflowState> {
    return api.get<CurriculumWorkflowState>(workflowPath(versionId));
  },
  submit(versionId: string, comment = ""): Promise<CurriculumWorkflowState> {
    return api.post<CurriculumWorkflowState>(`${workflowPath(versionId)}/submit`, { comment });
  },
  requestChanges(versionId: string, comment: string): Promise<CurriculumWorkflowState> {
    return api.post<CurriculumWorkflowState>(`${workflowPath(versionId)}/request-changes`, { comment });
  },
  approve(versionId: string, comment = ""): Promise<CurriculumWorkflowState> {
    return api.post<CurriculumWorkflowState>(`${workflowPath(versionId)}/approve`, { comment });
  },
  activate(versionId: string, comment = ""): Promise<CurriculumWorkflowState> {
    return api.post<CurriculumWorkflowState>(`${workflowPath(versionId)}/activate`, { comment });
  },
  history(curriculumId: string): Promise<CurriculumVersionHistory> {
    return api.get<CurriculumVersionHistory>(`/api/programme/curricula/${encodeURIComponent(curriculumId)}/history`);
  },
  compare(curriculumId: string, fromVersionId: string, toVersionId: string): Promise<CurriculumComparison> {
    const query = new URLSearchParams({ fromVersionId, toVersionId }).toString();
    return api.get<CurriculumComparison>(`/api/programme/curricula/${encodeURIComponent(curriculumId)}/compare?${query}`);
  },
  courseSpecBindings(versionId: string): Promise<CurriculumCourseSpecBindings> {
    return api.get<CurriculumCourseSpecBindings>(`/api/programme/curricula/versions/${encodeURIComponent(versionId)}/course-spec-bindings`);
  },
  bindCourseSpec(versionId: string, placementId: string, input: BindCurriculumCourseSpecInput): Promise<CurriculumCourseSpecBindings> {
    return api.put<CurriculumCourseSpecBindings>(`/api/programme/curricula/versions/${encodeURIComponent(versionId)}/courses/${encodeURIComponent(placementId)}/course-spec-version`, input);
  },
};

export function curriculumStatusLabel(status: CurriculumVersionSummary["status"] | CurriculumWorkflowState["status"]): string {
  return status === "UnderReview" ? "Under Review" : status;
}

export function curriculumVersionLabel(version: CurriculumVersionSummary): string {
  return `v${version.version}`;
}

export function revisionTriggerLabel(trigger: string): string {
  return trigger.replace(/([a-z])([A-Z])/g, "$1 $2");
}
