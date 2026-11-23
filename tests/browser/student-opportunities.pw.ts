import { expect, request, test, type APIRequestContext } from "@playwright/test";
import { newRoleContext } from "./auth.ts";

const API_URL = "http://127.0.0.1:4000";

async function apiFor(variable: string): Promise<APIRequestContext> {
  const token = process.env[variable]?.trim();
  if (!token) throw new Error(variable + " is required for isolated browser UAT");
  return request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
  });
}

test("#1284 staff publish → mobile student browse → archive; secretary/student cannot publish", async ({ browser }) => {
  const title = "CI Student Opportunity " + Date.now();
  const staff = await newRoleContext(browser, "coordinator");
  const staffPage = await staff.newPage();
  const student = await newRoleContext(browser, "student");
  const studentPage = await student.newPage({ viewport: { width: 390, height: 844 } });
  const staffApi = await apiFor("BROWSER_SMOKE_COORDINATOR_TOKEN");
  const secretaryApi = await apiFor("BROWSER_SMOKE_READONLY_TOKEN");
  const studentApi = await apiFor("BROWSER_SMOKE_STUDENT_TOKEN");
  try {
    await staffPage.goto("/opportunities/manage");
    await expect(staffPage.getByRole("heading", { name: "Create a verified opportunity" })).toBeVisible();
    await staffPage.getByLabel("Opportunity type").selectOption("hackathon");
    await staffPage.getByLabel("Organizer").fill("Official Example Organizer");
    await staffPage.getByLabel("Title").fill(title);
    await staffPage.getByLabel("Student-friendly summary").fill("Build useful AI solutions for real community challenges.");
    await staffPage.getByLabel("Eligibility (do not infer)").fill("DSE undergraduate students are eligible.");
    await staffPage.getByLabel("Official source URL").fill("https://example.org/official-opportunity");
    await staffPage.getByRole("button", { name: "Save draft" }).click();
    await expect(staffPage.getByRole("status").getByText(/Draft saved/)).toBeVisible();

    const rows = await staffApi.get("/api/opportunities/manage");
    expect(rows.ok(), await rows.text()).toBe(true);
    const row = ((await rows.json()) as Array<{ id: string; title: string; status: string }>).find((item) => item.title === title);
    expect(row?.status).toBe("Draft");
    const id = row!.id;

    const draftFeed = await studentApi.get("/api/opportunities");
    expect(draftFeed.ok()).toBe(true);
    expect((await draftFeed.text())).not.toContain(title);
    const unauthorizedPublish = await secretaryApi.post("/api/opportunities/manage/" + id + "/publish", { data: {} });
    expect(unauthorizedPublish.status()).toBe(403);
    const unauthorizedCreate = await studentApi.post("/api/opportunities/manage", {
      data: { programmeId: "dse", title, organizer: "Org", summary: "Develop practical solutions for communities", eligibility: "Students", type: "hackathon", sourceUrl: "https://example.org" },
    });
    expect(unauthorizedCreate.status()).toBe(403);

    await staffPage.getByRole("article").filter({ hasText: title }).getByRole("button", { name: "Publish" }).click();
    await expect(staffPage.getByRole("status").getByText(/published to students/)).toBeVisible();

    await studentPage.goto("/opportunities");
    await expect(studentPage.getByRole("heading", { name: "Discover your next opportunity" })).toBeVisible();
    await studentPage.getByRole("searchbox", { name: "Search opportunities" }).fill(title);
    await expect(studentPage.getByRole("article").filter({ hasText: title })).toBeVisible();
    const official = studentPage.getByRole("article").filter({ hasText: title }).getByRole("link", { name: "Official source" });
    await expect(official).toHaveAttribute("href", "https://example.org/official-opportunity");
    await expect(official).toHaveAttribute("rel", /noopener/);
    await studentPage.getByRole("article").filter({ hasText: title }).getByRole("link", { name: "View details" }).click();
    await expect(studentPage.getByRole("heading", { name: title })).toBeVisible();
    await expect(studentPage.getByRole("heading", { name: "DSE Student Experiences" })).toBeVisible();
    await expect(studentPage.getByText("No past DSE experiences have been approved for public display yet.")).toBeVisible();

    const width = await studentPage.evaluate(() => ({ viewport: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(width.scroll).toBeLessThanOrEqual(width.viewport + 1);
    await studentPage.goto("/opportunities/manage");
    await expect(studentPage.getByRole("heading", { name: "Create a verified opportunity" })).toHaveCount(0);

    // Unknown deadlines may be published, but past-dated drafts cannot.
    const yesterday = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const expiredCreate = await staffApi.post("/api/opportunities/manage", {
      data: {
        programmeId: "dse", type: "hackathon", title: title + " expired",
        organizer: "Official Example Organizer", summary: "A deliberately expired fixture.",
        eligibility: "Undergraduate students", sourceUrl: "https://example.org/expired",
        applicationUrl: null, deadline: yesterday,
      },
    });
    expect(expiredCreate.status(), await expiredCreate.text()).toBe(201);
    const expiredRow = (await expiredCreate.json()) as { id: string };
    const expiredPublish = await staffApi.post("/api/opportunities/manage/" + expiredRow.id + "/publish", { data: {} });
    expect(expiredPublish.status()).toBe(409);

    const archive = await staffApi.post("/api/opportunities/manage/" + id + "/archive", { data: {} });
    expect(archive.ok(), await archive.text()).toBe(true);
    const archivedFeed = await studentApi.get("/api/opportunities");
    expect((await archivedFeed.text())).not.toContain(title);
    const archivedDetail = await studentApi.get("/api/opportunities/" + id);
    expect(archivedDetail.status()).toBe(404);
  } finally {
    await staffApi.dispose();
    await secretaryApi.dispose();
    await studentApi.dispose();
    await student.close();
    await staff.close();
  }
});

test("coordinator poster selection runs real browser-side WebP compression before any upload", async ({ browser }) => {
  const staff = await newRoleContext(browser, "coordinator");
  const page = await staff.newPage();
  try {
    await page.goto("/opportunities/manage");
    await expect(page.getByRole("heading", { name: "Create a verified opportunity" })).toBeVisible();
    // Encode an actual local image in Chromium; do not call Storage or create a production record.
    const pngData = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 2400;
      canvas.height = 1600;
      const ctx = canvas.getContext("2d")!;
      for (let i = 0; i < 20; i += 1) {
        ctx.fillStyle = "hsl(" + (i * 17) + " 60% 60%)";
        ctx.fillRect(i * 120, 0, 120, canvas.height);
      }
      return canvas.toDataURL("image/png").split(",")[1];
    });
    await page.getByLabel("Poster / thumbnail (optional)").setInputFiles({
      name: "hackathon.png",
      mimeType: "image/png",
      buffer: Buffer.from(pngData, "base64"),
    });
    await expect(page.getByRole("status").filter({ hasText: "Optimized:" })).toBeVisible();
    const preview = page.getByRole("img", { name: "Selected poster preview" });
    await expect(preview).toBeVisible();
    await expect.poll(async () => preview.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBe(1200);
    await expect.poll(async () => preview.evaluate((img) => (img as HTMLImageElement).naturalHeight)).toBe(800);
    await expect(page.getByRole("button", { name: "Save draft" })).toBeEnabled();
  } finally {
    await staff.close();
  }
});
