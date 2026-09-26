/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReactNode, useEffect } from 'react';
import { useTelegramBackButton } from '../utils/backButton';
import { playClick } from '../utils/sound';

interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  testId: string;
  children: ReactNode;
}

/**
 * Спільна оболонка модальних панелей (рейтинг, виклик дня)
 */
export function Sheet({ isOpen, onClose, title, subtitle, icon, testId, children }: SheetProps) {
  useTelegramBackButton(isOpen, onClose);
  useEffect(() => {
    if (isOpen) playClick();
  }, [isOpen]);
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200 pointer-events-auto"
      onClick={onClose}
      data-testid={`${testId}-overlay`}
    >
      <div
        className="sheet-shell relative w-full sm:max-w-md max-h-[90dvh] sm:max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-slate-900/85 backdrop-blur-xl border border-white/10 text-white select-none sheet-enter"
        onClick={(e) => e.stopPropagation()}
        data-testid={testId}
      >
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <span className="h-1 w-10 rounded-full bg-white/25" />
        </div>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-sky-500/30 to-blue-600/20 border border-sky-400/30 flex items-center justify-center text-sky-300 shadow-lg shadow-sky-500/10 shrink-0">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-base font-extrabold tracking-tight bg-gradient-to-r from-white to-sky-200 bg-clip-text text-transparent truncate">{title}</h3>
              {subtitle && <p className="text-[11px] text-slate-400 mt-0.5 truncate">{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 active:scale-90 flex items-center justify-center text-slate-400 hover:text-white transition-all shrink-0"
            data-testid={`${testId}-close`}
            aria-label="Закрити"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div
          className="px-5 pt-4 overflow-y-auto overscroll-contain"
          style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
