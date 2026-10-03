// Склейка вариантов ФИО в наставников и подсчёт показателей по месяцам.
import { fragmentToName, textKey, type ParsedName } from './cellParser';
import { cleanSpaces, lsDisplay, lsKey, phoneticWord, similarity } from './normalize';
import type { Decisions, Group, ParsedWorkbook, RegistryEntry, Trainee } from './types';

// --- Узлы: варианты ФИО, совпадающие после нормализации ---

interface Node {
  key: string;
  /** Слова в фонетическом виде (первые два). */
  phon: [string, string];
  texts: Map<string, number>;
  occurrences: number;
  lsKeys: Map<string, number>;
  registryId: number | null;
}

export function nodeKey(words: string[]): string {
  return words.slice(0, 2).map(phoneticWord).sort().join(' ');
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export interface MatchScore {
  min: number;
  avg: number;
}

export function scoreWords(a: [string, string], b: [string, string]): MatchScore {
  const s1 = similarity(a[0], b[0]);
  const s2 = similarity(a[1], b[1]);
  const t1 = similarity(a[0], b[1]);
  const t2 = similarity(a[1], b[0]);
  const straight = { min: Math.min(s1, s2), avg: (s1 + s2) / 2 };
  const swapped = { min: Math.min(t1, t2), avg: (t1 + t2) / 2 };
  return swapped.avg > straight.avg ? swapped : straight;
}

export type MatchLevel = 'auto' | 'ask' | 'none';

export function classify(score: MatchScore, lsMatch: boolean): MatchLevel {
  if (score.min >= 0.85 && (lsMatch || score.min >= 0.93)) return 'auto';
  if (score.min >= 0.72 || (score.avg >= 0.8 && lsMatch)) return 'ask';
  return 'none';
}

/** Основная ЛС каждого варианта встречается и у другого. */
function lsIntersect(a: Node, b: Node): boolean {
  if (!a.lsKeys.size || !b.lsKeys.size) return true;
  return b.lsKeys.has(mostFrequent(a.lsKeys)!) && a.lsKeys.has(mostFrequent(b.lsKeys)!);
}

const SURNAME_END = /(ова|ева|ина|ына|ая|енко|ко|ук|юк|ов|ев|ин|ын|ий|ой|ская|цкая|баева|бекова|улы|кызы)$/i;

/** «Фамилия Имя» выглядит правильнее, чем «Имя Фамилия». */
function surnameFirst(text: string): boolean {
  const [w1 = '', w2 = ''] = text.split(' ');
  return SURNAME_END.test(w1) || !SURNAME_END.test(w2);
}

// --- Результат анализа ---

export interface Link {
  traineeId: number;
  days: number[];
}

export interface Mentor {
  id: string;
  name: string;
  ls: string;
  lsKey: string;
  registry: RegistryEntry | null;
  /** «Проводник», «Вектор» или «вне реестра». */
  tag: string;
  nodeKeys: string[];
  variants: { text: string; count: number; nodeKey: string }[];
  links: Link[];
  byMonth: Record<string, { in: number; passed: number }>;
  totalIn: number;
}

export interface Suggestion {
  key: string;
  a: { nodeKey: string; mentorId: string; name: string; ls: string; count: number; registry: boolean };
  b: { nodeKey: string; mentorId: string; name: string; ls: string; count: number; registry: boolean };
  score: number;
}

export interface Fragment {
  key: string;
  text: string;
  count: number;
  examples: { traineeId: number; day: number; raw: string }[];
  /** 'mentor' | 'not' | 'node:<ключ варианта>' */
  decision: string | null;
  /** Наставники той же ЛС, к которым может относиться фрагмент. */
  candidates: { nodeKey: string; mentorId: string; name: string }[];
}

export interface GroupInfo extends Group {
  month: string;
  overridden: boolean;
  trainees: number;
  withMentor: number;
  withResult: number;
  passed: number;
  missingResults: number;
}

export interface Analysis {
  months: string[];
  mentors: Mentor[];
  mentorsById: Map<string, Mentor>;
  /** Наставник, к которому относится вариант ФИО. */
  mentorOfNode: Map<string, string>;
  suggestions: Suggestion[];
  /** Наставники, собранные из нескольких разных написаний. */
  merged: Mentor[];
  fragments: Fragment[];
  notMentorNodes: { nodeKey: string; text: string; count: number }[];
  groups: GroupInfo[];
  groupMonth: Map<string, string>;
  traineesWithoutResult: Trainee[];
  totals: Record<string, { in: number; passed: number }>;
  stats: {
    trainees: number;
    traineesWithMentor: number;
    mentorsInPractice: number;
    mentorsInRegistry: number;
    registryWithoutTrainees: RegistryEntry[];
  };
  unresolved: number;
}

// --- Месяцы и кварталы ---

export function monthLabel(m: string, withYear = true): string {
  if (!m) return 'Без месяца';
  const names = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const [y, mm] = m.split('-').map(Number);
  return withYear ? `${names[mm - 1]} ${y}` : names[mm - 1];
}

export function quarterOf(m: string): string {
  const [y, mm] = m.split('-').map(Number);
  return `${y}-Q${Math.ceil(mm / 3)}`;
}

export function quarterLabel(q: string): string {
  const [y, n] = q.split('-Q');
  return `${n} квартал ${y}`;
}

function monthRange(months: string[]): string[] {
  const sorted = [...new Set(months.filter(Boolean))].sort();
  if (!sorted.length) return [];
  const out: string[] = [];
  let [y, m] = sorted[0].split('-').map(Number);
  const last = sorted[sorted.length - 1];
  for (;;) {
    const cur = `${y}-${String(m).padStart(2, '0')}`;
    out.push(cur);
    if (cur >= last) break;
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** Столбцы таблицы: месяцы и итог квартала после последнего месяца квартала. */
export type Column = { kind: 'month'; month: string } | { kind: 'quarter'; quarter: string; months: string[] };

export function buildColumns(months: string[]): Column[] {
  const cols: Column[] = [];
  months.forEach((m, i) => {
    cols.push({ kind: 'month', month: m });
    const q = quarterOf(m);
    const next = months[i + 1];
    if (!next || quarterOf(next) !== q) {
      cols.push({ kind: 'quarter', quarter: q, months: months.filter((x) => quarterOf(x) === q) });
    }
  });
  return cols;
}

// --- Основной расчёт ---

class Clusters {
  parent = new Map<string, string>();
  members = new Map<string, string[]>();
  registry = new Map<string, number | null>();

  add(key: string, registryId: number | null) {
    this.parent.set(key, key);
    this.members.set(key, [key]);
    this.registry.set(key, registryId);
  }
  find(k: string): string {
    let p = this.parent.get(k)!;
    while (p !== this.parent.get(p)) p = this.parent.get(p)!;
    this.parent.set(k, p);
    return p;
  }
  canMerge(a: string, b: string, cannot: Set<string>): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    const ga = this.registry.get(ra);
    const gb = this.registry.get(rb);
    if (ga != null && gb != null && ga !== gb) return false;
    for (const x of this.members.get(ra)!) for (const y of this.members.get(rb)!) if (cannot.has(pairKey(x, y))) return false;
    return true;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    this.parent.set(rb, ra);
    this.members.set(ra, [...this.members.get(ra)!, ...this.members.get(rb)!]);
    this.members.delete(rb);
    if (this.registry.get(ra) == null) this.registry.set(ra, this.registry.get(rb) ?? null);
  }
}

function mostFrequent<T>(m: Map<T, number>): T | undefined {
  let best: T | undefined;
  let bestN = -1;
  for (const [k, n] of m) if (n > bestN) { best = k; bestN = n; }
  return best;
}

export function analyze(wb: ParsedWorkbook, dec: Decisions): Analysis {
  const same = new Set(dec.same);
  const different = new Set(dec.different);
  const separated = new Set(dec.separated);
  const notMentor = new Set(dec.notMentor);

  // 1. Имена в ячейках (включая подтверждённые пользователем фрагменты).
  const nodes = new Map<string, Node>();
  const fragments = new Map<string, Fragment>();
  const lsNames = new Map<string, Map<string, number>>();
  const fragLs = new Map<string, string>();
  /** traineeId → [{nodeKey, day}] */
  const cellNames: { nodeKey: string; day: number }[][] = [];

  const touchNode = (name: ParsedName, ls: string): string => {
    const key = nodeKey(name.words);
    let n = nodes.get(key);
    if (!n) {
      const w = name.words.map(phoneticWord);
      n = { key, phon: [w[0], w[1] ?? ''], texts: new Map(), occurrences: 0, lsKeys: new Map(), registryId: null };
      nodes.set(key, n);
    }
    const text = name.words.slice(0, 3).join(' ');
    n.texts.set(text, (n.texts.get(text) ?? 0) + 1);
    n.occurrences++;
    if (ls) n.lsKeys.set(ls, (n.lsKeys.get(ls) ?? 0) + 1);
    return key;
  };

  for (const t of wb.trainees) {
    if (t.ls) {
      const m = lsNames.get(t.lsKey) ?? new Map<string, number>();
      m.set(lsDisplay(t.ls), (m.get(lsDisplay(t.ls)) ?? 0) + 1);
      lsNames.set(t.lsKey, m);
    }
    const list: { nodeKey: string; day: number }[] = [];
    t.days.forEach((cell, day) => {
      for (const name of cell.names) {
        if (name.words.length < 2) continue;
        list.push({ nodeKey: touchNode(name, t.lsKey), day });
      }
      for (const frag of cell.uncertain) {
        const key = textKey(frag);
        if (!key) continue;
        let f = fragments.get(key);
        if (!f) {
          f = { key, text: frag, count: 0, examples: [], decision: dec.fragments[key] ?? null, candidates: [] };
          fragments.set(key, f);
        }
        f.count++;
        if (!f.examples.length) fragLs.set(key, t.lsKey);
        if (f.examples.length < 5) f.examples.push({ traineeId: t.id, day, raw: cell.raw });
        if (f.decision?.startsWith('node:')) {
          list.push({ nodeKey: f.decision.slice(5), day });
        } else if (f.decision === 'mentor') {
          const name = fragmentToName(frag);
          if (name && name.words.length >= 1) {
            if (name.words.length === 1) name.words.push('');
            list.push({ nodeKey: touchNode(name, t.lsKey), day });
          }
        }
      }
    });
    cellNames.push(list);
  }

  // 2. Узлы реестра.
  const regNodes: string[] = [];
  for (const r of wb.registry) {
    const variants = [r.surname, ...r.altSurnames].map((s) => `reg:${r.id}:${nodeKey([s, r.given])}`);
    variants.forEach((key, i) => {
      const s = i === 0 ? r.surname : r.altSurnames[i - 1];
      nodes.set(key, {
        key,
        phon: [phoneticWord(s), phoneticWord(r.given)],
        texts: new Map([[`${s} ${r.given}`, 0]]),
        occurrences: 0,
        lsKeys: r.ls ? new Map([[lsKey(r.ls), 1]]) : new Map(),
        registryId: r.id,
      });
      regNodes.push(key);
    });
  }

  // 3. Кластеризация.
  const cl = new Clusters();
  for (const n of nodes.values()) if (!notMentor.has(n.key)) cl.add(n.key, n.registryId);
  for (const r of wb.registry) {
    const keys = regNodes.filter((k) => k.startsWith(`reg:${r.id}:`));
    for (let i = 1; i < keys.length; i++) cl.union(keys[0], keys[i]);
  }
  for (const p of same) {
    const [a, b] = p.split('|');
    if (cl.parent.has(a) && cl.parent.has(b)) cl.union(a, b);
  }

  const active = [...nodes.values()].filter((n) => cl.parent.has(n.key));
  const edges: { a: Node; b: Node; score: MatchScore; level: MatchLevel }[] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      if (a.registryId != null && b.registryId != null) continue;
      // Быстрый отсев: первые буквы хотя бы одного слова должны совпадать.
      if (a.phon[0][0] !== b.phon[0][0] && a.phon[0][0] !== b.phon[1][0] && a.phon[1][0] !== b.phon[1][0] && a.phon[1][0] !== b.phon[0][0]) continue;
      const score = scoreWords(a.phon, b.phon);
      const level = classify(score, lsIntersect(a, b));
      if (level !== 'none') edges.push({ a, b, score, level });
    }
  }
  edges.sort((x, y) => y.score.avg - x.score.avg);
  for (const e of edges) {
    if (e.level !== 'auto') continue;
    if (separated.has(e.a.key) || separated.has(e.b.key)) continue;
    if (different.has(pairKey(e.a.key, e.b.key))) continue;
    if (cl.canMerge(e.a.key, e.b.key, different)) cl.union(e.a.key, e.b.key);
  }

  // 4. Наставники.
  const groupMonth = new Map<string, string>();
  for (const g of wb.groups) groupMonth.set(g.key, dec.groupMonths[g.key] ?? g.defaultMonth);

  const mentorsByRoot = new Map<string, Mentor>();
  const mentorOfNode = new Map<string, string>();
  for (const [root, members] of cl.members) {
    const memberNodes = members.map((k) => nodes.get(k)!);
    const regId = cl.registry.get(root);
    const registry = regId != null ? wb.registry[regId] : null;
    const variants = memberNodes
      .filter((n) => n.registryId == null)
      .flatMap((n) => [...n.texts].map(([text, count]) => ({ text, count, nodeKey: n.key })))
      .sort((a, b) => b.count - a.count);
    const id = [...members].sort()[0];
    const lsCount = new Map<string, number>();
    for (const n of memberNodes) if (n.registryId == null) for (const [k, c] of n.lsKeys) lsCount.set(k, (lsCount.get(k) ?? 0) + c);
    const mainLsKey = registry?.ls ? lsKey(registry.ls) : mostFrequent(lsCount) ?? '';
    const lsName = registry?.ls ? lsDisplay(registry.ls) : (mostFrequent(lsNames.get(mainLsKey) ?? new Map()) ?? '');
    const display = variants.find((v) => surnameFirst(v.text)) ?? variants[0];
    const name = registry ? `${registry.surname} ${registry.given}` : display?.text ?? '';
    const mentor: Mentor = {
      id,
      name,
      ls: lsName,
      lsKey: mainLsKey,
      registry,
      tag: registry ? registry.category || 'В реестре' : 'вне реестра',
      nodeKeys: members,
      variants,
      links: [],
      byMonth: {},
      totalIn: 0,
    };
    mentorsByRoot.set(root, mentor);
    for (const k of members) mentorOfNode.set(k, id);
  }
  const mentorsById = new Map([...mentorsByRoot.values()].map((m) => [m.id, m]));

  // 5. Подсчёт.
  const totals: Analysis['totals'] = {};
  let traineesWithMentor = 0;
  wb.trainees.forEach((t, idx) => {
    const perMentor = new Map<string, number[]>();
    for (const { nodeKey: k, day } of cellNames[idx]) {
      const mid = mentorOfNode.get(k);
      if (!mid) continue; // «не наставник»
      const days = perMentor.get(mid) ?? [];
      if (!days.includes(day)) days.push(day);
      perMentor.set(mid, days);
    }
    if (!perMentor.size) return;
    traineesWithMentor++;
    const month = groupMonth.get(t.groupKey) ?? '';
    for (const [mid, days] of perMentor) {
      const m = mentorsById.get(mid)!;
      m.links.push({ traineeId: t.id, days: days.sort((a, b) => a - b) });
      if (!month) continue;
      const cell = (m.byMonth[month] ??= { in: 0, passed: 0 });
      cell.in++;
      m.totalIn++;
      const tot = (totals[month] ??= { in: 0, passed: 0 });
      tot.in++;
      if (t.result === 'passed') { cell.passed++; tot.passed++; }
    }
  });

  const allMentors = [...mentorsById.values()];
  const mentors = allMentors
    .filter((m) => m.links.length > 0)
    .sort((a, b) => a.ls.localeCompare(b.ls, 'ru') || a.name.localeCompare(b.name, 'ru'));

  // 6. Предложения на проверку.
  const suggestionMap = new Map<string, Suggestion>();
  const side = (n: Node) => {
    const m = mentorsById.get(mentorOfNode.get(n.key)!)!;
    return {
      nodeKey: n.key,
      mentorId: m.id,
      name: n.registryId != null ? wb.registry[n.registryId].fullName : mostFrequent(n.texts) ?? '',
      ls: n.registryId != null ? lsDisplay(wb.registry[n.registryId].ls) : (mostFrequent(lsNames.get(mostFrequent(n.lsKeys) ?? '') ?? new Map()) ?? ''),
      count: m.links.length,
      registry: n.registryId != null,
    };
  };
  for (const e of edges) {
    const ma = mentorOfNode.get(e.a.key);
    const mb = mentorOfNode.get(e.b.key);
    if (!ma || !mb || ma === mb) continue;
    const pk = pairKey(e.a.key, e.b.key);
    if (same.has(pk) || different.has(pk)) continue;
    const ra = cl.find(e.a.key);
    const rb = cl.find(e.b.key);
    if (!cl.canMerge(ra, rb, different)) continue;
    const A = mentorsById.get(ma)!;
    const B = mentorsById.get(mb)!;
    if (!A.links.length && !B.links.length) continue;
    const ck = pairKey(ma, mb);
    const prev = suggestionMap.get(ck);
    if (!prev || prev.score < e.score.avg) {
      suggestionMap.set(ck, { key: pk, a: side(e.a), b: side(e.b), score: e.score.avg });
    }
  }
  const suggestions = [...suggestionMap.values()].sort((a, b) => b.score - a.score);

  const merged = mentors.filter((m) => {
    const distinct = new Set(m.variants.map((v) => v.text.toLowerCase()));
    return distinct.size > 1 || (m.registry && m.variants.some((v) => nodeKey(v.text.split(' ')) !== nodeKey([m.registry!.surname, m.registry!.given])));
  });

  // 7. Группы.
  const groups: GroupInfo[] = wb.groups.map((g) => ({
    ...g,
    month: groupMonth.get(g.key) ?? '',
    overridden: g.key in dec.groupMonths,
    trainees: 0, withMentor: 0, withResult: 0, passed: 0, missingResults: 0,
  }));
  const gIdx = new Map(groups.map((g) => [g.key, g]));
  const lastDay = wb.dayLabels.length - 1;
  const traineesWithoutResult: Trainee[] = [];
  wb.trainees.forEach((t, idx) => {
    const g = gIdx.get(t.groupKey)!;
    g.trainees++;
    const hasMentor = cellNames[idx].some((c) => mentorOfNode.has(c.nodeKey));
    if (hasMentor) g.withMentor++;
    if (t.result !== 'none') g.withResult++;
    if (t.result === 'passed') g.passed++;
    if (t.result === 'none' && t.days[lastDay]?.kind === 'names') {
      g.missingResults++;
      traineesWithoutResult.push(t);
    }
  });

  const fragmentList = [...fragments.values()].sort((a, b) => b.count - a.count);
  // Кандидаты для фрагментов: наставник с похожей фамилией или именем в той же ЛС.
  for (const f of fragmentList) {
    const fw = f.key.split(' ').map(phoneticWord);
    const ls = fragLs.get(f.key) ?? '';
    const seen = new Set<string>();
    for (const m of mentors) {
      if (seen.size >= 5) break;
      if (ls && m.lsKey && m.lsKey !== ls) continue;
      const v = m.variants[0];
      if (!v) continue;
      const mw = v.text.split(' ').map(phoneticWord);
      const hit = fw.every((w) => mw.some((x) => similarity(w, x) >= 0.85));
      if (hit && !seen.has(m.id)) {
        seen.add(m.id);
        f.candidates.push({ nodeKey: v.nodeKey, mentorId: m.id, name: m.name });
      }
    }
  }
  const notMentorNodes = [...notMentor]
    .map((k) => nodes.get(k))
    .filter((n): n is Node => !!n)
    .map((n) => ({ nodeKey: n.key, text: mostFrequent(n.texts) ?? n.key, count: n.occurrences }));

  const registryUsed = new Set(mentors.filter((m) => m.registry).map((m) => m.registry!.id));

  return {
    months: monthRange([...groupMonth.values()]),
    mentors,
    mentorsById,
    mentorOfNode,
    suggestions,
    merged,
    fragments: fragmentList,
    notMentorNodes,
    groups: groups.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'ru')),
    groupMonth,
    traineesWithoutResult,
    totals,
    stats: {
      trainees: wb.trainees.length,
      traineesWithMentor,
      mentorsInPractice: mentors.length,
      mentorsInRegistry: registryUsed.size,
      registryWithoutTrainees: wb.registry.filter((r) => !registryUsed.has(r.id)),
    },
    unresolved: suggestions.length + fragmentList.filter((f) => !f.decision).length,
  };
}

