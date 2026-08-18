import type { PortalCourseDetail, PortalCourseDocumentDownload } from "@dse-pms/shared-types";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]!);
}

function fileSafe(value: string): string {
  const safe = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return safe || "course";
}

function section(title: string, content: string): string {
  return `<section><h2>${escapeHtml(title)}</h2>${content}</section>`;
}

export function buildPortalCourseDocument(course: PortalCourseDetail): PortalCourseDocumentDownload {
  const learningOutcomes = course.clos.map((item) =>
    `<article><strong>${escapeHtml(item.code)}</strong> ${escapeHtml(item.description)}<div class="meta">${escapeHtml(item.mappedPlos.join(", "))}</div></article>`,
  ).join("");
  const weeklyPlan = course.weeks.map((item) =>
    `<article><strong>Week ${item.week}: ${escapeHtml(item.topic)}</strong><div class="meta">${escapeHtml(item.cloCodes.join(", "))}</div></article>`,
  ).join("");
  const assessments = course.assessments.map((item) => {
    const criteria = (item.rubricCriteria ?? []).map((criterion) =>
      `<li><strong>${escapeHtml(criterion.name)}</strong>${criterion.cloCodes.length ? ` <span class="meta">(${escapeHtml(criterion.cloCodes.join(", "))})</span>` : ""}</li>`,
    ).join("");
    return `<article><strong>${escapeHtml(item.name)}</strong> — ${item.weight ?? "TBA"}%<p>${escapeHtml(item.description)}</p>${item.instructions ? `<p><strong>Instructions:</strong> ${escapeHtml(item.instructions)}</p>` : ""}${item.rubricName ? `<h3>Rubric: ${escapeHtml(item.rubricName)}</h3>${criteria ? `<ul>${criteria}</ul>` : ""}` : ""}</article>`;
  }).join("");
  const resources = course.resources.map((item) =>
    `<li>${escapeHtml(item.title || item.resourceType)}${item.url ? ` — ${escapeHtml(item.url)}` : ""}</li>`,
  ).join("");

  const content = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(course.code)} Course Specification</title><style>body{font:15px/1.55 Arial,sans-serif;max-width:900px;margin:40px auto;padding:0 24px;color:#18212f}header{border-bottom:3px solid #185a9d;padding-bottom:16px}h1{margin:0}h2{margin-top:32px;color:#185a9d}article{border:1px solid #d9e0e7;border-radius:10px;padding:14px;margin:10px 0}.meta{color:#667085}ul{padding-left:20px}@media print{body{margin:0;max-width:none}}</style></head><body><header><p class="meta">Approved course specification · ${escapeHtml(course.term)} · Section ${escapeHtml(course.sectionCode)}</p><h1>${escapeHtml(course.code)} — ${escapeHtml(course.title)}</h1><p>${escapeHtml(course.description ?? "")}</p></header>${section("Course learning outcomes", learningOutcomes)}${section("Weekly plan", weeklyPlan)}${section("Assessment plan", assessments)}${section("Learning resources", `<ul>${resources}</ul>`)}<footer><p class="meta">Downloaded from DSE Program Management System</p></footer></body></html>`;

  return {
    fileName: `${fileSafe(course.code)}-approved-course-specification.html`,
    contentType: "text/html; charset=utf-8",
    content,
  };
}
