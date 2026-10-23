import { ArrowUp, MessageCircle, Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { TYPICAL_QUESTIONS } from '../ai/assistant';
import { isSpeechSupported, SPEECH_ERRORS } from '../ai/speech';
import { useVoiceInput, type VoiceInput } from '../state/useVoiceInput';
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

/** Кнопка микрофона: красная во время записи, с волнами, когда слышен голос. */
export function MicButton({ voice, onStart }: { voice: VoiceInput; onStart?: () => void }) {
  return (
    <button
      type="button"
      className={`mic-btn${voice.listening ? ' is-on' : ''}${voice.hearing ? ' is-hearing' : ''}`}
      aria-label={voice.listening ? 'Остановить запись' : 'Спросить голосом'}
      aria-pressed={voice.listening}
      onClick={(e) => {
        e.stopPropagation();
        if (voice.listening) return voice.stop();
        voice.start();
        onStart?.();
      }}
    >
      {voice.listening ? <Square size={16} fill="currentColor" /> : <Mic size={20} />}
    </button>
  );
}

/**
 * Поле ввода вопроса: текстом или голосом (кнопка микрофона, если браузер умеет распознавать речь).
 * Сказанная фраза появляется в поле по мере речи и отправляется Флюми, когда человек замолчал.
 */
export function ChatInput({
  chat,
  inputRef,
  voice: outerVoice,
}: {
  chat: ChatStore;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Запись, начатая снаружи (кнопка микрофона на главной); иначе своя. */
  voice?: VoiceInput;
}) {
  const [question, setQuestion] = useState('');
  const ownVoice = useVoiceInput(chat);
  const voice = outerVoice ?? ownVoice;

  return (
    <div className="chat-input">
      {voice.error && !voice.listening && (
        <p className="chat-status is-error" role="alert">
          {SPEECH_ERRORS[voice.error]}
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
          value={voice.listening ? voice.interim : question}
          readOnly={voice.listening}
          onChange={(e) => {
            setQuestion(e.target.value);
            voice.clearError();
          }}
          placeholder={voice.listening ? 'Говорите…' : 'Спросить Флюми'}
          aria-label="Вопрос Флюми"
          enterKeyHint="send"
        />
        {voice.supported && <MicButton voice={voice} />}
        <button type="submit" className="send-btn" aria-label="Отправить">
          <ArrowUp size={20} />
        </button>
      </form>
    </div>
  );
}
