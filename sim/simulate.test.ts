// Прогон 10 персонажей через 45 дней пользования Флюми.
// Запуск:  $env:SIM=1; npx vitest run sim
// Журнал пишется в docs/simulation/log.md. Без SIM=1 тест пропускается (обычный npm test его не гоняет).
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulate } from './engine';
import { PERSONAS } from './personas';

const D0 = '2026-10-23';
const DAYS = 45;

describe.skipIf(!process.env.SIM)('симуляция 45 дней', () => {
  it('10 персонажей', () => {
    const out: string[] = [`# Журнал симуляции: 10 человек × ${DAYS} дней (с ${D0})`, ''];
    for (const p of PERSONAS) {
      const res = simulate(p, D0, DAYS);
      const s = res.summary;
      out.push(`## ${p.name}`, '', p.about, '');
      out.push(
        `Открывал приложение ${s.opened}/${DAYS} дн. · реально потрачено ${s.realSpent.toLocaleString('ru')} ₽, записано ${s.recSpent.toLocaleString('ru')} ₽ ` +
          `(${s.realSpent ? Math.round((s.recSpent / s.realSpent) * 100) : 0} %) · дней без лимита ${s.noData} · дней с лимитом 0 ${s.zeroLimit} · ` +
          `настроение ${JSON.stringify(s.moods)} · серия ${s.streak} · незакрытых дней ${s.unclosed} · ` +
          `не переведено в накопления ${s.setAsideLeft ?? '—'} ₽ · в конце: реально ${s.finalTrue.toLocaleString('ru')} ₽, в приложении ${s.finalApp.toLocaleString('ru')} ₽`,
        '',
      );
      const byKind = new Map<string, number>();
      for (const f of res.flags) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
      out.push('**Флаги:** ' + ([...byKind].map(([k, n]) => `${k} — ${n}`).join('; ') || 'нет'), '');
      for (const f of res.flags.slice(0, 40)) out.push(`- д${f.day} ${f.date.slice(5)} · ${f.kind}: ${f.text}`);
      if (res.flags.length > 40) out.push(`- … ещё ${res.flags.length - 40}`);
      out.push('', '| д | дата | откр | лимит | своб. | до | реал. трат | запис. | настр. | реально на счёте | в приложении | разн. | закр | заметки |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
      for (const r of res.rows) {
        out.push(
          `| ${r.day} | ${r.date.slice(5)} | ${r.opened ? '✓' : ''} | ${r.limit} | ${r.free} | ${r.horizon} | ${r.realSpent} | ${r.recSpent} | ${r.mood} | ${r.trueMain} | ${r.appMain} | ${r.diff} | ${r.closed ? '✓' : ''} | ${r.notes.join('; ')} |`,
        );
      }
      out.push('');
      // Инварианты ядра: деньги — целые копейки, лимит не отрицательный.
      for (const r of res.rows) {
        if (!r.limit.startsWith('нет')) expect(Number(r.limit)).toBeGreaterThanOrEqual(0);
      }
    }
    mkdirSync('docs/simulation', { recursive: true });
    writeFileSync('docs/simulation/log.md', out.join('\n'), 'utf8');
  });
});
