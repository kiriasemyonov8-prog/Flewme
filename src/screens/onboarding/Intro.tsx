// Первый вход (SPEC 3.27): приветствие и три карточки о функциях.
import { Mic, ShoppingBag, Wallet, type LucideIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { characterBackground, Robot, type Expression } from '../../assets/character';

/**
 * Приветствие: комната Флюми в круглом «иллюминаторе», а сам Флюми крупно стоит перед ним —
 * голова выходит за круг, снизу он обрезан краем сцены.
 */
function Porthole() {
  return (
    <div className="hero-porthole">
      <div className="porthole-window">
        <img src={characterBackground} alt="" draggable={false} />
      </div>
      <div className="porthole-robot">
        <Robot expression="joy" />
      </div>
    </div>
  );
}

/**
 * Как показан Флюми на карточке — каждая выглядит по-своему:
 * limit — без фона, опирается на карточку «На сегодня» (пример числа);
 * chat — небольшой, рядом пример переписки «кофе 250»;
 * closeup — крупно, по грудь, без фона, низ плавно растворяется.
 */
type Look = 'limit' | 'chat' | 'closeup';

function Figure({ mood, look }: { mood: Expression; look: Look }) {
  return (
    <div className={`card-figure figure-${look}`}>
      {look === 'limit' && (
        <div className="figure-stat" aria-hidden>
          <span className="figure-stat-label">Например, на сегодня</span>
          <span className="figure-stat-value num">1 050 ₽</span>
          <span className="figure-stat-note">можно потратить</span>
        </div>
      )}
      {look === 'chat' && (
        <div className="figure-bubbles" aria-hidden>
          <span className="bubble bubble-user">кофе 250</span>
          <span className="bubble bubble-flyumi">Записал в «Еду». На сегодня осталось 800 ₽</span>
        </div>
      )}
      <div className="figure-robot">
        <Robot expression={mood} />
      </div>
    </div>
  );
}

export function Welcome({ onStart, onDemo }: { onStart: () => void; onDemo: () => void }) {
  return (
    <div className="onboard onboard-welcome">
      <Porthole />
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

// Эмоции чередуются: приветствие — радость, дальше спокойствие, радость, спокойствие.
const CARDS: { Icon: LucideIcon; mood: Expression; look: Look; title: string; text: string }[] = [
  {
    Icon: Wallet,
    mood: 'calm',
    look: 'limit',
    title: 'Лимит на сегодня',
    text: 'Флюми учитывает зарплату, обязательные платежи и откладывание и говорит, сколько можно потратить сегодня, чтобы хватило до дохода.',
  },
  {
    Icon: Mic,
    mood: 'joy',
    look: 'chat',
    title: 'Траты за секунду',
    text: 'Записывайте кнопкой, голосом или просто напишите в чат «кофе 250». Вечером закройте день одним касанием.',
  },
  {
    Icon: ShoppingBag,
    mood: 'calm',
    look: 'closeup',
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
        {CARDS.map(({ Icon, mood, look, title, text }) => (
          <section key={title} className="feature-card">
            <Figure mood={mood} look={look} />
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
