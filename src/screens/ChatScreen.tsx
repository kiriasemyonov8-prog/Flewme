// Чат, открытый из раздела по иконке Флюми или полоске «Спросить Флюми».
// Повторное нажатие на иконку возвращает в раздел.
import { MessageCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { RobotHead } from '../assets/character';
import type { Mood } from '../core/mood';
import type { ChatStore } from '../state/useChat';
import type { VoiceInput } from '../state/useVoiceInput';
import { ChatInput, ChatThread, MicButton } from '../ui/Chat';
import { DemoBadge } from '../ui/DemoBadge';

export function ChatScreen({
  chat,
  voice,
  mood,
  onBack,
}: {
  chat: ChatStore;
  voice: VoiceInput;
  mood: Mood;
  onBack: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Открыли микрофоном — фраза появится в поле сама, клавиатуру не поднимаем.
    if (!voice.listening) inputRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="chat-screen" aria-label="Чат с Флюми">
      <button type="button" className="flyumi-icon" aria-label="Вернуться в раздел" onClick={onBack}>
        <RobotHead expression={mood} />
      </button>
      <div className="chat-panel">
        <ChatThread chat={chat} />
      </div>
      <div className="chat-dock">
        <ChatInput chat={chat} inputRef={inputRef} voice={voice} />
      </div>
    </section>
  );
}

/**
 * Шапка раздела: иконка Флюми и рядом полоска «Спросить Флюми», как на главной (3.34).
 * Иконка и полоска открывают чат, микрофон сразу начинает запись вопроса голосом.
 */
export function SectionHeader({
  mood,
  isDemo,
  voice,
  onOpenChat,
}: {
  mood: Mood;
  isDemo: boolean;
  voice: VoiceInput;
  onOpenChat: () => void;
}) {
  return (
    <div className="section-header">
      {isDemo && <DemoBadge />}
      <div className="section-header-row">
        <button type="button" className="flyumi-icon" aria-label="Открыть чат с Флюми" onClick={onOpenChat}>
          <RobotHead expression={mood} />
        </button>
        <div className="chat-strip glass">
          <button type="button" className="chat-strip-open" onClick={onOpenChat}>
            <MessageCircle size={20} aria-hidden />
            <span>Спросить Флюми</span>
          </button>
          {voice.supported && <MicButton voice={voice} onStart={onOpenChat} />}
        </div>
      </div>
    </div>
  );
}
