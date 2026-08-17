export type ResultCorrectionCurrent = {
  score: number;
  maxScore: number;
  feedback: string;
};

export type ResultCorrectionDraft = {
  score: string;
  maxScore: string;
  feedback: string;
  reason: string;
};

export type ResultCorrectionValidation = {
  valid: boolean;
  score: number | null;
  maxScore: number | null;
  feedback: string;
  reason: string;
  changed: boolean;
  errors: {
    score?: string;
    maxScore?: string;
    reason?: string;
    noChange?: string;
  };
};

export function validateResultCorrection(
  current: ResultCorrectionCurrent,
  draft: ResultCorrectionDraft,
): ResultCorrectionValidation {
  const errors: ResultCorrectionValidation["errors"] = {};
  const scoreText = draft.score.trim();
  const maxScoreText = draft.maxScore.trim();
  const score = scoreText === "" ? null : Number(scoreText);
  const maxScore = maxScoreText === "" ? null : Number(maxScoreText);
  const feedback = draft.feedback.trim();
  const reason = draft.reason.trim();

  if (score === null || !Number.isFinite(score) || score < 0) {
    errors.score = "Score must be a number greater than or equal to 0.";
  }
  if (maxScore === null || !Number.isFinite(maxScore) || maxScore <= 0) {
    errors.maxScore = "Maximum score must be greater than 0.";
  }
  if (
    score !== null
    && maxScore !== null
    && Number.isFinite(score)
    && Number.isFinite(maxScore)
    && score > maxScore
  ) {
    errors.score = "Score cannot exceed maximum score.";
  }
  if (!reason) {
    errors.reason = "A correction reason is required.";
  }

  const changed = score !== null
    && maxScore !== null
    && Number.isFinite(score)
    && Number.isFinite(maxScore)
    && (
      score !== current.score
      || maxScore !== current.maxScore
      || feedback !== current.feedback
    );
  if (!changed && !errors.score && !errors.maxScore) {
    errors.noChange = "Change the score, maximum score, or feedback before continuing.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    score,
    maxScore,
    feedback,
    reason,
    changed,
    errors,
  };
}

export function percentage(score: number, maxScore: number): number {
  if (maxScore <= 0) return 0;
  return Math.round((score / maxScore) * 10000) / 100;
}

export function correctionCountLabel(count: number): string {
  return count === 1 ? "Corrected 1×" : `Corrected ${count}×`;
}
