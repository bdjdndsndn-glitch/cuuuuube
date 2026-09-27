/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { api, DailyData, formatTime } from '../utils/api';
import { GAME_STATE, startDailyChallenge } from '../utils/gameBridge';
import { triggerLayerTurnVibration } from '../utils/haptics';
import { shareToTelegram } from '../utils/telegramAuth';
import { Sheet } from './Sheet';
import { LeaderList } from './LeaderList';

interface DailyChallengeProps {
  gameState: number;
  myUserId?: number;
  inTelegram: boolean;
  refreshKey: number;
}

function formatCountdown(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}г ${m < 10 ? '0' : ''}${m}хв`;
}

/**
 * Чіп «Виклик дня» на головному екрані + панель з рейтингом дня та кнопкою старту
 */
export function DailyChallenge({ gameState, myUserId, inTelegram, refreshKey }: DailyChallengeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<DailyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderMsg, setReminderMsg] = useState<string | null>(null);

  const flash = (msg: string) => {
    setReminderMsg(msg);
    setTimeout(() => setReminderMsg(null), 4000);
  };

  const toggleReminder = async () => {
    if (!data || reminderBusy) return;
    setReminderBusy(true);
    try {
      setData(await api.setReminder(!data.reminder_enabled));
      flash(!data.reminder_enabled ? 'Нагадування щоранку о 9:00 увімкнено' : 'Нагадування вимкнено');
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setReminderBusy(false);
    }
  };

  const sendDigest = async () => {
    if (reminderBusy) return;
    setReminderBusy(true);
    try {
      await api.sendTestDigest();
      flash('Тижневий дайджест надіслано — перевірте чат з ботом');
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setReminderBusy(false);
    }
  };

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .daily()
      .then(setData)
      .catch((e: Error) => setError(e.message || 'Не вдалося завантажити виклик дня'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [refreshKey]);
  useEffect(() => {
    if (isOpen) load();
  }, [isOpen]);

  const handlePlay = () => {
    if (!data) return;
    triggerLayerTurnVibration(30, true);
    if (startDailyChallenge(data.date, data.moves)) setIsOpen(false);
  };

  const shareResult = () => {
    if (!data?.me) return;
    triggerLayerTurnVibration(20, true);
    shareToTelegram(
      `⚡ Мій результат у «Виклику дня»: ${formatTime(data.me.time_ms)}, місце #${data.me.rank}. Зможеш швидше?`,
      window.location.origin,
    );
  };

  const leader = data?.top[0];
  const visible = gameState === GAME_STATE.Menu;

  return (
    <>
      {visible && (
        <div
          className="fixed left-0 right-0 flex justify-center pointer-events-none px-3"
          style={{ top: 'max(8px, calc(50% - 380px))', paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <button
            onClick={() => {
              triggerLayerTurnVibration(20, true);
              setIsOpen(true);
            }}
            data-testid="daily-chip"
            className="pointer-events-auto max-w-[calc(100vw-24px)] whitespace-nowrap overflow-hidden flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-900/90 hover:bg-slate-800 text-white text-[10px] leading-none font-semibold shadow-lg border border-amber-400/40 backdrop-blur-sm transition-all active:scale-95"
          >
            <span className="w-4 h-4 rounded-full bg-amber-400/20 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 fill-amber-300">
                <path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12L13 2z" />
              </svg>
            </span>
            <span className="truncate">Виклик дня</span>
            <span className="text-slate-400 font-normal">·</span>
            {data?.me ? (
              <span className="text-sky-300">#{data.me.rank} · {formatTime(data.me.time_ms)}</span>
            ) : leader ? (
              <span className="text-amber-200">{formatTime(leader.time_ms)} · {leader.name}</span>
            ) : (
              <span className="text-amber-200">будьте першим</span>
            )}
          </button>
        </div>
      )}

      <Sheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Виклик дня"
        subtitle={data ? `${data.date} · 3x3 · нове перемішування через ${formatCountdown(data.seconds_until_next)}` : 'Однакове перемішування для всіх'}
        testId="daily-panel"
        icon={
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-amber-300">
            <path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12L13 2z" />
          </svg>
        }
      >
        <p className="text-xs text-slate-300 leading-relaxed mb-3">
          Усі гравці отримують однакове перемішування кубика 3x3 на добу (за Києвом). Зберіть його якнайшвидше — найкращий час дня потрапляє в рейтинг.
        </p>

        <button
          onClick={handlePlay}
          disabled={!data || gameState !== GAME_STATE.Menu}
          data-testid="daily-play-button"
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 disabled:opacity-50 text-slate-950 font-black text-sm shadow-lg active:scale-[0.98] transition-all"
        >
          {data?.me ? `Покращити результат (${formatTime(data.me.time_ms)})` : 'Грати виклик дня'}
        </button>

        {data?.me && (
          <button
            onClick={shareResult}
            data-testid="daily-share-result"
            className="mt-2 w-full py-2.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-400/25 text-sky-200 font-bold text-xs active:scale-[0.98] transition-all"
          >
            <span className="inline-flex items-center justify-center gap-2">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="m8.7 10.7 6.6-4.4M8.7 13.3l6.6 4.4" />
              </svg>
              Поділитися результатом
            </span>
          </button>
        )}

        {inTelegram && data && (
          <div className="mt-3 p-3 rounded-xl bg-slate-950/70 border border-white/5" data-testid="reminder-box">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold">Нагадувати про виклик</div>
                <div className="text-[10px] text-slate-400">Бот напише щоранку о 9:00 (Київ)</div>
              </div>
              <button
                onClick={toggleReminder}
                disabled={reminderBusy}
                role="switch"
                aria-checked={data.reminder_enabled}
                data-testid="reminder-toggle"
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${data.reminder_enabled ? 'bg-emerald-500' : 'bg-slate-700'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${data.reminder_enabled ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
            <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span className="text-[10px] text-sky-300 min-h-[14px] min-w-0 break-words" data-testid="reminder-message">{reminderMsg || ''}</span>
              <div className="flex flex-wrap gap-1.5 shrink-0">
                <button
                  onClick={sendDigest}
                  disabled={reminderBusy}
                  data-testid="digest-test-button"
                  title="Щопонеділка о 9:00 бот надсилає підсумок вашого тижня"
                  className="text-[10px] px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-slate-300 whitespace-nowrap transition-colors disabled:opacity-50"
                >
                  Дайджест тижня
                </button>
              </div>
            </div>
          </div>
        )}

        <h4 className="mt-5 mb-2 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Найшвидші сьогодні</h4>
        <LeaderList
          entries={data?.top || []}
          me={data?.me || null}
          myUserId={myUserId}
          total={data?.total || 0}
          loading={loading && !data}
          error={error}
          emptyText="Сьогодні ще ніхто не зібрав виклик. Будьте першим!"
          inTelegram={inTelegram}
          friendIds={data?.friend_ids || []}
          onRetry={load}
        />
      </Sheet>
    </>
  );
}
