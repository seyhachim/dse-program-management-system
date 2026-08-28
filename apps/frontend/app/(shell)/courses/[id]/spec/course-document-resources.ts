import type { CourseDocumentModel } from "./course-document-model";

type DocumentResource = CourseDocumentModel["resources"][number];

type ResourceCategory =
  | "Software / Programming Environment"
  | "Libraries / Frameworks"
  | "Datasets"
  | "Teaching Materials"
  | "Project / Assessment Materials"
  | "Tools"
  | "Other Course Resources";

const CATEGORY_ORDER: readonly ResourceCategory[] = [
  "Software / Programming Environment",
  "Libraries / Frameworks",
  "Datasets",
  "Teaching Materials",
  "Project / Assessment Materials",
  "Tools",
  "Other Course Resources",
];

function normalizedText(resource: DocumentResource): string {
  return `${resource.resourceType} ${resource.title}`.trim().toLowerCase();
}

export function courseDocumentResourceCategory(
  resource: DocumentResource,
): ResourceCategory {
  const value = normalizedText(resource);

  if (/\b(python|jupyter|colab|notebook|r studio|rstudio)\b/.test(value)) {
    return "Software / Programming Environment";
  }

  if (
    /\b(pandas|numpy|scikit|sklearn|scikit-learn|tensorflow|pytorch|keras|xgboost|matplotlib|seaborn|plotly)\b/.test(
      value,
    )
  ) {
    return "Libraries / Frameworks";
  }

  if (/\b(dataset|data set|data source|corpus)\b/.test(value)) {
    return "Datasets";
  }

  if (/\b(slide|slides|lecture material|handout|worksheet|reading material)\b/.test(value)) {
    return "Teaching Materials";
  }

  if (
    /\b(project|exam|quiz|assignment|assessment|defence|defense|presentation|rubric)\b/.test(
      value,
    )
  ) {
    return "Project / Assessment Materials";
  }

  if (/\b(tool|tools|pipeline|git|github|gitlab|tracker|tracking)\b/.test(value)) {
    return "Tools";
  }

  return "Other Course Resources";
}

/**
 * Presentation-only summary for Course Specification §19.
 *
 * Weekly resources are already shown against their weeks in §18. For §19 we
 * collapse metadata-free records into a concise course-level summary while
 * keeping any record that carries a URL or notes as its own auditable row.
 * Source records are never changed.
 */
export function presentCourseDocumentResources(
  resources: CourseDocumentModel["resources"],
): CourseDocumentModel["resources"] {
  const grouped = new Map<ResourceCategory, string[]>();
  const detailed: DocumentResource[] = [];

  for (const resource of resources) {
    const category = courseDocumentResourceCategory(resource);
    const title = resource.title.trim();
    const hasDetail = resource.url.trim().length > 0 || resource.notes.trim().length > 0;

    if (hasDetail) {
      detailed.push({ ...resource, resourceType: category });
      continue;
    }

    if (!title) continue;
    const titles = grouped.get(category) ?? [];
    if (!titles.some((existing) => existing.toLowerCase() === title.toLowerCase())) {
      titles.push(title);
    }
    grouped.set(category, titles);
  }

  const summaries = CATEGORY_ORDER.flatMap((category) => {
    const titles = grouped.get(category) ?? [];
    if (titles.length === 0) return [];
    return [
      {
        id: `course-resource-group:${category}`,
        resourceType: category,
        title: titles.join(", "),
        url: "",
        notes: "",
      },
    ];
  });

  const detailedByCategory = [...detailed].sort((left, right) => {
    const categoryOrder =
      CATEGORY_ORDER.indexOf(left.resourceType as ResourceCategory) -
      CATEGORY_ORDER.indexOf(right.resourceType as ResourceCategory);
    if (categoryOrder !== 0) return categoryOrder;
    return left.title.localeCompare(right.title);
  });

  return [...summaries, ...detailedByCategory];
}
