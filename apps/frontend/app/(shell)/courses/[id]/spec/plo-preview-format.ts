export function contiguousRowSpans<T>(
  items: readonly T[],
  valueOf: (item: T) => string | null | undefined,
): number[] {
  const spans = Array<number>(items.length).fill(0);

  for (let index = 0; index < items.length; ) {
    const rawValue = valueOf(items[index]);
    const value = rawValue?.trim() ?? "";

    if (!value) {
      spans[index] = 1;
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < items.length) {
      const nextValue = valueOf(items[end])?.trim() ?? "";
      if (nextValue !== value) break;
      end += 1;
    }

    spans[index] = end - index;
    index = end;
  }

  return spans;
}

const SMALL_NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
] as const;

export function programmePloCountLabel(count: number): string {
  return SMALL_NUMBER_WORDS[count] ?? String(count);
}

export function splitLeadingWord(value: string): {
  leadingWord: string;
  remainder: string;
} {
  const trimmed = value.trim();
  if (!trimmed) return { leadingWord: "", remainder: "" };

  const firstSpace = trimmed.search(/\s/);
  if (firstSpace === -1) {
    return { leadingWord: trimmed, remainder: "" };
  }

  return {
    leadingWord: trimmed.slice(0, firstSpace),
    remainder: trimmed.slice(firstSpace).trimStart(),
  };
}
