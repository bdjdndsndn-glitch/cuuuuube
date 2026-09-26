/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LeaderEntry, MyRank, formatTime, resolvePhoto } from '../utils/api';

interface LeaderListProps {
  entries: LeaderEntry[];
  me: MyRank | null;
  myUserId?: number;
  total: number;
  loading: boolean;
  error: string | null;
  emptyText: string;
  inTelegram: boolean;
  friendIds?: number[];
  onRetry?: () => void;
}

const rankBadge = (rank: number): string => {
  if (rank === 1) return 'bg-amber-400/20 text-amber-300 ring-1 ring-amber-300/50 shadow-[0_0_12px_-2px_rgba(251,191,36,0.5)]';
  if (rank === 2) return 'bg-slate-300/15 text-slate-100 ring-1 ring-slate-300/40';
  if (rank === 3) return 'bg-orange-400/15 text-orange-300 ring-1 ring-orange-300/40';
  return 'text-slate-400';
};

/**
 * Список рейтингу з підсвіткою поточного гравця та його місцем
 */
export function LeaderList({ entries, me, myUserId, total, loading, error, emptyText, inTelegram, friendIds = [], onRetry }: LeaderListProps) {
  if (loading)
    return (
      <div className="flex flex-col gap-1.5" data-testid="leader-loading">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-950/60 border border-white/5">
            <span className="w-7 h-7 rounded-lg skeleton-shimmer" />
            <span className="w-7 h-7 rounded-full skeleton-shimmer" />
            <span className="flex-1 h-3 rounded-full skeleton-shimmer" />
            <span className="w-12 h-3 rounded-full skeleton-shimmer" />
          </div>
        ))}
      </div>
    );
  if (error)
    return (
      <div className="text-center py-6" data-testid="leader-error">
        <p className="text-xs text-rose-300 mb-2">{error}</p>
        {onRetry && (
          <button onClick={onRetry} className="text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15" data-testid="leader-retry">
            Повторити
          </button>
        )}
      </div>
    );

  return (
    <div data-testid="leader-list">
      {entries.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-6">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {entries.map((e, i) => {
            const mine = e.user_id === myUserId;
            const friend = friendIds.includes(e.user_id);
            const photo = resolvePhoto(e.photo_url);
            return (
              <li
                key={e.user_id}
                className={`leader-row-in flex items-center gap-3 px-3 py-2 rounded-xl border transition-colors ${
                  mine ? 'bg-sky-500/15 border-sky-400/40' : friend ? 'bg-emerald-500/10 border-emerald-400/30' : 'bg-slate-950/60 border-white/5 hover:bg-slate-900/70'
                }`}
                style={{ animationDelay: `${Math.min(i, 12) * 28}ms` }}
                data-testid={`leader-row-${e.rank}`}
              >
                <span className={`flex items-center justify-center w-7 h-7 rounded-lg text-sm font-black shrink-0 ${rankBadge(e.rank)}`}>{e.rank}</span>
                {photo ? (
                  <img src={photo} alt="" className={`w-7 h-7 rounded-full object-cover shrink-0 border ${e.rank === 1 ? 'border-amber-300/60' : 'border-white/10'}`} data-testid="leader-avatar" />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center text-[10px] font-black shrink-0">
                    {e.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5 text-xs font-semibold truncate">
                    {e.name}{mine ? ' (ви)' : ''}
                    {friend && (
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold" data-testid="friend-badge">
                        друг
                      </span>
                    )}
                  </span>
                  {e.username && <span className="block text-[10px] text-sky-400 font-mono truncate">@{e.username}</span>}
                </span>
                <span className="font-mono text-sm font-bold text-sky-200">{formatTime(e.time_ms)}</span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs" data-testid="leader-my-rank">
        <span className="text-slate-400">Гравців: {total}</span>
        {!inTelegram ? (
          <span className="text-slate-400">Відкрийте у Telegram, щоб потрапити в рейтинг</span>
        ) : me ? (
          <span className="font-semibold text-sky-300">
            Моє місце: #{me.rank} · {formatTime(me.time_ms)}
          </span>
        ) : (
          <span className="text-slate-400">Ви ще не в рейтингу</span>
        )}
      </div>
    </div>
  );
}
