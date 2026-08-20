import type {
  ApproveProgrammeGradingScaleInput,
  CreateProgrammeGradingScaleInput,
  CreateProgrammeGradingScaleRevisionInput,
  ProgrammeGradingScale,
  ProgrammeGradingScaleVersion,
  UpdateProgrammeGradingScaleDraftInput,
} from "@dse-pms/shared-types";
import { api } from "./api";

export const gradingScalesApi = {
  list(programmeId: string): Promise<ProgrammeGradingScale[]> {
    return api.get<ProgrammeGradingScale[]>(
      `/api/programme/grading-scales?programmeId=${encodeURIComponent(programmeId)}`,
    );
  },

  getVersion(versionId: string): Promise<ProgrammeGradingScaleVersion> {
    return api.get<ProgrammeGradingScaleVersion>(
      `/api/programme/grading-scales/versions/${encodeURIComponent(versionId)}`,
    );
  },

  create(input: CreateProgrammeGradingScaleInput): Promise<ProgrammeGradingScaleVersion> {
    return api.post<ProgrammeGradingScaleVersion>("/api/programme/grading-scales", input);
  },

  updateDraft(
    versionId: string,
    input: UpdateProgrammeGradingScaleDraftInput,
  ): Promise<ProgrammeGradingScaleVersion> {
    return api.put<ProgrammeGradingScaleVersion>(
      `/api/programme/grading-scales/versions/${encodeURIComponent(versionId)}`,
      input,
    );
  },

  createRevision(
    gradingScaleId: string,
    input: CreateProgrammeGradingScaleRevisionInput,
  ): Promise<ProgrammeGradingScaleVersion> {
    return api.post<ProgrammeGradingScaleVersion>(
      `/api/programme/grading-scales/${encodeURIComponent(gradingScaleId)}/revisions`,
      input,
    );
  },

  approve(
    versionId: string,
    input: ApproveProgrammeGradingScaleInput,
  ): Promise<ProgrammeGradingScaleVersion> {
    return api.post<ProgrammeGradingScaleVersion>(
      `/api/programme/grading-scales/versions/${encodeURIComponent(versionId)}/approve`,
      input,
    );
  },
};
