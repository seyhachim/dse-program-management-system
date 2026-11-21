import {
  ANIMAL_YEARS,
  DAYS_OF_WEEK_KM,
  GREGORIAN_MONTHS_KM,
  MOON_STATUS_KM,
  SAKS,
} from './constants';
import type {
  AnimalYear,
  DateInput,
  DayOfWeek,
  KhmerHoliday,
  KhmerLunarDate,
  KhmerMonth,
  Sak,
} from './types';
import { formatISODate, MIN_SUPPORTED_GREGORIAN_YEAR, normalizeDate } from './utils/date';
import { toKhmerNumber } from './utils/khmer-number';

const KHMER_EPOCH_YEAR = 1900;
const KHMER_EPOCH_MONTH = 2;
const KHMER_EPOCH_DAY = 1;
const NORMAL_KHMER_YEAR_DAYS = 354;
const LEAP_DAY_KHMER_YEAR_DAYS = 355;
const LEAP_MONTH_KHMER_YEAR_DAYS = 384;
const MONTH_LENGTH_SHORT = 29;
const MONTH_LENGTH_LONG = 30;
const SONGKRAN_SEARCH_START_MONTH = 3;
const SONGKRAN_SEARCH_START_DAY = 10;
const SONGKRAN_SEARCH_END_MONTH = 5;
const SONGKRAN_SEARCH_END_DAY = 15;

type KhmerYearType = 'normal' | 'leap-day' | 'leap-month';

interface KhmerCivilDate {
  khmerMonth: KhmerMonth;
  monthDay: number;
  monthLength: number;
  yearType: KhmerYearType;
}

interface DynamicHolidayRule {
  nameKm: string;
  nameEn: string;
  type: KhmerHoliday['type'];
  matches: (lunarDate: Omit<KhmerLunarDate, 'holidays'>) => boolean;
}

interface KhmerNewYearInfo {
  gregorianStartDate: Date;
  totalDays: number;
}

interface KhmerLunarBoundaryDate {
  khmerMonth: KhmerMonth;
  monthDay: number;
}

const NORMAL_MONTHS_BY_NUMBER: KhmerMonth[] = [
  'មិគសិរ',
  'បុស្ស',
  'មាឃ',
  'ផល្គុន',
  'ចេត្រ',
  'ពិសាខ',
  'ជេស្ឋ',
  'អាសាឍ',
  'ស្រាពណ៍',
  'ភទ្របទ',
  'អស្សុជ',
  'កត្តិក',
];

const LEAP_MONTHS_BY_NUMBER: KhmerMonth[] = [
  'មិគសិរ',
  'បុស្ស',
  'មាឃ',
  'ផល្គុន',
  'ចេត្រ',
  'ពិសាខ',
  'ជេស្ឋ',
  'បឋមាសាឍ',
  'ទុតិយាសាឍ',
  'ស្រាពណ៍',
  'ភទ្របទ',
  'អស្សុជ',
  'កត្តិក',
];

const holidayCache = new Map<number, KhmerHoliday[]>();
const khmerNewYearCache = new Map<number, KhmerNewYearInfo>();
const buddhistEraBoundaryCache = new Map<number, Date>();

