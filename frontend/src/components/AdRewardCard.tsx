/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import createAdHandler from 'monetag-tg-sdk';
import { api } from '../utils/api';
import { triggerLayerTurnVibration } from '../utils/haptics';

const MONETAG_ZONE_ID = (import.meta.env.VITE_MONETAG_ZONE_ID || '').trim().replace(/^show_/, '');
const monetagAdHandler = MONETAG_ZONE_ID ? createAdHandler(MONETAG_ZONE_ID) : null;

interface AdRewardCardProps {
  inTelegram: boolean;
  flash: (m: string) => void;
  onCredited: () => void;
}

const playIcon = (
  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M8 5v14l11-7z" /></svg>
);
const coinIcon = (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-amber-300"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm.9 3h-1.8v1.1c-1.1.2-2 1-2 2.2 0 1.4 1.1 2 2.4 2.3 1 .3 1.3.5 1.3.9s-.4.6-1 .6c-.8 0-1.5-.3-2-.6l-.5 1.6c.5.3 1.1.5 1.8.6V17h1.8v-1.1c1.2-.2 2.1-1 2.1-2.3 0-1.3-.9-1.9-2.4-2.3-1-.3-1.3-.5-1.3-.8s.3-.5.9-.5c.7 0 1.4.2 1.8.4l.5-1.6c-.5-.2-1-.3-1.6-.4V7z" /></svg>
);

export function isRewardedAdAvailable(): boolean {
  return Boolean(MONETAG_ZONE_ID && monetagAdHandler);
}

export async function showRewardedAd(): Promise<void> {
  if (!isRewardedAdAvailable() || !monetagAdHandler) {
    throw new Error('Rewarded Interstitial зараз недоступний');
  }
  await monetagAdHandler();
}

export function AdRewardCard({ inTelegram, flash, onCredited }: AdRewardCardProps) {
  const [busy, setBusy] = useState(false);

  const handleWatch = async () => {
    if (busy || !inTelegram || !monetagAdHandler) {
      flash('Rewarded Interstitial зараз недоступний');
      return;
    }

    setBusy(true);
    try {
      await showRewardedAd();
      triggerLayerTurnVibration(30, true);
      const rewardResult = await api.rewardSpin();
      if (!rewardResult.ok) {
        flash('Реклама підтвердилась, але нагороду не було нараховано');
        return;
      }
      const coinsAwarded = rewardResult.coins_awarded ?? rewardResult.coins ?? 100;
      flash(`+${coinsAwarded} монет`);
      onCredited();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Реклама зараз недоступна або не підтвердилась';
      flash(message);
    } finally {
      setBusy(false);
    }
  };

  const disabled = busy || !isRewardedAdAvailable();

  return (
    <div
      className="mb-3 p-3 rounded-2xl border border-sky-400/20 bg-gradient-to-r from-sky-500/10 to-blue-600/10 flex items-center gap-3"
      data-testid="ad-reward-card"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-white">🎬 Rewarded Interstitial +100 монет</div>
        <div className="text-[11px] text-slate-400 leading-snug mt-0.5">
          {MONETAG_ZONE_ID
            ? 'Monetag Rewarded Interstitial: нагорода нараховується лише після підтвердження SDKінтерфейсу.'
            : 'Rewarded Interstitial ще не підключений.'}
        </div>
        <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-300 font-bold">
          {coinIcon} +100 монет
        </div>
      </div>
      <button
        onClick={handleWatch}
        disabled={disabled}
        data-testid="ad-watch-button"
        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 disabled:opacity-40 text-white text-[11px] font-black transition-all active:scale-95"
      >
        {playIcon}
        {busy ? '…' : MONETAG_ZONE_ID ? 'Дивитися' : 'Скоро'}
      </button>
    </div>
  );
}
