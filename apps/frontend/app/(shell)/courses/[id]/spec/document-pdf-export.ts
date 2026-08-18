import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";

import { COURSE_DOCUMENT_STYLE } from "./course-document-model";

const PAGE_WIDTH = COURSE_DOCUMENT_STYLE.page.preview.width;
const PAGE_HEIGHT = COURSE_DOCUMENT_STYLE.page.preview.height;

/**
 * Rasterizes each `[data-doc-page]` article inside `container` (the same
 * DOM the on-screen preview renders) and stitches the images into a PDF at
 * the document's exact page size — so the PDF is pixel-for-pixel what the
 * preview shows, instead of Chrome's print engine re-laying it out.
 */
export async function exportCourseSpecPdf(
  container: HTMLElement,
  courseCode: string,
): Promise<void> {
  const pages = Array.from(
    container.querySelectorAll<HTMLElement>("[data-doc-page]"),
  );
  if (!pages.length) return;

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "px",
    format: [PAGE_WIDTH, PAGE_HEIGHT],
    hotfixes: ["px_scaling"],
    compress: true,
  });

  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i]!;
    const canvas = await html2canvas(page, {
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      scale: 3,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      onclone: (_doc, clonedEl) => {
        // The article's on-screen CSS transform (scale(zoom)) only affects
        // its visual size, not the width/height already fixed in its own
        // inline style — neutralizing it in the clone captures the page at
        // its true 1056x816 size regardless of the live preview's current
        // zoom level, with no need to touch React state to do it.
        clonedEl.style.transform = "none";
        // Drop the on-screen "page card" shadow/ring — a UI affordance for
        // separating pages on a grey canvas, not part of the printed page.
        clonedEl.style.boxShadow = "none";
      },
    });
    // PNG, not JPEG: JPEG's DCT compression puts grey ringing halos on
    // sharp text edges, which is what actually reads as "blurry" when
    // zoomed in — not the pixel resolution.
    const imageData = canvas.toDataURL("image/png");
    if (i > 0) pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT], "landscape");
    pdf.addImage(imageData, "PNG", 0, 0, PAGE_WIDTH, PAGE_HEIGHT, undefined, "FAST");
  }

  pdf.save(`${courseCode || "course"}-course-specification.pdf`);
}
