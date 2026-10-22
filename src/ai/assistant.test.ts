import { describe, expect, it } from 'vitest';
import { demoData } from '../core/demo';
import { computeLimit } from '../core/limit';
import { rub } from '../core/money';
import { emptyData } from '../core/profile';
import { demoAssistant, parseAmount, type AssistantContext } from './assistant';

const T = '2026-10-21';

function ctx(data = demoData(T, 1000)): AssistantContext {
  return { data, today: T, limit: computeLimit(data, T) };
}

const ask = (q: string, c = ctx()) => demoAssistant.reply(q, c);
const plain = (s: string) => s.replace(/[  ]/g, ' ');

describe('суммы из текста', () => {
  it.each([
    ['запиши 750', rub(750)],
    ['1 200 на такси', rub(1_200)],
    ['кофе 350,50', rub(350) + 50],
    ['хватит ли на 90 тыс', rub(90_000)],
    ['телефон за 2к', rub(2_000)],
    ['без суммы', null],
  ])('%s', (text, value) => {
    expect(parseAmount(text)).toBe(value);
  });
});

describe('демо-ассистент', () => {
  it('сколько можно сегодня', () => {
    expect(plain(ask('Сколько мне можно потратить сегодня?').text)).toContain('Сегодня можно 1 050 ₽');
  });

  it('объясняет лимит по шагам, и числа сходятся', () => {
    const t = plain(ask('Почему у меня такой лимит?').text);
    for (const s of ['100 000 ₽', '40 000 ₽ — квартира', '15 000 ₽ — транспорт', '13 500 ₽ — отложить', '31 500 ₽', '30 дн.', '1 050 ₽ в день']) {
      expect(t).toContain(s);
    }
  });

  it('записывает трату и угадывает категорию', () => {
    const r = ask('Запиши расход 750 ₽ на кофе');
    expect(r.expense).toMatchObject({ amount: rub(750), categoryId: 'food', accountId: 'main', date: T });
    expect(plain(r.text)).toContain('осталось 300 ₽');
  });

  it('объясняет нехватку на покупку со всех счетов', () => {
    const t = plain(ask('Почему мне не хватает на 200 000 со всех счетов?').text);
    expect(t).toContain('не хватает 68 500 ₽');
    expect(t).toContain('+ 31 500 ₽ — свободно на основном счёте');
    expect(t).toContain('+ 100 000 ₽ — накопления');
    expect(t).toContain('= 131 500 ₽ — доступно');
  });

  it('до зарплаты', () => {
    expect(plain(ask('Хватит ли мне до зарплаты?').text)).toContain('свободно 31 500 ₽');
  });

  it('без данных честно просит недостающее', () => {
    expect(ask('Какой у меня лимит?', ctx(emptyData(T))).text).toContain('профиле');
  });

  it('вне заготовок — честный ответ без придуманных чисел', () => {
    const t = ask('Какая погода завтра?').text;
    expect(t).toContain('типовые вопросы');
    expect(t).not.toMatch(/₽\s*—/);
  });
});
