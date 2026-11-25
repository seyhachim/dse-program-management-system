import type { AnimalYear, DayOfWeek, KhmerMonth, MoonStatus, Sak } from './types';

export const KHMER_MONTHS: KhmerMonth[] = [
  'ចេត្រ',
  'ពិសាខ',
  'ជេស្ឋ',
  'អាសាឍ',
  'បឋមាសាឍ',
  'ទុតិយាសាឍ',
  'ស្រាពណ៍',
  'ភទ្របទ',
  'អស្សុជ',
  'កត្តិក',
  'មិគសិរ',
  'បុស្ស',
  'មាឃ',
  'ផល្គុន',
];

export const KHMER_MONTHS_EN = [
  'Chet',
  'Vesak',
  'Jeṭṭha',
  'Asadha',
  'Pathamasadha',
  'Tutiyasadha',
  'Srapon',
  'Photrobot',
  'Assuj',
  'Kattik',
  'Migasir',
  'Pous',
  'Magha',
  'Phalguna',
] as const;

export const KHMER_MONTHS_EN_BY_KM: Record<KhmerMonth, (typeof KHMER_MONTHS_EN)[number]> = {
  ចេត្រ: 'Chet',
  ពិសាខ: 'Vesak',
  ជេស្ឋ: 'Jeṭṭha',
  អាសាឍ: 'Asadha',
  បឋមាសាឍ: 'Pathamasadha',
  ទុតិយាសាឍ: 'Tutiyasadha',
  ស្រាពណ៍: 'Srapon',
  ភទ្របទ: 'Photrobot',
  អស្សុជ: 'Assuj',
  កត្តិក: 'Kattik',
  មិគសិរ: 'Migasir',
  បុស្ស: 'Pous',
  មាឃ: 'Magha',
  ផល្គុន: 'Phalguna',
};

export const ANIMAL_YEARS: AnimalYear[] = [
  'ជូត',
  'ឆ្លូវ',
  'ខាល',
  'ថោះ',
  'រោង',
  'ម្សាញ់',
  'មមី',
  'មមែ',
  'វក',
  'រកា',
  'ច',
  'កុរ',
];

export const ANIMAL_YEARS_EN = [
  'Rat',
  'Ox',
  'Tiger',
  'Rabbit',
  'Dragon',
  'Snake',
  'Horse',
  'Goat',
  'Monkey',
  'Rooster',
  'Dog',
  'Pig',
] as const;

export const ANIMAL_YEARS_EN_BY_KM: Record<AnimalYear, (typeof ANIMAL_YEARS_EN)[number]> = {
  ជូត: 'Rat',
  ឆ្លូវ: 'Ox',
  ខាល: 'Tiger',
  ថោះ: 'Rabbit',
  រោង: 'Dragon',
  ម្សាញ់: 'Snake',
  មមី: 'Horse',
  មមែ: 'Goat',
  វក: 'Monkey',
  រកា: 'Rooster',
  ច: 'Dog',
  កុរ: 'Pig',
};

export const SAKS: Sak[] = [
  'ឯកស័ក',
  'ទោស័ក',
  'ត្រីស័ក',
  'ចត្វាស័ក',
  'បញ្ចស័ក',
  'ឆស័ក',
  'សប្តស័ក',
  'អដ្ឋស័ក',
  'នព្វស័ក',
  'សំរឹទ្ធិស័ក',
];

export const SAKS_EN = [
  'Aekasak',
  'Tosak',
  'Treisak',
  'Chatvasak',
  'Panchasak',
  'Chhasak',
  'Saptasak',
  'Atthasak',
  'Navasak',
  'Samriddhisak',
] as const;

export const SAKS_EN_BY_KM: Record<Sak, (typeof SAKS_EN)[number]> = {
  ឯកស័ក: 'Aekasak',
  ទោស័ក: 'Tosak',
  ត្រីស័ក: 'Treisak',
  ចត្វាស័ក: 'Chatvasak',
  បញ្ចស័ក: 'Panchasak',
  ឆស័ក: 'Chhasak',
  សប្តស័ក: 'Saptasak',
  អដ្ឋស័ក: 'Atthasak',
  នព្វស័ក: 'Navasak',
  សំរឹទ្ធិស័ក: 'Samriddhisak',
};

export const MOON_STATUS_KM: Record<'waxing' | 'waning', MoonStatus> = {
  waxing: 'កើត',
  waning: 'រោច',
};

export const MOON_STATUS_EN: Record<'waxing' | 'waning', string> = {
  waxing: 'Waxing',
  waning: 'Waning',
};

export const DAYS_OF_WEEK_KM: DayOfWeek[] = [
  'អាទិត្យ',
  'ចន្ទ',
  'អង្គារ',
  'ពុធ',
  'ព្រហស្បតិ៍',
  'សុក្រ',
  'សៅរ៍',
];

export const DAYS_OF_WEEK_EN = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const DAYS_OF_WEEK_EN_BY_KM: Record<DayOfWeek, (typeof DAYS_OF_WEEK_EN)[number]> = {
  អាទិត្យ: 'Sunday',
  ចន្ទ: 'Monday',
  អង្គារ: 'Tuesday',
  ពុធ: 'Wednesday',
  ព្រហស្បតិ៍: 'Thursday',
  សុក្រ: 'Friday',
  សៅរ៍: 'Saturday',
};

export const GREGORIAN_MONTHS_KM = [
  'មករា',
  'កុម្ភៈ',
  'មីនា',
  'មេសា',
  'ឧសភា',
  'មិថុនា',
  'កក្កដា',
  'សីហា',
  'កញ្ញា',
  'តុលា',
  'វិច្ឆិកា',
  'ធ្នូ',
] as const;
