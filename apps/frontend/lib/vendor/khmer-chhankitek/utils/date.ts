import type { DateInput } from '../types';

const ISO_DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME_WITH_TIME_ZONE_RE =
  /^(\d{4})-(\d{2})-(\d{2})T.+(?:Z|[+-]\d{2}:?\d{2})$/i;
export const MIN_SUPPORTED_GREGORIAN_YEAR = 1900;

function assertSupportedGregorianYear(year: number): void {
  if (year < MIN_SUPPORTED_GREGORIAN_YEAR) {
    throw new Error(`Dates before ${MIN_SUPPORTED_GREGORIAN_YEAR}-01-01 are not supported.`);
  }
}

function createLocalDate(year: number, month: number, day: number): Date {
  const normalized = new Date(year, month - 1, day);

  if (
    normalized.getFullYear() !== year ||
    normalized.getMonth() !== month - 1 ||
    normalized.getDate() !== day
  ) {
    throw new Error('Invalid date provided.');
  }

  assertSupportedGregorianYear(year);
  return normalized;
}

/**
 * Normalizes an input date into a local calendar date at midnight.
 *
 * Date-only ISO strings are treated as calendar dates. ISO date-time strings
 * with an explicit timezone are normalized by UTC date fields so UTC API
 * parameters do not drift when code runs in another local timezone.
 */
export function normalizeDate(date: DateInput): Date {
  if (date instanceof Date) {
    const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (Number.isNaN(normalized.getTime())) {
      throw new Error('Invalid date provided.');
    }
    assertSupportedGregorianYear(normalized.getFullYear());
    return normalized;
  }

  if (typeof date === 'string') {
    const value = date.trim();
    const match = ISO_DATE_ONLY_RE.exec(value);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      return createLocalDate(year, month, day);
    }

    const zonedDateTimeMatch = ISO_DATE_TIME_WITH_TIME_ZONE_RE.exec(value);
    if (zonedDateTimeMatch) {
      createLocalDate(
        Number(zonedDateTimeMatch[1]),
        Number(zonedDateTimeMatch[2]),
        Number(zonedDateTimeMatch[3]),
      );

      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error('Invalid date provided.');
      }

      return createLocalDate(
        parsed.getUTCFullYear(),
        parsed.getUTCMonth() + 1,
        parsed.getUTCDate(),
      );
    }
  }

  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid date provided.');
  }

  assertSupportedGregorianYear(parsed.getFullYear());
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/**
 * Formats a date to YYYY-MM-DD using local calendar fields.
 */
export function formatISODate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}
