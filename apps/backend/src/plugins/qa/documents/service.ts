import type {
  CreateQaDocumentInput,
  QaDocumentType,
  QaDocumentView,
  ReplaceQaDocumentInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import {
  chunkQaDocument,
  qaDocumentContentHash,
  type QaDocumentChunkDraft,
} from "./chunking.ts";
import {
  QaEmbeddingProviderError,
  configuredQaEmbeddingProvider,
  type QaEmbeddingProvider,
} from "./embedding.ts";

export class QaDocumentResourceNotFoundError extends Error {}
export class QaDocumentScopeMismatchError extends Error {}
export class QaDocumentEmbeddingUnavailableError extends Error {}

async function embedTexts(
  provider: QaEmbeddingProvider,
  texts: string[],
): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += 32) {
    vectors.push(...(await provider.embed(texts.slice(start, start + 32))));
  }
  return vectors;
}

async function embeddedChunkData(
  drafts: QaDocumentChunkDraft[],
  provider: QaEmbeddingProvider | null,
) {
  if (!provider || drafts.length === 0) {
    return drafts.map((chunk) => ({ ...chunk, embedding: [] as number[], embeddingModel: "" }));
  }
  const vectors = await embedTexts(provider, drafts.map((chunk) => chunk.text));
  return drafts.map((chunk, index) => ({
    ...chunk,
    embedding: vectors[index] ?? [],
    embeddingModel: provider.model,
  }));
}

