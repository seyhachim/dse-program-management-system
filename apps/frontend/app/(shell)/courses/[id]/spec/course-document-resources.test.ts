import { describe, expect, it } from "bun:test";

import {
  courseDocumentResourceCategory,
  presentCourseDocumentResources,
} from "./course-document-resources";

const resource = (
  title: string,
  overrides: Partial<{
    id: string;
    resourceType: string;
    url: string;
    notes: string;
  }> = {},
) => ({
  id: overrides.id ?? title,
  resourceType: overrides.resourceType ?? "Weekly resource",
  title,
  url: overrides.url ?? "",
  notes: overrides.notes ?? "",
});

describe("courseDocumentResourceCategory", () => {
  it("classifies common course-delivery resources conservatively", () => {
    expect(courseDocumentResourceCategory(resource("Python"))).toBe(
      "Software / Programming Environment",
    );
    expect(courseDocumentResourceCategory(resource("Pandas"))).toBe(
      "Libraries / Frameworks",
    );
    expect(courseDocumentResourceCategory(resource("Dataset"))).toBe("Datasets");
    expect(courseDocumentResourceCategory(resource("Lecture Slides"))).toBe(
      "Teaching Materials",
    );
    expect(courseDocumentResourceCategory(resource("Final Project"))).toBe(
      "Project / Assessment Materials",
    );
    expect(courseDocumentResourceCategory(resource("Tracking tools"))).toBe("Tools");
    expect(courseDocumentResourceCategory(resource("Special lab access"))).toBe(
      "Other Course Resources",
    );
  });
});

describe("presentCourseDocumentResources", () => {
  it("collapses metadata-free weekly rows into course-level summary rows", () => {
    const result = presentCourseDocumentResources([
      resource("Python"),
      resource("Jupyter"),
      resource("Pandas"),
      resource("Lecture Slides"),
      resource("Dataset"),
      resource("Final Project"),
      resource("Metrics tools"),
    ]);

    expect(result.map((item) => [item.resourceType, item.title])).toEqual([
      ["Software / Programming Environment", "Python, Jupyter"],
      ["Libraries / Frameworks", "Pandas"],
      ["Datasets", "Dataset"],
      ["Teaching Materials", "Lecture Slides"],
      ["Project / Assessment Materials", "Final Project"],
      ["Tools", "Metrics tools"],
    ]);
  });

  it("deduplicates titles case-insensitively", () => {
    const result = presentCourseDocumentResources([
      resource("Python"),
      resource("python", { id: "python-2" }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("Python");
  });

  it("keeps records with links or notes as separate auditable rows", () => {
    const result = presentCourseDocumentResources([
      resource("Python"),
      resource("Python setup guide", {
        id: "guide",
        url: "https://example.edu/python",
        notes: "Install before Week 1",
      }),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      resourceType: "Software / Programming Environment",
      title: "Python",
      url: "",
      notes: "",
    });
    expect(result[1]).toMatchObject({
      id: "guide",
      resourceType: "Software / Programming Environment",
      title: "Python setup guide",
      url: "https://example.edu/python",
      notes: "Install before Week 1",
    });
  });

  it("does not mutate the source resource records", () => {
    const source = [resource("Python")];
    presentCourseDocumentResources(source);
    expect(source[0]?.resourceType).toBe("Weekly resource");
  });
});
