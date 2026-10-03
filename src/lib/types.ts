import type { ParsedCell } from './cellParser';

export type ExamResult = 'passed' | 'failed' | 'none' | 'other';

export interface Trainee {
  id: number;
  /** Номер строки в Excel (с 1). */
  row: number;
  groupKey: string;
  name: string;
  ls: string;
  lsKey: string;
  days: ParsedCell[];
  result: ExamResult;
  resultRaw: string;
}

export interface Group {
  key: string;
  name: string;
  /** Дата старта, ISO yyyy-mm-dd (может быть пустой, если дата не распознана). */
  date: string;
  /** Месяц по дате старта: yyyy-mm. */
  defaultMonth: string;
}

export interface RegistryEntry {
  id: number;
  ls: string;
  city: string;
  fullName: string;
  /** Фамилия, альтернативные фамилии (из скобок), имя. */
  surname: string;
  altSurnames: string[];
  given: string;
  category: string;
}

export interface ManualRow {
  ls: string;
  name: string;
  row: number;
  values: Record<string, { in: number | null; passed: number | null }>;
}

export interface ManualSheet {
  months: string[];
  rows: ManualRow[];
}

export interface ParsedWorkbook {
  fileName: string;
  dayLabels: string[];
  trainees: Trainee[];
  groups: Group[];
  registry: RegistryEntry[];
  manual: ManualSheet | null;
  warnings: string[];
}

export interface Decisions {
  version: 1;
  /** Пары ключей вариантов «один человек». Ключ пары — «a|b» (отсортировано). */
  same: string[];
  /** Пары «разные люди». */
  different: string[];
  /** Варианты, отделённые от автоматической склейки. */
  separated: string[];
  /** Решения по сомнительным фрагментам: ключ текста → 'mentor', 'not' или 'node:<ключ варианта>'. */
  fragments: Record<string, string>;
  /** Варианты ФИО, отмеченные как «не наставник». */
  notMentor: string[];
  /** Ручной месяц учёта группы: ключ группы → yyyy-mm. */
  groupMonths: Record<string, string>;
}

export function emptyDecisions(): Decisions {
  return { version: 1, same: [], different: [], separated: [], fragments: {}, notMentor: [], groupMonths: {} };
}
