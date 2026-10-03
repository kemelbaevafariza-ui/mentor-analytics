// Разбор ячейки дня практики: ФИО наставника(ов), пометка или сомнительный текст.
import { cleanSpaces, foldWord, titleCase } from './normalize';

export interface ParsedName {
  /** ФИО в виде «Слово Слово [Отчество]», с заглавных букв. */
  text: string;
  words: string[];
}

export type CellKind = 'empty' | 'note' | 'names' | 'uncertain';

export interface ParsedCell {
  raw: string;
  kind: CellKind;
  names: ParsedName[];
  /** Фрагменты, которые могут быть ФИО, но уверенности нет. */
  uncertain: string[];
}

// Слова, которые не встречаются в ФИО и означают пометку.
const STOP_WORDS = new Set(
  [
    'не', 'нет', 'была', 'был', 'были', 'практике', 'практика', 'практики', 'на', 'в', 'во', 'с', 'со', 'по', 'до',
    'после', 'отпросилась', 'отпросился', 'отпросили', 'заболела', 'заболел', 'болеет', 'болела', 'больничный',
    'отказ', 'отказалась', 'отказался', 'сб', 'покинула', 'покинул', 'группу', 'группы', 'группа', 'сдача',
    'экзамен', 'экзамена', 'экзамене', 'дня', 'день', 'дней', 'го', 'цо', 'выбыла', 'выбыл', 'уволилась',
    'уволился', 'отсутствовала', 'отсутствовал', 'отсутствует', 'пришла', 'пришел', 'пришёл', 'причине',
    'причина', 'стажер', 'стажёр', 'стажера', 'стажерка', 'перевод', 'переведена', 'переведен', 'обучение',
    'обучения', 'выходной', 'выходные', 'семейным', 'обстоятельствам', 'личным', 'ушла', 'ушел', 'ушёл',
    'прошла', 'прошел', 'самостоятельно', 'офис', 'офисе', 'тренинг', 'теория', 'нету', 'неявка', 'без',
    'наставника', 'наставник', 'наставником', 'и', 'или', 'также', 'еще', 'ещё', 'уже', 'все', 'всё', 'она', 'он',
  ].map(foldWord),
);

// Уточнения после ФИО, которые нужно отбросить: «до обеда», «воск.», «(пят)».
const QUALIFIER_WORDS = new Set(
  [
    'до', 'после', 'обеда', 'обед', 'утро', 'утром', 'вечер', 'вечером', 'воск', 'воскр', 'вс', 'пн', 'вт', 'ср',
    'чт', 'пт', 'пят', 'сб', 'суб', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота',
    'воскресенье', 'была', 'был', 'в', 'с', 'на', 'день', 'дня', 'полдня', 'половина',
  ].map(foldWord),
);

const PATRONYMIC = /(овна|евна|ична|инична|ович|евич|ич|кызы|қызы|улы|ұлы|уулу)$/i;

function isCapitalizedWord(tok: string): boolean {
  if (tok.length < 2) return false;
  if (!/^[A-ZА-ЯЁӘҒҚҢӨҰҮҺІ]/.test(tok)) return false;
  const letters = tok.replace(/-/g, '');
  if (!/^[A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]+$/.test(letters)) return false;
  // Аббревиатуры (ЦО, СБ) — не ФИО.
  if (letters.length <= 4 && letters === letters.toUpperCase()) return false;
  return true;
}

function isLetterWord(tok: string): boolean {
  return /^[A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі-]{2,}$/.test(tok);
}

function cleanToken(tok: string): string {
  return tok
    .replace(/^[^A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]+/, '')
    .replace(/[-–—]?\d+$/, '')
    .replace(/[^A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]+$/, '');
}

function toName(words: string[]): ParsedName {
  const w = words.map(titleCase);
  return { text: w.join(' '), words: w };
}

function parseSegment(seg: string, out: ParsedCell) {
  const tokens = seg.split(' ').map(cleanToken).filter(Boolean);
  if (!tokens.length) return;

  // Ведущая серия слов с заглавной буквы — кандидат в ФИО.
  let i = 0;
  const run: string[] = [];
  while (i < tokens.length && isCapitalizedWord(tokens[i]) && !STOP_WORDS.has(foldWord(tokens[i]))) {
    run.push(tokens[i]);
    i++;
  }
  const rest = tokens.slice(i);
  const restIsQualifier = rest.every((t) => QUALIFIER_WORDS.has(foldWord(t)) || !isLetterWord(t));
  const restHasStop = rest.some((t) => STOP_WORDS.has(foldWord(t)) && !QUALIFIER_WORDS.has(foldWord(t)));

  if (run.length >= 2) {
    if (restHasStop && run.length === 2 && rest.length > 2) {
      // «Иванова Анна не была на практике» — ФИО упомянуто в комментарии.
      out.uncertain.push(cleanSpaces(seg));
      return;
    }
    // Нарезаем серию на ФИО: Фамилия Имя [Отчество].
    let j = 0;
    while (j < run.length) {
      if (run.length - j === 1) {
        // Одинокое слово в хвосте серии — не уверены.
        if (!PATRONYMIC.test(run[j])) out.uncertain.push(run[j]);
        break;
      }
      const words = [run[j], run[j + 1]];
      j += 2;
      if (j < run.length && PATRONYMIC.test(run[j])) {
        words.push(run[j]);
        j++;
      }
      out.names.push(toName(words));
    }
    return;
  }

  if (run.length === 1) {
    if (rest.length === 0 || restIsQualifier) out.uncertain.push(run[0]);
    else if (!restHasStop && rest.length <= 2 && rest.every(isLetterWord)) out.uncertain.push(cleanSpaces(seg));
    // иначе — пометка
    return;
  }

  // Нет слов с заглавной: «касымкулова жанар» похоже на ФИО, «заболела» — нет.
  if (
    tokens.length >= 2 && tokens.length <= 3 && tokens.every(isLetterWord)
    && !tokens.some((t) => STOP_WORDS.has(foldWord(t)) || QUALIFIER_WORDS.has(foldWord(t)))
  ) {
    out.uncertain.push(cleanSpaces(seg));
  }
}

export function parseCell(value: unknown): ParsedCell {
  const raw = value == null ? '' : cleanSpaces(String(value));
  const out: ParsedCell = { raw, kind: 'empty', names: [], uncertain: [] };
  if (!raw || !/[A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/.test(raw)) return out;

  const withoutParens = raw.replace(/\([^)]*\)?/g, ' ').replace(/\[[^\]]*\]?/g, ' ');
  const segments = withoutParens
    .split(/[,;\/\\+\n]|\s+и\s+(?=[A-ZА-ЯЁӘҒҚҢӨҰҮҺІ])|\s+[-–—]\s+/)
    .map(cleanSpaces)
    .filter(Boolean);

  for (const seg of segments) parseSegment(seg, out);

  if (out.names.length) out.kind = 'names';
  else if (out.uncertain.length) out.kind = 'uncertain';
  else out.kind = 'note';
  return out;
}

/** Ключ для запоминания решений по тексту ячейки/фрагмента. */
export function textKey(s: string): string {
  return cleanSpaces(s).split(' ').map(foldWord).filter(Boolean).join(' ');
}

/** Превращает подтверждённый пользователем фрагмент в ФИО. */
export function fragmentToName(fragment: string): ParsedName | null {
  const words = cleanSpaces(fragment).split(' ').map(cleanToken).filter(isLetterWord);
  if (!words.length) return null;
  return toName(words.slice(0, 3));
}
