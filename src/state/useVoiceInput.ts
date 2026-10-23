// Голосовой ввод вопроса: состояние записи для поля чата. Вынесено в хук, чтобы запись
// можно было начать прямо из нажатия на главной (браузеры разрешают микрофон только
// в ответ на нажатие) и продолжить в открывшемся чате.
import { useCallback, useEffect, useRef, useState } from 'react';
import { isSpeechSupported, listen, type SpeechError } from '../ai/speech';
import type { ChatStore } from './useChat';

export interface VoiceInput {
  supported: boolean;
  listening: boolean;
  /** Слышен голос — кнопка пульсирует. */
  hearing: boolean;
  /** Что уже распознано, пока человек говорит. */
  interim: string;
  error: SpeechError | null;
  start: () => void;
  stop: () => void;
  clearError: () => void;
}

export function useVoiceInput(chat: ChatStore): VoiceInput {
  const [listening, setListening] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<SpeechError | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  // Последняя версия отправки: фраза может закончиться уже после новых сообщений.
  const sendRef = useRef(chat.send);
  sendRef.current = chat.send;

  const stop = useCallback(() => stopRef.current?.(), []);

  // Ушли с экрана — перестаём слушать.
  useEffect(() => stop, [stop]);

  function start() {
    if (stopRef.current) return;
    setError(null);
    setInterim('');
    setListening(true);
    stopRef.current = listen({
      onInterim: setInterim,
      onFinal: (text) => {
        sendRef.current(text);
        setInterim('');
      },
      onHearing: setHearing,
      onError: setError,
      onEnd: () => {
        setListening(false);
        setHearing(false);
        setInterim('');
        stopRef.current = null;
      },
    });
  }

  return {
    supported: isSpeechSupported(),
    listening,
    hearing,
    interim,
    error,
    start,
    stop,
    clearError: () => setError(null),
  };
}
