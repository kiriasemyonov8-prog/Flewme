// Слой ИИ (SPEC, раздел 15): отдельный модуль с интерфейсом, чтобы позже заменить
// имитацию живым ИИ, не трогая финансовую логику. ИИ API не вызывается.
// Демо-ассистент отвечает на типовые вопросы заготовками, подставляя настоящие числа
// из расчётного ядра, и честно объясняет, из чего они сложились (SPEC 3.14).
import type { ExpenseInput } from '../core/actions';
import { spentTodayMain } from '../core/balance';
import { OTHER_ID } from '../core/categories';
import type { ISODate } from '../core/dates';
import { explainAvailable, explainMainAccount, type ExplainLine } from '../core/explain';
import { formatDayMonth, formatRub, formatRubWhole, parseRubInput } from '../core/format';
import { allocateSetAside } from '../core/goals';
import { remainingToday, type LimitOk, type LimitResult } from '../core/limit';
import { ZERO, kop, sub, type Kopecks } from '../core/money';
import { monthlyDeficit } from '../core/month';
import { monthExpenses } from '../core/overview';
import { evaluatePurchase, savingsTotal } from '../core/purchase';
import type { FinanceData } from '../core/types';

export interface AssistantContext {
  data: FinanceData;
  today: ISODate;
  limit: LimitResult;
}

export interface AssistantReply {
  text: string;
  /** Трата, которую нужно записать (вопрос «Запиши расход 750 ₽»). */
  expense?: ExpenseInput;
}

export interface Assistant {
  reply(question: string, ctx: AssistantContext): AssistantReply;
}

export const TYPICAL_QUESTIONS = [
  'Сколько мне можно потратить сегодня?',
  'Почему у меня такой лимит?',
  'Хватит ли мне до зарплаты?',
  'Запиши расход 750 ₽',
  'Хватит ли на покупку за 90 000 ₽?',
  'Как накопить на покупку?',
];

/** Сумма из текста: «750», «1 200», «1200,50», «90 тыс», «2к». */
export function parseAmount(text: string): Kopecks | null {
  const m = /(\d[\d\s  ]*(?:[.,]\d{1,2})?)\s*(тыс\.?|тысяч[а-я]*|[кk](?![а-яёa-z]))?/i.exec(text);
  if (!m) return null;
  const raw = m[1].replace(/[\s  ]/g, '').replace('.', ',');
  const value = parseRubInput(raw);
  if (!value) return null;
  return m[2] ? kop(value * 1000) : value;
}

const CATEGORY_WORDS: [string, RegExp][] = [
  ['food', /(ед[аы]|продукт|кофе|обед|ужин|завтрак|кафе|ресторан|перекус|магазин у дома)/],
  ['transport', /(такси|метро|автобус|бензин|транспорт|электричк|самокат)/],
  ['health', /(аптек|врач|лекарств|анализ|стоматолог)/],
  ['fun', /(кино|подписк|игр|концерт|развлеч|бар)/],
  ['shopping', /(одежд|обув|покупк|вещ|техник)/],
  ['home', /(дом|квартир|ремонт|коммунал|мебел)/],
];

function guessCategory(text: string, data: FinanceData): string {
  const lower = text.toLowerCase();
  for (const c of data.categories) {
    if (lower.includes(c.name.toLowerCase())) return c.id;
  }
  for (const [id, re] of CATEGORY_WORDS) {
    if (re.test(lower) && data.categories.some((c) => c.id === id)) return id;
  }
  return data.lastCategoryId ?? OTHER_ID;
}

function renderLines(lines: ExplainLine[]): string {
  return lines
    .map((l) => {
      const date = l.date && l.kind === 'minus' ? ` (${formatDayMonth(l.date)})` : '';
      if (l.kind === 'start') return `${formatRub(l.amount)} — ${l.label.toLowerCase()}`;
      if (l.kind === 'minus') return `− ${formatRub(l.amount)} — ${l.label.toLowerCase()}${date}`;
      if (l.kind === 'plus') return `+ ${formatRub(l.amount)} — ${l.label.toLowerCase()}`;
      return `= ${formatRub(l.amount)} — ${l.label.toLowerCase()}`;
    })
    .join('\n');
}

