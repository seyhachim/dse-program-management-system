import {
  QaSarBookPart3SnapshotSchema,
  type QaSarBookPart3Snapshot,
} from "@dse-pms/shared-types";
import { getQaSarBookPart3 } from "./part3-service.ts";

export async function buildQaSarBookPart3Snapshot(
  programmeId: string,
  cycleId: string,
): Promise<QaSarBookPart3Snapshot> {
  const current = await getQaSarBookPart3(programmeId, cycleId);
  return QaSarBookPart3SnapshotSchema.parse({
    programmeId: current.programmeId,
    cycleId: current.cycleId,
    capturedAt: new Date().toISOString(),
    note: current.note,
    criteria: current.criteria,
    associations: current.associations,
    improvementActions: current.improvementActions,
  });
}
