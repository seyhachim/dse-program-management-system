import type {
  CreateRubricInput,
  ListRubricsQuery,
  PublicRubric,
  Rubric,
  RubricCriterion,
  RubricLevel,
  UpdateRubricInput,
} from "@dse-pms/shared-types";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "../../core/auth/token.ts";
import { prisma } from "../../core/db/prisma.ts";

/**
 * Include the owner's id+name (for "Created By") plus the normalized
 * levels/criteria/cells — the sole storage for these since issue #80 phase C
 * dropped the `Rubric.levels`/`criteria` jsonb columns outright.
 */
const withNormalized = {
  owner: { select: { id: true, name: true } },
  levelRows: { orderBy: { order: "asc" } },
  criterionRows: {
    orderBy: { order: "asc" },
    include: { cells: true },
  },
  _count: { select: { assessmentItems: true } },
} as const;
type RubricRow = Prisma.RubricGetPayload<{ include: typeof withNormalized }>;

export type RubricActor = Pick<AuthUser, "id" | "roles">;
export type RubricLifecycleSnapshot = {
  ownerId: string | null;
  status: Rubric["status"];
  assessmentUsageCount: number;
};

export class RubricNotFoundError extends Error {}
export class RubricConflictError extends Error {}

/** Admin and Program Coordinator may manage any rubric; other writers are owner-scoped. */
export function canManageAllRubrics(actor: RubricActor): boolean {
  return actor.roles.some((role) => role === "admin" || role === "program_coordinator");
}

/** Lecturers/writers may manage only their own rubric unless they have an elevated role. */
export function canManageRubric(actor: RubricActor, ownerId: string | null): boolean {
  return canManageAllRubrics(actor) || (ownerId !== null && ownerId === actor.id);
}

/**
 * Active rubrics are intentionally readable to authenticated rubric readers.
 * Draft/Archived rubrics are private to their owner and programme leadership.
 */
export function canReadRubric(actor: RubricActor, snapshot: Pick<RubricLifecycleSnapshot, "ownerId" | "status">): boolean {
  return snapshot.status === "Active" || canManageRubric(actor, snapshot.ownerId);
}

const CONTENT_FIELDS: Array<keyof UpdateRubricInput> = [
  "name",
  "type",
  "description",
  "levels",
  "criteria",
];

function hasContentMutation(input: UpdateRubricInput): boolean {
  return CONTENT_FIELDS.some((field) => input[field] !== undefined);
}

function providedFields(input: UpdateRubricInput): Array<keyof UpdateRubricInput> {
  return (Object.keys(input) as Array<keyof UpdateRubricInput>).filter(
    (field) => input[field] !== undefined,
  );
}

/**
 * Return a safe conflict reason, or null when this PATCH is allowed.
 *
 * Lifecycle policy:
 * - Draft + unlinked: owner/elevated role may edit or publish/archive.
 * - Draft + linked: content is locked, but status-only publish/archive is allowed.
 * - Active: academic content is immutable; only Active -> Archived is allowed.
 * - Archived: immutable.
 */
export function rubricUpdateConflict(
  snapshot: RubricLifecycleSnapshot,
  input: UpdateRubricInput,
): string | null {
  const fields = providedFields(input);
  if (fields.length === 0) return null;

  if (snapshot.status === "Archived") {
    const noOp = fields.length === 1 && fields[0] === "status" && input.status === "Archived";
    return noOp
      ? null
      : "Archived rubrics are immutable. Create a new rubric to make changes.";
  }

  if (snapshot.status === "Active") {
    const noOp = fields.length === 1 && fields[0] === "status" && input.status === "Active";
    if (noOp) return null;
    const archiveOnly = fields.length === 1 && fields[0] === "status" && input.status === "Archived";
    return archiveOnly
      ? null
      : "Published rubrics are immutable. Archive the rubric or create a new rubric for revised content.";
  }

  if (snapshot.assessmentUsageCount > 0 && hasContentMutation(input)) {
    return "Rubrics linked to assessments cannot have their scoring content changed. Unlink the rubric or create a new rubric.";
  }

  return null;
}

/** Only an unlinked Draft may be physically deleted. */
export function rubricDeleteConflict(snapshot: RubricLifecycleSnapshot): string | null {
  if (snapshot.status !== "Draft") {
    return "Only Draft rubrics can be deleted. Published rubrics must be archived to preserve academic history.";
  }
  if (snapshot.assessmentUsageCount > 0) {
    return "Rubrics linked to assessments cannot be deleted. Unlink the rubric first or keep it for historical evidence.";
  }
  return null;
}

function lifecycleSnapshot(row: RubricRow): RubricLifecycleSnapshot {
  return {
    ownerId: row.ownerId,
    status: row.status,
    assessmentUsageCount: row._count.assessmentItems,
  };
}

