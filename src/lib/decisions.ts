// Хранение решений пользователя (склейки ФИО, месяцы групп) в браузере.
import { pairKey } from './analysis';
import { emptyDecisions, type Decisions } from './types';

const STORAGE_KEY = 'mentor-analytics/decisions/v1';

export function loadDecisions(): Decisions {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeDecisions(JSON.parse(raw));
  } catch {
    // хранилище недоступно — начинаем с пустых решений
  }
  return emptyDecisions();
}

export function saveDecisions(d: Decisions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  } catch {
    // ignore
  }
}

export function normalizeDecisions(raw: unknown): Decisions {
  const base = emptyDecisions();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<Decisions>;
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  const rec = (v: unknown) =>
    v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'string')) : {};
  return {
    version: 1,
    same: arr(r.same),
    different: arr(r.different),
    separated: arr(r.separated),
    fragments: rec(r.fragments),
    notMentor: arr(r.notMentor),
    groupMonths: rec(r.groupMonths),
  };
}

const without = (list: string[], v: string) => list.filter((x) => x !== v);
const withItem = (list: string[], v: string) => (list.includes(v) ? list : [...list, v]);

export function markSame(d: Decisions, a: string, b: string): Decisions {
  const k = pairKey(a, b);
  return { ...d, same: withItem(d.same, k), different: without(d.different, k), separated: d.separated.filter((x) => x !== a && x !== b) };
}

export function markDifferent(d: Decisions, a: string, b: string): Decisions {
  const k = pairKey(a, b);
  return { ...d, different: withItem(d.different, k), same: without(d.same, k) };
}

/** Отделить вариант от склейки: убрать ручные склейки с ним и запретить автоматические. */
export function separate(d: Decisions, node: string): Decisions {
  return {
    ...d,
    separated: withItem(d.separated, node),
    same: d.same.filter((p) => !p.split('|').includes(node)),
  };
}

export function unseparate(d: Decisions, node: string): Decisions {
  return { ...d, separated: without(d.separated, node) };
}

export function setFragment(d: Decisions, key: string, value: string | null): Decisions {
  const fragments = { ...d.fragments };
  if (value == null) delete fragments[key];
  else fragments[key] = value;
  return { ...d, fragments };
}

export function setNotMentor(d: Decisions, node: string, value: boolean): Decisions {
  return { ...d, notMentor: value ? withItem(d.notMentor, node) : without(d.notMentor, node) };
}

export function setGroupMonth(d: Decisions, group: string, month: string | null): Decisions {
  const groupMonths = { ...d.groupMonths };
  if (month == null) delete groupMonths[group];
  else groupMonths[group] = month;
  return { ...d, groupMonths };
}

export function undoPair(d: Decisions, key: string): Decisions {
  return { ...d, same: without(d.same, key), different: without(d.different, key) };
}
