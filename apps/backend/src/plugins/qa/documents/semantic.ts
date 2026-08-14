import type {
  QaEvidenceCandidateResultView,
  QaEvidenceSourceDomain,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import {
  configuredQaEmbeddingProvider,
  cosineSimilarity,
  type QaEmbeddingProvider,
} from "./embedding.ts";

export interface QaSemanticEvidenceDefinition {
  id: string;
  evidenceType: string;
  description: string;
  sourceDomain: QaEvidenceSourceDomain;
  expectationStatement: string;
}

function documentTypeForDomain(sourceDomain: QaEvidenceSourceDomain): string | null {
  if (sourceDomain === "policy") return "policy";
  if (sourceDomain === "survey") return "survey";
  if (sourceDomain === "minutes") return "minutes";
  return null;
}

export async function retrieveSemanticDocumentEvidence(
  programmeId: string,
  definition: QaSemanticEvidenceDefinition,
  topK = 10,
  provider: QaEmbeddingProvider | null = configuredQaEmbeddingProvider(),
): Promise<QaEvidenceCandidateResultView> {
  if (!provider) {
    return {
      programmeId,
      expectedEvidenceId: definition.id,
      evidenceType: definition.evidenceType,
      sourceDomain: definition.sourceDomain,
      status: "unsupported",
      reason:
        "QA semantic retrieval is unavailable because no embedding provider is configured. Set QA_EMBEDDING_API_URL and QA_EMBEDDING_MODEL, then embed the programme documents.",
      candidates: [],
    };
  }

  const query = `${definition.expectationStatement}\nExpected evidence: ${definition.description}`;
  const queryVector = (await provider.embed([query]))[0];
  if (!queryVector) {
    return {
      programmeId,
      expectedEvidenceId: definition.id,
      evidenceType: definition.evidenceType,
      sourceDomain: definition.sourceDomain,
      status: "unsupported",
      reason: "Embedding provider did not return a query vector.",
      candidates: [],
    };
  }

  const requiredDocumentType = documentTypeForDomain(definition.sourceDomain);
  const chunks = await prisma.qaDocumentChunk.findMany({
    where: {
      embeddingModel: provider.model,
      document: {
        programmeId,
        ...(requiredDocumentType ? { documentType: requiredDocumentType } : {}),
      },
    },
    include: { document: true },
  });

  const ranked = chunks
    .filter((chunk) => chunk.embedding.length > 0)
    .map((chunk) => ({
      chunk,
      similarity: cosineSimilarity(queryVector, chunk.embedding),
    }))
    .filter((item) => Number.isFinite(item.similarity) && item.similarity > -1)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  return {
    programmeId,
    expectedEvidenceId: definition.id,
    evidenceType: definition.evidenceType,
    sourceDomain: definition.sourceDomain,
    status: "supported",
    reason: `Semantic retrieval ranked programme document chunks with embedding model ${provider.model}.`,
    candidates: ranked.map(({ chunk, similarity }) => ({
      key: `${definition.evidenceType}:QaDocumentChunk:${chunk.id}`,
      evidenceType: definition.evidenceType,
      sourceDomain: definition.sourceDomain,
      title: `${chunk.document.title} · chunk ${chunk.chunkIndex + 1}`,
      summary: chunk.text.length > 700 ? `${chunk.text.slice(0, 697)}…` : chunk.text,
      entityType: "QaDocumentChunk",
      entityId: chunk.id,
      route: null,
      reportingDate:
        chunk.document.reportingEnd?.toISOString() ?? chunk.document.updatedAt.toISOString(),
      attributes: {
        documentId: chunk.documentId,
        documentType: chunk.document.documentType,
        documentVersion: chunk.document.version,
        pageNumber: chunk.pageNumber,
        sectionLabel: chunk.sectionLabel,
        similarity: Number(similarity.toFixed(6)),
        embeddingModel: chunk.embeddingModel,
        contentHash: chunk.document.contentHash,
      },
    })),
  };
}
