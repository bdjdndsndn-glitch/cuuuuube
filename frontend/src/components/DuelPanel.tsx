/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { api, Duel, DuelStats, duelLink, formatTime } from '../utils/api';
import { GAME_STATE, startDuel } from '../utils/gameBridge';
import { triggerLayerTurnVibration } from '../utils/haptics';
import { shareToTelegram } from '../utils/telegramAuth';
import { FullPage } from './FullPage';
import { DuelCard, statusLabel, swordsIcon } from './DuelCard';

interface DuelPanelProps {
  gameState: number;
  myUserId?: number;
  inTelegram: boolean;
  refreshKey: number;
  initialCode: string | null;
  onInitialConsumed: () => void;
  onOpenChange: (open: boolean) => void;
}

const SIZES = [2, 3, 4, 5];

/**
 * Дуелі з друзями: створення виклику з посиланням у Telegram, прийняття виклику
 * за deep-link (startapp=duel_CODE), однакове перемішування для обох, результат видно обом.
 */
export function DuelPanel({ gameState, myUserId, inTelegram, refreshKey, initialCode, onInitialConsumed, onOpenChange }: DuelPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [list, setList] = useState<Duel[]>([]);
  const [stats, setStats] = useState<DuelStats | null>(null);
  const [selected, setSelected] = useState<Duel | null>(null);
  const [size, setSize] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => onOpenChange(isOpen), [isOpen]);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 4000);
  };

  const loadList = () => {
    if (!inTelegram) return;
    api.duels().then(setList).catch(() => {});
    api.duelStats().then(setStats).catch(() => {});
  };

  useEffect(loadList, [inTelegram, refreshKey]);
  useEffect(() => {
    if (isOpen) loadList();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !inTelegram || selected?.status === 'finished') return;
    let active = true;
    const refresh = () => {
      if (selected) {
        void api.duel(selected.code).then((duel) => {
          if (active) setSelected(duel);
        }).catch(() => {});
      } else {
        void api.duels().then((duels) => {
          if (active) setList(duels);
        }).catch(() => {});
      }
    };
    const timer = window.setInterval(refresh, 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [inTelegram, isOpen, selected?.code, selected?.status]);

  // Відкриття дуелі за deep-link: показуємо її та приєднуємось, якщо є вільне місце
  useEffect(() => {
    if (!initialCode) return;
    setIsOpen(true);
    setBusy(true);
    const load = inTelegram ? api.joinDuel(initialCode).catch(() => api.duel(initialCode)) : api.duel(initialCode);
    load
      .then(setSelected)
      .catch((e: Error) => setError(e.message))
      .finally(() => {
        setBusy(false);
        onInitialConsumed();
      });
  }, [initialCode, inTelegram]);

  // Оновлюємо відкриту дуель після власного результату
  useEffect(() => {
    if (selected) api.duel(selected.code).then(setSelected).catch(() => {});
  }, [refreshKey]);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const d = await api.createDuel(size);
      triggerLayerTurnVibration(30, true);
      setSelected(d);
      setList((l) => [d, ...l]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const share = (d: Duel) => {
    triggerLayerTurnVibration(20, true);
    shareToTelegram(`⚔️ Викликаю тебе на дуель у THE CUBE! Кубик ${d.size}x${d.size}, однакове перемішування — хто швидше?`, duelLink(d.code));
  };

  const copyInvite = async (d: Duel) => {
    try {
      await navigator.clipboard.writeText(duelLink(d.code));
      triggerLayerTurnVibration(20, true);
      flash('Посилання на дуель скопійовано');
    } catch {
      flash('Не вдалося скопіювати посилання');
    }
  };

  const play = (d: Duel) => {
    triggerLayerTurnVibration(30, true);
    if (startDuel(d.code, d.size, d.moves)) setIsOpen(false);
    else flash('Поверніться в меню гри, щоб почати дуель');
  };

  const cancel = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await api.cancelDuel(selected.code);
      setList((l) => l.filter((d) => d.code !== selected.code));
      setSelected(null);
      flash('Дуель скасована');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const visible = gameState === GAME_STATE.Menu;
  const pending = list.filter((d) => d.can_play).length;
  const streak = stats?.streak ?? 0;

  return (
    <>
      {visible && (
        <button
          onClick={() => {
            triggerLayerTurnVibration(20, true);
            setIsOpen(true);
          }}
          data-testid="duel-open-button"
          aria-label="Дуелі з друзями"
          title="Дуелі з друзями"
          className="pointer-events-auto fixed z-40 h-12 overflow-visible rounded-full bg-slate-900/90 hover:bg-slate-800 text-rose-300 shadow-lg border border-rose-400/40 backdrop-blur-sm flex items-center justify-center gap-1 transition-all active:scale-95"
          style={{ top: 'max(14px, env(safe-area-inset-top, 14px))', right: '14px', padding: streak > 0 ? '0 10px 0 8px' : '0', width: streak > 0 ? 'auto' : '48px' }}
        >
          {swordsIcon}
          <span className="duel-label pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[9px] font-extrabold uppercase tracking-wide">Дуелі</span>
          {streak > 0 && (
            <span data-testid="duel-streak" className="flex items-center gap-0.5 text-amber-300 text-xs font-black">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M12 23c-4.4 0-8-3.2-8-7.6 0-3 1.7-5.2 3.3-7.1.4-.5 1.2-.2 1.2.4.1 1.3.5 2.3 1.4 3 .3-3.2 1.7-6.6 5-8.6.5-.3 1.2.1 1.1.7-.2 1.6.2 3 1.2 4.3 1.6 2 2.8 4.1 2.8 7.3 0 4.4-3.6 7.6-8 7.6z" /></svg>
              {streak}
            </span>
          )}
          {pending > 0 && (
            <span
              data-testid="duel-badge"
              className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center"
            >
              {pending}
            </span>
          )}
        </button>
      )}

      <FullPage
        isOpen={isOpen}
        onClose={() => {
          if (selected) setSelected(null);
          else setIsOpen(false);
        }}
        title={selected ? `Дуель ${selected.size}x${selected.size}` : 'Дуелі'}
        subtitle={selected ? `Код ${selected.code} · ${statusLabel[selected.status]}` : 'Виклич друга — однаковий скрембл, хто швидше'}
        testId="duel-panel"
        icon={swordsIcon}
        glow="rgba(244,63,94,0.16)"
        badgeClass="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500/25 to-orange-600/15 border border-rose-300/30 flex items-center justify-center text-rose-300 shadow-lg shadow-rose-500/10 shrink-0"
      >
        <div className="min-h-[16px] mb-2 text-center text-[11px] text-rose-300 font-semibold" data-testid="duel-message">
          {msg || error || ''}
        </div>

        {selected ? (
          <div className="space-y-3">
            <DuelCard duel={selected} myUserId={myUserId} />
            <p className="text-xs text-slate-300 text-center leading-relaxed" data-testid="duel-status">
              {selected.status === 'finished'
                ? selected.winner_id === null
                  ? 'Нічия — однаковий час!'
                  : selected.winner_id === myUserId
                    ? 'Ви перемогли в цій дуелі!'
                    : `Переміг ${selected.winner_id === selected.creator.user_id ? selected.creator.name : selected.opponent?.name}`
                : selected.status === 'waiting'
                  ? 'Надішліть посилання другу — щойно він відкриє його, дуель розпочнеться.'
                  : 'Обидва гравці отримують однакове перемішування. Одна спроба — час фіксується автоматично.'}
            </p>
            {!inTelegram && (
              <p className="text-[11px] text-slate-400 text-center" data-testid="duel-locked">Відкрийте гру в Telegram, щоб взяти участь у дуелі.</p>
            )}
            {inTelegram && selected.can_play && (
              <button
                onClick={() => play(selected)}
                disabled={gameState !== GAME_STATE.Menu}
                data-testid="duel-play-button"
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-400 hover:to-orange-400 disabled:opacity-50 text-white font-black text-sm shadow-lg active:scale-[0.98] transition-all"
              >
                {selected.my_role === 'creator' ? 'Зібрати свій час' : 'Прийняти виклик'}
              </button>
            )}
            {inTelegram && selected.status !== 'finished' && selected.my_role === 'creator' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => share(selected)}
                    data-testid="duel-share-button"
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-sky-400/30 bg-sky-500/20 px-2 py-2.5 text-xs font-bold text-sky-200 transition-all hover:bg-sky-500/30 active:scale-[0.98]"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m22 2-7 20-4-9-9-4Z" />
                      <path d="M22 2 11 13" />
                    </svg>
                    Telegram
                  </button>
                  <button
                    onClick={() => void copyInvite(selected)}
                    data-testid="duel-copy-button"
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2 py-2.5 text-xs font-bold text-slate-200 transition-all hover:bg-white/10 active:scale-[0.98]"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Копіювати
                  </button>
                </div>
                <button
                  onClick={cancel}
                  disabled={busy}
                  data-testid="duel-cancel-button"
                  className="w-full py-2.5 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-200 font-bold text-sm active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  {busy ? '…' : 'Відмінити дуель'}
                </button>
              </>
            )}
            <button onClick={() => setSelected(null)} data-testid="duel-back-to-list" className="w-full py-2 text-xs text-slate-400 hover:text-white transition-colors">
              До списку дуелей
            </button>
          </div>
        ) : !inTelegram ? (
          <div className="text-center py-4" data-testid="duel-locked">
            <div className="mx-auto w-16 h-16 rounded-3xl bg-slate-800 border border-white/10 flex items-center justify-center text-rose-300">{swordsIcon}</div>
            <h4 className="mt-3 text-sm font-extrabold text-white">Дуелі доступні в Telegram</h4>
            <p className="mt-1.5 text-xs text-slate-300 leading-relaxed max-w-xs mx-auto">
              Відкрийте гру через Telegram-бота, щоб створити виклик і надіслати його другу.
            </p>
          </div>
        ) : (
          <>
            {stats && (
              <div className="mb-3 grid grid-cols-4 gap-1.5" data-testid="duel-stats">
                {[
                  ['Серія', stats.streak, 'text-amber-300'],
                  ['Рекорд', stats.best_streak, 'text-amber-200'],
                  ['Перемог', stats.wins, 'text-emerald-300'],
                  ['Поразок', stats.losses, 'text-rose-300'],
                ].map(([label, value, cls]) => (
                  <div key={label as string} className="p-2 rounded-xl bg-slate-950/60 border border-white/10 text-center">
                    <div className={`text-base font-black leading-tight ${cls}`}>{value}</div>
                    <div className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">{label}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="p-3 rounded-2xl bg-slate-950/60 border border-white/10">
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">Нова дуель · розмір кубика</div>
              <div className="grid grid-cols-4 gap-1.5">
                {SIZES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSize(s)}
                    data-testid={`duel-size-${s}`}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                      size === s ? 'bg-rose-500/25 border-rose-400/50 text-white' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {s}x{s}
                  </button>
                ))}
              </div>
              <button
                onClick={create}
                disabled={busy}
                data-testid="duel-create-button"
                className="mt-3 w-full py-2.5 rounded-2xl bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-400 hover:to-orange-400 disabled:opacity-50 text-white font-black text-sm shadow-lg active:scale-[0.98] transition-all"
              >
                {busy ? '…' : 'Створити дуель'}
              </button>
              <p className="mt-2 text-[10px] text-slate-400 text-center" data-testid="duel-reward-hint">
                Переможець отримує +{stats?.win_reward ?? 30} монет, нічия — +{stats?.draw_reward ?? 10} кожному. Серія росте з кожною перемогою.
              </p>
            </div>

            <h4 className="mt-5 mb-2 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Мої дуелі</h4>
            {list.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6" data-testid="duel-empty">Ще немає дуелей. Створіть першу та киньте виклик другу!</p>
            ) : (
              <ul className="flex flex-col gap-1.5" data-testid="duel-list">
                {list.map((d) => {
                  const rival = d.creator.user_id === myUserId ? d.opponent : d.creator;
                  const won = d.status === 'finished' && d.winner_id === myUserId;
                  const lost = d.status === 'finished' && d.winner_id !== null && d.winner_id !== myUserId;
                  return (
                    <li key={d.code}>
                      <button
                        onClick={() => setSelected(d)}
                        data-testid={`duel-row-${d.code}`}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl border text-left transition-colors ${
                          d.can_play ? 'bg-rose-500/10 border-rose-400/30' : 'bg-slate-950/60 border-white/5 hover:bg-slate-900/70'
                        }`}
                      >
                        <span className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-xs font-black shrink-0">{d.size}x{d.size}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs font-semibold truncate">{rival ? `проти ${rival.name}` : 'Чекаємо суперника'}</span>
                          <span className="block text-[10px] text-slate-400">
                            {d.can_play ? 'Ваш хід' : won ? 'Перемога' : lost ? 'Поразка' : statusLabel[d.status]}
                          </span>
                        </span>
                        <span className={`font-mono text-xs font-bold ${won ? 'text-amber-300' : lost ? 'text-rose-300' : 'text-sky-200'}`}>
                          {d.creator.user_id === myUserId
                            ? d.creator.time_ms != null ? formatTime(d.creator.time_ms) : '—'
                            : d.opponent?.time_ms != null ? formatTime(d.opponent.time_ms) : '—'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </FullPage>
    </>
  );
}
