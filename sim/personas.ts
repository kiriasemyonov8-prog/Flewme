// Десять человек от «без денег» до «очень богатого» со своими доходами, платежами и привычками.
// Суммы в рублях. День 0 — 23 октября 2026 (пятница).
import { demoAssistant } from '../src/ai/assistant';
import { dayOfMonth, monthOf, weekdayMon0, type ISODate } from '../src/core/dates';
import { formatRub } from '../src/core/format';
import { createGoal, addTransfer } from '../src/core/money-moves';
import { rub } from '../src/core/money';
import { addAccount, addOneOffIncome, addPayment, changePaymentAmount, emptyData, removeCategory, updateSettings, upsertRegularIncome } from '../src/core/profile';
import { evaluatePurchase, previewWithdrawal, savingsTotal, type PurchaseSource } from '../src/core/purchase';
import type { FinanceData, RegularIncome } from '../src/core/types';
import type { Api, Ctx, Persona } from './engine';

const dom = (d: ISODate) => dayOfMonth(d);
const wd = (d: ISODate) => weekdayMon0(d); // 0 — понедельник
const month = (d: ISODate) => monthOf(d);

function base(d0: ISODate, now: number, mainRub: number, f: (d: FinanceData) => FinanceData): FinanceData {
  let d = emptyData(d0);
  d = addAccount(d, 'main', rub(mainRub), d0, now, 'main');
  return f(d);
}

function regular(id: string, name: string, min: number, max: number, schedule: RegularIncome['schedule']): RegularIncome {
  return { id, name, min: rub(min), max: rub(max), schedule };
}

/** Проверка покупки — пишем вердикт в заметки. */
function checkPurchase(c: Ctx, api: Api, price: number, source: PurchaseSource, label: string) {
  const l = api.limit();
  if (l.status !== 'ok') return api.note(`событие: хотел проверить «${label}» — нет лимита, вывод сделать нельзя`);
  const res = evaluatePurchase(c.data, l, rub(price), source, c.date);
  api.note(
    `событие: покупка «${label}» ${price.toLocaleString('ru')} ₽ (${source.kind}) → ${res.verdict}, доступно ${formatRub(res.available)}` +
      (res.shortfall > 0 ? `, не хватает ${formatRub(res.shortfall)}` : '') +
      (res.readyDate ? `, к ${res.readyDate}` : ''),
  );
}

function ask(c: Ctx, api: Api, q: string) {
  const reply = demoAssistant.reply(q, { data: c.data, today: c.date, limit: api.limit() });
  api.note(`событие: чат «${q}» → ${reply.text.replace(/\s+/g, ' ').slice(0, 220)}`);
  if (reply.expense) {
    const e = reply.expense;
    api.update((d) => ({ ...d, expenses: [...d.expenses, { id: api.id(), ...e, createdAt: api.now() }] }));
  }
}

