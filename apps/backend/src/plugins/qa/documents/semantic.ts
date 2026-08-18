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

function lexicalTerms(value: string): string[] {
  return [...new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])];
}

export function lexicalEvidenceScore(query: string, text: string): number {
  const terms = lexicalTerms(query);
  if (terms.length === 0) return 0;
  const haystack = text.toLowerCase();
  const matched = terms.filter((term) => haystack.includes(term)).length;
  return matched / terms.length;
}

export async function retrieveSemanticDocumentEvidence(
  programmeId: string,
  definition: QaSemanticEvidenceDefinition,
  topK = 10,
  provider: QaEmbeddingProvider | null = configuredQaEmbeddingProvider(),
): Promise<QaEvidenceCandidateResultView> {
  const query = `${definition.expectationStatement}\nExpected evidence: ${definition.description}`;
  const requiredDocumentType = documentTypeForDomain(definition.sourceDomain);
  const chunks = await prisma.qaDocumentChunk.findMany({
    where: {
      document: {
        programmeId,
        ...(requiredDocumentType ? { documentType: requiredDocumentType } : {}),
      },
    },
    include: { document: true },
  });

  let queryVector: number[] | null = null;
  if (provider) {
    try {
      queryVector = (await provider.embed([query]))[0] ?? null;
    } catch {
      // Fail soft to lexical retrieval. The pilot must remain usable without
      // pgvector or a live embedding service; provenance remains unchanged.
      queryVector = null;
    }
  }

  const ranked = chunks
    .map((chunk) => {
      const lexical = lexicalEvidenceScore(query, chunk.text);
      const semantic =
        provider && queryVector && chunk.embeddingModel === provider.model && chunk.embedding.length > 0
          ? cosineSimilarity(queryVector, chunk.embedding)
          : null;
      const semanticNormalized = semantic === null || !Number.isFinite(semantic)
        ? null
        : Math.max(0, Math.min(1, (semantic + 1) / 2));
      const score = semanticNormalized === null ? lexical : (semanticNormalized * 0.75) + (lexical * 0.25);
      return { chunk, score, lexical, semantic: semanticNormalized };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) =>
      b.score - a.score ||
      a.chunk.documentId.localeCompare(b.chunk.documentId) ||
      a.chunk.chunkIndex - b.chunk.chunkIndex
    )
    .slice(0, topK);

  const retrievalMode = queryVector ? "hybrid" : "lexical";
  return {
    programmeId,
    expectedEvidenceId: definition.id,
    evidenceType: definition.evidenceType,
    sourceDomain: definition.sourceDomain,
    status: "supported",
    reason: queryVector
      ? `Hybrid document retrieval ranked programme chunks using lexical relevance and embedding model ${provider?.model}.`
      : "Lexical document retrieval ranked programme chunks without requiring pgvector or an embedding provider.",
    candidates: ranked.map(({ chunk, score, lexical, semantic }) => ({
      key: `${definition.evidenceType}:QaDocumentChunk:${chunk.id}`,
      sourceKind: "documentChunk",
      evidenceType: definition.evidenceType,
      sourceDomain: definition.sourceDomain,
      title: `${chunk.document.title} · chunk ${chunk.chunkIndex + 1}`,
      summary: chunk.text.length > 700 ? `${chunk.text.slice(0, 697)}…` : chunk.text,
      entityType: "QaDocumentChunk",
      entityId: chunk.id,
      route: null,
      reportingDate:
        chunk.document.reportingEnd?.toISOString() ?? chunk.document.updatedAt.toISOString(),
      scope: { programmeId },
      provenance: {
        authority: "uploadedExternalDocument",
        ownerUnit: "DSE",
        version: chunk.document.version,
        approvalStatus: null,
        sourceUri: `qa-document:${chunk.documentId}#chunk=${chunk.id}`,
      },
      periodKey: chunk.document.reportingEnd
        ? String(chunk.document.reportingEnd.getUTCFullYear())
        : String(chunk.document.updatedAt.getUTCFullYear()),
      attributes: {
        documentId: chunk.documentId,
        documentType: chunk.document.documentType,
        documentVersion: chunk.document.version,
        chunkIndex: chunk.chunkIndex,
        pageNumber: chunk.pageNumber,
        sectionLabel: chunk.sectionLabel,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        relevance: Number(score.toFixed(6)),
        lexicalScore: Number(lexical.toFixed(6)),
        semanticScore: semantic === null ? null : Number(semantic.toFixed(6)),
        retrievalMode,
        embeddingModel: chunk.embeddingModel,
        contentHash: chunk.document.contentHash,
      },
    })),
  };
}
