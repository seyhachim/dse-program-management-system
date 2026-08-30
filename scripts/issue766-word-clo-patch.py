from pathlib import Path

path = Path("apps/frontend/app/(shell)/courses/[id]/spec/document-word-renderer.ts")
source = path.read_text()
source = source.replace(
    'children: [text("Description of the course learning outcomes – CLOs At the end of the course, students will be able to:", false, BODY)]',
    'children: [text("Description of the course learning outcomes – CLOs. At the end of the course, students will be able to:", false, BODY)]',
    1,
)
source = source.replace(
    'new Paragraph({ alignment: defaultAlignment(), spacing: { before: 0, after: 0, line: wordTheme.lineTwips }, children: [text("Description of the course learning outcomes – CLOs. At the end of the course, students will be able to:", false, BODY)] })',
    'new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0, line: wordTheme.lineTwips }, children: [text("Description of the course learning outcomes – CLOs. At the end of the course, students will be able to:", false, BODY)] })',
    1,
)
source = source.replace(
    'new Paragraph({ alignment: defaultAlignment(), spacing: { before: 0, after: 0, line: wordTheme.lineTwips }, children: [text("Levels in Learning Domain:\\nKnowledge (Cognitive-C), Attitude\\n(Affective-A), Skills (Psychomotor-P)", false, BODY)] })',
    'new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0, line: wordTheme.lineTwips }, children: [text("Levels in Learning Domain:\\nKnowledge (Cognitive-C), Attitude\\n(Affective-A), Skills (Psychomotor-P)", false, BODY)] })',
    1,
)
if "CLOs. At the end of the course" not in source:
    raise SystemExit("CLO header patch did not apply")
path.write_text(source)
