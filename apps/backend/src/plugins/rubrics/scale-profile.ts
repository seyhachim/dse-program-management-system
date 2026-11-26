/** Candidate-only scale snapshots. No runtime default or institutional approval is inferred. */
export type ScaleProfile = Readonly<{
  id: string;
  version: number;
  levels: readonly Readonly<{ label: string; points: number; fraction: number }>[];
}>;

export function snapshotScaleProfile(input: ScaleProfile): ScaleProfile {
  if (!input.id.trim() || !Number.isSafeInteger(input.version) || input.version < 1 || input.levels.length < 2) {
    throw new Error("Invalid scale identity or level count");
  }
  const labels = new Set<string>();
  let previousPoints = Infinity;
  let previousFraction = Infinity;
  const levels = input.levels.map(({ label, points, fraction }) => {
    const key = label.trim().toLowerCase();
    if (!key || labels.has(key) || !Number.isFinite(points) || points < 0 ||
      points >= previousPoints || !Number.isFinite(fraction) || fraction < 0 ||
      fraction > 1 || fraction > previousFraction) {
      throw new Error("Invalid or unordered scale level");
    }
    labels.add(key);
    previousPoints = points;
    previousFraction = fraction;
    return Object.freeze({ label: label.trim(), points, fraction });
  });
  if (levels[0]?.fraction !== 1) throw new Error("Top level must award full marks");
  return Object.freeze({ id: input.id, version: input.version, levels: Object.freeze(levels) });
}

/** Explicit candidate conversion only; missing evidence remains null. */
export function previewCriterionPoints(profile: ScaleProfile, maximum: number, selectedPoints: number | null): number | null {
  const scale = snapshotScaleProfile(profile);
  if (!Number.isFinite(maximum) || maximum <= 0) throw new Error("Invalid criterion maximum");
  if (selectedPoints === null) return null;
  const level = scale.levels.find((entry) => entry.points === selectedPoints);
  if (!level) throw new Error("Unknown scale level");
  return maximum * level.fraction;
}
