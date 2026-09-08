-- Issue #918: add the terminal Archived lifecycle value.
-- PostgreSQL requires a newly added enum value to be committed before it is
-- referenced by constraints, so the constraint changes live in the next migration.

ALTER TYPE "ProgrammePublicPublicationStatus" ADD VALUE IF NOT EXISTS 'Archived';
