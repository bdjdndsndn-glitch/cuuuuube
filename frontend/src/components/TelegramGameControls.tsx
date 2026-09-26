/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { TelegramUser } from '../types';
import { getTelegramUser, isRunningInTelegram } from '../utils/telegramAuth';
import { TelegramProfileModal } from './TelegramProfileModal';
import { StatsActions } from './StatsActions';
import { LeaderboardPanel } from './LeaderboardPanel';
import { DailyChallenge } from './DailyChallenge';
import { DailyMission } from './DailyMission';
import { DuelPanel } from './DuelPanel';
import { ScoreSync } from './ScoreSync';
import { Onboarding } from './Onboarding';
import { FortuneWheel } from './FortuneWheel';
import { getGame, useGameState } from '../utils/gameBridge';
import { triggerLayerTurnVibration } from '../utils/haptics';
import { getStartParam } from '../utils/api';

/**
 * Керування нативними іконками нижнього ряду гри THE CUBE:
 * - .btn--profile -> відкриває профіль Telegram (дані підтягуються автоматично)
 * - .btn--wallet -> відкриває Tonkeeper / TON Connect
 */
export function TelegramGameControls() {
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isRealTelegram, setIsRealTelegram] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [dailyRefresh, setDailyRefresh] = useState(0);
  const [duelRefresh, setDuelRefresh] = useState(0);
  const [duelOpen, setDuelOpen] = useState(false);
  const [duelCode, setDuelCode] = useState<string | null>(() => {
    const sp = getStartParam();
    return sp && sp.startsWith('duel_') ? sp.slice(5) : null;
  });
  const gameState = useGameState();
  const bumpDaily = useCallback(() => setDailyRefresh((v) => v + 1), []);
  const bumpDuel = useCallback(() => setDuelRefresh((v) => v + 1), []);

  // 1. Ініціалізація Telegram WebApp
  useEffect(() => {
    const inTg = isRunningInTelegram();
    setIsRealTelegram(inTg);

    if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
      const wa = window.Telegram.WebApp;
      try {
        wa.ready?.();
        wa.expand?.();
        wa.setHeaderColor?.('#0f172a');
        wa.setBackgroundColor?.('#0f172a');
        wa.enableClosingConfirmation?.();
      } catch {
        // ignore
      }
    }

    setUser(getTelegramUser());
  }, []);

  // 2. Підключення обробника кліку до кнопки кабінету (.btn--profile)
  useEffect(() => {
    const profileBtn = document.querySelector<HTMLButtonElement>('.btn--profile');

    const handleProfileClick = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      triggerLayerTurnVibration(25, true);
      setIsProfileOpen(true);
    };

    if (profileBtn) {
      profileBtn.addEventListener('click', handleProfileClick);
    }

    return () => {
      if (profileBtn) profileBtn.removeEventListener('click', handleProfileClick);
    };
  }, []);

  // 3. Індикатор авторизованого користувача Telegram
  useEffect(() => {
    const profileBtn = document.querySelector<HTMLButtonElement>('.btn--profile');
    if (!profileBtn) return;

    if (user) {
      profileBtn.classList.add('is-auth');
      profileBtn.setAttribute(
        'title',
        `Профіль: ${user.first_name}${user.username ? ` (@${user.username})` : ''}`
      );
    } else {
      profileBtn.classList.remove('is-auth');
      profileBtn.setAttribute('title', 'Профіль гравця Telegram');
    }
  }, [user]);

  // 4. Кнопка кубка (.btn--stats) відкриває повноекранних «Лідерів» замість нативної статистики
  useEffect(() => {
    const id = setInterval(() => {
      const statsBtn = (getGame() as { dom?: { buttons?: { stats?: HTMLButtonElement } } } | undefined)?.dom?.buttons?.stats;
      if (statsBtn) {
        statsBtn.title = 'Лідери';
        statsBtn.setAttribute('aria-label', 'Лідери');
        statsBtn.setAttribute('data-testid', 'leaders-open-button');
        statsBtn.onclick = (e) => {
          e.preventDefault();
          triggerLayerTurnVibration(25, true);
          setIsLeaderboardOpen(true);
        };
        clearInterval(id);
      }
    }, 250);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <TelegramProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        user={user}
        isRealTelegram={isRealTelegram}
      />

      <StatsActions gameState={gameState} userId={user?.id} />
      <LeaderboardPanel
        isOpen={isLeaderboardOpen}
        onClose={() => setIsLeaderboardOpen(false)}
        myUserId={user?.id}
        inTelegram={isRealTelegram}
      />
      <DailyChallenge gameState={gameState} myUserId={user?.id} inTelegram={isRealTelegram} refreshKey={dailyRefresh} />
      <DailyMission gameState={gameState} inTelegram={isRealTelegram} />
      <FortuneWheel gameState={gameState} />
      <DuelPanel
        gameState={gameState}
        myUserId={user?.id}
        inTelegram={isRealTelegram}
        refreshKey={duelRefresh}
        initialCode={duelCode}
        onInitialConsumed={() => setDuelCode(null)}
        onOpenChange={setDuelOpen}
      />
      <ScoreSync onDailySubmitted={bumpDaily} onDuelSubmitted={bumpDuel} />
      <Onboarding hidden={duelOpen} />
    </>
  );
}
