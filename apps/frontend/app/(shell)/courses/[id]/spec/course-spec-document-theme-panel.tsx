"use client";

import type { CourseSpecDocumentTheme } from "@dse-pms/shared-types";

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-xs font-medium text-muted-foreground">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full rounded-md border bg-background px-2.5 py-2 text-sm font-normal text-foreground"
      />
    </label>
  );
}

export function CourseSpecDocumentThemePanel({
  value,
  programmeDefault,
  onChange,
  onSaveVersion,
  onSaveProgrammeDefault,
  onResetToProgrammeDefault,
  saving,
  versionEditable,
}: {
  value: CourseSpecDocumentTheme;
  programmeDefault: CourseSpecDocumentTheme;
  onChange: (value: CourseSpecDocumentTheme) => void;
  onSaveVersion: () => void;
  onSaveProgrammeDefault: () => void;
  onResetToProgrammeDefault: () => void;
  saving: boolean;
  versionEditable: boolean;
}) {
  return (
    <aside className="rounded-xl border bg-card p-4 shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
      <div>
        <h3 className="font-semibold">Document Style</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Programme-governed presentation only. Course content and academic data are unchanged.
        </p>
      </div>

      <fieldset disabled={saving} className="mt-4 space-y-4 disabled:opacity-60">
        <label className="block text-xs font-medium text-muted-foreground">
          Font family
          <select
            value={value.bodyFontFamily}
            onChange={(event) =>
              onChange({
                ...value,
                bodyFontFamily: event.target.value as CourseSpecDocumentTheme["bodyFontFamily"],
              })
            }
            className="mt-1 w-full rounded-md border bg-background px-2.5 py-2 text-sm font-normal text-foreground"
          >
            <option value="Arial">Arial</option>
            <option value="Calibri">Calibri</option>
            <option value="Times New Roman">Times New Roman</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Body (pt)" value={value.bodyFontSizePt} min={8} max={13} step={0.5} onChange={(bodyFontSizePt) => onChange({ ...value, bodyFontSizePt })} />
          <NumberField label="Letter space (px)" value={value.letterSpacingPx} min={-0.2} max={1} step={0.05} onChange={(letterSpacingPx) => onChange({ ...value, letterSpacingPx })} />
          <NumberField label="Title (pt)" value={value.documentTitleSizePt} min={13} max={22} onChange={(documentTitleSizePt) => onChange({ ...value, documentTitleSizePt })} />
          <NumberField label="Heading 1 (pt)" value={value.heading1SizePt} min={11} max={18} onChange={(heading1SizePt) => onChange({ ...value, heading1SizePt })} />
          <NumberField label="Heading 2 (pt)" value={value.heading2SizePt} min={10} max={16} onChange={(heading2SizePt) => onChange({ ...value, heading2SizePt })} />
          <NumberField label="Heading 3 (pt)" value={value.heading3SizePt} min={9} max={14} onChange={(heading3SizePt) => onChange({ ...value, heading3SizePt })} />
          <NumberField label="Line height" value={value.lineHeight} min={1} max={1.8} step={0.05} onChange={(lineHeight) => onChange({ ...value, lineHeight })} />
          <NumberField label="Paragraph gap (pt)" value={value.paragraphSpacingPt} min={0} max={18} onChange={(paragraphSpacingPt) => onChange({ ...value, paragraphSpacingPt })} />
        </div>

        <label className="block text-xs font-medium text-muted-foreground">
          Paragraph alignment
          <select
            value={value.defaultAlignment}
            onChange={(event) =>
              onChange({
                ...value,
                defaultAlignment: event.target.value as CourseSpecDocumentTheme["defaultAlignment"],
              })
            }
            className="mt-1 w-full rounded-md border bg-background px-2.5 py-2 text-sm font-normal text-foreground"
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
            <option value="justify">Justified</option>
          </select>
        </label>

        <div>
          <p className="text-xs font-medium text-muted-foreground">A4 margins (mm)</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {(["top", "bottom", "left", "right"] as const).map((side) => (
              <NumberField
                key={side}
                label={side[0]!.toUpperCase() + side.slice(1)}
                value={value.marginsMm[side]}
                min={8}
                max={35}
                onChange={(margin) =>
                  onChange({
                    ...value,
                    marginsMm: { ...value.marginsMm, [side]: margin },
                  })
                }
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Table text (pt)" value={value.tableFontSizePt} min={7} max={11} step={0.5} onChange={(tableFontSizePt) => onChange({ ...value, tableFontSizePt })} />
          <NumberField label="Cell padding (pt)" value={value.tableCellPaddingPt} min={1} max={8} step={0.5} onChange={(tableCellPaddingPt) => onChange({ ...value, tableCellPaddingPt })} />
          <NumberField label="Header (pt)" value={value.headerFontSizePt} min={7} max={12} step={0.5} onChange={(headerFontSizePt) => onChange({ ...value, headerFontSizePt })} />
          <NumberField label="Footer (pt)" value={value.footerFontSizePt} min={6} max={10} step={0.5} onChange={(footerFontSizePt) => onChange({ ...value, footerFontSizePt })} />
        </div>

        <div className="space-y-2 text-sm">
          {([
            ["showHeader", "Show institutional header"],
            ["showFooter", "Show document footer"],
            ["showPageNumbers", "Show page numbers"],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={value[key]}
                onChange={(event) => onChange({ ...value, [key]: event.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 space-y-2 border-t pt-4">
        <button
          type="button"
          onClick={onSaveVersion}
          disabled={saving || !versionEditable}
          className="w-full rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving…" : versionEditable ? "Save for this version" : "Approved/locked version"}
        </button>
        <button
          type="button"
          onClick={onSaveProgrammeDefault}
          disabled={saving}
          className="w-full rounded-md border bg-background px-3 py-2 text-xs font-medium text-foreground disabled:opacity-50"
        >
          Save as programme default
        </button>
        <button
          type="button"
          onClick={onResetToProgrammeDefault}
          disabled={saving}
          className="w-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Preview programme default
        </button>
        <p className="text-[11px] leading-4 text-muted-foreground">
          Programme-default changes apply only to future Course Spec versions. Existing version snapshots stay unchanged.
        </p>
      </div>
    </aside>
  );
}
