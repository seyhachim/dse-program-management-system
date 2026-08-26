import { randomUUID } from "node:crypto";
import {
  EMPTY_DSE_DOCUMENT,
  QaSarBookNarrativeSectionViewSchema,
  documentContentToPlainText,
  findQaSarBookStaticSection,
  parseStoredDocumentContent,
  serializeDocumentContent,
  type QaSarBookNarrativeSectionView,
  type SaveQaSarBookSectionInput,
} from "@dse-pms/shared-types";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../core/db/prisma.ts";
import { QaSarResourceNotFoundError, QaSarScopeMismatchError } from "../sar/service.ts";

type NarrativeRow = {
  cycleId: string;
  sectionKey: string;
  content: string;
  plainText: string;
  updatedAt: Date;
  updatedByName: string | null;
};

function resolveStaticSection(sectionKey: string) {
  const section = findQaSarBookStaticSection(sectionKey);
  if (!section || section.source === "generated") {
    throw new QaSarResourceNotFoundError("Editable SAR book section not found");
  }
  return section;
}

async function assertScope(programmeId: string, cycleId: string): Promise<void> {
  const cycle = await prisma.qaAssessmentCycle.findUnique({
    where: { id: cycleId },
    select: { programmeId: true },
  });
  if (!cycle) throw new QaSarResourceNotFoundError("QA assessment cycle not found");
  if (cycle.programmeId !== programmeId) {
    throw new QaSarScopeMismatchError("SAR book section belongs to a different programme");
  }
}

async function findRow(programmeId: string, cycleId: string, sectionKey: string): Promise<NarrativeRow | null> {
  const rows = await prisma.$queryRaw<NarrativeRow[]>(Prisma.sql`
    SELECT s."cycleId", s."sectionKey", s."content", s."plainText", s."updatedAt",
           u."name" AS "updatedByName"
    FROM "QaSarBookNarrativeSection" s
    LEFT JOIN "User" u ON u."id" = s."updatedById"
    WHERE s."programmeId" = ${programmeId}
      AND s."cycleId" = ${cycleId}
      AND s."sectionKey" = ${sectionKey}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

function toView(
  cycleId: string,
  sectionKey: string,
  source: "bookNarrative" | "structured",
  title: string,
  row: NarrativeRow | null,
): QaSarBookNarrativeSectionView {
  return QaSarBookNarrativeSectionViewSchema.parse({
    cycleId,
    sectionKey,
    title,
    source,
    content: row?.content ?? serializeDocumentContent(EMPTY_DSE_DOCUMENT),
    plainText: row?.plainText ?? "",
    editable: true,
    updatedByName: row?.updatedByName ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null,
  });
}

export async function getQaSarBookNarrativeSection(
  programmeId: string,
  cycleId: string,
  sectionKey: string,
): Promise<QaSarBookNarrativeSectionView> {
  const section = resolveStaticSection(sectionKey);
  await assertScope(programmeId, cycleId);
  return toView(
    cycleId,
    sectionKey,
    section.source as "bookNarrative" | "structured",
    section.title,
    await findRow(programmeId, cycleId, sectionKey),
  );
}

export async function saveQaSarBookNarrativeSection(
  cycleId: string,
  sectionKey: string,
  input: SaveQaSarBookSectionInput,
  userId: string,
): Promise<QaSarBookNarrativeSectionView> {
  const section = resolveStaticSection(sectionKey);
  await assertScope(input.programmeId, cycleId);
  const document = parseStoredDocumentContent(input.content);
  const plainText = documentContentToPlainText(document);
  const id = randomUUID();

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "QaSarBookNarrativeSection"
      ("id", "programmeId", "cycleId", "sectionKey", "content", "plainText", "updatedById", "createdAt", "updatedAt")
    VALUES
      (${id}, ${input.programmeId}, ${cycleId}, ${sectionKey}, ${input.content}, ${plainText}, ${userId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("cycleId", "sectionKey") DO UPDATE SET
      "content" = EXCLUDED."content",
      "plainText" = EXCLUDED."plainText",
      "updatedById" = EXCLUDED."updatedById",
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "QaSarBookNarrativeSection"."programmeId" = EXCLUDED."programmeId"
  `);

  const row = await findRow(input.programmeId, cycleId, sectionKey);
  if (!row) throw new QaSarScopeMismatchError("Could not save SAR book section in the requested programme");
  return toView(cycleId, sectionKey, section.source as "bookNarrative" | "structured", section.title, row);
}
