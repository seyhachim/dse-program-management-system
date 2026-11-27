import type { AnnualSummary } from "@dse-pms/shared-types";
const quote = (v:unknown) => {
  const raw=String(v??"");
  const safe=/^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(raw)?"'"+raw:raw;
  return '"'+safe.replace(/"/g,'""')+'"';
};
const xml=(v:unknown)=>String(v??"").replace(/&/g,"&amp;")
  .replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

export function annualReportRows(report:AnnualSummary):string[][] {
  return [
    ["Academic year","Window start","Window end","Lecturer ID","Lecturer","Employment type","Qualification",
      "Annual classification","Submission","Annual submission review ID","Confirmed sections","Verified activities",
      "Teaching source IDs","Evidence item IDs","Verification event IDs","Staff snapshot status","Annual staff review event ID","Evidence attribution"],
    ...report.staff.map(person=>[
      report.academicYear.label,report.reportingWindow?.startDate??"Not configured",
      report.reportingWindow?.endDate??"Not configured",person.lecturerId,person.name,
      person.employmentType??"Not recorded",person.qualification??"Not recorded",
      person.classification,person.submissionStatus,person.submissionReview&&!person.submissionReview.stale?person.submissionReview.id:"",
      String(person.teaching.filter(t=>t.confirmed).length),
      String(person.verifiedActivityCount),
      person.teaching.filter(t=>t.confirmed)
        .flatMap(t=>[t.offeringId,t.reviewId,...t.deliveredSessionIds]
          .filter((id):id is string=>Boolean(id))).join("; "),
      person.evidence.filter(e=>e.verificationStatus==="verified"&&e.attribution==="in_period").map(e=>e.id).join("; "),
      person.evidence.filter(e=>e.verificationStatus==="verified"&&e.attribution==="in_period")
        .map(e=>e.verifiedByEventId).filter(Boolean).join("; "),
      person.staffSnapshotStatus,person.staffReviewEventId??"",
      person.evidence.map(e=>e.id+":"+e.attribution+
        "("+String(e.startDate??"undated")+".."+String(e.endDate??e.startDate??"undated")+")").join("; "),
    ]),
  ];
}
// Report-level figures are derived exclusively from the immutable snapshot.
function reportMetadata(report: AnnualSummary): Array<[string, string]> {
  const s = report.statistics;
  return [
    ["Report version", report.releaseVersion === null ? "Unreleased" : String(report.releaseVersion)],
    ["Programme scope", "DSE"],
    ["Snapshot generated at", report.generatedAt],
    ["Reporting academic year", report.academicYear.label],
    ["Reporting start", report.reportingWindow?.startDate ?? "Not configured"],
    ["Reporting end", report.reportingWindow?.endDate ?? "Not configured"],
    ["Staff counting basis", "Distinct lecturer headcount; not FTE"],
    ["Registry headcount (denominator)", String(s.totalInRegistry)],
    ["Confirmed teaching headcount", String(s.activeTeaching)],
    ["Other verified contributor headcount", String(s.otherContributors)],
    ["Unconfirmed headcount", String(s.unconfirmed)],
    ["Unreported headcount", String(s.unreported)],
    ["Distinct verified publications", String(s.distinctPublications)],
    ["Verified CPD activity records", String(s.verifiedCpdActivities)],
    ["Staff with evidence gaps", String(s.evidenceGaps)],
    ["Missing contributor staff snapshots", String(s.staffSnapshotsMissing)],
    ["Verified evidence outside configured attribution", String(s.unattributedEvidence)],
    ["Missing submissions", "Unreported is missing information, not zero achievements"],
    ["CPD interpretation", "Activity records, not unique participants or participation rate"],
  ];
}

export function annualReportCsv(report: AnnualSummary): string {
  const [header, ...staff] = annualReportRows(report);
  const metadata = reportMetadata(report);
  // A single explicitly typed report row carries aggregate figures, including
  // when there are no staff. Staff rows retain their original leading columns.
  const reportRow = Array<string>(header!.length).fill("");
  reportRow[0] = report.academicYear.label;
  reportRow[1] = report.reportingWindow?.startDate ?? "Not configured";
  reportRow[2] = report.reportingWindow?.endDate ?? "Not configured";
  const rows = [
    [...header!, "Row type", ...metadata.map(([label]) => label)],
    [...reportRow, "report", ...metadata.map(([, value]) => value)],
    ...staff.map(row => [...row, "staff", ...metadata.map(([label, value]) => label === "Report version" ? value : "")]),
  ];
  return "\ufeff" + rows.map(row => row.map(quote).join(",")).join("\r\n") + "\r\n";
}

// XML 1.0 cannot represent certain control characters or isolated surrogates.
// Replace them rather than producing a workbook Excel cannot open.
function xmlCell(value: string): string {
  const valid = value.replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "\uFFFD");
  return '<Cell><Data ss:Type="String">' + xml(valid) + "</Data></Cell>";
}

function worksheet(name: string, rows: string[][]): string {
  return '<Worksheet ss:Name="' + name + '"><Table>' +
    rows.map(row => "<Row>" + row.map(xmlCell).join("") + "</Row>").join("") +
    "</Table></Worksheet>";
}

// Excel 2003 SpreadsheetML opens natively in Microsoft Excel without an XLSX dependency.
export function annualReportExcelXml(report: AnnualSummary): string {
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<?mso-application progid="Excel.Sheet"?>' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ' +
    'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    worksheet("Annual staff", annualReportRows(report)) +
    worksheet("Report summary", [["Metric", "Value"], ...reportMetadata(report)]) +
    "</Workbook>";
}