const DYNAMIC_LUNAR_HOLIDAY_RULES: DynamicHolidayRule[] = [
  {
    nameKm: 'មាឃបូជា',
    nameEn: 'Meak Bochea',
    type: 'religious',
    matches: (lunarDate) =>
      lunarDate.khmerMonth === 'មាឃ' &&
      lunarDate.moonStatus === 'កើត' &&
      lunarDate.moonDay === 15,
  },
  {
    nameKm: 'វិសាខបូជា',
    nameEn: 'Visak Bochea',
    type: 'religious',
    matches: (lunarDate) =>
      lunarDate.khmerMonth === 'ពិសាខ' &&
      lunarDate.moonStatus === 'កើត' &&
      lunarDate.moonDay === 15,
  },
  {
    nameKm: 'វិសាខបូជា',
    nameEn: 'Visak Bochea Day',
    type: 'public',
    matches: (lunarDate) =>
      lunarDate.khmerMonth === 'ពិសាខ' &&
      lunarDate.moonStatus === 'កើត' &&
      lunarDate.moonDay === 15,
  },
  {
    nameKm: 'ព្រះរាជពិធីច្រត់ព្រះនង្គ័ល',
    nameEn: 'Royal Ploughing Ceremony',
    type: 'public',
    matches: (lunarDate) =>
      lunarDate.khmerMonth === 'ពិសាខ' &&
      lunarDate.moonStatus === 'រោច' &&
      lunarDate.moonDay === 4,
  },
  {
    nameKm: 'ភ្ជុំបិណ្ឌ',
    nameEn: 'Pchum Ben',
    type: 'religious',
    matches: (lunarDate) =>
      lunarDate.khmerMonth === 'ភទ្របទ' &&
      lunarDate.moonStatus === 'រោច' &&
      lunarDate.moonDay === 15,
  },
  {
    nameKm: 'ព្រះរាជពិធីបុណ្យភ្ជុំបិណ្ឌ',
    nameEn: 'Pchum Ben Festival',
    type: 'public',
    matches: (lunarDate) =>
      (lunarDate.khmerMonth === 'ភទ្របទ' &&
        lunarDate.moonStatus === 'រោច' &&
        [14, 15].includes(lunarDate.moonDay)) ||
      (lunarDate.khmerMonth === 'អស្សុជ' &&
        lunarDate.moonStatus === 'កើត' &&
        lunarDate.moonDay === 1),
  },
  {
    nameKm: 'ព្រះរាជពិធីបុណ្យអុំទូក',
    nameEn: 'Water Festival',
    type: 'traditional',
    matches: (lunarDate) =>
      lunarDate.khmerMonth === 'កត្តិក' &&
      lunarDate.moonStatus === 'កើត' &&
      [14, 15].includes(lunarDate.moonDay),
  },
  {
    nameKm: 'ព្រះរាជពិធីបុណ្យអុំទូក',
    nameEn: 'Water Festival',
    type: 'public',
    matches: (lunarDate) =>
      lunarDate.khmerMonth === 'កត្តិក' &&
      ((lunarDate.moonStatus === 'កើត' && [14, 15].includes(lunarDate.moonDay)) ||
        (lunarDate.moonStatus === 'រោច' && lunarDate.moonDay === 1)),
  },
];

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function cloneDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const result = cloneDate(date);
  result.setDate(result.getDate() + days);
  return result;
}

function isSameOrAfterDate(date: Date, boundary: Date): boolean {
  return cloneDate(date).getTime() >= cloneDate(boundary).getTime();
}

