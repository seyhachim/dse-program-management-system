import { createHash } from "node:crypto";
import { hasAnyRoleInProgramme, type AuthUser } from "../../../core/auth/token.ts";

export function evidenceAccess(user: AuthUser, programmeId: string, lecturerIds: readonly string[]) {
  const review = hasAnyRoleInProgramme(user, ["admin", "program_coordinator"], programmeId);
  const contribute = hasAnyRoleInProgramme(user, ["lecturer"], programmeId) && lecturerIds.includes(user.id);
  return { read: review || contribute, contribute, review };
}

// Only credential-free provider links. Provider access is never inferred from URL shape.
// No server fetch, redirect, preview, public export, or storage credentials.
export function isSupportedWorkReference(value: string): boolean {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port || u.search || u.hash) return false;
    if (u.hostname === "drive.google.com") return /^\/file\/d\/[A-Za-z0-9_-]+(?:\/view)?\/?$/.test(u.pathname);
    if (u.hostname === "docs.google.com") return /^\/(document|spreadsheets|presentation)\/d\/[A-Za-z0-9_-]+(?:\/(edit|view))?\/?$/.test(u.pathname);
    if (u.hostname === "colab.research.google.com") return /^\/drive\/[A-Za-z0-9_-]+\/?$/.test(u.pathname);
    return false;
  } catch {
    return false;
  }
}

export type EvidenceAction = "create" | "revise" | "submit" | "verify" | "request_changes";
export type EvidenceStatus = "draft" | "submitted" | "verified" | "changes_requested";
export function transitionEvidence(
  previous: { status: string; sourceHash: string } | null,
  action: EvidenceAction,
  sourceHash: string,
  canReview: boolean,
  isContributor: boolean,
  hasWork: boolean,
): EvidenceStatus | null {
  if (!previous) return action === "create" && isContributor ? "draft" : null;
  if (action === "revise") return isContributor ? "draft" : null;
  if (previous.sourceHash !== sourceHash || !hasWork) return null;
  if (action === "submit" && isContributor && previous.status === "draft") return "submitted";
  if (canReview && previous.status === "submitted") {
    if (action === "verify") return "verified";
    if (action === "request_changes") return "changes_requested";
  }
  return null;
}

export function evidenceSourceHash(snapshot: object): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}
