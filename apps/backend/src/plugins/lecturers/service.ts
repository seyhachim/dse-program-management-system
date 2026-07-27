import type {
  CreateLecturerInput,
  LecturersServiceContract,
  ListLecturersQuery,
  UpdateLecturerInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

/**
 * Lecturers = Users with role "lecturer". `list`/`getById` are the public
 * cross-plugin surface (LecturersServiceContract) so Courses and Offerings can
 * resolve lecturers via the registry. create/update/remove back the admin
 * editing UI; they return the same richer shape (incl. syllabus contact fields).
 */

/** Fields exposed for a lecturer — a superset of the lean cross-plugin ref. */
const lecturerSelect = {
  id: true,
  name: true,
  email: true,
  title: true,
  qualification: true,
  phone: true,
} as const;

export const lecturerService = {
  list(query: ListLecturersQuery = {}) {
    const { search } = query;
    return prisma.user.findMany({
      where: {
        role: "lecturer",
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: lecturerSelect,
      orderBy: { name: "asc" },
    });
  },

  getById(id: string) {
    return prisma.user.findFirst({
      where: { id, role: "lecturer" },
      select: lecturerSelect,
    });
  },

  create(input: CreateLecturerInput) {
    return prisma.user.create({
      data: { ...input, role: "lecturer", roleRef: { connect: { slug: "lecturer" } } },
      select: lecturerSelect,
    });
  },

  async update(id: string, input: UpdateLecturerInput) {
    // Scope the update to lecturers so this endpoint can't mutate admins/students.
    const existing = await prisma.user.findFirst({ where: { id, role: "lecturer" }, select: { id: true } });
    if (!existing) throw new NotFoundError("Lecturer not found");
    return prisma.user.update({ where: { id }, data: input, select: lecturerSelect });
  },

  async remove(id: string) {
    const existing = await prisma.user.findFirst({ where: { id, role: "lecturer" }, select: { id: true } });
    if (!existing) throw new NotFoundError("Lecturer not found");
    // Course/Offering.lecturerId is ON DELETE SET NULL, so this won't orphan rows.
    return prisma.user.delete({ where: { id } });
  },
} satisfies LecturersServiceContract & Record<string, unknown>;

/** Thrown when a lecturer id doesn't resolve to a lecturer User. */
export class NotFoundError extends Error {}

export type LecturerService = typeof lecturerService;
