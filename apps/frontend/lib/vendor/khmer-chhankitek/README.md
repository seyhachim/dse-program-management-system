# Khmer lunar (Chhankitek) display calculations

This directory contains selected TypeScript source files vendored from
[chochkimhour/khmer-chhankitek-calendar](https://github.com/chochkimhour/khmer-chhankitek-calendar)
at commit `d83080d708517530e3c1b64e069a733b1950b674` (2026). Copyright (c) 2026 Choch Kimhour; MIT license (see LICENSE).

The converter and digit utility have narrow TypeScript index-safety adjustments to satisfy DSE PMS's `noUncheckedIndexedAccess` option; these changes do not alter the calculation formulas.

Only the calculation/types/constants/date/number utilities are included; the original library's formatter and entrypoint are not needed. This display-only integration intentionally ignores the library's holiday list. Only approved/published DSE PMS calendar records define official holidays, teaching, examination and break periods. The vendored implementation supports Gregorian dates 1900 onward, and unusual historical or future lunisolar boundaries should be checked against published Cambodian calendars before treating them as authoritative.

To update: check the upstream release/license, compare known boundary dates, update the pinned source files and run the focused and full PMS regression suites.
