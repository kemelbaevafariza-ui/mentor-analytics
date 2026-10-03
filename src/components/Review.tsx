import { useState } from 'react';
import type { Analysis, Mentor } from '../lib/analysis';
import {
  markDifferent, markSame, normalizeDecisions, separate, setFragment, setNotMentor, undoPair, unseparate,
} from '../lib/decisions';
import { emptyDecisions, type Decisions, type ParsedWorkbook } from '../lib/types';
import { MentorPicker } from './MentorDrawer';
import { TagBadge } from './AnalyticsTable';

interface Props {
  wb: ParsedWorkbook;
  analysis: Analysis;
  decisions: Decisions;
  setDecisions: (d: Decisions) => void;
  onOpen: (id: string) => void;
}

export default function Review({ wb, analysis, decisions, setDecisions, onOpen }: Props) {
  const [mergeA, setMergeA] = useState<Mentor | null>(null);
  const [mergeB, setMergeB] = useState<Mentor | null>(null);
  const [showAllFragments, setShowAllFragments] = useState(false);

  const nodeText = (k: string): string => {
    const mid = analysis.mentorOfNode.get(k);
    const m = mid ? analysis.mentorsById.get(mid) : undefined;
    if (k.startsWith('reg:')) return m?.registry ? `${m.registry.fullName} (реестр)` : k;
    const v = m?.variants.find((x) => x.nodeKey === k);
    return v?.text ?? analysis.notMentorNodes.find((n) => n.nodeKey === k)?.text ?? k;
  };

  const openFragments = analysis.fragments.filter((f) => !f.decision);
  const shownFragments = showAllFragments ? openFragments : openFragments.slice(0, 30);
  const decidedFragments = analysis.fragments.filter((f) => f.decision);

  const exportDecisions = () => {
    const blob = new Blob([JSON.stringify(decisions, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'решения по ФИО.json';
    a.click();
  };

  const importDecisions = async (f: File) => {
    try {
      const incoming = normalizeDecisions(JSON.parse(await f.text()));
      // Объединяем: решения из файла дополняют текущие.
      const merged: Decisions = {
        version: 1,
        same: [...new Set([...decisions.same, ...incoming.same])],
        different: [...new Set([...decisions.different, ...incoming.different])],
        separated: [...new Set([...decisions.separated, ...incoming.separated])],
        notMentor: [...new Set([...decisions.notMentor, ...incoming.notMentor])],
        fragments: { ...decisions.fragments, ...incoming.fragments },
        groupMonths: { ...decisions.groupMonths, ...incoming.groupMonths },
      };
      setDecisions(merged);
    } catch {
      alert('Не удалось прочитать файл решений.');
    }
  };

  return (
    <div className="review">
      <section className="card">
        <h2>Похожие ФИО <span className="badge">{analysis.suggestions.length}</span></h2>
        <p className="muted">Это один человек или разные люди? Пока решение не принято, они считаются разными.</p>
        {!analysis.suggestions.length && <p className="ok-text">Нерешённых пар нет.</p>}
        <div className="pairs">
          {analysis.suggestions.map((s) => (
            <div className="pair" key={s.key}>
              {[s.a, s.b].map((x, i) => (
                <div className="pair-side" key={i}>
                  <button className="link strong" onClick={() => onOpen(x.mentorId)}>{x.name}</button>
                  {x.registry && <TagBadge tag="реестр" />}
                  <div className="muted small">{x.ls || 'без ЛС'} · стажёров: {x.count}</div>
                </div>
              ))}
              <div className="pair-actions">
                <button className="btn primary small" onClick={() => setDecisions(markSame(decisions, s.a.nodeKey, s.b.nodeKey))}>
                  Один человек
                </button>
                <button className="btn small" onClick={() => setDecisions(markDifferent(decisions, s.a.nodeKey, s.b.nodeKey))}>
                  Разные люди
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Ячейки, похожие не на ФИО <span className="badge">{openFragments.length}</span></h2>
        <p className="muted">Пока решение не принято, такие ячейки не засчитываются наставнику.</p>
        {!openFragments.length && <p className="ok-text">Спорных ячеек нет.</p>}
        <table className="plain">
          <tbody>
            {shownFragments.map((f) => (
              <tr key={f.key}>
                <td>
                  <b>{f.text}</b> <span className="muted">×{f.count}</span>
                  <div className="muted small">
                    {f.examples.slice(0, 2).map((e, i) => (
                      <div key={i}>«{e.raw}» — {wb.trainees[e.traineeId].name}, {wb.dayLabels[e.day]}</div>
                    ))}
                  </div>
                </td>
                <td className="nowrap right">
                  {f.candidates.map((c) => (
                    <button key={c.nodeKey} className="btn small primary" onClick={() => setDecisions(setFragment(decisions, f.key, `node:${c.nodeKey}`))}>
                      Это {c.name}
                    </button>
                  ))}
                  {f.text.trim().includes(' ') && (
                    <button className="btn small" onClick={() => setDecisions(setFragment(decisions, f.key, 'mentor'))}>Это наставник</button>
                  )}
                  <button className="btn small" onClick={() => setDecisions(setFragment(decisions, f.key, 'not'))}>Это не наставник</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {openFragments.length > shownFragments.length && (
          <button className="btn ghost" onClick={() => setShowAllFragments(true)}>Показать все ({openFragments.length})</button>
        )}
      </section>

      <section className="card">
        <h2>Автоматически объединённые ФИО <span className="badge neutral">{analysis.merged.length}</span></h2>
        <p className="muted">Разные написания, которые приложение посчитало одним человеком. Если ошибка — отделите вариант.</p>
        <table className="plain">
          <tbody>
            {analysis.merged.map((m) => {
              const nodes = [...new Set(m.variants.map((v) => v.nodeKey))];
              return (
                <tr key={m.id}>
                  <td className="nowrap">
                    <button className="link strong" onClick={() => onOpen(m.id)}>{m.name}</button> <TagBadge tag={m.tag} />
                    <div className="muted small">{m.ls}</div>
                  </td>
                  <td>
                    {nodes.map((k) => (
                      <span key={k} className="variant-group">
                        {m.variants.filter((v) => v.nodeKey === k).map((v) => (
                          <span key={v.text} className="variant">{v.text} <span className="muted">×{v.count}</span></span>
                        ))}
                        {(nodes.length > 1 || m.registry) && (
                          <button className="btn small ghost" onClick={() => setDecisions(separate(decisions, k))}>Отделить</button>
                        )}
                      </span>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Объединить двух наставников вручную</h2>
        <div className="merge-row">
          <MentorPicker analysis={analysis} placeholder="Первый наставник…" onPick={setMergeA} />
          <MentorPicker analysis={analysis} exclude={mergeA?.id} placeholder="Второй наставник…" onPick={setMergeB} />
          <button
            className="btn primary"
            disabled={!mergeA || !mergeB || mergeA.id === mergeB.id}
            onClick={() => {
              setDecisions(markSame(decisions, mergeA!.nodeKeys[0], mergeB!.nodeKeys[0]));
              setMergeA(null);
              setMergeB(null);
            }}
          >
            Объединить
          </button>
        </div>
        {(mergeA || mergeB) && (
          <p className="muted small">{mergeA?.name ?? '…'} ({mergeA?.ls}) + {mergeB?.name ?? '…'} ({mergeB?.ls})</p>
        )}
      </section>

      <details className="card">
        <summary>
          <h2>Принятые решения</h2>
          <span className="muted">
            {decisions.same.length + decisions.different.length + decisions.separated.length + decidedFragments.length + analysis.notMentorNodes.length}
          </span>
        </summary>
        <ul className="decisions">
          {decisions.same.map((p) => (
            <li key={`s${p}`}>
              <span className="tag guide">один человек</span> {p.split('|').map(nodeText).join(' = ')}
              <button className="btn small ghost" onClick={() => setDecisions(undoPair(decisions, p))}>Отменить</button>
            </li>
          ))}
          {decisions.different.map((p) => (
            <li key={`d${p}`}>
              <span className="tag out">разные люди</span> {p.split('|').map(nodeText).join(' ≠ ')}
              <button className="btn small ghost" onClick={() => setDecisions(undoPair(decisions, p))}>Отменить</button>
            </li>
          ))}
          {decisions.separated.map((k) => (
            <li key={`x${k}`}>
              <span className="tag out">отделено</span> {nodeText(k)}
              <button className="btn small ghost" onClick={() => setDecisions(unseparate(decisions, k))}>Отменить</button>
            </li>
          ))}
          {analysis.notMentorNodes.map((n) => (
            <li key={`n${n.nodeKey}`}>
              <span className="tag out">не наставник</span> {n.text}
              <button className="btn small ghost" onClick={() => setDecisions(setNotMentor(decisions, n.nodeKey, false))}>Отменить</button>
            </li>
          ))}
          {decidedFragments.map((f) => (
            <li key={`f${f.key}`}>
              <span className={`tag ${f.decision === 'not' ? 'out' : 'guide'}`}>
                {f.decision === 'not' ? 'не наставник' : 'наставник'}
              </span>{' '}
              «{f.text}»{f.decision?.startsWith('node:') ? ` → ${nodeText(f.decision.slice(5))}` : ''}
              <button className="btn small ghost" onClick={() => setDecisions(setFragment(decisions, f.key, null))}>Отменить</button>
            </li>
          ))}
        </ul>
        <div className="actions">
          <button className="btn" onClick={exportDecisions}>Сохранить решения в файл</button>
          <label className="btn">
            Загрузить решения из файла
            <input type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && importDecisions(e.target.files[0])} />
          </label>
          <button
            className="btn ghost danger"
            onClick={() => confirm('Удалить все решения по ФИО и месяцам групп?') && setDecisions(emptyDecisions())}
          >
            Сбросить все решения
          </button>
        </div>
        <p className="muted small">
          Решения хранятся в этом браузере. Чтобы поделиться ими с коллегой, сохраните их в файл и передайте.
        </p>
      </details>

      {analysis.stats.registryWithoutTrainees.length > 0 && (
        <details className="card">
          <summary>
            <h2>Наставники из реестра без стажёров</h2>
            <span className="muted">{analysis.stats.registryWithoutTrainees.length}</span>
          </summary>
          <table className="plain">
            <tbody>
              {analysis.stats.registryWithoutTrainees.map((r) => (
                <tr key={r.id}><td>{r.fullName}</td><td>{r.ls}</td><td>{r.city}</td><td>{r.category}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
