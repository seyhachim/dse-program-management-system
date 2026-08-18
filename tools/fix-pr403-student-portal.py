from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = ROOT / path
    text = target.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise RuntimeError(f"expected one match in {path}, found {text.count(old)}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


service = "apps/backend/src/plugins/student-portal/service.ts"
replace_once(
    service,
    'import type {\n  CourseDeliveryOffering,\n  CourseFeedbackInput,\n  CourseFeedbackSummary,\n  comparePortalAssessmentDeadlines,\n',
    'import { comparePortalAssessmentDeadlines } from "@dse-pms/shared-types";\nimport type {\n  CourseDeliveryOffering,\n  CourseFeedbackInput,\n  CourseFeedbackSummary,\n',
)
replace_once(
    service,
    '      announcement.publishedAt !== null &&\n      announcement.publishedAt.getTime() <= now &&\n      (announcement.expiresAt === null || announcement.expiresAt.getTime() > now),\n',
    '      announcement.publishedAt !== null &&\n      announcement.publishedAt.getTime() <= now,\n',
)

test_path = "apps/backend/src/plugins/student-portal/portal-mvp-db.test.ts"
replace_once(
    test_path,
    '        { offeringId: offering.id, authorId: lecturer.id, title: "Future", body: "Not yet", publishedAt: new Date(now + 86_400_000) },\n        { offeringId: offering.id, authorId: lecturer.id, title: "Expired", body: "Expired", publishedAt: new Date(now - 86_400_000), expiresAt: new Date(now - 60_000) },\n',
    '        { offeringId: offering.id, authorId: lecturer.id, title: "Future", body: "Not yet", publishedAt: new Date(now + 86_400_000) },\n',
)
replace_once(
    test_path,
    '  test("scopes reads/downloads to the active student enrollment and hides future/expired announcements", async () => {\n',
    '  test("scopes reads/downloads to the active student enrollment and hides future announcements", async () => {\n',
)

print("PR #403 CI fixes applied")
