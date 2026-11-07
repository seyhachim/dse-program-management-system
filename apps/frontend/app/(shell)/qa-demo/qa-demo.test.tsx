import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getNavRoutes } from "@/lib/nav";
import { QaEvidenceResultPanel } from "@/components/qa/qa-evidence-result";
import { QA_DEMO_NOTICE, qaDemoDocuments, qaDemoResult } from "./demo-data";
import { QaDemoPresentation } from "./qa-demo-client";

test("AUF demo data is clearly fictional and requires human review", () => {
  expect(QA_DEMO_NOTICE.title).toBe("Démonstration");
  expect(QA_DEMO_NOTICE.fictional).toBe("Données fictives");
  expect(QA_DEMO_NOTICE.noAi).toBe("Aucune analyse IA réelle exécutée");
  expect(qaDemoResult.state).toBe("expertReviewRequired");
  expect(qaDemoResult.humanReviewStatus).toBe("notReviewed");
  expect(qaDemoDocuments.some((item) => !item.supplied)).toBe(true);
});

test("result panel is reusable in demonstration and real display modes", () => {
  const demoHtml = renderToStaticMarkup(<QaEvidenceResultPanel result={qaDemoResult} mode="demo" />);
  const realHtml = renderToStaticMarkup(<QaEvidenceResultPanel result={qaDemoResult} mode="real" />);
  expect(demoHtml).toContain("Examen par un expert requis");
  expect(demoHtml).toContain("Résultat illustratif");
  expect(demoHtml).toContain("Aucune analyse IA réelle exécutée");
  expect(realHtml).not.toContain("Résultat illustratif");
  expect(realHtml).not.toContain("Aucune analyse IA réelle exécutée");
});

test("the screenshot composition prominently declares demo-only status", () => {
  const html = renderToStaticMarkup(<QaDemoPresentation />);
  expect(html).toContain("Démonstration");
  expect(html).toContain("Données fictives");
  expect(html).toContain("Aucune analyse IA réelle exécutée");
  expect(html).toContain("Exigence AUN-QA 4.1");
  expect(html).toContain("TSA301");
  expect(html).toContain("Spécification du cours");
  expect(html).toContain("Grille d’évaluation");
  expect(html).toContain("Examen par un expert requis");
});

test("QA demonstration route uses existing QA roles and excludes students", () => {
  const path = "/qa-demo";
  for (const role of ["admin", "program_coordinator", "qa_reviewer"] as const) {
    expect(getNavRoutes([role]).some((route) => route.path === path)).toBe(true);
  }
  for (const role of ["student", "lecturer", "guardian"] as const) {
    expect(getNavRoutes([role]).some((route) => route.path === path)).toBe(false);
  }
});
