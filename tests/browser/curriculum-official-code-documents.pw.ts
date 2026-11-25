import { expect, request, test } from "@playwright/test";
import { newRoleContext } from "./auth.ts";
import { readFile } from "node:fs/promises";

test("#1347 exact curriculum document downloads and Draft/role denial", async ({ browser }) => {
  test.setTimeout(150_000);
  const api = await request.newContext({
    baseURL: "http://127.0.0.1:4000",
    extraHTTPHeaders: { Authorization: `Bearer ${process.env.BROWSER_SMOKE_ADMIN_TOKEN}` },
  });
  const response = await api.get("/api/courses");
  expect(response.ok(), await response.text()).toBeTruthy();
  const courses = await response.json() as Array<{ id: string; code: string }>;
  const course = courses.find((row) => row.code === "CS101");
  if (!course) throw new Error("Seeded CS101 required");
  const specsResponse = await api.get(`/api/courses/${course.id}/approved-spec-versions`);
  expect(specsResponse.ok(), await specsResponse.text()).toBeTruthy();
  const specs = await specsResponse.json() as Array<{ id: string }>;
  const spec = specs[0];
  if (!spec) throw new Error("Seeded approved CourseSpec required");
  const code = `OFF-${Date.now()}`;
  const created = await api.post("/api/programme/curricula/programmes/dse", { data: {
    code: `BROWSER-${code}`, name: "Synthetic contextual document curriculum",
    cohortLabel: "Synthetic G6", intakeYear: 2026, academicYear: "2026-2027",
  } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const { selectedVersion } = await created.json() as { selectedVersion: { id: string } };
  const versionId = selectedVersion.id;
  const base = `/api/programme/curricula/versions/${versionId}`;
  const add = await api.post(`${base}/courses`, { data: { courseId: course.id, officialCode: code, yearLevel: 1, semester: "First", sortOrder: 0 } });
  expect(add.ok(), await add.text()).toBeTruthy();
  const bindings = await api.get(`${base}/course-spec-bindings`);
  expect(bindings.ok(), await bindings.text()).toBeTruthy();
  const { bindings: rows } = await bindings.json() as { bindings: Array<{ placementId: string; courseId: string }> };
  const placement = rows.find((row) => row.courseId === course.id);
  if (!placement) throw new Error("Synthetic placement missing");
  const bind = await api.put(`${base}/courses/${placement.placementId}/course-spec-version`, { data: { courseSpecVersionId: spec.id } });
  expect(bind.ok(), await bind.text()).toBeTruthy();
  const path = `/courses/${course.id}/spec/versions/${spec.id}?curriculumVersionId=${versionId}&placementId=${placement.placementId}`;
  const staff = await newRoleContext(browser, "admin");
  try {
    const page = await staff.newPage();
    await page.goto(path);
    await expect(page.getByText("Could not verify the approved curriculum binding.", { exact: false })).toBeVisible();
    for (const action of ["submit", "approve"]) {
      const result = await api.post(`${base}/workflow/${action}`, { data: { comment: "Disposable browser verification only" } });
      expect(result.ok(), await result.text()).toBeTruthy();
    }
    await page.reload();
    await expect(page.getByText("Official curriculum code:", { exact: false })).toContainText(code);
    await expect(page.locator("[data-doc-page]").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Download", exact: true })).toBeEnabled();
    for (const format of ["Word", "PDF"]) {
      await page.getByRole("button", { name: "Download", exact: true }).click();
      const downloadPromise = page.waitForEvent("download", { timeout: 90_000 });
      await page.getByRole("menuitem", { name: `Download ${format}` }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe(`${code}-course-specification.${format === "Word" ? "docx" : "pdf"}`);
      const filePath = await download.path();
      if (!filePath) throw new Error("Download missing");
      const bytes = await readFile(filePath);
      expect(bytes.length).toBeGreaterThan(100);
      expect(bytes.subarray(0, format === "Word" ? 2 : 4).toString()).toBe(format === "Word" ? "PK" : "%PDF");
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("Official curriculum code:", { exact: false })).toContainText(code);
    await page.goto(path.replace(placement.placementId, "wrong-placement"));
    await expect(page.getByText("Could not verify the approved curriculum binding.", { exact: false })).toBeVisible();
  } finally {
    await staff.close();
    await api.dispose();
  }
  const student = await request.newContext({ baseURL: "http://127.0.0.1:4000", extraHTTPHeaders: {
    Authorization: `Bearer ${process.env.BROWSER_SMOKE_STUDENT_TOKEN}`,
  } });
  try {
    const denied = await student.get(`${base}/course-spec-bindings`);
    expect([401, 403]).toContain(denied.status());
  } finally { await student.dispose(); }
});
