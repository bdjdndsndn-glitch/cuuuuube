/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';

export const GAME_STATE = { Menu: 0, Playing: 1, Complete: 2, Stats: 3, Prefs: 4, Theme: 5 } as const;

interface Range {
  value: number;
  setValue: (v: number) => void;
  onUpdate: (v: number) => void;
}

export interface GameInstance {
  state: number;
  saved: boolean;
  bestTime?: boolean;
  timer: { deltaTime: number; reset: () => void };
  cube: { size: number; sizeGenerated: number; resize: (force?: boolean) => void };
  scores: { data: Record<number, { best: number }> };
  scrambler: { scramble: (moves?: string) => unknown };
  preferences: { ranges: { size: Range } };
  storage: { clearGame: () => void; savePreferences: () => void };
  themes: { theme: string; colors: Record<string, Record<string, number>> };
  game: (start: boolean) => void;
  complete: (finished: boolean) => void;
}

export interface SolveResult {
  timeMs: number;
  size: number;
  isBest: boolean;
  daily: { date: string; moves: string } | null;
  duel: { code: string } | null;
}

export const getGame = (): GameInstance | undefined => (window as unknown as { game?: GameInstance }).game;

const solveListeners = new Set<(r: SolveResult) => void>();
let activeDaily: { date: string; moves: string } | null = null;
let activeDuel: { code: string; moves: string } | null = null;
let hooksInstalled = false;

function installHooks(game: GameInstance) {
  if (hooksInstalled) return;
  hooksInstalled = true;

  const origComplete = game.complete.bind(game);
  game.complete = (finished: boolean) => {
    origComplete(finished);
    if (!finished) return;
    const result: SolveResult = {
      timeMs: game.timer.deltaTime,
      size: game.cube.sizeGenerated,
      isBest: Boolean(game.bestTime),
      daily: activeDaily,
      duel: activeDuel ? { code: activeDuel.code } : null,
    };
    activeDaily = null;
    activeDuel = null;
    solveListeners.forEach((cb) => cb(result));
  };

  const scr = game.scrambler;
  const origScramble = scr.scramble.bind(scr);
  scr.scramble = (moves?: string) => origScramble(activeDaily?.moves ?? activeDuel?.moves ?? moves);

  const origGame = game.game.bind(game);
  game.game = (start: boolean) => {
    if (!start) {
      activeDaily = null;
      activeDuel = null;
    }
    origGame(start);
  };
}

export function onSolve(cb: (r: SolveResult) => void): () => void {
  solveListeners.add(cb);
  return () => solveListeners.delete(cb);
}

export function isDailyActive(): boolean {
  return activeDaily !== null;
}

function startWithSize(game: GameInstance, size: number) {
  const sizeRange = game.preferences.ranges.size;
  sizeRange.setValue(size);
  sizeRange.onUpdate(size);
  game.cube.size = size;
  game.cube.resize();
  game.saved = false;
  game.storage.clearGame();
  game.timer.reset();
  game.storage.savePreferences();
  game.game(true);
}

/** Запуск виклику дня: кубик 3x3 із заданим перемішуванням */
export function startDailyChallenge(date: string, moves: string): boolean {
  const game = getGame();
  if (!game || game.state !== GAME_STATE.Menu) return false;
  activeDaily = { date, moves };
  activeDuel = null;
  startWithSize(game, 3);
  return true;
}

/** Запуск дуелі: кубик заданого розміру з перемішуванням дуелі */
export function startDuel(code: string, size: number, moves: string): boolean {
  const game = getGame();
  if (!game || game.state !== GAME_STATE.Menu) return false;
  activeDuel = { code, moves };
  activeDaily = null;
  startWithSize(game, size);
  return true;
}

/** Поточний стан гри (опитування window.game) + встановлення хуків */
export function useGameState(): number {
  const [state, setState] = useState(-1);
  useEffect(() => {
    const id = setInterval(() => {
      const game = getGame();
      if (game) {
        installHooks(game);
        setState(game.state);
      }
    }, 250);
    return () => clearInterval(id);
  }, []);
  return state;
}

export function themeAccentColors(): string[] {
  const game = getGame();
  const colors = game?.themes?.colors?.[game.themes.theme];
  if (!colors) return ['#41aac8', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6'];
  return ['U', 'D', 'F', 'R', 'B', 'L'].map((k) => '#' + (colors[k] ?? 0).toString(16).padStart(6, '0'));
}
