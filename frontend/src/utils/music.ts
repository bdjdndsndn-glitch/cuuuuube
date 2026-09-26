/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const SRC = '/assets/audio/bg-calm.mp3';
const VKEY = 'thecube_music_volume';
let el: HTMLAudioElement | null = null;
let fadeTimer: ReturnType<typeof setInterval> | null = null;

function element(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (!el) {
    el = new Audio(SRC);
    el.loop = true;
    el.volume = 0;
    el.preload = 'auto';
  }
  return el;
}

/** Гучність фонової музики 0..1 (незалежна від звуку поворотів) */
export function getMusicVolume(): number {
  try {
    const v = parseFloat(localStorage.getItem(VKEY) || '');
    return Number.isNaN(v) ? 0.5 : Math.max(0, Math.min(1, v));
  } catch {
    return 0.5;
  }
}

export function setMusicVolume(v: number): void {
  const vol = Math.max(0, Math.min(1, v));
  try {
    localStorage.setItem(VKEY, String(vol));
  } catch {
    // ignore
  }
  const a = element();
  if (!a) return;
  clearFade();
  if (vol <= 0) {
    a.pause();
  } else {
    a.volume = vol;
    if (a.paused) startMusic();
  }
}

function clearFade(): void {
  if (fadeTimer) {
    clearInterval(fadeTimer);
    fadeTimer = null;
  }
}

function fade(to: number, ms: number, onDone?: () => void): void {
  const a = element();
  if (!a) return;
  clearFade();
  const from = a.volume;
  const steps = Math.max(1, Math.round(ms / 40));
  let i = 0;
  fadeTimer = setInterval(() => {
    i += 1;
    a.volume = Math.max(0, Math.min(1, from + (to - from) * (i / steps)));
    if (i >= steps) {
      clearFade();
      onDone?.();
    }
  }, 40);
}

/** Запуск музики з плавним наростанням. Гучність 0 = вимкнено. */
export function startMusic(): void {
  const vol = getMusicVolume();
  if (vol <= 0) return;
  const a = element();
  if (!a) return;
  if (a.paused) {
    a.volume = 0;
    a.play().then(() => fade(vol, 900)).catch(() => {});
  } else {
    fade(vol, 600);
  }
}

/** М'яке затухання і пауза (для завершення збірки / виходу з гри) */
export function fadeOutMusic(): void {
  const a = element();
  if (!a || a.paused) return;
  fade(0, 900, () => a.pause());
}

/** Повна зупинка зі скиданням на початок */
export function stopMusic(): void {
  clearFade();
  if (!el) return;
  el.pause();
  try {
    el.currentTime = 0;
  } catch {
    // ignore
  }
}
