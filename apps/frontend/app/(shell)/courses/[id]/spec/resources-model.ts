import type { WeeklyPlanForm } from "./weekly-plan-model";

export type ResourceFormItem = {
  id: string;
  resourceType: string;
  title: string;
  url: string;
  notes: string;
  evidenceWeekIds: string[];
};

export type ResourcesForm = ResourceFormItem[];

export const EMPTY_RESOURCES: ResourcesForm = [];

export function toResourcesForm(raw: unknown): ResourcesForm {
  if (!raw || typeof raw !== "object") return [];
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];

  return items.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    if (
      typeof item.id !== "string" ||
      typeof item.resourceType !== "string"
    ) return [];

    return [{
      id: item.id,
      resourceType: item.resourceType,
      title: typeof item.title === "string" ? item.title : "",
      url: typeof item.url === "string" ? item.url : "",
      notes: typeof item.notes === "string" ? item.notes : "",
      evidenceWeekIds: Array.isArray(item.evidenceWeekIds)
        ? item.evidenceWeekIds.filter((value): value is string => typeof value === "string")
        : [],
    }];
  });
}

export function reconcileResources(
  resources: ResourcesForm,
  weeks: WeeklyPlanForm,
): ResourcesForm {
  const weekIds = new Set(weeks.map((week) => week.id));
  return resources.map((item) => ({
    ...item,
    evidenceWeekIds: item.evidenceWeekIds.filter((weekId) => weekIds.has(weekId)),
  }));
}

export function toResourcesPayload(
  resources: ResourcesForm,
  weeks: WeeklyPlanForm,
) {
  return {
    items: reconcileResources(resources, weeks).map((item) => ({
      id: item.id,
      resourceType: item.resourceType,
      title: item.title.trim(),
      url: item.url.trim(),
      notes: item.notes.trim(),
      evidenceWeekIds: item.evidenceWeekIds,
    })),
  };
}
