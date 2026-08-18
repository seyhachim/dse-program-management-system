import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type {
  CreateQaImprovementActionFollowUpInput,
  QaImprovementActionFollowUpView,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import {
  QaImprovementActionResourceNotFoundError,
  QaImprovementActionScopeMismatchError,
} from "./service.ts";

type FollowUpRow = {
  id: string; programmeId: string; actionId: string; evidenceId: string; evidenceTitle: string;
  evidenceStatus: "Draft" | "Ready" | "Reviewed"; note: string; linkedById: string; linkedAt: Date;
};

const status = { Draft: "draft", Ready: "ready", Reviewed: "reviewed" } as const;
const toView = (row: FollowUpRow): QaImprovementActionFollowUpView => ({
  ...row, evidenceStatus: status[row.evidenceStatus], linkedAt: row.linkedAt.toISOString(),
});

const selectFollowUps = Prisma.sql`
  SELECT f.id, f."programmeId", f."actionId", f."evidenceId", e.title AS "evidenceTitle",
         e.status AS "evidenceStatus", f.note, f."linkedById", f."linkedAt"
  FROM "QaImprovementActionFollowUp" f
  JOIN "QaEvidence" e ON e.id = f."evidenceId"
`;

export async function createQaImprovementActionFollowUp(
  actionId: string,
  input: CreateQaImprovementActionFollowUpInput,
  linkedById: string,
): Promise<QaImprovementActionFollowUpView> {
  const [actions, evidence] = await Promise.all([
    prisma.$queryRaw<{ id: string; programmeId: string }[]>(Prisma.sql`
      SELECT id, "programmeId" FROM "QaImprovementAction" WHERE id = ${actionId} LIMIT 1
    `),
    prisma.qaEvidence.findUnique({ where: { id: input.evidenceId }, select: { id: true, programmeId: true, status: true } }),
  ]);
  const action = actions[0];
  if (!action || !evidence) throw new QaImprovementActionResourceNotFoundError("Improvement action or follow-up evidence not found");
  if (action.programmeId !== input.programmeId || evidence.programmeId !== input.programmeId) {
    throw new QaImprovementActionScopeMismatchError("Improvement action and follow-up evidence must belong to the same programme");
  }
  if (evidence.status === "Draft") {
    throw new QaImprovementActionScopeMismatchError("Draft QA evidence cannot be linked as follow-up evidence; mark it Ready or Reviewed first");
  }
  const id = randomUUID();
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "QaImprovementActionFollowUp" ("id", "programmeId", "actionId", "evidenceId", "note", "linkedById")
    VALUES (${id}, ${input.programmeId}, ${actionId}, ${input.evidenceId}, ${input.note}, ${linkedById})
  `);
  const rows = await prisma.$queryRaw<FollowUpRow[]>(Prisma.sql`${selectFollowUps} WHERE f.id = ${id} LIMIT 1`);
  if (!rows[0]) throw new QaImprovementActionResourceNotFoundError("Created follow-up relationship not found");
  return toView(rows[0]);
}

export async function listQaImprovementActionFollowUps(
  actionId: string, programmeId: string,
): Promise<QaImprovementActionFollowUpView[]> {
  const rows = await prisma.$queryRaw<FollowUpRow[]>(Prisma.sql`
    ${selectFollowUps}
    WHERE f."actionId" = ${actionId} AND f."programmeId" = ${programmeId}
    ORDER BY f."linkedAt" ASC, f.id ASC
  `);
  return rows.map(toView);
}
