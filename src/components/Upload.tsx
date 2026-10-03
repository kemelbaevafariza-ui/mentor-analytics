import { useState } from 'react';

export default function Upload({ onFile, busy, error }: { onFile: (f: File) => void; busy: boolean; error: string }) {
  const [over, setOver] = useState(false);
  return (
    <div className="upload-wrap">
      <label
        className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
      >
        <input type="file" accept=".xlsx,.xlsm" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <div className="dz-icon">⬆</div>
        <div className="dz-title">{busy ? 'Обработка файла…' : 'Перетащите файл Excel сюда'}</div>
        <div className="dz-sub">или нажмите, чтобы выбрать файл (.xlsx)</div>
      </label>
      {error && <div className="alert error">{error}</div>}
      <ol className="steps">
        <li><b>Загрузите</b> файл с листами «Стажеры и их наставники», «Дейст-щие Наставники» и (по желанию) «Аналитика по Наставникам».</li>
        <li><b>Проверьте ФИО</b>: приложение покажет похожие написания и спорные ячейки.</li>
        <li><b>Скачайте</b> готовую таблицу аналитики в Excel.</li>
      </ol>
      <p className="muted small">
        Файл обрабатывается прямо в браузере и никуда не отправляется. На этом компьютере сохраняются только ваши решения
        по ФИО и месяцам групп.
      </p>
    </div>
  );
}
