// Первый вход (SPEC 3.27): приветствие и три карточки о функциях.
import { Mic, ShoppingBag, Wallet, type LucideIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { characterBackground, Robot, type Expression } from '../../assets/character';

/** Флюми в своей комнате (фон с главной): фон обрезается по бокам, Флюми — снизу. */
function Scene({ mood, className }: { mood: Expression; className: string }) {
  return (
    <div className={`onboard-scene ${className}`}>
      <img className="onboard-scene-bg" src={characterBackground} alt="" draggable={false} />
      <div className="onboard-scene-robot">
        <Robot expression={mood} />
      </div>
    </div>
  );
}

export function Welcome({ onStart, onDemo }: { onStart: () => void; onDemo: () => void }) {
  return (
    <div className="onboard onboard-welcome">
      <Scene mood="joy" className="scene-welcome" />
      <h1 className="onboard-title">Привет, я Флюми</h1>
      <p className="onboard-text">
        Помогу каждый день знать, сколько можно потратить, чтобы спокойно дотянуть до зарплаты и копить на цели.
      </p>
      <div className="onboard-actions">
        <button type="button" className="btn btn-primary btn-wide btn-big" onClick={onStart}>
          Начать
        </button>
        <button type="button" className="link-btn" onClick={onDemo}>
          Посмотреть демо
        </button>
      </div>
    </div>
  );
}

const CARDS: { Icon: LucideIcon; mood: Expression; title: string; text: string }[] = [
  {
    Icon: Wallet,
    mood: 'calm',
    title: 'Лимит на сегодня',
    text: 'Флюми учитывает зарплату, обязательные платежи и откладывание и говорит, сколько можно потратить сегодня, чтобы хватило до дохода.',
  },
  {
    Icon: Mic,
    mood: 'joy',
    title: 'Траты за секунду',
    text: 'Записывайте кнопкой, голосом или просто напишите в чат «кофе 250». Вечером закройте день одним касанием.',
  },
  {
    Icon: ShoppingBag,
    mood: 'joy',
    title: 'Покупки и цели',
    text: 'Перед крупной покупкой Флюми честно скажет, потянете ли вы её и что будет с целями. И подскажет, как накопить.',
  },
];

/** Карточки листаются свайпом (прокрутка с привязкой) или кнопкой «Далее». */
export function FeatureCards({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollEnd = useRef<number | undefined>(undefined);

  function go(i: number) {
    const track = trackRef.current;
    if (!track) return;
    // Номер карточки меняется сразу, не дожидаясь конца плавной прокрутки, — быстрые нажатия не теряются.
    setIndex(i);
    track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
  }

  const last = index === CARDS.length - 1;
  return (
    <div className="onboard onboard-cards">
      <div className="onboard-top">
        <button type="button" className="link-btn" onClick={onDone}>
          Пропустить
        </button>
      </div>
      <div
        ref={trackRef}
        className="cards-track"
        onScroll={(e) => {
          // Свайп пальцем: номер карточки берём, когда прокрутка остановилась.
          const t = e.currentTarget;
          window.clearTimeout(scrollEnd.current);
          scrollEnd.current = window.setTimeout(() => setIndex(Math.round(t.scrollLeft / Math.max(1, t.clientWidth))), 120);
        }}
      >
        {CARDS.map(({ Icon, mood, title, text }) => (
          <section key={title} className="feature-card">
            <Scene mood={mood} className="scene-card" />
            <div className="feature-icon">
              <Icon size={22} aria-hidden />
            </div>
            <h2 className="onboard-title">{title}</h2>
            <p className="onboard-text">{text}</p>
          </section>
        ))}
      </div>
      <div className="cards-dots" aria-hidden>
        {CARDS.map((c, i) => (
          <span key={c.title} className={i === index ? 'is-on' : ''} />
        ))}
      </div>
      <div className="onboard-actions">
        <button type="button" className="btn btn-primary btn-wide btn-big" onClick={() => (last ? onDone() : go(index + 1))}>
          {last ? 'Заполнить анкету' : 'Далее'}
        </button>
        {last && <p className="hint onboard-note">7 коротких вопросов, около 2 минут. Последние три можно пропустить.</p>}
      </div>
    </div>
  );
}
