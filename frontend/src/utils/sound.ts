/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const KEY = 'thecube_sound_enabled';
let enabled = (() => {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
})();
let ctx: AudioContext | null = null;

export const isSoundEnabled = () => enabled;

export function setSoundEnabled(v: boolean) {
  enabled = v;
  try {
    localStorage.setItem(KEY, v ? '1' : '0');
  } catch {
    // ignore
  }
}

function audio(): AudioContext | null {
  if (!enabled || typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = ctx || new Ctor();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(ac: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, gain: number) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

/** М'який теплий тон повороту грані */
export function playTurn() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const base = 300 + Math.random() * 50;
  tone(ac, base, t, 0.16, 'sine', 0.05);
  tone(ac, base * 2, t, 0.11, 'sine', 0.022);
  tone(ac, base * 3, t + 0.006, 0.07, 'triangle', 0.012);
}

/** Делікатний клік відкриття панелі */
export function playClick() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  tone(ac, 520, t, 0.06, 'sine', 0.045);
  tone(ac, 780, t + 0.03, 0.07, 'sine', 0.035);
}

/** Короткий тік перемикання вкладок */
export function playTick() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  tone(ac, 1150, t, 0.03, 'triangle', 0.03);
}

/** Акорд перемоги */
export function playWin() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ac, f, t + i * 0.09, 0.35, 'triangle', 0.12));
}

/** Фанфара нового рекорду */
export function playRecord() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  [659.25, 783.99, 987.77, 1318.5, 1567.98].forEach((f, i) => tone(ac, f, t + i * 0.1, 0.5, 'triangle', 0.14));
  tone(ac, 130.81, t, 0.9, 'sine', 0.12);
}
