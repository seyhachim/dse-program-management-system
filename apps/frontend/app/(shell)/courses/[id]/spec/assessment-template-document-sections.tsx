import type { CourseDocumentModel } from "./course-document-model";

function value(input: string | number | null | undefined): string {
  if (input == null || String(input).trim() === "") return "—";
  return String(input);
}

function join(values: string[]): string {
  return values.length ? values.join(", ") : "—";
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <table className="w-full table-fixed border-collapse text-[9px] leading-[1.2]">
      {children}
    </table>
  );
}

function Th({ children, className = "", colSpan }: { children: React.ReactNode; className?: string; colSpan?: number }) {
  return (
    <th
      colSpan={colSpan}
      className={`border border-black bg-[#E2EEDB] px-1.5 py-1 text-center align-middle font-semibold ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = "", colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return (
    <td
      colSpan={colSpan}
      className={`border border-black px-1.5 py-1 align-top ${className}`}
    >
      {children ?? "—"}
    </td>
  );
}

function AssessmentSltTable({
  title,
  assessments,
  total,
}: {
  title: string;
  assessments: CourseDocumentModel["assessments"];
  total: number;
}) {
  return (
    <div className="mt-4">
      <p className="mb-1 text-[10px] font-bold">{title}</p>
      <Table>
        <colgroup>
          <col className="w-[5%]" />
          <col className="w-[27%]" />
          <col className="w-[8%]" />
          <col className="w-[15%]" />
          <col className="w-[18%]" />
          <col className="w-[18%]" />
          <col className="w-[9%]" />
        </colgroup>
        <thead>
          <tr>
            <Th>No.</Th>
            <Th>{title}</Th>
            <Th>Course Grade Weight (%)</Th>
            <Th>Physical / F2F</Th>
            <Th>Online / Technology-mediated (Synchronous)</Th>
            <Th>Independent Learning (Asynchronous)</Th>
            <Th>Total SLT</Th>
          </tr>
        </thead>
        <tbody>
          {assessments.length ? (
            assessments.map((assessment, index) => (
              <tr key={assessment.id}>
                <Td className="text-center">{index + 1}</Td>
                <Td>{value(assessment.name)}</Td>
                <Td className="text-center">
                  {assessment.weight ? `${assessment.weight}%` : "Not graded"}
                </Td>
                <Td className="text-center">{value(assessment.physicalSltHours)}</Td>
                <Td className="text-center">{value(assessment.onlineSltHours)}</Td>
                <Td className="text-center">{value(assessment.independentSltHours)}</Td>
                <Td className="text-center">{assessment.totalSltHours}</Td>
              </tr>
            ))
          ) : (
            <tr>
              <Td colSpan={7} className="text-center">—</Td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <Td colSpan={6} className="font-semibold">
              Total SLT for {title}
            </Td>
            <Td className="text-center font-semibold">{total}</Td>
          </tr>
        </tfoot>
      </Table>
    </div>
  );
}

export function AssessmentSltSection({ document }: { document: CourseDocumentModel }) {
  const continuous = document.assessments.filter(
    (assessment) => assessment.assessmentCategory === "continuous",
  );
  const final = document.assessments.filter(
    (assessment) => assessment.assessmentCategory === "final",
  );

  return (
    <>
      <AssessmentSltTable
        title="Continuous Assessment"
        assessments={continuous}
        total={document.totals.continuousAssessmentSlt}
      />
      <AssessmentSltTable
        title="Final Assessment"
        assessments={final}
        total={document.totals.finalAssessmentSlt}
      />
      <Table>
        <tbody>
          <tr>
            <Td colSpan={6} className="font-semibold">Total SLT for Assessment</Td>
            <Td className="text-center font-semibold">{document.totals.assessmentSlt}</Td>
          </tr>
          <tr>
            <Td colSpan={6} className="font-bold">Grand Total SLT</Td>
            <Td className="text-center font-bold">{document.totals.grandSlt}</Td>
          </tr>
        </tbody>
      </Table>
    </>
  );
}

export function AssessmentPlanMatrix({ document }: { document: CourseDocumentModel }) {
  return (
    <div>
      <p className="mb-2 text-[8px] leading-[1.3]">
        <strong>Course Grade Weight</strong> is the programme/course grading policy.
        <strong> CLO Evidence</strong> is shown separately through the explicit CLO mapping.
        No AUN-QA evidence weight is inferred from a grading percentage.
      </p>
      <Table>
        <thead>
          <tr>
            <Th>CLO Evidence</Th>
            <Th>Derived PLO</Th>
            <Th>Assessment</Th>
            <Th>G/I</Th>
            <Th>Course Grade Weight %</Th>
            <Th>C/A/P Level</Th>
            {Array.from({ length: 15 }, (_, index) => index + 1).map((topic) => (
              <Th key={topic} className="px-0 text-[7px]">{topic}</Th>
            ))}
            <Th>Course Grade Weight %</Th>
            <Th>Total SLT</Th>
          </tr>
        </thead>
        <tbody>
          {document.assessments.map((assessment) => (
            <tr key={assessment.id}>
              <Td className="text-[8px]">{join(assessment.cloCodes)}</Td>
              <Td className="text-[8px]">{join(assessment.mappedPlos)}</Td>
              <Td className="text-[8px]">{value(assessment.name)}</Td>
              <Td className="text-center">{assessment.mode === "group" ? "G" : "I"}</Td>
              <Td className="text-center">{assessment.weight ? value(assessment.weight) : "Not graded"}</Td>
              <Td className="text-center text-[8px]">{join(assessment.capLevels)}</Td>
              {Array.from({ length: 15 }, (_, index) => index + 1).map((topic) => (
                <Td key={topic} className="px-0 text-center text-[8px]">
                  {assessment.topicNumbers.includes(topic) ? "✓" : ""}
                </Td>
              ))}
              <Td className="text-center">{assessment.weight ? value(assessment.weight) : "—"}</Td>
              <Td className="text-center">{assessment.totalSltHours}</Td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <Td colSpan={21} className="font-semibold">Total Local Course Grade Weight (%)</Td>
            <Td className="text-center font-semibold">{document.totals.assessmentWeight}</Td>
            <Td className="text-center font-semibold">{document.totals.assessmentSlt}</Td>
          </tr>
        </tfoot>
      </Table>
    </div>
  );
}
