import type {
  ActiveLearningCluster,
  CreateActiveLearningClusterInput,
  CreateActiveLearningStrategyInput,
  CreateMethodInput,
  ManagedMethodsResponse,
  Method,
  MethodsResponse,
  UpdateActiveLearningClusterInput,
  UpdateActiveLearningStrategyInput,
  UpdateMethodInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

const methodSelect = { id: true, name: true, active: true } as const;

function clusterSelect(includeInactive: boolean) {
  return {
    where: includeInactive ? undefined : { active: true },
    orderBy: [{ sortOrder: "asc" as const }, { name: "asc" as const }],
    select: {
      id: true,
      name: true,
      description: true,
      sortOrder: true,
      active: true,
      strategies: {
        where: includeInactive ? undefined : { active: true },
        orderBy: [{ sortOrder: "asc" as const }, { name: "asc" as const }],
        select: {
          id: true,
          name: true,
          clusterId: true,
          sortOrder: true,
          active: true,
        },
      },
    },
  };
}

/** Programme-managed teaching/assessment/active-learning vocabulary. */
export const methodService = {
  async list(): Promise<MethodsResponse> {
    const [teaching, assessment, activeLearningClusters] = await Promise.all([
      prisma.teachingMethod.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
        select: methodSelect,
      }),
      prisma.assessmentMethod.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
        select: methodSelect,
      }),
      prisma.activeLearningCluster.findMany(clusterSelect(false)),
    ]);
    return { teaching, assessment, activeLearningClusters };
  },

  async listManaged(): Promise<ManagedMethodsResponse> {
    const [teaching, assessment, activeLearningClusters] = await Promise.all([
      prisma.teachingMethod.findMany({ orderBy: { name: "asc" }, select: methodSelect }),
      prisma.assessmentMethod.findMany({ orderBy: { name: "asc" }, select: methodSelect }),
      prisma.activeLearningCluster.findMany(clusterSelect(true)),
    ]);
    return { teaching, assessment, activeLearningClusters };
  },

  async addTeaching(input: CreateMethodInput): Promise<{ method: Method; created: boolean }> {
    try {
      const method = await prisma.teachingMethod.create({ data: { name: input.name }, select: methodSelect });
      return { method, created: true };
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        const existing = await prisma.teachingMethod.findUnique({ where: { name: input.name }, select: methodSelect });
        if (existing) return { method: existing, created: false };
      }
      throw err;
    }
  },

  async addAssessment(input: CreateMethodInput): Promise<{ method: Method; created: boolean }> {
    try {
      const method = await prisma.assessmentMethod.create({ data: { name: input.name }, select: methodSelect });
      return { method, created: true };
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        const existing = await prisma.assessmentMethod.findUnique({ where: { name: input.name }, select: methodSelect });
        if (existing) return { method: existing, created: false };
      }
      throw err;
    }
  },

  updateTeaching(id: string, input: UpdateMethodInput): Promise<Method> {
    return prisma.teachingMethod.update({ where: { id }, data: { name: input.name }, select: methodSelect });
  },

  updateAssessment(id: string, input: UpdateMethodInput): Promise<Method> {
    return prisma.assessmentMethod.update({ where: { id }, data: { name: input.name }, select: methodSelect });
  },

  setTeachingActive(id: string, active: boolean): Promise<Method> {
    return prisma.teachingMethod.update({ where: { id }, data: { active }, select: methodSelect });
  },

  setAssessmentActive(id: string, active: boolean): Promise<Method> {
    return prisma.assessmentMethod.update({ where: { id }, data: { active }, select: methodSelect });
  },

  createCluster(input: CreateActiveLearningClusterInput): Promise<ActiveLearningCluster> {
    return prisma.activeLearningCluster.create({
      data: input,
      select: clusterSelect(true).select,
    });
  },

  updateCluster(id: string, input: UpdateActiveLearningClusterInput): Promise<ActiveLearningCluster> {
    return prisma.activeLearningCluster.update({
      where: { id },
      data: input,
      select: clusterSelect(true).select,
    });
  },

  setClusterActive(id: string, active: boolean): Promise<ActiveLearningCluster> {
    return prisma.activeLearningCluster.update({
      where: { id },
      data: { active },
      select: clusterSelect(true).select,
    });
  },

  async createStrategy(input: CreateActiveLearningStrategyInput) {
    return prisma.activeLearningStrategy.create({ data: input });
  },

  async updateStrategy(id: string, input: UpdateActiveLearningStrategyInput) {
    return prisma.activeLearningStrategy.update({ where: { id }, data: input });
  },

  async setStrategyActive(id: string, active: boolean) {
    return prisma.activeLearningStrategy.update({ where: { id }, data: { active } });
  },
};

export type MethodService = typeof methodService;