function findGregorianDateForKhmerCivilDate(
  year: number,
  boundaryDate: KhmerLunarBoundaryDate,
): Date {
  const cursor = new Date(year, SONGKRAN_SEARCH_START_MONTH, SONGKRAN_SEARCH_START_DAY);
  const end = new Date(year, SONGKRAN_SEARCH_END_MONTH, SONGKRAN_SEARCH_END_DAY);

  while (cursor <= end) {
    const normalized = cloneDate(cursor);
    const khmerCivilDate = getKhmerCivilDate(normalized);

    if (
      khmerCivilDate.khmerMonth === boundaryDate.khmerMonth &&
      khmerCivilDate.monthDay === boundaryDate.monthDay
    ) {
      return normalized;
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  throw new Error(`Unable to locate Khmer boundary date for Gregorian year ${year}.`);
}

function reduceRasey(rasey: number, angsa: number, liba: number): [number, number, number] {
  let nextRasey = rasey;
  let nextAngsa = angsa;
  let nextLiba = liba;

  while (nextLiba >= 60) {
    nextLiba -= 60;
    nextAngsa += 1;
  }

  while (nextLiba < 0) {
    nextLiba += 60;
    nextAngsa -= 1;
  }

  while (nextAngsa >= 30) {
    nextAngsa -= 30;
    nextRasey += 1;
  }

  while (nextAngsa < 0) {
    nextAngsa += 30;
    nextRasey -= 1;
  }

  nextRasey = mod(nextRasey, 12);

  return [nextRasey, nextAngsa, nextLiba];
}

function addRasey(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return reduceRasey(a[0] + b[0], a[1] + b[1], a[2] + b[2]);
}

function subtractRasey(
  minuend: [number, number, number],
  subtrahend: [number, number, number],
): [number, number, number] {
  return reduceRasey(
    minuend[0] - subtrahend[0],
    minuend[1] - subtrahend[1],
    minuend[2] - subtrahend[2],
  );
}

function getKromtupol(jolakSakarajYear: number): number {
  const total = jolakSakarajYear * 292207 + 373;
  return 800 - mod(total, 800);
}

function getMatyom(kromtupol: number, sotin: number): [number, number, number] {
  const total = sotin * 800 + kromtupol;
  const rasey = Math.floor(total / 24350);
  const mod1 = total % 24350;
  const angsa = Math.floor(mod1 / 811);
  const mod2 = mod1 % 811;
  const liba = Math.floor(mod2 / 14) - 3;

  return [rasey, angsa, liba];
}

function getPhalLumet(matyom: [number, number, number]): [number, number, number] {
  const raseyDiff = matyom[0] - 2;
  const angsaDiff = matyom[1] - 20;
  const ken: [number, number, number] = [raseyDiff, angsaDiff, matyom[2]];
  let phal: [number, number, number];

  switch (raseyDiff) {
    case 0:
    case 1:
    case 2:
      phal = [raseyDiff, 0, 0];
      break;
    case 3:
    case 4:
    case 5:
      phal = subtractRasey([5, 29, 60], ken);
      break;
    case 6:
    case 7:
    case 8:
      phal = subtractRasey(ken, [6, 0, 0]);
      break;
    default:
      phal = subtractRasey([11, 29, 60], ken);
      break;
  }

  const kon = phal[0] * 2 + 1;
  const total = ((phal[1] - 15) * 60 + 30) * kon;
  const lup = Math.floor(total / 900);
  const withChaya = lup + 129;

  return [0, Math.floor(withChaya / 60), withChaya % 60];
}

function getSomphotSun(
  matyom: [number, number, number],
  phalLumet: [number, number, number],
): [number, number, number] {
  return addRasey(matyom, phalLumet);
}

function hasDuplicateAngsa(values: Array<[number, number, number]>): boolean {
  const counts = new Map<number, number>();

  for (const value of values) {
    counts.set(value[1], (counts.get(value[1]) ?? 0) + 1);
  }

  return Array.from(counts.values()).some((count) => count > 1);
}

function getSongkranVonobotDays(year: number): number {
  const jolakSakarajYear = year - 638;
  const kromtupol = getKromtupol(jolakSakarajYear - 1);
  const somphotValues: Array<[number, number, number]> = [];

  for (let offset = 0; offset < 4; offset += 1) {
    const matyom = getMatyom(kromtupol, 363 + offset);
    const phalLumet = getPhalLumet(matyom);
    somphotValues.push(getSomphotSun(matyom, phalLumet));
  }

  return hasDuplicateAngsa(somphotValues) ? 2 : 1;
}

function getLeungsakLunarDate(year: number): KhmerLunarBoundaryDate {
  const bodithey = getBodithey(year);

  if (bodithey >= 6) {
    return {
      khmerMonth: 'ចេត្រ',
      monthDay: bodithey + (getBoditheyLeapType(year - 1) === 3 ? 1 : 0),
    };
  }

  return {
    khmerMonth: 'ពិសាខ',
    monthDay: bodithey + 1,
  };
}

function getKhmerNewYearInfo(year: number): KhmerNewYearInfo {
  const cached = khmerNewYearCache.get(year);

  if (cached) {
    return {
      gregorianStartDate: cloneDate(cached.gregorianStartDate),
      totalDays: cached.totalDays,
    };
  }

  const vonobotDays = getSongkranVonobotDays(year);
  const leungsakGregorianDate = findGregorianDateForKhmerCivilDate(year, getLeungsakLunarDate(year));
  const info = {
    gregorianStartDate: addDays(leungsakGregorianDate, -(vonobotDays + 1)),
    totalDays: vonobotDays + 2,
  };

  khmerNewYearCache.set(year, info);

  return {
    gregorianStartDate: cloneDate(info.gregorianStartDate),
    totalDays: info.totalDays,
  };
}

function getKhmerReferenceYear(date: Date): number {
  const year = date.getFullYear();
  const { gregorianStartDate } = getKhmerNewYearInfo(year);

  return isSameOrAfterDate(date, gregorianStartDate) ? year : year - 1;
}

function getAnimalYearForReferenceYear(referenceYear: number): AnimalYear {
  return ANIMAL_YEARS[mod(referenceYear - 2020, ANIMAL_YEARS.length)];
}

function getSakForReferenceYear(referenceYear: number): Sak {
  return SAKS[mod(referenceYear - 2019, SAKS.length)];
}

function isGregorianLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function getGregorianYearDays(year: number): number {
  return isGregorianLeapYear(year) ? 366 : 365;
}

function getBuddhistEraYearForCalculation(year: number): number {
  return year + 544;
}

function getAharkun(year: number): number {
  return Math.floor((getBuddhistEraYearForCalculation(year) * 292207 + 499) / 800) + 4;
}

function getAvoman(year: number): number {
  return (11 * getAharkun(year) + 25) % 692;
}

function getBodithey(year: number): number {
  const aharkun = getAharkun(year);
  return (Math.floor((11 * aharkun + 25) / 692) + aharkun + 29) % 30;
}

function isKhmerSolarLeapYear(year: number): boolean {
  const aharkunMod = (getBuddhistEraYearForCalculation(year) * 292207 + 499) % 800;
  return 800 - aharkunMod <= 207;
}

function getBoditheyLeapType(year: number): 0 | 1 | 2 | 3 {
  const avoman = getAvoman(year);
  const bodithey = getBodithey(year);
  let hasLeapMonth = bodithey >= 25 || bodithey <= 5;
  let hasLeapDay = false;

  if (isKhmerSolarLeapYear(year)) {
    hasLeapDay = avoman <= 126;
  } else if (avoman <= 137) {
    hasLeapDay = getAvoman(year + 1) !== 0;
  }

  if (bodithey === 25 && getBodithey(year + 1) === 5) {
    hasLeapMonth = false;
  }

  if (bodithey === 24 && getBodithey(year + 1) === 6) {
    hasLeapMonth = true;
  }

  if (hasLeapMonth && hasLeapDay) {
    return 3;
  }

  if (hasLeapMonth) {
    return 1;
  }

  return hasLeapDay ? 2 : 0;
}

function getKhmerYearType(year: number): KhmerYearType {
  const boditheyLeapType = getBoditheyLeapType(year);

  if (boditheyLeapType === 3 || boditheyLeapType === 1) {
    return 'leap-month';
  }

  if (boditheyLeapType === 2 || getBoditheyLeapType(year - 1) === 3) {
    return 'leap-day';
  }

  return 'normal';
}

function getKhmerYearDays(year: number): number {
  const yearType = getKhmerYearType(year);

  if (yearType === 'leap-month') {
    return LEAP_MONTH_KHMER_YEAR_DAYS;
  }

  return yearType === 'leap-day' ? LEAP_DAY_KHMER_YEAR_DAYS : NORMAL_KHMER_YEAR_DAYS;
}

function getMonthCount(year: number): number {
  return getKhmerYearType(year) === 'leap-month'
    ? LEAP_MONTHS_BY_NUMBER.length
    : NORMAL_MONTHS_BY_NUMBER.length;
}

function normalizeKhmerMonthNumber(month: number, year: number): number {
  const monthCount = getMonthCount(year);
  return mod(month - 1, monthCount) + 1;
}

function getKhmerMonthName(month: number, year: number): KhmerMonth {
  const normalizedMonth = normalizeKhmerMonthNumber(month, year);
  const months =
    getKhmerYearType(year) === 'leap-month' ? LEAP_MONTHS_BY_NUMBER : NORMAL_MONTHS_BY_NUMBER;
  return months[normalizedMonth - 1];
}

function getKhmerMonthLength(month: number, year: number): number {
  const normalizedMonth = normalizeKhmerMonthNumber(month, year);
  const yearType = getKhmerYearType(year);

  if (yearType === 'leap-month') {
    if (normalizedMonth === 8 || normalizedMonth === 9) {
      return MONTH_LENGTH_LONG;
    }

    const normalMonthNumber = normalizedMonth > 9 ? normalizedMonth - 1 : normalizedMonth;
    return normalMonthNumber % 2 === 0 ? MONTH_LENGTH_LONG : MONTH_LENGTH_SHORT;
  }

  if (normalizedMonth === 7) {
    return yearType === 'leap-day' ? MONTH_LENGTH_LONG : MONTH_LENGTH_SHORT;
  }

  return normalizedMonth % 2 === 0 ? MONTH_LENGTH_LONG : MONTH_LENGTH_SHORT;
}

function getDaysSinceStartOfYear(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  return Math.round((date.getTime() - startOfYear.getTime()) / 86_400_000);
}

function advanceKhmerCivilDate(
  month: number,
  day: number,
  year: number,
  days: number,
): { month: number; day: number } {
  let currentMonth = month;
  let currentDay = day;

  for (let i = 0; i < days; i += 1) {
    currentDay += 1;

    if (currentDay > getKhmerMonthLength(currentMonth, year)) {
      currentDay = 1;
      currentMonth = normalizeKhmerMonthNumber(currentMonth + 1, year);
    }
  }

  return { month: currentMonth, day: currentDay };
}

function getKhmerCivilDateAtGregorianYearStart(year: number): { month: number; day: number } {
  let month = KHMER_EPOCH_MONTH;
  let day = KHMER_EPOCH_DAY;

  for (let currentYear = KHMER_EPOCH_YEAR; currentYear < year; currentYear += 1) {
    day += getGregorianYearDays(currentYear) - getKhmerYearDays(currentYear);

    while (day > getKhmerMonthLength(month, currentYear)) {
      day -= getKhmerMonthLength(month, currentYear);
      month = normalizeKhmerMonthNumber(month + 1, currentYear);
    }

    while (day <= 0) {
      month = normalizeKhmerMonthNumber(month - 1, currentYear);
      day += getKhmerMonthLength(month, currentYear);
    }
  }

  return { month, day };
}

function getKhmerCivilDate(date: Date): KhmerCivilDate {
  const year = date.getFullYear();
  const yearStart = getKhmerCivilDateAtGregorianYearStart(year);
  const civilDate = advanceKhmerCivilDate(
    yearStart.month,
    yearStart.day,
    year,
    getDaysSinceStartOfYear(date),
  );
  const monthLength = getKhmerMonthLength(civilDate.month, year);

  return {
    khmerMonth: getKhmerMonthName(civilDate.month, year),
    monthDay: civilDate.day,
    monthLength,
    yearType: getKhmerYearType(year),
  };
}

function getBuddhistEraBoundary(year: number): Date {
  const cached = buddhistEraBoundaryCache.get(year);

  if (cached) {
    return cloneDate(cached);
  }

  const boundary = findGregorianDateForKhmerCivilDate(year, {
    khmerMonth: 'ពិសាខ',
    monthDay: 16,
  });

  buddhistEraBoundaryCache.set(year, boundary);
  return cloneDate(boundary);
}

function getMoonPhase(monthDay: number): {
  moonStatus: KhmerLunarDate['moonStatus'];
  moonDay: number;
} {
  const isWaxing = monthDay <= 15;

  return {
    moonStatus: isWaxing ? MOON_STATUS_KM.waxing : MOON_STATUS_KM.waning,
    moonDay: isWaxing ? monthDay : monthDay - 15,
  };
}

function isLeapAsadhaMonth(khmerMonth: KhmerMonth): boolean {
  return khmerMonth === 'បឋមាសាឍ' || khmerMonth === 'ទុតិយាសាឍ';
}

function isBuddhistHolyDay(monthDay: number, monthLength: number): boolean {
  return monthDay === 8 || monthDay === 15 || monthDay === 23 || monthDay === monthLength;
}

function getObservanceText(
  monthDay: number,
  moonStatus: KhmerLunarDate['moonStatus'],
  isSilDay: boolean,
): string | undefined {
  if (monthDay === 15 && moonStatus === MOON_STATUS_KM.waxing) {
    return 'ថ្ងៃនេះ ជាថ្ងៃសីល និងពេញបូណ៌មី';
  }

  if (isSilDay) {
    return 'ថ្ងៃនេះ ជាថ្ងៃសីល';
  }

  return undefined;
}

function buildKhmerLunarDateText(
  dayOfWeek: DayOfWeek,
  moonDay: number,
  moonStatus: KhmerLunarDate['moonStatus'],
  khmerMonth: KhmerMonth,
  animalYear: AnimalYear,
  sak: Sak,
  buddhistEraYear: number,
): string {
  return `ថ្ងៃ${dayOfWeek} ${toKhmerNumber(moonDay)}${moonStatus} ខែ${khmerMonth} ឆ្នាំ${animalYear} ${sak} ពុទ្ធសករាជ ${toKhmerNumber(buddhistEraYear)}`;
}

function buildKhmerGregorianDateText(date: Date): string {
  const dayText = buildKhmerGregorianDayValue(date);
  const monthText = buildKhmerGregorianMonthValue(date);
  const yearText = buildKhmerGregorianYearValue(date);

  return `ថ្ងៃទី${dayText} ខែ${monthText} ឆ្នាំ${yearText}`;
}

function buildKhmerGregorianDayValue(date: Date): string {
  return toKhmerNumber(date.getDate());
}

function buildKhmerGregorianMonthValue(date: Date): string {
  return GREGORIAN_MONTHS_KM[date.getMonth()];
}

function buildKhmerGregorianYearValue(date: Date): string {
  return toKhmerNumber(date.getFullYear());
}

function buildKhmerFullText(
  lunarDateText: string,
  gregorianDateText: string,
  observanceText?: string,
): string {
  const baseText = `${lunarDateText} ត្រូវនឹង${gregorianDateText}`;

  return observanceText ? `${baseText} ${observanceText}` : baseText;
}

function convertCore(date: Date): Omit<KhmerLunarDate, 'holidays'> {
  const referenceYear = getKhmerReferenceYear(date);
  const khmerCivilDate = getKhmerCivilDate(date);
  const { moonStatus, moonDay } = getMoonPhase(khmerCivilDate.monthDay);
  const buddhistEraYear = isSameOrAfterDate(date, getBuddhistEraBoundary(date.getFullYear()))
    ? date.getFullYear() + 544
    : date.getFullYear() + 543;
  const khmerYear = buddhistEraYear;
  const animalYear = getAnimalYearForReferenceYear(referenceYear);
  const sak = getSakForReferenceYear(referenceYear);
  const dayOfWeek = DAYS_OF_WEEK_KM[date.getDay()];
  const isSilDay = isBuddhistHolyDay(khmerCivilDate.monthDay, khmerCivilDate.monthLength);
  const observanceText = getObservanceText(khmerCivilDate.monthDay, moonStatus, isSilDay);
  const buddhistEraYearKhmer = toKhmerNumber(buddhistEraYear);
  const khmerYearKhmer = toKhmerNumber(khmerYear);
  const moonDayKhmer = toKhmerNumber(moonDay);
  const lunarDateText = buildKhmerLunarDateText(
    dayOfWeek,
    moonDay,
    moonStatus,
    khmerCivilDate.khmerMonth,
    animalYear,
    sak,
    buddhistEraYear,
  );
  const gregorianDateText = buildKhmerGregorianDateText(date);
  const gregorianDayText = buildKhmerGregorianDayValue(date);
  const gregorianMonthText = buildKhmerGregorianMonthValue(date);
  const gregorianYearText = buildKhmerGregorianYearValue(date);

  return {
    gregorianDate: formatISODate(date),
    dayOfWeek,
    buddhistEraYear,
    buddhistEraYearKhmer,
    khmerYear,
    khmerYearKhmer,
    khmerMonth: khmerCivilDate.khmerMonth,
    moonStatus,
    moonDay,
    moonDayKhmer,
    animalYear,
    sak,
    isLeapMonth: isLeapAsadhaMonth(khmerCivilDate.khmerMonth),
    isSilDay,
    lunarDateText,
    gregorianDateText,
    gregorianDayText,
    gregorianMonthText,
    gregorianYearText,
    observanceText,
    fullText: buildKhmerFullText(lunarDateText, gregorianDateText, observanceText),
  };
}

function createHoliday(
  date: string,
  nameKm: string,
  nameEn: string,
  type: KhmerHoliday['type'],
): KhmerHoliday {
  return { date, nameKm, nameEn, type };
}

function cloneHoliday(holiday: KhmerHoliday): KhmerHoliday {
  return { ...holiday };
}

function addHoliday(accumulator: KhmerHoliday[], holiday: KhmerHoliday): void {
  const existingIndex = accumulator.findIndex(
    (item) =>
      item.date === holiday.date &&
      (item.nameEn === holiday.nameEn || item.nameKm === holiday.nameKm),
  );

  if (existingIndex === -1) {
    accumulator.push(holiday);
    return;
  }

  if (accumulator[existingIndex].type !== 'public' && holiday.type === 'public') {
    accumulator[existingIndex] = holiday;
  }
}

function addDynamicLunarHolidaysForDate(
  accumulator: KhmerHoliday[],
  lunarDate: Omit<KhmerLunarDate, 'holidays'>,
  gregorianDate: string,
): void {
  for (const rule of DYNAMIC_LUNAR_HOLIDAY_RULES) {
    if (rule.matches(lunarDate)) {
      addHoliday(
        accumulator,
        createHoliday(gregorianDate, rule.nameKm, rule.nameEn, rule.type),
      );
    }
  }
}

function getFixedPublicHolidays(year: number): KhmerHoliday[] {
  return [
    createHoliday(`${year}-01-01`, 'បុណ្យចូលឆ្នាំសកល', "International New Year's Day", 'public'),
    createHoliday(
      `${year}-01-07`,
      'ទិវាជ័យជម្នះលើរបបប្រល័យពូជសាសន៍',
      'Victory over Genocide Day',
      'public',
    ),
    createHoliday(`${year}-03-08`, 'ទិវានារីអន្តរជាតិ', "International Women's Day", 'public'),
    ...getKhmerNewYearHolidays(year),
    createHoliday(`${year}-05-01`, 'ទិវាពលកម្មអន្តរជាតិ', 'International Labour Day', 'public'),
    createHoliday(
      `${year}-05-14`,
      'ព្រះរាជពិធីចម្រើនព្រះជន្ម ព្រះមហាក្សត្រ',
      "King's Birthday",
      'public',
    ),
    createHoliday(
      `${year}-06-18`,
      'ព្រះរាជពិធីចម្រើនព្រះជន្ម ព្រះមហាក្សត្រី',
      "Queen Mother's Birthday",
      'public',
    ),
    createHoliday(`${year}-09-24`, 'ទិវារដ្ឋធម្មនុញ្ញ', 'Constitution Day', 'public'),
    createHoliday(
      `${year}-10-15`,
      'ទិវាគោរពព្រះវិញ្ញាណក្ខន្ធ ព្រះបរមរតនកោដ្ឋ',
      "Commemoration Day of King's Father",
      'public',
    ),
    createHoliday(`${year}-10-29`, 'ព្រះរាជពិធីគ្រងរាជ្យ', 'Coronation Day', 'public'),
    createHoliday(`${year}-11-09`, 'បុណ្យឯករាជ្យជាតិ', 'Independence Day', 'public'),
    createHoliday(`${year}-12-29`, 'ទិវាសន្តិភាពនៅកម្ពុជា', 'Peace Day in Cambodia', 'public'),
  ];
}

function addDynamicLunarHolidays(year: number, holidays: KhmerHoliday[]): void {
  const cursor = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);

  while (cursor <= end) {
    const normalized = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
    const lunarDate = convertCore(normalized);
    const gregorianDate = formatISODate(normalized);
    addDynamicLunarHolidaysForDate(holidays, lunarDate, gregorianDate);
    cursor.setDate(cursor.getDate() + 1);
  }
}

function cloneHolidays(holidays: KhmerHoliday[]): KhmerHoliday[] {
  return holidays.map(cloneHoliday);
}

function getKhmerNewYearHolidays(year: number): KhmerHoliday[] {
  const { gregorianStartDate, totalDays } = getKhmerNewYearInfo(year);

  return Array.from({ length: totalDays }, (_, index) =>
    createHoliday(
      formatISODate(addDays(gregorianStartDate, index)),
      'បុណ្យចូលឆ្នាំខ្មែរ',
      'Khmer New Year',
      'public',
    ),
  );
}

function buildHolidaysForYear(year: number): KhmerHoliday[] {
  const holidays = getFixedPublicHolidays(year);

  addDynamicLunarHolidays(year, holidays);

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Converts a Gregorian date to a Khmer lunar date.
 *
 * This implementation derives Khmer civil dates from the traditional year-type
 * rules and computes Songkran-based Khmer New Year dates for year-boundary logic.
 * Highly specialized edge cases of the traditional calendar may still benefit
 * from future refinement.
 */
export function toKhmerLunarDate(inputDate: DateInput): KhmerLunarDate {
  const date = normalizeDate(inputDate);
  const lunar = convertCore(date);
  const holidays = getKhmerHolidays(date.getFullYear()).filter(
    (holiday) => holiday.date === lunar.gregorianDate,
  );

  return {
    ...lunar,
    holidays,
  };
}

export function getKhmerMonth(inputDate: DateInput): KhmerMonth {
  return toKhmerLunarDate(inputDate).khmerMonth;
}

export function getKhmerYear(inputDate: DateInput): number {
  return toKhmerLunarDate(inputDate).khmerYear;
}

export function getAnimalYear(inputDate: DateInput): AnimalYear {
  return toKhmerLunarDate(inputDate).animalYear;
}

export function getSak(inputDate: DateInput): Sak {
  return toKhmerLunarDate(inputDate).sak;
}

export function isSilDay(inputDate: DateInput): boolean {
  return toKhmerLunarDate(inputDate).isSilDay;
}

export function getKhmerHolidays(year: number): KhmerHoliday[] {
  if (!Number.isInteger(year)) {
    throw new Error('Invalid year provided.');
  }

  if (year < MIN_SUPPORTED_GREGORIAN_YEAR) {
    throw new Error(`Year must be ${MIN_SUPPORTED_GREGORIAN_YEAR} or later.`);
  }

  const cached = holidayCache.get(year);
  if (cached) {
    return cloneHolidays(cached);
  }

  const computed = buildHolidaysForYear(year);
  holidayCache.set(year, computed);
  return cloneHolidays(computed);
}
