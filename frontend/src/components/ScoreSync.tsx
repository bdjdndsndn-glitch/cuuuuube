/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { api, formatTime, getInitData } from '../utils/api';
import { onSolve, SolveResult } from '../utils/gameBridge';
import { RecordCelebration } from './RecordCelebration';
import { playRecord, playWin } from '../utils/sound';

interface ScoreSyncProps {
  onDailySubmitted: () => void;
  onDuelSubmitted: () => void;
}

interface Toast {
  title: string;
  text: string;
}

/**
 * Після кожного зібраного кубика: надсилає результат у рейтинг / виклик дня / дуель,
 * показує святкування нового рекорду та коротке повідомлення про місце
 */
export function ScoreSync({ onDailySubmitted, onDuelSubmitted }: ScoreSyncProps) {
  const [record, setRecord] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (t: Toast) => {
    setToast(t);
    setTimeout(() => setToast(null), 4500);
  };

  useEffect(() => {
    return onSolve(async (r: SolveResult) => {
      if (r.isBest) {
        setRecord(formatTime(r.timeMs));
        playRecord();
      } else {
        playWin();
      }
      if (!getInitData()) return;

      try {
        if (r.daily) {
          const d = await api.submitDaily(r.daily.date, r.timeMs);
          onDailySubmitted();
          if (d.me) showToast({ title: 'Виклик дня', text: `Ваше місце сьогодні: #${d.me.rank} із ${d.total}` });
        }
        if (r.duel) {
          const d = await api.submitDuelScore(r.duel.code, r.timeMs);
          onDuelSubmitted();
          const myId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
          if (d.status !== 'finished') showToast({ title: 'Дуель', text: `Ваш час ${formatTime(r.timeMs)} збережено — чекаємо на суперника` });
          else if (d.winner_id === null) showToast({ title: 'Дуель', text: `Нічия! Однаковий час · +${d.reward_coins} монет` });
          else if (d.winner_id === myId) showToast({ title: 'Дуель', text: `Перемога! +${d.reward_coins} монет · серія ${d.my_streak}` });
          else showToast({ title: 'Дуель', text: 'Поразка — суперник був швидшим. Серію перемог скинуто' });
        }
        const s = await api.submitScore(r.size, r.timeMs);
        if (!r.daily && !r.duel) {
          showToast({
            title: s.is_new_best ? 'Рейтинг оновлено' : 'Результат зараховано',
            text: `Місце #${s.rank} серед гравців ${r.size}x${r.size}`,
          });
        }
        const ach = await api.achievements();
        if (ach.newly_unlocked.length) {
          const first = ach.items.find((a) => a.id === ach.newly_unlocked[0]);
          setTimeout(() => showToast({ title: 'Нове досягнення', text: first ? `${first.title} — ${first.desc}` : 'Відкрито у профілі' }), 4800);
        }
      } catch (e) {
        showToast({ title: 'Рейтинг', text: (e as Error).message || 'Не вдалося надіслати результат' });
      }
    });
  }, [onDailySubmitted, onDuelSubmitted]);

  const hideRecord = useCallback(() => setRecord(null), []);

  return (
    <>
      <RecordCelebration show={record !== null} timeLabel={record || ''} onDone={hideRecord} />
      {toast && (
        <div className="fixed left-0 right-0 flex justify-center pointer-events-none" style={{ top: 'max(16px, env(safe-area-inset-top, 16px))' }}>
          <div
            className="px-4 py-2 rounded-xl bg-slate-900/95 border border-sky-500/30 shadow-lg text-center animate-in fade-in slide-in-from-top-2 duration-300"
            data-testid="score-toast"
          >
            <div className="text-[10px] uppercase tracking-wider text-sky-300 font-bold">{toast.title}</div>
            <div className="text-xs text-white font-semibold">{toast.text}</div>
          </div>
        </div>
      )}
    </>
  );
}
