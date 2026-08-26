ALTER TABLE student_handbook."StudentHandbook"
  ADD COLUMN "theme" JSONB NOT NULL DEFAULT '{
    "bodyFontFamily": "Arial",
    "bodyFontSizePt": 11,
    "heading1SizePt": 18,
    "heading2SizePt": 15,
    "heading3SizePt": 13,
    "lineHeight": 1.15,
    "paragraphSpacingPt": 6,
    "defaultAlignment": "justify",
    "marginsMm": { "top": 25, "bottom": 25, "left": 25, "right": 25 },
    "showHeader": true,
    "showFooter": true,
    "showPageNumbers": true
  }'::jsonb;
