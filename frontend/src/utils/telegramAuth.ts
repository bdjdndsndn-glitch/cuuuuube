/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TelegramUser } from '../types';

const STORAGE_KEY = 'thecube_telegram_user';

/**
 * Користувач Telegram: дані беруться автоматично з window.Telegram.WebApp.initDataUnsafe,
 * коли гра відкрита через Telegram-бота. У звичайному браузері повертає null.
 */
export function getTelegramUser(): TelegramUser | null {
  if (typeof window === 'undefined') return null;

  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (tgUser && tgUser.id) {
    const user: TelegramUser = {
      id: tgUser.id,
      first_name: tgUser.first_name || 'Користувач',
      last_name: tgUser.last_name,
      username: tgUser.username,
      language_code: tgUser.language_code || 'uk',
      is_premium: tgUser.is_premium,
      photo_url: tgUser.photo_url,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } catch {
      // ignore
    }
    return user;
  }

  if (!isRunningInTelegram()) return null;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // ignore
  }

  return null;
}

/**
 * Перевірка, чи гра відкрита у клієнті Telegram (initData передає лише справжній клієнт)
 */
export function isRunningInTelegram(): boolean {
  if (typeof window === 'undefined') return false;
  const webApp = window.Telegram?.WebApp;
  if (!webApp) return false;
  if (webApp.initData && webApp.initData.length > 0) return true;
  return Boolean(webApp.platform && webApp.platform !== 'unknown');
}

/**
 * Відкрити діалог «Поділитися» в Telegram (або системний fallback у браузері)
 */
export function shareToTelegram(text: string, url: string): void {
  const link = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  const webApp = window.Telegram?.WebApp;
  if (webApp?.openTelegramLink) {
    webApp.openTelegramLink(link);
    return;
  }
  if (navigator.share) {
    navigator.share({ text, url }).catch(() => window.open(link, '_blank', 'noopener'));
    return;
  }
  window.open(link, '_blank', 'noopener');
}
