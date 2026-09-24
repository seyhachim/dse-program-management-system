import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const ARTIFACT_DIR = "artifacts/sar-book-browser";
mkdirSync(ARTIFACT_DIR, { recursive: true });

const cycleId = "cycle-uat-666";
const releaseId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

function narrative(sectionKey: string, number: string, title: string, text: string) {
  return {
    sectionKey,
    title,
    number,
    revisionId: "33333333-3333-4333-8333-333333333333",
    revisionNumber: 1,
    content: text,
    plainText: text,
  };
}

function buildDocument(mode: "working" | "official" | "released", ready: boolean) {
  const released = mode === "released";
  return {
    schemaVersion: "aun-qa-v4-sar-book-v1-release-v1",
    bookTemplateVersion: "aun-qa-v4-sar-book-v1",
    mode,
    generatedAt: "2026-09-24T10:30:00.000Z",
    release: released
      ? {
          id: releaseId,
          version: 1,
          title: "DSE AUN-QA SAR 2026",
          finalizedAt: "2026-09-24T10:31:00.000Z",
          finalizedBy: { id: userId, name: "QA UAT Admin" },
        }
      : null,
    programme: { id: "dse", code: "DSE", name: "Data Science and Engineering" },
    cycle: {
      id: cycleId,
      title: "2026 Self-Assessment",
      reportingStart: "2026-01-01T00:00:00.000Z",
      reportingEnd: "2026-12-31T00:00:00.000Z",
    },
    framework: { id: "aun-v4", code: "AUN-QA", name: "AUN-QA Programme Assessment", version: "4.0" },
    toc: [
      { id: "p1", number: "1", title: "Part 1 — Introduction", level: 1, part: "part1", requirementCode: null },
      { id: "p2", number: "2", title: "Part 2 — AUN-QA Criteria", level: 1, part: "part2", requirementCode: null },
      { id: "r11", number: "2.1.1", title: "Expected Learning Outcomes", level: 3, part: "part2", requirementCode: "1.1" },
      { id: "p3", number: "3", title: "Part 3 — Strengths and Weaknesses Analysis", level: 1, part: "part3", requirementCode: null },
      { id: "p4", number: "4", title: "Part 4 — Appendices", level: 1, part: "part4", requirementCode: null },
    ],
    part1: {
      title: "Part 1 — Introduction",
      sections: [
        narrative("part1.executive-summary", "1.1", "Executive Summary", "Synthetic browser UAT executive summary."),
      ],
    },
    part2: {
      title: "Part 2 — AUN-QA Criteria",
      criteria: [
        {
          criterionId: "criterion-1",
          criterionCode: "1",
          criterionTitle: "Expected Learning Outcomes",
          number: "2.1",
          requirements: [
            {
              criterionCode: "1",
              criterionTitle: "Expected Learning Outcomes",
              requirementId: "requirement-1-1",
              requirementCode: "1.1",
              requirementTitle: "Programme learning outcomes are clearly formulated.",
              number: "2.1.1",
              workflowStatus: ready ? "approved" : "submitted",
              sourceKind: ready ? "approvedSubmission" : "submission",
              submissionId: "submission-1",
              submissionVersion: ready ? 2 : 1,
              content: null,
              plainText: ready ? "Pinned approved requirement narrative." : "Submitted draft narrative.",
              evidenceIds: [],
            },
          ],
        },
      ],
    },
    part3: {
      title: "Part 3 — Strengths and Weaknesses Analysis",
      strengths: narrative("part3.strengths", "3.1", "Strengths", "Strong evidence governance."),
      weaknesses: narrative("part3.weaknesses", "3.2", "Weaknesses", "Continue improving evidence completeness."),
      snapshot: {
        note: "Programme self-assessment only; not an external accreditation verdict.",
        capturedAt: "2026-09-24T10:30:00.000Z",
        criteria: [],
        improvementActions: [],
      },
    },
    part4: {
      title: "Part 4 — Appendices",
      glossary: narrative("part4.glossary", "4.1", "Glossary", "CLO — Course Learning Outcome."),
      evidenceRegister: {
        terminology: {
          evidenceLabel: "Exhibit",
          evidenceRegisterTitle: "Evidence Register",
          supportingDocumentsTitle: "Supporting Documents",
        },
        items: [],
        issues: [],
      },
      supportingEvidenceIds: [],
    },
    readiness: {
      readyForFinalisation: ready,
      blockers: ready ? [] : [{ code: "uat-blocker", message: "One section still requires approval." }],
      parts: [
        { part: "part1", title: "Part 1", ready: 1, total: 1, blockers: 0 },
        { part: "part2", title: "Part 2", ready: ready ? 1 : 0, total: 1, blockers: ready ? 0 : 1 },
        { part: "part3", title: "Part 3", ready: 1, total: 1, blockers: 0 },
        { part: "part4", title: "Part 4", ready: 1, total: 1, blockers: 0 },
      ],
      staticSections: [],
    },
    sourceIndex: {
      narrativePins: [],
      requirementPins: [],
      evidenceIds: [],
      part3CapturedAt: "2026-09-24T10:30:00.000Z",
    },
  };
}

