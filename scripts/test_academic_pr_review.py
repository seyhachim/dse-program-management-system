import unittest
from academic_pr_review import FIELDS, HEADING, validate


def body(impact="academic", overrides=None):
    values = {key: "Specific justification for this field." for key in FIELDS}
    values.update({"Issue": "#1381", "Impact": impact, "AC principles": "AC-006"})
    values.update(overrides or {})
    return HEADING + "\n" + "\n".join(f"- {key}: {value}" for key, value in values.items())


class AcademicReviewTests(unittest.TestCase):
    def test_valid_academic(self):
        self.assertEqual(validate(1382, body()), [])

    def test_valid_nonacademic(self):
        self.assertEqual(validate(1382, body("none", {"AC principles": "N/A — no academic change"})), [])

    def test_missing_new(self):
        self.assertTrue(validate(1382, None))

    def test_legacy_missing(self):
        self.assertEqual(validate(1380, ""), [])

    def test_legacy_incomplete(self):
        self.assertTrue(validate(1380, HEADING))

    def test_placeholder_and_blank(self):
        self.assertTrue(validate(1382, body(overrides={"RUPP": "TBD", "OBE": ""})))

    def test_wrong_impact_and_issue(self):
        self.assertTrue(validate(1382, body("maybe", {"Issue": "no issue"})))

    def test_invalid_ac(self):
        self.assertTrue(validate(1382, body(overrides={"AC principles": "AC-999"})))

    def test_duplicate_field(self):
        self.assertTrue(validate(1382, body() + "\n- Impact: none"))

    def test_duplicate_heading(self):
        self.assertTrue(validate(1382, body() + "\n" + HEADING))

    def test_comment_does_not_count(self):
        self.assertTrue(validate(1382, "<!-- " + body() + " -->"))

    def test_next_section_not_counted(self):
        self.assertTrue(validate(1382, body(overrides={"RUPP": ""}) + "\n## Other\n- RUPP: verified"))


if __name__ == "__main__":
    unittest.main()
