import type { WeekForm } from "../weekly-plan-model";

/** Client-only draft persistence for the Weekly Plan wizard. Never touches the backend. */
function draftKey(courseId: string, weekId: string | null) {
  return `dse-pms:weekly-plan-draft:${courseId}:${weekId ?? "new"}`;
}

export function loadWeekDraft(courseId: string, weekId: string | null): WeekForm | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey(courseId, weekId));
    return raw ? (JSON.parse(raw) as WeekForm) : null;
  } catch {
    return null;
  }
}

export function saveWeekDraft(courseId: string, weekId: string | null, draft: WeekForm) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(draftKey(courseId, weekId), JSON.stringify(draft));
  } catch {
    // Best-effort only; local storage failure must not block the wizard.
  }
}

export function clearWeekDraft(courseId: string, weekId: string | null) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(draftKey(courseId, weekId));
}
