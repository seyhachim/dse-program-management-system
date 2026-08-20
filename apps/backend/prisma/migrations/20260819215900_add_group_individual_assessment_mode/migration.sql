-- PostgreSQL requires a newly added enum value to be committed before a later
-- migration can safely reference it in constraints/default expressions.
ALTER TYPE "AssessmentItemMode" ADD VALUE IF NOT EXISTS 'GroupIndividual';
