/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duel, DuelPlayer, formatTime, resolvePhoto } from '../utils/api';

export const swordsIcon = (
  <svg viewBox="0 0 32 32" className="w-5 h-5 animate-[pulse_2.2s_ease-in-out_infinite]" fill="none" aria-hidden="true">
    <path d="M7 5l20 20M25 5L5 25" stroke="#fb7185" strokeWidth="3" strokeLinecap="round" />
    <path d="M7 5l20 20M25 5L5 25" stroke="#ffe4e6" strokeWidth="0.9" strokeLinecap="round" />
    <path d="M8.5 6.5L5 3M23.5 6.5L27 3" stroke="#fda4af" strokeWidth="2" strokeLinecap="round" />
    <path d="M12 10l-3 3M20 10l3 3M12 22l-3-3M20 22l3-3" stroke="#fb7185" strokeWidth="2" strokeLinecap="round" />
    <circle cx="16" cy="16" r="3.2" fill="#450a0a" stroke="#fecdd3" strokeWidth="1.2" />
    <path d="M16 1.5v3M14.5 3h3M16 27.5v3" stroke="#ffe4e6" strokeWidth="1.2" strokeLinecap="round" className="animate-pulse" />
  </svg>
);

export const statusLabel: Record<Duel['status'], string> = {
  waiting: 'Чекаємо суперника',
  pending: 'У процесі',
  finished: 'Завершено',
};

interface PlayerCardProps {
  player: DuelPlayer | null;
  isWinner: boolean;
  isMe: boolean;
  testId: string;
}

function PlayerCard({ player, isWinner, isMe, testId }: PlayerCardProps) {
  const photo = resolvePhoto(player?.photo_url);
  return (
    <div
      data-testid={testId}
      className={`flex-1 min-w-0 p-3 rounded-2xl border text-center transition-colors ${
        isWinner ? 'bg-amber-400/15 border-amber-300/50 shadow-[0_0_18px_-4px_rgba(251,191,36,0.6)]' : isMe ? 'bg-sky-500/10 border-sky-400/30' : 'bg-slate-950/60 border-white/10'
      }`}
    >
      {photo ? (
        <img src={photo} alt="" className="mx-auto w-12 h-12 rounded-full object-cover border border-white/10" />
      ) : (
        <span className="mx-auto w-12 h-12 rounded-full bg-gradient-to-tr from-rose-500 to-orange-500 flex items-center justify-center text-sm font-black">
          {player ? player.name.slice(0, 2).toUpperCase() : '?'}
        </span>
      )}
      <div className="mt-2 text-xs font-bold truncate">{player ? `${player.name}${isMe ? ' (ви)' : ''}` : 'Вільне місце'}</div>
      <div className={`mt-1 font-mono text-lg font-black ${player?.time_ms != null ? 'text-sky-200' : 'text-slate-500'}`}>
        {player?.time_ms != null ? formatTime(player.time_ms) : '—:——'}
      </div>
      {isWinner && <div className="text-[10px] uppercase tracking-wider text-amber-300 font-bold mt-0.5">Переможець</div>}
    </div>
  );
}

interface DuelCardProps {
  duel: Duel;
  myUserId?: number;
}

export function DuelCard({ duel, myUserId }: DuelCardProps) {
  return (
    <div className="flex items-stretch gap-2" data-testid="duel-detail">
      <PlayerCard player={duel.creator} isWinner={duel.winner_id === duel.creator.user_id} isMe={duel.creator.user_id === myUserId} testId="duel-creator-card" />
      <div className="flex items-center text-rose-400">{swordsIcon}</div>
      <PlayerCard
        player={duel.opponent}
        isWinner={duel.opponent != null && duel.winner_id === duel.opponent.user_id}
        isMe={duel.opponent?.user_id === myUserId}
        testId="duel-opponent-card"
      />
    </div>
  );
}
