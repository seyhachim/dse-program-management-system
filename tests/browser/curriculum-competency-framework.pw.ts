import { expect, request, test, type APIRequestContext } from "@playwright/test";
import { newRoleContext, openCurriculum } from "./auth.ts";

const API_URL = "http://127.0.0.1:4000";
const smokeFrameworkName = "Browser Smoke Graduate Competencies";

type CurriculumRead = {
  curriculum: { id: string };
  selectedVersion: { id: string; status: string };
};

type Course = { id: string; code: string };

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

async function expectOk(response: Awaited<ReturnType<APIRequestContext["post"]>>) {
  expect(response.ok(), await response.text()).toBeTruthy();
}

test.describe.serial("#812 competency framework browser smoke", () => {
  let curriculum: CurriculumRead;
  let adminApi: APIRequestContext;

  test.beforeAll(async () => {
    adminApi = await apiFor("BROWSER_SMOKE_ADMIN_TOKEN");

    const coursesResponse = await adminApi.get("/api/courses");
    expect(coursesResponse.ok(), await coursesResponse.text()).toBeTruthy();
    const courses = (await coursesResponse.json()) as Course[];
    const course = courses.find((item) => item.code === "CS101") ?? courses[0];
    if (!course) throw new Error("Seeded browser-smoke course is missing");

    const create = await adminApi.post("/api/programme/curricula/programmes/dse", {
      data: {
        code: `BROWSER-SMOKE-${Date.now()}`,
        name: "Browser Smoke Curriculum",
        cohortLabel: "Browser Smoke Cohort",
        intakeYear: 2026,
        academicYear: "2026",
        effectiveFrom: "2026-09-01",
      },
    });
    expect(create.ok(), await create.text()).toBeTruthy();
    curriculum = (await create.json()) as CurriculumRead;

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
  });

  test.afterAll(async () => {
    await adminApi?.dispose();
  });

  test("Draft assignment persists, then Approved history is read-only for writer and reader", async ({
    browser,
  }) => {
    const writer = await newRoleContext(browser, "coordinator");
    const writerPage = await writer.newPage();

    await openCurriculum(writerPage);
    await expect(writerPage.getByText("Draft design context")).toBeVisible();

    await writerPage.getByLabel("Framework code").fill("browser-smoke-competencies");
    await writerPage.getByLabel("Framework name").fill(smokeFrameworkName);
    await writerPage.getByLabel("Framework change note").fill("#823 Playwright smoke");
    await writerPage
      .getByRole("button", { name: "Create snapshot & assign" })
      .click();

    await expect(
      writerPage.getByText(smokeFrameworkName, { exact: true }),
    ).toBeVisible();
    await expect(writerPage.getByText(/Framework v1/)).toBeVisible();

    await writerPage.reload();
    await expect(
      writerPage.getByText(smokeFrameworkName, { exact: true }),
    ).toBeVisible();
    await expect(writerPage.getByText("Draft design context")).toBeVisible();

    const submit = await adminApi.post(
      `/api/programme/curricula/versions/${curriculum.selectedVersion.id}/workflow/submit`,
      { data: { comment: "Browser smoke review" } },
    );
    await expectOk(submit);

    const approve = await adminApi.post(
      `/api/programme/curricula/versions/${curriculum.selectedVersion.id}/workflow/approve`,
      { data: { comment: "Browser smoke approval" } },
    );
    await expectOk(approve);

    await writerPage.reload();
    await expect(writerPage.getByText("Read-only historical snapshot")).toBeVisible();
    await expect(
      writerPage.getByRole("button", { name: "Create snapshot & assign" }),
    ).toHaveCount(0);
    await expect(
      writerPage.getByRole("button", { name: "Assign", exact: true }),
    ).toHaveCount(0);
    await writer.close();

    const readOnly = await newRoleContext(browser, "readOnly");
    const readOnlyPage = await readOnly.newPage();
    await openCurriculum(readOnlyPage);
    await expect(
      readOnlyPage.getByText(smokeFrameworkName, { exact: true }),
    ).toBeVisible();
    await expect(
      readOnlyPage.getByText("Read-only historical snapshot"),
    ).toBeVisible();
    await expect(readOnlyPage.getByLabel("Framework code")).toHaveCount(0);
    await expect(
      readOnlyPage.getByRole("button", { name: "Create snapshot & assign" }),
    ).toHaveCount(0);
    await readOnly.close();
  });
});
