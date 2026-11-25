import { readFile } from "node:fs/promises";
import { Prisma, PrismaClient } from "@prisma/client";
import { validateStagingTarget, verifyStagingDatabase } from "./verify-staging-db.ts";
import { lecturerAnnualService } from "../src/plugins/lecturers/annual-service.ts";
import { DEFAULT_PROGRAMME_ID } from "../src/core/programme.ts";
import { historicalAnnualSourceSchema, reconcileHistoricalAnnual } from "../src/plugins/lecturers/annual-reconciliation.ts";

const dateOnly = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

export function reconciliationInputPath(args: readonly string[]): string {
  if (args.length !== 2 || args[0] !== "--input" || !args[1] || args[1].startsWith("-")) {
    throw new Error("Usage: bun scripts/annual-lecturer-reconciliation.ts --input <historical-source.json> (dry-run only)");
  }
  return args[1];
}

async function main(args: readonly string[]): Promise<void> {
  const path = reconciliationInputPath(args);
  // Validate target before connecting; there is deliberately no production or commit mode.
  const identity = validateStagingTarget(process.env);
  const input = historicalAnnualSourceSchema.parse(JSON.parse(await readFile(path, "utf8")));
  const client = new PrismaClient({ datasources: { db: { url: identity.connectionString } } });
  try {
    const report = await client.$transaction(async tx => {
      // PostgreSQL enforces read-only, including against accidental future writes.
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await verifyStagingDatabase(identity, async () => {
        const rows = await tx.$queryRaw<Array<{ databaseName: string; databaseMarker: string | null }>>`
          SELECT current_database()::text AS "databaseName",
                 shobj_description(oid, 'pg_database')::text AS "databaseMarker"
          FROM pg_database WHERE datname = current_database()
        `;
        if (rows.length !== 1) throw new Error("Cannot verify staging database identity");
        return rows[0]!;
      });
      const summary = await lecturerAnnualService.summary(input.academicYearId, tx);
      if (summary.academicYear.label !== input.academicYearLabel) {
        throw new Error("Historical source does not match the selected academic year");
      }
      const offerings = await tx.offering.findMany({
        where: { course: { programmeId: DEFAULT_PROGRAMME_ID } },
        select: { id: true, term: true, startDate: true, endDate: true,
          academicCalendarPeriod: { select: { calendar: { select: { academicYearId: true } } } } },
        orderBy: { id: "asc" },
      });
      const ids = summary.staff.map(person => person.lecturerId);
      const items = ids.length ? await tx.$queryRaw<Array<{
        id: string; lecturerId: string; startDate: Date | null; endDate: Date | null;
        verificationStatus: "SelfDeclared" | "Verified" | "Rejected";
      }>>(Prisma.sql`
        SELECT "id", "lecturerId", "startDate", "endDate", "verificationStatus"::text AS "verificationStatus"
        FROM lecturer_portfolio."LecturerPortfolioItem"
        WHERE "lecturerId" IN (${Prisma.join(ids)})
        ORDER BY "lecturerId", "id"
      `) : [];
      return reconcileHistoricalAnnual(input, summary, offerings.map(o => ({
        id: o.id, term: o.term, calendarYearId: o.academicCalendarPeriod?.calendar.academicYearId ?? null,
        startDate: dateOnly(o.startDate), endDate: dateOnly(o.endDate),
      })), items.map(item => ({ ...item, startDate: dateOnly(item.startDate), endDate: dateOnly(item.endDate) })));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.$disconnect();
  }
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch(() => {
    // Never dump raw Prisma/Zod errors, connection details or historical source cells.
    console.error("Historical reconciliation failed. Check input format, staging identity, reporting year and migrated schema. No writes were attempted.");
    process.exitCode = 1;
  });
}
