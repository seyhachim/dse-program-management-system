import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type {
  CreateGuardianRelationshipInput,
  GuardianAccessScope,
  GuardianLinkedStudentView,
  GuardianRelationshipListQuery,
  GuardianRelationshipView,
  UpdateGuardianRelationshipInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

export class GuardianRelationshipError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "CONFLICT"
      | "INVALID_STATE"
      | "INVALID_STUDENT_PROGRAMME",
    message: string,
  ) {
    super(message);
    this.name = "GuardianRelationshipError";
  }
}

type RelationshipRow = {
  id: string;
  guardianUserId: string;
  guardianName: string;
  guardianEmail: string;
  studentId: string;
  studentName: string;
  studentInstitutionalId: string;
  programmeId: string;
  relationshipType: GuardianRelationshipView["relationshipType"];
  status: GuardianRelationshipView["status"];
  effectiveFrom: Date;
  effectiveTo: Date | null;
  verifiedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  accessScopes: GuardianAccessScope[];
};

const RELATIONSHIP_SELECT = `
  SELECT
    r."id",
    gp."userId" AS "guardianUserId",
    gu."name" AS "guardianName",
    gu."email" AS "guardianEmail",
    r."studentId",
    s."name" AS "studentName",
    s."studentId" AS "studentInstitutionalId",
    r."programmeId",
    r."relationshipType",
    r."status",
    r."effectiveFrom",
    r."effectiveTo",
    r."verifiedAt",
    r."revokedAt",
    r."createdAt",
    r."updatedAt",
    COALESCE(
      ARRAY_AGG(gs."scope" ORDER BY gs."scope") FILTER (WHERE gs."scope" IS NOT NULL),
      ARRAY[]::TEXT[]
    ) AS "accessScopes"
  FROM "guardian_portal"."StudentGuardianRelationship" r
  JOIN "guardian_portal"."GuardianProfile" gp ON gp."id" = r."guardianProfileId"
  JOIN "public"."User" gu ON gu."id" = gp."userId"
  JOIN "public"."Student" s ON s."id" = r."studentId"
  LEFT JOIN "guardian_portal"."GuardianRelationshipScope" gs ON gs."relationshipId" = r."id"
`;

const RELATIONSHIP_GROUP_BY = `
  GROUP BY r."id", gp."userId", gu."name", gu."email", s."id"
`;

