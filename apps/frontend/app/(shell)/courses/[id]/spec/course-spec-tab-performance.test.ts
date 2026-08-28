import { describe, expect, test } from "bun:test";

const specClientPath = new URL("./spec-client.tsx", import.meta.url);
const readOnlyClientPath = new URL("./read-only-spec-client.tsx", import.meta.url);
const overviewPath = new URL("./overview-tab.tsx", import.meta.url);
const courseDocumentPath = new URL("./course-document-model.ts", import.meta.url);
const courseSpecApiPath = new URL("../../../../../lib/course-spec.ts", import.meta.url);
const teachingLearningApiPath = new URL(
  "../../../../../lib/teaching-learning.ts",
  import.meta.url,
);
const methodsApiPath = new URL("../../../../../lib/methods.ts", import.meta.url);

describe("Course Specification tab data reuse", () => {
  test("keeps editable and read-only tab changes inside browser history", async () => {
    const [editable, readOnly] = await Promise.all([
      Bun.file(specClientPath).text(),
      Bun.file(readOnlyClientPath).text(),
    ]);

    for (const source of [editable, readOnly]) {
      expect(source).toContain("window.history.replaceState");
      expect(source).not.toContain("useRouter");
      expect(source).not.toContain("router.replace(");
    }
  });

  test("deduplicates repeated Course Spec, Teaching & Learning, and method vocabulary reads", async () => {
    const [courseSpecApi, teachingLearningApi, methodsApi] = await Promise.all([
      Bun.file(courseSpecApiPath).text(),
      Bun.file(teachingLearningApiPath).text(),
      Bun.file(methodsApiPath).text(),
    ]);

    expect(courseSpecApi).toContain("courseSpecReadCache");
    expect(courseSpecApi).toContain("const cached = courseSpecReadCache.get(courseId)");
    expect(teachingLearningApi).toContain("profileReadCache");
    expect(teachingLearningApi).toContain("const cached = profileReadCache.get(courseId)");
    expect(teachingLearningApi).toContain("profileValueCache");
    expect(teachingLearningApi).toContain("getCached(courseId: string)");
    expect(methodsApi).toContain("methodsListCache");
    expect(methodsApi).toContain("if (methodsListCache) return methodsListCache");
  });

  test("Overview consumes the already-loaded Teaching & Learning cache instead of starting a tab-entry request", async () => {
    const source = await Bun.file(overviewPath).text();

    expect(source).toContain("teachingLearningApi.getCached(courseId)");
    expect(source).not.toContain("teachingLearningApi\n      .get(courseId)");
    expect(source).not.toContain("useEffect(() =>");
  });

  test("numbers official instructional weeks from their visible order", async () => {
    const source = await Bun.file(courseDocumentPath).text();

    expect(source).toContain(
      "instructionalWeeklyPlan(weeklyPlan).map((week, index) =>",
    );
    expect(source).toContain("const displayWeek = String(index + 1)");
    expect(source).toContain("week: displayWeek");
    expect(source).toContain(
      "topic: normalizeCourseDocumentTopic(displayWeek, week.topic)",
    );
  });
});
