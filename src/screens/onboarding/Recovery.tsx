// Сохранённые данные не читаются (SPEC 3.29): не роняем приложение и ничего не затираем молча.
import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { RobotHead } from '../../assets/character';
import { importBackup, type ImportError } from '../../core/backup';
import type { FinanceData } from '../../core/types';

const IMPORT_ERRORS: Record<ImportError, string> = {
  notJson: 'Этот файл не похож на копию Флюми.',
  notFlyumi: 'Этот файл не похож на копию Флюми.',
  newerVersion: 'Копия сделана более новой версией приложения.',
  broken: 'Файл копии повреждён, восстановить из него нельзя.',
};

export function Recovery({
  reason,
  onRestore,
  onStartOver,
}: {
  reason: 'damaged' | 'newer';
  onRestore: (data: FinanceData) => void;
  onStartOver: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOver, setConfirmOver] = useState(false);

  async function pick(file: File) {
    const result = importBackup(await file.text());
    if (typeof result === 'string') return setError(IMPORT_ERRORS[result]);
    onRestore(result);
  }

  return (
    <div className="onboard onboard-quiz">
      <div className="quiz-say">
        <span className="flyumi-icon quiz-avatar">
          <RobotHead expression="sad" />
        </span>
        <p>
          {reason === 'newer'
            ? 'Данные сохранены более новой версией Флюми. Обновите приложение — и всё откроется.'
            : 'Не получилось прочитать сохранённые данные. Без паники: я их не стёр, давайте восстановим.'}
        </p>
      </div>
      <h1 className="onboard-title quiz-title">Восстановить данные</h1>
      <p className="onboard-text">
        Если вы сохраняли копию в файл («Профиль → Данные → Сохранить копию в файл»), выберите её — всё вернётся как было.
      </p>
      <button type="button" className="btn btn-primary btn-wide btn-big" onClick={() => fileRef.current?.click()}>
        <Upload size={18} aria-hidden /> Восстановить из файла
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void pick(f);
        }}
      />
      {error && <p className="field-error">{error}</p>}
      <div className="onboard-actions">
        {confirmOver ? (
          <>
            <p className="hint onboard-note">
              Начать с чистого листа? Нечитаемая запись останется отложенной в браузере, но приложение её не покажет.
            </p>
            <button type="button" className="btn btn-secondary btn-wide" onClick={onStartOver}>
              Да, начать заново
            </button>
          </>
        ) : (
          <button type="button" className="link-btn" onClick={() => setConfirmOver(true)}>
            Копии нет — начать заново
          </button>
        )}
      </div>
    </div>
  );
}
