import { Prisma } from "@prisma/client";
import type {
  FinalProjectSupervisorOverview,
  FinalProjectSupervisorProfile,
  UpsertFinalProjectSupervisorProfileInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

const profileInclude = {
  lecturer: {
    select: {
      id: true,
      name: true,
      honorific: true,
      title: true,
      qualification: true,
      lecturerProfile: { select: { fieldOfSpecialization: true } },
    },
  },
  tracks: {
    orderBy: { sortOrder: "asc" as const },
    include: { ideas: { orderBy: { sortOrder: "asc" as const } } },
  },
} satisfies Prisma.FinalProjectSupervisorProfileInclude;

type SupervisorProfileRow = Prisma.FinalProjectSupervisorProfileGetPayload<{
  include: typeof profileInclude;
}>;

async function currentLoad(lecturerUserId: string, programmeId: string): Promise<number> {
  return prisma.studentPortfolioSupervisorRelationship.count({
    where: {
      supervisorUserId: lecturerUserId,
      status: "Approved",
      student: {
        cohortMemberships: {
          some: {
            exitedAt: null,
            cohort: { programmeId },
          },
        },
      },
    },
  });
}

function toContract(row: SupervisorProfileRow, load: number): FinalProjectSupervisorProfile {
  return {
    id: row.id,
    programmeId: row.programmeId,
    lecturer: {
      id: row.lecturer.id,
      name: row.lecturer.name,
      honorific: row.lecturer.honorific ?? null,
      academicPosition: row.lecturer.title ?? null,
      qualification: row.lecturer.qualification ?? null,
      fieldOfSpecialization: row.lecturer.lecturerProfile?.fieldOfSpecialization ?? null,
    },
    statement: row.statement,
    capacity: row.capacity,
    currentLoad: load,
    availableSlots: Math.max(0, row.capacity - load),
    acceptingStudents: row.acceptingStudents,
    isPublished: row.isPublished,
    tracks: row.tracks.map((track) => ({
      id: track.id,
      title: track.title,
      description: track.description,
      sortOrder: track.sortOrder,
      ideas: track.ideas.map((idea) => ({
        id: idea.id,
        title: idea.title,
        summary: idea.summary,
        skills: idea.skills,
        sortOrder: idea.sortOrder,
      })),
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function hydrate(rows: SupervisorProfileRow[]): Promise<FinalProjectSupervisorProfile[]> {
  const loads = await Promise.all(
    rows.map((row) => currentLoad(row.lecturerUserId, row.programmeId)),
  );
  return rows.map((row, index) => toContract(row, loads[index] ?? 0));
}

export const finalProjectService = {
  async getOwnProfile(
    lecturerUserId: string,
    programmeId: string,
  ): Promise<FinalProjectSupervisorProfile | null> {
    const row = await prisma.finalProjectSupervisorProfile.findUnique({
      where: { programmeId_lecturerUserId: { programmeId, lecturerUserId } },
      include: profileInclude,
    });
    if (!row) return null;
    return toContract(row, await currentLoad(lecturerUserId, programmeId));
  },

  async upsertOwnProfile(
    lecturerUserId: string,
    programmeId: string,
    input: UpsertFinalProjectSupervisorProfileInput,
  ): Promise<FinalProjectSupervisorProfile> {
    const existing = await prisma.finalProjectSupervisorProfile.findUnique({
      where: { programmeId_lecturerUserId: { programmeId, lecturerUserId } },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      const profile = await tx.finalProjectSupervisorProfile.upsert({
        where: { programmeId_lecturerUserId: { programmeId, lecturerUserId } },
        update: {
          statement: input.statement,
          capacity: input.capacity,
          acceptingStudents: input.acceptingStudents,
          isPublished: input.isPublished,
        },
        create: {
          programmeId,
          lecturerUserId,
          statement: input.statement,
          capacity: input.capacity,
          acceptingStudents: input.acceptingStudents,
          isPublished: input.isPublished,
        },
      });

      await tx.finalProjectResearchTrack.deleteMany({
        where: { supervisorProfileId: profile.id },
      });

      for (const [trackIndex, track] of input.tracks.entries()) {
        await tx.finalProjectResearchTrack.create({
          data: {
            supervisorProfileId: profile.id,
            title: track.title,
            description: track.description,
            sortOrder: trackIndex,
            ideas: {
              create: track.ideas.map((idea, ideaIndex) => ({
                title: idea.title,
                summary: idea.summary,
                skills: idea.skills,
                sortOrder: ideaIndex,
              })),
            },
          },
        });
      }

      await tx.finalProjectSupervisorProfileAudit.create({
        data: {
          supervisorProfileId: profile.id,
          actorId: lecturerUserId,
          action: existing ? "Updated" : "Created",
          snapshot: input,
        },
      });
    });

    const updated = await this.getOwnProfile(lecturerUserId, programmeId);
    if (!updated) throw new Error("Supervisor profile was not persisted");
    return updated;
  },

  async listDiscovery(programmeId: string): Promise<FinalProjectSupervisorProfile[]> {
    const rows = await prisma.finalProjectSupervisorProfile.findMany({
      where: { programmeId, isPublished: true },
      include: profileInclude,
      orderBy: { lecturer: { name: "asc" } },
    });
    return hydrate(rows);
  },

  async overview(programmeId: string): Promise<FinalProjectSupervisorOverview> {
    const rows = await prisma.finalProjectSupervisorProfile.findMany({
      where: { programmeId },
      include: profileInclude,
      orderBy: { lecturer: { name: "asc" } },
    });
    const supervisors = await hydrate(rows);
    return {
      programmeId,
      totalSupervisors: supervisors.length,
      publishedSupervisors: supervisors.filter((profile) => profile.isPublished).length,
      acceptingSupervisors: supervisors.filter((profile) => profile.acceptingStudents).length,
      totalCapacity: supervisors.reduce((sum, profile) => sum + profile.capacity, 0),
      currentLoad: supervisors.reduce((sum, profile) => sum + profile.currentLoad, 0),
      availableSlots: supervisors.reduce((sum, profile) => sum + profile.availableSlots, 0),
      supervisors,
    };
  },
};

export type FinalProjectService = typeof finalProjectService;
