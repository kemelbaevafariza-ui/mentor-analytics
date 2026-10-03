import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { analyze, reconcile } from './analysis';
import { exportWorkbook } from './exporter';
import { readWorkbook } from './reader';
import { emptyDecisions } from './types';
import { markDifferent } from './decisions';

const SAMPLE = 'sample/пример.xlsx';

describe.skipIf(!existsSync(SAMPLE))('полный цикл на примере', () => {
  const buf = readFileSync(SAMPLE);
  const wb = readWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'пример.xlsx');

  it('читает листы', () => {
    expect(wb.trainees.length).toBe(54);
    expect(wb.groups.length).toBe(8);
    expect(wb.groups[0]).toMatchObject({ name: 'Группа 11', date: '2026-03-31', defaultMonth: '2026-03' });
    expect(wb.registry.length).toBeGreaterThan(5);
    expect(wb.manual?.months).toEqual(['2026-04', '2026-05']);
  });

  it('склеивает варианты и не склеивает разных людей', () => {
    const an = analyze(wb, emptyDecisions());
    const names = an.mentors.map((m) => m.name);
    const kas = an.mentors.filter((m) => m.name.startsWith('Касымкул'));
    expect(kas.length).toBe(1);
    expect(kas[0].registry).not.toBeNull();
    expect(names.filter((n) => n.includes('Акмарал')).length).toBe(2);
    expect(an.mentors.filter((m) => /Горошко|Моложенко/.test(m.name)).length).toBeLessThanOrEqual(1);
    for (const bad of ['Не Была', 'Отказ Сб', 'Сдача Экзамена', 'Цо']) expect(names).not.toContain(bad);
    // Итоги совпадают с суммой по наставникам
    for (const [month, t] of Object.entries(an.totals)) {
      expect(an.mentors.reduce((s, m) => s + (m.byMonth[month]?.in ?? 0), 0)).toBe(t.in);
    }
    expect(reconcile(wb, an).length).toBeGreaterThan(0);
  });

  it('решение «разные люди» применяется', () => {
    const an = analyze(wb, emptyDecisions());
    const m = an.mentors.find((x) => x.nodeKeys.length > 1 && x.variants.length > 1)!;
    const keys = [...new Set(m.variants.map((v) => v.nodeKey))];
    if (keys.length < 2) return;
    const an2 = analyze(wb, markDifferent(emptyDecisions(), keys[0], keys[1]));
    expect(an2.mentorOfNode.get(keys[0])).not.toBe(an2.mentorOfNode.get(keys[1]));
  });

  it('выгружает Excel', async () => {
    const an = analyze(wb, emptyDecisions());
    const blob = await exportWorkbook(wb, an);
    const out = XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: 'array' });
    expect(out.SheetNames).toEqual(['Аналитика по Наставникам', 'Варианты ФИО', 'Группы', 'Расшифровка']);
    const ws = out.Sheets['Аналитика по Наставникам'];
    expect(ws.A1.v).toBe('ЛС');
    expect(ws.C1.v).toBe('Март 2026');
    expect(ws.E3.f).toMatch(/^IF\(C3=0/);
  });
});
