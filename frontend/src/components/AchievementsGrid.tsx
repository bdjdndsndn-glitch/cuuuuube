/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { api, Achievement } from '../utils/api';
import { AchievementIcon } from './Icons';

/** Сітка досягнень гравця у профілі */
export function AchievementsGrid() {
  const [items, setItems] = useState<Achievement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartScrollLeft = useRef<number | null>(null);

  useEffect(() => {
    api
      .achievements()
      .then((d) => setItems(d.items))
      .catch((e: Error) => setError(e.message || 'Не вдалося завантажити досягнення'));
  }, []);

  if (error) return <p className="mt-4 text-[11px] text-rose-300 text-center">{error}</p>;
  if (!items)
    return (
      <div className="mt-1 w-full text-left" data-testid="achievements-loading">
        <div className="flex items-center justify-between mb-1.5">
          <span className="h-3 w-24 rounded-full skeleton-shimmer" />
          <span className="h-3 w-10 rounded-full skeleton-shimmer" />
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 p-1 rounded-xl bg-slate-950/50 border border-white/5">
              <span className="w-8 h-8 rounded-lg skeleton-shimmer" />
              <span className="w-full h-2 rounded-full skeleton-shimmer" />
            </div>
          ))}
        </div>
      </div>
    );

  const unlocked = items.filter((a) => a.unlocked_at).length;
  const pageSize = 8;
  const pages = Array.from({ length: Math.ceil(items.length / pageSize) }, (_, pageIndex) =>
    items.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize)
  );

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    touchStartX.current = event.touches[0].clientX;
    touchStartScrollLeft.current = el.scrollLeft;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    const startX = touchStartX.current;
    const startScrollLeft = touchStartScrollLeft.current;
    if (!el || startX === null || startScrollLeft === null) return;

    const deltaX = event.touches[0].clientX - startX;
    el.scrollLeft = startScrollLeft - deltaX;
  };

  const handleTouchEnd = () => {
    touchStartX.current = null;
    touchStartScrollLeft.current = null;
  };

  return (
    <div className="mt-1 w-full text-left" data-testid="achievements-grid">
      <div className="flex items-center justify-between mb-1.5">
        <h4 className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Досягнення</h4>
        <span className="text-[11px] text-sky-300 font-semibold">{unlocked} / {items.length}</span>
      </div>
      <div
        ref={scrollRef}
        className="overflow-x-auto scroll-smooth px-0.5 select-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
        }}
      >
        <div className="flex gap-2 pb-1" style={{ scrollSnapType: 'x mandatory' }}>
          {pages.map((page, pageIndex) => (
            <div
              key={`achievement-page-${pageIndex}`}
              className="grid min-w-[85vw] grid-cols-4 gap-1.5 flex-shrink-0"
              style={{ scrollSnapAlign: 'start' }}
            >
              {page.map((a) => {
                const on = Boolean(a.unlocked_at);
                return (
                  <div
                    key={a.id}
                    title={`${a.title} — ${a.desc}${a.unlocked_at ? ` (${a.unlocked_at.slice(0, 10)})` : ''}`}
                    className={`flex flex-col items-center gap-1 p-1 rounded-xl border ${on ? 'bg-sky-500/10 border-sky-400/30' : 'bg-slate-950/50 border-white/5 opacity-70'}`}
                    data-testid={`achievement-${a.id}${on ? '-unlocked' : ''}`}
                  >
                    <AchievementIcon id={a.id} unlocked={on} className="mt-2.5 w-10 h-10" />
                    <span className={`text-[9px] leading-tight text-center font-semibold ${on ? 'text-white' : 'text-slate-500'}`}>{a.title}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
