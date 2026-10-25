// Импорт выписки банка (SPEC 3.30). Данные вымышленные: настоящая выписка в репозиторий не попадает.
import { describe, expect, it } from 'vitest';
import {
  applyImport,
  classifyOp,
  decodeBankFile,
  merchantKey,
  parseBankAmount,
  parseBankCsv,
  planImport,
  recipientKey,
  type BankOp,
  type ImportDecisions,
} from './bankImport';
import { currentBalance, spentTodayMain } from './balance';
import { demoData } from './demo';
import { computeLimit } from './limit';
import { monthExpenses } from './overview';
import { rub, type Kopecks } from './money';
import type { FinanceData } from './types';

const T = '2026-10-25';

const CSV = [
  '"Дата операции";"Дата платежа";"Номер карты";"Статус";"Сумма операции";"Валюта операции";"Сумма платежа";"Валюта платежа";"Кэшбэк";"Категория";"MCC";"Описание"',
  '"24.10.2026 20:07:00";"24.10.2026";"*1111";"OK";"-729,18";"RUB";"-729,18";"RUB";"";"Супермаркеты";"5411";"MAGNOLIYA"',
  '"24.10.2026 13:18:00";"24.10.2026";"*1111";"OK";"-500,00";"RUB";"-500,00";"RUB";"";"";"";"Оплата в LUNCHBOX MOSCOW RUS"',
  '"24.10.2026 10:32:00";"24.10.2026";"*1111";"OK";"-45,16";"RUB";"-45,16";"RUB";"";"";"";"Оплата в WHOOSH MOSKVA RUS"',
  '"23.10.2026 12:00:00";"23.10.2026";"*1111";"FAILED";"-9999,00";"RUB";"-9999,00";"RUB";"";"";"";"Оплата в OZON Moskva RUS"',
  '"23.10.2026 11:00:00";"23.10.2026";"*1111";"OK";"-1 300,00";"RUB";"-1 300,00";"RUB";"";"Переводы";"";"Внешний перевод по номеру телефона +79990001122"',
  '"22.10.2026 14:31:00";"22.10.2026";"*1111";"OK";"-15 000,00";"RUB";"-15 000,00";"RUB";"";"";"";"Пополнение брокерского счета"',
  '"22.10.2026 14:30:00";"22.10.2026";"*1111";"OK";"+16 500,00";"RUB";"+16 500,00";"RUB";"";"";"";"Внесение наличных через банкомат"',
  '"21.10.2026 13:38:00";"21.10.2026";"*1111";"OK";"-139,00";"RUB";"-139,00";"RUB";"";"";"";"Оплата в ЦППК2000006_SBP"',
  '"21.10.2026 13:39:00";"21.10.2026";"*1111";"OK";"+139,00";"RUB";"+139,00";"RUB";"";"";"";"Возврат покупки через СБП. Возврат покупки"',
  '"20.10.2026 15:00:00";"20.10.2026";"*1111";"OK";"-387,00";"RUB";"-387,00";"RUB";"";"";"";"Оплата в BAR NEIZVESTNY MOSCOW RUS"',
  '"20.10.2026 10:00:00";"20.10.2026";"*1111";"OK";"+13,90";"RUB";"+13,90";"RUB";"";"";"";"Кэшбэк по программе лояльности"',
].join('\n');

const NONE: ImportDecisions = { merchantCategories: {}, transfersAsExpense: {}, savingsAsTransfer: false, confirmedIncomes: [] };

function ids() {
  let n = 0;
  return () => `id${n++}`;
}

function demo(): FinanceData {
  return { ...demoData(T, 1000), expenses: [] };
}

function ops(): BankOp[] {
  const r = parseBankCsv(CSV);
  if (r === 'unknownFormat') throw new Error('не прочитано');
  return r;
}

describe('чтение выписки', () => {
  it('суммы — в копейках, с пробелами и запятой', () => {
    expect(parseBankAmount('-1 694,92')).toBe(-169492);
    expect(parseBankAmount('+13.9')).toBe(1390);
    expect(parseBankAmount('abc')).toBeNull();
  });

  it('CSV Т-Банка: колонки по названиям, неуспешные операции пропускаются', () => {
    const o = ops();
    expect(o).toHaveLength(10);
    expect(o[0]).toMatchObject({ date: '2026-10-24', time: '20:07', amount: -72918, bankCategory: 'Супермаркеты', mcc: '5411' });
  });

  it('незнакомый файл — понятная ошибка', () => {
    expect(parseBankCsv('a;b;c\n1;2;3')).toBe('unknownFormat');
  });

  it('кодировка Windows-1251 тоже читается', () => {
    const bytes = new Uint8Array([0xc4, 0xe0, 0xf2, 0xe0]); // «Дата» в Windows-1251
    expect(decodeBankFile(bytes.buffer)).toBe('Дата');
  });
});

