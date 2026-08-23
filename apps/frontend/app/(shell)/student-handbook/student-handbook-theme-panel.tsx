"use client";

import type { StudentHandbookDocumentTheme } from "@dse-pms/shared-types";

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

export function StudentHandbookThemePanel({
  value,
  onChange,
  onSave,
  saving,
  disabled,
}: {
  value: StudentHandbookDocumentTheme;
  onChange: (value: StudentHandbookDocumentTheme) => void;
  onSave: () => void;
  saving: boolean;
  disabled: boolean;
}) {
  return (
    <aside className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Document Style</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Global handbook typography and A4 page settings. Narrative authors still choose semantic headings/emphasis in the editor.
          </p>
        </div>
        <button
          type="button"
          disabled={disabled || saving}
          onClick={onSave}
          className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Style"}
        </button>
      </div>

      <fieldset disabled={disabled || saving} className="mt-4 space-y-4 disabled:opacity-60">
        <label className="block text-xs font-medium text-muted-foreground">
          Body font
          <select
            value={value.bodyFontFamily}
            onChange={(event) => onChange({ ...value, bodyFontFamily: event.target.value as StudentHandbookDocumentTheme["bodyFontFamily"] })}
            className="mt-1 w-full rounded-md border bg-background px-2.5 py-2 text-sm font-normal text-foreground"
          >
            <option value="Arial">Arial</option>
            <option value="Calibri">Calibri</option>
            <option value="Times New Roman">Times New Roman</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Body size (pt)" value={value.bodyFontSizePt} min={9} max={14} onChange={(bodyFontSizePt) => onChange({ ...value, bodyFontSizePt })} />
          <NumberField label="Line height" value={value.lineHeight} min={1} max={2} step={0.05} onChange={(lineHeight) => onChange({ ...value, lineHeight })} />
          <NumberField label="Heading 1 (pt)" value={value.heading1SizePt} min={14} max={26} onChange={(heading1SizePt) => onChange({ ...value, heading1SizePt })} />
          <NumberField label="Heading 2 (pt)" value={value.heading2SizePt} min={12} max={22} onChange={(heading2SizePt) => onChange({ ...value, heading2SizePt })} />
          <NumberField label="Heading 3 (pt)" value={value.heading3SizePt} min={11} max={18} onChange={(heading3SizePt) => onChange({ ...value, heading3SizePt })} />
          <NumberField label="Paragraph spacing (pt)" value={value.paragraphSpacingPt} min={0} max={24} onChange={(paragraphSpacingPt) => onChange({ ...value, paragraphSpacingPt })} />
        </div>

        <label className="block text-xs font-medium text-muted-foreground">
          Default paragraph alignment
          <select
            value={value.defaultAlignment}
            onChange={(event) => onChange({ ...value, defaultAlignment: event.target.value as StudentHandbookDocumentTheme["defaultAlignment"] })}
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
                min={10}
                max={40}
                onChange={(margin) => onChange({ ...value, marginsMm: { ...value.marginsMm, [side]: margin } })}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2 text-sm">
          {([
            ["showHeader", "Show handbook header"],
            ["showFooter", "Show handbook footer"],
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
    </aside>
  );
}
