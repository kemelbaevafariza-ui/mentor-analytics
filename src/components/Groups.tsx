import { monthLabel, type Analysis } from '../lib/analysis';
import { setGroupMonth } from '../lib/decisions';
import type { Decisions, ParsedWorkbook } from '../lib/types';

interface Props {
  wb: ParsedWorkbook;
  analysis: Analysis;
  decisions: Decisions;
  setDecisions: (d: Decisions) => void;
}

/** Месяцы для выбора: от месяца раньше первого до месяца позже последнего. */
function monthOptions(months: string[], extra: string[]): string[] {
  const all = [...months, ...extra].filter(Boolean).sort();
  if (!all.length) return [];
  const shift = (m: string, d: number) => {
    const [y, mm] = m.split('-').map(Number);
    const t = y * 12 + (mm - 1) + d;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
  };
  const out: string[] = [];
  for (let m = shift(all[0], -1); m <= shift(all[all.length - 1], 1); m = shift(m, 1)) out.push(m);
  return out;
}

export default function Groups({ wb, analysis, decisions, setDecisions }: Props) {
  const options = monthOptions(analysis.months, analysis.groups.map((g) => g.defaultMonth));
  const groupName = new Map(analysis.groups.map((g) => [g.key, g.name]));

  return (
    <div className="review">
      <section className="card">
        <h2>Группы</h2>
        <p className="muted">
          Месяц учёта определяется по дате старта. Для групп на стыке месяцев его можно изменить — выбор запоминается.
          Жёлтым отмечены группы, где результаты экзамена ещё не внесены: по ним «% успешности» предварительный.
        </p>
        <table className="plain groups">
          <thead>
            <tr>
              <th>Группа</th><th>Дата старта</th><th>Месяц учёта</th><th className="num">Стажёров</th>
              <th className="num">С наставником</th><th className="num">С результатом</th><th className="num">Сдали</th><th />
            </tr>
          </thead>
          <tbody>
            {analysis.groups.map((g) => {
              const pending = g.withResult === 0 ? 'none' : g.missingResults > 0 ? 'partial' : '';
              return (
                <tr key={g.key} className={pending ? 'pending' : ''}>
                  <td>{g.name}</td>
                  <td>{g.date ? g.date.split('-').reverse().join('.') : <span className="warn-text">не распознана</span>}</td>
                  <td>
                    <select
                      value={g.month}
                      className={g.overridden ? 'overridden' : ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDecisions(setGroupMonth(decisions, g.key, v === g.defaultMonth ? null : v));
                      }}
                    >
                      {!g.month && <option value="">— выберите —</option>}
                      {options.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                    </select>
                    {g.overridden && (
                      <button className="btn small ghost" title="Вернуть месяц по дате старта" onClick={() => setDecisions(setGroupMonth(decisions, g.key, null))}>
                        ↺
                      </button>
                    )}
                  </td>
                  <td className="num">{g.trainees}</td>
                  <td className="num">{g.withMentor}</td>
                  <td className="num">{g.withResult}</td>
                  <td className="num">{g.passed}</td>
                  <td className="small">
                    {pending === 'none' && <span className="warn-text">результаты не внесены</span>}
                    {pending === 'partial' && <span className="warn-text">без результата: {g.missingResults}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Дошли до последнего дня, но без результата <span className="badge">{analysis.traineesWithoutResult.length}</span></h2>
        {!analysis.traineesWithoutResult.length ? (
          <p className="ok-text">У всех стажёров, прошедших практику, результат внесён.</p>
        ) : (
          <table className="plain">
            <thead><tr><th>Группа</th><th>ФИО стажёра</th><th>ЛС</th><th>Строка в файле</th><th>{wb.dayLabels[wb.dayLabels.length - 1]} (последний день)</th></tr></thead>
            <tbody>
              {analysis.traineesWithoutResult.map((t) => (
                <tr key={t.id}>
                  <td>{groupName.get(t.groupKey)}</td>
                  <td>{t.name}</td>
                  <td>{t.ls}</td>
                  <td>{t.row}</td>
                  <td>{t.days[t.days.length - 1]?.raw}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
