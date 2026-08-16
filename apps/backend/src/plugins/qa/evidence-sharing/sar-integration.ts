import type { QaSarDocumentModelView } from "@dse-pms/shared-types";
import {
  createQaEvidenceExternalReference,
  createQaEvidenceSnapshot,
} from "./service.ts";

/**
 * Freeze every evidence item used by an official SAR and mint a fresh unlisted
 * assessor URL whose token is embedded only in the immutable release snapshot.
 * The database keeps only the token hash, so the URL cannot be reconstructed by
 * normal internal reads after finalization.
 */
export async function prepareQaSarExternalEvidence(
  model: QaSarDocumentModelView,
  finalizedById: string,
): Promise<QaSarDocumentModelView> {
  const evidenceRegister = [];

  for (const item of model.evidenceRegister) {
    const snapshot = await createQaEvidenceSnapshot(
      model.programmeId,
      model.cycleId,
      item.evidenceId,
      finalizedById,
    );
    const reference = await createQaEvidenceExternalReference(
      snapshot.id,
      { programmeId: model.programmeId, expiresAt: null },
      finalizedById,
    );
    evidenceRegister.push({
      ...item,
      snapshotId: snapshot.id,
      referenceCode: snapshot.referenceCode,
      externalUrl: reference.externalPath,
      capturedAt: snapshot.capturedAt,
    });
  }

  return { ...model, evidenceRegister };
}
