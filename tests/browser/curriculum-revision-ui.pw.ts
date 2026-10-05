import { expect, request, test, type APIRequestContext } from "@playwright/test";
import { newRoleContext, openCurriculum } from "./auth.ts";

const API_URL = "http://127.0.0.1:4000";

type CurriculumRead = {
  curriculum: { id: string };
  selectedVersion: {
    id: string;
    version: string;
    status: string;
  };
};

type CurriculumListItem = {
  id: string;
  versions: Array<{
    id: string;
    version: string;
    status: string;
    basedOnVersionId: string | null;
  }>;
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

async function expectOk(
  response: Awaited<ReturnType<APIRequestContext["post"]>>,
) {
  expect(response.ok(), await response.text()).toBeTruthy();
}

test("#1247 Create Revision UI creates an auditable Draft and stays hidden for read-only roles", async ({
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
      code: `BROWSER-REVISION-${Date.now()}`,
      name: "Browser Revision Curriculum",
      cohortLabel: "Browser Revision Cohort",
      intakeYear: 2026,
      academicYear: "2026-2027",
      effectiveFrom: "2026-09-01",
    },
  });
  expect(create.ok(), await create.text()).toBeTruthy();
  const curriculum = (await create.json()) as CurriculumRead;
  const predecessorId = curriculum.selectedVersion.id;

  const addCourse = await adminApi.post(
    `/api/programme/curricula/versions/${predecessorId}/courses`,
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

  await expectOk(
    await adminApi.post(
      `/api/programme/curricula/versions/${predecessorId}/workflow/submit`,
      { data: { comment: "Revision UI smoke review" } },
    ),
  );
  await expectOk(
    await adminApi.post(
      `/api/programme/curricula/versions/${predecessorId}/workflow/approve`,
      { data: { comment: "Revision UI smoke approval" } },
    ),
  );

  const writer = await newRoleContext(browser, "coordinator");
  const page = await writer.newPage();
  await openCurriculum(page);
  await page.getByRole("tab", { name: "Versions & Revisions" }).click();

  const versionSelect = page.getByRole("combobox", {
    name: "Workflow version",
  });
  await versionSelect.selectOption(predecessorId);

  await expect(
    page.getByRole("button", { name: "Create revision" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create revision" }).click();

  await expect(
    page.getByText("Create Curriculum Revision", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Based on v1.0 · Approved.")).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Minor → v1.1" }),
  ).toBeAttached();
  await expect(
    page.getByRole("option", { name: "Major → v2.0" }),
  ).toBeAttached();

  const createDraft = page.getByRole("button", {
    name: "Create v1.1 Draft",
  });
  await expect(createDraft).toBeDisabled();

  await page
    .getByRole("checkbox", { name: "Programme Coordinator" })
    .check();
  await page
    .getByLabel("Revision reason")
    .fill("Add versioned programme competency context.");
  await page
    .getByLabel("Change summary")
    .fill("Create an auditable Draft without changing the approved predecessor.");

  await expect(createDraft).toBeEnabled();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByText("Create Curriculum Revision", { exact: true }),
  ).toBeVisible();
  await createDraft.click();

  await expect(
    page.getByText("Created v1.1 Draft from v1.0.", { exact: true }),
  ).toBeVisible();
  await expect(versionSelect).toHaveValue(/.+/);
  await expect(versionSelect.locator("option:checked")).toHaveText(
    "v1.1 · Draft",
  );

  const listResponse = await adminApi.get(
    "/api/programme/curricula/programmes/dse",
  );
  expect(listResponse.ok(), await listResponse.text()).toBeTruthy();
  const curricula = (await listResponse.json()) as CurriculumListItem[];
  const saved = curricula.find((item) => item.id === curriculum.curriculum.id);
  if (!saved) throw new Error("Created browser-smoke curriculum is missing");

  const predecessor = saved.versions.find(
    (version) => version.id === predecessorId,
  );
  const draft = saved.versions.find(
    (version) =>
      version.version === "1.1" &&
      version.status === "Draft" &&
      version.basedOnVersionId === predecessorId,
  );
  expect(predecessor?.status).toBe("Approved");
  expect(draft).toBeTruthy();

  await writer.close();

  const readOnly = await newRoleContext(browser, "readOnly");
  const readOnlyPage = await readOnly.newPage();
  await openCurriculum(readOnlyPage);
  await readOnlyPage
    .getByRole("tab", { name: "Versions & Revisions" })
    .click();
  await readOnlyPage
    .getByRole("combobox", { name: "Workflow version" })
    .selectOption(predecessorId);
  await expect(
    readOnlyPage.getByRole("button", { name: "Create revision" }),
  ).toHaveCount(0);

  await readOnly.close();
  await adminApi.dispose();
});
