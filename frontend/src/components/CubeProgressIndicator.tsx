/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useRef } from 'react';
import { getCubeProgress, CubeProgressResult } from '../utils/cubeProgress';
import { triggerLayerTurnVibration } from '../utils/haptics';

/**
 * Невеликий гарний 3D індикатор прогресу зібраності кубика під таймером.
 */
export function CubeProgressIndicator() {
  const [progress, setProgress] = useState<CubeProgressResult>({
    percent: 100,
    matchedStickers: 54,
    totalStickers: 54,
    solvedFaces: 6,
    isSolved: true,
    cubeSize: 3,
  });

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [timerBottom, setTimerBottom] = useState<number | null>(null);
  const prevPercentRef = useRef<number>(100);

  // Відстежуємо стан гри (чи активний таймер і чи йде гра)
  useEffect(() => {
    const updateGameState = () => {
      const game = (window as any).game;
      const uiEl = document.querySelector('.ui');
      const isPlayingClass = uiEl?.classList.contains('ui--playing');
      const gameState = game?.state;

      // Стан гри: 1 = I.Playing
      const active = Boolean(isPlayingClass || gameState === 1);
      setIsPlaying(active);

      if (active) {
        const currentProgress = getCubeProgress();
        setProgress(currentProgress);

        // Тактильний відгук на ключові віхи (50%, 75%, 100%)
        if (
          prevPercentRef.current < 100 &&
          currentProgress.percent === 100 &&
          currentProgress.isSolved
        ) {
          triggerLayerTurnVibration(45, true);
        }
        prevPercentRef.current = currentProgress.percent;
      }

      // Оновлюємо точне положення під таймером
      const timerEl = document.querySelector('.text--timer');
      if (timerEl) {
        const rect = timerEl.getBoundingClientRect();
        if (rect.height > 0 && rect.bottom > 0) {
          setTimerBottom(rect.bottom);
        }
      }
    };

    // Початкова перевірка
    updateGameState();

    // Періодичне оновлення стану та відсотка зібраності
    const interval = setInterval(updateGameState, 200);

    // Слухаємо переміщення граней кубика
    const handlePointerUp = () => {
      setTimeout(updateGameState, 50);
      setTimeout(updateGameState, 250);
    };

    window.addEventListener('touchend', handlePointerUp, { passive: true });
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('resize', updateGameState);

    return () => {
      clearInterval(interval);
      window.removeEventListener('touchend', handlePointerUp);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('resize', updateGameState);
    };
  }, []);

  // Якщо гра не активна (головне меню, налаштування або статистика) — приховуємо
  if (!isPlaying) {
    return null;
  }

  // Колірний градієнт для заповнення шкали залежно від відсотка
  const getGradientStyle = (percent: number) => {
    if (percent >= 100) {
      return 'linear-gradient(90deg, #10b981 0%, #34d399 50%, #facc15 100%)';
    }
    if (percent >= 75) {
      return 'linear-gradient(90deg, #059669 0%, #10b981 60%, #34d399 100%)';
    }
    if (percent >= 45) {
      return 'linear-gradient(90deg, #0284c7 0%, #06b6d4 60%, #38bdf8 100%)';
    }
    return 'linear-gradient(90deg, #ea580c 0%, #f59e0b 60%, #fbbf24 100%)';
  };

  const glowColor =
    progress.percent >= 100
      ? 'rgba(16, 185, 129, 0.45)'
      : progress.percent >= 75
      ? 'rgba(16, 185, 129, 0.3)'
      : progress.percent >= 45
      ? 'rgba(6, 182, 212, 0.3)'
      : 'rgba(245, 158, 11, 0.25)';

  const topPosition = timerBottom ? `${timerBottom + 6}px` : '24%';

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-30 transition-all duration-300 pointer-events-auto"
      style={{ top: topPosition }}
      onClick={() => {
        setShowDetails(!showDetails);
        triggerLayerTurnVibration(20, true);
      }}
      role="button"
      tabIndex={0}
      title="Натисніть для перегляду деталей прогресу"
    >
      {/* 3D Контейнер індикатора з ізометричним об'ємом */}
      <div
        className="relative flex items-center gap-2.5 px-3 py-1.5 rounded-full select-none cursor-pointer transition-all duration-200 active:scale-95"
        style={{
          background:
            'linear-gradient(135deg, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.05) 50%, rgba(0, 0, 0, 0.25) 100%), rgba(15, 23, 42, 0.72)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          boxShadow: `0 6px 16px rgba(0, 0, 0, 0.35), inset 0 1px 1px rgba(255, 255, 255, 0.5), inset 0 -1px 2px rgba(0, 0, 0, 0.4), 0 0 12px ${glowColor}`,
          border: '1px solid rgba(255, 255, 255, 0.25)',
          perspective: '600px',
        }}
      >
        {/* Мініатюрний 3D ізометричний кубик */}
        <div
          className="relative w-5 h-5 flex-shrink-0 flex items-center justify-center"
          style={{
            perspective: '300px',
          }}
        >
          <div
            className="w-4 h-4 relative transition-transform duration-700"
            style={{
              transformStyle: 'preserve-3d',
              transform: `rotateX(-22deg) rotateY(${progress.percent === 100 ? 398 : 38}deg)`,
              filter: `drop-shadow(0 2px 3px rgba(0, 0, 0, 0.45))`,
            }}
          >
            {/* Передня грань 3D кубика */}
            <div
              className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-[1px] p-[1px] rounded-[2px]"
              style={{
                transform: 'translateZ(8px)',
                background: '#1e293b',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2)',
              }}
            >
              <div className="bg-emerald-500 rounded-[1px]" />
              <div
                className={`rounded-[1px] ${
                  progress.percent >= 70 ? 'bg-emerald-500' : 'bg-amber-400'
                }`}
              />
              <div
                className={`rounded-[1px] ${
                  progress.percent >= 85 ? 'bg-emerald-500' : 'bg-cyan-500'
                }`}
              />
              <div
                className={`rounded-[1px] ${
                  progress.percent === 100 ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
              />
            </div>

            {/* Верхня грань 3D кубика */}
            <div
              className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-[1px] p-[1px] rounded-[2px]"
              style={{
                transform: 'rotateX(90deg) translateZ(8px)',
                background: '#334155',
                filter: 'brightness(1.2)',
              }}
            >
              <div className="bg-amber-400 rounded-[1px]" />
              <div
                className={`rounded-[1px] ${
                  progress.percent >= 50 ? 'bg-amber-400' : 'bg-blue-500'
                }`}
              />
              <div
                className={`rounded-[1px] ${
                  progress.percent >= 90 ? 'bg-amber-400' : 'bg-emerald-400'
                }`}
              />
              <div className="bg-amber-400 rounded-[1px]" />
            </div>

            {/* Права грань 3D кубика */}
            <div
              className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-[1px] p-[1px] rounded-[2px]"
              style={{
                transform: 'rotateY(90deg) translateZ(8px)',
                background: '#0f172a',
                filter: 'brightness(0.85)',
              }}
            >
              <div className="bg-rose-500 rounded-[1px]" />
              <div
                className={`rounded-[1px] ${
                  progress.percent >= 60 ? 'bg-rose-500' : 'bg-amber-400'
                }`}
              />
              <div
                className={`rounded-[1px] ${
                  progress.percent >= 80 ? 'bg-rose-500' : 'bg-sky-400'
                }`}
              />
              <div className="bg-rose-500 rounded-[1px]" />
            </div>
          </div>
        </div>

        {/* 3D Об'ємна шкала прогресу */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center justify-between gap-3">
            <span
              className="text-[10px] font-bold uppercase tracking-wider text-white/70"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
            >
              {progress.isSolved ? 'Зібрано!' : 'Прогрес'}
            </span>
            <span
              className="text-xs font-black text-white tabular-nums tracking-tight"
              style={{
                textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 0 6px rgba(255,255,255,0.4)',
              }}
            >
              {progress.percent}%
            </span>
          </div>

          {/* Поглиблена 3D доріжка шкали */}
          <div
            className="w-24 sm:w-28 h-2 rounded-full overflow-hidden p-[1px] relative"
            style={{
              background: 'rgba(0, 0, 0, 0.55)',
              boxShadow:
                'inset 0 1.5px 3px rgba(0, 0, 0, 0.8), 0 1px 1px rgba(255, 255, 255, 0.15)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
            }}
          >
            {/* 3D Заповнення шкали з відблиском світла */}
            <div
              className="h-full rounded-full transition-all duration-300 relative overflow-hidden"
              style={{
                width: `${Math.max(4, progress.percent)}%`,
                background: getGradientStyle(progress.percent),
                boxShadow: `0 0 8px ${glowColor}, inset 0 1px 1px rgba(255, 255, 255, 0.7)`,
              }}
            >
              {/* Верхня світлова лінія відблиску для 3D ефекту скла/металу */}
              <div
                className="absolute top-0 left-0 right-0 h-[1px]"
                style={{
                  background:
                    'linear-gradient(90deg, rgba(255,255,255,0.9), rgba(255,255,255,0.3))',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Спливаюча міні-підказка з деталями (з'являється або ховається по тапу) */}
      {showDetails && (
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-3 py-1 rounded-lg text-[11px] whitespace-nowrap text-white font-medium select-none animate-in fade-in zoom-in-95 duration-150"
          style={{
            background: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          <span className="text-emerald-400 font-bold">{progress.matchedStickers}</span>
          <span className="text-white/60">/{progress.totalStickers} наліпок</span>
          <span className="mx-1.5 text-white/30">•</span>
          <span className="text-cyan-400 font-bold">{progress.solvedFaces}</span>
          <span className="text-white/60">/6 граней</span>
        </div>
      )}
    </div>
  );
}
