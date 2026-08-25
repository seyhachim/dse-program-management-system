import { PROGRAMME_TITLE } from "@dse-pms/shared-types";

type CourseType = "Basic" | "Core" | "Elective" | "Specialization" | "MoeysHeip";
type Semester = "First" | "Second";

export type ReviewedPlacement = {
  year: number;
  semester: 1 | 2;
  reason: string;
  approvedBy: string;
  approvedAt: string;
  sourceIssue?: string | null;
};

export type CourseInfoImportDocument = {
  source: {
    yearFolder?: number | null;
    semesterFolder?: number | null;
  };
  reviewedPlacement?: ReviewedPlacement | null;
  course: {
    programmeTitle?: string | null;
    code: string;
    title: string;
    credits?: { total?: number | null };
    prerequisites?: string | null;
    courseType?: string | null;
    availability?: {
      semester?: number | null;
      year?: number | null;
    };
    description?: string | null;
  };
  lecturers: {
    primary: {
      name?: string | null;
      title?: string | null;
      qualification?: string | null;
      email?: string | null;
      phone?: string | null;
    };
    coLecturers?: string[];
  };
};

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function courseTypeFromRaw(value?: string | null): CourseType | null {
  const normalized = cleanText(value).toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("basic")) return "Basic";
  if (normalized.includes("core")) return "Core";
  if (normalized.includes("elective")) return "Elective";
  if (normalized.includes("special")) return "Specialization";
  if (normalized.includes("moeys") || normalized.includes("heip")) return "MoeysHeip";
  return null;
}

function semesterFromNumber(value?: number | null): Semester | null {
  if (value === 1) return "First";
  if (value === 2) return "Second";
  return null;
}

/**
 * Build the immutable Course Information (§1–13) snapshot directly from the
 * canonical import document. Raw legacy imports keep source-folder placement
 * precedence. A programme-owner-reviewed relocation can explicitly override the
 * snapshot placement while the original source folder remains unchanged as
 * provenance in the canonical document.
 */
export function courseInfoSnapshotFromDocument(
  doc: CourseInfoImportDocument,
  totalSltHours: number | null,
) {
  const semesterNumber =
    doc.reviewedPlacement?.semester ??
    doc.source.semesterFolder ??
    doc.course.availability?.semester ??
    null;
  const programmeYear =
    doc.reviewedPlacement?.year ??
    doc.source.yearFolder ??
    doc.course.availability?.year ??
    null;

  return {
    programmeTitle: cleanText(doc.course.programmeTitle) || PROGRAMME_TITLE,
    courseTitle: cleanText(doc.course.title),
    courseCode: cleanText(doc.course.code).toUpperCase(),
    credits: doc.course.credits?.total ?? null,
    prerequisites: cleanText(doc.course.prerequisites),
    courseType: courseTypeFromRaw(doc.course.courseType),
    description: cleanText(doc.course.description),
    totalSltHours,
    instructorName: cleanText(doc.lecturers.primary.name),
    instructorTitle: cleanText(doc.lecturers.primary.title),
    qualification: cleanText(doc.lecturers.primary.qualification),
    email: cleanText(doc.lecturers.primary.email),
    telephone: cleanText(doc.lecturers.primary.phone),
    otherLecturers: (doc.lecturers.coLecturers ?? []).map(cleanText).filter(Boolean).join(", "),
    semester: semesterFromNumber(semesterNumber),
    programmeYear: Number.isInteger(programmeYear) && (programmeYear ?? 0) > 0 ? programmeYear : null,
  };
}

export function courseInfoSnapshotWarnings(doc: CourseInfoImportDocument): string[] {
  const warnings: string[] = [];
  const folderSemester = doc.source.semesterFolder;
  const documentSemester = doc.course.availability?.semester;
  const folderYear = doc.source.yearFolder;
  const documentYear = doc.course.availability?.year;

  if (doc.reviewedPlacement) {
    const review = doc.reviewedPlacement;
    const provenance = [
      `approved by ${cleanText(review.approvedBy)}`,
      `at ${cleanText(review.approvedAt)}`,
      cleanText(review.sourceIssue) ? `via ${cleanText(review.sourceIssue)}` : "",
      cleanText(review.reason) ? `reason: ${cleanText(review.reason)}` : "",
    ]
      .filter(Boolean)
      .join(", ");
    warnings.push(
      `Reviewed placement override applied: Year ${review.year}, Semester ${review.semester}; legacy source placement remains preserved as provenance${provenance ? ` (${provenance})` : ""}`,
    );
    return warnings;
  }

  if (
    folderSemester != null &&
    documentSemester != null &&
    folderSemester !== documentSemester
  ) {
    warnings.push(
      `Semester metadata conflict: source folder=${folderSemester}, extracted document=${documentSemester}; Course Information snapshot uses source folder`,
    );
  }
  if (folderYear != null && documentYear != null && folderYear !== documentYear) {
    warnings.push(
      `Programme year metadata conflict: source folder=${folderYear}, extracted document=${documentYear}; Course Information snapshot uses source folder`,
    );
  }

  return warnings;
}
