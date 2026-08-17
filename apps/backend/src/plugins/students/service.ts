import type {
  CreateStudentInput,
  ListStudentsQuery,
  StudentStatus,
  UpdateStudentInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

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
      orderBy: { createdAt: "desc" },
    });
  },

  async getById(id: string) {
    return prisma.student.findUnique({ where: { id } });
  },

  async getByUserId(userId: string) {
    return prisma.student.findUnique({ where: { userId } });
  },

  async findByIds(ids: string[]) {
    return prisma.student.findMany({ where: { id: { in: ids } } });
  },

  async create(input: CreateStudentInput) {
    return prisma.student.create({ data: input });
  },

  async update(id: string, input: UpdateStudentInput) {
    return prisma.student.update({ where: { id }, data: input });
  },

  async setStatus(id: string, status: StudentStatus) {
    return prisma.student.update({ where: { id }, data: { status } });
  },

  async remove(id: string) {
    return prisma.student.delete({ where: { id } });
  },
};

export type StudentService = typeof studentService;