function toView(row: RelationshipRow): GuardianRelationshipView {
  return {
    id: row.id,
    guardianUserId: row.guardianUserId,
    guardianName: row.guardianName,
    guardianEmail: row.guardianEmail,
    studentId: row.studentId,
    studentName: row.studentName,
    studentInstitutionalId: row.studentInstitutionalId,
    programmeId: row.programmeId,
    relationshipType: row.relationshipType,
    status: row.status,
    accessScopes: row.accessScopes,
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveTo: row.effectiveTo?.toISOString() ?? null,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function insertScopes(
  tx: Prisma.TransactionClient,
  relationshipId: string,
  scopes: GuardianAccessScope[],
): Promise<void> {
  for (const scope of scopes) {
    await tx.$executeRaw`
      INSERT INTO "guardian_portal"."GuardianRelationshipScope" ("relationshipId", "scope")
      VALUES (${relationshipId}, ${scope})
      ON CONFLICT ("relationshipId", "scope") DO NOTHING
    `;
  }
}

async function appendAudit(
  tx: Prisma.TransactionClient,
  relationshipId: string,
  action: string,
  actorUserId: string,
  snapshot: unknown,
): Promise<void> {
  const payload = JSON.stringify(snapshot);
  await tx.$executeRaw`
    INSERT INTO "guardian_portal"."GuardianRelationshipAuditEvent"
      ("id", "relationshipId", "action", "actorUserId", "snapshot")
    VALUES (${randomUUID()}, ${relationshipId}, ${action}, ${actorUserId}, CAST(${payload} AS jsonb))
  `;
}

async function getRelationshipWithClient(
  client: Prisma.TransactionClient | typeof prisma,
  id: string,
): Promise<GuardianRelationshipView | null> {
  const rows = await client.$queryRawUnsafe<RelationshipRow[]>(
    `${RELATIONSHIP_SELECT} WHERE r."id" = $1 ${RELATIONSHIP_GROUP_BY}`,
    id,
  );
  return rows[0] ? toView(rows[0]) : null;
}

async function studentBelongsToProgramme(
  tx: Prisma.TransactionClient,
  studentId: string,
  programmeId: string,
): Promise<{ belongs: boolean; studentUserId: string | null }> {
  const rows = await tx.$queryRaw<Array<{ userId: string | null; belongs: boolean }>>`
    SELECT
      s."userId",
      (
        EXISTS (
          SELECT 1
          FROM "public"."StudentCohortMembership" scm
          JOIN "public"."StudentCohort" sc ON sc."id" = scm."cohortId"
          WHERE scm."studentId" = s."id"
            AND sc."programmeId" = ${programmeId}
            AND scm."joinedAt" <= CURRENT_DATE
            AND (scm."exitedAt" IS NULL OR scm."exitedAt" >= CURRENT_DATE)
        )
        OR EXISTS (
          SELECT 1
          FROM "public"."Enrollment" e
          JOIN "public"."Offering" o ON o."id" = e."offeringId"
          JOIN "public"."Course" c ON c."id" = o."courseId"
          WHERE e."studentId" = s."id"
            AND c."programmeId" = ${programmeId}
        )
      ) AS "belongs"
    FROM "public"."Student" s
    WHERE s."id" = ${studentId}
    LIMIT 1
  `;
  return rows[0] ?? { belongs: false, studentUserId: null };
}

async function ensureGuardianRole(
  tx: Prisma.TransactionClient,
  guardianUserId: string,
  programmeId: string,
): Promise<void> {
  const [user, role] = await Promise.all([
    tx.user.findUnique({ where: { id: guardianUserId }, select: { id: true } }),
    tx.role.findUnique({ where: { slug: "guardian" }, select: { id: true } }),
  ]);
  if (!user) {
    throw new GuardianRelationshipError("NOT_FOUND", "Guardian user account not found");
  }
  if (!role) {
    throw new Error("Guardian role is not installed. Apply database migrations first.");
  }
  await tx.userRoleAssignment.upsert({
    where: { userId_roleId: { userId: guardianUserId, roleId: role.id } },
    create: { userId: guardianUserId, roleId: role.id, programmeId },
    update: {},
  });
}

export const guardianRelationshipService = {
  async create(
    input: CreateGuardianRelationshipInput,
    actorUserId: string,
  ): Promise<GuardianRelationshipView> {
    return prisma.$transaction(async (tx) => {
      const studentProgramme = await studentBelongsToProgramme(tx, input.studentId, input.programmeId);
      if (!studentProgramme.belongs) {
        throw new GuardianRelationshipError(
          "INVALID_STUDENT_PROGRAMME",
          "Student is not associated with the requested programme",
        );
      }
      if (studentProgramme.studentUserId === input.guardianUserId) {
        throw new GuardianRelationshipError("CONFLICT", "A student cannot be their own guardian");
      }

      await ensureGuardianRole(tx, input.guardianUserId, input.programmeId);

      let profile = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "guardian_portal"."GuardianProfile"
        WHERE "userId" = ${input.guardianUserId}
        LIMIT 1
      `;
      if (!profile[0]) {
        const profileId = randomUUID();
        await tx.$executeRaw`
          INSERT INTO "guardian_portal"."GuardianProfile" ("id", "userId")
          VALUES (${profileId}, ${input.guardianUserId})
        `;
        profile = [{ id: profileId }];
      }

      const overlapping = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "guardian_portal"."StudentGuardianRelationship"
        WHERE "guardianProfileId" = ${profile[0]!.id}
          AND "studentId" = ${input.studentId}
          AND "programmeId" = ${input.programmeId}
          AND "status" IN ('PENDING', 'VERIFIED')
          AND COALESCE("effectiveTo", 'infinity'::timestamptz) > ${new Date(input.effectiveFrom)}
          AND COALESCE(${input.effectiveTo ? new Date(input.effectiveTo) : null}::timestamptz, 'infinity'::timestamptz) > "effectiveFrom"
        LIMIT 1
      `;
      if (overlapping[0]) {
        throw new GuardianRelationshipError(
          "CONFLICT",
          "An active or pending guardian relationship already overlaps this period",
        );
      }

      const id = randomUUID();
      await tx.$executeRaw`
        INSERT INTO "guardian_portal"."StudentGuardianRelationship" (
          "id", "guardianProfileId", "studentId", "programmeId", "relationshipType",
          "status", "effectiveFrom", "effectiveTo", "verificationMethod", "verificationNotes",
          "createdByUserId"
        ) VALUES (
          ${id}, ${profile[0]!.id}, ${input.studentId}, ${input.programmeId}, ${input.relationshipType},
          'PENDING', ${new Date(input.effectiveFrom)}, ${input.effectiveTo ? new Date(input.effectiveTo) : null},
          ${input.verificationMethod ?? null}, ${input.verificationNotes ?? null}, ${actorUserId}
        )
      `;
      await insertScopes(tx, id, input.accessScopes);
      const created = await getRelationshipWithClient(tx, id);
      if (!created) throw new Error("Failed to read newly created guardian relationship");
      await appendAudit(tx, id, "CREATED", actorUserId, created);
      return created;
    });
  },

  async verify(id: string, actorUserId: string): Promise<GuardianRelationshipView> {
    return prisma.$transaction(async (tx) => {
      const current = await getRelationshipWithClient(tx, id);
      if (!current) throw new GuardianRelationshipError("NOT_FOUND", "Guardian relationship not found");
      if (current.status !== "PENDING") {
        throw new GuardianRelationshipError("INVALID_STATE", "Only pending relationships can be verified");
      }
      await tx.$executeRaw`
        UPDATE "guardian_portal"."StudentGuardianRelationship"
        SET "status" = 'VERIFIED', "verifiedByUserId" = ${actorUserId},
            "verifiedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id}
      `;
      const updated = await getRelationshipWithClient(tx, id);
      if (!updated) throw new Error("Failed to read verified guardian relationship");
      await appendAudit(tx, id, "VERIFIED", actorUserId, updated);
      return updated;
    });
  },

  async update(
    id: string,
    input: UpdateGuardianRelationshipInput,
    actorUserId: string,
  ): Promise<GuardianRelationshipView> {
    return prisma.$transaction(async (tx) => {
      const current = await getRelationshipWithClient(tx, id);
      if (!current) throw new GuardianRelationshipError("NOT_FOUND", "Guardian relationship not found");
      if (current.status === "REVOKED" || current.status === "ENDED") {
        throw new GuardianRelationshipError("INVALID_STATE", "Inactive relationships cannot be edited");
      }

      const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(current.effectiveFrom);
      const effectiveTo = input.effectiveTo === undefined
        ? (current.effectiveTo ? new Date(current.effectiveTo) : null)
        : (input.effectiveTo ? new Date(input.effectiveTo) : null);
      if (effectiveTo && effectiveTo <= effectiveFrom) {
        throw new GuardianRelationshipError("CONFLICT", "effectiveTo must be after effectiveFrom");
      }

      await tx.$executeRaw`
        UPDATE "guardian_portal"."StudentGuardianRelationship"
        SET "relationshipType" = ${input.relationshipType ?? current.relationshipType},
            "effectiveFrom" = ${effectiveFrom},
            "effectiveTo" = ${effectiveTo},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id}
      `;
      if (input.accessScopes) {
        await tx.$executeRaw`
          DELETE FROM "guardian_portal"."GuardianRelationshipScope" WHERE "relationshipId" = ${id}
        `;
        await insertScopes(tx, id, input.accessScopes);
      }
      const updated = await getRelationshipWithClient(tx, id);
      if (!updated) throw new Error("Failed to read updated guardian relationship");
      await appendAudit(tx, id, "UPDATED", actorUserId, { before: current, after: updated });
      return updated;
    });
  },

  async revoke(id: string, actorUserId: string): Promise<GuardianRelationshipView> {
    return prisma.$transaction(async (tx) => {
      const current = await getRelationshipWithClient(tx, id);
      if (!current) throw new GuardianRelationshipError("NOT_FOUND", "Guardian relationship not found");
      if (current.status !== "PENDING" && current.status !== "VERIFIED") {
        throw new GuardianRelationshipError("INVALID_STATE", "Relationship is already inactive");
      }
      await tx.$executeRaw`
        UPDATE "guardian_portal"."StudentGuardianRelationship"
        SET "status" = 'REVOKED', "revokedByUserId" = ${actorUserId},
            "revokedAt" = CURRENT_TIMESTAMP, "effectiveTo" = LEAST(COALESCE("effectiveTo", CURRENT_TIMESTAMP), CURRENT_TIMESTAMP),
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id}
      `;
      const updated = await getRelationshipWithClient(tx, id);
      if (!updated) throw new Error("Failed to read revoked guardian relationship");
      await appendAudit(tx, id, "REVOKED", actorUserId, updated);
      return updated;
    });
  },

  async list(query: GuardianRelationshipListQuery): Promise<GuardianRelationshipView[]> {
    const conditions = ['r."programmeId" = $1'];
    const values: unknown[] = [query.programmeId];
    if (query.studentId) {
      values.push(query.studentId);
      conditions.push(`r."studentId" = $${values.length}`);
    }
    if (query.guardianUserId) {
      values.push(query.guardianUserId);
      conditions.push(`gp."userId" = $${values.length}`);
    }
    if (!query.includeInactive) {
      conditions.push(`r."status" IN ('PENDING', 'VERIFIED')`);
    }
    const rows = await prisma.$queryRawUnsafe<RelationshipRow[]>(
      `${RELATIONSHIP_SELECT} WHERE ${conditions.join(" AND ")} ${RELATIONSHIP_GROUP_BY} ORDER BY r."createdAt" DESC`,
      ...values,
    );
    return rows.map(toView);
  },

  async listMine(guardianUserId: string): Promise<GuardianLinkedStudentView[]> {
    const rows = await prisma.$queryRawUnsafe<RelationshipRow[]>(
      `${RELATIONSHIP_SELECT}
       WHERE gp."userId" = $1
         AND r."status" = 'VERIFIED'
         AND r."effectiveFrom" <= CURRENT_TIMESTAMP
         AND (r."effectiveTo" IS NULL OR r."effectiveTo" > CURRENT_TIMESTAMP)
       ${RELATIONSHIP_GROUP_BY}
       ORDER BY s."name" ASC`,
      guardianUserId,
    );
    return rows.map((row) => ({
      relationshipId: row.id,
      studentId: row.studentId,
      studentName: row.studentName,
      studentInstitutionalId: row.studentInstitutionalId,
      programmeId: row.programmeId,
      relationshipType: row.relationshipType,
      accessScopes: row.accessScopes,
      effectiveFrom: row.effectiveFrom.toISOString(),
      effectiveTo: row.effectiveTo?.toISOString() ?? null,
    }));
  },

  async assertStudentScope(
    guardianUserId: string,
    studentId: string,
    scope: GuardianAccessScope,
  ): Promise<GuardianLinkedStudentView> {
    const rows = await prisma.$queryRawUnsafe<RelationshipRow[]>(
      `${RELATIONSHIP_SELECT}
       WHERE gp."userId" = $1
         AND r."studentId" = $2
         AND r."status" = 'VERIFIED'
         AND r."effectiveFrom" <= CURRENT_TIMESTAMP
         AND (r."effectiveTo" IS NULL OR r."effectiveTo" > CURRENT_TIMESTAMP)
         AND EXISTS (
           SELECT 1 FROM "guardian_portal"."GuardianRelationshipScope" required_scope
           WHERE required_scope."relationshipId" = r."id" AND required_scope."scope" = $3
         )
       ${RELATIONSHIP_GROUP_BY}
       LIMIT 1`,
      guardianUserId,
      studentId,
      scope,
    );
    const row = rows[0];
    if (!row) {
      throw new GuardianRelationshipError("FORBIDDEN", "Guardian access is not permitted for this student and scope");
    }
    return {
      relationshipId: row.id,
      studentId: row.studentId,
      studentName: row.studentName,
      studentInstitutionalId: row.studentInstitutionalId,
      programmeId: row.programmeId,
      relationshipType: row.relationshipType,
      accessScopes: row.accessScopes,
      effectiveFrom: row.effectiveFrom.toISOString(),
      effectiveTo: row.effectiveTo?.toISOString() ?? null,
    };
  },
};

export type GuardianRelationshipService = typeof guardianRelationshipService;
