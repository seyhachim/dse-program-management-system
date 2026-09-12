import type {
  AuthServiceContract,
  CreateLecturerInput,
  LecturersServiceContract,
  ListLecturersQuery,
  UpdateLecturerInput,
  UpdateMyLecturerProfileInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";
import { defaultProgrammeIdForRole } from "../../core/auth/token.ts";

/**
 * Lecturers = Users with role "lecturer". `list`/`getById` are the public
 * cross-plugin surface (LecturersServiceContract) so Courses and Offerings can
 * resolve lecturers via the registry. create/update/remove back the admin
 * editing UI; they return the same lean syllabus/contact shape.
 */

/** Lean lecturer reference used by admin lists and cross-plugin consumers. */
const lecturerSelect = {
  id: true,
  authId: true,
  name: true,
  email: true,
  honorific: true,
  title: true,
  qualification: true,
  phone: true,
  profileImageUrl: true,
} as const;

/** Richer self-profile select; professional metadata is not added to broad lecturer lists. */
const ownLecturerSelect = {
  ...lecturerSelect,
  lecturerProfile: {
    select: {
      gender: true,
      employmentType: true,
      fieldOfSpecialization: true,
      yearsOfExperience: true,
      shortBio: true,
      programmeStartDate: true,
      legacyCoursesTaught: true,
    },
  },
} as const;

type LecturerRow = Awaited<ReturnType<typeof selectLecturerRow>>;
type OwnLecturerRow = Awaited<ReturnType<typeof selectOwnLecturerRow>>;

function selectLecturerRow(id: string) {
  return prisma.user.findUnique({ where: { id }, select: lecturerSelect });
}

function selectOwnLecturerRow(id: string) {
  return prisma.user.findUnique({ where: { id }, select: ownLecturerSelect });
}

function presentLecturer(row: NonNullable<LecturerRow>) {
  const { authId, ...lecturer } = row;
  return {
    ...lecturer,
    accountAccess: authId ? ("has_access" as const) : ("no_access" as const),
  };
}

function presentOwnLecturer(row: NonNullable<OwnLecturerRow>) {
  const { authId, lecturerProfile, ...lecturer } = row;
  return {
    ...lecturer,
    professionalProfile: lecturerProfile
      ? {
          ...lecturerProfile,
          programmeStartDate: lecturerProfile.programmeStartDate?.toISOString().slice(0, 10) ?? null,
        }
      : null,
    accountAccess: authId ? ("has_access" as const) : ("no_access" as const),
  };
}

/** A User holding the "lecturer" role, per UserRoleAssignment (issue #77 phase C). */
const isLecturer = { roleAssignments: { some: { role: { slug: "lecturer" } } } } as const;

export const lecturerService = {
  async list(query: ListLecturersQuery = {}) {
    const { search } = query;
    const rows = await prisma.user.findMany({
      where: {
        ...isLecturer,
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
    return rows.map(presentLecturer);
  },

  async getById(id: string) {
    const row = await prisma.user.findFirst({
      where: { id, ...isLecturer },
      select: lecturerSelect,
    });
    return row ? presentLecturer(row) : null;
  },

  async getOwnProfile(userId: string) {
    const row = await prisma.user.findFirst({
      where: { id: userId, ...isLecturer },
      select: ownLecturerSelect,
    });
    return row ? presentOwnLecturer(row) : null;
  },

  async updateOwnProfile(userId: string, input: UpdateMyLecturerProfileInput) {
    // The target comes exclusively from req.user.id. The client never chooses it.
    const existing = await prisma.user.findFirst({
      where: { id: userId, ...isLecturer },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError("Lecturer profile not found");

    const {
      employmentType,
      fieldOfSpecialization,
      yearsOfExperience,
      shortBio,
      programmeStartDate,
      ...userProfile
    } = input;
    const hasProfessionalUpdate =
      employmentType !== undefined ||
      fieldOfSpecialization !== undefined ||
      yearsOfExperience !== undefined ||
      shortBio !== undefined ||
      programmeStartDate !== undefined;
    const programmeStartDateValue = programmeStartDate === undefined
      ? undefined
      : programmeStartDate
        ? new Date(`${programmeStartDate}T00:00:00.000Z`)
        : null;

    const row = await prisma.user.update({
      where: { id: userId },
      data: {
        ...userProfile,
        ...(hasProfessionalUpdate
          ? {
              lecturerProfile: {
                upsert: {
                  create: {
                    employmentType,
                    fieldOfSpecialization,
                    yearsOfExperience,
                    shortBio,
                    programmeStartDate: programmeStartDateValue,
                  },
                  update: {
                    employmentType,
                    fieldOfSpecialization,
                    yearsOfExperience,
                    shortBio,
                    programmeStartDate: programmeStartDateValue,
                  },
                },
              },
            }
          : {}),
      },
      select: ownLecturerSelect,
    });
    return presentOwnLecturer(row);
  },

  async create(input: CreateLecturerInput) {
    const row = await prisma.user.create({
      data: input,
      select: lecturerSelect,
    });

    // Keep UserRoleAssignment (the role source of truth) populated here, not
    // just by seed.ts.
    const role = await prisma.role.findUniqueOrThrow({ where: { slug: "lecturer" } });
    await prisma.userRoleAssignment.upsert({
      where: { userId_roleId: { userId: row.id, roleId: role.id } },
      update: {},
      create: { userId: row.id, roleId: role.id, programmeId: defaultProgrammeIdForRole("lecturer") },
    });

    return presentLecturer(row);
  },

  async update(id: string, input: UpdateLecturerInput) {
    // Scope the update to lecturers so this endpoint can't mutate admins/students.
    const existing = await prisma.user.findFirst({ where: { id, ...isLecturer }, select: { id: true } });
    if (!existing) throw new NotFoundError("Lecturer not found");
    const row = await prisma.user.update({ where: { id }, data: input, select: lecturerSelect });
    return presentLecturer(row);
  },

  async remove(id: string) {
    const existing = await prisma.user.findFirst({
      where: { id, ...isLecturer },
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
