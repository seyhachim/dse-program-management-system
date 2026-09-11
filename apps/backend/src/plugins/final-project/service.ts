import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  ListSupervisorDiscoveryQuery,
  ProgrammeSupervisorOverviewView,
  SupervisorDiscoveryProfileView,
  UpdateSupervisorProfileInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

type DbClient = Pick<PrismaClient, "$queryRaw" | "$executeRaw" | "$transaction">;

type ProfileRow = {
  id: string;
  programmeId: string;
  lecturerId: string;
  lecturerName: string;
  lecturerTitle: string | null;
  qualification: string | null;
  supervisionStatement: string;
  capacity: number;
  acceptingStudents: boolean;
  isPublished: boolean;
  updatedAt: Date;
};

type TrackRow = { id: string; name: string; description: string };
type IdeaRow = { id: string; title: string; summary: string; trackName: string };

export class FinalProjectNotFoundError extends Error {}

export class FinalProjectService {
  constructor(private readonly db: DbClient = prisma) {}

  async listPublished(query: ListSupervisorDiscoveryQuery): Promise<SupervisorDiscoveryProfileView[]> {
    const q = query.q?.trim() ?? "";
    const track = query.track?.trim() ?? "";
    const rows = await this.db.$queryRaw<ProfileRow[]>(Prisma.sql`
      SELECT p."id", p."programmeId", p."lecturerId",
             u."name" AS "lecturerName", u."title" AS "lecturerTitle", u."qualification",
             p."supervisionStatement", p."capacity", p."acceptingStudents", p."isPublished", p."updatedAt"
      FROM final_project."SupervisorProfile" p
      JOIN public."User" u ON u."id" = p."lecturerId"
      WHERE p."programmeId" = ${query.programmeId}
        AND p."isPublished" = true
        ${query.accepting === undefined ? Prisma.empty : Prisma.sql`AND p."acceptingStudents" = ${query.accepting}`}
        ${q === "" ? Prisma.empty : Prisma.sql`AND (
          u."name" ILIKE ${`%${q}%`}
          OR p."supervisionStatement" ILIKE ${`%${q}%`}
          OR EXISTS (
            SELECT 1 FROM final_project."ResearchTrack" rt
            WHERE rt."profileId" = p."id" AND rt."name" ILIKE ${`%${q}%`}
          )
        )`}
        ${track === "" ? Prisma.empty : Prisma.sql`AND EXISTS (
          SELECT 1 FROM final_project."ResearchTrack" rt
          WHERE rt."profileId" = p."id" AND rt."name" ILIKE ${track}
        )`}
      ORDER BY p."acceptingStudents" DESC, u."name" ASC
    `);
    return Promise.all(rows.map((row) => this.hydrate(row)));
  }

  async getPublished(programmeId: string, lecturerId: string): Promise<SupervisorDiscoveryProfileView> {
    const rows = await this.db.$queryRaw<ProfileRow[]>(Prisma.sql`
      SELECT p."id", p."programmeId", p."lecturerId",
             u."name" AS "lecturerName", u."title" AS "lecturerTitle", u."qualification",
             p."supervisionStatement", p."capacity", p."acceptingStudents", p."isPublished", p."updatedAt"
      FROM final_project."SupervisorProfile" p
      JOIN public."User" u ON u."id" = p."lecturerId"
      WHERE p."programmeId" = ${programmeId}
        AND p."lecturerId" = ${lecturerId}
        AND p."isPublished" = true
      LIMIT 1
    `);
    if (!rows[0]) throw new FinalProjectNotFoundError("Supervisor profile not found");
    return this.hydrate(rows[0]);
  }

  async getOwn(programmeId: string, lecturerId: string): Promise<SupervisorDiscoveryProfileView | null> {
    const rows = await this.db.$queryRaw<ProfileRow[]>(Prisma.sql`
      SELECT p."id", p."programmeId", p."lecturerId",
             u."name" AS "lecturerName", u."title" AS "lecturerTitle", u."qualification",
             p."supervisionStatement", p."capacity", p."acceptingStudents", p."isPublished", p."updatedAt"
      FROM final_project."SupervisorProfile" p
      JOIN public."User" u ON u."id" = p."lecturerId"
      WHERE p."programmeId" = ${programmeId} AND p."lecturerId" = ${lecturerId}
      LIMIT 1
    `);
    return rows[0] ? this.hydrate(rows[0]) : null;
  }

