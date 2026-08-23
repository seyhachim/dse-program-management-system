import { Prisma } from "@prisma/client";
import {
  DEFAULT_STUDENT_HANDBOOK_DOCUMENT_THEME,
  StudentHandbookDocumentThemeSchema,
  type StudentHandbookDocumentTheme,
  type UpdateStudentHandbookThemeInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import {
  getHandbookHeader,
  StudentHandbookConflictError,
  StudentHandbookNotFoundError,
} from "./service.ts";

type ThemeRow = { theme: unknown };

export async function getHandbookTheme(handbookId: string): Promise<StudentHandbookDocumentTheme> {
  const rows = await prisma.$queryRaw<ThemeRow[]>(Prisma.sql`
    SELECT "theme"
    FROM student_handbook."StudentHandbook"
    WHERE "id" = ${handbookId}
    LIMIT 1
  `);
  if (!rows.length) throw new StudentHandbookNotFoundError("Student Handbook not found");
  const parsed = StudentHandbookDocumentThemeSchema.safeParse(rows[0]!.theme);
  return parsed.success ? parsed.data : DEFAULT_STUDENT_HANDBOOK_DOCUMENT_THEME;
}

export async function updateHandbookTheme(
  handbookId: string,
  input: UpdateStudentHandbookThemeInput,
  actorId: string,
): Promise<StudentHandbookDocumentTheme> {
  const header = await getHandbookHeader(handbookId);
  if (!header) throw new StudentHandbookNotFoundError("Student Handbook not found");
  if (!["DRAFT", "CHANGES_REQUESTED"].includes(header.status)) {
    throw new StudentHandbookConflictError("Document style can only change while the handbook is editable");
  }

  const theme = StudentHandbookDocumentThemeSchema.parse(input);
  const json = JSON.stringify(theme);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE student_handbook."StudentHandbook"
      SET "theme" = ${json}::jsonb,
          "status" = CASE WHEN "status" = 'CHANGES_REQUESTED' THEN 'DRAFT' ELSE "status" END,
          "updatedAt" = now()
      WHERE "id" = ${handbookId}
    `);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO student_handbook."StudentHandbookAuditEvent"
        ("handbookId", "actorId", "action", "note", "details")
      VALUES (
        ${handbookId},
        ${actorId},
        'THEME_UPDATED',
        '',
        ${json}::jsonb
      )
    `);
  });
  return theme;
}