/** Shape a Prisma row into the authenticated API `Rubric`. */
function toRubric(row: RubricRow): Rubric {
  const levels = row.levelRows.map((l) => ({ label: l.label, points: l.points }));
  const criteria = row.criterionRows.map((c) => {
    const descriptorByLevelId = new Map(c.cells.map((cell) => [cell.levelId, cell.descriptor]));
    return {
      id: c.id,
      name: c.name,
      descriptors: row.levelRows.map((l) => descriptorByLevelId.get(l.id) ?? ""),
    };
  });
  return {
    id: row.id,
    name: row.name,
    type: row.type as Rubric["type"],
    description: row.description,
    levels,
    criteria,
    status: row.status,
    owner: row.owner ? { id: row.owner.id, name: row.owner.name } : null,
    assessmentUsageCount: row._count.assessmentItems,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Strip management-only data from an Active rubric before public exposure. */
function toPublicRubric(rubric: Rubric): PublicRubric {
  return {
    id: rubric.id,
    name: rubric.name,
    type: rubric.type,
    description: rubric.description,
    levels: rubric.levels,
    criteria: rubric.criteria,
    status: "Active",
  };
}

/**
 * Rewrite the normalized RubricLevel/RubricCriterion/RubricCell rows for one
 * rubric from its current levels/criteria — the sole write path for this
 * data since issue #80 phase C dropped the jsonb columns. Full replace:
 * existing rows are deleted (FK cascades take RubricCell with them) and
 * rebuilt from scratch rather than diffed, since the caller always has the
 * complete final arrays.
 */
export async function syncNormalizedRubricTables(
  tx: Prisma.TransactionClient,
  rubricId: string,
  levels: readonly RubricLevel[],
  criteria: readonly RubricCriterion[],
): Promise<void> {
  await tx.rubricLevel.deleteMany({ where: { rubricId } });
  await tx.rubricCriterion.deleteMany({ where: { rubricId } });

  const levelRows = levels.map((l, i) => ({
    id: crypto.randomUUID(),
    rubricId,
    label: l.label,
    points: l.points,
    order: i,
  }));
  if (levelRows.length > 0) await tx.rubricLevel.createMany({ data: levelRows });

  if (criteria.length > 0) {
    await tx.rubricCriterion.createMany({
      data: criteria.map((c, i) => ({ id: c.id, rubricId, name: c.name, order: i })),
    });
  }

  const cellRows = criteria.flatMap((c) =>
    c.descriptors
      .map((descriptor, i) =>
        levelRows[i] ? { rubricId, criterionId: c.id, levelId: levelRows[i].id, descriptor } : null,
      )
      .filter((cell): cell is NonNullable<typeof cell> => cell !== null),
  );
  if (cellRows.length > 0) await tx.rubricCell.createMany({ data: cellRows });
}

/**
 * Rubric Library business logic over Prisma. This object is the plugin's public
 * service surface, reachable cross-plugin via `registry.get("rubrics").service`.
 * Rubrics are global (shared across all courses); `ownerId` records who created
 * one and is stamped from the authenticated caller, never from the request body.
 */
export const rubricService = {
  async list(query: ListRubricsQuery, actor: RubricActor): Promise<Rubric[]> {
    const { search, status } = query;
    const rows = await prisma.rubric.findMany({
      where: {
        ...(canManageAllRubrics(actor)
          ? {}
          : {
              OR: [
                { status: "Active" as const },
                { ownerId: actor.id },
              ],
            }),
        ...(status ? { status } : { status: { not: "Archived" as const } }),
        ...(search
          ? {
              AND: [
                {
                  OR: [
                    { name: { contains: search, mode: "insensitive" as const } },
                    { description: { contains: search, mode: "insensitive" as const } },
                    { type: { contains: search, mode: "insensitive" as const } },
                  ],
                },
              ],
            }
          : {}),
      },
      include: withNormalized,
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(toRubric);
  },

  async getById(id: string, actor: RubricActor): Promise<Rubric | null> {
    const row = await prisma.rubric.findUnique({ where: { id }, include: withNormalized });
    if (!row || !canReadRubric(actor, lifecycleSnapshot(row))) return null;
    return toRubric(row);
  },

  /** Public lookup is Active-only at the database boundary. */
  async getPublicById(id: string): Promise<PublicRubric | null> {
    const row = await prisma.rubric.findFirst({
      where: { id, status: "Active" },
      include: withNormalized,
    });
    return row ? toPublicRubric(toRubric(row)) : null;
  },

  async create(input: CreateRubricInput, actor: RubricActor): Promise<Rubric> {
    return prisma.$transaction(async (tx) => {
      const created = await tx.rubric.create({
        data: {
          name: input.name,
          type: input.type,
          description: input.description,
          status: input.status,
          ownerId: actor.id,
        },
        select: { id: true },
      });
      await syncNormalizedRubricTables(tx, created.id, input.levels, input.criteria);
      const row = await tx.rubric.findUniqueOrThrow({
        where: { id: created.id },
        include: withNormalized,
      });
      return toRubric(row);
    });
  },

  async update(id: string, input: UpdateRubricInput, actor: RubricActor): Promise<Rubric> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.rubric.findUnique({ where: { id }, include: withNormalized });
      if (!existing || !canManageRubric(actor, existing.ownerId)) {
        throw new RubricNotFoundError("Rubric not found");
      }

      const conflict = rubricUpdateConflict(lifecycleSnapshot(existing), input);
      if (conflict) throw new RubricConflictError(conflict);

      let finalLevels = input.levels;
      let finalCriteria = input.criteria;
      if (finalLevels === undefined || finalCriteria === undefined) {
        const current = toRubric(existing);
        finalLevels ??= current.levels;
        finalCriteria ??= current.criteria;
      }

      await tx.rubric.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });
      if (input.levels !== undefined || input.criteria !== undefined) {
        await syncNormalizedRubricTables(
          tx,
          id,
          finalLevels as RubricLevel[],
          finalCriteria as RubricCriterion[],
        );
      }
      const row = await tx.rubric.findUniqueOrThrow({ where: { id }, include: withNormalized });
      return toRubric(row);
    });
  },

  async remove(id: string, actor: RubricActor): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.rubric.findUnique({ where: { id }, include: withNormalized });
      if (!existing || !canManageRubric(actor, existing.ownerId)) {
        throw new RubricNotFoundError("Rubric not found");
      }
      const conflict = rubricDeleteConflict(lifecycleSnapshot(existing));
      if (conflict) throw new RubricConflictError(conflict);
      await tx.rubric.delete({ where: { id } });
    });
  },
};

export type RubricService = typeof rubricService;
