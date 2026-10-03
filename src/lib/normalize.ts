// Нормализация строк: казахские буквы, латинские двойники, пробелы, ЛС.

const KAZ_MAP: Record<string, string> = {
  ә: 'а', ғ: 'г', қ: 'к', ң: 'н', ө: 'о', ұ: 'у', ү: 'у', һ: 'х', і: 'и', ё: 'е',
};

// Латинские буквы, внешне совпадающие с кириллицей (частая ошибка раскладки).
const LATIN_LOOKALIKE: Record<string, string> = {
  a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у', k: 'к', m: 'м', t: 'т', h: 'н', b: 'в',
};

export function cleanSpaces(s: string): string {
  return s.replace(/[   \t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Приводит слово к «плоскому» виду для сравнения: нижний регистр, без казахских букв. */
export function foldWord(word: string): string {
  let out = '';
  const lower = word.toLowerCase();
  const hasCyr = /[а-яёәғқңөұүһі]/.test(lower);
  for (const ch of lower) {
    if (KAZ_MAP[ch]) out += KAZ_MAP[ch];
    else if (hasCyr && LATIN_LOOKALIKE[ch]) out += LATIN_LOOKALIKE[ch];
    else if (/[a-zа-я]/.test(ch)) out += ch;
  }
  return out;
}

/** Фонетически упрощённый вид: для нечёткого сравнения (й→и, двойные буквы → одна). */
export function phoneticWord(word: string): string {
  return foldWord(word)
    .replace(/й/g, 'и')
    .replace(/ъ|ь/g, '')
    .replace(/(.)\1+/g, '$1');
}

export function titleCase(word: string): string {
  return word
    .split('-')
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p))
    .join('-');
}

/** Красивое отображение ЛС. */
export function lsDisplay(ls: string): string {
  return cleanSpaces(cleanSpaces(ls).replace(/\s*[-_]\s*/g, ' ').replace(/([^\d\s])(\d)/g, '$1 $2'));
}

/** Нормализованный ключ ЛС: «Астана Встреча» = «Астана-Встреча», «Тараз4» = «Тараз_4». */
export function lsKey(ls: string): string {
  const s = cleanSpaces(ls).toLowerCase().replace(/[-_.,]/g, ' ');
  const letters = s.split(/[\s\d]+/).filter(Boolean).map(foldWord).join(' ');
  const digits = s.replace(/[^0-9]/g, '');
  return digits ? `${letters} ${digits}` : letters;
}

// --- Сравнение строк ---

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** Похожесть 0..1 с учётом окончаний (Жанар / Жанара, Татаренко / Татаренкова). */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const pa = phoneticWord(a);
  const pb = phoneticWord(b);
  if (pa === pb) return 0.97;
  const maxLen = Math.max(pa.length, pb.length);
  const dist = levenshtein(pa, pb);
  let score = 1 - dist / maxLen;
  // Общий длинный префикс — сильный признак (разные окончания одного слова).
  let prefix = 0;
  while (prefix < pa.length && prefix < pb.length && pa[prefix] === pb[prefix]) prefix++;
  const minLen = Math.min(pa.length, pb.length);
  if (prefix === minLen && minLen >= 4 && maxLen - minLen <= 2) score = Math.max(score, 0.9);
  else if (prefix >= 5) score = Math.max(score, Math.min(0.92, score + 0.08));
  return score;
}
