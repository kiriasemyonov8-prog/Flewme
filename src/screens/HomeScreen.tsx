import { CalendarDays, MessageCircle, Wallet } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { characterBackground, Robot } from '../assets/character';
import {
  confirmPaymentPaid,
  delayIncome,
  delayPayment,
  dropOneOff,
  incomePrompt,
  paymentQuestion,
  setAsideReminderDue,
  transferSetAside,
} from '../core/actions';
import { STRETCH_KEY } from '../core/limit';
import type { Kopecks } from '../core/money';
import { monthlyDeficit } from '../core/month';
import { newId } from '../state/useFinance';
import { saveBackupFile } from '../state/backupFile';
import { backupDue } from '../core/storage';
import { spentTodayMain, transportOverMonth } from '../core/balance';
import { addDays, diffDays, type ISODate } from '../core/dates';
import type { IncomeOccurrence } from '../core/schedule';
import { closedStreak, isBalanceStale, isClosed, unclosedDays } from '../core/days';
import { formatDayMonth, formatRubWhole, formatRubWholeUp, pluralDays } from '../core/format';
import { remainingToday } from '../core/limit';
import { robotMood } from '../core/mood';
import { addCategory } from '../core/profile';
import { CATEGORY_ERRORS } from './profile/SimpleSheets';
import type { ChatStore } from '../state/useChat';
import type { FinanceStore } from '../state/useFinance';
import { ChatInput, ChatThread, MicButton } from '../ui/Chat';
import { useVoiceInput } from '../state/useVoiceInput';
import { DemoBadge } from '../ui/DemoBadge';
import { CloseDaySheet } from './home/CloseDaySheet';
import { ExpenseSheet } from './home/ExpenseSheet';
import { DelaySheet } from './home/DelaySheet';
import { IncomeSheet } from './home/IncomeSheet';

type SheetState =
  | null
  | { kind: 'expense'; date: ISODate; thenClose?: boolean }
  | { kind: 'income'; initial?: IncomeOccurrence }
  | { kind: 'delay'; income: IncomeOccurrence }
  | { kind: 'delayPayment'; key: string; name: string }
  | { kind: 'close'; date: ISODate };

