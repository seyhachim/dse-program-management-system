import { createHash } from "node:crypto";
import { Prisma, type ProgrammeOutcomeIndicator } from "@prisma/client";
import type { RecordProgrammeOutcomeIndicatorInput } from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const rate = (numerator: number, denominator: number) => denominator === 0 ? null : Math.round((numerator / denominator) * 10000) / 100;

export async function recordProgrammeOutcomeIndicator(
  input: RecordProgrammeOutcomeIndicatorInput,
): Promise<ProgrammeOutcomeIndicator> {
  const cohort = await prisma.studentCohort.findFirst({ where: { id: input.cohortId, programmeId: input.programmeId }, select: { id: true } });
  if (!cohort) throw new Error("Cohort not found in programme");
  if (input.numerator > input.denominator) throw new Error("Numerator cannot exceed denominator");

  const definitionHash = hash(input.definition);
  const normalizedSourceRefs = [...new Set(input.sourceRefs)].sort();
  const calculationHash = hash({
    programmeId: input.programmeId, cohortId: input.cohortId, indicatorType: input.indicatorType,
    academicYear: input.academicYear, periodKey: input.periodKey, numerator: input.numerator, denominator: input.denominator,
    definitionVersion: input.definitionVersion, definitionHash, calculationVersion: input.calculationVersion,
    sourceRefs: normalizedSourceRefs,
  });
  const existing = await prisma.programmeOutcomeIndicator.findUnique({ where: { calculationHash } });
  if (existing) return existing;
  const previous = await prisma.programmeOutcomeIndicator.findFirst({
    where: { programmeId: input.programmeId, cohortId: input.cohortId, indicatorType: input.indicatorType, periodKey: input.periodKey },
    orderBy: { generatedAt: "desc" },
  });
  return prisma.programmeOutcomeIndicator.create({
    data: {
      programmeId: input.programmeId, cohortId: input.cohortId, indicatorType: input.indicatorType,
      academicYear: input.academicYear, periodKey: input.periodKey, numerator: input.numerator, denominator: input.denominator,
      value: rate(input.numerator, input.denominator), definitionVersion: input.definitionVersion,
      definition: canonical(input.definition) as Prisma.InputJsonValue, definitionHash,
      calculationVersion: input.calculationVersion, sourceRefs: normalizedSourceRefs, calculationHash,
      supersedesIndicatorId: previous?.id ?? null,
    },
  });
}
