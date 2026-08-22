import type {
  CreateStudentInput,
  ListStudentsQuery,
  StudentProfileInput,
  StudentStatus,
  UpdateStudentInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

const withProfile = { profile: true } as const;

function hasProfileValues(profile: StudentProfileInput | undefined): boolean {
  return Boolean(
    profile && Object.values(profile).some((value) => value !== null && value !== undefined),
  );
}

/**
 * Students business logic over Prisma. This object is the plugin's public
 * service surface — it is what other plugins receive from
 * `registry.get("students").service`, so its method signatures are the
 * cross-plugin contract.
 */
export const studentService = {
  async list(query: ListStudentsQuery) {
    const { search, activeOnly } = query;
    return prisma.student.findMany({
      where: {
        ...(activeOnly ? { status: "Active" } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { studentId: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: withProfile,
      orderBy: { createdAt: "desc" },
    });
  },

  async getById(id: string) {
    return prisma.student.findUnique({ where: { id }, include: withProfile });
  },

  async getByUserId(userId: string) {
    return prisma.student.findUnique({ where: { userId }, include: withProfile });
  },

  async findByIds(ids: string[]) {
    return prisma.student.findMany({ where: { id: { in: ids } }, include: withProfile });
  },

  async create(input: CreateStudentInput) {
    const { profile, ...student } = input;
    return prisma.student.create({
      data: {
        ...student,
        ...(hasProfileValues(profile) ? { profile: { create: profile } } : {}),
      },
      include: withProfile,
    });
  },

  async update(id: string, input: UpdateStudentInput) {
    const { profile, ...student } = input;
    const hasProfilePatch = profile !== undefined && Object.keys(profile).length > 0;
    return prisma.student.update({
      where: { id },
      data: {
        ...student,
        ...(hasProfilePatch
          ? {
              profile: {
                upsert: {
                  create: profile,
                  update: profile,
                },
              },
            }
          : {}),
      },
      include: withProfile,
    });
  },

  async setStatus(id: string, status: StudentStatus) {
    return prisma.student.update({
      where: { id },
      data: { status },
      include: withProfile,
    });
  },

  async remove(id: string) {
    return prisma.student.delete({ where: { id } });
  },
};

export type StudentService = typeof studentService;
