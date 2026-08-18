import { mkdir } from "node:fs/promises";
import { Packer } from "docx";
import type {
  CurriculumArtifactView,
  CurriculumImportCourse,
  CurriculumImportPathway,
} from "@dse-pms/shared-types";
import { DseCurriculumImportSchema } from "@dse-pms/shared-types";
import { buildCurriculumWordDocument } from "../apps/frontend/app/(shell)/curriculum/curriculum-word-renderer.ts";

const source = DseCurriculumImportSchema.parse(
  JSON.parse(await Bun.file("docs/curriculum/dse-curriculum-2026.json").text()),
);
const defaultPathway =
  source.pathways.find((pathway) => pathway.code === source.curriculum.defaultPathwayCode) ??
  source.pathways.find((pathway) => pathway.isDefault) ??
  null;

function totals(
  pathways: CurriculumImportPathway[],
  courses: CurriculumImportCourse[],
): CurriculumArtifactView["totals"] {
  const common = courses.filter((course) => course.pathwayCode === null);
  const commonCredits = common.reduce((sum, course) => sum + course.credits.total, 0);
  const pathwayTotals = pathways.map((pathway) => {
    const scoped = courses.filter((course) => course.pathwayCode === pathway.code);
    return {
      code: pathway.code,
      name: pathway.name,
      isDefault: pathway.code === defaultPathway?.code,
      credits: scoped.reduce((sum, course) => sum + course.credits.total, 0),
      courseCount: scoped.length,
    };
  });
  const selected = pathwayTotals.find((pathway) => pathway.isDefault) ?? null;
  const computedSelectedRouteCredits = commonCredits + (selected?.credits ?? 0);
  return {
    commonCredits,
    commonCourseCount: common.length,
    pathways: pathwayTotals,
    computedSelectedRouteCredits,
    selectedRouteCredits:
      source.declaredTotals?.programmeCredits ?? computedSelectedRouteCredits,
    selectedRouteCourseCount:
      source.declaredTotals?.programmeCourseCount ??
      common.length + (selected?.courseCount ?? 0),
  };
}

const artifact: CurriculumArtifactView = {
  curriculum: {
    id: "00000000-0000-4000-a000-000000000001",
    programmeId: "dse",
    programmeCode: source.programmeCode,
    code: source.curriculum.code,
    name: source.curriculum.name,
    academicYear: source.curriculum.academicYear,
    version: source.curriculum.version,
    status: "Approved",
    defaultPathwayCode: defaultPathway?.code ?? null,
  },
  pathways: source.pathways,
  courses: source.courses.map((course) => ({
    ...course,
    courseId: null,
    placementId: null,
  })),
  declaredTotals: source.declaredTotals ?? null,
  totals: totals(source.pathways, source.courses),
  source: null,
};

if (artifact.totals.computedSelectedRouteCredits !== 144) {
  throw new Error(
    `Expected DSE 2026 row arithmetic to remain 144, got ${artifact.totals.computedSelectedRouteCredits}`,
  );
}
if (artifact.totals.selectedRouteCredits !== 143) {
  throw new Error(
    `Expected official DSE 2026 declared total 143, got ${artifact.totals.selectedRouteCredits}`,
  );
}
if (artifact.totals.selectedRouteCourseCount !== 48) {
  throw new Error(
    `Expected official DSE 2026 declared course count 48, got ${artifact.totals.selectedRouteCourseCount}`,
  );
}

await mkdir("artifacts", { recursive: true });
const output = "artifacts/DSE-Curriculum-2026-v1.0-smoke.docx";
const buffer = await Packer.toBuffer(buildCurriculumWordDocument(artifact));
await Bun.write(output, buffer);
console.log(
  `Generated ${output}: official 48 courses / 143 credits; row arithmetic preserved as 144 credits.`,
);
