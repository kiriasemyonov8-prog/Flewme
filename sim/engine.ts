// Симулятор пользования Флюми: реальная жизнь человека и то, что он вносит в приложение.
// Приложение знает только внесённое, поэтому сравнение «реальность ↔ приложение» показывает,
// где расчёт ошибается и где поведение человека ломает логику.
// Используется только расчётное ядро (src/core) — так же, как его использует интерфейс.
import {
  addExpense,
  addReceivedOneOff,
  closeDayAction,
  confirmIncome,
  delayIncome,
  incomePrompt,
  incomesToConfirm,
  matchingOneOff,
  mayBeInBalance,
  confirmPaymentPaid,
  paymentQuestion,
  recentDuplicate,
  setAsideReminderDue,
  transferSetAside,
} from '../src/core/actions';
import { currentBalance, spentTodayMain } from '../src/core/balance';
import { addDays, diffDays, type ISODate } from '../src/core/dates';
import { closedStreak, isBalanceStale, unclosedDays } from '../src/core/days';
import { computeLimit, remainingToday, type LimitResult } from '../src/core/limit';
import { kop, rub, type Kopecks } from '../src/core/money';
import { robotMood } from '../src/core/mood';
import { dataPayments } from '../src/core/schedule';
import { setAccountBalance } from '../src/core/profile';
import type { FinanceData } from '../src/core/types';

/** Повторяемый «случай»: одинаковый результат при каждом прогоне. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    chance: (p: number) => next() < p,
    between: (min: number, max: number) => Math.round(min + (max - min) * next()),
  };
}
export type Rng = ReturnType<typeof rng>;

export interface Spend {
  rubles: number;
  cat: string;
  /** Вероятность, что человек запишет эту трату (по умолчанию — привычка персонажа). */
  record?: number;
  /** С какого счёта (по умолчанию основной). */
  account?: string;
}

export interface Income {
  rubles: number;
  /** regular — подтверждает «Пришла»; oneoff — записывает как разовый доход. */
  kind: 'regular' | 'oneoff';
  name: string;
}

export interface Habits {
  /** Вероятность открыть приложение в день. */
  open: number;
  /** Вероятность записать трату. */
  record: number;
  /** Вероятность закрыть день вечером (если открывал). */
  close: number;
  /** Как часто обновляет остаток основного счёта (дней), 0 — никогда. */
  balanceEvery: number;
  /** Как подтверждает доход: сразу / через несколько дней / никогда / сначала обновляет остаток, потом жмёт «Пришла». */
  confirm: 'same' | 'late' | 'never' | 'balanceThenConfirm';
  /** При обновлении остатка в день платежа отмечает, что платёж уже списан. */
  marksPaid: boolean;
  /** Дни (номер дня от начала), когда человек вообще не открывает приложение. */
  away?: [number, number][];
  /** Иногда записывает трату вечером или на следующий день (а не сразу). */
  lateRecord?: number;
  /** Иногда записывает одну и ту же трату дважды (например, вдвоём с одного аккаунта). */
  duplicate?: number;
  /** По напоминанию переводит отложенное в накопления (3.26, п. 21); иначе жмёт «Позже». */
  transfersSetAside?: boolean;
}

export interface Ctx {
  day: number;
  date: ISODate;
  r: Rng;
  data: FinanceData;
  trueMain: Kopecks;
}

export interface Persona {
  id: string;
  name: string;
  about: string;
  seed: number;
  habits: Habits;
  trueMain: number;
  /** Реальные деньги на остальных счетах (по id счёта). */
  trueOther?: Record<string, number>;
  setup: (d0: ISODate, now: number) => FinanceData;
  /** Реальные поступления в этот день. */
  incomes: (c: Ctx) => Income[];
  /** Реальные обязательные платежи в этот день (с основного счёта). */
  bills: (c: Ctx) => { rubles: number; name: string }[];
  /** Реальные траты в этот день. */
  spend: (c: Ctx) => Spend[];
  /** Особые действия в приложении (покупки, переводы, настройки, вопросы Флюми). */
  events?: (c: Ctx, api: Api) => void;
}

