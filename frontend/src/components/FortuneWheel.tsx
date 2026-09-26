import { useEffect, useMemo, useState } from 'react';
import { GAME_STATE } from '../utils/gameBridge';
import { triggerLayerTurnVibration } from '../utils/haptics';
import { api } from '../utils/api';
import { FullPage } from './FullPage';

interface FortuneWheelProps {
  gameState: number;
}

const PRIZES = [
  { label: '0.0005 TON', weight: 28, color: '#2563eb' },
  { label: '0.00010 TON', weight: 24, color: '#7c3aed' },
  { label: '50 монет', weight: 22, color: '#d97706' },
  { label: '100 монет', weight: 15, color: '#059669' },
  { label: '0.0015 TON', weight: 10, color: '#db2777' },
  { label: '500 монет', weight: 1, color: '#b91c1c' },
];
const SEGMENT_ANGLE = 360 / PRIZES.length;
const WHEEL_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const WHEEL_LAST_SPIN_KEY = 'thecube_fortune_wheel_last_spin';

function TonMark() {
  return (
    <svg viewBox="0 0 24 24" className="inline-flex h-4 w-4 animate-pulse drop-shadow-[0_0_6px_rgba(56,189,248,0.9)]" aria-label="TON">
      <circle cx="12" cy="12" r="11" fill="#2da9dc" stroke="#8bdcf7" strokeWidth="0.7" />
      <path
        d="M7.1 6.8h9.8c.9 0 1.4 1 .9 1.8l-4.6 8.2c-.55 1-1.95 1-2.5 0L6.2 8.6c-.5-.8 0-1.8.9-1.8z"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 7.2v9.9" stroke="#ffffff" strokeWidth="1.65" strokeLinecap="round" />
      <path d="M8.2 5.2h7.6" stroke="#dff7ff" strokeWidth="0.8" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}

function CoinMark() {
  return (
    <svg viewBox="0 0 24 24" className="inline-flex h-4 w-4 animate-[pulse_2.4s_ease-in-out_infinite] drop-shadow-[0_0_5px_rgba(251,191,36,0.8)]" aria-label="монети">
      <defs>
        <radialGradient id="fortune-coin-gradient" cx="30%" cy="25%">
          <stop offset="0" stopColor="#fff7b2" />
          <stop offset="0.45" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#b45309" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill="url(#fortune-coin-gradient)" stroke="#fde68a" strokeWidth="1" />
      <circle cx="12" cy="12" r="7" fill="none" stroke="#fff7b2" strokeWidth="0.8" opacity="0.8" />
      <path d="M12 7v10M9 9.5h4a1.5 1.5 0 0 1 0 3H10a1.5 1.5 0 0 0 0 3h4" fill="none" stroke="#92400e" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function PrizeLabel({ label }: { label: string }) {
  const tonParts = label.split(' TON');
  if (tonParts.length > 1) {
    return (
      <span className="inline-flex items-center justify-center gap-1">
        {tonParts[0]}
        <TonMark />
      </span>
    );
  }
  const coinParts = label.split(' монет');
  if (coinParts.length > 1) {
    return (
      <span className="inline-flex items-center justify-center gap-1">
        {coinParts[0]}
        <CoinMark />
      </span>
    );
  }
  return <>{label}</>;
}

function readLastSpin(): number {
  if (typeof window === 'undefined') return 0;
  return Number(window.localStorage.getItem(WHEEL_LAST_SPIN_KEY) || 0);
}

function formatCooldown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function playWheelCue(file: string) {
  if (typeof window === 'undefined') return;
  const audio = new Audio(`/audio/${file}.mp3`);
  audio.volume = file === 'wheel-background' ? 0.12 : 0.38;
  void audio.play().catch(() => undefined);
}

const wheelIcon = (
  <svg viewBox="0 0 32 32" className="w-5 h-5 animate-[pulse_2.2s_ease-in-out_infinite]" aria-hidden="true">
    <circle cx="16" cy="17" r="13" fill="#451a03" opacity="0.7" />
    <path d="M16 17L16 4A13 13 0 0 1 27.26 10.5Z" fill="#ef4444" stroke="#fde68a" strokeWidth="0.5" />
    <path d="M16 17L27.26 10.5A13 13 0 0 1 27.26 23.5Z" fill="#f59e0b" stroke="#fde68a" strokeWidth="0.5" />
    <path d="M16 17L27.26 23.5A13 13 0 0 1 16 30Z" fill="#22c55e" stroke="#fde68a" strokeWidth="0.5" />
    <path d="M16 17L16 30A13 13 0 0 1 4.74 23.5Z" fill="#3b82f6" stroke="#fde68a" strokeWidth="0.5" />
    <path d="M16 17L4.74 23.5A13 13 0 0 1 4.74 10.5Z" fill="#a855f7" stroke="#fde68a" strokeWidth="0.5" />
    <path d="M16 17L4.74 10.5A13 13 0 0 1 16 4Z" fill="#ec4899" stroke="#fde68a" strokeWidth="0.5" />
    <circle cx="16" cy="17" r="4" fill="#fff7b2" stroke="#b45309" strokeWidth="1" />
    <circle cx="16" cy="17" r="1.5" fill="#f59e0b" />
    <path d="M16 1.5l1.7 4h-3.4z" fill="#fff7b2" stroke="#f59e0b" strokeWidth="0.7" />
    <path d="M26.5 3v3M25 4.5h3" stroke="#fff7b2" strokeWidth="1.2" strokeLinecap="round" className="animate-pulse" />
  </svg>
);

export function FortuneWheel({ gameState }: FortuneWheelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState(() => Math.max(0, readLastSpin() + WHEEL_COOLDOWN_MS - Date.now()));
  const [extraSpins, setExtraSpins] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    return Number(window.localStorage.getItem('thecube_extra_spins') || 0);
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('thecube_extra_spins', String(extraSpins));
    }
  }, [extraSpins]);

  const particles = useMemo(
    () => Array.from({ length: 18 }, (_, index) => ({
      id: index,
      left: `${8 + ((index * 13) % 80)}%`,
      delay: `${(index % 6) * 0.08}s`,
      duration: `${1.2 + (index % 5) * 0.18}s`,
      color: ['#fbbf24', '#f59e0b', '#fef3c7', '#38bdf8', '#a78bfa', '#34d399'][index % 6],
    })),
    []
  );

  useEffect(() => {
    const updateCooldown = () => setCooldownLeft(Math.max(0, readLastSpin() + WHEEL_COOLDOWN_MS - Date.now()));
    updateCooldown();
    const timer = window.setInterval(updateCooldown, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const audio = new Audio('/audio/wheel-background.mp3');
    audio.loop = true;
    audio.volume = 0.12;
    void audio.play().catch(() => undefined);
    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, [isOpen]);

  const spin = async () => {
    if (spinning || (cooldownLeft > 0 && extraSpins <= 0)) return;
    setError(null);
    let serverResult;
    try {
      serverResult = await api.fortuneWheelSpin();
    } catch (caught) {
      setError((caught as Error).message || 'Колесо тимчасово недоступне');
      return;
    }

    playWheelCue('wheel-spin');

    if (extraSpins > 0) {
      setExtraSpins((current) => Math.max(0, current - 1));
    }

    const selectedIndex = Math.max(0, PRIZES.findIndex((prize) => prize.label === serverResult.prize));
    const target = 360 * 6 + (360 - selectedIndex * SEGMENT_ANGLE - SEGMENT_ANGLE / 2);
    setSpinning(true);
    setResult(null);
    setError(null);
    window.localStorage.setItem(WHEEL_LAST_SPIN_KEY, String(Date.now()));
    setCooldownLeft(serverResult.seconds_until_next * 1000);
    setRotation((current) => current + target);
    triggerLayerTurnVibration(30, true);
    window.setTimeout(() => {
      setSpinning(false);
      setResult(serverResult.prize);
      triggerLayerTurnVibration(45, true);
    }, 3200);
  };

  const handleRewardExtraSpin = async () => {
    if (spinning) return;
    try {
      const response = await api.rewardSpin();
      setExtraSpins(response.extra_spins);
      setError(null);
      playWheelCue('wheel-win');
      triggerLayerTurnVibration(20, true);
    } catch (caught) {
      setError((caught as Error).message || 'Неможливо активувати додатковий оберт');
    }
  };

  const visible = gameState === GAME_STATE.Menu;

  return (
    <>
      {visible && (
        <button
          type="button"
          onClick={() => {
            triggerLayerTurnVibration(20, true);
            setIsOpen(true);
          }}
          className="pointer-events-auto fixed z-40 left-3 h-10 w-10 overflow-visible rounded-full bg-slate-900/90 text-amber-300 shadow-[0_10px_25px_rgba(251,191,36,0.2)] border border-amber-400/40 backdrop-blur-sm flex items-center justify-center transition-all active:scale-95 hover:bg-slate-800"
          style={{ top: 'max(14px, env(safe-area-inset-top, 14px))' }}
          aria-label="Колесо фортуни"
          title="Колесо фортуни"
          data-testid="fortune-wheel-open-button"
        >
          {wheelIcon}
          <span className="fortune-wheel-label pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[9px] font-extrabold uppercase tracking-wide">Колесо</span>
        </button>
      )}

      <FullPage
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Колесо фортуни"
        subtitle="Обертай колесо та випробуй удачу"
        icon={wheelIcon}
        glow="rgba(251,191,36,0.22)"
        badgeClass="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-300/30 to-orange-600/20 border border-amber-200/40 flex items-center justify-center text-amber-200 shadow-lg shadow-amber-500/20 shrink-0"
        testId="fortune-wheel-page"
      >
        <div className="flex flex-col items-center py-5">
          <div className="relative w-[min(84vw,330px)] aspect-square rounded-full bg-gradient-to-br from-yellow-100 via-amber-400 to-orange-700 p-3 shadow-[0_0_70px_rgba(251,191,36,0.35),inset_0_8px_12px_rgba(255,255,255,0.85),inset_0_-8px_12px_rgba(120,53,15,0.4),0_18px_45px_rgba(15,23,42,0.8)]">
            <div className="absolute -top-7 left-1/2 z-20 -translate-x-1/2 text-amber-200 drop-shadow-[0_2px_5px_rgba(0,0,0,0.75)]">
              <svg viewBox="0 0 24 24" className="h-9 w-9 fill-current"><path d="M12 23L4 7h16z" /><path d="M12 19L7 9h10z" fill="#7c2d12" opacity="0.45" /></svg>
            </div>
            <div
              className="absolute inset-2 rounded-full border-4 border-yellow-100/80 shadow-[inset_0_0_0_4px_rgba(120,53,15,0.45),inset_0_0_30px_rgba(15,23,42,0.5),0_0_28px_rgba(15,23,42,0.38)] transition-transform duration-[3600ms] ease-[cubic-bezier(.12,.72,.18,1)]"
              style={{
                transform: `rotate(${rotation}deg)`,
                background: `conic-gradient(${PRIZES.map((prize, index) => `${prize.color} ${index * SEGMENT_ANGLE}deg ${(index + 1) * SEGMENT_ANGLE}deg`).join(', ')})`,
              }}
            >
              {PRIZES.map((prize, index) => (
                <span
                  key={prize.label}
                  className="absolute left-1/2 top-1/2 w-24 -translate-x-1/2 -translate-y-1/2 text-center text-[9px] font-black leading-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
                  style={{ transform: `rotate(${index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2}deg) translateY(-112px) rotate(${-(index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2)}deg)` }}
                >
                  <PrizeLabel label={prize.label} />
                </span>
              ))}
              <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-4 border-yellow-100 bg-gradient-to-br from-slate-800 to-slate-950 text-[9px] font-black uppercase tracking-wider text-amber-200 shadow-[0_4px_12px_rgba(0,0,0,0.55),inset_0_1px_2px_rgba(255,255,255,0.3)]">THE<span className="text-[11px] text-white">CUBE</span></span>
            </div>

            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
              {particles.map((p) => (
                <span
                  key={p.id}
                  className="absolute top-[52%] h-2 w-2 rounded-full opacity-90"
                  style={{
                    left: p.left,
                    background: p.color,
                    animation: `fortune-pop ${p.duration} ease-in-out infinite alternate`,
                    animationDelay: p.delay,
                    boxShadow: `0 0 10px ${p.color}`,
                  }}
                />
              ))}
            </div>
          </div>

          <div className="mt-7 flex w-full max-w-xs items-center justify-between rounded-2xl border border-white/10 bg-slate-950/55 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm">
            <div className="text-left">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">Обертів</div>
              <div className="text-base font-black text-amber-200">{extraSpins}</div>
            </div>
            <button
              type="button"
              className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-sky-100"
              onClick={handleRewardExtraSpin}
            >
              +1 через рекламу
            </button>
          </div>

          <div className="mt-6 text-center">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-amber-200">1 обертання на 24 години</div>
            <div className="mt-1 text-xs font-mono font-bold text-white/80" data-testid="fortune-wheel-cooldown">
              {cooldownLeft > 0 ? `Наступне обертання через ${formatCooldown(cooldownLeft)}` : 'Колесо доступне для обертання'}
            </div>
          </div>

          <button
            type="button"
            onClick={spin}
            disabled={spinning || (cooldownLeft > 0 && extraSpins <= 0)}
            className="mt-3 w-full max-w-xs rounded-2xl bg-gradient-to-r from-amber-400 via-orange-400 to-yellow-300 py-3 text-sm font-black text-slate-950 shadow-[0_12px_30px_rgba(251,191,36,0.38)] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="fortune-wheel-spin-button"
          >
            {spinning ? 'Колесо обертається...' : cooldownLeft > 0 && extraSpins <= 0 ? 'Спробуйте завтра' : extraSpins > 0 ? 'Крутити +1 оберт' : 'Крутити колесо'}
          </button>
          <div className="mt-4 min-h-8 text-center text-sm font-bold text-amber-200" data-testid="fortune-wheel-result">
            {error ? <span className="text-rose-300">{error}</span> : result ? <span className="inline-flex items-center justify-center gap-1.5">Ваша нагорода: <PrizeLabel label={result} /></span> : 'Спробуйте свою удачу'}
          </div>
        </div>
      </FullPage>
    </>
  );
}
