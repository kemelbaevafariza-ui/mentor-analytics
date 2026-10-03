// Чтение Excel-файла: листы ищутся по заголовкам столбцов, объединённые ячейки протягиваются.
import * as XLSX from 'xlsx';
import { parseCell } from './cellParser';
import { cleanSpaces, lsKey, titleCase } from './normalize';
import type { ExamResult, Group, ManualSheet, ParsedWorkbook, RegistryEntry, Trainee } from './types';

type Grid = unknown[][];

export class InputError extends Error {}

const MONTHS_RU = [
  'январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр',
];

function h(v: unknown): string {
  return cleanSpaces(v == null ? '' : String(v)).toLowerCase().replace(/ё/g, 'е');
}

function str(v: unknown): string {
  return v == null ? '' : cleanSpaces(String(v));
}

/** Лист в виде таблицы; значения объединённых ячеек скопированы во все ячейки диапазона. */
function sheetToGrid(ws: XLSX.WorkSheet): Grid {
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
  for (const m of ws['!merges'] ?? []) {
    const value = grid[m.s.r]?.[m.s.c] ?? null;
    for (let r = m.s.r; r <= m.e.r; r++) {
      if (!grid[r]) grid[r] = [];
      for (let c = m.s.c; c <= m.e.c; c++) if (r !== m.s.r || c !== m.s.c) grid[r][c] = value;
    }
  }
  return grid;
}

function findHeaderRow(grid: Grid, test: (cells: string[]) => boolean, maxRows = 15): number {
  for (let r = 0; r < Math.min(grid.length, maxRows); r++) {
    const cells = (grid[r] ?? []).map(h);
    if (test(cells)) return r;
  }
  return -1;
}

function findCol(cells: string[], ...needles: string[]): number {
  return cells.findIndex((c) => needles.some((n) => c.includes(n)));
}