test("authenticated SAR Book preview → blocker → ready → immutable release → exports", async ({ page }) => {
  let officialReady = false;
  const releasedDoc = buildDocument("released", true);
  const releaseView = {
    id: releaseId,
    programmeId: "dse",
    cycleId,
    version: 1,
    title: "DSE AUN-QA SAR 2026",
    templateVersion: "aun-qa-v4-sar-book-v1-release-v1",
    submissionIds: ["submission-1"],
    finalizedAt: "2026-09-24T10:31:00.000Z",
    finalizedBy: { id: userId, name: "QA UAT Admin" },
    snapshot: releasedDoc,
  };

  const unknownApi: string[] = [];
  await page.route("**/mock-api/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const apiPath = url.pathname.replace(/^\/mock-api/, "");

    const json = async (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (req.method() === "OPTIONS") {
      await route.fulfill({ status: 204 });
      return;
    }
    if (apiPath === "/api/auth/me") {
      await json({
        id: userId,
        email: "qa-uat@example.invalid",
        role: "admin",
        roles: ["admin"],
        permissions: ["qa:read", "qa:manage"],
        name: "QA UAT Admin",
        mustChangePassword: false,
      });
      return;
    }
    if (apiPath === "/api/qa/dashboard") {
      await json({ selectedCycle: { id: cycleId } });
      return;
    }
    if (apiPath === `/api/qa/cycles/${cycleId}/sar-book/document`) {
      const mode = url.searchParams.get("mode");
      await json(mode === "official" ? buildDocument("official", officialReady) : buildDocument("working", false));
      return;
    }
    if (apiPath === `/api/qa/cycles/${cycleId}/sar-book/releases`) {
      if (req.method() === "POST") {
        await json(releaseView);
      } else {
        await json([]);
      }
      return;
    }
    if (apiPath === `/api/qa/cycles/${cycleId}/sar-releases`) {
      await json([]);
      return;
    }

    unknownApi.push(`${req.method()} ${apiPath}`);
    await json([]);
  });

  await page.goto("http://127.0.0.1:3000/aun-qa/sar-preview", { waitUntil: "networkidle" });

  await expect(page.getByText("DRAFT PREVIEW").first()).toBeVisible();
  await expect(page.getByText("Draft preview may contain in-progress content.")).toBeVisible();
  await page.screenshot({ path: `${ARTIFACT_DIR}/01-draft-preview.png`, fullPage: true });

  await page.getByRole("button", { name: "Official preview" }).click();
  await expect(page.getByText("OFFICIAL PREVIEW — NOT RELEASED").first()).toBeVisible();
  await expect(page.getByText("1 readiness blocker(s) remain.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Finalize immutable release" })).toBeDisabled();
  await page.screenshot({ path: `${ARTIFACT_DIR}/02-official-blocked.png`, fullPage: true });

  officialReady = true;
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText("Readiness preflight is clean. Finalization will pin exact narrative revisions, approved requirement submissions, Part 3 state and the Evidence Register.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Finalize immutable release" })).toBeEnabled();
  await page.screenshot({ path: `${ARTIFACT_DIR}/03-official-ready.png`, fullPage: true });

  await page.getByRole("button", { name: "Finalize immutable release" }).click();
  await expect(page.getByText("OFFICIAL RELEASE v1").first()).toBeVisible();
  await expect(page.getByText("This is an immutable release snapshot. Later SAR edits do not change this preview or its exports.")).toBeVisible();
  await expect(page.getByText("Release v1", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "View", exact: true }).click();
  await expect(page.getByText("OFFICIAL RELEASE v1").first()).toBeVisible();
  await page.screenshot({ path: `${ARTIFACT_DIR}/04-immutable-release.png`, fullPage: true });

  const docxPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "DOCX" }).first().click();
  const docx = await docxPromise;
  expect(docx.suggestedFilename()).toMatch(/release-v1\.docx$/);
  await docx.saveAs(`${ARTIFACT_DIR}/${docx.suggestedFilename()}`);

  const pdfPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF" }).first().click();
  const pdf = await pdfPromise;
  expect(pdf.suggestedFilename()).toMatch(/release-v1\.pdf$/);
  await pdf.saveAs(`${ARTIFACT_DIR}/${pdf.suggestedFilename()}`);

  expect(unknownApi).toEqual([]);
});
