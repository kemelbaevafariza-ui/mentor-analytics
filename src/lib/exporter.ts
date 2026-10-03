// Выгрузка в Excel в формате листа «Аналитика по Наставникам».
import ExcelJS from 'exceljs';
import { buildColumns, monthLabel, quarterLabel, type Analysis } from './analysis';
import type { ParsedWorkbook } from './types';

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
const QUARTER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
const TOTAL_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
const THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' },
};

const RESULT_LABEL = { passed: 'Сдал', failed: 'Не сдал', none: '', other: '' } as const;

function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export async function exportWorkbook(wb: ParsedWorkbook, an: Analysis): Promise<Blob> {
  const book = new ExcelJS.Workbook();
  book.creator = 'Аналитика по наставникам';
  book.created = new Date();

  // --- Лист аналитики ---
  const ws = book.addWorksheet('Аналитика по Наставникам', { views: [{ state: 'frozen', xSplit: 2, ySplit: 2 }] });
  const columns = buildColumns(an.months);
  ws.getColumn(1).width = 18;
  ws.getColumn(2).width = 32;

  ws.getCell(1, 1).value = 'ЛС';
  ws.getCell(1, 2).value = 'ФИО наставника';
  ws.mergeCells(1, 1, 2, 1);
  ws.mergeCells(1, 2, 2, 2);

  /** Для каждого месяца — номер первого столбца. */
  const monthCol = new Map<string, number>();
  const blocks: { start: number; months: string[] }[] = [];
  let c = 3;
  for (const col of columns) {
    const title = col.kind === 'month' ? monthLabel(col.month) : `Итог за ${quarterLabel(col.quarter)}`;
    ws.getCell(1, c).value = title;
    ws.mergeCells(1, c, 1, c + 2);
    ws.getCell(2, c).value = 'Кол-во стажеров на входе';
    ws.getCell(2, c + 1).value = 'Кол-во стажеров сдавших экзамен';
    ws.getCell(2, c + 2).value = '% успешности';
    for (let i = 0; i < 3; i++) {
      ws.getColumn(c + i).width = i === 2 ? 11 : 13;
      ws.getCell(1, c + i).fill = col.kind === 'quarter' ? QUARTER_FILL : HEADER_FILL;
      ws.getCell(2, c + i).fill = col.kind === 'quarter' ? QUARTER_FILL : HEADER_FILL;
    }
    if (col.kind === 'month') monthCol.set(col.month, c);
    blocks.push({ start: c, months: col.kind === 'month' ? [col.month] : col.months });
    c += 3;
  }
  const tagCol = c;
  ws.getCell(1, tagCol).value = 'Отметка';
  ws.mergeCells(1, tagCol, 2, tagCol);
  ws.getColumn(tagCol).width = 14;
  const lastCol = tagCol;

  for (let r = 1; r <= 2; r++) {
    for (let i = 1; i <= lastCol; i++) {
      const cell = ws.getCell(r, i);
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = THIN;
      if (i <= 2 || i === tagCol) cell.fill = HEADER_FILL;
    }
  }
  ws.getRow(2).height = 45;

  const writeTriple = (row: number, col: number, inF: string | number, passF: string | number, inV: number, passV: number) => {
    const L = colLetter(col);
    const P = colLetter(col + 1);
    ws.getCell(row, col).value = typeof inF === 'string' ? { formula: inF, result: inV } : inF;
    ws.getCell(row, col + 1).value = typeof passF === 'string' ? { formula: passF, result: passV } : passF;
    ws.getCell(row, col + 2).value = { formula: `IF(${L}${row}=0,"",${P}${row}/${L}${row})`, result: inV ? passV / inV : '' };
    ws.getCell(row, col + 2).numFmt = '0%';
  };

  let row = 3;
  let blockStart = 3;
  let blockLs: string | null = null;
  const closeBlock = (end: number) => {
    if (blockLs !== null && end > blockStart) ws.mergeCells(blockStart, 1, end, 1);
  };

  for (const m of an.mentors) {
    if (m.ls !== blockLs) {
      closeBlock(row - 1);
      blockLs = m.ls;
      blockStart = row;
      ws.getCell(row, 1).value = m.ls;
    }
    ws.getCell(row, 2).value = m.name;
    blocks.forEach((blk, i) => {
      const inV = blk.months.reduce((s, mm) => s + (m.byMonth[mm]?.in ?? 0), 0);
      const pV = blk.months.reduce((s, mm) => s + (m.byMonth[mm]?.passed ?? 0), 0);
      if (columns[i].kind === 'month') {
        writeTriple(row, blk.start, inV, pV, inV, pV);
      } else {
        // Итог за квартал — формулой из месячных столбцов.
        const inF = blk.months.map((mm) => `${colLetter(monthCol.get(mm)!)}${row}`).join('+');
        const pF = blk.months.map((mm) => `${colLetter(monthCol.get(mm)! + 1)}${row}`).join('+');
        writeTriple(row, blk.start, inF, pF, inV, pV);
      }
    });
    ws.getCell(row, tagCol).value = m.tag;
    row++;
  }
  closeBlock(row - 1);
  const lastData = row - 1;

  // Итого
  ws.getCell(row, 1).value = 'Итого';
  ws.mergeCells(row, 1, row, 2);
  for (const blk of blocks) {
    const L = colLetter(blk.start);
    const P = colLetter(blk.start + 1);
    const inV = blk.months.reduce((s, mm) => s + (an.totals[mm]?.in ?? 0), 0);
    const pV = blk.months.reduce((s, mm) => s + (an.totals[mm]?.passed ?? 0), 0);
    writeTriple(row, blk.start, `SUM(${L}3:${L}${lastData})`, `SUM(${P}3:${P}${lastData})`, inV, pV);
  }
  for (let i = 1; i <= lastCol; i++) {
    const cell = ws.getCell(row, i);
    cell.font = { bold: true };
    cell.fill = TOTAL_FILL;
  }
  for (let r = 3; r <= row; r++) {
    for (let i = 1; i <= lastCol; i++) {
      const cell = ws.getCell(r, i);
      cell.border = THIN;
      if (i === 1) cell.alignment = { vertical: 'middle', wrapText: true };
      else if (i > 2) cell.alignment = { horizontal: 'center' };
    }
  }

  // --- Варианты ФИО ---
  const vs = book.addWorksheet('Варианты ФИО');
  vs.columns = [
    { header: 'Наставник', width: 32 },
    { header: 'ЛС', width: 18 },
    { header: 'Отметка', width: 14 },
    { header: 'ФИО в реестре', width: 40 },
    { header: 'Вариант написания', width: 36 },
    { header: 'Упоминаний в практике', width: 14 },
  ];
  for (const m of an.mentors) {
    for (const v of m.variants) vs.addRow([m.name, m.ls, m.tag, m.registry?.fullName ?? '', v.text, v.count]);
  }

  // --- Группы ---
  const gs = book.addWorksheet('Группы');
  gs.columns = [
    { header: 'Группа', width: 28 },
    { header: 'Дата старта', width: 13 },
    { header: 'Месяц учёта', width: 16 },
    { header: 'Месяц изменён вручную', width: 12 },
    { header: 'Стажёров', width: 10 },
    { header: 'С наставником', width: 12 },
    { header: 'С результатом экзамена', width: 12 },
    { header: 'Сдали', width: 10 },
  ];
  for (const g of an.groups) {
    const date = g.date ? new Date(`${g.date}T00:00:00Z`) : '';
    const r = gs.addRow([g.name, date, monthLabel(g.month), g.overridden ? 'да' : '', g.trainees, g.withMentor, g.withResult, g.passed]);
    r.getCell(2).numFmt = 'dd.mm.yyyy';
  }

  // --- Расшифровка ---
  const ds = book.addWorksheet('Расшифровка');
  ds.columns = [
    { header: 'Наставник', width: 30 },
    { header: 'ЛС', width: 18 },
    { header: 'Месяц', width: 16 },
    { header: 'Группа', width: 28 },
    { header: 'ФИО стажера', width: 30 },
    { header: 'Дней у наставника', width: 12 },
    { header: 'Дни', width: 30 },
    { header: 'Результат экзамена', width: 14 },
  ];
  const groupName = new Map(wb.groups.map((g) => [g.key, g.name]));
  for (const m of an.mentors) {
    for (const l of m.links) {
      const t = wb.trainees[l.traineeId];
      ds.addRow([
        m.name, m.ls, monthLabel(an.groupMonth.get(t.groupKey) ?? ''), groupName.get(t.groupKey) ?? '', t.name,
        l.days.length, l.days.map((d) => wb.dayLabels[d]).join(', '), RESULT_LABEL[t.result] || t.resultRaw,
      ]);
    }
  }

  for (const sheet of [vs, gs, ds]) {
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { wrapText: true, vertical: 'middle' };
    sheet.getRow(1).fill = HEADER_FILL;
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columnCount } };
  }

  const buf = await book.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
