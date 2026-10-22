import { ArrowUp, CalendarDays, MessageCircle, Wallet } from 'lucide-react';
import { demoAssistant, TYPICAL_QUESTIONS } from '../ai/assistant';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Robot } from '../assets/character';
import { spentTodayMain } from '../core/balance';
import { addDays, diffDays, type ISODate } from '../core/dates';
import { closedStreak, isBalanceStale, isClosed, unclosedDays } from '../core/days';
import { formatDayMonth, formatRubWhole, formatRubWholeUp, pluralDays } from '../core/format';
import { remainingToday } from '../core/limit';
import { robotMood } from '../core/mood';
import { addCategory } from '../core/profile';
import { CATEGORY_ERRORS } from './profile/SimpleSheets';
import type { FinanceStore } from '../state/useFinance';
import { DemoBadge } from '../ui/DemoBadge';
import { ThoughtCloud } from '../ui/ThoughtCloud';
import { CloseDaySheet } from './home/CloseDaySheet';
import { ExpenseSheet } from './home/ExpenseSheet';
import { IncomeSheet } from './home/IncomeSheet';

type SheetState =
  | null
  | { kind: 'expense'; date: ISODate; thenClose?: boolean }
  | { kind: 'income' }
  | { kind: 'close'; date: ISODate };

const ROBOT_ICON = 48;

/** Порядковый номер для каскадной анимации «улёта» вверх. */
const fly = (i: number) => ({ '--i': i }) as CSSProperties;

