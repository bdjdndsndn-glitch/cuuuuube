/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { useTonWallet, useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import { api, Mission, MissionsData } from '../utils/api';
import { GAME_STATE } from '../utils/gameBridge';
import { triggerLayerTurnVibration } from '../utils/haptics';
import { FullPage } from './FullPage';
import { AdRewardCard } from './AdRewardCard';

interface DailyMissionProps {
  gameState: number;
  inTelegram: boolean;
}

// Календар з галочкою — нативний гліф, як у решти іконок гри
const calendarIcon = (
  <svg viewBox="0 0 448 512" className="w-5 h-5 fill-current">
    <path d="M152 24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H64C28.7 64 0 92.7 0 128v16 48V448c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V192 144 128c0-35.3-28.7-64-64-64H344V24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H152V24zM48 192H400V448c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192zm289 89c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-79 79-31-31c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l48 48c9.4 9.4 24.6 9.4 33.9 0l96-96z" />
  </svg>
);

const coinIcon = (
  <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-yellow-100 via-amber-400 to-orange-600 shadow-[inset_-1px_-2px_2px_rgba(120,53,15,0.45),inset_1px_1px_2px_rgba(255,255,255,0.8),0_2px_4px_rgba(120,53,15,0.35)] [transform:rotateX(12deg)]" aria-hidden="true">
    <span className="absolute inset-[2px] flex items-center justify-center rounded-full border border-yellow-50/80 bg-gradient-to-br from-amber-300 to-yellow-500 text-[8px] font-black leading-none text-orange-800">C</span>
    <span className="absolute -bottom-0.5 left-0.5 right-0.5 h-1 rounded-full bg-orange-700/45 blur-[1px]" />
  </span>
);

/**
 * Щоденні завдання: нативна іконка-календар у нижньому ряду + панель завдань
 * (підписка на канал/чат, підключення TON-гаманця) з нарахуванням ігрових монет.
 */
export function DailyMission({ gameState, inTelegram }: DailyMissionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<MissionsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const wallet = useTonWallet();
  const address = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 4000);
  };

  const load = () => {
    if (!inTelegram) return;
    setLoading(true);
    setError(null);
    api
      .missions()
      .then(setData)
      .catch((e: Error) => setError(e.message || 'Не вдалося завантажити завдання'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen]);

  // Підвантажуємо завдання у меню (лише в Telegram), щоб показати лічильник на іконці
  useEffect(() => {
    if (inTelegram && !isOpen && (gameState === GAME_STATE.Menu || gameState < 0)) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inTelegram, gameState]);

  const handleClaim = async (m: Mission) => {
    if (busyId) return;
    if (m.type === 'wallet' && !wallet) {
      triggerLayerTurnVibration(30, true);
      tonConnectUI.openModal().catch(() => {});
      return;
    }
    setBusyId(m.id);
    try {
      const res = await api.claimMission(
        m.id,
        m.type === 'wallet' ? address : undefined,
        m.type === 'group_comment' ? 'Я у грі' : undefined,
      );
      setData(res);
      triggerLayerTurnVibration(30, true);
      flash(`+${m.reward} монет за «${m.title}»`);
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const visible = gameState === GAME_STATE.Menu || gameState < 0;
  const allDone = Boolean(data && data.items.length > 0 && data.items.every((i) => i.completed));
  const unclaimed = data ? data.items.filter((i) => !i.completed).length : 0;

  return (
    <>
      {visible && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            triggerLayerTurnVibration(20, true);
            setIsOpen(true);
          }}
          data-testid="missions-button"
          aria-label="Щоденні завдання"
          title="Щоденні завдання"
          className="btn--daily btn-daily-native flex items-center justify-center transition-colors"
          style={{
            position: 'fixed',
            zIndex: 40,
            lineHeight: 0,
            left: '62.5%',
            bottom: 'max(0.96rem, env(safe-area-inset-bottom, 0.96rem))',
            transform: 'translateX(-50%)',
          }}
        >
          <svg viewBox="0 0 448 512" className="fill-current pointer-events-none" style={{ width: '26px', height: '26px' }}>
            <path d="M152 24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H64C28.7 64 0 92.7 0 128v16 48V448c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V192 144 128c0-35.3-28.7-64-64-64H344V24c0-13.3-10.7-24-24-24s-24 10.7-24 24V64H152V24zM48 192H400V448c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192zm289 89c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-79 79-31-31c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l48 48c9.4 9.4 24.6 9.4 33.9 0l96-96z" />
          </svg>
          {inTelegram && unclaimed > 0 && (
            <span
              data-testid="missions-badge"
              className="pointer-events-none absolute flex items-center justify-center rounded-full bg-sky-500/90 text-white font-bold"
              style={{ top: '-3px', right: '-5px', minWidth: '15px', height: '15px', padding: '0 4px', fontSize: '10px', lineHeight: 1, boxShadow: '0 0 0 2px rgba(11,18,32,0.9)' }}
            >
              {unclaimed}
            </span>
          )}
        </button>
      )}

      <FullPage
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Щоденні завдання"
        subtitle="Виконуй завдання — отримуй монети"
        testId="missions-panel"
        icon={calendarIcon}
        glow="rgba(251,191,36,0.14)"
        badgeClass="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400/25 to-orange-600/15 border border-amber-300/30 flex items-center justify-center text-amber-300 shadow-lg shadow-amber-500/10 shrink-0"
      >
        {!inTelegram ? (
          <div className="text-center py-4" data-testid="missions-locked">
            <div className="mx-auto w-16 h-16 rounded-3xl bg-slate-800 border border-white/10 flex items-center justify-center text-amber-300">{calendarIcon}</div>
            <h4 className="mt-3 text-sm font-extrabold text-white">Завдання доступні в Telegram</h4>
            <p className="mt-1.5 text-xs text-slate-300 leading-relaxed max-w-xs mx-auto">
              Відкрийте гру через Telegram-бота, щоб виконувати завдання й отримувати монети на свій рахунок.
            </p>
            <a
              href="https://t.me/the_cube_game_bot"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition-all active:scale-95 shadow-lg shadow-sky-500/25"
              data-testid="missions-open-telegram"
            >
              Відкрити в Telegram
            </a>
          </div>
        ) : (
          <>
            <div className="min-h-[16px] mb-2 text-center text-[11px] text-amber-300 font-semibold" data-testid="missions-message">
              {msg || ''}
            </div>

            <AdRewardCard inTelegram={inTelegram} flash={flash} onCredited={load} />

            {loading && !data ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-20 rounded-2xl bg-slate-800/50 animate-pulse" />
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-6">
                <p className="text-xs text-rose-300">{error}</p>
                <button onClick={load} className="mt-3 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-semibold transition-colors" data-testid="missions-retry">
                  Спробувати ще раз
                </button>
              </div>
            ) : (
              <>
                {allDone && (
                  <div className="mb-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-400/25 text-center" data-testid="missions-empty">
                    <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-300">
                      <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current"><path d="M9 16.2l-3.5-3.5-1.4 1.4L9 19 20 8l-1.4-1.4z" /></svg>
                    </div>
                    <h4 className="mt-2 text-sm font-extrabold text-white">Усі завдання виконано!</h4>
                    <p className="mt-1 text-xs text-slate-300">Повертайтесь завтра за новими завданнями.</p>
                  </div>
                )}
                <div className="space-y-2">
                  {data?.items.map((m) => (
                    <div
                      key={m.id}
                      data-testid={`mission-${m.id}`}
                      className={`p-3 rounded-2xl border flex items-center gap-3 transition-colors ${m.completed ? 'bg-emerald-500/10 border-emerald-400/25' : 'bg-slate-950/60 border-white/5'}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-white truncate">{m.title}</div>
                        <div className="text-[11px] text-slate-400 leading-snug mt-0.5">{m.desc}</div>
                        <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-300 font-bold">
                          {coinIcon} +{m.reward}
                        </div>
                      </div>

                      {m.completed ? (
                        <span className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-emerald-400" data-testid={`mission-done-${m.id}`}>
                          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M9 16.2l-3.5-3.5-1.4 1.4L9 19 20 8l-1.4-1.4z" /></svg>
                          Виконано
                        </span>
                      ) : (
                        <div className="flex flex-col gap-1.5 shrink-0">
                          {m.link && (
                            <a
                              href={m.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => triggerLayerTurnVibration(15, true)}
                              className="px-3 py-1.5 rounded-lg bg-sky-600/30 hover:bg-sky-600/45 border border-sky-500/30 text-sky-200 text-[11px] font-semibold text-center transition-all active:scale-95"
                              data-testid={`mission-open-${m.id}`}
                            >
                              Підписатись
                            </a>
                          )}
                          <button
                            onClick={() => handleClaim(m)}
                            disabled={busyId === m.id}
                            data-testid={`mission-claim-${m.id}`}
                            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 disabled:opacity-50 text-slate-950 text-[11px] font-black text-center transition-all active:scale-95"
                          >
                            {busyId === m.id ? '…' : m.type === 'wallet' ? (wallet ? 'Отримати' : 'Підключити') : 'Перевірити'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </FullPage>
    </>
  );
}
