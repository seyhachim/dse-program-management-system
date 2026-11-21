export type KhmerMonth =
  | 'ចេត្រ'
  | 'ពិសាខ'
  | 'ជេស្ឋ'
  | 'អាសាឍ'
  | 'បឋមាសាឍ'
  | 'ទុតិយាសាឍ'
  | 'ស្រាពណ៍'
  | 'ភទ្របទ'
  | 'អស្សុជ'
  | 'កត្តិក'
  | 'មិគសិរ'
  | 'បុស្ស'
  | 'មាឃ'
  | 'ផល្គុន';

export type AnimalYear =
  | 'ជូត'
  | 'ឆ្លូវ'
  | 'ខាល'
  | 'ថោះ'
  | 'រោង'
  | 'ម្សាញ់'
  | 'មមី'
  | 'មមែ'
  | 'វក'
  | 'រកា'
  | 'ច'
  | 'កុរ';

export type Sak =
  | 'ឯកស័ក'
  | 'ទោស័ក'
  | 'ត្រីស័ក'
  | 'ចត្វាស័ក'
  | 'បញ្ចស័ក'
  | 'ឆស័ក'
  | 'សប្តស័ក'
  | 'អដ្ឋស័ក'
  | 'នព្វស័ក'
  | 'សំរឹទ្ធិស័ក';

export type MoonStatus = 'កើត' | 'រោច';

export type DayOfWeek = 'អាទិត្យ' | 'ចន្ទ' | 'អង្គារ' | 'ពុធ' | 'ព្រហស្បតិ៍' | 'សុក្រ' | 'សៅរ៍';

export type DateInput = Date | string | number;

export interface KhmerHoliday {
  date: string;
  nameKm: string;
  nameEn?: string;
  type: 'public' | 'religious' | 'traditional';
}

export interface KhmerLunarDate {
  gregorianDate: string;
  dayOfWeek: DayOfWeek;
  buddhistEraYear: number;
  buddhistEraYearKhmer: string;
  khmerYear: number;
  khmerYearKhmer: string;
  khmerMonth: KhmerMonth;
  moonStatus: MoonStatus;
  moonDay: number;
  moonDayKhmer: string;
  animalYear: AnimalYear;
  sak: Sak;
  isLeapMonth: boolean;
  isSilDay: boolean;
  holidays: KhmerHoliday[];
  lunarDateText: string;
  gregorianDateText: string;
  gregorianDayText: string;
  gregorianMonthText: string;
  gregorianYearText: string;
  observanceText?: string;
  fullText: string;
}

export interface FormatOptions {
  locale?: 'km' | 'en';
  format?: 'full' | 'long' | 'medium' | 'short';
  useKhmerNumbers?: boolean;
  includeGregorianDate?: boolean;
  includeHoliday?: boolean;
}
