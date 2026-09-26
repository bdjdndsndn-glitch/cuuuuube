/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { triggerLayerTurnVibration } from '../utils/haptics';
import { BoltIcon, TrophyIcon } from './Icons';

const KEY = 'thecube_onboarded';

const STEPS = [
  {
    title: 'Крутіть кубик',
    text: 'Проведіть пальцем по фону, щоб оглянути кубик. Потягніть за грань — і шар повернеться.',
    icon: (
      <svg viewBox="0 0 24 24" className="w-8 h-8 fill-sky-300">
        <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zm0 2.3L6 8.6l6 3.4 6-3.4zM6 10.3v5.9l5 2.8v-5.9zm12 0l-5 2.8v5.9l5-2.8z" />
      </svg>
    ),
  },
  {
    title: 'Подвійний тап — старт',
    text: 'Двічі торкніться кубика: він перемішається, а таймер запуститься з першого повороту.',
    icon: (
      <svg viewBox="0 0 24 24" className="w-8 h-8 fill-sky-300">
        <path d="M9 11.2V5a2 2 0 1 1 4 0v6.2l1-.2a2 2 0 0 1 2.4 1.6l.6 3.2a5 5 0 0 1-4.9 5.9H11a5 5 0 0 1-4.5-2.8l-2.3-4.7a1.6 1.6 0 0 1 2.6-1.8L9 14.4z" />
      </svg>
    ),
  },
  {
    title: 'Рейтинг і виклик дня',
    text: 'Чіп угорі — однакове перемішування для всіх на добу. Кнопка «Лідери» у статистиці — рейтинг і тижневий турнір.',
    icon: (
      <span className="flex items-center gap-1 text-sky-300">
        <BoltIcon className="w-7 h-7 text-amber-300" />
        <TrophyIcon className="w-7 h-7" />
      </span>
    ),
  },
];

/** Три короткі підказки при першому запуску */
export function Onboarding({ hidden = false }: { hidden?: boolean }) {
  const [step, setStep] = useState(() => {
    try {
      return localStorage.getItem(KEY) ? -1 : 0;
    } catch {
      return 0;
    }
  });

  if (step < 0 || hidden) return null;

  const finish = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // ignore
    }
    setStep(-1);
  };
  const next = () => {
    triggerLayerTurnVibration(20, true);
    step >= STEPS.length - 1 ? finish() : setStep(step + 1);
  };
  const s = STEPS[step];

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-black/65 backdrop-blur-md pointer-events-auto animate-in fade-in duration-300" data-testid="onboarding">
      <div
        className="sheet-shell w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-slate-900/85 backdrop-blur-xl border border-white/10 p-5 text-white select-none sheet-enter"
        style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))' }}
      >
        <div className="sm:hidden flex justify-center -mt-1.5 mb-2.5">
          <span className="h-1 w-10 rounded-full bg-white/25" />
        </div>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500/25 to-blue-600/15 border border-sky-400/30 flex items-center justify-center shrink-0 shadow-lg shadow-sky-500/10">{s.icon}</div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-sky-300 font-bold">Крок {step + 1} з {STEPS.length}</div>
            <h3 className="text-base font-extrabold tracking-tight bg-gradient-to-r from-white to-sky-200 bg-clip-text text-transparent" data-testid="onboarding-title">{s.title}</h3>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-300 leading-relaxed">{s.text}</p>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-5 bg-sky-400' : 'w-1.5 bg-white/20'}`} />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={finish} className="text-xs px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition-colors" data-testid="onboarding-skip">Пропустити</button>
            <button onClick={next} className="text-xs font-bold px-5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white active:scale-95 transition-all shadow-lg shadow-sky-500/25" data-testid="onboarding-next">
              {step >= STEPS.length - 1 ? 'Почати' : 'Далі'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