export interface Api {
  note: (text: string) => void;
  update: (fn: (d: FinanceData) => FinanceData) => void;
  limit: () => LimitResult;
  /** Реальный перевод между своими счетами (деньги двигаются и в жизни). */
  moveTrue: (fromMain: boolean, rubles: number) => void;
  now: () => number;
  id: () => string;
}

export interface DayRow {
  day: number;
  date: ISODate;
  opened: boolean;
  limit: string;
  free: string;
  horizon: string;
  realSpent: number;
  recSpent: number;
  mood: string;
  trueMain: number;
  appMain: number;
  diff: number;
  closed: boolean;
  notes: string[];
}

export interface Flag {
  day: number;
  date: ISODate;
  kind: string;
  text: string;
}

const R = (k: number) => Math.round(k / 100);

export function simulate(p: Persona, d0: ISODate, days: number) {
  const r = rng(p.seed);
  let seq = 0;
  const ts = (day: number, hour: number) => (day * 24 + hour) * 3_600_000 + seq++;
  let data = p.setup(d0, ts(0, 7));
  let trueMain = rub(p.trueMain);
  const trueOther: Record<string, number> = { ...(p.trueOther ?? {}) };
  const rows: DayRow[] = [];
  const flags: Flag[] = [];
  const flag = (day: number, date: ISODate, kind: string, text: string) => flags.push({ day, date, kind, text });
  const pendingIncomes: { date: ISODate; inc: Income }[] = [];
  const lateExpenses: { date: ISODate; amount: Kopecks; cat: string }[] = [];
  let lastBalanceUpdate = 0;
  let prevLimit: number | null = null;
  let prevHorizon: string | null = null;

  const persist = (res: LimitResult) => {
    if (res.status !== 'ok') return;
    data = { ...data, savePlan: res.savePlan, fixedLimit: res.fixedLimit ?? data.fixedLimit, lastLimit: res.lastLimit };
  };
  // Реальные траты с основного счёта по дням: по ним человек честно отвечает «ничего не тратили?».
  const realByDay = new Map<ISODate, number>();
  // День, когда остаток записан уже с пришедшими деньгами (для вопроса «уже в остатке?»).
  let balanceDay: ISODate | null = null;

  for (let day = 0; day < days; day++) {
    const date = addDays(d0, day);
    const notes: string[] = [];
    const away = p.habits.away?.some(([a, b]) => day >= a && day <= b) ?? false;
    const opened = !away && (day === 0 || r.chance(p.habits.open));
    const ctx = (): Ctx => ({ day, date, r, data, trueMain });

    // ——— Утро: реальные поступления и платежи ———
    for (const inc of p.incomes(ctx())) {
      trueMain = kop(trueMain + rub(inc.rubles));
      pendingIncomes.push({ date, inc });
      notes.push(`пришло ${inc.name} ${inc.rubles.toLocaleString('ru')}`);
    }
    for (const bill of p.bills(ctx())) {
      if (trueMain < rub(bill.rubles)) {
        flag(day, date, 'Не хватило на платёж', `${bill.name} ${bill.rubles.toLocaleString('ru')} ₽: на счёте было только ${R(trueMain).toLocaleString('ru')} ₽`);
      }
      trueMain = kop(trueMain - rub(bill.rubles));
    }

    // ——— Открыл приложение утром ———
    let morning: LimitResult | null = null;
    if (opened) {
      /**
       * Обновление остатка. Если ожидаемый доход уже наступил, Флюми спрашивает «уже пришла
       * и есть в этой сумме?» (3.25) — человек честно отмечает пришедшие деньги.
       */
      const updateBalance = (note: string) => {
        const paidToday = dataPayments(data, date, date).map((x) => x.key);
        data = setAccountBalance(data, 'main', trueMain, date, ts(day, 8), p.habits.marksPaid ? paidToday : []);
        lastBalanceUpdate = day;
        balanceDay = date;
        notes.push(note);
        const due = incomesToConfirm(data, date).find((o) => o.early <= date);
        const arrived = pendingIncomes.find((x) => x.inc.kind === 'regular');
        if (due && arrived && !due.key.startsWith('oneoff:')) {
          data = confirmIncome(data, due.key, rub(arrived.inc.rubles), date, `rb${seq}`, ts(day, 8) + 1, true);
          pendingIncomes.splice(pendingIncomes.indexOf(arrived), 1);
          notes.push(`отметил «${arrived.inc.name} уже в остатке»`);
        }
      };
      if (p.habits.confirm === 'balanceThenConfirm' && pendingIncomes.length) updateBalance('обновил остаток до «Пришла»');
      // Подтверждение доходов по привычке
      const toConfirm = pendingIncomes.filter((x) => {
        const age = diffDays(x.date, date);
        if (p.habits.confirm === 'never' && x.inc.kind === 'regular') return false;
        if (p.habits.confirm === 'late') return age >= 3;
        return true;
      });
      for (const x of toConfirm) {
        // «Уже в остатке?» спрашивается, если остаток записан в день дохода (после его прихода).
        const inBalance = mayBeInBalance(data, x.date) && balanceDay === x.date;
        if (x.inc.kind === 'oneoff') {
          // «Это доход, который вы ждали?» — человек узнаёт ожидаемый разовый.
          const match = matchingOneOff(data, x.date, date);
          if (match) {
            data = confirmIncome(data, match.key, rub(x.inc.rubles), x.date, `rc${seq}`, ts(day, 8), inBalance);
            notes.push(`узнал ожидаемый «${match.name}»`);
          } else {
            data = addReceivedOneOff(data, x.inc.name, rub(x.inc.rubles), x.date, `oo${seq}`, ts(day, 8), inBalance);
          }
        } else {
          const expected = incomesToConfirm(data, date);
          const key = expected.find((o) => o.early <= addDays(x.date, 10))?.key ?? expected[0]?.key;
          if (!key) {
            flag(day, date, 'Нечего подтверждать', `пришёл доход «${x.inc.name}», но в приложении нет подходящего ожидаемого дохода — «Пришла» нажать не на что`);
            data = addReceivedOneOff(data, x.inc.name, rub(x.inc.rubles), x.date, `oo${seq}`, ts(day, 8), inBalance);
          } else {
            data = confirmIncome(data, key, rub(x.inc.rubles), x.date, `rc${seq}`, ts(day, 8), inBalance);
          }
        }
        notes.push(`«Пришла» ${x.inc.name}${inBalance ? ' (уже в остатке)' : ''}`);
        pendingIncomes.splice(pendingIncomes.indexOf(x), 1);
      }
      if (p.habits.balanceEvery > 0 && day - lastBalanceUpdate >= p.habits.balanceEvery) updateBalance('обновил остаток');
      // Просроченный ожидаемый доход, а денег нет: «Задерживается» / «Перенести» на неделю (3.25).
      const prompt = incomePrompt(data, date);
      if (prompt?.kind === 'overdue' && !pendingIncomes.length) {
        data = delayIncome(data, prompt.income.key, addDays(date, 7));
        notes.push(`«${prompt.income.name}» не пришёл — отметил «Задерживается» до ${addDays(date, 7).slice(5)}`);
      }
      // «Платёж прошёл?» — в жизни банк списывает его всегда, даже в минус (3.26, п. 20).
      for (let q = paymentQuestion(data, date); q; q = paymentQuestion(data, date)) {
        data = confirmPaymentPaid(data, q.key);
        notes.push(`ответил «${q.name} прошёл»`);
      }
      // «Отложено N ₽. Перевели?» — кто привык переводить, переводит (3.26, п. 21).
      const before = computeLimit(data, date);
      if (before.status === 'ok' && setAsideReminderDue(data, before, date)) {
        if (p.habits.transfersSetAside) {
          const moved = before.setAside;
          data = transferSetAside(data, before, date, ts(day, 8) + 2, () => `sa${seq++}`);
          trueMain = kop(trueMain - moved);
          notes.push(`по напоминанию перевёл отложенное ${R(moved)} ₽`);
        }
      }
      // Записывает вчерашние забытые траты
      for (const e of lateExpenses.splice(0)) {
        data = addExpense(data, { amount: e.amount, accountId: 'main', categoryId: e.cat, date: e.date }, `le${seq}`, ts(day, 8));
        notes.push(`дописал трату за ${e.date.slice(5)}`);
      }
      morning = computeLimit(data, date);
      persist(morning);
    }

    // ——— Особые события ———
    p.events?.(ctx(), {
      note: (t) => notes.push(t),
      update: (fn) => {
        data = fn(data);
      },
      limit: () => computeLimit(data, date),
      moveTrue: (fromMain, rubles) => {
        trueMain = kop(trueMain + (fromMain ? -rub(rubles) : rub(rubles)));
      },
      now: () => ts(day, 13),
      id: () => `ev${seq++}`,
    });

    // ——— День: реальные траты ———
    let realSpent = 0;
    for (const s of p.spend(ctx())) {
      const amount = rub(s.rubles);
      const account = s.account ?? 'main';
      if (account === 'main') {
        trueMain = kop(trueMain - amount);
        realSpent += amount;
        realByDay.set(date, (realByDay.get(date) ?? 0) + amount);
      } else trueOther[account] = (trueOther[account] ?? 0) - s.rubles;
      const recordP = s.record ?? p.habits.record;
      if (!away && r.chance(recordP)) {
        if (p.habits.lateRecord && r.chance(p.habits.lateRecord) && account === 'main') {
          lateExpenses.push({ date, amount, cat: s.cat });
        } else {
          const at = ts(day, 13);
          data = addExpense(data, { amount, accountId: account, categoryId: s.cat, date }, `e${seq}`, at);
          if (p.habits.duplicate && r.chance(p.habits.duplicate)) {
            // Второй человек записывает ту же трату через несколько минут. Флюми переспрашивает (3.26, п. 19),
            // и это та же покупка — «Не надо».
            const e = { amount, accountId: account, categoryId: s.cat, date };
            if (recentDuplicate(data, e, at + 5 * 60_000)) notes.push(`Флюми переспросил про трату ${s.rubles} — дубль не записан`);
            else {
              data = addExpense(data, e, `dup${seq}`, at + 5 * 60_000);
              notes.push(`трата ${s.rubles} записана дважды`);
            }
          }
        }
      }
    }

    // ——— Вечер ———
    const evening = computeLimit(data, date);
    if (opened) persist(evening);
    const spentRec = spentTodayMain(data, date);
    let mood = '—';
    if (evening.status === 'ok') {
      mood = robotMood(spentRec, evening.dailyLimit, evening.noFreeMoney);
      if (morning?.status === 'ok' && morning.dailyLimit !== evening.dailyLimit && !notes.some((n) => n.startsWith('событие'))) {
        notes.push(`лимит за день сменился ${R(morning.dailyLimit)}→${R(evening.dailyLimit)}`);
      }
    }
    let closed = false;
    if (opened && r.chance(p.habits.close)) {
      // Пустой день: «Ничего не тратили?» — человек честно отвечает «Не помню», если тратил (3.25).
      const close = (d: ISODate) => {
        const recorded = data.expenses.some((x) => x.date === d && x.accountId === 'main');
        const unsure = !recorded && (realByDay.get(d) ?? 0) > 0;
        data = closeDayAction(data, d, unsure);
      };
      for (const d of unclosedDays(data, data.startedOn, date, 7).reverse()) close(d);
      close(date);
      closed = true;
    }

    // ——— Сравнение с реальностью и флаги ———
    const main = data.accounts.find((a) => a.kind === 'main');
    const appMain = main ? currentBalance(main, data, date) : 0;
    const diff = R(appMain - trueMain);
    if (main && diff > Math.max(2000, R(trueMain) * 0.1)) {
      flag(day, date, 'Приложение думает, что денег больше', `в приложении ${R(appMain).toLocaleString('ru')} ₽, на деле ${R(trueMain).toLocaleString('ru')} ₽ (разница +${diff.toLocaleString('ru')} ₽)`);
    }
    if (trueMain < 0) flag(day, date, 'Ушёл в минус', `реальный остаток ${R(trueMain).toLocaleString('ru')} ₽`);
    if (evening.status === 'ok') {
      const L = R(evening.dailyLimit);
      if (prevLimit !== null && prevLimit > 0 && Math.abs(L - prevLimit) / prevLimit > 0.4) {
        flag(day, date, 'Скачок лимита', `${prevLimit.toLocaleString('ru')} → ${L.toLocaleString('ru')} ₽ в день (${notes.join('; ') || 'без явных событий'})`);
      }
      // Без регулярного дохода горизонт скользит каждый день («Дотянуть до», 3.26) — это не ошибка.
      if (
        evening.horizonIncome.key !== 'stretch' &&
        prevHorizon &&
        prevHorizon !== evening.horizon &&
        evening.horizon > prevHorizon &&
        !notes.some((n) => n.includes('Пришла'))
      ) {
        flag(day, date, 'Горизонт уехал без дохода', `ожидавшийся доход ${prevHorizon} не подтверждён — лимит теперь считается до ${evening.horizon}`);
      }
      // Лимит обещает больше, чем реально есть с учётом ближайших платежей
      const upcoming = evening.reservedPayments.reduce((s, x) => s + x.amount, 0);
      if (evening.dailyLimit > 0 && trueMain - upcoming < evening.dailyLimit * 2) {
        flag(day, date, 'Лимит не подкреплён деньгами', `лимит ${L.toLocaleString('ru')} ₽/день, а реально после ближайших платежей останется ${R(trueMain - upcoming).toLocaleString('ru')} ₽`);
      }
      prevLimit = L;
      prevHorizon = evening.horizon;
    } else {
      prevLimit = null;
    }
    if (opened && isBalanceStale(data, date) && day % 7 === 0) {
      notes.push(`остаток не обновлялся ${diffDays(main!.asOf, date)} дн.`);
    }

    rows.push({
      day,
      date,
      opened,
      limit: evening.status === 'ok' ? `${R(evening.dailyLimit)}` : `нет (${evening.missing.join(',')})`,
      free: evening.status === 'ok' ? `${R(evening.free)}` : '',
      horizon: evening.status === 'ok' ? evening.horizon.slice(5) : '',
      realSpent: R(realSpent),
      recSpent: R(spentRec),
      mood,
      trueMain: R(trueMain),
      appMain: R(appMain),
      diff,
      closed,
      notes,
    });
  }

  const last = computeLimit(data, addDays(d0, days - 1));
  const summary = {
    opened: rows.filter((x) => x.opened).length,
    realSpent: rows.reduce((s, x) => s + x.realSpent, 0),
    recSpent: rows.reduce((s, x) => s + x.recSpent, 0),
    noData: rows.filter((x) => x.limit.startsWith('нет')).length,
    zeroLimit: rows.filter((x) => x.limit === '0').length,
    moods: rows.reduce<Record<string, number>>((m, x) => ((m[x.mood] = (m[x.mood] ?? 0) + 1), m), {}),
    streak: closedStreak(data, addDays(d0, days - 1)),
    unclosed: unclosedDays(data, data.startedOn, addDays(d0, days), 60).length,
    setAsideLeft: last.status === 'ok' ? R(last.setAside) : null,
    finalTrue: R(trueMain),
    finalApp: rows[rows.length - 1].appMain,
    trueOther,
    remainingTodayLast:
      last.status === 'ok' ? R(remainingToday(last.dailyLimit, spentTodayMain(data, addDays(d0, days - 1))).left) : null,
  };
  return { rows, flags, summary, data };
}
