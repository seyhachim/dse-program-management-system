import type {
  CreateRubricInput,
  ListRubricsQuery,
  Rubric,
  RubricCriterion,
  RubricLevel,
  UpdateRubricInput,
} from "@dse-pms/shared-types";
import { Prisma } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";

/**
 * Include the owner's id+name (for "Created By") plus the normalized
 * levels/criteria/cells (issue #80 phase B read source — the jsonb
 * `levels`/`criteria` columns are no longer read here, only dual-written by
 * `syncNormalizedRubricTables` for phase C rollback safety).
 */
const withNormalized = {
  owner: { select: { id: true, name: true } },
  levelRows: { orderBy: { order: "asc" } },
  criterionRows: {
    orderBy: { order: "asc" },
    include: { cells: true },
  },
} as const;
type RubricRow = Prisma.RubricGetPayload<{ include: typeof withNormalized }>;

/** Shape a Prisma row into the API `Rubric` (dates → ISO, normalized tables → arrays). */
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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Rewrite the normalized RubricLevel/RubricCriterion/RubricCell rows for one
 * rubric from its current levels/criteria (issue #80 phase A dual-write — the
 * jsonb columns stay the read source until phase B). Full replace, mirroring
 * the jsonb columns' own replace-the-whole-array semantics: existing rows are
 * deleted (FK cascades take RubricCell with them) and rebuilt from scratch
 * rather than diffed, since the caller always has the complete final arrays.
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
  async list(query: ListRubricsQuery): Promise<Rubric[]> {
    const { search, status } = query;
    const rows = await prisma.rubric.findMany({
      where: {
        // Default library view hides archived rubrics unless asked for explicitly.
        ...(status ? { status } : { status: { not: "Archived" } }),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
                { type: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: withNormalized,
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(toRubric);
  },

  async getById(id: string): Promise<Rubric | null> {
    const row = await prisma.rubric.findUnique({ where: { id }, include: withNormalized });
    return row ? toRubric(row) : null;
  },

  async create(input: CreateRubricInput, ownerId: string): Promise<Rubric> {
    return prisma.$transaction(async (tx) => {
      const created = await tx.rubric.create({
        data: {
          name: input.name,
          type: input.type,
          description: input.description,
          levels: input.levels,
          criteria: input.criteria,
          status: input.status,
          ownerId,
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

  async update(id: string, input: UpdateRubricInput): Promise<Rubric> {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.rubric.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.type !== undefined ? { type: input.type } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.levels !== undefined ? { levels: input.levels } : {}),
          ...(input.criteria !== undefined ? { criteria: input.criteria } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
        select: { levels: true, criteria: true },
      });
      // updated.levels/criteria reflect the final state either way (unset
      // fields keep their persisted value), so this is the source of truth
      // to sync from regardless of which of the two the caller actually
      // changed.
      if (input.levels !== undefined || input.criteria !== undefined) {
        await syncNormalizedRubricTables(
          tx,
          id,
          updated.levels as RubricLevel[],
          updated.criteria as RubricCriterion[],
        );
      }
      const row = await tx.rubric.findUniqueOrThrow({ where: { id }, include: withNormalized });
      return toRubric(row);
    });
  },

  async remove(id: string): Promise<void> {
    await prisma.rubric.delete({ where: { id } });
  },
};

export type RubricService = typeof rubricService;
