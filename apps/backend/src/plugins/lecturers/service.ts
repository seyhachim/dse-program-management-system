import type {
  AuthServiceContract,
  CreateLecturerInput,
  LecturersServiceContract,
  ListLecturersQuery,
  UpdateLecturerInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";

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

  async create(input: CreateLecturerInput) {
    const user = await prisma.user.create({
      data: { ...input, role: "lecturer", roleRef: { connect: { slug: "lecturer" } } },
      select: lecturerSelect,
    });

    // Additive join table (issue #77 phase A) — not read by app code yet, but
    // kept populated here (not just by seed.ts) so real accounts aren't missing
    // rows once a later phase starts enforcing off it.
    const role = await prisma.role.findUniqueOrThrow({ where: { slug: "lecturer" } });
    await prisma.userRoleAssignment.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });

    return user;
  },

  async update(id: string, input: UpdateLecturerInput) {
    // Scope the update to lecturers so this endpoint can't mutate admins/students.
    const existing = await prisma.user.findFirst({ where: { id, role: "lecturer" }, select: { id: true } });
    if (!existing) throw new NotFoundError("Lecturer not found");
    return prisma.user.update({ where: { id }, data: input, select: lecturerSelect });
  },

  async remove(id: string) {
    const existing = await prisma.user.findFirst({
      where: { id, role: "lecturer" },
      select: { id: true, authId: true },
    });
    if (!existing) throw new NotFoundError("Lecturer not found");
    // Course/Offering.lecturerId is ON DELETE SET NULL, so this won't orphan rows;
    // any OfferingCoLecturer rows for this lecturer cascade-delete instead (#79).
    // Delete the Supabase Auth identity (if any) before the app row, so a failure
    // here aborts the whole delete instead of leaving an orphaned login behind.
    await registry.get<AuthServiceContract>("auth").service.deleteAccountForUser(existing.authId);
    return prisma.user.delete({ where: { id } });
  },
} satisfies LecturersServiceContract & Record<string, unknown>;

/** Thrown when a lecturer id doesn't resolve to a lecturer User. */
export class NotFoundError extends Error {}

export type LecturerService = typeof lecturerService;
