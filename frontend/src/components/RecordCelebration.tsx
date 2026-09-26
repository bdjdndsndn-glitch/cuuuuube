/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo } from 'react';
import { themeAccentColors } from '../utils/gameBridge';

interface RecordCelebrationProps {
  show: boolean;
  timeLabel: string;
  onDone: () => void;
}

const PIECES = 64;
const DURATION = 2600;

/**
 * Невелика конфеті-анімація та вібрація при новому найкращому часі
 */
export function RecordCelebration({ show, timeLabel, onDone }: RecordCelebrationProps) {
  const pieces = useMemo(() => {
    if (!show) return [];
    const colors = themeAccentColors();
    return Array.from({ length: PIECES }, (_, i) => {
      const angle = (i / PIECES) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 120 + Math.random() * 220;
      return {
        id: i,
        color: colors[i % colors.length],
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist - 80,
        rot: Math.random() * 720 - 360,
        size: 6 + Math.random() * 6,
        delay: Math.random() * 120,
        round: Math.random() > 0.5,
      };
    });
  }, [show]);

  useEffect(() => {
    if (!show) return;
    try {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success');
    } catch {
      // ignore
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate([50, 40, 50, 40, 140]);
      } catch {
        // ignore
      }
    }
    const t = setTimeout(onDone, DURATION);
    return () => clearTimeout(t);
  }, [show, onDone]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 pointer-events-none flex items-center justify-center overflow-hidden" data-testid="record-celebration">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute block record-piece"
          style={{
            width: p.size,
            height: p.round ? p.size : p.size * 0.5,
            background: p.color,
            borderRadius: p.round ? '50%' : 2,
            animationDelay: `${p.delay}ms`,
            ['--dx' as string]: `${p.dx}px`,
            ['--dy' as string]: `${p.dy}px`,
            ['--rot' as string]: `${p.rot}deg`,
          }}
        />
      ))}
      <div className="record-label px-5 py-2.5 rounded-full bg-slate-900/90 border border-amber-400/50 shadow-2xl text-center">
        <div className="text-[11px] uppercase tracking-wider text-amber-300 font-bold">Новий рекорд!</div>
        <div className="text-xl font-black text-white font-mono">{timeLabel}</div>
      </div>
    </div>
  );
}