  async upsertOwn(lecturerId: string, input: UpdateSupervisorProfileInput): Promise<SupervisorDiscoveryProfileView> {
    const profileId = randomUUID();
    await this.db.$transaction(async (tx) => {
      const profiles = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO final_project."SupervisorProfile" (
          "id", "programmeId", "lecturerId", "supervisionStatement", "capacity",
          "acceptingStudents", "isPublished", "updatedAt"
        ) VALUES (
          ${profileId}, ${input.programmeId}, ${lecturerId}, ${input.supervisionStatement}, ${input.capacity},
          ${input.acceptingStudents}, ${input.isPublished}, CURRENT_TIMESTAMP
        )
        ON CONFLICT ("programmeId", "lecturerId") DO UPDATE SET
          "supervisionStatement" = EXCLUDED."supervisionStatement",
          "capacity" = EXCLUDED."capacity",
          "acceptingStudents" = EXCLUDED."acceptingStudents",
          "isPublished" = EXCLUDED."isPublished",
          "updatedAt" = CURRENT_TIMESTAMP
        RETURNING "id"
      `);
      const id = profiles[0]!.id;
      await tx.$executeRaw(Prisma.sql`DELETE FROM final_project."ResearchTrack" WHERE "profileId" = ${id}`);
      await tx.$executeRaw(Prisma.sql`DELETE FROM final_project."ProjectIdea" WHERE "profileId" = ${id}`);

      for (const [index, track] of input.tracks.entries()) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO final_project."ResearchTrack" ("id", "profileId", "name", "description", "sortOrder")
          VALUES (${randomUUID()}, ${id}, ${track.name}, ${track.description}, ${index})
        `);
      }
      for (const [index, idea] of input.projectIdeas.entries()) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO final_project."ProjectIdea" ("id", "profileId", "title", "summary", "trackName", "sortOrder")
          VALUES (${randomUUID()}, ${id}, ${idea.title}, ${idea.summary}, ${idea.trackName}, ${index})
        `);
      }
    });

    return (await this.getOwn(input.programmeId, lecturerId))!;
  }

  async programmeOverview(programmeId: string): Promise<ProgrammeSupervisorOverviewView> {
    const rows = await this.db.$queryRaw<ProfileRow[]>(Prisma.sql`
      SELECT p."id", p."programmeId", p."lecturerId",
             u."name" AS "lecturerName", u."title" AS "lecturerTitle", u."qualification",
             p."supervisionStatement", p."capacity", p."acceptingStudents", p."isPublished", p."updatedAt"
      FROM final_project."SupervisorProfile" p
      JOIN public."User" u ON u."id" = p."lecturerId"
      WHERE p."programmeId" = ${programmeId}
      ORDER BY u."name" ASC
    `);
    const supervisors = await Promise.all(rows.map((row) => this.hydrate(row)));
    return {
      programmeId,
      publishedSupervisors: supervisors.filter((s) => s.isPublished).length,
      acceptingSupervisors: supervisors.filter((s) => s.isPublished && s.acceptingStudents).length,
      totalCapacity: supervisors.reduce((sum, s) => sum + s.capacity, 0),
      totalCurrentLoad: null,
      supervisors,
    };
  }

  private async hydrate(row: ProfileRow): Promise<SupervisorDiscoveryProfileView> {
    const [tracks, projectIdeas] = await Promise.all([
      this.db.$queryRaw<TrackRow[]>(Prisma.sql`
        SELECT "id", "name", "description"
        FROM final_project."ResearchTrack"
        WHERE "profileId" = ${row.id}
        ORDER BY "sortOrder" ASC, "name" ASC
      `),
      this.db.$queryRaw<IdeaRow[]>(Prisma.sql`
        SELECT "id", "title", "summary", "trackName"
        FROM final_project."ProjectIdea"
        WHERE "profileId" = ${row.id}
        ORDER BY "sortOrder" ASC, "title" ASC
      `),
    ]);
    return {
      ...row,
      currentLoad: null,
      tracks,
      projectIdeas,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export const finalProjectService = new FinalProjectService();
