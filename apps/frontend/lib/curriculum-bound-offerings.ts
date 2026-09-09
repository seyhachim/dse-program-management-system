import type {
  CreateCurriculumBoundOfferingInput,
  OfferingCurriculumBindingView,
  OfferingCurriculumPlacementRef,
  OfferingCurriculumVersionRef,
  OfferingView,
  Semester,
  UpdateCurriculumBoundOfferingInput,
} from "@dse-pms/shared-types";
import { api } from "./api";

export const curriculumBoundOfferingsApi = {
  versions(programmeId: string): Promise<OfferingCurriculumVersionRef[]> {
    const query = new URLSearchParams({ programmeId });
    return api.get<OfferingCurriculumVersionRef[]>(`/api/offerings/curriculum-versions?${query}`);
  },

  placements(
    programmeId: string,
    curriculumVersionId: string,
    studyYear: number,
    semester: Semester,
  ): Promise<OfferingCurriculumPlacementRef[]> {
    const query = new URLSearchParams({
      programmeId,
      curriculumVersionId,
      studyYear: String(studyYear),
      semester,
    });
    return api.get<OfferingCurriculumPlacementRef[]>(`/api/offerings/curriculum-placements?${query}`);
  },

  binding(offeringId: string): Promise<OfferingCurriculumBindingView> {
    return api.get<OfferingCurriculumBindingView>(
      `/api/offerings/curriculum-binding/${encodeURIComponent(offeringId)}`,
    );
  },

  create(input: CreateCurriculumBoundOfferingInput): Promise<OfferingView> {
    return api.post<OfferingView>("/api/offerings/curriculum-bound", input);
  },

  update(offeringId: string, input: UpdateCurriculumBoundOfferingInput): Promise<OfferingView> {
    return api.patch<OfferingView>(
      `/api/offerings/curriculum-bound/${encodeURIComponent(offeringId)}`,
      input,
    );
  },
};
