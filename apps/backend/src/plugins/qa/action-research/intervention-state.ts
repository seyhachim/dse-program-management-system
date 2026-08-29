import type {
  ResearchCycleStatus,
  ResearchInterventionStatus,
} from "@dse-pms/shared-types";

export interface StoredResearchInterventionLog {
  id: string;
  occurredAt: string;
  plannedDosage: string;
  deliveredDosage: string;
  reachCount: number | null;
  reachDenominator: number | null;
  reachNote: string;
  deviation: string;
  deviationReason: string;
  contextualEvents: string;
  lecturerObservation: string;
  evidenceRefs: string[];
  authorId: string;
  createdAt: string;
}

export interface StoredResearchIntervention {
  id: string;
  title: string;
  description: string;
  target: string;
  responsibleResearcherIds: string[];
  plannedStart: string;
  plannedEnd: string;
  expectedEffect: string;
  expectedDelay: string;
  status: ResearchInterventionStatus;
  version: number;
  createdById: string;
  logs: StoredResearchInterventionLog[];
  createdAt: string;
  updatedAt: string;
}

const STATUSES = new Set<ResearchInterventionStatus>([
  "PLANNED",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
]);

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function parseLog(value: unknown): StoredResearchInterventionLog | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.occurredAt !== "string") return null;
  return {
    id: row.id,
    occurredAt: row.occurredAt,
    plannedDosage: asString(row.plannedDosage),
    deliveredDosage: asString(row.deliveredDosage),
    reachCount: asNullableInt(row.reachCount),
    reachDenominator: asNullableInt(row.reachDenominator),
    reachNote: asString(row.reachNote),
    deviation: asString(row.deviation),
    deviationReason: asString(row.deviationReason),
    contextualEvents: asString(row.contextualEvents),
    lecturerObservation: asString(row.lecturerObservation),
    evidenceRefs: stringArray(row.evidenceRefs),
    authorId: asString(row.authorId),
    createdAt: asString(row.createdAt),
  };
}

function parseIntervention(value: unknown): StoredResearchIntervention | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const status = typeof row.status === "string" && STATUSES.has(row.status as ResearchInterventionStatus)
    ? (row.status as ResearchInterventionStatus)
    : null;
  if (!status || typeof row.id !== "string" || typeof row.title !== "string") return null;
  return {
    id: row.id,
    title: row.title,
    description: asString(row.description),
    target: asString(row.target),
    responsibleResearcherIds: stringArray(row.responsibleResearcherIds),
    plannedStart: asString(row.plannedStart),
    plannedEnd: asString(row.plannedEnd),
    expectedEffect: asString(row.expectedEffect),
    expectedDelay: asString(row.expectedDelay),
    status,
    version: typeof row.version === "number" && Number.isInteger(row.version) && row.version > 0
      ? row.version
      : 1,
    createdById: asString(row.createdById),
    logs: Array.isArray(row.logs)
      ? row.logs.map(parseLog).filter((item): item is StoredResearchInterventionLog => Boolean(item))
      : [],
    createdAt: asString(row.createdAt),
    updatedAt: asString(row.updatedAt),
  };
}

export function parseStoredInterventions(value: unknown): StoredResearchIntervention[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(parseIntervention)
    .filter((item): item is StoredResearchIntervention => Boolean(item));
}

export function addStoredIntervention(
  current: StoredResearchIntervention[],
  intervention: StoredResearchIntervention,
): StoredResearchIntervention[] {
  if (current.some((item) => item.id === intervention.id)) {
    throw new Error(`Duplicate intervention id: ${intervention.id}`);
  }
  return [...current, intervention];
}

export function replaceStoredIntervention(
  current: StoredResearchIntervention[],
  intervention: StoredResearchIntervention,
): StoredResearchIntervention[] {
  let replaced = false;
  const next = current.map((item) => {
    if (item.id !== intervention.id) return item;
    replaced = true;
    return intervention;
  });
  if (!replaced) throw new Error(`Intervention not found: ${intervention.id}`);
  return next;
}

export function deriveInterventionFlags(
  intervention: StoredResearchIntervention,
  now = new Date(),
): { delayed: boolean; missed: boolean; hasDeviation: boolean } {
  const plannedStart = Date.parse(intervention.plannedStart);
  const plannedEnd = Date.parse(intervention.plannedEnd);
  const orderedLogs = [...intervention.logs].sort(
    (left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt),
  );
  const firstActual = orderedLogs[0] ? Date.parse(orderedLogs[0].occurredAt) : null;
  const nowMs = now.getTime();
  const delayed = intervention.status !== "CANCELLED" && (
    firstActual !== null
      ? Number.isFinite(plannedStart) && firstActual > plannedStart
      : Number.isFinite(plannedStart) && nowMs > plannedStart && intervention.status !== "COMPLETED"
  );
  const missed = intervention.status === "PLANNED"
    && Number.isFinite(plannedEnd)
    && nowMs > plannedEnd
    && intervention.logs.length === 0;
  const hasDeviation = intervention.logs.some((log) =>
    Boolean(log.deviation.trim())
    || Boolean(log.deviationReason.trim())
    || (
      Boolean(log.plannedDosage.trim())
      && Boolean(log.deliveredDosage.trim())
      && log.plannedDosage.trim() !== log.deliveredDosage.trim()
    )
  );
  return { delayed, missed, hasDeviation };
}

export function cycleStatusForInterventions(
  currentStatus: ResearchCycleStatus,
  interventions: StoredResearchIntervention[],
): ResearchCycleStatus {
  if (interventions.some((item) => item.status === "ACTIVE")) return "INTERVENTION_ACTIVE";

  const hasCompleted = interventions.some((item) => item.status === "COMPLETED");
  const hasPending = interventions.some((item) => item.status === "PLANNED");
  if (hasCompleted && !hasPending) return "OBSERVATION";
  if (currentStatus === "INTERVENTION_ACTIVE" && (hasPending || hasCompleted)) {
    return "INTERVENTION_ACTIVE";
  }
  return "BASELINE_LOCKED";
}
