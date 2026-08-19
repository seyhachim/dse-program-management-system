export type CurriculumOperation =
  | "loading-version"
  | "reading-file"
  | "previewing"
  | "applying"
  | "exporting"
  | null;

type CurriculumOperationCopy = {
  title: string;
  description: string;
};

const OPERATION_COPY: Record<Exclude<CurriculumOperation, null>, CurriculumOperationCopy> = {
  "loading-version": {
    title: "Loading curriculum version…",
    description: "Refreshing the selected curriculum workflow state.",
  },
  "reading-file": {
    title: "Reading curriculum JSON…",
    description: "Preparing the selected file for validation and preview.",
  },
  previewing: {
    title: "Previewing curriculum…",
    description: "Validating the JSON and checking canonical course matches without changing academic data.",
  },
  applying: {
    title: "Applying curriculum…",
    description:
      "Creating draft courses, placements, pathways, and audit snapshots. This may take up to a minute; please keep this page open.",
  },
  exporting: {
    title: "Exporting curriculum DOCX…",
    description: "Building the document from the immutable published curriculum snapshot.",
  },
};

export function curriculumOperationCopy(
  operation: CurriculumOperation,
): CurriculumOperationCopy | null {
  return operation ? OPERATION_COPY[operation] : null;
}
