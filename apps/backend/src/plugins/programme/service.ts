import {
  PROGRAMME_TITLE,
  ProgrammeProfileSchema,
  type ProgrammeAcademicConfig,
  type ProgramCompetencyWithPlos,
  type ProgramPolicy,
  type ProgrammeProfile,
  type UpdateProgramCompetencyPlosInput,
  type UpdateProgramPolicyInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

const competencySelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  order: true,
  active: true,
  ploLinks: {
    select: {
      plo: {
        select: {
          id: true,
          code: true,
          description: true,
          order: true,
        },
      },
    },
  },
} as const;

function toCompetencyWithPlos(
  competency: Awaited<
    ReturnType<typeof prisma.programCompetency.findFirstOrThrow>
  > & {
    ploLinks?: {
      plo: {
        id: string;
        code: string;
        description: string;
        order: number;
      };
    }[];
  },
): ProgramCompetencyWithPlos {
  return {
    id: competency.id,
    code: competency.code,
    name: competency.name,
    description: competency.description,
    order: competency.order,
    active: competency.active,
    plos: (competency.ploLinks ?? [])
      .map((link) => link.plo)
      .sort((a, b) => a.order - b.order),
  };
}

export const programmeService = {
  async getAcademicConfig(): Promise<ProgrammeAcademicConfig> {
    const [plos, competencies, policy, profile] = await Promise.all([
      prisma.programLearningOutcome.findMany({
        where: { active: true },
        orderBy: { order: "asc" },
        select: {
          id: true,
          code: true,
          description: true,
          order: true,
          active: true,
        },
      }),

      prisma.programCompetency.findMany({
        where: { active: true },
        orderBy: { order: "asc" },
        select: competencySelect,
      }),

      prisma.programPolicy.findUnique({
        where: { id: "dse" },
        select: {
          attendancePreparation: true,
          academicIntegrity: true,
          assignmentsLateSubmission: true,
          examinationRules: true,
          penaltiesConsequences: true,
        },
      }),

      prisma.programmeProfile.findUnique({
        where: { id: "dse" },
        select: {
          vision: true,
          mission: true,
          goals: true,
          educationalPhilosophy: true,
          peos: true,
        },
      }),
    ]);

    const programmePolicy: ProgramPolicy = {
      attendancePreparation: policy?.attendancePreparation ?? "",
      academicIntegrity: policy?.academicIntegrity ?? "",
      assignmentsLateSubmission: policy?.assignmentsLateSubmission ?? "",
      examinationRules: policy?.examinationRules ?? "",
      penaltiesConsequences: policy?.penaltiesConsequences ?? "",
    };

    const programmeProfile: ProgrammeProfile = ProgrammeProfileSchema.parse({
      vision: profile?.vision ?? "",
      mission: profile?.mission ?? [],
      goals: profile?.goals ?? [],
      educationalPhilosophy: profile?.educationalPhilosophy ?? [],
      peos: profile?.peos ?? [],
    });

    return {
      title: PROGRAMME_TITLE,
      profile: programmeProfile,
      plos,
      competencies: competencies.map((competency) => ({
        id: competency.id,
        code: competency.code,
        name: competency.name,
        description: competency.description,
        order: competency.order,
        active: competency.active,
        plos: competency.ploLinks
          .map((link) => link.plo)
          .sort((a, b) => a.order - b.order),
      })),
      policy: programmePolicy,
    };
  },

  async updateProfile(input: ProgrammeProfile): Promise<ProgrammeProfile> {
    const updated = await prisma.programmeProfile.upsert({
      where: { id: "dse" },
      create: { id: "dse", ...input },
      update: input,
      select: {
        vision: true,
        mission: true,
        goals: true,
        educationalPhilosophy: true,
        peos: true,
      },
    });

    return ProgrammeProfileSchema.parse(updated);
  },

  async updatePolicy(input: UpdateProgramPolicyInput): Promise<ProgramPolicy> {
    return prisma.programPolicy
      .upsert({
        where: { id: "dse" },
        create: { id: "dse", ...input },
        update: input,
        select: {
          attendancePreparation: true,
          academicIntegrity: true,
          assignmentsLateSubmission: true,
          examinationRules: true,
          penaltiesConsequences: true,
        },
      })
      .then((policy) => ({ ...policy }));
  },

  /**
   * Replace all PLO mappings for one programme competency.
   *
   * PLO codes are used at the API boundary because PLO1, PLO2, ... are the
   * stable academic identifiers already used by Course Specification.
   */
  async updateCompetencyPlos(
    competencyCode: string,
    input: UpdateProgramCompetencyPlosInput,
  ): Promise<ProgramCompetencyWithPlos | null> {
    const competency = await prisma.programCompetency.findUnique({
      where: { code: competencyCode },
      select: { id: true },
    });

    if (!competency) {
      return null;
    }

    const uniquePloCodes = [...new Set(input.ploCodes)];

    const plos =
      uniquePloCodes.length === 0
        ? []
        : await prisma.programLearningOutcome.findMany({
            where: {
              code: {
                in: uniquePloCodes,
              },
            },
            select: {
              id: true,
              code: true,
            },
          });

    // Do not silently ignore invalid academic identifiers.
    if (plos.length !== uniquePloCodes.length) {
      const foundCodes = new Set(plos.map((plo) => plo.code));

      const missingCodes = uniquePloCodes.filter(
        (code) => !foundCodes.has(code),
      );

      throw new InvalidPloCodesError(missingCodes);
    }

    await prisma.$transaction(async (tx) => {
      await tx.programCompetencyPlo.deleteMany({
        where: {
          competencyId: competency.id,
        },
      });

      if (plos.length > 0) {
        await tx.programCompetencyPlo.createMany({
          data: plos.map((plo) => ({
            competencyId: competency.id,
            ploId: plo.id,
          })),
        });
      }
    });

    const updated = await prisma.programCompetency.findUniqueOrThrow({
      where: {
        id: competency.id,
      },
      select: competencySelect,
    });

    return {
      id: updated.id,
      code: updated.code,
      name: updated.name,
      description: updated.description,
      order: updated.order,
      active: updated.active,
      plos: updated.ploLinks
        .map((link) => link.plo)
        .sort((a, b) => a.order - b.order),
    };
  },
};

export class InvalidPloCodesError extends Error {
  constructor(public readonly codes: string[]) {
    super(`Unknown PLO code(s): ${codes.join(", ")}`);
    this.name = "InvalidPloCodesError";
  }
}

export type ProgrammeService = typeof programmeService;
