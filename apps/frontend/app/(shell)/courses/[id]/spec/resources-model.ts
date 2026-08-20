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

/**
 * Keep all lecturer-confirmed week provenance, including IDs for Weekly Plan
 * entries that have since been removed. The UI surfaces those unresolved links
 * for deliberate review rather than silently deleting auditable data on save.
 */
export function reconcileResources(
  resources: ResourcesForm,
  _weeks: WeeklyPlanForm,
): ResourcesForm {
  return resources.map((item) => ({
    ...item,
    evidenceWeekIds: [...item.evidenceWeekIds],
  }));
}

export function unresolvedResourceWeekIds(
  resources: ResourcesForm,
  weeks: WeeklyPlanForm,
): string[] {
  const currentWeekIds = new Set(weeks.map((week) => week.id));
  return [
    ...new Set(
      resources.flatMap((item) =>
        item.evidenceWeekIds.filter((weekId) => !currentWeekIds.has(weekId)),
      ),
    ),
  ];
}

export function resourcesForWeek(
  resources: ResourcesForm,
  weekId: string,
): ResourcesForm {
  return resources.filter((item) => item.evidenceWeekIds.includes(weekId));
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