/** Мягкое напоминание на главной: одно за раз, «Позже» скрывает его до следующего открытия. */
interface Reminder {
  key: string;
  text: string;
  action: string;
  run: () => void;
  more?: { label: string; run: () => void }[];
  /** Что ещё сделать на «Позже» (например, запомнить, что напоминание отложено). */
  onLater?: () => void;
}

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
  const sceneRef = useRef<HTMLDivElement>(null);

  // Размер сцены гибкий; Флюми и мысли расставляются в долях её ширины и высоты (--sw, --sh).
  useLayoutEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    const apply = () => {
      el.style.setProperty('--sw', `${el.clientWidth}px`);
      el.style.setProperty('--sh', `${el.clientHeight}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const chatRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Голосовой ввод живёт здесь, чтобы запись началась прямо по нажатию на главной и шла в чате.
  const voice = useVoiceInput(chatStore);
  const stopVoice = voice.stop;

  // Закрыли чат — запись останавливается.
  useEffect(() => {
    if (!chat) stopVoice();
  }, [chat, stopVoice]);

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
    // Открыли чат голосом — клавиатуру не показываем, идёт запись.
    if (!voice.listening) inputRef.current?.focus({ preventScroll: true });
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
  // Доход сегодня ждём или он запаздывает — спросить о нём важнее всего: от него зависит лимит (3.25).
  const prompt = incomePrompt(data, today);
  const incomeReminder: Reminder | null = prompt
    ? {
        key: `income-${prompt.income.key}-${today}`,
        text:
          prompt.kind === 'overdue'
            ? `«${prompt.income.name}» ждали к ${formatDayMonth(prompt.income.late)}. Пришла?`
            : prompt.income.early === prompt.income.late
              ? `Сегодня ждём «${prompt.income.name}». Когда придёт, нажмите «Пришла».`
              : `Ждём «${prompt.income.name}» до ${formatDayMonth(prompt.income.late)}. Когда придёт, нажмите «Пришла».`,
        action: 'Пришла',
        run: () => setSheet({ kind: 'income', initial: prompt.income }),
        more:
          prompt.kind !== 'overdue'
            ? undefined
            : prompt.oneOff
              ? [
                  { label: 'Перенести', run: () => setSheet({ kind: 'delay', income: prompt.income }) },
                  { label: 'Не придёт', run: () => store.update((d) => dropOneOff(d, prompt.income.key)) },
                ]
              : [{ label: 'Задерживается', run: () => setSheet({ kind: 'delay', income: prompt.income }) }],
      }
    : null;
  // Платёж, на который по записям не хватало денег: прошёл ли он (3.26, п. 20).
  const payQ = paymentQuestion(data, today);
  const paymentReminder: Reminder | null = payQ
    ? {
        key: `pay-${payQ.key}`,
        text: `«${payQ.name}» ${formatRubWhole(payQ.amount)} — ${formatDayMonth(payQ.date)}. По записям денег на него не хватало. Платёж прошёл?`,
        action: 'Да, прошёл',
        run: () => store.update((d) => confirmPaymentPaid(d, payQ.key)),
        more: [{ label: 'Нет', run: () => setSheet({ kind: 'delayPayment', key: payQ.key, name: payQ.name }) }],
      }
    : null;
  // Денег не хватает (3.26, п. 11): честно назвать нехватку и предложить, что можно сделать.
  const deficit = limit.status === 'ok' && limit.noFreeMoney ? monthlyDeficit(data, today) : null;
  const shortageReminder: Reminder | null =
    limit.status === 'ok' && limit.noFreeMoney
      ? {
          key: `shortage-${today}`,
          text:
            (limit.base < 0
              ? `До ${formatDayMonth(limit.horizon)} не хватает ${formatRubWhole((-limit.base) as Kopecks)}.`
              : `До ${formatDayMonth(limit.horizon)} свободных денег нет.`) +
            (deficit && deficit > 0 ? ` В месяц расходы больше доходов примерно на ${formatRubWhole(deficit)}.` : ''),
          action: 'Что можно сделать',
          run: () => {
            setChat(true);
            chatStore.send('Что можно сделать, если денег не хватает?');
          },
        }
      : null;
  // Отложенное несколько дней не переведено (3.26, п. 21).
  const setAsideReminder: Reminder | null =
    limit.status === 'ok' && setAsideReminderDue(data, limit, today)
      ? {
          key: `setaside-${limit.savePlan.periodKey}-${today}`,
          text: `Отложено ${formatRubWhole(limit.setAside)}. Перевели в накопления?`,
          action: 'Перевёл(а)',
          run: () => store.update((d) => transferSetAside(d, limit, today, Date.now(), newId)),
        }
      : null;
  // Раз в 2 недели — мягко про копию в файл (3.29): данные живут только в этом телефоне.
  const backupReminder: Reminder | null = backupDue(data, store.meta, today)
    ? {
        key: `backup-${today}`,
        text: 'Давно не было копии данных. Сохраним в файл? Это защита, если телефон потеряется или браузер очистится.',
        action: 'Сохранить копию',
        run: () => saveBackupFile(store, today),
        onLater: () => store.setMeta({ backupNudgeOn: today }),
      }
    : null;
  const reminder: Reminder | null = incomeReminder ?? paymentReminder ?? shortageReminder ?? (
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
        : setAsideReminder ??
          backupReminder ??
          (eveningDue
            ? {
                key: `evening-${today}`,
                text: 'Как прошёл день? Запишем траты и закроем его — это займёт минуту.',
                action: 'Закрыть день',
                run: () => setSheet({ kind: 'close', date: today }),
              }
            : null));
  const showReminder = reminder && !dismissed.includes(reminder.key);

  let mood = robotMood(spent, limit.status === 'ok' ? limit.dailyLimit : spent, limit.status === 'ok' && limit.noFreeMoney);
  let phrase: string;
  if (limit.status !== 'ok') {
    mood = 'calm';
    phrase = 'Для лимита нужен остаток основного счёта.';
  } else if (limit.noFreeMoney) {
    phrase = 'Денег сейчас впритык. Разберёмся спокойно, без паники.';
  } else if (mood === 'calm') {
    phrase = `Трат пока нет. Можно до ${formatRubWhole(limit.dailyLimit)}.`;
  } else if (mood === 'joy') {
    phrase = 'Идём в рамках дня, всё по плану.';
  } else if (transportOverMonth(data, today) > 0) {
    phrase = 'Транспорт в этом месяце дороже, чем вы указали: лишнее идёт из лимита.';
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
            {reminder.more?.map((m) => (
              <button key={m.label} type="button" className="btn btn-secondary" onClick={m.run}>
                {m.label}
              </button>
            ))}
            <button type="button" className="link-btn" onClick={() => {
                reminder.onLater?.();
                setDismissed((d) => [...d, reminder.key]);
              }}>
              Позже
            </button>
          </div>
        </div>
      )}

      {limit.status === 'noData' && (
        <div className="card notice fly" style={fly(1)}>
          <span>
            Чтобы посчитать лимит, укажите остаток основного счёта.
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
              <span>{limit.horizonIncome.key === STRETCH_KEY ? 'Дотянуть' : 'До зарплаты'}</span>
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
      <div ref={sceneRef} className="scene">
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
        <div className="chat-strip glass">
          <button type="button" className="chat-strip-open" onClick={() => setChat(true)} tabIndex={chat ? -1 : undefined}>
            <MessageCircle size={20} aria-hidden />
            <span>Спросить Флюми</span>
          </button>
          {/* Микрофон: сразу открывает чат и начинает запись */}
          {voice.supported && !chat && <MicButton voice={voice} onStart={() => setChat(true)} />}
        </div>
      </div>

      {chat && (
        <>
          <section className="chat-panel" aria-label="Чат с Флюми">
            <ChatThread chat={chatStore} />
          </section>
          <div ref={dockRef} className="chat-dock">
            <ChatInput chat={chatStore} inputRef={inputRef} voice={voice} />
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
          initial={sheet.initial}
          onClose={() => setSheet(null)}
          onConfirm={(key, amount, date, inBalance) => {
            store.confirmIncome(key, amount, date, inBalance);
            setSheet(null);
          }}
          onOneOff={(name, amount, date, inBalance) => {
            store.addReceivedOneOff(name, amount, date, inBalance);
            setSheet(null);
          }}
        />
      )}
      {sheet?.kind === 'delay' && (
        <DelaySheet
          name={sheet.income.name}
          today={today}
          onClose={() => setSheet(null)}
          onSave={(until) => {
            store.update((d) => delayIncome(d, sheet.income.key, until));
            setSheet(null);
          }}
        />
      )}
      {sheet?.kind === 'delayPayment' && (
        <DelaySheet
          name={sheet.name}
          today={today}
          payment
          onClose={() => setSheet(null)}
          onSave={(until) => {
            store.update((d) => delayPayment(d, sheet.key, until));
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
          onConfirm={(unsure) => {
            store.closeDay(sheet.date, unsure);
            setSheet(null);
          }}
        />
      )}
    </div>
  );
}
