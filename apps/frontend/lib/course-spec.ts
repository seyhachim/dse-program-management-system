import type { CourseSpecView, SpecSectionId } from "@dse-pms/shared-types";
import { api } from "./api";

type AssessmentTemplateItem = {
  assessmentId: string;
  assessmentCategory: "continuous" | "final";
  topicNumbers: number[];
  physicalSltHours: number | null;
  onlineSltHours: number | null;
  independentSltHours: number | null;
};

type AssessmentTemplateResponse = {
  items: AssessmentTemplateItem[];
};

type AssessmentPlanWithTemplateMetadata = {
  items: unknown[];
  templateMetadata?: AssessmentTemplateResponse;
};

function mergeAssessmentTemplateMetadata(
  spec: CourseSpecView,
  metadata: AssessmentTemplateResponse,
): CourseSpecView {
  const plan = spec.data.assessmentPlan as
    | { items?: unknown[] }
    | undefined;
  if (!plan?.items) return spec;

  const metadataById = new Map(
    metadata.items.map((item) => [item.assessmentId, item]),
  );

  return {
    ...spec,
    data: {
      ...spec.data,
      assessmentPlan: {
        ...plan,
        items: plan.items.map((raw) => {
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
          const item = raw as Record<string, unknown>;
          const metadataItem = metadataById.get(String(item.id ?? ""));
          if (!metadataItem) return item;
          const { assessmentId: _assessmentId, ...templateFields } = metadataItem;
          return { ...item, ...templateFields };
        }),
      },
    },
  };
}

async function fetchCourseSpec(courseId: string): Promise<CourseSpecView> {
  const [spec, metadata] = await Promise.all([
    api.get<CourseSpecView>(`/api/courses/${courseId}/spec`),
    api
      .get<AssessmentTemplateResponse>(`/api/assessment-template/${courseId}`)
      .catch(() => ({ items: [] })),
  ]);
  return mergeAssessmentTemplateMetadata(spec, metadata);
}

/**
 * Client for Course Specification endpoints. Completed reads are deliberately
 * not cached here: the authenticated TanStack Query layer owns freshness,
 * user-scoping, stale-while-revalidate behavior, and mutation invalidation.
 * `api.get` still coalesces requests that are concurrently in flight.
 */
export const courseSpecApi = {
  get(courseId: string): Promise<CourseSpecView> {
    return fetchCourseSpec(courseId);
  },
  submit(courseId: string, note: string) {
    return api.post<CourseSpecView>(`/api/courses/${courseId}/spec/submit`, {
      note,
    });
  },
  requestChanges(courseId: string, note: string) {
    return api.post<CourseSpecView>(
      `/api/courses/${courseId}/spec/review/request-changes`,
      { note },
    );
  },
  approve(courseId: string, note: string) {
    return api.post<CourseSpecView>(
      `/api/courses/${courseId}/spec/review/approve`,
      { note },
    );
  },
  async saveSection(
    courseId: string,
    sectionId: SpecSectionId,
    values: unknown,
  ): Promise<CourseSpecView> {
    if (sectionId === "assessmentPlan" && values && typeof values === "object") {
      const assessmentValues = values as AssessmentPlanWithTemplateMetadata;
      const { templateMetadata, ...coreAssessmentValues } = assessmentValues;
      const result = await api.put<CourseSpecView>(
        `/api/courses/${courseId}/spec/${sectionId}`,
        coreAssessmentValues,
      );
      if (templateMetadata) {
        await api.put<AssessmentTemplateResponse>(
          `/api/assessment-template/${courseId}`,
          templateMetadata,
        );
      }
      return result;
    }

    return api.put<CourseSpecView>(
      `/api/courses/${courseId}/spec/${sectionId}`,
      values,
    );
  },
};