describe('что это за операция', () => {
  it('название магазина без «Оплата в» и города', () => {
    expect(merchantKey('Оплата в MAGNOLIYA MOSCOW RUS')).toBe('MAGNOLIYA');
    expect(merchantKey('Оплата в YANDEX*7512*DRIVE g. Moskva RUS')).toBe('YANDEX DRIVE');
    expect(merchantKey('Оплата в Vkusnoitochka_11002 MOSCOW RUS')).toBe('VKUSNOITOCHKA');
  });

  it('переводы, накопления, поступления, возвраты', () => {
    const op = (description: string, amount = -10000): BankOp => ({ date: T, time: '', amount: amount as Kopecks, description });
    expect(classifyOp(op('Внешний перевод по номеру телефона +79990001122'))).toBe('transferOut');
    expect(classifyOp(op('Внутренний перевод на договор 123'))).toBe('transferOut');
    expect(classifyOp(op('Пополнение Инвесткопилки'))).toBe('savings');
    expect(classifyOp(op('Плата за оповещения об операциях'))).toBe('service');
    expect(classifyOp(op('Банковский перевод', 10000))).toBe('inflow');
    expect(classifyOp(op('Возврат средств по оплате WHOOSH', 10000))).toBe('refund');
    expect(classifyOp(op('Оплата в OZON Moskva RUS'))).toBe('purchase');
    expect(recipientKey('Внешний перевод по номеру телефона +79990001122')).toBe('тел. …1122');
  });
});

describe('план и загрузка', () => {
  it('покупки с категориями, возврат погашает покупку, незнакомый магазин — вопрос', () => {
    const plan = planImport(demo(), ops(), 'main');
    const cats = Object.fromEntries(plan.purchases.map((p) => [p.merchant, p.categoryId]));
    expect(cats).toEqual({ 'BAR NEIZVESTNY': null, WHOOSH: 'transport', LUNCHBOX: 'food', MAGNOLIYA: 'food' });
    expect(plan.refundsApplied).toBe(1); // электричка 139 − возврат 139 — покупки нет
    expect(plan.unknownMerchants.map((u) => u.merchant)).toEqual(['BAR NEIZVESTNY']);
    expect(plan.movements.map((m) => m.kind).sort()).toEqual(['inflow', 'inflow', 'savings', 'transferOut']);
  });

  it('переводы — не траты; ответ про магазин запоминается', () => {
    const d = demo();
    const r = applyImport(d, planImport(d, ops(), 'main'), { ...NONE, merchantCategories: { 'BAR NEIZVESTNY': 'fun' } }, 'main', 5000, ids());
    // траты: 729,18 + 500 + 45,16 + 387 = 1 661,34
    expect(r.addedExpenses).toBe(4);
    expect(monthExpenses(r.data, '2026-10').total).toBe(rub(1_661) + 34);
    // Остаток демо записан сегодня — операции раньше него уже в нём и второй раз не вычитаются.
    expect(currentBalance(r.data.accounts[0], r.data, T)).toBe(rub(100_000));
    expect(r.data.importRules?.merchants['BAR NEIZVESTNY']).toBe('fun');
  });

  it('после записи остатка переводы меняют сумму на счёте, но не траты дня', () => {
    const d = demo();
    d.accounts[0] = { ...d.accounts[0], asOf: '2026-10-19', asOfTs: 1 };
    // без резерва на транспорт: иначе самокат покрывается резервом и в сумму на счёте не идёт (3.25)
    d.settings.transportMonthly = 0 as Kopecks;
    const r = applyImport(d, planImport(d, ops(), 'main'), NONE, 'main', 5000, ids());
    const before = currentBalance(d.accounts[0], d, T);
    const after = currentBalance(r.data.accounts[0], r.data, T);
    // −1 661,34 трат; движения: −1 300 − 15 000 + 16 500 + 13,90 = +213,90
    expect(after - before).toBe(-(rub(1_661) + 34) + rub(213) + 90);
    expect(spentTodayMain(r.data, '2026-10-23')).toBe(0); // в день перевода трат нет
  });

  it('брокерский счёт как перевод в накопления — откладывание', () => {
    const d = demo();
    const r = applyImport(d, planImport(d, ops(), 'main'), { ...NONE, savingsAsTransfer: true }, 'main', 5000, ids());
    expect(r.data.transfers.at(-1)).toMatchObject({ purpose: 'setAside', amount: rub(15_000) });
    expect(r.data.importRules?.savingsAsTransfer).toBe(true);
    expect(computeLimit(r.data, T).status).toBe('ok');
  });

  it('перевод, отмеченный тратой, запоминает получателя', () => {
    const d = demo();
    const plan = planImport(d, ops(), 'main');
    const t = plan.movements.find((m) => m.kind === 'transferOut')!;
    const r = applyImport(d, plan, { ...NONE, transfersAsExpense: { [t.key]: 'home' } }, 'main', 5000, ids());
    expect(r.data.expenses.some((x) => x.categoryId === 'home' && x.amount === rub(1_300))).toBe(true);
    expect(r.data.importRules?.recipients['тел. …1122']).toBe('home');
  });

  it('повторная загрузка ничего не удваивает; ручные траты не дублируются', () => {
    const d = demo();
    d.expenses.push({ id: 'm1', amount: rub(500), accountId: 'main', categoryId: 'food', date: '2026-10-24', createdAt: 1 });
    const plan = planImport(d, ops(), 'main');
    expect(plan.purchases.find((p) => p.merchant === 'LUNCHBOX')?.duplicateOf).toBe('m1');
    const r = applyImport(d, plan, NONE, 'main', 5000, ids());
    expect(r.duplicates).toBe(1);
    const again = planImport(r.data, ops(), 'main');
    expect(again.purchases).toHaveLength(0);
    expect(again.movements).toHaveLength(0);
    // 8 из 10: покупка 139 ₽ и её возврат взаимно погашены и не записываются — им нечего удваивать
    expect(again.alreadyImported).toBe(8);
  });

  it('поступление, похожее на зарплату, предлагается как «Пришла»', () => {
    const salary: BankOp[] = [{ date: '2026-11-14', time: '10:00', amount: rub(130_000), description: 'Банковский перевод. ООО Работа' }];
    expect(planImport(demo(), salary, 'main').incomes[0]?.income.key).toBe('salary:2026-11');
  });
});

