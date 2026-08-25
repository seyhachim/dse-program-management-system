import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(path: string, before: string, after: string): void {
  const source = readFileSync(path, "utf8");
  if (!source.includes(before)) throw new Error(`Pattern not found in ${path}: ${before.slice(0, 100)}`);
  writeFileSync(path, source.replace(before, after));
}

replaceOnce(
  "apps/backend/src/plugins/offerings/service.ts",
  "  async create(input: CreateOfferingInput): Promise<OfferingView> {",
  `  async programmeIdForCourse(courseId: string): Promise<string | null> {
    return (await courses().getById(courseId))?.programmeId ?? null;
  },

  async create(input: CreateOfferingInput): Promise<OfferingView> {`,
);

replaceOnce(
  "apps/backend/src/plugins/offerings/router.ts",
  `    try {
      res.status(201).json(await offeringService.create(parsed.data));
    } catch (err) {`,
  `    const targetProgrammeId = await offeringService.programmeIdForCourse(parsed.data.courseId);
    if (!targetProgrammeId) {
      res.status(400).json({ error: "Course does not exist" });
      return;
    }
    if (!hasAnyRoleInProgramme(req.user!, PROGRAMME_WIDE_ROLES, targetProgrammeId)) {
      res.status(403).json({ error: "You cannot create offerings for another programme" });
      return;
    }
    try {
      res.status(201).json(await offeringService.create(parsed.data));
    } catch (err) {`,
);

console.log("Epic #638 offering programme-scope guard applied");