const NEED_DATA =
  'Чтобы ответить честно, мне нужен остаток основного счёта. Укажите его в профиле — без него я не буду гадать.';

/** «Что можно сделать», когда денег не хватает (3.26, п. 11): только то, что видно по данным. */
function shortageAdvice(data: FinanceData, limit: LimitOk, today: ISODate): string {
  const tips: string[] = [];
  const deficit = monthlyDeficit(data, today);
  if (limit.base < 0) tips.push(`До ${formatDayMonth(limit.horizon)} не хватает ${formatRub(sub(ZERO, limit.base))} — это с учётом всех обязательных платежей.`);
  if (deficit && deficit > 0) tips.push(`По записям за последние 30 дней расходы больше доходов примерно на ${formatRubWhole(deficit)} в месяц.`);
  if (data.settings.savePercent > 0) tips.push(`Можно на время выключить откладывание в профиле («Откладывание»).`);
  const savings = savingsTotal(data, today);
  if (savings > 0) tips.push(`В накоплениях ${formatRub(savings)}: часть можно взять кнопкой «Взять» в «Финансах» — лимит сразу пересчитается.`);
  const top = monthExpenses(data, today.slice(0, 7)).byCategory.find(
    (c) => !data.questionnaire.protectedCategoryIds.includes(c.categoryId),
  );
  if (top) {
    const name = data.categories.find((c) => c.id === top.categoryId)?.name ?? 'Другое';
    tips.push(`Больше всего в этом месяце ушло на «${name}» — ${formatRub(top.total)}. Посмотрите, что из этого можно отложить.`);
  }
  tips.push('Если платёж можно перенести, договоритесь об этом и укажите новую дату — Флюми пересчитает.');
  return `Без паники, давайте по шагам:\n\n${tips.map((t) => `• ${t}`).join('\n')}`;
}

function has(re: RegExp, q: string): boolean {
  return re.test(q);
}

