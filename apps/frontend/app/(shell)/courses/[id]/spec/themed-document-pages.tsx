"use client";

import type { CSSProperties } from "react";
import type { CourseSpecDocumentTheme } from "@dse-pms/shared-types";
import type { CourseDocumentModel } from "./course-document-model";
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
  } as CSSProperties;

  return (
    <div
      className="course-spec-theme-root"
      style={variables}
      data-show-header={String(theme.showHeader)}
      data-show-footer={String(theme.showFooter)}
      data-show-page-numbers={String(theme.showPageNumbers)}
    >
      <DocumentPages document={document} zoom={zoom} />
      <style jsx global>{`
        .course-spec-theme-root article[data-doc-page] {
          font-family: var(--cs-font-family) !important;
          letter-spacing: var(--cs-letter-spacing);
          line-height: var(--cs-line-height);
        }
        .course-spec-theme-root article[data-doc-page] > div,
        .course-spec-theme-root article[data-doc-page] #programme-overview > div {
          box-sizing: border-box;
          padding-top: var(--cs-margin-top) !important;
          padding-bottom: var(--cs-margin-bottom) !important;
          padding-left: var(--cs-margin-left) !important;
          padding-right: var(--cs-margin-right) !important;
        }
        .course-spec-theme-root article[data-doc-page] p,
        .course-spec-theme-root article[data-doc-page] li {
          font-size: var(--cs-body-size);
          line-height: var(--cs-line-height);
          text-align: var(--cs-align);
        }
        .course-spec-theme-root article[data-doc-page] p + p {
          margin-top: var(--cs-paragraph-gap);
        }
        .course-spec-theme-root article[data-doc-page] h1 {
          font-size: var(--cs-title-size) !important;
        }
        .course-spec-theme-root article[data-doc-page] h2 {
          font-size: var(--cs-h1-size) !important;
        }
        .course-spec-theme-root article[data-doc-page] h3 {
          font-size: var(--cs-h2-size) !important;
        }
        .course-spec-theme-root article[data-doc-page] h4,
        .course-spec-theme-root article[data-doc-page] h5,
        .course-spec-theme-root article[data-doc-page] h6 {
          font-size: var(--cs-h3-size) !important;
        }
        .course-spec-theme-root article[data-doc-page] table {
          font-size: var(--cs-table-size) !important;
          line-height: var(--cs-line-height) !important;
        }
        .course-spec-theme-root article[data-doc-page] th,
        .course-spec-theme-root article[data-doc-page] td {
          padding: var(--cs-cell-padding) !important;
        }
        .course-spec-theme-root article[data-doc-page] header p {
          font-size: var(--cs-header-size) !important;
          text-align: center;
        }
        .course-spec-theme-root article[data-doc-page] div[class*="bottom-[24px]"][class*="left-[54px]"] {
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
