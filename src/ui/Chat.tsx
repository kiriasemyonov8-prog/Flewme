import { ArrowUp, MessageCircle, Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { TYPICAL_QUESTIONS } from '../ai/assistant';
import { isSpeechSupported, listen, SPEECH_ERRORS, type SpeechError } from '../ai/speech';
import type { ChatStore } from '../state/useChat';

/** Лента сообщений: подсказки с типовыми вопросами, ответы с пометкой «демо». */
export function ChatThread({ chat }: { chat: ChatStore }) {
  const endRef = useRef<HTMLDivElement>(null);

  // Новые сообщения всегда видны.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.messages]);

  return (
    <>
      {chat.messages.length === 0 && (
        <>
          <div className="chat-msg">
            Спросите про лимит, зарплату или покупку — отвечу с настоящими числами и покажу, откуда они.
            {isSpeechSupported() && ' Можно и голосом: кнопка микрофона в поле ввода.'} Чтобы вернуться, нажмите на
            меня слева сверху.
            <span className="demo-tag">демо</span>
          </div>
          <div className="chips">
            {TYPICAL_QUESTIONS.map((q) => (
              <button key={q} type="button" className="chip" onClick={() => chat.send(q)}>
                {q}
              </button>
            ))}
          </div>
        </>
      )}
      {chat.messages.map((m, i) => (
        <div key={i} className={`chat-msg${m.from === 'user' ? ' from-user' : ''}`}>
          {m.text}
          {m.from === 'flyumi' && <span className="demo-tag">демо</span>}
        </div>
      ))}
      <div ref={endRef} />
    </>
  );
}

/**
 * Поле ввода вопроса: текстом или голосом (кнопка микрофона, если браузер умеет распознавать речь).
 * Сказанная фраза появляется в поле по мере речи и отправляется Флюми, когда человек замолчал.
 */
export function ChatInput({ chat, inputRef }: { chat: ChatStore; inputRef?: RefObject<HTMLInputElement | null> }) {
  const [question, setQuestion] = useState('');
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState<SpeechError | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  // Ушли с экрана чата — перестаём слушать.
  useEffect(() => () => stopRef.current?.(), []);

  function toggleMic() {
    if (listening) {
      stopRef.current?.();
      return;
    }
    setSpeechError(null);
    setListening(true);
    setQuestion('');
    stopRef.current = listen({
      onInterim: setQuestion,
      onFinal: (text) => {
        chat.send(text);
        setQuestion('');
      },
      onError: setSpeechError,
      onEnd: () => {
        setListening(false);
        stopRef.current = null;
      },
    });
  }

  return (
    <div className="chat-input">
      {listening && (
        <p className="chat-status" role="status">
          <span className="rec-dot" aria-hidden /> Слушаю… Речь распознаёт сервис Apple или Google — фраза передаётся им.
        </p>
      )}
      {speechError && !listening && (
        <p className="chat-status is-error" role="alert">
          {SPEECH_ERRORS[speechError]}
        </p>
      )}
      <form
        className="chat-form glass"
        onSubmit={(e) => {
          e.preventDefault();
          chat.send(question);
          setQuestion('');
        }}
      >
        <MessageCircle size={20} aria-hidden />
        <input
          ref={inputRef}
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
            setSpeechError(null);
          }}
          placeholder={listening ? 'Говорите…' : 'Спросить Флюми'}
          aria-label="Вопрос Флюми"
          enterKeyHint="send"
        />
        {isSpeechSupported() && (
          <button
            type="button"
            className={`mic-btn${listening ? ' is-on' : ''}`}
            aria-label={listening ? 'Остановить запись' : 'Спросить голосом'}
            aria-pressed={listening}
            onClick={toggleMic}
          >
            {listening ? <Square size={16} fill="currentColor" /> : <Mic size={20} />}
          </button>
        )}
        <button type="submit" className="send-btn" aria-label="Отправить">
          <ArrowUp size={20} />
        </button>
      </form>
    </div>
  );
}
