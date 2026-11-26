"""Validate the academic review block without printing untrusted PR text."""
import json
import os
import re
import sys

FIELDS = (
    "Issue", "Impact", "Rationale", "AC principles", "OBE", "CDIO", "AUN-QA",
    "RUPP", "Sources and authority", "Scope and historical integrity",
    "Evidence and assessment", "Authorization and privacy", "Verification",
    "Policy blockers and review",
)
HEADING = "## Academic impact review"
LEGACY_MAX = 1380
PLACEHOLDER = re.compile(r"^(?:tbd|todo|pending|n/?a|none|[-–—]+|\[.*\]|<.*>)\.?$", re.I)


def validate(number, body):
    clean = re.sub(r"<!--.*?-->", "", body or "", flags=re.S)
    lines = clean.splitlines()
    headings = [i for i, line in enumerate(lines) if line.strip() == HEADING]
    if not headings:
        return [] if number <= LEGACY_MAX else ["Missing academic impact review section."]
    if len(headings) != 1:
        return ["Academic impact review section must appear exactly once."]
    values = {}
    errors = []
    for line in lines[headings[0] + 1:]:
        if re.match(r"^#{1,2}\s", line.strip()):
            break
        match = re.match(r"^\s*-\s+([^:]+):\s*(.*)$", line)
        if not match or match[1] not in FIELDS:
            continue
        key, value = match[1], match[2].strip()
        if key in values:
            errors.append("Duplicate field: " + key)
        values[key] = value
    for key in FIELDS:
        value = values.get(key, "")
        if not value or (key != "Impact" and PLACEHOLDER.fullmatch(value)):
            errors.append("Complete field: " + key)
    if values.get("Impact") not in ("academic", "none"):
        errors.append("Impact must be academic or none.")
    if not re.search(r"(?<!\w)#[1-9]\d*\b", values.get("Issue", "")):
        errors.append("Issue must cite a numbered GitHub issue.")
    if values.get("Impact") == "academic":
        if not re.search(r"\bAC-(?:00[1-9]|01[0-5])\b", values.get("AC principles", "")):
            errors.append("Academic changes must cite AC-001 through AC-015.")
    return errors


def main():
    with open(os.environ["GITHUB_EVENT_PATH"], encoding="utf-8") as file:
        event = json.load(file)
    pr = event["pull_request"]
    errors = validate(pr["number"], pr.get("body"))
    if errors:
        for error in errors:
            print(error)
        return 1
    print("Academic impact format accepted (or legacy transition applies); human review still required.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