// Операции в стиле выписки Сбера (вымышленные): категория банка отдельно, хвост «Операция по карте».
describe('операции в стиле Сбера', () => {
  const op = (bankCategory: string, description: string, amount: number): BankOp => ({
    date: T,
    time: '12:00',
    amount: amount as Kopecks,
    description: `${description}. Операция по карте ****0000`,
    bankCategory,
  });

  it('оплата Wildberries и Ozon «переводом СБП» — это покупка', () => {
    expect(classifyOp(op('Перевод СБП', 'Wildberries (Вайлдберриз Банк)', -53000))).toBe('purchase');
    expect(classifyOp(op('Перевод СБП', 'Озон Банк (Ozon)', -10000))).toBe('purchase');
  });

  it('переводы на карту другого банка и между своими счетами — не траты', () => {
    expect(classifyOp(op('Прочие операции', 'ВТБ', -280000))).toBe('transferOut');
    expect(classifyOp(op('Перевод СБП', 'Т-Банк', -300000))).toBe('transferOut');
    expect(classifyOp(op('Перевод с карты', 'SBOL', -50000))).toBe('transferOut');
    expect(classifyOp(op('Прочие операции', 'SBERBANK ONL@IN KARTA-VKLAD', -8400000))).toBe('savings');
    expect(classifyOp(op('Прочие операции', 'SBERBANK ONL@IN VKLAD-KARTA', 300000))).toBe('inflow');
  });

  it('возврат по QR-коду узнаётся по категории банка и гасит покупку', () => {
    const buy = op('Оплата по QR–коду СБП', 'Озон', -208300);
    const back = { ...op('Возврат покупки по QR–коду СБП', 'Озон', 208300), time: '23:51' };
    expect(classifyOp(back)).toBe('refund');
    const plan = planImport(demo(), [buy, back], 'main');
    expect(plan.purchases).toHaveLength(0);
    expect(plan.refundsApplied).toBe(1);
  });

  it('название магазина без города и «Операция по карте»', () => {
    expect(merchantKey('PYATEROCHKA 32417 CHEREPOVECZ RUS. Операция по карте ****0000')).toBe('PYATEROCHKA');
    expect(merchantKey('SBSCR_Магнит Супермаркет Омни. Операция по карте ****0000')).toBe('МАГНИТ СУПЕРМАРКЕТ');
    expect(merchantKey('OOO RANDEVU PLYUS CHEREPOVECZ RUS')).toBe('RANDEVU PLYUS');
  });

  it('категории: из категории банка, а при «Прочие расходы» — по названию', () => {
    const plan = planImport(
      demo(),
      [
        op('Супермаркеты', 'OOO RANDEVU PLYUS CHEREPOVECZ RUS', -53695),
        op('Транспорт', 'CHEREPOVEC TPP VOLOGDA RUS', -4000),
        op('Прочие расходы', 'YANDEX*4121*GO MOSCOW RUS', -55500),
        op('Оплата по QR–коду СБП', 'SBSCR_Магнит Супермаркет Омни', -82996),
        op('Все для дома', 'POL MARKET.. CHEREPOVECZ RUS', -278600),
      ],
      'main',
    );
    expect(plan.purchases.map((p) => p.categoryId)).toEqual(['food', 'transport', 'transport', 'food', 'home']);
  });
});
