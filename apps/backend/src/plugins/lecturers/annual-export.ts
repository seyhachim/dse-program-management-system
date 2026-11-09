import type { AnnualSummary } from "@dse-pms/shared-types";
const quote = (v:unknown) => '"' + String(v??"").replace(/"/g,'""') + '"';
const xml=(v:unknown)=>String(v??"").replace(/&/g,"&amp;")
  .replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

export function annualReportRows(report:AnnualSummary):string[][] {
  return [
    ["Academic year","Lecturer ID","Lecturer","Employment type","Qualification",
      "Annual classification","Submission","Confirmed sections","Verified activities",
      "Teaching source IDs","Evidence item IDs","Verification event IDs"],
    ...report.staff.map(person=>[
      report.academicYear.label,person.lecturerId,person.name,
      person.employmentType??"Not recorded",person.qualification??"Not recorded",
      person.classification,person.submissionStatus,
      String(person.teaching.filter(t=>t.confirmed).length),
      String(person.verifiedActivityCount),
      person.teaching.filter(t=>t.confirmed)
        .flatMap(t=>[t.offeringId,t.reviewId,...t.deliveredSessionIds]
          .filter((id):id is string=>Boolean(id))).join("; "),
      person.evidence.filter(e=>e.verificationStatus==="verified").map(e=>e.id).join("; "),
      person.evidence.filter(e=>e.verificationStatus==="verified")
        .map(e=>e.verifiedByEventId).filter(Boolean).join("; "),
    ]),
  ];
}
export function annualReportCsv(report:AnnualSummary):string {
  return "\ufeff"+annualReportRows(report).map(row=>row.map(quote).join(",")).join("\r\n")+"\r\n";
}
// Excel 2003 SpreadsheetML opens natively in Microsoft Excel without an XLSX dependency.
export function annualReportExcelXml(report:AnnualSummary):string {
  const rows=annualReportRows(report)
    .map(row=>"<Row>"+row.map(cell=>
      '<Cell><Data ss:Type="String">'+xml(cell)+"</Data></Cell>").join("")+"</Row>").join("");
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<?mso-application progid="Excel.Sheet"?>' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" '+
    'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    '<Worksheet ss:Name="Annual staff"><Table>'+rows+
    '</Table></Worksheet></Workbook>';
}
