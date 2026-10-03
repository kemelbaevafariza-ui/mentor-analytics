import { useState } from 'react';
import { monthLabel, type Discrepancy } from '../lib/analysis';

export default function Reconcile({ items }: { items: Discrepancy[] }) {
  const months = [...new Set(items.map((i) => i.month))].sort();
  const [month, setMonth] = useState('');
  const shown = month ? items.filter((i) => i.month === month) : items;

  return (
    <div className="review">
      <section className="card">
        <h2>Сверка с листом «Аналитика по Наставникам»</h2>
        <p className="muted">
          Строки, где ручные цифры не совпадают с расчётом. Совпадающие строки не показаны.
        </p>
        <div className="filters">
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">Все месяцы ({items.length})</option>
            {months.map((m) => (
              <option key={m} value={m}>{monthLabel(m)} ({items.filter((i) => i.month === m).length})</option>
            ))}
          </select>
        </div>
        {!shown.length ? (
          <p className="ok-text">Расхождений нет.</p>
        ) : (
          <table className="plain">
            <thead>
              <tr>
                <th>Месяц</th><th>ЛС</th><th>Наставник (расчёт)</th><th>В ручной таблице</th>
                <th className="num">На входе: вручную</th><th className="num">расчёт</th>
                <th className="num">Сдали: вручную</th><th className="num">расчёт</th><th>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((d, i) => (
                <tr key={i}>
                  <td className="nowrap">{monthLabel(d.month)}</td>
                  <td>{d.ls}</td>
                  <td>{d.mentor}</td>
                  <td>{d.manualName}</td>
                  <td className="num">{d.manualIn ?? ''}</td>
                  <td className={`num ${d.manualIn !== d.calcIn ? 'diff' : ''}`}>{d.calcIn}</td>
                  <td className="num">{d.manualPassed ?? ''}</td>
                  <td className={`num ${d.manualPassed !== d.calcPassed ? 'diff' : ''}`}>{d.calcPassed}</td>
                  <td className="small muted">{d.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
