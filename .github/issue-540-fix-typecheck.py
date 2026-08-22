from pathlib import Path

portal_path = Path("apps/backend/src/plugins/student-portal/service.ts")
portal = portal_path.read_text()
old_portal = '''async function studentForUser(userId: string) {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student || student.status !== "Active") {
    throw new PortalAccessError("No active student profile is linked to this account");
  }
  return student;
}
'''
new_portal = '''async function studentForUser(userId: string) {
  const student = await prisma.student.findUnique({ where: { userId } });
  if (!student || student.status !== "Active") {
    throw new PortalAccessError("No active student profile is linked to this account");
  }
  // Roster-only Students may legitimately have no email, but a linked Student
  // Portal account must have been provisioned through an official email.
  if (!student.email) {
    throw new PortalAccessError("The linked student portal profile has no official email");
  }
  return { ...student, email: student.email };
}
'''
if portal.count(old_portal) != 1:
    raise SystemExit(f"studentForUser anchor count was {portal.count(old_portal)}, expected 1")
portal_path.write_text(portal.replace(old_portal, new_portal, 1))

importer_path = Path("apps/backend/scripts/student-roster-import.ts")
importer = importer_path.read_text()
old_importer = '''    for (const [index, student] of document.students.entries()) {
      if (!cohortCodes.has(student.cohortCode.toLowerCase())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown cohortCode '${student.cohortCode}'`,
          path: ["students", index, "cohortCode"],
        });
      }
    }
'''
new_importer = '''    const sourceRefs = new Set<string>();
    for (const [index, student] of document.students.entries()) {
      const sourceKey = student.sourceRef.toLowerCase();
      if (sourceRefs.has(sourceKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate sourceRef '${student.sourceRef}'`,
          path: ["students", index, "sourceRef"],
        });
      }
      sourceRefs.add(sourceKey);

      if (!cohortCodes.has(student.cohortCode.toLowerCase())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown cohortCode '${student.cohortCode}'`,
          path: ["students", index, "cohortCode"],
        });
      }
    }
'''
if importer.count(old_importer) != 1:
    raise SystemExit(f"sourceRef anchor count was {importer.count(old_importer)}, expected 1")
importer_path.write_text(importer.replace(old_importer, new_importer, 1))
