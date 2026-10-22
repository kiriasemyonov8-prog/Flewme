import { ArrowUp, MessageCircle } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { TYPICAL_QUESTIONS } from '../ai/assistant';
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
            Спросите про лимит, зарплату или покупку — отвечу с настоящими числами и покажу, откуда они. Чтобы
            вернуться, нажмите на меня слева сверху.
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

/** Поле ввода вопроса с кнопкой «Отправить». */
export function ChatInput({ chat, inputRef }: { chat: ChatStore; inputRef?: RefObject<HTMLInputElement | null> }) {
  const [question, setQuestion] = useState('');
  return (
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
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Спросить Флюми"
        aria-label="Вопрос Флюми"
        enterKeyHint="send"
      />
      <button type="submit" className="send-btn" aria-label="Отправить">
        <ArrowUp size={20} />
      </button>
    </form>
  );
}
