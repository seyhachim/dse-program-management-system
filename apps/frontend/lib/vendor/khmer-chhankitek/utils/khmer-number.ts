const KHMER_DIGITS = ['០', '១', '២', '៣', '៤', '៥', '៦', '៧', '៨', '៩'];

/**
 * Converts Western numbers (0-9) to Khmer numbers (០-៩).
 */
export function toKhmerNumber(input: number | string): string {
  return input.toString().replace(/\d/g, (digit) => KHMER_DIGITS[Number.parseInt(digit, 10)]);
}
