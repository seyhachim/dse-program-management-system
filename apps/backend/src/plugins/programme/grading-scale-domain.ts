import type { DraftGradingScaleGradeInput } from "@dse-pms/shared-types";

const EPSILON = 1e-9;

export class GradingScaleValidationError extends Error {}

function sameScore(left: number, right: number): boolean {
  return Math.abs(left - right) < EPSILON;
}

export function gradingScaleScoreLabel(
  grade: Pick<
    DraftGradingScaleGradeInput,
    "minScore" | "maxScore" | "minInclusive" | "maxInclusive"
  >,
): string {
  if (sameScore(grade.minScore, 0) && !grade.maxInclusive) {
    return `<${grade.maxScore}`;
  }
  if (grade.maxInclusive) {
    return `${grade.minScore}–${grade.maxScore}`;
  }
  return `${grade.minScore}–<${grade.maxScore}`;
}

/**
 * Grade bands are treated as one continuous [0, 100] score domain.
 * Lower bounds are inclusive. Every non-final upper bound is exclusive and
 * must equal the next row's lower bound; the final 100 upper bound is inclusive.
 */
export function validateGradingScaleBands(
  grades: readonly DraftGradingScaleGradeInput[],
): void {
  if (grades.length === 0) {
    throw new GradingScaleValidationError("At least one grade row is required");
  }

  const letterGrades = new Set<string>();
  const sortOrders = new Set<number>();

  for (const grade of grades) {
    const normalizedLetter = grade.letterGrade.trim().toUpperCase();
    if (!normalizedLetter) {
      throw new GradingScaleValidationError("Every grade row needs a letter grade");
    }
    if (letterGrades.has(normalizedLetter)) {
      throw new GradingScaleValidationError(
        `Duplicate letter grade: ${grade.letterGrade}`,
      );
    }
    letterGrades.add(normalizedLetter);

    if (sortOrders.has(grade.sortOrder)) {
      throw new GradingScaleValidationError(
        `Duplicate grade sort order: ${grade.sortOrder}`,
      );
    }
    sortOrders.add(grade.sortOrder);

    if (grade.minScore < 0 || grade.maxScore > 100) {
      throw new GradingScaleValidationError(
        `${grade.letterGrade} score range must stay within 0–100`,
      );
    }
    if (grade.minScore >= grade.maxScore) {
      throw new GradingScaleValidationError(
        `${grade.letterGrade} minimum score must be lower than its maximum score`,
      );
    }
    if (!grade.minInclusive) {
      throw new GradingScaleValidationError(
        `${grade.letterGrade} lower score bound must be inclusive`,
      );
    }
    if (grade.gradePoint < 0) {
      throw new GradingScaleValidationError(
        `${grade.letterGrade} grade point cannot be negative`,
      );
    }
  }

  const ascending = [...grades].sort(
    (left, right) => left.minScore - right.minScore,
  );

  const first = ascending[0]!;
  if (!sameScore(first.minScore, 0) || !first.minInclusive) {
    throw new GradingScaleValidationError(
      "The grading scale must start at score 0 inclusively",
    );
  }

  for (let index = 0; index < ascending.length - 1; index += 1) {
    const current = ascending[index]!;
    const next = ascending[index + 1]!;
    if (current.maxInclusive) {
      throw new GradingScaleValidationError(
        `${current.letterGrade} upper bound must be exclusive because another grade follows it`,
      );
    }
    if (!sameScore(current.maxScore, next.minScore)) {
      throw new GradingScaleValidationError(
        `Grade bands have a gap or overlap between ${current.letterGrade} and ${next.letterGrade}`,
      );
    }
  }

  const last = ascending[ascending.length - 1]!;
  if (!sameScore(last.maxScore, 100) || !last.maxInclusive) {
    throw new GradingScaleValidationError(
      "The grading scale must end at score 100 inclusively",
    );
  }
}
