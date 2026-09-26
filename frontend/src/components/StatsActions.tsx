/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { formatTime, inviteLink } from '../utils/api';
import { GAME_STATE, getGame } from '../utils/gameBridge';
import { shareToTelegram } from '../utils/telegramAuth';
import { triggerLayerTurnVibration } from '../utils/haptics';

interface StatsActionsProps {
  gameState: number;
  userId?: number;
}

/**
 * Дія на екрані «Завершено»: поділитися своїм часом у Telegram
 */
export function StatsActions({ gameState, userId }: StatsActionsProps) {
  if (gameState !== GAME_STATE.Complete) return null;

  const game = getGame();
  const size = game?.cube?.sizeGenerated || game?.cube?.size || 3;
  const timeMs = game?.timer?.deltaTime || 0;
  if (timeMs <= 0) return null;

  const handleShare = () => {
    triggerLayerTurnVibration(25, true);
    const label = !game?.bestTime ? 'мій час' : 'мій найкращий час';
    shareToTelegram(`THE CUBE: ${label} на кубику ${size}x${size} — ${formatTime(timeMs)}! Спробуй побити мій рекорд`, inviteLink(userId));
  };

  return (
    <div className="fixed left-0 right-0 flex justify-center gap-2 pointer-events-none" style={{ bottom: 'max(24px, env(safe-area-inset-bottom, 24px))' }}>
      <button
        onClick={handleShare}
        data-testid="share-result-button"
        className="pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/90 hover:bg-slate-800 text-white text-xs font-semibold shadow-lg border border-sky-500/30 backdrop-blur-sm transition-all active:scale-95"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-sky-400">
          <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
        </svg>
        {`Поділитися: ${formatTime(timeMs)}`}
      </button>
    </div>
  );
}