/** Дата из ячейки: число Excel, Date или строка «31.03.2026». Возвращает yyyy-mm-dd. */
export function parseDate(v: unknown): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  }
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  const s = str(v);
  let m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return `${y}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  }
  m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  return '';
}

function parseResult(v: unknown): ExamResult {
  const s = h(v);
  if (!s || s === '-') return 'none';
  if (/не\s*сдал|несдал|не\s*сдан/.test(s)) return 'failed';
  if (/^сдал|^сдан|^сдала/.test(s)) return 'passed';
  return 'other';
}

// --- Лист «Стажеры и их наставники» ---

function readTrainees(grid: Grid, headerRow: number, warnings: string[]) {
  const head = (grid[headerRow] ?? []).map(h);
  const cTrainee = findCol(head, 'фио стажер', 'стажер');
  const cResult = findCol(head, 'результат', 'экзамен');
  const cGroup = findCol(head, 'групп');
  const cDate = findCol(head, 'дата');
  const cLs = findCol(head, 'локальн', 'лс', 'сеть', 'филиал');
  if (cTrainee < 0) throw new InputError('На листе со стажёрами не найден столбец «ФИО стажера».');
  if (cResult < 0) warnings.push('Не найден столбец «Результат экзамена» — «сдали» будет равно нулю.');
  if (cGroup < 0) warnings.push('Не найден столбец «№ Группы» — группы определяются по дате.');
  if (cDate < 0) warnings.push('Не найден столбец «Дата» — месяц группы нужно будет выбрать вручную.');

  const dayEnd = cResult > cTrainee ? cResult : cTrainee + 7;
  const dayCols: number[] = [];
  for (let c = cTrainee + 1; c < dayEnd; c++) dayCols.push(c);
  const dayLabels = dayCols.map((c, i) => str(grid[headerRow]?.[c]) || `День ${i + 1}`);

  const groups = new Map<string, Group>();
  const trainees: Trainee[] = [];
  let curGroup = '';
  let curDate = '';

  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const gName = cGroup >= 0 ? str(row[cGroup]) : '';
    const dateIso = cDate >= 0 ? parseDate(row[cDate]) : '';
    const name = str(row[cTrainee]);
    const dayVals = dayCols.map((c) => row[c]);
    const anyDay = dayVals.some((v) => str(v) !== '');

    // Повтор шапки внутри листа.
    if (h(row[cTrainee]).includes('фио стажер')) continue;

    // Пустые ячейки группы/даты протягиваются сверху.
    if (gName && gName !== curGroup) {
      curGroup = gName;
      curDate = '';
    }
    if (dateIso) curDate = dateIso;

    if (!name && !anyDay) continue;

    const groupName = curGroup || (curDate ? `Группа от ${curDate.split('-').reverse().join('.')}` : 'Без группы');
    const key = `${groupName}|${curDate}`;
    if (!groups.has(key)) {
      groups.set(key, { key, name: groupName, date: curDate, defaultMonth: curDate.slice(0, 7) });
    }
    const ls = cLs >= 0 ? str(row[cLs]) : '';
    const resultRaw = cResult >= 0 ? str(row[cResult]) : '';
    trainees.push({
      id: trainees.length,
      row: r + 1,
      groupKey: key,
      name: name || '(без ФИО)',
      ls,
      lsKey: lsKey(ls),
      days: dayVals.map(parseCell),
      result: parseResult(resultRaw),
      resultRaw,
    });
  }
  return { trainees, groups: [...groups.values()], dayLabels };
}

// --- Лист «Дейст-щие Наставники» ---

function readRegistry(grid: Grid, headerRow: number): RegistryEntry[] {
  const head = (grid[headerRow] ?? []).map(h);
  const cFio = findCol(head, 'фио');
  const cLs = findCol(head, 'лс', 'локальн', 'сеть');
  const cCity = findCol(head, 'населен', 'пункт', 'город');
  let cCat = findCol(head, 'групп', 'категор', 'статус');
  if (cCat < 0) {
    // Ищем столбец, где встречается «Проводник»/«Вектор».
    for (let c = 0; c < head.length && cCat < 0; c++) {
      for (let r = headerRow + 1; r < Math.min(grid.length, headerRow + 30); r++) {
        if (/проводник|вектор/.test(h(grid[r]?.[c]))) { cCat = c; break; }
      }
    }
  }
  const out: RegistryEntry[] = [];
  let curLs = '';
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const fullName = str(row[cFio]);
    if (cLs >= 0 && str(row[cLs])) curLs = str(row[cLs]);
    if (!fullName || !/[А-Яа-яA-Za-z]/.test(fullName)) continue;
    const altSurnames = [...fullName.matchAll(/\(([^)]*)\)/g)].map((m) => titleCase(cleanSpaces(m[1]))).filter(Boolean);
    const words = cleanSpaces(fullName.replace(/\([^)]*\)/g, ' ')).split(' ').map(titleCase);
    if (words.length < 2) continue;
    out.push({
      id: out.length,
      ls: curLs,
      city: cCity >= 0 ? str(row[cCity]) : '',
      fullName,
      surname: words[0],
      altSurnames,
      given: words[1],
      category: cCat >= 0 ? titleCase(str(row[cCat])) : '',
    });
  }
  return out;
}

// --- Лист «Аналитика по Наставникам» (ручной) ---

function monthFromHeader(text: string, year: number): string {
  const t = h(text);
  if (!t || /итог|квартал/.test(t)) return '';
  const word = t.split(/[\s\d.,]+/).find(Boolean) ?? '';
  let idx = -1;
  for (let i = 0; i < MONTHS_RU.length; i++) {
    const stem = MONTHS_RU[i];
    if (stem === 'ма' ? /^ма[йяе]/.test(word) : word.startsWith(stem)) { idx = i; break; }
  }
  if (idx < 0) return '';
  const ym = t.match(/(20\d\d)/);
  const y = ym ? Number(ym[1]) : year;
  return `${y}-${String(idx + 1).padStart(2, '0')}`;
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function readManual(grid: Grid, headerRow: number, year: number): ManualSheet | null {
  const head = (grid[headerRow] ?? []).map(h);
  const cols: { col: number; month: string }[] = [];
  head.forEach((c, i) => {
    if (!c.includes('на входе')) return;
    // Название месяца — в строках выше (ячейка объединена на три столбца).
    for (let r = headerRow - 1; r >= 0; r--) {
      const above = str(grid[r]?.[i]);
      if (above) {
        const month = monthFromHeader(above, year);
        if (month) cols.push({ col: i, month });
        break;
      }
    }
  });
  if (!cols.length) return null;
  const cName = (() => {
    const i = findCol(head, 'фио', 'наставник');
    return i >= 0 && i < cols[0].col ? i : 1;
  })();
  const cLs = (() => {
    const i = findCol(head, 'лс', 'локальн');
    return i >= 0 && i < cols[0].col ? i : 0;
  })();
  const rows: ManualSheet['rows'] = [];
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const name = str(row[cName]);
    if (!name) continue;
    if (/^итог/i.test(name) || /^итог/i.test(str(row[cLs]))) break;
    const values: ManualSheet['rows'][number]['values'] = {};
    for (const { col, month } of cols) {
      values[month] = { in: num(row[col]), passed: num(row[col + 1]) };
    }
    rows.push({ ls: str(row[cLs]), name, row: r + 1, values });
  }
  return { months: [...new Set(cols.map((c) => c.month))], rows };
}

// --- Точка входа ---

export function readWorkbook(data: ArrayBuffer, fileName: string): ParsedWorkbook {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(data, { type: 'array', cellDates: false });
  } catch {
    throw new InputError('Не удалось открыть файл. Нужен файл Excel в формате .xlsx.');
  }
  const warnings: string[] = [];
  const sheets = wb.SheetNames.map((name) => ({ name, grid: sheetToGrid(wb.Sheets[name]) }));

  type Found = { name: string; grid: Grid; header: number };
  let traineeSheet: Found | null = null;
  let registrySheet: Found | null = null;
  let manualSheet: Found | null = null;

  for (const s of sheets) {
    const tr = findHeaderRow(s.grid, (c) => c.some((x) => x.includes('фио стажер')));
    if (tr >= 0 && !traineeSheet) { traineeSheet = { ...s, header: tr }; continue; }
    const an = findHeaderRow(s.grid, (c) => c.some((x) => x.includes('на входе')), 20);
    if (an >= 0 && !manualSheet) { manualSheet = { ...s, header: an }; continue; }
    const rg = findHeaderRow(s.grid, (c) => c.some((x) => x.includes('фио')) && !c.some((x) => x.includes('стажер')));
    if (rg >= 0 && !registrySheet) registrySheet = { ...s, header: rg };
  }

  if (!traineeSheet) {
    throw new InputError(
      `Не найден лист со стажёрами: ни на одном листе нет столбца «ФИО стажера». Листы в файле: ${wb.SheetNames.join(', ')}.`,
    );
  }
  const { trainees, groups, dayLabels } = readTrainees(traineeSheet.grid, traineeSheet.header, warnings);
  if (!trainees.length) throw new InputError(`На листе «${traineeSheet.name}» нет ни одного стажёра.`);

  let registry: RegistryEntry[] = [];
  if (registrySheet) registry = readRegistry(registrySheet.grid, registrySheet.header);
  else warnings.push('Не найден лист реестра наставников — все наставники будут отмечены «вне реестра».');

  const years = groups.map((g) => Number(g.date.slice(0, 4))).filter(Boolean);
  const year = years.length ? years.sort()[Math.floor(years.length / 2)] : new Date().getFullYear();
  const manual = manualSheet ? readManual(manualSheet.grid, manualSheet.header, year) : null;

  const noDate = groups.filter((g) => !g.date);
  if (noDate.length) warnings.push(`У ${noDate.length} групп не распознана дата — выберите месяц на вкладке «Группы».`);

  return { fileName, dayLabels, trainees, groups, registry, manual, warnings };
}
