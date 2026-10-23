import { CalendarDays, MessageCircle, Wallet } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { characterBackground, Robot } from '../assets/character';
import { spentTodayMain } from '../core/balance';
import { addDays, diffDays, type ISODate } from '../core/dates';
import { closedStreak, isBalanceStale, isClosed, unclosedDays } from '../core/days';
import { formatDayMonth, formatRubWhole, formatRubWholeUp, pluralDays } from '../core/format';
import { remainingToday } from '../core/limit';
import { robotMood } from '../core/mood';
import { addCategory } from '../core/profile';
import { CATEGORY_ERRORS } from './profile/SimpleSheets';
import type { ChatStore } from '../state/useChat';
import type { FinanceStore } from '../state/useFinance';
import { ChatInput, ChatThread } from '../ui/Chat';
import { DemoBadge } from '../ui/DemoBadge';
import { CloseDaySheet } from './home/CloseDaySheet';
import { ExpenseSheet } from './home/ExpenseSheet';
import { IncomeSheet } from './home/IncomeSheet';

type SheetState =
  | null
  | { kind: 'expense'; date: ISODate; thenClose?: boolean }
  | { kind: 'income' }
  | { kind: 'close'; date: ISODate };

/** Высота Флюми, когда он уменьшается в иконку чата. */
const ROBOT_ICON = 64;

/** Порядковый номер для каскадной анимации «улёта» вверх. */
const fly = (i: number) => ({ '--i': i }) as CSSProperties;

export function HomeScreen({
  store,
  chatStore,
  homeSignal,
  onOpenProfile,
}: {
  store: FinanceStore;
  chatStore: ChatStore;
  homeSignal: number;
  onOpenProfile: () => void;
}) {
  const { data, today, limit } = store;
  const [sheet, setSheet] = useState<SheetState>(null);
  const [chat, setChat] = useState(false);
  const [robotShift, setRobotShift] = useState<string | undefined>();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const robotRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Нажатие на «Главная» в навигации возвращает экран из режима чата.
  useEffect(() => {
    setChat(false);
  }, [homeSignal]);

  // Робот уменьшается в иконку слева сверху. Поле чата переезжает в закреплённую
  // снизу панель (она сама встаёт над клавиатурой телефона): плавно летит из места полосы.
  useLayoutEffect(() => {
    if (!chat || !robotRef.current || !chatRef.current || !dockRef.current) {
      setRobotShift(undefined);
      return;
    }
    window.scrollTo({ top: 0 });
    const r = robotRef.current.getBoundingClientRect();
    setRobotShift(`translate(${16 - r.left}px, ${16 - r.top}px) scale(${ROBOT_ICON / r.height})`);
    const dock = dockRef.current;
    const from = chatRef.current.getBoundingClientRect().top - dock.getBoundingClientRect().top;
    dock.style.transition = 'none';
    dock.style.transform = `translate(-50%, ${from}px)`;
    void dock.offsetHeight; // зафиксировать стартовое положение перед анимацией
    dock.style.transition = '';
    dock.style.transform = '';
    inputRef.current?.focus({ preventScroll: true });
  }, [chat]);


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

      {/* Сцена: фон комнаты, Флюми на нём (как на референсе IMG_2987), мысли рукописным текстом справа. */}
      <div className="scene">
        <div className="scene-bg fly" style={fly(2)}>
          <img src={characterBackground} alt="" draggable={false} />
          <div className="scene-thought" aria-live="polite">
            <p>{phrase}</p>
            <svg className="scene-arrow" viewBox="0 0 60 34" aria-hidden="true">
              <path d="M54 4 C 44 22, 26 28, 8 24" />
              <path d="M16 16 L 7 24 L 17 30" />
            </svg>
          </div>
        </div>
        <div ref={robotRef} className="robot-wrap scene-robot" style={{ transform: robotShift }}>
          {chat ? (
            <button type="button" className="robot-btn" aria-label="Вернуться на главную" onClick={() => setChat(false)}>
              <Robot expression={mood} />
            </button>
          ) : (
            <Robot expression={mood} />
          )}
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

      {/* Полоса остаётся на месте (невидимой), чтобы раскладка не прыгала; поле ввода — в панели снизу. */}
      <div ref={chatRef} className="chat-box" style={{ visibility: chat ? 'hidden' : undefined }}>
        <button type="button" className="chat-strip glass" onClick={() => setChat(true)} tabIndex={chat ? -1 : undefined}>
          <MessageCircle size={20} aria-hidden />
          <span>Спросить Флюми</span>
        </button>
      </div>

      {chat && (
        <>
          <section className="chat-panel" aria-label="Чат с Флюми">
            <ChatThread chat={chatStore} />
          </section>
          <div ref={dockRef} className="chat-dock">
            <ChatInput chat={chatStore} inputRef={inputRef} />
          </div>
        </>
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