export const PERSONAS: Persona[] = [
  // 1 ————————————————————————————————————————————————
  {
    id: 'oleg',
    name: 'Олег, 34, без постоянной работы',
    about: 'Живёт у родственников, платежей нет. Подрабатывает разово. На счёте 3 200 ₽. Регулярного дохода нет.',
    seed: 11,
    trueMain: 3200,
    habits: { open: 0.6, record: 0.7, close: 0, balanceEvery: 0, confirm: 'same', marksPaid: false },
    setup: (d0, now) => base(d0, now, 3200, (d) => updateSettings(d, { savePercent: 30 })),
    incomes: (c) =>
      c.day === 6 ? [{ rubles: 2500, kind: 'oneoff', name: 'разгрузка' }] :
      c.day === 19 ? [{ rubles: 4000, kind: 'oneoff', name: 'ремонт у соседа' }] :
      c.day === 33 ? [{ rubles: 3000, kind: 'oneoff', name: 'курьер на день' }] : [],
    bills: () => [],
    spend: (c) => [{ rubles: c.r.between(150, 420), cat: 'food' }, ...(c.r.chance(0.15) ? [{ rubles: 250, cat: 'fun' }] : [])],
    events: (c, api) => {
      if (c.day === 2) ask(c, api, 'Сколько мне можно потратить сегодня?');
      if (c.day === 15) {
        api.update((d) => addOneOffIncome(d, { id: 'job19', name: 'ремонт у соседа', amount: rub(4000), date: '2026-11-11' }));
        api.note('событие: добавил ожидаемый разовый доход 4 000 ₽ на 11.11');
      }
      if (c.day === 25) ask(c, api, 'Почему у меня такой лимит?');
    },
  },
  // 2 ————————————————————————————————————————————————
  {
    id: 'dasha',
    name: 'Даша, 19, студентка',
    about: 'Стипендия 4 500 ₽ 25-го, родители присылают ~8 000 ₽ в начале месяца (нерегулярно). Телефон 600 ₽ 15-го. Импульсивные траты, записывает половину, неделю не открывает приложение.',
    seed: 22,
    trueMain: 6000,
    habits: { open: 0.55, record: 0.5, close: 0.2, balanceEvery: 10, confirm: 'same', marksPaid: false, away: [[10, 17]] },
    setup: (d0, now) =>
      base(d0, now, 6000, (d) => {
        d = upsertRegularIncome(d, regular('stip', 'Стипендия', 4500, 4500, { type: 'days', days: [25] }));
        d = addPayment(d, 'phone', 'Телефон', 15, rub(600), month(d0));
        return updateSettings(d, { transportMonthly: rub(1800) });
      }),
    incomes: (c) =>
      dom(c.date) === 25 ? [{ rubles: 4500, kind: 'regular', name: 'стипендия' }] :
      c.date === '2026-11-02' ? [{ rubles: 8000, kind: 'oneoff', name: 'от родителей' }] :
      c.date === '2026-12-04' ? [{ rubles: 6000, kind: 'oneoff', name: 'от родителей' }] : [],
    bills: (c) => (dom(c.date) === 15 ? [{ rubles: 600, name: 'телефон' }] : []),
    spend: (c) => {
      const out = [{ rubles: c.r.between(200, 550), cat: 'food' }];
      if (c.r.chance(0.25)) out.push({ rubles: c.r.between(600, 1200), cat: 'food' });
      if (c.r.chance(0.07)) out.push({ rubles: c.r.between(2000, 4500), cat: 'shopping' });
      if (dom(c.date) === 1) out.push({ rubles: 1800, cat: 'transport' }); // проездной на месяц
      return out;
    },
    events: (c, api) => {
      if (c.day === 20) {
        api.update((d) => updateSettings(d, { savePercent: 0 }));
        api.note('событие: выключила откладывание (не на что копить)');
      }
      if (c.day === 30) ask(c, api, 'Хватит ли мне до зарплаты?');
    },
  },
  // 3 ————————————————————————————————————————————————
  {
    id: 'galina',
    name: 'Галина Петровна, 71, пенсионерка',
    about: 'Пенсия 21 800 ₽ 5-го, коммуналка 5 200 ₽ 12-го, телефон 450 ₽ 20-го. Очень аккуратна: открывает каждый день, всё записывает, закрывает день. Копит на ремонт кухни (120 000 ₽ к маю), уже 40 000 ₽.',
    seed: 33,
    trueMain: 9000,
    trueOther: { 'acc-kitchen': 40000 },
    habits: { open: 1, record: 1, close: 1, balanceEvery: 14, confirm: 'same', marksPaid: true },
    setup: (d0, now) =>
      base(d0, now, 9000, (d) => {
        d = upsertRegularIncome(d, regular('pension', 'Пенсия', 21800, 21800, { type: 'days', days: [5] }));
        d = addPayment(d, 'utils', 'Коммуналка', 12, rub(5200), '2026-09');
        d = addPayment(d, 'phone', 'Телефон', 20, rub(450), '2026-09');
        d = updateSettings(d, { savePercent: 10 });
        return createGoal(d, { id: 'kitchen', name: 'Ремонт кухни', target: rub(120000), deadline: '2027-05-01' }, rub(40000), d0, now);
      }),
    incomes: (c) => (dom(c.date) === 5 ? [{ rubles: 21800, kind: 'regular', name: 'пенсия' }] : []),
    bills: (c) =>
      dom(c.date) === 12 ? [{ rubles: c.date >= '2026-12-01' ? 6100 : 5200, name: 'коммуналка' }] :
      dom(c.date) === 20 ? [{ rubles: 450, name: 'телефон' }] : [],
    spend: (c) => {
      const out = [{ rubles: c.r.between(280, 520), cat: 'food' }];
      if (wd(c.date) === 2) out.push({ rubles: c.r.between(900, 1400), cat: 'health' });
      return out;
    },
    events: (c, api) => {
      if (c.day === 13) {
        // после пенсии переводит отложенное на кухню
        const l = api.limit();
        if (l.status === 'ok' && l.setAside > 0) {
          const amount = Math.floor(l.setAside / 100);
          const to = c.data.goals[0].accountId;
          api.update((d) => addTransfer(d, 'main', to, rub(amount), 'setAside', c.date, api.id(), api.now()));
          api.moveTrue(true, amount);
          api.note(`событие: перевела ${amount} ₽ на «Ремонт кухни»`);
        }
      }
      if (c.day === 30) {
        api.update((d) => changePaymentAmount(d, 'utils', rub(6100), '2026-12'));
        api.note('событие: коммуналка с декабря 6 100 ₽');
      }
      if (c.day === 36) ask(c, api, 'Почему у меня такой лимит?');
    },
  },
  // 4 ————————————————————————————————————————————————
  {
    id: 'ruslan',
    name: 'Руслан, 27, курьер',
    about: 'Выплаты по понедельникам 14–26 тыс. ₽. В приложении можно указать только дни месяца, поэтому поставил 1, 8, 15, 22, 29. Комната 18 000 ₽ 1-го. Бензин ~700 ₽/день: в настройках транспорт 15 000 ₽ в месяц и ещё записывает заправки как траты.',
    seed: 44,
    trueMain: 11000,
    habits: { open: 0.85, record: 0.8, close: 0.5, balanceEvery: 7, confirm: 'same', marksPaid: false },
    setup: (d0, now) =>
      base(d0, now, 11000, (d) => {
        d = upsertRegularIncome(d, regular('pay', 'Выплата', 14000, 26000, { type: 'days', days: [1, 8, 15, 22, 29] }));
        d = addPayment(d, 'room', 'Комната', 1, rub(18000), '2026-09');
        return updateSettings(d, { transportMonthly: rub(15000) });
      }),
    incomes: (c) => (wd(c.date) === 0 ? [{ rubles: c.r.between(14000, 26000), kind: 'regular', name: 'выплата за неделю' }] : []),
    bills: (c) => (dom(c.date) === 1 ? [{ rubles: 18000, name: 'комната' }] : []),
    spend: (c) => [
      { rubles: c.r.between(600, 800), cat: 'transport' },
      { rubles: c.r.between(350, 700), cat: 'food' },
      ...(c.r.chance(0.2) ? [{ rubles: c.r.between(800, 2500), cat: 'fun' }] : []),
    ],
    events: (c, api) => {
      if (c.day === 22) {
        api.update((d) => {
          const res = removeCategory(d, 'fun');
          return typeof res === 'string' ? d : res;
        });
        api.note('событие: удалил категорию «Развлечения»');
      }
      if (c.day === 24) checkPurchase(c, api, 45000, { kind: 'main' }, 'новый телефон');
    },
  },
  // 5 ————————————————————————————————————————————————
  {
    id: 'anna',
    name: 'Анна, 29, офис',
    about: 'Как в демо: зарплата 120–150 тыс. ₽ с 10 по 20 число (пришла 14-го), квартира 40 000 ₽ 10-го, транспорт 4 000 ₽. По выходным не записывает, в понедельник дописывает часть. Копит на отпуск.',
    seed: 55,
    trueMain: 62000,
    trueOther: { 'acc-trip': 150000 },
    habits: { open: 0.9, record: 0.85, close: 0.7, balanceEvery: 12, confirm: 'same', marksPaid: true, lateRecord: 0.15 },
    setup: (d0, now) =>
      base(d0, now, 62000, (d) => {
        d = upsertRegularIncome(d, regular('salary', 'Зарплата', 120000, 150000, { type: 'window', fromDay: 10, toDay: 20 }));
        d = { ...d, receipts: [{ id: 'oct', occurrenceKey: 'salary:2026-10', amount: rub(135000), date: '2026-10-15', createdAt: 0 }] };
        d = addPayment(d, 'rent', 'Квартира', 10, rub(40000), '2026-09');
        d = updateSettings(d, { transportMonthly: rub(4000) });
        return createGoal(d, { id: 'trip', name: 'Отпуск', target: rub(200000), deadline: '2027-06-01' }, rub(150000), d0, now);
      }),
    incomes: (c) => (c.date === '2026-11-14' ? [{ rubles: 138000, kind: 'regular', name: 'зарплата' }] : []),
    bills: (c) => (dom(c.date) === 10 ? [{ rubles: 40000, name: 'квартира' }] : []),
    spend: (c) => {
      const weekend = wd(c.date) >= 5;
      return [
        { rubles: c.r.between(500, 1100), cat: 'food', record: weekend ? 0 : undefined },
        ...(c.r.chance(0.3) ? [{ rubles: c.r.between(1500, 3500), cat: weekend ? 'fun' : 'food', record: weekend ? 0 : undefined }] : []),
        ...(c.r.chance(0.08) ? [{ rubles: c.r.between(4000, 9000), cat: 'shopping' }] : []),
      ];
    },
    events: (c, api) => {
      if (c.day === 20) checkPurchase(c, api, 90000, { kind: 'main' }, 'ноутбук');
      if (c.day === 20) checkPurchase(c, api, 90000, { kind: 'all' }, 'ноутбук');
      if (c.day === 23) {
        const l = api.limit();
        if (l.status === 'ok' && l.setAside > 0) {
          const amount = Math.floor(l.setAside / 100);
          const to = c.data.goals[0].accountId;
          api.update((d) => addTransfer(d, 'main', to, rub(amount), 'setAside', c.date, api.id(), api.now()));
          api.moveTrue(true, amount);
          api.note(`событие: перевела отложенное ${amount} ₽ на «Отпуск»`);
        }
      }
      if (c.day === 25) {
        api.update((d) => updateSettings(d, { leftoverMode: 'account' }));
        api.note('событие: переключила остаток дня «на счёт»');
      }
    },
  },
  // 6 ————————————————————————————————————————————————
  {
    id: 'family',
    name: 'Семья Ивановых (двое взрослых, двое детей)',
    about: 'Муж 85 000 ₽ 5-го, жена 55 000 ₽ 20-го. Ипотека 52 000 ₽ 1-го, детсад 9 000 ₽ 10-го, коммуналка 8 500 ₽ 15-го, транспорт 6 000 ₽. Пользуются вдвоём с одного телефона: иногда оба записывают одну трату. Остаток дня «на счёт». 4 ноября ремонт стиральной машины 25 000 ₽.',
    seed: 66,
    trueMain: 48000,
    trueOther: { 'acc-sea': 30000 },
    habits: { open: 0.95, record: 0.9, close: 0.6, balanceEvery: 0, confirm: 'balanceThenConfirm', marksPaid: false, duplicate: 0.05 },
    setup: (d0, now) =>
      base(d0, now, 48000, (d) => {
        d = upsertRegularIncome(d, regular('husband', 'Зарплата мужа', 85000, 85000, { type: 'days', days: [5] }));
        d = upsertRegularIncome(d, regular('wife', 'Зарплата жены', 55000, 55000, { type: 'days', days: [20] }));
        d = { ...d, receipts: [{ id: 'w-oct', occurrenceKey: 'wife:2026-10:20', amount: rub(55000), date: '2026-10-20', createdAt: 0 }] };
        d = addPayment(d, 'mortgage', 'Ипотека', 1, rub(52000), '2026-09');
        d = addPayment(d, 'kg', 'Детсад', 10, rub(9000), '2026-09');
        d = addPayment(d, 'utils', 'Коммуналка', 15, rub(8500), '2026-09');
        d = updateSettings(d, { transportMonthly: rub(6000), leftoverMode: 'account' });
        return createGoal(d, { id: 'sea', name: 'Море', target: rub(180000), deadline: '2027-07-01' }, rub(30000), d0, now);
      }),
    incomes: (c) =>
      dom(c.date) === 5 ? [{ rubles: 85000, kind: 'regular', name: 'зарплата мужа' }] :
      dom(c.date) === 20 ? [{ rubles: 55000, kind: 'regular', name: 'зарплата жены' }] : [],
    bills: (c) =>
      dom(c.date) === 1 ? [{ rubles: 52000, name: 'ипотека' }] :
      dom(c.date) === 10 ? [{ rubles: 9000, name: 'детсад' }] :
      dom(c.date) === 15 ? [{ rubles: 8500, name: 'коммуналка' }] : [],
    spend: (c) => [
      { rubles: c.r.between(1800, 3800), cat: 'food' },
      ...(c.r.chance(0.3) ? [{ rubles: c.r.between(800, 3000), cat: 'shopping' }] : []),
      ...(c.date === '2026-11-04' ? [{ rubles: 25000, cat: 'home' }] : []),
    ],
    events: (c, api) => {
      if (c.day === 18) ask(c, api, 'Почему у меня такой лимит?');
    },
  },
  // 7 ————————————————————————————————————————————————
  {
    id: 'mark',
    name: 'Марк, 31, фрилансер-дизайнер',
    about: 'Регулярного дохода нет. Ждёт оплату 95 000 ₽ от заказчика к 3 ноября (вписал как ожидаемый разовый доход), а она приходит 5 ноября; второй заказ 60 000 ₽ — 30 ноября. Аренда 35 000 ₽ 25-го. Накопления 320 000 ₽. Когда денег нет, берёт из накоплений.',
    seed: 77,
    trueMain: 18000,
    trueOther: { savings: 320000 },
    habits: { open: 0.7, record: 0.6, close: 0.1, balanceEvery: 9, confirm: 'same', marksPaid: false },
    setup: (d0, now) =>
      base(d0, now, 18000, (d) => {
        d = addAccount(d, 'savings', rub(320000), d0, now, 'savings', 'Подушка');
        d = addOneOffIncome(d, { id: 'proj1', name: 'Оплата за сайт', amount: rub(95000), date: '2026-11-03' });
        d = addPayment(d, 'rent', 'Аренда', 25, rub(35000), '2026-09');
        return updateSettings(d, { savePercent: 20 });
      }),
    incomes: (c) =>
      c.date === '2026-11-05' ? [{ rubles: 95000, kind: 'oneoff', name: 'Оплата за сайт' }] :
      c.date === '2026-11-30' ? [{ rubles: 60000, kind: 'oneoff', name: 'Оплата за логотип' }] : [],
    bills: (c) => (dom(c.date) === 25 ? [{ rubles: 35000, name: 'аренда' }] : []),
    spend: (c) => [
      { rubles: c.r.between(600, 1500), cat: 'food' },
      ...(c.r.chance(0.2) ? [{ rubles: c.r.between(1000, 4000), cat: 'fun' }] : []),
    ],
    events: (c, api) => {
      if (c.day === 8) {
        const l = api.limit();
        if (l.status === 'ok') {
          const goal = c.data.goals[0];
          api.note(`событие: «Взять из накоплений» 40 000 ₽, накоплений ${formatRub(savingsTotal(c.data, c.date))}` + (goal ? `, превью ${JSON.stringify(previewWithdrawal(c.data, l, goal, rub(40000), c.date))}` : ''));
        } else api.note('событие: хотел «Взять из накоплений», но лимита нет');
        api.update((d) => addTransfer(d, 'savings', 'main', rub(40000), 'withdraw', c.date, api.id(), api.now()));
        api.moveTrue(false, 40000);
      }
      if (c.day === 14) ask(c, api, 'Сколько мне можно потратить сегодня?');
      if (c.day === 31) {
        api.update((d) => addOneOffIncome(d, { id: 'proj2', name: 'Оплата за логотип', amount: rub(60000), date: '2026-11-30' }));
        api.note('событие: вписал ожидаемый разовый доход 60 000 ₽ на 30.11 (уже в прошлом)');
      }
    },
  },
  // 8 ————————————————————————————————————————————————
  {
    id: 'sveta',
    name: 'Светлана, 41, в кредитах',
    about: 'Зарплата 48 000 ₽ 10-го. Кредиты: 21 000 ₽ 12-го и 9 500 ₽ 18-го, минимальный по карте 6 000 ₽ 25-го, коммуналка 4 500 ₽ 15-го, транспорт 2 500 ₽. Хочет холодильник за 35 000 ₽.',
    seed: 88,
    trueMain: 14000,
    habits: { open: 0.9, record: 0.9, close: 0.5, balanceEvery: 6, confirm: 'same', marksPaid: false },
    setup: (d0, now) =>
      base(d0, now, 14000, (d) => {
        d = upsertRegularIncome(d, regular('salary', 'Зарплата', 48000, 48000, { type: 'days', days: [10] }));
        d = addPayment(d, 'loan1', 'Кредит', 12, rub(21000), '2026-09');
        d = addPayment(d, 'loan2', 'Кредит 2', 18, rub(9500), '2026-09');
        d = addPayment(d, 'card', 'Кредитка', 25, rub(6000), '2026-09');
        d = addPayment(d, 'utils', 'Коммуналка', 15, rub(4500), '2026-09');
        return updateSettings(d, { transportMonthly: rub(2500) });
      }),
    incomes: (c) => (dom(c.date) === 10 ? [{ rubles: 48000, kind: 'regular', name: 'зарплата' }] : []),
    bills: (c) =>
      dom(c.date) === 12 ? [{ rubles: 21000, name: 'кредит' }] :
      dom(c.date) === 18 ? [{ rubles: 9500, name: 'кредит 2' }] :
      dom(c.date) === 25 ? [{ rubles: 6000, name: 'кредитка' }] :
      dom(c.date) === 15 ? [{ rubles: 4500, name: 'коммуналка' }] : [],
    spend: (c) => [{ rubles: c.r.between(250, 600), cat: 'food' }, ...(c.r.chance(0.1) ? [{ rubles: c.r.between(700, 1500), cat: 'health' }] : [])],
    events: (c, api) => {
      if (c.day === 3) ask(c, api, 'Почему у меня такой лимит?');
      if (c.day === 21) checkPurchase(c, api, 35000, { kind: 'main' }, 'холодильник');
    },
  },
  // 9 ————————————————————————————————————————————————
  {
    id: 'igor',
    name: 'Игорь, 45, руководитель',
    about: 'Зарплата 210 000 ₽ 10-го и 25-го. Ипотека 95 000 ₽ 3-го, няня 60 000 ₽ 1-го, транспорт 12 000 ₽. Тратит 8–15 тыс. ₽ в день, записывает 40 %, дни не закрывает, но остаток обновляет каждые 3 дня. Накопления 2,4 млн, брокерский счёт 1,1 млн. Цели: машина 4,5 млн без срока, дом 15 млн к 2029. Остаток дня «на счёт».',
    seed: 99,
    trueMain: 380000,
    trueOther: { 'acc-car': 2400000, broker: 1100000 },
    habits: { open: 0.8, record: 0.4, close: 0, balanceEvery: 3, confirm: 'same', marksPaid: true },
    setup: (d0, now) =>
      base(d0, now, 380000, (d) => {
        d = upsertRegularIncome(d, regular('salary', 'Зарплата', 210000, 210000, { type: 'days', days: [10, 25] }));
        d = addAccount(d, 'other', rub(1100000), d0, now, 'broker', 'Брокерский');
        d = addPayment(d, 'mortgage', 'Ипотека', 3, rub(95000), '2026-09');
        d = addPayment(d, 'nanny', 'Няня', 1, rub(60000), '2026-09');
        d = updateSettings(d, { transportMonthly: rub(12000), leftoverMode: 'account' });
        d = createGoal(d, { id: 'car', name: 'Машина', target: rub(4500000) }, rub(2400000), d0, now);
        return createGoal(d, { id: 'house', name: 'Дом', target: rub(15000000), deadline: '2029-06-01' }, rub(0), d0, now);
      }),
    incomes: (c) => (dom(c.date) === 10 || dom(c.date) === 25 ? [{ rubles: 210000, kind: 'regular', name: 'зарплата' }] : []),
    bills: (c) =>
      dom(c.date) === 3 ? [{ rubles: 95000, name: 'ипотека' }] : dom(c.date) === 1 ? [{ rubles: 60000, name: 'няня' }] : [],
    spend: (c) => [
      { rubles: c.r.between(3000, 7000), cat: 'food' },
      { rubles: c.r.between(2000, 9000), cat: c.r.chance(0.5) ? 'fun' : 'shopping' },
    ],
    events: (c, api) => {
      if (c.day === 5) checkPurchase(c, api, 160000, { kind: 'main' }, 'iPhone');
      if (c.day === 5) checkPurchase(c, api, 4500000, { kind: 'all' }, 'машина');
      if (c.day === 12) ask(c, api, 'Как накопить на покупку?');
    },
  },
  // 10 ————————————————————————————————————————————————
  {
    id: 'vika',
    name: 'Виктория, 38, предприниматель',
    about: 'Доход нерегулярный: дивиденды 1,8 млн ₽ 1 ноября и 600 тыс. ₽ 22 ноября. Ожидаемые доходы в приложение не вносит. Тратит 30–80 тыс. ₽ в день, записывает 20 %, откладывание 50 %. Пользуется в основном чатом.',
    seed: 1010,
    trueMain: 2500000,
    habits: { open: 0.5, record: 0.2, close: 0, balanceEvery: 15, confirm: 'same', marksPaid: false },
    setup: (d0, now) =>
      base(d0, now, 2500000, (d) => {
        d = addAccount(d, 'savings', rub(5000000), d0, now, 'savings', 'Резерв');
        return updateSettings(d, { savePercent: 50 });
      }),
    incomes: (c) =>
      c.date === '2026-11-01' ? [{ rubles: 1800000, kind: 'oneoff', name: 'дивиденды' }] :
      c.date === '2026-11-22' ? [{ rubles: 600000, kind: 'oneoff', name: 'дивиденды' }] : [],
    bills: () => [],
    spend: (c) => [{ rubles: c.r.between(30000, 80000), cat: c.r.chance(0.5) ? 'shopping' : 'fun' }],
    events: (c, api) => {
      if (c.day === 1) ask(c, api, 'Сколько мне можно потратить сегодня?');
      if (c.day === 10) ask(c, api, 'Хватит ли на покупку за 3 000 000 ₽?');
      if (c.day === 11) ask(c, api, 'запиши 52 000 на ресторан');
    },
  },
];
