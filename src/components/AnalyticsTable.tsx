import { Fragment, useMemo, useState } from 'react';
import { buildColumns, monthLabel, quarterLabel, quarterOf, type Analysis, type Column, type Mentor } from '../lib/analysis';
import { foldWord } from '../lib/normalize';

export function pct(passed: number, inn: number): string {
  return inn ? `${Math.round((passed / inn) * 100)}%` : '';
}

export function TagBadge({ tag }: { tag: string }) {
  const cls = tag === 'вне реестра' ? 'out' : tag.toLowerCase().startsWith('вектор') ? 'vector' : 'guide';
  return <span className={`tag ${cls}`}>{tag}</span>;
}

function sumMonths(src: Analysis['totals'], months: string[]) {
  return months.reduce(
    (acc, mm) => ({ in: acc.in + (src[mm]?.in ?? 0), passed: acc.passed + (src[mm]?.passed ?? 0) }),
    { in: 0, passed: 0 },
  );
}

const colMonths = (c: Column) => (c.kind === 'month' ? [c.month] : c.months);

export default function AnalyticsTable({ analysis, onOpen }: { analysis: Analysis; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState('all');
  const [reg, setReg] = useState<'all' | 'in' | 'out'>('all');
  const [ls, setLs] = useState('');

  const quarters = [...new Set(analysis.months.map(quarterOf))];
  const lsList = [...new Set(analysis.mentors.map((m) => m.ls))].sort((a, b) => a.localeCompare(b, 'ru'));

  const columns: Column[] = useMemo(() => {
    if (period.startsWith('m:')) return [{ kind: 'month', month: period.slice(2) }];
    if (period.startsWith('q:')) return buildColumns(analysis.months.filter((m) => quarterOf(m) === period.slice(2)));
    return buildColumns(analysis.months);
  }, [period, analysis.months]);
  const periodMonths = [...new Set(columns.flatMap(colMonths))];

  const rows = useMemo(() => {
    const q = query.trim().split(/\s+/).filter(Boolean).map(foldWord);
    return analysis.mentors.filter((m) => {
      if (reg === 'in' && !m.registry) return false;
      if (reg === 'out' && m.registry) return false;
      if (ls && m.ls !== ls) return false;
      if (q.length) {
        const hay = [m.name, ...m.variants.map((v) => v.text), m.registry?.fullName ?? ''].map((s) => s.split(' ').map(foldWord).join(' ')).join(' | ');
        if (!q.every((w) => hay.includes(w))) return false;
      }
      if (period !== 'all' && sumMonths(m.byMonth, periodMonths).in === 0) return false;
      return true;
    });
  }, [analysis.mentors, query, reg, ls, period, periodMonths.join()]);

  // Блоки по ЛС для объединённой ячейки.
  const blocks: { ls: string; items: Mentor[] }[] = [];
  for (const m of rows) {
    const last = blocks[blocks.length - 1];
    if (last && last.ls === m.ls) last.items.push(m);
    else blocks.push({ ls: m.ls, items: [m] });
  }

  const footer = (() => {
    const t: Analysis['totals'] = {};
    for (const m of rows) for (const [k, v] of Object.entries(m.byMonth)) {
      const x = (t[k] ??= { in: 0, passed: 0 });
      x.in += v.in;
      x.passed += v.passed;
    }
    return t;
  })();

  return (
    <div>
      <div className="filters">
        <input className="search" placeholder="Поиск по ФИО…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="all">Все месяцы</option>
          <optgroup label="Квартал">
            {quarters.map((q) => <option key={q} value={`q:${q}`}>{quarterLabel(q)}</option>)}
          </optgroup>
          <optgroup label="Месяц">
            {analysis.months.map((m) => <option key={m} value={`m:${m}`}>{monthLabel(m)}</option>)}
          </optgroup>
        </select>
        <select value={reg} onChange={(e) => setReg(e.target.value as typeof reg)}>
          <option value="all">Все наставники</option>
          <option value="in">В реестре</option>
          <option value="out">Вне реестра</option>
        </select>
        <select value={ls} onChange={(e) => setLs(e.target.value)}>
          <option value="">Все ЛС</option>
          {lsList.map((x) => <option key={x} value={x}>{x || '(без ЛС)'}</option>)}
        </select>
        <span className="muted">Наставников: {rows.length}. Нажмите на ФИО, чтобы увидеть стажёров.</span>
      </div>

      <div className="table-scroll">
        <table className="analytics">
          <thead>
            <tr>
              <th rowSpan={2} className="sticky-1">ЛС</th>
              <th rowSpan={2} className="sticky-2">ФИО наставника</th>
              {columns.map((c) => (
                <th key={c.kind === 'month' ? c.month : c.quarter} colSpan={3} className={c.kind === 'quarter' ? 'quarter' : ''}>
                  {c.kind === 'month' ? monthLabel(c.month) : `Итог за ${quarterLabel(c.quarter)}`}
                </th>
              ))}
            </tr>
            <tr>
              {columns.map((c) => (
                <Fragment key={c.kind === 'month' ? c.month : c.quarter}>
                  <th className={`sub ${c.kind === 'quarter' ? 'quarter' : ''}`}>На входе</th>
                  <th className={`sub ${c.kind === 'quarter' ? 'quarter' : ''}`}>Сдали</th>
                  <th className={`sub ${c.kind === 'quarter' ? 'quarter' : ''}`}>%</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {blocks.map((b) =>
              b.items.map((m, i) => (
                <tr key={m.id}>
                  {i === 0 && <td rowSpan={b.items.length} className="ls sticky-1">{b.ls || '—'}</td>}
                  <td className="name sticky-2">
                    <button className="link" onClick={() => onOpen(m.id)}>{m.name}</button>
                    <TagBadge tag={m.tag} />
                    {m.variants.length > 1 && <span className="muted small" title={m.variants.map((v) => v.text).join('\n')}> · {new Set(m.variants.map((v) => v.text)).size} написания</span>}
                  </td>
                  {columns.map((c) => {
                    const v = sumMonths(m.byMonth, colMonths(c));
                    const q = c.kind === 'quarter' ? 'quarter' : '';
                    return (
                      <Fragment key={c.kind === 'month' ? c.month : c.quarter}>
                        <td className={`num ${q}`}>{v.in || ''}</td>
                        <td className={`num ${q}`}>{v.in ? v.passed : ''}</td>
                        <td className={`num pct ${q}`}>{pct(v.passed, v.in)}</td>
                      </Fragment>
                    );
                  })}
                </tr>
              )),
            )}
            {!rows.length && (
              <tr><td colSpan={2 + columns.length * 3} className="empty">Ничего не найдено</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="sticky-1">Итого</td>
              {columns.map((c) => {
                const v = sumMonths(footer, colMonths(c));
                return (
                  <Fragment key={c.kind === 'month' ? c.month : c.quarter}>
                    <td className="num">{v.in}</td>
                    <td className="num">{v.passed}</td>
                    <td className="num pct">{pct(v.passed, v.in)}</td>
                  </Fragment>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="muted small">
        «На входе» — стажёры, у которых наставник провёл хотя бы один день практики. Если наставников было несколько,
        стажёр засчитывается каждому, поэтому «Итого» может быть больше числа стажёров.
      </p>
    </div>
  );
}
