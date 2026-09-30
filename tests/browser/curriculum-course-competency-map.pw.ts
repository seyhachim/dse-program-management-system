import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { newRoleContext, openCurriculum } from "./auth.ts";

const API_URL = "http://127.0.0.1:4000";
const curriculumName = "Browser Smoke TUA Curriculum";

type CurriculumRead = {
  curriculum: { id: string };
  selectedVersion: { id: string; status: string };
};

type Course = { id: string; code: string };

type Framework = {
  frameworkVersionId: string;
  competencies: Array<{ id: string; code: string; name: string }>;
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

async function selectCurriculum(
  page: Page,
  curriculumId: string,
  expectedName: string,
) {
  const selector = page.getByRole("combobox", {
    name: "Curriculum",
    exact: true,
  });
  if (await selector.count()) {
    await selector.selectOption(curriculumId);
  }
  await expect(
    page.getByRole("heading", { name: expectedName, exact: true }),
  ).toBeVisible();
  await page.getByRole("heading", { name: "Course–Competency Mapping" }).waitFor();
}

test("#813 Course→Competency T/U/A edit, clear, mobile, keyboard and history smoke", async ({
  browser,
}) => {
  const adminApi = await apiFor("BROWSER_SMOKE_ADMIN_TOKEN");

  const coursesResponse = await adminApi.get("/api/courses");
  expect(coursesResponse.ok(), await coursesResponse.text()).toBeTruthy();
  const courses = (await coursesResponse.json()) as Course[];
  const course = courses.find((item) => item.code === "CS101") ?? courses[0];
  if (!course) throw new Error("Seeded browser-smoke course is missing");

  const create = await adminApi.post("/api/programme/curricula/programmes/dse", {
    data: {
      code: `BROWSER-TUA-${Date.now()}`,
      name: curriculumName,
      cohortLabel: "Browser TUA Cohort",
      intakeYear: 2026,
      academicYear: "2026",
      effectiveFrom: "2026-09-01",
    },
  });
  expect(create.ok(), await create.text()).toBeTruthy();
  const curriculum = (await create.json()) as CurriculumRead;

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
        code: `browser-tua-${Date.now()}`,
        name: "Browser TUA Graduate Competencies",
        changeNote: "#813 Playwright smoke",
      },
    },
  );
  expect(frameworkResponse.ok(), await frameworkResponse.text()).toBeTruthy();
  const framework = (await frameworkResponse.json()) as Framework;
  const competency = framework.competencies[0];
  if (!competency) throw new Error("Framework snapshot has no competencies");

  const bind = await adminApi.put(
    `/api/programme/curricula/versions/${curriculum.selectedVersion.id}/competency-framework`,
    { data: { frameworkVersionId: framework.frameworkVersionId } },
  );
  expect(bind.ok(), await bind.text()).toBeTruthy();

  const writer = await newRoleContext(browser, "coordinator");
  const page = await writer.newPage();
  await openCurriculum(page);
  await selectCurriculum(page, curriculum.curriculum.id, curriculumName);
  await expect(page.getByText("Draft · editable")).toBeVisible();

  const emptyCellName =
    `${course.code}, ${competency.code} ${competency.name}: No teaching mapping recorded. Edit mapping`;
  const cell = page.getByRole("button", { name: emptyCellName });
  await cell.focus();
  await expect(cell).toBeFocused();
  await page.keyboard.press("Enter");

  await page.getByRole("combobox", { name: "Teach", exact: true }).selectOption("Intermediate");
  await page.getByRole("combobox", { name: "Use", exact: true }).selectOption("Advanced");
  await page.getByRole("combobox", { name: "Assess", exact: true }).selectOption("Advanced");
  await page.getByRole("button", { name: "Save mapping" }).click();

  await page.getByRole("tab", { name: "Teach / Use / Assess" }).click();
  await expect(
    page.getByRole("button", {
      name: `${course.code}, ${competency.code} ${competency.name}: T:I U:A A:A. Edit mapping`,
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Expanded" }).click();
  await expect(
    page.getByRole("button", {
      name: `${course.code}, ${competency.code}, Teach: Intermediate`,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: `${course.code}, ${competency.code}, Use: Advanced`,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: `${course.code}, ${competency.code}, Assess: Advanced`,
    }),
  ).toBeVisible();

  const mapSection = page.locator('section[aria-labelledby="competency-map-title"]');
  await mapSection.getByRole("tab", { name: "Competency Pathway" }).click();
  const pathwayPanel = mapSection.getByRole("tabpanel");
  await expect(
    pathwayPanel.getByRole("heading", { name: "Year 1" }),
  ).toBeVisible();
  await expect(pathwayPanel.getByText("T:I", { exact: true })).toBeVisible();
  await expect(pathwayPanel.getByText("U:A", { exact: true })).toBeVisible();
  await expect(pathwayPanel.getByText("A:A", { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Teach / Use / Assess" }).click();
  const mobileCourseCard = page.locator("article").filter({ hasText: course.code });
  await expect(mobileCourseCard).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Add or review competency", exact: true })).toBeVisible();

  await page.getByRole("combobox", { name: "Add or review competency", exact: true }).selectOption(competency.id);
  await page.getByRole("combobox", { name: "Teach", exact: true }).selectOption("");
  await page.getByRole("combobox", { name: "Use", exact: true }).selectOption("");
  await page.getByRole("combobox", { name: "Assess", exact: true }).selectOption("");
  await page.getByRole("button", { name: "Clear mapping" }).click();
  await expect(
    page.getByText("No mapping recorded for the current view."),
  ).toBeVisible();

  await page.getByRole("combobox", { name: "Add or review competency", exact: true }).selectOption(competency.id);
  await page.getByRole("combobox", { name: "Teach", exact: true }).selectOption("Intermediate");
  await page.getByRole("combobox", { name: "Use", exact: true }).selectOption("Advanced");
  await page.getByRole("combobox", { name: "Assess", exact: true }).selectOption("Advanced");
  await page.getByRole("button", { name: "Save mapping" }).click();
  await expect(
    mobileCourseCard.getByText("T:I", { exact: true }),
  ).toBeVisible();

  const submit = await adminApi.post(
    `/api/programme/curricula/versions/${curriculum.selectedVersion.id}/workflow/submit`,
    { data: { comment: "Browser TUA smoke review" } },
  );
  await expectOk(submit);
  const approve = await adminApi.post(
    `/api/programme/curricula/versions/${curriculum.selectedVersion.id}/workflow/approve`,
    { data: { comment: "Browser TUA smoke approval" } },
  );
  await expectOk(approve);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await expect(page.getByText("Read-only historical map")).toBeVisible();

  await writer.close();

  const readOnly = await newRoleContext(browser, "readOnly");
  const readOnlyPage = await readOnly.newPage();
  await openCurriculum(readOnlyPage);
  await selectCurriculum(readOnlyPage, curriculum.curriculum.id, curriculumName);
  await readOnlyPage.getByRole("tab", { name: "Teach / Use / Assess" }).click();

  const readOnlyCell = readOnlyPage.getByRole("button", {
    name: `${course.code}, ${competency.code} ${competency.name}: T:I U:A A:A. View mapping`,
  });
  await expect(readOnlyCell).toBeVisible();
  await readOnlyCell.click();
  await expect(
    readOnlyPage.getByText("Read-only historical mapping. Changes require a Draft curriculum revision."),
  ).toBeVisible();
  await expect(
    readOnlyPage.getByRole("button", { name: "Save mapping" }),
  ).toHaveCount(0);

  await readOnly.close();
  await adminApi.dispose();
});