// --- Сверка с ручной таблицей ---

export interface Discrepancy {
  mentor: string;
  manualName: string;
  ls: string;
  month: string;
  manualIn: number | null;
  calcIn: number;
  manualPassed: number | null;
  calcPassed: number;
  note: string;
}

export function reconcile(wb: ParsedWorkbook, an: Analysis): Discrepancy[] {
  if (!wb.manual) return [];
  const out: Discrepancy[] = [];
  const mentorNodes = [...an.mentorOfNode.keys()].map((k) => {
    const words = k.replace(/^reg:\d+:/, '').split(' ');
    return { key: k, phon: [words[0] ?? '', words[1] ?? ''] as [string, string] };
  });
  const manualByMentor = new Map<string, { names: string[]; values: Record<string, { in: number; passed: number }> }>();

  for (const row of wb.manual.rows) {
    const words = cleanSpaces(row.name.replace(/\([^)]*\)/g, ' ')).split(' ');
    const key = nodeKey(words);
    let mid = an.mentorOfNode.get(key);
    if (!mid) {
      const phon: [string, string] = [phoneticWord(words[0] ?? ''), phoneticWord(words[1] ?? '')];
      let best = 0;
      for (const n of mentorNodes) {
        const s = scoreWords(phon, n.phon).min;
        if (s > best && s >= 0.85) { best = s; mid = an.mentorOfNode.get(n.key); }
      }
    }
    const m = mid ? an.mentorsById.get(mid) : undefined;
    if (!m || !m.links.length) {
      for (const month of wb.manual.months) {
        const v = row.values[month];
        if (v?.in) {
          out.push({
            mentor: '—', manualName: row.name, ls: row.ls, month, manualIn: v.in, calcIn: 0,
            manualPassed: v.passed, calcPassed: 0, note: 'В расчёте не найден',
          });
        }
      }
      continue;
    }
    const agg = manualByMentor.get(m.id) ?? { names: [], values: {} };
    agg.names.push(row.name);
    for (const month of wb.manual.months) {
      const v = row.values[month];
      const a = (agg.values[month] ??= { in: 0, passed: 0 });
      a.in += v?.in ?? 0;
      a.passed += v?.passed ?? 0;
    }
    manualByMentor.set(m.id, agg);
  }

  for (const m of an.mentors) {
    const agg = manualByMentor.get(m.id);
    for (const month of wb.manual.months) {
      const calc = m.byMonth[month] ?? { in: 0, passed: 0 };
      const man = agg?.values[month] ?? { in: 0, passed: 0 };
      if (calc.in === man.in && calc.passed === man.passed) continue;
      let note = '';
      if (!agg) note = 'Нет в ручной таблице';
      else if (agg.names.length > 1) note = `В ручной таблице ${agg.names.length} строки`;
      else if (man.in === 0 && calc.in > 0) note = 'Пропущен в этом месяце';
      out.push({
        mentor: m.name, manualName: agg?.names.join(' / ') ?? '', ls: m.ls, month,
        manualIn: man.in, calcIn: calc.in, manualPassed: man.passed, calcPassed: calc.passed, note,
      });
    }
  }
  return out.sort((a, b) => a.month.localeCompare(b.month) || a.ls.localeCompare(b.ls, 'ru') || a.mentor.localeCompare(b.mentor, 'ru'));
}

