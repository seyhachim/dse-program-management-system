import type { AttendanceRecordView, AttendanceStatus } from "@dse-pms/shared-types";

/** Only editable fields and canonical internal IDs may be stored on this device. */
type DraftMark = Pick<AttendanceRecordView, "studentId" | "status" | "permissionPending" | "note">;
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

interface AttendanceDraft {
  version: 1;
  serverUpdatedAt: string | null;
  baselineFingerprint: string;
  marks: DraftMark[];
}

const PREFIX = "dse-pms:attendance-draft:v1";
const STATUSES = new Set<AttendanceStatus>(["Present", "Absent", "Late", "Excused"]);

export function attendanceDraftKey(userId: string, offeringId: string, date: string): string {
  return `${PREFIX}:${encodeURIComponent(userId)}:${encodeURIComponent(offeringId)}:${encodeURIComponent(date)}`;
}

/** The fingerprint is a comparison guard, not an identifier or an authentication token. */
function baselineFingerprint(records: AttendanceRecordView[]): string {
  const canonical = records
    .map(({ studentId, status, permissionPending, note }) => [studentId, status, permissionPending, note] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  let hash = 2166136261;
  const source = JSON.stringify(canonical);
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${records.length}:${(hash >>> 0).toString(16)}`;
}

function remove(store: Store, key: string): void {
  try { store.removeItem(key); } catch { /* Storage may be disabled. */ }
}

export function clearAttendanceDraft(store: Store, key: string): void {
  remove(store, key);
}

function validMark(mark: unknown): mark is DraftMark {
  if (!mark || typeof mark !== "object" || Array.isArray(mark)) return false;
  const value = mark as Record<string, unknown>;
  return typeof value.studentId === "string" && value.studentId.length > 0 &&
    (value.status === null || STATUSES.has(value.status as AttendanceStatus)) &&
    typeof value.permissionPending === "boolean" &&
    !(value.permissionPending && value.status !== null) &&
    typeof value.note === "string" && value.note.length <= 300 &&
    Object.keys(value).every((key) => ["studentId", "status", "permissionPending", "note"].includes(key));
}

export function readAttendanceDraft(
  store: Store,
  key: string,
  serverUpdatedAt: string | null,
  baseline: AttendanceRecordView[],
): AttendanceRecordView[] | null {
  let raw: string | null;
  try { raw = store.getItem(key); } catch { return null; }
  if (raw === null) return null;
  try {
    const draft: unknown = JSON.parse(raw);
    if (!draft || typeof draft !== "object" || Array.isArray(draft)) throw Error("Invalid draft");
    const value = draft as Partial<AttendanceDraft>;
    if (value.version !== 1 || value.serverUpdatedAt !== serverUpdatedAt ||
        value.baselineFingerprint !== baselineFingerprint(baseline) ||
        !Array.isArray(value.marks) || value.marks.length === 0 ||
        !value.marks.every(validMark)) throw Error("Stale or invalid draft");
    const byId = new Map(baseline.map((record) => [record.studentId, record]));
    const seen = new Set<string>();
    for (const mark of value.marks) {
      if (!byId.has(mark.studentId) || seen.has(mark.studentId)) throw Error("Invalid student");
      seen.add(mark.studentId);
    }
    return baseline.map((record) => {
      const mark = value.marks?.find((item) => item.studentId === record.studentId);
      return mark ? { ...record, status: mark.status, permissionPending: mark.permissionPending, note: mark.note,
        permissionPendingSince: mark.permissionPending && !record.permissionPending ? null : record.permissionPendingSince } : record;
    });
  } catch {
    remove(store, key);
    return null;
  }
}

/** Write only changed student IDs and editable marks, never names, emails or query payloads. */
export function writeAttendanceDraft(
  store: Store,
  key: string,
  serverUpdatedAt: string | null,
  baseline: AttendanceRecordView[],
  records: AttendanceRecordView[],
): boolean {
  const byId = new Map(baseline.map((record) => [record.studentId, record]));
  if (records.length !== baseline.length || records.some((record) => !byId.has(record.studentId))) return false;
  const marks = records
    .filter((record) => {
      const saved = byId.get(record.studentId)!;
      return saved.status !== record.status || saved.permissionPending !== record.permissionPending || saved.note !== record.note;
    })
    .map(({ studentId, status, permissionPending, note }) => ({ studentId, status, permissionPending, note }));
  if (marks.length === 0) { remove(store, key); return true; }
  const draft: AttendanceDraft = {
    version: 1, serverUpdatedAt, baselineFingerprint: baselineFingerprint(baseline), marks,
  };
  try { store.setItem(key, JSON.stringify(draft)); return true; } catch { return false; }
}
