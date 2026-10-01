-- Issue #1224: allow an explicit neutral current-study-year baseline without
-- misclassifying a student as Progressed or Retained.
-- Existing append-only progression rows are not rewritten.

ALTER TYPE "StudentProgressionStatus"
  ADD VALUE IF NOT EXISTS 'Continuing';
