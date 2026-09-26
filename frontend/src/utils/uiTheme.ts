/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getGame } from './gameBridge';

const KEY = 'thecube_ui_theme';
export type UITheme = 'light' | 'dark';

export function getUITheme(): UITheme {
  try {
    return (localStorage.getItem(KEY) as UITheme) || 'light';
  } catch {
    return 'light';
  }
}

export function applyUITheme(theme: UITheme): void {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  el.classList.toggle('theme-dark', theme === 'dark');
  el.classList.toggle('theme-light', theme === 'light');
  try {
    const wa = window.Telegram?.WebApp;
    const bg = theme === 'dark' ? '#0b1220' : '#0f172a';
    wa?.setBackgroundColor?.(bg);
    wa?.setHeaderColor?.(bg);
  } catch {
    // ignore
  }
}

export function setUITheme(theme: UITheme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // ignore
  }
  applyUITheme(theme);
}

/** Основний колір поточної теми кубика (грань «U») у HEX або null */
export function cubeAccent(): string | null {
  const game = getGame();
  const colors = game?.themes?.colors?.[game.themes.theme];
  if (!colors) return null;
  const key = colors.U !== undefined ? 'U' : Object.keys(colors)[0];
  const val = colors[key];
  if (val === undefined) return null;
  return '#' + val.toString(16).padStart(6, '0');
}

/** Синхронізує CSS-змінну --cube-accent з кольором кубика */
export function syncCubeAccent(): string | null {
  const c = cubeAccent();
  if (c && typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--cube-accent', c);
  }
  return c;
}

// Застосовуємо збережену тему одразу при завантаженні
if (typeof document !== 'undefined') {
  applyUITheme(getUITheme());
}
