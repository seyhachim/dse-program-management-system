import type { CourseResourceKind } from "@dse-pms/shared-types";
import type { WeeklyPlanForm } from "./weekly-plan-model";

export type ResourceFormItem = {
  id: string;
  kind: CourseResourceKind;
  /** Label captured from the Weekly Plan when this item was suggested. */
  resourceType: string;
  title: string;
  authors: string;
  publisher: string;
  year: string;
  isbn: string;
  url: string;
  basedOn: string;
  notes: string;
  evidenceWeekIds: string[];
};

export type ResourcesForm = ResourceFormItem[];
export const EMPTY_RESOURCES: ResourcesForm = [];

export const RESOURCE_KIND_LABELS: Record<CourseResourceKind, string> = {
  requiredResource: "Required resource",
  requiredTextbook: "Required textbook",
  recommendedReading: "Recommended reading",
  lecturerSlides: "Lecturer slides",
  lectureNotes: "Lecture notes",
  dataset: "Dataset",
  labMaterial: "Lab material",
  assignmentMaterial: "Assignment material",
  projectMaterial: "Project material",
  otherMaterial: "Other teaching & learning material",
};

export function toResourcesForm(raw: unknown): ResourcesForm {
  if (!raw || typeof raw !== "object") return [];
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];

  return items.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.resourceType !== "string") return [];

    const validKinds = Object.keys(RESOURCE_KIND_LABELS) as CourseResourceKind[];
    const kind = validKinds.includes(item.kind as CourseResourceKind)
      ? (item.kind as CourseResourceKind)
      : "requiredResource";

    return [{
      id: item.id,
      kind,
      resourceType: item.resourceType,
      title: typeof item.title === "string" ? item.title : "",
      authors: typeof item.authors === "string" ? item.authors : "",
      publisher: typeof item.publisher === "string" ? item.publisher : "",
      year: typeof item.year === "string" ? item.year : "",
      isbn: typeof item.isbn === "string" ? item.isbn : "",
      url: typeof item.url === "string" ? item.url : "",
      basedOn: typeof item.basedOn === "string" ? item.basedOn : "",
      notes: typeof item.notes === "string" ? item.notes : "",
      evidenceWeekIds: Array.isArray(item.evidenceWeekIds)
        ? item.evidenceWeekIds.filter((value): value is string => typeof value === "string")
        : [],
    }];
  });
}

export function reconcileResources(resources: ResourcesForm, weeks: WeeklyPlanForm): ResourcesForm {
  const weekIds = new Set(weeks.map((week) => week.id));
  return resources.map((item) => ({
    ...item,
    evidenceWeekIds: item.evidenceWeekIds.filter((weekId) => weekIds.has(weekId)),
  }));
}

export function toResourcesPayload(resources: ResourcesForm, weeks: WeeklyPlanForm) {
  return {
    items: reconcileResources(resources, weeks).map((item) => ({
      id: item.id,
      kind: item.kind,
      resourceType: item.resourceType.trim(),
      title: item.title.trim(),
      authors: item.authors.trim(),
      publisher: item.publisher.trim(),
      year: item.year.trim(),
      isbn: item.isbn.trim(),
      url: item.url.trim(),
      basedOn: item.basedOn.trim(),
      notes: item.notes.trim(),
      evidenceWeekIds: item.evidenceWeekIds,
    })),
  };
}
