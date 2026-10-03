import { describe, expect, it } from 'vitest';
import { parseCell } from './cellParser';
import { classify, nodeKey, scoreWords } from './analysis';
import { lsKey, phoneticWord } from './normalize';

const names = (v: string) => parseCell(v).names.map((n) => n.text);
const phon = (s: string) => s.split(' ').map(phoneticWord) as [string, string];
const level = (a: string, b: string, sameLs = true) => {
  if (nodeKey(a.split(' ')) === nodeKey(b.split(' '))) return 'exact';
  return classify(scoreWords(phon(a), phon(b)), sameLs);
};

describe('разбор ячейки', () => {
  it('пометки не считаются наставником', () => {
    for (const v of ['-', 'не была на практике', 'отпросилась', 'заболела', 'отказ СБ', 'покинула группу',
      'со 2-го дня', 'Сдача экзамена', 'ЦО', 'Стажер не пришла на практику по семейным обстоятельствам']) {
      expect(names(v), v).toEqual([]);
    }
  });

  it('ФИО с пометкой внутри', () => {
    expect(names('Шуренова Аманда (была в воскр)')).toEqual(['Шуренова Аманда']);
    expect(names('Асабаева Асем(пят)')).toEqual(['Асабаева Асем']);
    expect(names('Байсынбаева Диана-1')).toEqual(['Байсынбаева Диана']);
    expect(names('Кусембаева Акмарал воск.')).toEqual(['Кусембаева Акмарал']);
    expect(names('  Құсайынова  Жанар ')).toEqual(['Құсайынова Жанар']);
  });

  it('два наставника в одной ячейке', () => {
    expect(names('Ералиева Ирада до обеда, Байташева Айсулу после обеда')).toEqual(['Ералиева Ирада', 'Байташева Айсулу']);
    expect(names('Иванова Анна и Петрова Ольга')).toEqual(['Иванова Анна', 'Петрова Ольга']);
  });

  it('одно слово — на проверку', () => {
    const c = parseCell('Тулешова');
    expect(c.kind).toBe('uncertain');
  });
});

describe('склейка ФИО', () => {
  it('варианты одного человека', () => {
    expect(level('Касымкулова Жанар', 'Касымкуллова Жанар')).toBe('exact');
    expect(level('Касымкулова Жанар', 'Касымкулова Жанара')).toBe('auto');
    expect(level('Татаренко Мадина', 'Татаренкова Мадина')).toBe('auto');
    expect(level('Татаренко Мадина', 'Татаринко Мадина')).toBe('auto');
    expect(level('Құсайынова Жанар', 'Кусаинова Жанар')).toBe('auto');
    expect(level('Әбділда Айгерим', 'Абдилда Айгерим')).toBe('exact');
    expect(level('Тулешова Юлия', 'Юлия Тулешова')).toBe('exact');
  });

  it('разные люди не склеиваются', () => {
    expect(level('Кусембаева Акмарал', 'Якубаева Акмарал', false)).toBe('none');
    expect(level('Ахметова Айгерим', 'Ахметова Айгуль', false)).toBe('none');
    expect(level('Иванова Анна', 'Иванова Алина', false)).not.toBe('auto');
  });

  it('нормализация ЛС', () => {
    expect(lsKey('Астана Встреча')).toBe(lsKey('Астана-Встреча '));
    expect(lsKey('Тараз4')).toBe(lsKey('Тараз_4'));
  });
});
