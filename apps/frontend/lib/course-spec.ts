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

const courseSpecReadCache = new Map<string, Promise<CourseSpecView>>();

function invalidateCourseSpecRead(courseId: string) {
  courseSpecReadCache.delete(courseId);
}

const LEGACY_FINAL_ASSESSMENT_PATTERN = /\b(final|defen[cs]e|capstone)\b/i;

function resolveLegacyAssessmentCategory(
  item: Record<string, unknown>,
  metadataCategory: "continuous" | "final",
): "continuous" | "final" {
  if (metadataCategory === "final") return "final";

  const label = `${String(item.name ?? "")} ${String(item.type ?? "")}`.trim();
  return LEGACY_FINAL_ASSESSMENT_PATTERN.test(label) ? "final" : "continuous";
}

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
          return {
            ...item,
            ...templateFields,
            assessmentCategory: resolveLegacyAssessmentCategory(
              item,
              templateFields.assessmentCategory,
            ),
          };
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

/** Client for the Course Specification wizard endpoints (courses plugin sub-resource). */
export const courseSpecApi = {
  get(courseId: string): Promise<CourseSpecView> {
    const cached = courseSpecReadCache.get(courseId);
    if (cached) return cached;

    const request = fetchCourseSpec(courseId).catch((error) => {
      courseSpecReadCache.delete(courseId);
      throw error;
    });
    courseSpecReadCache.set(courseId, request);
    return request;
  },
  async submit(courseId: string, note: string) {
    const result = await api.post<CourseSpecView>(`/api/courses/${courseId}/spec/submit`, {
      note,
    });
    invalidateCourseSpecRead(courseId);
    return result;
  },
  async requestChanges(courseId: string, note: string) {
    const result = await api.post<CourseSpecView>(
      `/api/courses/${courseId}/spec/review/request-changes`,
      { note },
    );
    invalidateCourseSpecRead(courseId);
    return result;
  },
  async approve(courseId: string, note: string) {
    const result = await api.post<CourseSpecView>(
      `/api/courses/${courseId}/spec/review/approve`,
      { note },
    );
    invalidateCourseSpecRead(courseId);
    return result;
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
      invalidateCourseSpecRead(courseId);
      return result;
    }

    const result = await api.put<CourseSpecView>(
      `/api/courses/${courseId}/spec/${sectionId}`,
      values,
    );
    invalidateCourseSpecRead(courseId);
    return result;
  },
};