function toDocumentView(document: {
  id: string;
  programmeId: string;
  title: string;
  documentType: string;
  sourceUrl: string | null;
  sourceRef: string;
  version: string;
  reportingStart: Date | null;
  reportingEnd: Date | null;
  contentHash: string;
  createdAt: Date;
  updatedAt: Date;
  chunks: Array<{ embedding: number[]; embeddingModel: string }>;
}): QaDocumentView {
  const embedded = document.chunks.filter((chunk) => chunk.embedding.length > 0);
  const models = [...new Set(embedded.map((chunk) => chunk.embeddingModel).filter(Boolean))];
  return {
    id: document.id,
    programmeId: document.programmeId,
    title: document.title,
    documentType: document.documentType as QaDocumentType,
    sourceUrl: document.sourceUrl,
    sourceRef: document.sourceRef,
    version: document.version,
    reportingStart: document.reportingStart?.toISOString() ?? null,
    reportingEnd: document.reportingEnd?.toISOString() ?? null,
    contentHash: document.contentHash,
    chunkCount: document.chunks.length,
    embeddedChunkCount: embedded.length,
    embeddingModel: models.length === 1 ? models[0]! : null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

async function findDocumentForView(id: string): Promise<QaDocumentView> {
  const document = await prisma.qaDocument.findUnique({
    where: { id },
    include: { chunks: { select: { embedding: true, embeddingModel: true } } },
  });
  if (!document) throw new QaDocumentResourceNotFoundError("QA document not found");
  return toDocumentView(document);
}

async function ensureProgramme(programmeId: string): Promise<void> {
  const programme = await prisma.programme.findUnique({
    where: { id: programmeId },
    select: { id: true },
  });
  if (!programme) throw new QaDocumentResourceNotFoundError("Programme not found");
}

async function ensureDocumentScope(documentId: string, programmeId: string) {
  const document = await prisma.qaDocument.findUnique({
    where: { id: documentId },
    select: { id: true, programmeId: true },
  });
  if (!document) throw new QaDocumentResourceNotFoundError("QA document not found");
  if (document.programmeId !== programmeId) {
    throw new QaDocumentScopeMismatchError("QA document does not belong to this programme");
  }
  return document;
}

export async function createQaDocument(
  input: CreateQaDocumentInput,
  provider: QaEmbeddingProvider | null = configuredQaEmbeddingProvider(),
): Promise<QaDocumentView> {
  await ensureProgramme(input.programmeId);
  const documentId = crypto.randomUUID();
  const drafts = chunkQaDocument(documentId, input.blocks);
  const chunks = await embeddedChunkData(drafts, provider);

  await prisma.$transaction(async (tx) => {
    await tx.qaDocument.create({
      data: {
        id: documentId,
        programmeId: input.programmeId,
        title: input.title,
        documentType: input.documentType,
        sourceUrl: input.sourceUrl,
        sourceRef: input.sourceRef,
        version: input.version,
        reportingStart: input.reportingStart,
        reportingEnd: input.reportingEnd,
        contentHash: qaDocumentContentHash(input.blocks),
      },
    });
    if (chunks.length > 0) {
      await tx.qaDocumentChunk.createMany({
        data: chunks.map((chunk) => ({
          id: chunk.id,
          documentId,
          chunkIndex: chunk.chunkIndex,
          pageNumber: chunk.pageNumber,
          sectionLabel: chunk.sectionLabel,
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset,
          text: chunk.text,
          embedding: chunk.embedding,
          embeddingModel: chunk.embeddingModel,
        })),
      });
    }
  });

  return findDocumentForView(documentId);
}

export async function replaceQaDocument(
  documentId: string,
  input: ReplaceQaDocumentInput,
  provider: QaEmbeddingProvider | null = configuredQaEmbeddingProvider(),
): Promise<QaDocumentView> {
  await ensureDocumentScope(documentId, input.programmeId);
  const drafts = chunkQaDocument(documentId, input.blocks);
  const chunks = await embeddedChunkData(drafts, provider);

  await prisma.$transaction(async (tx) => {
    await tx.qaDocumentChunk.deleteMany({ where: { documentId } });
    await tx.qaDocument.update({
      where: { id: documentId },
      data: {
        title: input.title,
        documentType: input.documentType,
        sourceUrl: input.sourceUrl,
        sourceRef: input.sourceRef,
        version: input.version,
        reportingStart: input.reportingStart,
        reportingEnd: input.reportingEnd,
        contentHash: qaDocumentContentHash(input.blocks),
      },
    });
    if (chunks.length > 0) {
      await tx.qaDocumentChunk.createMany({
        data: chunks.map((chunk) => ({
          id: chunk.id,
          documentId,
          chunkIndex: chunk.chunkIndex,
          pageNumber: chunk.pageNumber,
          sectionLabel: chunk.sectionLabel,
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset,
          text: chunk.text,
          embedding: chunk.embedding,
          embeddingModel: chunk.embeddingModel,
        })),
      });
    }
  });

  return findDocumentForView(documentId);
}

export async function listQaDocuments(
  programmeId: string,
  documentType?: QaDocumentType,
): Promise<QaDocumentView[]> {
  await ensureProgramme(programmeId);
  const documents = await prisma.qaDocument.findMany({
    where: { programmeId, ...(documentType ? { documentType } : {}) },
    orderBy: [{ reportingEnd: "desc" }, { updatedAt: "desc" }],
    include: { chunks: { select: { embedding: true, embeddingModel: true } } },
  });
  return documents.map(toDocumentView);
}

export async function deleteQaDocument(
  documentId: string,
  programmeId: string,
): Promise<void> {
  await ensureDocumentScope(documentId, programmeId);
  await prisma.qaDocument.delete({ where: { id: documentId } });
}

export async function refreshQaDocumentEmbeddings(
  documentId: string,
  programmeId: string,
  provider: QaEmbeddingProvider | null = configuredQaEmbeddingProvider(),
): Promise<QaDocumentView> {
  await ensureDocumentScope(documentId, programmeId);
  if (!provider) {
    throw new QaDocumentEmbeddingUnavailableError(
      "QA embedding provider is not configured. Set QA_EMBEDDING_API_URL and QA_EMBEDDING_MODEL.",
    );
  }

  const chunks = await prisma.qaDocumentChunk.findMany({
    where: { documentId },
    orderBy: { chunkIndex: "asc" },
    select: { id: true, text: true },
  });
  try {
    const vectors = await embedTexts(provider, chunks.map((chunk) => chunk.text));
    await prisma.$transaction(
      chunks.map((chunk, index) =>
        prisma.qaDocumentChunk.update({
          where: { id: chunk.id },
          data: {
            embedding: vectors[index] ?? [],
            embeddingModel: provider.model,
          },
        }),
      ),
    );
  } catch (error) {
    if (error instanceof QaEmbeddingProviderError) throw error;
    throw new QaEmbeddingProviderError("Could not refresh QA document embeddings");
  }
  return findDocumentForView(documentId);
}