export const demoAssistant: Assistant = {
  reply(question, { data, today, limit }) {
    const q = question.toLowerCase();
    const amount = parseAmount(q);

    // «Запиши расход 750 ₽», «потратил 300 на кофе»
    if (amount && has(/(запиш|записать|потратил|потрачен|заплатил|расход|трат)/, q) && !has(/(почему|хватит|купить)/, q)) {
      const main = data.accounts.find((a) => a.kind === 'main');
      if (!main) return { text: 'Записать трату не получится: сначала укажите основной счёт в профиле.' };
      const categoryId = guessCategory(q, data);
      const category = data.categories.find((c) => c.id === categoryId)?.name ?? 'Другое';
      let tail = '';
      if (limit.status === 'ok') {
        const { left, over } = remainingToday(limit.dailyLimit, kop(spentTodayMain(data, today) + amount));
        tail =
          over > 0
            ? ` Сегодня это сверх лимита на ${formatRubWhole(over)} — бывает, следующие дни немного подстроятся.`
            : ` На сегодня осталось ${formatRubWhole(left)}.`;
      }
      return {
        text: `Записал трату ${formatRub(amount)} в категорию «${category}» с основного счёта.${tail} Если категория не та, удалите трату в «Финансы и цели → Расходы» и запишите заново.`,
        expense: { amount, accountId: main.id, categoryId, date: today },
      };
    }

    if (has(/^(привет|здравств|добр)/, q)) {
      return { text: `Привет! Я подскажу по лимиту, зарплате и покупкам. Например: «${TYPICAL_QUESTIONS[0]}» или «${TYPICAL_QUESTIONS[1]}»` };
    }

    if (limit.status !== 'ok') {
      if (has(/(лимит|сегодня|зарплат|хватит|почему|откуда|купить|покупк|накопить)/, q)) return { text: NEED_DATA };
    } else {
      if (has(/(что (можно )?(сделать|делать)|не хватает денег|денег не хватает)/, q) && !amount) {
        return { text: shortageAdvice(data, limit, today) };
      }
      // Покупка с суммой: «хватит ли на 90 000», «почему не хватает на 200 тыс»
      if (amount && has(/(купить|покупк|хватит|хватает|могу ли|стоит ли|накопить)/, q)) {
        const source = { kind: has(/(все|всех|всего|накоплен)/, q) ? 'all' : 'main' } as const;
        const r = evaluatePurchase(data, limit, amount, source, today);
        const lines = explainAvailable(data, limit, source, r, today);
        const verdict =
          r.shortfall > 0
            ? `По вашим данным на покупку за ${formatRub(amount)} сейчас не хватает ${formatRub(r.shortfall)}.`
            : r.verdict === 'yes'
              ? `По вашим данным покупка за ${formatRub(amount)} укладывается: она забирает ${r.sharePercent}% доступных денег.`
              : `По вашим данным хватает, но покупка забирает ${r.sharePercent}% доступных денег — это компромисс.`;
        const where =
          source.kind === 'main'
            ? `Считаю только свободные деньги основного счёта: квартира, транспорт и откладывание уже зарезервированы.`
            : `Считаю свободные деньги основного счёта и все накопления.`;
        return {
          text: `${verdict}\n\n${renderLines(lines)}\n\n${where} Подробный расчёт и варианты — в разделе «Покупка».`,
        };
      }

      // «Почему такой лимит?», «откуда эта сумма», «куда делись деньги»
      if (has(/(почему|откуда|из чего|как .*(посчит|счита)|куда (делись|ушли|уходят))/, q)) {
        if (has(/(не хват)/, q)) {
          return { text: 'Назовите сумму покупки — например, «почему не хватает на 90 000» — и я разложу, откуда берутся доступные деньги.' };
        }
        const lines = explainMainAccount(data, limit, today);
        return {
          text:
            `Вот как получился лимит:\n\n${renderLines(lines)}\n\n` +
            `${formatRub(lines.find((l) => l.label === 'Свободно до дохода')!.amount)} делю на ${limit.days} дн. до ${formatDayMonth(limit.horizon)} — ` +
            `получается ${formatRubWhole(limit.dailyLimit)} в день. Квартира и транспорт зарезервированы заранее, чтобы на них точно хватило.`,
        };
      }

      if (has(/(до зарплаты|до дохода|хватит ли мне|хватит ли денег|дотяну)/, q)) {
        if (limit.noFreeMoney) {
          return { text: `По вашим данным свободных денег до ${formatDayMonth(limit.horizon)} нет: всё уходит на обязательные платежи и резервы. Спросите «почему такой лимит?» — покажу расчёт.` };
        }
        return {
          text: `По вашим данным хватит: до ${formatDayMonth(limit.horizon)} свободно ${formatRub(sub(limit.free, limit.saved))} — это ${formatRubWhole(limit.dailyLimit)} в день на ${limit.days} дн. Квартира и транспорт уже учтены. Если держаться лимита, до дохода дотянете спокойно.`,
        };
      }

      if (has(/(сегодня|сколько.*(можно|могу)|лимит)/, q)) {
        const spent = spentTodayMain(data, today);
        const { left, over } = remainingToday(limit.dailyLimit, spent);
        const status =
          spent === 0
            ? 'Трат сегодня пока нет.'
            : over > 0
              ? `Уже потрачено ${formatRub(spent)} — это сверх лимита на ${formatRubWhole(over)}. Не страшно, следующие дни немного подстроятся.`
              : `Уже потрачено ${formatRub(spent)}, осталось ${formatRubWhole(left)}.`;
        return { text: `Сегодня можно ${formatRubWhole(limit.dailyLimit)}. ${status}` };
      }

      if (has(/(накопить|копить|отложить|цель)/, q)) {
        const shares = allocateSetAside(data, limit.savePlan.amount, today).filter((s) => s.amount > 0);
        const split = shares.length
          ? `\n\nКак это делится между целями (сначала те, у которых срок ближе):\n${shares
              .map((s) => `• ${s.goal.name} — ${formatRub(s.amount)}`)
              .join('\n')}`
          : '';
        return {
          text:
            `Сейчас откладывается ${limit.savePlan.percent}% от остатка после обязательных платежей — в этом периоде ${formatRub(limit.savePlan.amount)}.` +
            split +
            '\n\nЧтобы проверить конкретную покупку, назовите сумму («хватит ли на 90 000?») или откройте раздел «Покупка».',
        };
      }
    }

    return {
      text: `В демо я отвечаю только на типовые вопросы, например:\n• ${TYPICAL_QUESTIONS.join('\n• ')}`,
    };
  },
};
