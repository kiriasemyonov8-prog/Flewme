// Голосовой ввод вопроса Флюми (SPEC 3.21): распознавание речи силами браузера
// (Web Speech API). Речь распознаёт внешний сервис — Apple в Safari, Google в Chrome,
// поэтому в интерфейсе об этом честно сказано. Флюми голосом не отвечает.

/** Минимальное описание API распознавания: в стандартных типах TypeScript его нет. */
interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** Умеет ли этот браузер распознавать речь. */
export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && recognitionCtor() !== undefined;
}

export type SpeechError = 'insecure' | 'denied' | 'noSpeech' | 'network' | 'other';

export const SPEECH_ERRORS: Record<SpeechError, string> = {
  insecure: 'Микрофон в браузере работает только по защищённой ссылке (https). Он заработает, когда приложение будет опубликовано.',
  denied: 'Нет доступа к микрофону. Разрешите его для этого сайта в настройках браузера.',
  noSpeech: 'Не расслышал. Нажмите на микрофон и скажите ещё раз.',
  network: 'Для распознавания речи нужен интернет.',
  other: 'Не получилось распознать речь. Попробуйте ещё раз или напишите текстом.',
};

export interface ListenHandlers {
  /** Промежуточный текст, пока человек говорит. */
  onInterim: (text: string) => void;
  /** Итоговая фраза. */
  onFinal: (text: string) => void;
  onError: (error: SpeechError) => void;
  /** Распознавание закончилось (после итога, ошибки или остановки). */
  onEnd: () => void;
}

/** Начать слушать одну фразу на русском. Возвращает функцию «остановить». */
export function listen(h: ListenHandlers): () => void {
  if (!window.isSecureContext) {
    h.onError('insecure');
    h.onEnd();
    return () => {};
  }
  const Ctor = recognitionCtor();
  if (!Ctor) {
    h.onError('other');
    h.onEnd();
    return () => {};
  }
  const rec = new Ctor();
  rec.lang = 'ru-RU';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  let finalText = '';
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    h.onInterim((finalText + interim).trim());
  };
  rec.onerror = (e) => {
    const map: Record<string, SpeechError> = {
      'not-allowed': 'denied',
      'service-not-allowed': 'denied',
      'no-speech': 'noSpeech',
      network: 'network',
      aborted: 'other',
    };
    if (e.error !== 'aborted') h.onError(map[e.error] ?? 'other');
  };
  rec.onend = () => {
    if (finalText.trim()) h.onFinal(finalText.trim());
    h.onEnd();
  };
  rec.start();
  return () => rec.stop();
}
