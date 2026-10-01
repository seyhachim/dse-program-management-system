import {
  expect,
  request,
  test,
  type APIRequestContext,
} from "@playwright/test";
import { newRoleContext } from "./auth.ts";

const API_URL = "http://127.0.0.1:4000";

type Course = { id: string; code: string };

type CurriculumRead = {
  curriculum: { id: string };
  selectedVersion: { id: string; status: string };
};

type Framework = {
  frameworkVersionId: string;
  competencies: Array<{ id: string; code: string; name: string }>;
};

type CompetencyMap = {
  courses: Array<{ placementId: string; courseId: string }>;
};

type ApprovedSpecVersion = {
  id: string;
  version: string;
};

async function apiFor(tokenName: string): Promise<APIRequestContext> {
  const token = process.env[tokenName]?.trim();
  if (!token) throw new Error(`${tokenName} is required`);
  return request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

async function expectOk(
  response: Awaited<ReturnType<APIRequestContext["post"]>>,
) {
  expect(response.ok(), await response.text()).toBeTruthy();
}

test("#1203 CourseSpec programme competency evidence link, clear, mobile, and historical smoke", async ({
  browser,
}) => {
  const adminApi = await apiFor("BROWSER_SMOKE_ADMIN_TOKEN");

  const coursesResponse = await adminApi.get("/api/courses");
  expect(coursesResponse.ok(), await coursesResponse.text()).toBeTruthy();
  const courses = (await coursesResponse.json()) as Course[];
  const course = courses.find((item) => item.code === "CS101") ?? courses[0];
  if (!course) throw new Error("Seeded browser-smoke course is missing");

  const approvedSpecsResponse = await adminApi.get(
    `/api/courses/${course.id}/approved-spec-versions`,
  );
  expect(
    approvedSpecsResponse.ok(),
    await approvedSpecsResponse.text(),
  ).toBeTruthy();
  const approvedSpecs =
    (await approvedSpecsResponse.json()) as ApprovedSpecVersion[];
  const sourceSpec = approvedSpecs[0];
  if (!sourceSpec) {
    throw new Error(
      "Seeded approved CourseSpec is required for #1203 browser smoke",
    );
  }

  const createCurriculum = await adminApi.post(
    "/api/programme/curricula/programmes/dse",
    {
      data: {
        code: `BROWSER-CS-COMP-${Date.now()}`,
        name: "Browser CourseSpec Competency Curriculum",
        cohortLabel: "Browser CourseSpec Competency Cohort",
        intakeYear: 2026,
        academicYear: "2026",
        effectiveFrom: "2026-09-01",
      },
    },
  );
  expect(
    createCurriculum.ok(),
    await createCurriculum.text(),
  ).toBeTruthy();
  const curriculum = (await createCurriculum.json()) as CurriculumRead;

  const addCourse = await adminApi.post(
    `/api/programme/curricula/versions/${curriculum.selectedVersion.id}/courses`,
    {
      data: {
        courseId: course.id,
        yearLevel: 1,
        semester: "First",
        sortOrder: 0,
      },
    },
  );
  expect(addCourse.ok(), await addCourse.text()).toBeTruthy();

  const frameworkResponse = await adminApi.post(
    "/api/programme/competency-frameworks/programmes/dse",
    {
      data: {
        code: `browser-course-spec-${Date.now()}`,
        name: "Browser CourseSpec Competencies",
        changeNote: "#1203 Playwright smoke",
      },
    },
  );
  expect(
    frameworkResponse.ok(),
    await frameworkResponse.text(),
  ).toBeTruthy();
  const framework = (await frameworkResponse.json()) as Framework;
  const competency = framework.competencies[0];
  if (!competency) throw new Error("Framework snapshot has no competencies");

  const bindFramework = await adminApi.put(
    `/api/programme/curricula/versions/${curriculum.selectedVersion.id}/competency-framework`,
    { data: { frameworkVersionId: framework.frameworkVersionId } },
  );
  expect(
    bindFramework.ok(),
    await bindFramework.text(),
  ).toBeTruthy();

  const mapResponse = await adminApi.get(
    `/api/programme/curricula/versions/${curriculum.selectedVersion.id}/competency-map`,
  );
  expect(mapResponse.ok(), await mapResponse.text()).toBeTruthy();
  const competencyMap = (await mapResponse.json()) as CompetencyMap;
  const placement = competencyMap.courses.find(
    (item) => item.courseId === course.id,
  );
  if (!placement) throw new Error("Curriculum course placement is missing");

  const saveProgrammeMapping = await adminApi.put(
    `/api/programme/curricula/versions/${curriculum.selectedVersion.id}/competency-map/courses/${placement.placementId}/competencies/${competency.id}`,
    {
      data: {
        teachLevel: "Basic",
        useLevel: "Intermediate",
        assessLevel: "Advanced",
        note: "#1203 browser smoke expectation",
      },
    },
  );
  expect(
    saveProgrammeMapping.ok(),
    await saveProgrammeMapping.text(),
  ).toBeTruthy();

  const bindCourseSpec = await adminApi.put(
    `/api/programme/curricula/versions/${curriculum.selectedVersion.id}/courses/${placement.placementId}/course-spec-version`,
    { data: { courseSpecVersionId: sourceSpec.id } },
  );
  expect(bindCourseSpec.ok(), await bindCourseSpec.text()).toBeTruthy();

  for (const [action, comment] of [
    ["submit", "Browser CourseSpec competency review"],
    ["approve", "Browser CourseSpec competency approval"],
    ["activate", "Browser CourseSpec competency activation"],
  ] as const) {
    const response = await adminApi.post(
      `/api/programme/curricula/versions/${curriculum.selectedVersion.id}/workflow/${action}`,
      { data: { comment } },
    );
    await expectOk(response);
  }

  const createRevision = await adminApi.post(
    `/api/courses/${course.id}/spec/revisions`,
    {
      data: {
        triggers: ["ProgrammeCoordinator"],
        evidenceSummary:
          "Browser smoke creates an editable revision from the approved specification.",
        changeSummary:
          "Verify programme competency evidence linking without changing the programme mapping.",
        impact: {
          courseCodeOrTitle: false,
          creditsOrSlt: false,
          prerequisites: false,
          materialCloChanges: false,
          bloomOrCapLevels: false,
          cloPloAlignment: false,
          assessmentStructureOrWeighting: false,
          curriculumOrRegulatoryAlignment: false,
        },
        proposedRevisionType: "Minor",
        effectiveAcademicTerm: "2026",
        overrideJustification: "",
      },
    },
  );
  const revisionStatus = createRevision.status();
  const revisionBody = await createRevision.text();
  if (revisionStatus !== 201) {
    expect(revisionStatus, revisionBody).toBe(409);
    expect(revisionBody).toContain("open academic revision");
  }

  // The seeded approved spec intentionally leaves two authoring-readiness
  // details unfinished. Complete those details on the isolated Draft revision
  // through the normal CourseSpec APIs so the smoke can exercise the real
  // submit/approve lock transition rather than mutating workflow state directly.
  const methodsResponse = await adminApi.get("/api/methods");
  expect(methodsResponse.ok(), await methodsResponse.text()).toBeTruthy();
  const methods = (await methodsResponse.json()) as {
    teaching: Array<{ id: string }>;
  };
  const teachingMethod = methods.teaching[0];
  if (!teachingMethod) throw new Error("Seeded teaching method is missing");

  const draftSpecResponse = await adminApi.get(
    `/api/courses/${course.id}/spec`,
  );
  expect(
    draftSpecResponse.ok(),
    await draftSpecResponse.text(),
  ).toBeTruthy();
  const draftSpec = (await draftSpecResponse.json()) as {
    data: {
      courseInfo?: { prerequisites?: string; description?: string };
      clos?: {
        items?: Array<{
          id: string;
          code: string;
          description: string;
          level?: string | null;
          mappedPlos?: string[];
          sltHours?: number | null;
          teachingMethodIds?: string[];
          activeLearningStrategyIds?: string[];
          assessmentMethodIds?: string[];
          status?: "active" | "inactive";
          notes?: string;
        }>;
      };
    };
  };

  const saveCourseInfo = await adminApi.put(
    `/api/courses/${course.id}/spec/courseInfo`,
    {
      data: {
        // CS101 has no prerequisite; omit that administratively controlled
        // field and mark Course Information complete through the editable
        // description field only.
        description: draftSpec.data.courseInfo?.description ?? "",
      },
    },
  );
  expect(saveCourseInfo.ok(), await saveCourseInfo.text()).toBeTruthy();

  const cloItems = draftSpec.data.clos?.items ?? [];
  if (cloItems.length === 0) {
    throw new Error("Draft CourseSpec has no CLOs");
  }
  const saveClos = await adminApi.put(
    `/api/courses/${course.id}/spec/clos`,
    {
      data: {
        items: cloItems.map((item) =>
          item.status === "inactive"
            ? item
            : { ...item, teachingMethodIds: [teachingMethod.id] },
        ),
      },
    },
  );
  expect(saveClos.ok(), await saveClos.text()).toBeTruthy();

  const writer = await newRoleContext(browser, "admin");
  const page = await writer.newPage();
  await page.goto(`/courses/${course.id}/spec?tab=mapping`);

  await expect(
    page.getByRole("heading", { name: "Constructive Alignment" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Programme Competency Expectations" }),
  ).toBeVisible();
  await expect(page.getByText(`${competency.code} — ${competency.name}`)).toBeVisible();
  await expect(page.getByText("T:B", { exact: true })).toBeVisible();
  await expect(page.getByText("U:I", { exact: true })).toBeVisible();
  await expect(page.getByText("A:A", { exact: true })).toBeVisible();

  // An expected competency with no explicit CourseSpec CLO links must show a
  // factual traceability gap rather than an academic sufficiency verdict.
  await expect(page.getByText("Needs evidence").first()).toBeVisible();
  await expect(
    page.getByText(
      /Evidence status confirms traceability only\. Academic reviewers decide/,
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Link CLO evidence" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", {
      name: `${competency.code} — ${competency.name}`,
    }),
  ).toBeVisible();
  const cloCheckbox = dialog.getByRole("checkbox").first();
  await expect(cloCheckbox).toBeVisible();
  await cloCheckbox.check();
  await dialog.getByRole("button", { name: "Save links" }).click();

  await expect(page.getByText(/CLO evidence:\s*CLO1/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit CLO links" }),
  ).toBeVisible();

  // Explicitly clear and restore the link to prove both mutation directions.
  await page.getByRole("button", { name: "Edit CLO links" }).click();
  const clearDialog = page.getByRole("dialog");
  const clearCheckbox = clearDialog.getByRole("checkbox").first();
  await clearCheckbox.uncheck();
  await clearDialog.getByRole("button", { name: "Clear links" }).click();
  await expect(page.getByText(/CLO evidence:\s*none linked/)).toBeVisible();
  await expect(page.getByText("Needs evidence").first()).toBeVisible();

  await page.getByRole("button", { name: "Link CLO evidence" }).click();
  const restoreDialog = page.getByRole("dialog");
  await restoreDialog.getByRole("checkbox").first().check();
  await restoreDialog.getByRole("button", { name: "Save links" }).click();
  await expect(page.getByText(/CLO evidence:\s*CLO1/)).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Programme Competency Expectations" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit CLO links" }),
  ).toBeVisible();

  const submitSpec = await adminApi.post(
    `/api/courses/${course.id}/spec/submit`,
    { data: { note: "#1203 browser smoke submission" } },
  );
  await expectOk(submitSpec);
  const approveSpec = await adminApi.post(
    `/api/courses/${course.id}/spec/review/approve`,
    { data: { note: "#1203 browser smoke approval" } },
  );
  await expectOk(approveSpec);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Programme Competency Expectations" }),
  ).toBeVisible();
  await expect(page.getByText(/CLO evidence:\s*CLO1/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit CLO links" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Link CLO evidence" }),
  ).toHaveCount(0);

  await writer.close();
  await adminApi.dispose();
});
