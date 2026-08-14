// Temporary branch-only smoke test; removed before merge.
import { prisma } from "../src/core/db/prisma.ts";
import type { QaEmbeddingProvider } from "../src/plugins/qa/documents/embedding.ts";
import {
  createQaDocument,
  deleteQaDocument,
  replaceQaDocument,
} from "../src/plugins/qa/documents/service.ts";
import { getQaEvidenceCandidates } from "../src/plugins/qa/evidence/service.ts";

class FakeSemanticProvider implements QaEmbeddingProvider {
  readonly model = "qa-smoke-semantic-v1";

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const normalized = text.toLowerCase();
      const count = (terms: string[]) =>
        terms.reduce((sum, term) => sum + (normalized.split(term).length - 1), 0);
      return [
        count(["curriculum", "mapping"]),
        count(["alignment", "constructive"]),
        count(["clo", "plo", "outcome"]),
        count(["assessment", "learning"]),
        count(["cafeteria", "maintenance", "parking"]),
      ];
    });
  }
}

const provider = new FakeSemanticProvider();
const suffix = Date.now().toString(36);
const programmeA = `qa-smoke-189-a-${suffix}`;
const programmeB = `qa-smoke-189-b-${suffix}`;

await prisma.programme.createMany({
  data: [
    { id: programmeA, code: `QA189A-${suffix}`, name: "QA 189 programme A" },
    { id: programmeB, code: `QA189B-${suffix}`, name: "QA 189 programme B" },
  ],
});

try {
  const relevant = await createQaDocument(
    {
      programmeId: programmeA,
      title: "Curriculum Alignment Report",
      documentType: "report",
      sourceUrl: null,
      sourceRef: "CURR-ALIGN-2026",
      version: "1",
      reportingStart: new Date("2026-01-01T00:00:00Z"),
      reportingEnd: new Date("2026-12-31T00:00:00Z"),
      blocks: [
        {
          pageNumber: 4,
          sectionLabel: "Constructive alignment",
          text: "The curriculum mapping aligns course CLO outcomes with programme PLO outcomes, learning activities, and assessment evidence. Constructive alignment is reviewed across the programme.",
        },
      ],
    },
    provider,
  );
  if (relevant.embeddedChunkCount !== relevant.chunkCount || relevant.chunkCount === 0) {
    throw new Error("Relevant document chunks were not embedded");
  }

  const irrelevant = await createQaDocument(
    {
      programmeId: programmeA,
      title: "Facilities Maintenance Note",
      documentType: "report",
      sourceUrl: null,
      sourceRef: "FAC-2026",
      version: "1",
      reportingStart: null,
      reportingEnd: new Date("2026-12-31T00:00:00Z"),
      blocks: [
        {
          pageNumber: 1,
          sectionLabel: "Maintenance",
          text: "Cafeteria maintenance and parking maintenance schedules were updated for the semester.",
        },
      ],
    },
    provider,
  );

  await createQaDocument(
    {
      programmeId: programmeB,
      title: "Other Programme Curriculum Mapping",
      documentType: "report",
      sourceUrl: null,
      sourceRef: "OTHER-CURR",
      version: "1",
      reportingStart: null,
      reportingEnd: new Date("2026-12-31T00:00:00Z"),
      blocks: [
        {
          pageNumber: 2,
          sectionLabel: "Alignment",
          text: "Curriculum mapping constructive alignment CLO PLO outcomes assessment learning alignment curriculum mapping.",
        },
      ],
    },
    provider,
  );

  const expected = await prisma.qaExpectedEvidence.findFirstOrThrow({
    where: {
      evidenceType: "curriculum-mapping",
      expectation: {
        active: true,
        requirement: { code: "2.4", criterion: { frameworkId: "aun-qa-programme-v4" } },
      },
    },
    select: { id: true },
  });

  const missingProvider = await getQaEvidenceCandidates(programmeA, expected.id, {
    embeddingProvider: null,
  });
  if (missingProvider.status !== "unsupported") {
    throw new Error("Semantic retrieval should fail closed when no embedding provider is configured");
  }

  const ranked = await getQaEvidenceCandidates(programmeA, expected.id, {
    topK: 5,
    embeddingProvider: provider,
  });
  if (ranked.status !== "supported" || ranked.candidates.length < 2) {
    throw new Error("Semantic retrieval did not return embedded programme chunks");
  }
  if (ranked.candidates[0]?.attributes.documentId !== relevant.id) {
    throw new Error("Relevant curriculum mapping document was not ranked first");
  }
  if (ranked.candidates.some((item) => item.title.includes("Other Programme"))) {
    throw new Error("Semantic retrieval leaked chunks from another programme");
  }
  if (ranked.candidates[0]?.attributes.pageNumber !== 4) {
    throw new Error("Page provenance was not preserved in semantic candidates");
  }

  const oldHash = relevant.contentHash;
  const oldChunkIds = (await prisma.qaDocumentChunk.findMany({
    where: { documentId: relevant.id },
    select: { id: true },
  })).map((item) => item.id);
  const replaced = await replaceQaDocument(
    relevant.id,
    {
      programmeId: programmeA,
      title: "Curriculum Alignment Report",
      documentType: "report",
      sourceUrl: null,
      sourceRef: "CURR-ALIGN-2026",
      version: "2",
      reportingStart: new Date("2026-01-01T00:00:00Z"),
      reportingEnd: new Date("2026-12-31T00:00:00Z"),
      blocks: [
        {
          pageNumber: 5,
          sectionLabel: "Revised alignment",
          text: "The revised curriculum mapping strengthens constructive alignment between CLO and PLO outcomes, assessment tasks, and student learning activities.",
        },
      ],
    },
    provider,
  );
  if (replaced.contentHash === oldHash || replaced.version !== "2") {
    throw new Error("Document replacement did not update content hash/version");
  }
  const remainingOldChunks = await prisma.qaDocumentChunk.count({
    where: { id: { in: oldChunkIds } },
  });
  if (remainingOldChunks !== 0) {
    throw new Error("Old chunks survived full document replacement");
  }

  const irrelevantChunkCount = await prisma.qaDocumentChunk.count({
    where: { documentId: irrelevant.id },
  });
  if (irrelevantChunkCount === 0) throw new Error("Irrelevant smoke document had no chunks");
  await deleteQaDocument(irrelevant.id, programmeA);
  if ((await prisma.qaDocumentChunk.count({ where: { documentId: irrelevant.id } })) !== 0) {
    throw new Error("Deleting a QA document did not cascade to its chunks");
  }

  console.log("Issue 189 document ingestion and semantic retrieval smoke test passed.");
} finally {
  await prisma.qaDocument.deleteMany({ where: { programmeId: { in: [programmeA, programmeB] } } });
  await prisma.programme.deleteMany({ where: { id: { in: [programmeA, programmeB] } } });
  await prisma.$disconnect();
}
