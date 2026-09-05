import { describe, expect, test } from "bun:test";

const specClientPath = new URL("./spec-client.tsx", import.meta.url);
const cachedEditorPath = new URL("./course-spec-cached-editor.tsx", import.meta.url);
const gatewayPath = new URL("./course-spec-client-gateway.tsx", import.meta.url);
const versionHistoryPath = new URL("./version-history-bar.tsx", import.meta.url);
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

  test("uses the shared protected query cache instead of indefinite CourseSpec promise caches", async () => {
    const [courseSpecApi, teachingLearningApi, cachedEditor, gateway, versionHistory] =
      await Promise.all([
        Bun.file(courseSpecApiPath).text(),
        Bun.file(teachingLearningApiPath).text(),
        Bun.file(cachedEditorPath).text(),
        Bun.file(gatewayPath).text(),
        Bun.file(versionHistoryPath).text(),
      ]);

    expect(courseSpecApi).not.toContain("courseSpecReadCache");
    expect(teachingLearningApi).not.toContain("profileReadCache");
    expect(teachingLearningApi).toContain("profileValueCache");
    expect(teachingLearningApi).toContain("getCached(courseId: string)");

    expect(cachedEditor).toContain("courseSpecAuthoringQueryKey");
    expect(cachedEditor).toContain("COURSE_SPEC_STALE_MS.draft");
    expect(cachedEditor).toContain("pinnedDataRef");
    expect(cachedEditor).toContain("onInputCapture");
    expect(gateway).toContain("courseSpecCoreQueryKey");
    expect(gateway).toContain("initialWorkflowRef");
    expect(versionHistory).toContain("courseSpecHistoryQueryKey");
    expect(versionHistory).toContain("COURSE_SPEC_STALE_MS.history");
  });

  test("still caches slow-changing method vocabulary locally with explicit mutation invalidation", async () => {
    const methodsApi = await Bun.file(methodsApiPath).text();
    expect(methodsApi).toContain("methodsListCache");
    expect(methodsApi).toContain("if (methodsListCache) return methodsListCache");
    expect(methodsApi).toContain("invalidateMethodsList");
  });

  test("hydrates the editor from the cached authoring bundle instead of mount-time aggregate loading", async () => {
    const source = await Bun.file(specClientPath).text();
    expect(source).toContain("initialData: CourseSpecAuthoringData");
    expect(source).toContain("const initialSpec = initialData.spec");
    expect(source).not.toContain("const load = useCallback");
    expect(source).not.toContain("setLoading(true)");
  });

  test("Overview consumes already-loaded Teaching & Learning state without starting a tab-entry request", async () => {
    const source = await Bun.file(overviewPath).text();

    expect(source).toContain("teachingLearningApi.getCached(courseId)");
    expect(source).not.toContain("teachingLearningApi.get(courseId)");
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
