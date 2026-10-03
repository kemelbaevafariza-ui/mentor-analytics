import { useEffect, useState } from 'react';
import { monthLabel, type Analysis, type Mentor } from '../lib/analysis';
import { markSame, separate, setNotMentor } from '../lib/decisions';
import type { Decisions, ParsedWorkbook } from '../lib/types';
import { TagBadge, pct } from './AnalyticsTable';

const RESULT = { passed: 'Сдал', failed: 'Не сдал', none: '—', other: '' } as const;

interface Props {
  wb: ParsedWorkbook;
  analysis: Analysis;
  mentor: Mentor;
  decisions: Decisions;
  setDecisions: (d: Decisions) => void;
  onClose: () => void;
  onOpen: (id: string) => void;
}

export function MentorPicker({ analysis, exclude, onPick, placeholder }: {
  analysis: Analysis; exclude?: string; onPick: (m: Mentor) => void; placeholder: string;
}) {
  const [value, setValue] = useState('');
  const options = analysis.mentors.filter((m) => m.id !== exclude);
  const label = (m: Mentor) => `${m.name} — ${m.ls || 'без ЛС'}`;
  const listId = `mentors-${exclude ?? 'all'}`;
  return (
    <span className="picker">
      <input
        list={listId}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          const m = options.find((o) => label(o) === e.target.value);
          if (m) { onPick(m); setValue(''); }
        }}
      />
      <datalist id={listId}>
        {options.map((m) => <option key={m.id} value={label(m)} />)}
      </datalist>
    </span>
  );
}

export default function MentorDrawer({ wb, analysis, mentor, decisions, setDecisions, onClose, onOpen }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const groupName = new Map(wb.groups.map((g) => [g.key, g]));
  const links = mentor.links
    .map((l) => ({ l, t: wb.trainees[l.traineeId] }))
    .map((x) => ({ ...x, g: groupName.get(x.t.groupKey)!, month: analysis.groupMonth.get(x.t.groupKey) ?? '' }))
    .sort((a, b) => a.month.localeCompare(b.month) || a.g.date.localeCompare(b.g.date) || a.t.row - b.t.row);

  const months = [...new Set(links.map((x) => x.month))];
  const nodes = [...new Set(mentor.nodeKeys)];
  const practiceNodes = nodes.filter((k) => !k.startsWith('reg:'));

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose} aria-label="Закрыть">×</button>
        <h2>{mentor.name} <TagBadge tag={mentor.tag} /></h2>
        <div className="muted">{mentor.ls || 'ЛС не указана'}{mentor.registry && <> · в реестре: {mentor.registry.fullName}</>}</div>

        <h3>Написания в файле</h3>
        <ul className="variants">
          {nodes.map((k) => {
            const vs = mentor.variants.filter((v) => v.nodeKey === k);
            if (k.startsWith('reg:')) return null;
            return (
              <li key={k}>
                {vs.map((v) => <span key={v.text} className="variant">{v.text} <span className="muted">×{v.count}</span></span>)}
                {practiceNodes.length > 1 && (
                  <button className="btn small ghost" onClick={() => setDecisions(separate(decisions, k))} title="Это другой человек — отделить">
                    Отделить
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <div className="actions">
          <MentorPicker
            analysis={analysis}
            exclude={mentor.id}
            placeholder="Объединить с другим наставником…"
            onPick={(other) => {
              setDecisions(markSame(decisions, mentor.nodeKeys[0], other.nodeKeys[0]));
              // id наставника — наименьший ключ среди его вариантов, после склейки остаётся меньший.
              onOpen(mentor.id < other.id ? mentor.id : other.id);
            }}
          />
          <button
            className="btn ghost danger"
            onClick={() => {
              let d = decisions;
              for (const k of practiceNodes) d = setNotMentor(d, k, true);
              setDecisions(d);
              onClose();
            }}
          >
            Это не наставник
          </button>
        </div>

        <h3>Стажёры ({links.length})</h3>
        {months.map((m) => {
          const items = links.filter((x) => x.month === m);
          const v = mentor.byMonth[m] ?? { in: 0, passed: 0 };
          return (
            <section key={m}>
              <h4>
                {monthLabel(m)}: на входе {v.in}, сдали {v.passed}{v.in ? ` (${pct(v.passed, v.in)})` : ''}
              </h4>
              <table className="plain">
                <thead>
                  <tr><th>Группа</th><th>ФИО стажёра</th><th>ЛС</th><th>Дней у наставника</th><th>Результат</th></tr>
                </thead>
                <tbody>
                  {items.map(({ l, t, g }) => (
                    <tr key={t.id}>
                      <td>{g.name}<div className="muted small">{g.date.split('-').reverse().join('.')}</div></td>
                      <td>{t.name}<div className="muted small">строка {t.row}</div></td>
                      <td>{t.ls}</td>
                      <td title={l.days.map((d) => `${wb.dayLabels[d]}: ${t.days[d].raw}`).join('\n')}>
                        {l.days.length} из {wb.dayLabels.length}
                        <div className="muted small">{l.days.map((d) => d + 1).join(', ')}-й день</div>
                      </td>
                      <td className={`res ${t.result}`}>{RESULT[t.result] || t.resultRaw}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}
      </aside>
    </div>
  );
}
