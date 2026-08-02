import type { CloForm } from "../clo-model";

/**
 * Client-only draft persistence for the CLO wizard (issue #94 follow-up) — saved on
 * step navigation (not on every keystroke) so a lecturer who cancels or closes the
 * tab mid-wizard doesn't lose an in-progress CLO. Never touches the backend/DB.
 */
function draftKey(courseId: string, cloCode: string | null) {
  return `dse-pms:clo-draft:${courseId}:${cloCode ?? "new"}`;
}

export function loadCloDraft(courseId: string, cloCode: string | null): CloForm | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey(courseId, cloCode));
    return raw ? (JSON.parse(raw) as CloForm) : null;
  } catch {
    return null;
  }
}

export function saveCloDraft(courseId: string, cloCode: string | null, draft: CloForm) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(draftKey(courseId, cloCode), JSON.stringify(draft));
  } catch {
    // best-effort — quota errors etc. shouldn't block the wizard
  }
}

export function clearCloDraft(courseId: string, cloCode: string | null) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(draftKey(courseId, cloCode));
}
