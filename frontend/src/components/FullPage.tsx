/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReactNode, TouchEvent, useEffect, useRef, useState } from 'react';
import { useTelegramBackButton } from '../utils/backButton';
import { playClick } from '../utils/sound';

const SWIPE_CLOSE_PX = 120;

interface FullPageProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  /** Tailwind classes for the top glow color, e.g. 'rgba(56,189,248,0.16)' */
  glow?: string;
  /** Classes for the right-hand icon badge */
  badgeClass?: string;
  /** Sticky content pinned under the header (e.g. filter tabs) */
  sticky?: ReactNode;
  testId: string;
  children: ReactNode;
}

const DEFAULT_BADGE =
  'w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-500/25 to-blue-600/15 border border-sky-400/30 flex items-center justify-center text-sky-300 shadow-lg shadow-sky-500/10 shrink-0';

/**
 * Спільна повноекранна мобільна оболонка (Лідери / Кабінет / Завдання):
 * єдина шапка зі стрілкою «назад», swipe-down для закриття, Telegram BackButton.
 */
export function FullPage({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  glow = 'rgba(56,189,248,0.16)',
  badgeClass = DEFAULT_BADGE,
  sticky,
  testId,
  children,
}: FullPageProps) {
  const [dragY, setDragY] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<{ startY: number; atTop: boolean; dy: number } | null>(null);

  useTelegramBackButton(isOpen, onClose);

  useEffect(() => {
    if (isOpen) playClick();
  }, [isOpen]);

  if (!isOpen) return null;

  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    touchRef.current = { startY: e.touches[0].clientY, atTop: (scrollRef.current?.scrollTop ?? 0) <= 0, dy: 0 };
  };
  const onTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    const t = touchRef.current;
    if (!t || !t.atTop) return;
    const dy = Math.max(0, e.touches[0].clientY - t.startY);
    t.dy = dy;
    setDragY(dy);
  };
  const onTouchEnd = () => {
    const dy = touchRef.current?.dy ?? 0;
    if (dy > SWIPE_CLOSE_PX) onClose();
    setDragY(0);
    touchRef.current = null;
  };

  return (
    <div
      className="full-page fixed inset-0 z-50 flex flex-col text-white select-none pointer-events-auto"
      style={{
        background: `radial-gradient(130% 55% at 50% 0%, ${glow}, rgba(11,18,32,0) 62%), #0b1220`,
        transform: dragY ? `translateY(${dragY}px)` : undefined,
        transition: dragY ? 'none' : 'transform 0.25s ease',
      }}
      data-testid={testId}
    >
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="shrink-0"
      >
        <div className="flex justify-center pt-4 pb-1">
          <span className="h-1 w-10 rounded-full bg-white/20" />
        </div>
        <header
          className="flex items-center gap-3 px-4 pb-3 border-b border-white/10"
          style={{ paddingTop: 'max(10px, env(safe-area-inset-top, 10px))' }}
        >
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 hover:bg-white/10 hover:text-white active:scale-90 transition-all shrink-0"
            data-testid={`${testId}-back`}
            aria-label="Назад"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold tracking-tight truncate">{title}</h1>
            {subtitle && <p className="text-[11px] text-slate-400 truncate">{subtitle}</p>}
          </div>
          {icon && <div className={badgeClass}>{icon}</div>}
        </header>
      </div>

      {sticky && (
        <div className="shrink-0 px-4 pt-3">
          <div className="max-w-md mx-auto">{sticky}</div>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4"
        style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom, 24px))' }}
      >
        <div className="max-w-md mx-auto">{children}</div>
      </div>
    </div>
  );
}
