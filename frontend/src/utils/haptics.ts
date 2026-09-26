/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Модуль тактильного відгуку (Vibration API + Telegram Mini App HapticFeedback).
 * Працює як у звичайних браузерах (Android Vibration API),
 * так і в Telegram Mini App (нативні вібро-ефекти Taptic Engine на iOS та вібрація на Android через Telegram.WebApp.HapticFeedback).
 */

export type HapticStrength = 'off' | 'soft' | 'medium' | 'strong';

export const HAPTIC_LEVELS: HapticStrength[] = ['off', 'soft', 'medium', 'strong'];

const HAPTIC_STORAGE_KEY = 'the_cube_haptic_strength';

const STRENGTH_DURATIONS: Record<HapticStrength, number> = {
  off: 0,
  soft: 25,
  medium: 35,
  strong: 50,
};

let currentStrength: HapticStrength = (() => {
  try {
    const saved = localStorage.getItem(HAPTIC_STORAGE_KEY) as HapticStrength;
    if (saved && saved in STRENGTH_DURATIONS) return saved;
  } catch {
    // ignore
  }
  return 'medium';
})();

let lastVibrateTime = 0;

/**
 * Перевірка чи гра запущена всередині Telegram Mini App
 */
export function isTelegramMiniApp(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.Telegram?.WebApp &&
      (window.Telegram.WebApp.initData ||
        window.Telegram.WebApp.platform ||
        window.Telegram.WebApp.HapticFeedback)
  );
}

/**
 * Отримати Telegram WebApp HapticFeedback об'єкт (якщо доступний)
 */
function getTelegramHaptics() {
  if (typeof window === 'undefined') return undefined;
  return window.Telegram?.WebApp?.HapticFeedback;
}

/**
 * Перевірка чи пристрій є iOS (iPhone, iPad, iPod)
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * Отримати поточну силу вібрації
 */
export function getHapticStrength(): HapticStrength {
  return currentStrength;
}

/**
 * Отримати числовий індекс поточної сили вібрації (0=Вимк, 1=М'яка, 2=Оптимальна, 3=Чітка)
 */
export function getHapticIndex(): number {
  const idx = HAPTIC_LEVELS.indexOf(currentStrength);
  return idx >= 0 ? idx : 2;
}

/**
 * Встановити силу вібрації
 */
export function setHapticStrength(strength: HapticStrength): void {
  currentStrength = strength;
  try {
    localStorage.setItem(HAPTIC_STORAGE_KEY, strength);
  } catch {
    // ignore
  }
}

/**
 * Встановити силу вібрації за індексом з повзунка налаштувань
 */
export function setHapticFromIndex(index: number): void {
  const clamped = Math.max(0, Math.min(3, Math.round(index)));
  setHapticStrength(HAPTIC_LEVELS[clamped]);
}

/**
 * Викликати делікатну тактильну вібрацію при повороті грані кубика.
 * Працює в Telegram Mini App (iOS/Android) та у веб-браузерах.
 */
export function triggerLayerTurnVibration(customDuration?: number, force: boolean = false): boolean {
  if (currentStrength === 'off' && !force) return false;

  const now = performance.now();
  if (!force && now - lastVibrateTime < 45) {
    return false;
  }
  lastVibrateTime = now;

  let executed = false;

  // 1. Пріоритет: Telegram Mini App HapticFeedback (працює нативно на iOS та Android у Telegram)
  const tgHaptics = getTelegramHaptics();
  if (tgHaptics && typeof tgHaptics.impactOccurred === 'function') {
    try {
      const style =
        currentStrength === 'soft'
          ? 'light'
          : currentStrength === 'strong'
          ? 'heavy'
          : 'medium';
      tgHaptics.impactOccurred(style);
      executed = true;
    } catch {
      // fallback
    }
  }

  // 2. Стандартний W3C Vibration API для звичайного веб-браузера (Android Chrome)
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
    try {
      const duration = customDuration ?? STRENGTH_DURATIONS[currentStrength];
      if (duration > 0) {
        navigator.vibrate([duration]);
        executed = true;
      }
    } catch {
      // ignore
    }
  }

  return executed;
}

/**
 * Легкий тактильний клік при виборі / фіксації грані на місці
 */
export function triggerLayerSnapVibration(): boolean {
  if (currentStrength === 'off') return false;

  const tgHaptics = getTelegramHaptics();
  if (tgHaptics && typeof tgHaptics.selectionChanged === 'function') {
    try {
      tgHaptics.selectionChanged();
      return true;
    } catch {
      // fallback
    }
  }

  return triggerLayerTurnVibration(25);
}

/**
 * Тактильний відгук при успішному збиранні кубика
 */
export function triggerSolvedVibration(): boolean {
  if (currentStrength === 'off') return false;

  const tgHaptics = getTelegramHaptics();
  if (tgHaptics && typeof tgHaptics.notificationOccurred === 'function') {
    try {
      tgHaptics.notificationOccurred('success');
      return true;
    } catch {
      // fallback
    }
  }

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
    try {
      return Boolean(navigator.vibrate([35, 60, 40]));
    } catch {
      return false;
    }
  }

  return false;
}
