// Чат, открытый из раздела по иконке Флюми. Повторное нажатие на иконку возвращает в раздел.
import { useEffect, useRef } from 'react';
import { Robot } from '../assets/character';
import type { Mood } from '../core/mood';
import type { ChatStore } from '../state/useChat';
import { ChatInput, ChatThread } from '../ui/Chat';
import { DemoBadge } from '../ui/DemoBadge';

export function ChatScreen({ chat, mood, onBack }: { chat: ChatStore; mood: Mood; onBack: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="chat-screen" aria-label="Чат с Флюми">
      <button type="button" className="flyumi-icon" aria-label="Вернуться в раздел" onClick={onBack}>
        <Robot expression={mood} size={44} />
      </button>
      <div className="chat-panel">
        <ChatThread chat={chat} />
      </div>
      <div className="chat-dock">
        <ChatInput chat={chat} inputRef={inputRef} />
      </div>
    </section>
  );
}

/** Шапка раздела: иконка Флюми слева сверху открывает чат. */
export function SectionHeader({ mood, isDemo, onOpenChat }: { mood: Mood; isDemo: boolean; onOpenChat: () => void }) {
  return (
    <div className="section-header">
      <button type="button" className="flyumi-icon" aria-label="Открыть чат с Флюми" onClick={onOpenChat}>
        <Robot expression={mood} size={44} />
      </button>
      {isDemo && <DemoBadge />}
    </div>
  );
}