export function HomeScreen({
  store,
  homeSignal,
  onOpenProfile,
}: {
  store: FinanceStore;
  homeSignal: number;
  onOpenProfile: () => void;
}) {
  const { data, today, limit } = store;
  const [sheet, setSheet] = useState<SheetState>(null);
  const [chat, setChat] = useState(false);
  const [robotShift, setRobotShift] = useState<string | undefined>();
  const [chatShift, setChatShift] = useState<string | undefined>();
  const [question, setQuestion] = useState('');
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [messages, setMessages] = useState<{ from: 'user' | 'flyumi'; text: string }[]>([]);
  const robotRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Новые сообщения всегда видны.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  // Нажатие на «Главная» в навигации возвращает экран из режима чата.
  useEffect(() => {
    setChat(false);
  }, [homeSignal]);

  // Робот уменьшается в иконку слева сверху, поле чата опускается к нижней навигации.
  useLayoutEffect(() => {
    if (!chat || !robotRef.current || !chatRef.current) {
      setRobotShift(undefined);
      setChatShift(undefined);
      return;
    }
    window.scrollTo({ top: 0 });
    const r = robotRef.current.getBoundingClientRect();
    setRobotShift(`translate(${16 - r.left}px, ${16 - r.top}px) scale(${ROBOT_ICON / r.width})`);
    const c = chatRef.current.getBoundingClientRect();
    const navTop = document.querySelector('.nav')?.getBoundingClientRect().top ?? window.innerHeight;
    setChatShift(`translateY(${navTop - 14 - c.bottom}px)`);
    inputRef.current?.focus({ preventScroll: true });
  }, [chat]);

  function send(text: string) {
    const q = text.trim();
    if (!q) return;
    const reply = demoAssistant.reply(q, { data, today, limit });
    if (reply.expense) store.addExpense(reply.expense);
    setMessages((m) => [...m, { from: 'user', text: q }, { from: 'flyumi', text: reply.text }]);
    setQuestion('');
  }

  function ask(e: React.FormEvent) {
    e.preventDefault();
    send(question);
  }

  const spent = spentTodayMain(data, today);
  const remaining = limit.status === 'ok' ? remainingToday(limit.dailyLimit, spent) : null;
  const yesterday = addDays(today, -1);
  const yesterdayOpen = yesterday >= data.startedOn && !isClosed(data, yesterday);
  const todayClosed = isClosed(data, today);
  const streak = closedStreak(data, today);

  // Напоминания внутри приложения при открытии (SPEC, раздел 12): не больше одного за раз,
  // мягко и без давления. «Позже» скрывает его до следующего открытия.
  const missed = unclosedDays(data, data.startedOn, today);
  const staleDays = data.accounts.some((a) => a.kind === 'main') && isBalanceStale(data, today)
    ? diffDays(data.accounts.find((a) => a.kind === 'main')!.asOf, today)
    : 0;
  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const eveningDue = data.settings.reminderEnabled && !todayClosed && nowTime >= data.settings.reminderTime;
  const reminder: { key: string; text: string; action: string; run: () => void } | null =
    missed.length > 0
      ? {
          key: `missed-${missed[0]}`,
          text:
            missed.length > 1
              ? `Как прошли последние дни? Запишем траты за ${missed.length} ${pluralDays(missed.length)}, это займёт пару минут.`
              : 'Как прошёл вчерашний день? Запишем траты, это займёт минуту.',
          action: 'Записать',
          run: () => setSheet({ kind: 'close', date: missed[missed.length - 1] }),
        }
      : staleDays > 0
        ? {
            key: 'stale',
            text: `Остаток основного счёта не обновлялся ${staleDays} ${pluralDays(staleDays)}. Обновим, чтобы лимит был точнее?`,
            action: 'Обновить',
            run: onOpenProfile,
          }
        : eveningDue
          ? {
              key: `evening-${today}`,
              text: 'Как прошёл день? Запишем траты и закроем его — это займёт минуту.',
              action: 'Закрыть день',
              run: () => setSheet({ kind: 'close', date: today }),
            }
          : null;
  const showReminder = reminder && !dismissed.includes(reminder.key);

  let mood = robotMood(spent, limit.status === 'ok' ? limit.dailyLimit : spent);
  let phrase: string;
  if (limit.status !== 'ok') {
    mood = 'calm';
    phrase = 'Для лимита нужны остаток счёта и ожидаемый доход.';
  } else if (limit.noFreeMoney) {
    phrase = 'По вашим данным свободных денег до дохода нет.';
  } else if (mood === 'calm') {
    phrase = `Трат пока нет. Можно до ${formatRubWhole(limit.dailyLimit)}.`;
  } else if (mood === 'joy') {
    phrase = 'Идём в рамках дня, всё по плану.';
  } else if (mood === 'thoughtful') {
    phrase = 'Чуть больше лимита. Не страшно, подстроимся.';
  } else {
    phrase = 'Бывает. Завтра чуть строже, и всё выровняется.';
  }

  return (
    <div className={`home${chat ? ' is-chat' : ''}`}>
      {data.isDemo && (
        <div className="fly" style={fly(0)}>
          <DemoBadge />
        </div>
      )}

      {showReminder && (
        <div className="card notice reminder fly" style={fly(1)}>
          <span>{reminder.text}</span>
          <div className="reminder-actions">
            <button type="button" className="btn btn-primary" onClick={reminder.run}>
              {reminder.action}
            </button>
            <button type="button" className="link-btn" onClick={() => setDismissed((d) => [...d, reminder.key])}>
              Позже
            </button>
          </div>
        </div>
      )}

      {limit.status === 'noData' && (
        <div className="card notice fly" style={fly(1)}>
          <span>
            Чтобы посчитать лимит, укажите{' '}
            {limit.missing.map((m) => (m === 'mainBalance' ? 'остаток основного счёта' : 'ожидаемый доход')).join(' и ')}.
          </span>
          <button type="button" className="btn btn-primary" onClick={onOpenProfile}>
            Указать
          </button>
        </div>
      )}

      {limit.status === 'ok' && (
        <div className="top-cards fly" style={fly(1)}>
          <section className="card stat">
            <div className="stat-head">
              <CalendarDays size={18} aria-hidden />
              <span>До зарплаты</span>
            </div>
            <div className="stat-value num">
              {limit.daysRange.min === limit.daysRange.max
                ? limit.daysRange.max
                : `${limit.daysRange.min}–${limit.daysRange.max}`}
              <span className="stat-unit"> {pluralDays(limit.daysRange.max)}</span>
            </div>
            <div className="stat-note">лимит до {formatDayMonth(limit.horizon)}</div>
          </section>
          <section className="card stat stat-accent">
            <div className="stat-head">
              <Wallet size={18} aria-hidden />
              <span>На сегодня</span>
            </div>
            <div className="stat-value num">{formatRubWhole(remaining!.left)}</div>
            <div className="stat-note">
              {remaining!.over > 0
                ? `сверх лимита на ${formatRubWholeUp(remaining!.over)}`
                : spent > 0
                  ? `осталось из ${formatRubWhole(limit.dailyLimit)}`
                  : 'можно потратить'}
            </div>
            {yesterdayOpen && <div className="stat-note">данные за вчера не записаны</div>}
          </section>
        </div>
      )}

      <div className="robot-zone">
        <div
          ref={robotRef}
          className="robot-wrap"
          style={{ transform: robotShift }}
        >
          {chat ? (
            <button type="button" className="robot-btn" aria-label="Вернуться на главную" onClick={() => setChat(false)}>
              <Robot expression={mood} size={140} />
            </button>
          ) : (
            <Robot expression={mood} size={140} />
          )}
        </div>
        <div className="fly" style={fly(2)}>
          <ThoughtCloud text={phrase} />
        </div>
      </div>

      <div className="day-row fly" style={fly(3)}>
        {todayClosed ? (
          <span className="day-closed">
            День закрыт{streak > 1 ? ` · серия ${streak} ${pluralDays(streak)}` : ''}
          </span>
        ) : (
          <button type="button" className="link-btn" onClick={() => setSheet({ kind: 'close', date: today })}>
            Закрыть день{streak > 0 ? ` · серия ${streak} ${pluralDays(streak)}` : ''}
          </button>
        )}
      </div>

      <div className="actions fly" style={fly(4)}>
        <button type="button" className="btn btn-big btn-secondary" onClick={() => setSheet({ kind: 'income' })}>
          Записать доход
        </button>
        <button type="button" className="btn btn-big btn-primary" onClick={() => setSheet({ kind: 'expense', date: today })}>
          Записать трату
        </button>
      </div>

      <div ref={chatRef} className="chat-box" style={{ transform: chatShift }}>
        {chat ? (
          <form className="chat-form glass" onSubmit={ask}>
            <MessageCircle size={20} aria-hidden />
            <input
              ref={inputRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Спросить Флюми"
              aria-label="Вопрос Флюми"
              enterKeyHint="send"
            />
            <button type="submit" className="send-btn" aria-label="Отправить">
              <ArrowUp size={20} />
            </button>
          </form>
        ) : (
          <button type="button" className="chat-strip glass" onClick={() => setChat(true)}>
            <MessageCircle size={20} aria-hidden />
            <span>Спросить Флюми</span>
          </button>
        )}
      </div>

      {chat && (
        <section className="chat-panel" aria-label="Чат с Флюми">
          {messages.length === 0 && (
            <>
              <div className="chat-msg">
                Спросите про лимит, зарплату или покупку — отвечу с настоящими числами и покажу, откуда они. Чтобы
                вернуться, нажмите на меня слева сверху.
                <span className="demo-tag">демо</span>
              </div>
              <div className="chips">
                {TYPICAL_QUESTIONS.map((q) => (
                  <button key={q} type="button" className="chip" onClick={() => send(q)}>
                    {q}
                  </button>
                ))}
              </div>
            </>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg${m.from === 'user' ? ' from-user' : ''}`}>
              {m.text}
              {m.from === 'flyumi' && <span className="demo-tag">демо</span>}
            </div>
          ))}
          <div ref={chatEndRef} />
        </section>
      )}

      {sheet?.kind === 'expense' && (
        <ExpenseSheet
          data={data}
          date={sheet.date}
          today={today}
          onClose={() => setSheet(sheet.thenClose ? { kind: 'close', date: sheet.date } : null)}
          onAddCategory={(id, name) => {
            const result = addCategory(data, id, name);
            if (typeof result === 'string') return CATEGORY_ERRORS[result];
            store.replace(result);
            return null;
          }}
          onSave={(e) => {
            store.addExpense(e);
            setSheet(sheet.thenClose ? { kind: 'close', date: sheet.date } : null);
          }}
        />
      )}
      {sheet?.kind === 'income' && (
        <IncomeSheet
          data={data}
          today={today}
          onClose={() => setSheet(null)}
          onConfirm={(key, amount, date) => {
            store.confirmIncome(key, amount, date);
            setSheet(null);
          }}
          onOneOff={(name, amount, date) => {
            store.addReceivedOneOff(name, amount, date);
            setSheet(null);
          }}
        />
      )}
      {sheet?.kind === 'close' && (
        <CloseDaySheet
          data={data}
          date={sheet.date}
          today={today}
          onClose={() => setSheet(null)}
          onAddExpense={() => setSheet({ kind: 'expense', date: sheet.date, thenClose: true })}
          onConfirm={() => {
            store.closeDay(sheet.date);
            setSheet(null);
          }}
        />
      )}
    </div>
  );
}
