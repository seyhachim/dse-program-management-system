from pathlib import Path

service = Path("apps/backend/src/plugins/student-portal/results-lifecycle.ts")
text = service.read_text()
needle = """      const updated = await tx.assessmentResult.update({\n        where: { id: result.id },\n        data: { score: input.score, maxScore: input.maxScore, feedback: input.feedback },\n      });\n"""
replacement = """      await tx.$executeRaw`SELECT set_config('dse.result_correction_id', ${correction.id}, true)`;\n      const updated = await tx.assessmentResult.update({\n        where: { id: result.id },\n        data: { score: input.score, maxScore: input.maxScore, feedback: input.feedback },\n      });\n"""
if text.count(needle) != 1:
    raise SystemExit(f"service marker count={text.count(needle)}")
service.write_text(text.replace(needle, replacement, 1))

migration = Path("apps/backend/prisma/migrations/20260817003500_add_finalized_result_corrections/migration.sql")
text = migration.read_text()
needle = """    IF NEW.\"enrollmentId\" IS DISTINCT FROM OLD.\"enrollmentId\"\n      OR NEW.\"courseSpecId\" IS DISTINCT FROM OLD.\"courseSpecId\"\n      OR NEW.\"assessmentItemId\" IS DISTINCT FROM OLD.\"assessmentItemId\"\n      OR NEW.\"publishedAt\" IS DISTINCT FROM OLD.\"publishedAt\"\n      OR NEW.\"publishedById\" IS DISTINCT FROM OLD.\"publishedById\"\n      OR NEW.\"finalizedAt\" IS DISTINCT FROM OLD.\"finalizedAt\"\n      OR NEW.\"finalizedById\" IS DISTINCT FROM OLD.\"finalizedById\"\n    THEN\n      RAISE EXCEPTION 'Finalized result identity and publication/finalization provenance are immutable';\n    END IF;\n"""
replacement = needle + """\n    IF NEW.\"score\" IS DISTINCT FROM OLD.\"score\"\n      OR NEW.\"maxScore\" IS DISTINCT FROM OLD.\"maxScore\"\n      OR NEW.\"feedback\" IS DISTINCT FROM OLD.\"feedback\"\n    THEN\n      IF NOT EXISTS (\n        SELECT 1\n        FROM \"AssessmentResultCorrection\" c\n        WHERE c.\"id\" = NULLIF(current_setting('dse.result_correction_id', true), '')\n          AND c.\"assessmentResultId\" = OLD.\"id\"\n          AND c.\"beforeScore\" IS NOT DISTINCT FROM OLD.\"score\"\n          AND c.\"beforeMaxScore\" IS NOT DISTINCT FROM OLD.\"maxScore\"\n          AND c.\"beforeFeedback\" IS NOT DISTINCT FROM OLD.\"feedback\"\n          AND c.\"afterScore\" IS NOT DISTINCT FROM NEW.\"score\"\n          AND c.\"afterMaxScore\" IS NOT DISTINCT FROM NEW.\"maxScore\"\n          AND c.\"afterFeedback\" IS NOT DISTINCT FROM NEW.\"feedback\"\n      ) THEN\n        RAISE EXCEPTION 'Finalized result values require a matching append-only correction record';\n      END IF;\n    END IF;\n"""
if text.count(needle) != 1:
    raise SystemExit(f"migration marker count={text.count(needle)}")
migration.write_text(text.replace(needle, replacement, 1))

test = Path("apps/backend/src/plugins/student-portal/results-lifecycle-db.test.ts")
text = test.read_text()
needle = """    await expectDatabaseRejection(() =>\n      prisma.assessmentResult.update({\n        where: { id: finalized.id },\n        data: { score: 101 },\n      }),\n    );\n"""
replacement = """    await expectDatabaseRejection(() =>\n      prisma.assessmentResult.update({\n        where: { id: finalized.id },\n        data: { score: 81 },\n      }),\n    );\n""" + needle
if text.count(needle) != 1:
    raise SystemExit(f"test marker count={text.count(needle)}")
test.write_text(text.replace(needle, replacement, 1))
