// Создаёт пример входного файла sample/пример.xlsx с вымышленными данными
// и типичными ошибками: разные написания ФИО, пометки вместо ФИО, объединённые ячейки.
import ExcelJS from 'exceljs';
import { mkdirSync } from 'node:fs';

let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];

// Наставники: [ЛС, основное написание, варианты написания, категория в реестре или null]
const MENTORS = [
  ['Астана Встреча', 'Касымкулова Жанар', ['Касымкулова Жанара', 'Касымкуллова Жанар'], 'Проводник'],
  ['Астана Встреча', 'Татаренко Мадина', ['Татаренкова Мадина', 'Татаринко Мадина'], 'Вектор'],
  ['Астана-Встреча', 'Ералиева Ирада', [], null],
  ['Алматы 1', 'Құсайынова Динара', ['Кусаинова Динара'], 'Проводник'],
  ['Алматы 1', 'Әбділда Айгерим', ['Абдилда Айгерим'], null],
  ['Алматы 1', 'Тулешова Юлия', ['Юлия Тулешова'], null],
  ['Кокшетау', 'Кусембаева Акмарал', ['Кусембаева Акмарал воск.'], 'Вектор'],
  ['Шымкент', 'Якубаева Акмарал', [], null],
  ['Шымкент', 'Байташева Айсулу', [], 'Проводник'],
  ['Тараз4', 'Горошко Альбина', ['Моложенко Альбина'], 'Проводник'],
  ['Тараз_4', 'Шуренова Аманда', ['Шуренова Аманда (была в воскр)'], null],
  ['Тараз4', 'Асабаева Асем', ['Асабаева Асем(пят)'], null],
  ['Кокшетау', 'Байсынбаева Диана', ['Байсынбаева Диана-1'], null],
  ['Шымкент', 'Божахан Мадина', [], 'Вектор'],
];
const NOTES = ['-', 'не была на практике', 'отпросилась', 'заболела', 'отказ СБ', 'покинула группу', 'Сдача экзамена', 'ЦО'];
const FIRST = ['Аружан', 'Дана', 'Айым', 'Алина', 'Мадина', 'Асель', 'Камила', 'Дильназ', 'Томирис', 'Айгерим'];
const LAST = ['Сапарова', 'Нурланова', 'Ержанова', 'Ким', 'Оспанова', 'Жумабаева', 'Ахметова', 'Серикова', 'Бекова'];

const STARTS = ['2026-03-31', '2026-04-14', '2026-05-12', '2026-06-23', '2026-06-30', '2026-07-21', '2026-08-18', '2026-09-29'];

const book = new ExcelJS.Workbook();
const ws = book.addWorksheet('Стажеры и их наставники');
ws.getCell('A1').value = 'Стажеры и их наставники';
const header = ['№ Группы', 'Дата', 'Локальная сеть', 'ФИО стажера', 'Вторник', 'Среда', 'Четверг', 'Суббота', 'Понедельник', 'Вторник', 'Результат экзамена'];
ws.addRow(header).font = { bold: true };

let row = 3;
STARTS.forEach((start, gi) => {
  const first = row;
  const size = 5 + Math.floor(rnd() * 4);
  for (let i = 0; i < size; i++) {
    const [ls, main, variants] = pick(MENTORS);
    const lsWritten = rnd() < 0.2 ? ls + ' ' : ls;
    const days = [];
    let left = false;
    for (let d = 0; d < 6; d++) {
      if (left) { days.push(null); continue; }
      if (d > 0 && rnd() < 0.05) { days.push(pick(['покинула группу', 'отказ СБ'])); left = true; continue; }
      const r = rnd();
      if (r < 0.1) days.push(pick(NOTES));
      else if (r < 0.15) {
        const [, other] = pick(MENTORS);
        days.push(`${main} до обеда, ${other} после обеда`);
      } else days.push(variants.length && rnd() < 0.35 ? pick(variants) : main);
    }
    const noMentor = rnd() < 0.07;
    const result = left ? 'Не сдал' : gi === STARTS.length - 1 ? '' : rnd() < 0.75 ? 'Сдал' : 'Не сдал';
    ws.addRow([
      `Группа ${11 + gi}`, new Date(`${start}T00:00:00Z`), lsWritten, `${pick(LAST)} ${pick(FIRST)}`,
      ...(noMentor ? ['не была на практике', '-', '-', 'заболела', '-', '-'] : days),
      noMentor ? '' : result,
    ]);
    row++;
  }
  ws.mergeCells(first, 1, row - 1, 1);
  ws.mergeCells(first, 2, row - 1, 2);
  ws.getCell(first, 2).numFmt = 'dd.mm.yyyy';
});

// Ручная аналитика (частично заполнена, с ошибками)
const an = book.addWorksheet('Аналитика по Наставникам');
an.getCell('A1').value = 'ЛС';
an.getCell('B1').value = 'ФИО наставника';
an.mergeCells('A1:A2');
an.mergeCells('B1:B2');
['Апрель', 'Май'].forEach((m, i) => {
  const c = 3 + i * 3;
  an.getCell(1, c).value = m;
  an.mergeCells(1, c, 1, c + 2);
  an.getCell(2, c).value = 'Кол-во стажеров на входе';
  an.getCell(2, c + 1).value = 'Кол-во стажеров сдавших экзамен';
  an.getCell(2, c + 2).value = '% успешности';
});
an.addRow(['Астана Встреча', 'Касымкулова Жанар', 2, 1, null, 1, 1]);
an.addRow(['Астана Встреча', 'Касымкулова Жанара', 1, 1, null, 0, 0]);
an.addRow(['Шымкент', 'Божахан Мадина', 1, 0, null, 2, 1]);

// Реестр
const rg = book.addWorksheet('Дейст-щие Наставники');
rg.addRow(['ЛС', 'Населенный пункт', 'ФИО наставника', 'Группа']).font = { bold: true };
for (const [ls, main, , cat] of MENTORS) {
  if (!cat) continue;
  const full = main === 'Горошко Альбина' ? 'Горошко (Моложенко) Альбина Петровна' : `${main} Сериковна`;
  rg.addRow([ls.trim(), ls.split(' ')[0], full, cat]);
}
rg.addRow(['Караганда', 'Караганда', 'Нурпеисова Сауле Маратовна', 'Проводник']);

mkdirSync('sample', { recursive: true });
await book.xlsx.writeFile('sample/пример.xlsx');
console.log(`sample/пример.xlsx: ${row - 3} стажёров, ${STARTS.length} групп`);
