---
name: db-schema-design
description: Guides schema changes to this repo's Prisma/Postgres database — adding a new table/model, adding columns, or reshaping how a plugin stores data. Enforces three conventions this repo has learned the hard way: (1) every schema change ships as a real Prisma migration via `bun run --cwd apps/backend db:migrate`, never hand-edited or skipped; (2) no jsonb/Json columns — this schema deliberately has zero of them after several past migrations ripped jsonb out in favor of normalized tables, so new data gets real columns/join tables, with jsonb only as a rare, explicitly-justified exception; (3) new tables are designed for scale from the start — indexed FKs, indexed filter columns, and Row Level Security enabled (Supabase silently exposes any public table that skips it). Use this whenever the user wants to add a table, model, entity, or new kind of data to the database, extend `schema.prisma`, design storage for a new plugin/feature, or asks about database/schema design in this repo — even if they don't say "migration" or "jsonb" by name.
---

# DB schema design (Prisma + Postgres)

`apps/backend/prisma/schema.prisma` is the single source of truth for this repo's
data model. Its own history is the best argument for the rules below: issues #77,
#80, #81, and #103 each spent real migration effort ripping a `Json`/jsonb column
back OUT once it caused a problem, and `20260801080000_add_missing_fk_indexes` /
`20260801080001_enable_rls_missing_tables` exist because earlier tables shipped
without indexes and without RLS. This skill exists so the next table doesn't repeat
those fixes.

## Before designing anything

Read the existing `schema.prisma` (or at least the models nearest to what you're
adding) rather than guessing at conventions — id strategy, naming, cascade
behavior, and index placement should match what's already there, not invent a new
style. The patterns below are what you'll find.

## 1. No jsonb — normalize instead

Default to real columns and tables, never a `Json` column. This isn't a stylistic
preference in this codebase specifically: it's the end state of several deliberate
migrations that pulled jsonb out because it hid schema drift, made partial updates
require read-modify-write on an unrelated blob, and let unvalidated ids reference
things that didn't exist. The patterns already in use here cover almost every case:

- **A child row that's only unique within its parent** (e.g. a client-generated CLO
  id, a rubric criterion id): composite primary key `(parentId, id)`, not a bare
  `@id`. See `CourseSpecClo`, `RubricCriterion`.
- **A many-to-many or enforced-vocabulary reference** (e.g. a CLO's teaching
  methods): a real join table with FKs on both sides, not an array of ids sitting
  in json. See `CourseSpecCloTeachingMethod`.
- **A loose reference by derived/non-PK value** (e.g. `cloCodes: String[]`
  referencing a CLO by its position-derived code, not its id): acceptable *only*
  when the read/write layer already reconciles orphaned references on save — don't
  introduce a new unenforced reference without that same reconciliation. See
  `CourseSpecWeek.cloCodes` and `mapping-model.ts`'s `reconcileCells`.

Push back on jsonb, but don't refuse it reflexively — if the user is proposing it,
explain the tradeoff above and suggest the normalized alternative. The only
legitimate case for it is data that's genuinely schema-less and never queried or
filtered on inside Postgres (e.g. archiving a raw external API payload for
audit/debug purposes). Even then, say so explicitly and get the user to confirm
before adding it — don't reach for it silently.

## 2. Design for scale at creation time, not as a follow-up migration

Every FK column in this schema now has an index, and every table now has RLS
enabled — both landed as catch-up migrations after the gap was already live in
production. Do it right the first time:

- **Index every foreign key column** (`@@index([fooId])`), even if it feels
  premature — an unindexed FK is fine until the table has rows, then it's a full
  scan on every join.
- **Index columns used to filter lists** — anything a `list`/`GET` endpoint will
  filter or sort by (see `@@index([status])` on `Student`/`Offering`/`Rubric`).
- **Pick the right `onDelete`**: `Cascade` for rows that only exist as part of
  their parent (a CLO without its CourseSpec is meaningless — delete it too);
  `SetNull` for an optional reference to something that outlives the link (a
  Course shouldn't vanish because its lecturer's User row did).
- **Enable Row Level Security on every new table**, in the same migration:
  `ALTER TABLE "TableName" ENABLE ROW LEVEL SECURITY;`. Supabase exposes every
  public-schema table over PostgREST by default; a table without RLS gets flagged
  by Supabase's security advisor as publicly readable/writable, even though this
  app's own connection (the `postgres` role, `rolbypassrls = true`) is unaffected.
  No policies are needed to fix this — just the `ENABLE` statement, matching
  `20260801080001_enable_rls_missing_tables`.
- Prefer `id String @id @default(uuid())` unless the table is a join table or a
  child whose identity is only meaningful within its parent (composite key, above).

## 3. Every schema change is a real migration

After editing `schema.prisma`, generate and apply the migration:

```bash
bun run --cwd apps/backend db:migrate    # prisma migrate dev — prompts for a migration name
```

Give it a descriptive name (`add_x_table`, not `update`). Never hand-edit a
migration file that's already been applied, and never leave `schema.prisma` changed
without a corresponding migration file committed alongside it — the migration
history is what makes a bad change auditable and revertible; a schema drifted from
its migrations is exactly the failure mode this step exists to prevent. If a
migration turns out to be wrong after it's shipped, fix it forward with a new
migration (the same expand/contract pattern issues #77/#80/#81/#103 all used),
don't edit history.

After migrating, `prisma generate` runs automatically as part of `migrate dev`; if
you only changed `schema.prisma` without running the migration (you shouldn't),
`bun run --cwd apps/backend db:generate` regenerates the client. Add dev seed data
in `apps/backend/prisma/seed.ts` if the new table needs it for local dev/CI to
exercise. Run `bun run typecheck` afterward — a new/changed model's shape ripples
into `packages/shared-types` Zod schemas and both apps' typed API layers.
