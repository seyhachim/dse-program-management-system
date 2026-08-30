"use client";

import type { CSSProperties } from "react";
import type { CourseSpecDocumentTheme } from "@dse-pms/shared-types";
import type { CourseDocumentModel } from "./course-document-model";
import { courseTypeCheckboxText } from "./course-information-checkboxes";
import { presentCourseDocumentResources } from "./course-document-resources";
import { DocumentPages } from "./document-preview-pages";

export function ThemedDocumentPages({
  document,
  zoom,
  theme,
}: {
  document: CourseDocumentModel;
  zoom: number;
  theme: CourseSpecDocumentTheme;
}) {
  const variables = {
    "--cs-font-family": theme.bodyFontFamily,
    "--cs-body-size": `${theme.bodyFontSizePt}pt`,
    "--cs-title-size": `${theme.documentTitleSizePt}pt`,
    "--cs-h1-size": `${theme.heading1SizePt}pt`,
    "--cs-h2-size": `${theme.heading2SizePt}pt`,
    "--cs-h3-size": `${theme.heading3SizePt}pt`,
    "--cs-line-height": String(theme.lineHeight),
    "--cs-paragraph-gap": `${theme.paragraphSpacingPt}pt`,
    "--cs-letter-spacing": `${theme.letterSpacingPx}px`,
    "--cs-align": theme.defaultAlignment,
    "--cs-margin-top": `${theme.marginsMm.top}mm`,
    "--cs-margin-bottom": `${theme.marginsMm.bottom}mm`,
    "--cs-margin-left": `${theme.marginsMm.left}mm`,
    "--cs-margin-right": `${theme.marginsMm.right}mm`,
    "--cs-table-size": `${theme.tableFontSizePt}pt`,
    "--cs-cell-padding": `${theme.tableCellPaddingPt}pt`,
    "--cs-header-size": `${theme.headerFontSizePt}pt`,
    "--cs-footer-size": `${theme.footerFontSizePt}pt`,
    "--cs-frame-gap": "3mm",
  } as CSSProperties;
  const presentationDocument: CourseDocumentModel = {
    ...document,
    courseInformation: {
      ...document.courseInformation,
      courseType: courseTypeCheckboxText(document.courseInformation.courseType),
    },
    resources: presentCourseDocumentResources(document.resources),
  };

  return (
    <div
      className="course-spec-theme-root"
      style={variables}
      data-show-header={String(theme.showHeader)}
      data-show-footer={String(theme.showFooter)}
      data-show-page-numbers={String(theme.showPageNumbers)}
    >
      <DocumentPages document={presentationDocument} zoom={zoom} />
      <style jsx global>{`
        .course-spec-theme-root article[data-doc-page] {
          font-family: var(--cs-font-family) !important;
          letter-spacing: var(--cs-letter-spacing);
          line-height: var(--cs-line-height);
          position: absolute;
        }

        /* Page 1 is an approved fixed-composition programme overview. Its 34/66
           grid, compact typography and internal spacing are template-controlled
           so the full Vision/Mission/Goals/Philosophy/PEO content fits one
           landscape page. The PLO continuation is excluded because it is a
           Part 1 table row, not a normal document page body, and therefore owns
           its compact cell padding. */
        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview):not(#plo-taxonomy) {
          box-sizing: border-box;
          padding-top: calc(var(--cs-margin-top) + var(--cs-frame-gap)) !important;
          padding-bottom: calc(var(--cs-margin-bottom) + var(--cs-frame-gap)) !important;
          padding-left: calc(var(--cs-margin-left) + var(--cs-frame-gap)) !important;
          padding-right: calc(var(--cs-margin-right) + var(--cs-frame-gap)) !important;
        }

        /* Part 1 has fixed approved typography independent of the saved body
           theme: the institution, faculty, department, programme and Course
           Specification header lines are 11pt bold Times New Roman; the Part 1
           title is 14pt bold Times New Roman. */
        .course-spec-theme-root #programme-overview header > p {
          font-family: "Times New Roman", Times, serif !important;
          font-size: 11pt !important;
          font-weight: 700 !important;
          line-height: 1.1 !important;
        }

        .course-spec-theme-root #programme-overview h1 {
          font-family: "Times New Roman", Times, serif !important;
          font-size: 14pt !important;
          font-weight: 700 !important;
          line-height: 1.1 !important;
        }

        /* The fixed-page preview cannot physically keep one CSS grid across a
           page break. Page 2 therefore resumes Part 1 with exactly one full-width
           continuation row. Its outer border aligns to the 54px programme table
           edges, and every PLO element stays inside that row. The 42px top gap
           matches the programme-page vertical inset used by the document style. */
        .course-spec-theme-root article[data-doc-page] > #plo-taxonomy {
          box-sizing: border-box;
          height: auto !important;
          width: auto;
          margin: 42px 54px 0;
          padding: 8px !important;
          border: 1px solid #000;
        }

        .course-spec-theme-root article[data-doc-page] > #plo-taxonomy > h2 {
          margin: 0 !important;
          font-size: 10px !important;
          line-height: 1.2 !important;
          text-transform: uppercase;
        }

        .course-spec-theme-root article[data-doc-page] > #plo-taxonomy > h2 + p {
          margin-top: 4px !important;
          margin-bottom: 6px !important;
          font-size: 10px !important;
          line-height: 1.2 !important;
        }

        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) p,
        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) li {
          font-size: var(--cs-body-size);
          line-height: var(--cs-line-height);
          text-align: var(--cs-align);
        }

        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) p {
          margin-top: 0 !important;
          margin-bottom: 0 !important;
        }

        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) p + p {
          margin-top: var(--cs-paragraph-gap) !important;
        }

        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) ul,
        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) ol {
          margin-top: 2pt !important;
          margin-bottom: 2pt !important;
        }

        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) li + li {
          margin-top: 1pt;
        }

        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) h1,
        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) h2,
        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) h3,
        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) h4,
        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) h5,
        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) h6 {
          line-height: 1.1 !important;
          margin-top: 0 !important;
          margin-bottom: 4pt !important;
        }

        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) h1 {
          font-size: var(--cs-title-size) !important;
        }
        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) h2 {
          font-size: var(--cs-h1-size) !important;
        }
        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) h3 {
          font-size: var(--cs-h2-size) !important;
        }
        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) h4,
        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) h5,
        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) h6 {
          font-size: var(--cs-h3-size) !important;
        }

        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) table {
          width: 100% !important;
          border-collapse: collapse !important;
          font-size: var(--cs-table-size) !important;
          line-height: var(--cs-line-height) !important;
          margin-top: 2pt !important;
          margin-bottom: 2pt !important;
        }

        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) th,
        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) td {
          padding: var(--cs-cell-padding) !important;
        }

        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) th {
          vertical-align: middle;
        }

        .course-spec-theme-root #clos .section14-table .section14-header-row th {
          background: #e2eedb !important;
          color: #000 !important;
          vertical-align: middle !important;
          text-align: center !important;
          font-weight: 400 !important;
        }

        .course-spec-theme-root #clos .section14-table tbody td:nth-child(1),
        .course-spec-theme-root #clos .section14-table tbody td:nth-child(3),
        .course-spec-theme-root #clos .section14-table tbody td:nth-child(4),
        .course-spec-theme-root #clos .section14-table tbody td:nth-child(5),
        .course-spec-theme-root #clos .section14-table tbody td:nth-child(6) {
          text-align: center !important;
          vertical-align: middle !important;
        }


        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) td {
          vertical-align: top;
        }

        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) header {
          margin-bottom: 6pt !important;
        }

        .course-spec-theme-root article[data-doc-page] > div:not(#programme-overview) header p {
          font-size: var(--cs-header-size) !important;
          text-align: center;
        }

        .course-spec-theme-root article[data-doc-page] div[class*="bottom-[24px]"][class*="left-[54px]"] {
          left: calc(var(--cs-margin-left) + var(--cs-frame-gap)) !important;
          right: calc(var(--cs-margin-right) + var(--cs-frame-gap)) !important;
          bottom: calc(var(--cs-margin-bottom) + 2mm) !important;
          font-size: var(--cs-footer-size) !important;
        }

        .course-spec-theme-root[data-show-header="false"] article[data-doc-page] header {
          display: none !important;
        }
        .course-spec-theme-root[data-show-footer="false"] article[data-doc-page] div[class*="bottom-[24px]"][class*="left-[54px]"] {
          display: none !important;
        }
        .course-spec-theme-root[data-show-page-numbers="false"] article[data-doc-page] div[class*="bottom-[24px]"][class*="left-[54px]"] > span:last-child {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
