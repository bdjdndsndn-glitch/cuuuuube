/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { GAME_STATE, getGame } from '../utils/gameBridge';
import { startMusic, fadeOutMusic, stopMusic } from '../utils/music';

/**
 * Фонова музика під час складання кубика: плавно наростає на старті гри
 * і м'яко затухає при завершенні збірки чи виході в меню.
 */
export function BackgroundMusic() {
  const playing = useRef(false);
  useEffect(() => {
    const id = setInterval(() => {
      const inGame = getGame()?.state === GAME_STATE.Playing;
      if (inGame && !playing.current) {
        playing.current = true;
        startMusic();
      } else if (!inGame && playing.current) {
        playing.current = false;
        fadeOutMusic();
      }
    }, 300);
    return () => {
      clearInterval(id);
      stopMusic();
    };
  }, []);
  return null;
}
