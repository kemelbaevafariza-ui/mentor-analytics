import { useEffect, useMemo, useState } from 'react';
import { analyze, reconcile } from './lib/analysis';
import { loadDecisions, saveDecisions } from './lib/decisions';

import { InputError, readWorkbook } from './lib/reader';
import type { Decisions, ParsedWorkbook } from './lib/types';
import Upload from './components/Upload';
import AnalyticsTable from './components/AnalyticsTable';
import Review from './components/Review';
import Groups from './components/Groups';
import Reconcile from './components/Reconcile';
import MentorDrawer from './components/MentorDrawer';

type Tab = 'table' | 'review' | 'groups' | 'reconcile';

export default function App() {
  const [wb, setWb] = useState<ParsedWorkbook | null>(null);
  const [decisions, setDecisions] = useState<Decisions>(loadDecisions);
  const [tab, setTab] = useState<Tab>('table');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mentorId, setMentorId] = useState<string | null>(null);

  useEffect(() => saveDecisions(decisions), [decisions]);

  const analysis = useMemo(() => (wb ? analyze(wb, decisions) : null), [wb, decisions]);
  const discrepancies = useMemo(() => (wb && analysis ? reconcile(wb, analysis) : []), [wb, analysis]);

  async function onFile(file: File) {
    setError('');
    setBusy(true);
    try {
      const data = await file.arrayBuffer();
      const parsed = readWorkbook(data, file.name);
      setWb(parsed);
      setMentorId(null);
      setTab('table');
    } catch (e) {
      setError(e instanceof InputError ? e.message : `Ошибка при чтении файла: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onExport() {
    if (!wb || !analysis) return;
    setBusy(true);
    try {
      const { exportWorkbook } = await import('./lib/exporter');
      const blob = await exportWorkbook(wb, analysis);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const base = wb.fileName.replace(/\.xlsx?$/i, '');
      a.download = `Аналитика по наставникам — ${base}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } finally {
      setBusy(false);
    }
  }

  if (!wb || !analysis) {
    return (
      <div className="page">
        <header className="topbar"><h1>Аналитика по наставникам</h1></header>
        <main className="center">
          <Upload onFile={onFile} busy={busy} error={error} />
        </main>
      </div>
    );
  }

  const mentor = mentorId ? analysis.mentorsById.get(mentorId) ?? null : null;
  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'table', label: 'Аналитика' },
    { id: 'review', label: 'Проверка ФИО', badge: analysis.unresolved },
    { id: 'groups', label: 'Группы', badge: analysis.traineesWithoutResult.length || undefined },
  ];
  if (wb.manual) tabs.push({ id: 'reconcile', label: 'Сверка с ручной таблицей', badge: discrepancies.length || undefined });

  return (
    <div className="page">
      <header className="topbar">
        <h1>Аналитика по наставникам</h1>
        <div className="file">
          <span title={wb.fileName}>{wb.fileName}</span>
          <label className="btn ghost">
            Загрузить другой файл
            <input type="file" accept=".xlsx,.xlsm" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        </div>
        <button
          className={`unresolved ${analysis.unresolved ? 'warn' : 'ok'}`}
          onClick={() => setTab('review')}
          title="Пары ФИО и ячейки, по которым нужно решение"
        >
          {analysis.unresolved ? `Нерешённых случаев: ${analysis.unresolved}` : 'Все ФИО проверены'}
        </button>
        <button className="btn primary" onClick={onExport} disabled={busy}>Скачать Excel</button>
      </header>

      {error && <div className="alert error">{error}</div>}
      {wb.warnings.map((w) => <div key={w} className="alert">{w}</div>)}

      <div className="stats">
        <Stat label="Стажёров" value={analysis.stats.trainees} />
        <Stat label="С наставником" value={analysis.stats.traineesWithMentor} />
        <Stat label="Наставников в практике" value={analysis.stats.mentorsInPractice} />
        <Stat label="Из них в реестре" value={analysis.stats.mentorsInRegistry} />
        <Stat label="Групп" value={analysis.groups.length} />
      </div>

      <nav className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
            {t.badge ? <span className="badge">{t.badge}</span> : null}
          </button>
        ))}
      </nav>

      <main>
        {tab === 'table' && <AnalyticsTable analysis={analysis} onOpen={setMentorId} />}
        {tab === 'review' && (
          <Review wb={wb} analysis={analysis} decisions={decisions} setDecisions={setDecisions} onOpen={setMentorId} />
        )}
        {tab === 'groups' && <Groups wb={wb} analysis={analysis} decisions={decisions} setDecisions={setDecisions} />}
        {tab === 'reconcile' && <Reconcile items={discrepancies} />}
      </main>

      {mentor && (
        <MentorDrawer
          wb={wb}
          analysis={analysis}
          mentor={mentor}
          decisions={decisions}
          setDecisions={setDecisions}
          onClose={() => setMentorId(null)}
          onOpen={setMentorId}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
