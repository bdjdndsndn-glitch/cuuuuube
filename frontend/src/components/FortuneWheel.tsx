import { useEffect, useMemo, useState } from 'react';
import { GAME_STATE } from '../utils/gameBridge';
import { triggerLayerTurnVibration } from '../utils/haptics';
import { api } from '../utils/api';
import { FullPage } from './FullPage';

interface FortuneWheelProps {
  gameState: number;
}

interface PrizeDef {
  label: string;
  shortLabel: string;
  weight: number;
  color: string;
  glow: string;
  kind: 'ton' | 'coin' | 'none';
}

const PRIZES: PrizeDef[] = [
  { label: '0.0005 TON', shortLabel: '0.0005 TON', weight: 28, color: '#38bdf8', glow: 'rgba(56, 189, 248, 0.55)', kind: 'ton' },
  { label: '0.00010 TON', shortLabel: '0.00010 TON', weight: 24, color: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.55)', kind: 'ton' },
  { label: '50 монет', shortLabel: '50', weight: 22, color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.55)', kind: 'coin' },
  { label: '100 монет', shortLabel: '100', weight: 15, color: '#10b981', glow: 'rgba(16, 185, 129, 0.5)', kind: 'coin' },
  { label: '0.0015 TON', shortLabel: '0.0015 TON', weight: 10, color: '#ec4899', glow: 'rgba(236, 72, 153, 0.5)', kind: 'ton' },
  { label: 'Без виграшу', shortLabel: 'Без виграшу', weight: 30, color: '#64748b', glow: 'rgba(100, 116, 139, 0.5)', kind: 'none' },
  { label: '500 монет', shortLabel: '500', weight: 1, color: '#ef4444', glow: 'rgba(239, 68, 68, 0.55)', kind: 'coin' },
  { label: '1000 монет', shortLabel: '1000', weight: 0.2, color: '#f97316', glow: 'rgba(249, 115, 22, 0.5)', kind: 'coin' },
  { label: '0.0050 TON', shortLabel: '0.0050 TON', weight: 0.02, color: '#06b6d4', glow: 'rgba(6, 182, 212, 0.55)', kind: 'ton' },
  { label: '0.0100 TON', shortLabel: '0.0100 TON', weight: 0.005, color: '#14b8a6', glow: 'rgba(20, 184, 166, 0.55)', kind: 'ton' },
  { label: '10000 монет', shortLabel: '10000', weight: 0.001, color: '#facc15', glow: 'rgba(250, 204, 21, 0.65)', kind: 'coin' },
];
const SEGMENT_ANGLE = 360 / PRIZES.length;
const WHEEL_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const WHEEL_LAST_SPIN_KEY = 'thecube_fortune_wheel_last_spin';

function normalizePrize(prizeLabel: string | null | undefined): number {
  if (!prizeLabel) return -1;
  const matchIndex = PRIZES.findIndex((prize) => prize.label === prizeLabel || prize.shortLabel === prizeLabel);
  return matchIndex >= 0 ? matchIndex : -1;
}

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
    <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-yellow-100 via-amber-400 to-orange-600 shadow-[inset_-1px_-2px_2px_rgba(120,53,15,0.45),inset_1px_1px_2px_rgba(255,255,255,0.8),0_2px_4px_rgba(120,53,15,0.35)] [transform:rotateX(12deg)]" aria-hidden="true">
      <span className="absolute inset-[2px] flex items-center justify-center rounded-full border border-yellow-50/80 bg-gradient-to-br from-amber-300 to-yellow-500 text-[8px] font-black leading-none text-orange-800">C</span>
      <span className="absolute -bottom-0.5 left-0.5 right-0.5 h-1 rounded-full bg-orange-700/45 blur-[1px]" />
    </span>
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
  const [selectedPrizeIndex, setSelectedPrizeIndex] = useState<number | null>(null);
  const [cooldownLeft, setCooldownLeft] = useState(() => Math.max(0, readLastSpin() + WHEEL_COOLDOWN_MS - Date.now()));
  const [extraSpins, setExtraSpins] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    return Number(window.localStorage.getItem('thecube_extra_spins') || 0);
  });

  const activePrize = useMemo(
    () => (result ? PRIZES.find((prize) => prize.label === result) ?? PRIZES[0] : null),
    [result]
  );

  const sparkleBurst = useMemo(
    () => Array.from({ length: 12 }, (_, index) => ({
      id: index,
      left: `${16 + ((index * 13) % 68)}%`,
      top: `${18 + ((index * 11) % 64)}%`,
      delay: `${(index % 5) * 0.08}s`,
      size: 4 + (index % 4) * 2,
      color: ['#fef3c7', '#fbbf24', '#fca5a5', '#7dd3fc', '#c4b5fd', '#86efac'][index % 6],
    })),
    []
  );

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
    const audio = new Audio('/audio/cyberwave-orchestra-upbeat-background-loop-casual-video-game-music-249200.mp3');
    audio.loop = true;
    audio.volume = 0.16;
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

    const selectedIndex = normalizePrize(serverResult.prize);
    const safeIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const target = 360 * 6 + (360 - safeIndex * SEGMENT_ANGLE - SEGMENT_ANGLE / 2);

    setSpinning(true);
    setResult(null);
    setSelectedPrizeIndex(safeIndex);
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
  const wheelGradient = `conic-gradient(${PRIZES.map((prize, index) => `${prize.color} ${index * SEGMENT_ANGLE}deg ${(index + 1) * SEGMENT_ANGLE}deg`).join(', ')})`;

  return (
    <>
      {visible && (
        <button
          type="button"
          onClick={() => {
            triggerLayerTurnVibration(20, true);
            setIsOpen(true);
          }}
          className="pointer-events-auto fixed z-40 left-3 flex h-12 w-12 items-center justify-center overflow-visible rounded-full border border-amber-300/60 bg-slate-950/80 text-amber-200 shadow-[0_12px_28px_rgba(251,191,36,0.28)] backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-900 active:scale-95"
          style={{ top: 'max(14px, env(safe-area-inset-top, 14px))' }}
          aria-label="Колесо фортуни"
          title="Колесо фортуни"
          data-testid="fortune-wheel-open-button"
        >
          <span className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-300/20 via-orange-500/10 to-transparent" />
          {wheelIcon}
          <span className="fortune-wheel-label pointer-events-none absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap text-[9px] font-extrabold uppercase tracking-[0.16em]">Колесо</span>
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
          <div className="relative w-[min(84vw,330px)] aspect-square rounded-full bg-gradient-to-br from-yellow-100 via-amber-300 to-orange-700 p-3 shadow-[0_0_70px_rgba(251,191,36,0.35),inset_0_8px_12px_rgba(255,255,255,0.85),inset_0_-8px_12px_rgba(120,53,15,0.4),0_18px_45px_rgba(15,23,42,0.8)]">
            <div className="absolute inset-[-10px] rounded-full border border-amber-300/35" />
            <div className="absolute inset-[-18px] rounded-full border border-amber-200/20" />
            <div className="absolute -top-8 left-1/2 z-20 -translate-x-1/2 text-amber-200 drop-shadow-[0_2px_5px_rgba(0,0,0,0.75)]">
              <svg viewBox="0 0 24 24" className="h-9 w-9 fill-current"><path d="M12 23L4 7h16z" /><path d="M12 19L7 9h10z" fill="#7c2d12" opacity="0.45" /></svg>
            </div>
            <div
              className="absolute inset-2 overflow-hidden rounded-full border-4 border-yellow-100/80 shadow-[inset_0_0_0_4px_rgba(120,53,15,0.45),inset_0_0_30px_rgba(15,23,42,0.5),0_0_28px_rgba(15,23,42,0.38)] transition-transform duration-[3600ms] ease-[cubic-bezier(.12,.72,.18,1)]"
              style={{
                transform: `rotate(${rotation}deg)`,
                background: wheelGradient,
              }}
            >
              <div className="absolute inset-1 rounded-full border border-white/10" />
              {PRIZES.map((prize, index) => (
                <span
                  key={prize.label}
                  className="absolute left-1/2 top-1/2 w-24 -translate-x-1/2 -translate-y-1/2 text-center text-[9px] font-black leading-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
                  style={{
                    transform: `rotate(${index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2}deg) translateY(-112px) rotate(${-(index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2)}deg)`,
                    opacity: selectedPrizeIndex === index ? 1 : 0.92,
                    filter: selectedPrizeIndex === index ? `drop-shadow(0 0 10px ${prize.glow})` : 'none',
                    scale: selectedPrizeIndex === index ? '1.08' : '1',
                  }}
                >
                  <PrizeLabel label={prize.label} />
                </span>
              ))}
              <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-4 border-yellow-100 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 text-[9px] font-black uppercase tracking-wider text-amber-200 shadow-[0_4px_12px_rgba(0,0,0,0.55),inset_0_1px_2px_rgba(255,255,255,0.3)]">
                THE<span className="text-[11px] text-white">CUBE</span>
              </span>
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

            {result && (
              <div className="pointer-events-none absolute inset-[-20px] rounded-full">
                {result !== 'Без виграшу' && sparkleBurst.map((sparkle) => (
                  <span
                    key={sparkle.id}
                    className="absolute rounded-full opacity-90"
                    style={{
                      left: sparkle.left,
                      top: sparkle.top,
                      width: `${sparkle.size}px`,
                      height: `${sparkle.size}px`,
                      background: sparkle.color,
                      boxShadow: `0 0 16px ${sparkle.color}`,
                      animation: `fortune-burst 0.9s ease-out infinite alternate`,
                      animationDelay: sparkle.delay,
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="mt-7 flex w-full max-w-xs items-center justify-between rounded-2xl border border-white/10 bg-slate-950/55 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-sm">
            <div className="text-left">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400">Обертів</div>
              <div className="text-base font-black text-amber-200">{extraSpins}</div>
            </div>
            <button
              type="button"
              className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-sky-100 transition hover:bg-sky-500/15 active:scale-[0.98]"
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

          <div className="mt-3 w-full max-w-xs rounded-2xl border border-amber-300/25 bg-gradient-to-r from-amber-400/10 via-orange-500/5 to-transparent px-3 py-2 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-amber-200/80">Найкращий шанс</div>
            <div className="mt-1 text-sm font-black text-amber-100">
              {activePrize ? <PrizeLabel label={activePrize.label} /> : 'Спробуй удачу'}
            </div>
          </div>

          <button
            type="button"
            onClick={spin}
            disabled={spinning || (cooldownLeft > 0 && extraSpins <= 0)}
            className="mt-3 w-full max-w-xs rounded-2xl bg-gradient-to-r from-amber-300 via-orange-400 to-yellow-300 py-3 text-sm font-black text-slate-950 shadow-[0_12px_30px_rgba(251,191,36,0.38)] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="fortune-wheel-spin-button"
          >
            {spinning ? 'Колесо обертається...' : cooldownLeft > 0 && extraSpins <= 0 ? 'Спробуйте завтра' : extraSpins > 0 ? 'Крутити +1 оберт' : 'Крутити колесо'}
          </button>
          <div
            className={`mt-4 min-h-8 text-center text-sm font-bold transition-all duration-300 ${result ? 'scale-[1.02] text-amber-100' : 'text-amber-200'}`}
            data-testid="fortune-wheel-result"
          >
            {error ? (
              <span className="text-rose-300">{error}</span>
            ) : result ? (
              <span
                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-amber-300/40 bg-gradient-to-r from-amber-400/15 via-orange-400/10 to-yellow-300/10 px-3 py-1.5 shadow-[0_0_18px_rgba(251,191,36,0.18)]"
                style={{ boxShadow: activePrize ? `0 0 24px ${activePrize.glow}` : undefined }}
              >
                <span className={result === 'Без виграшу' ? 'text-slate-300' : 'text-amber-100'}>
                  {result === 'Без виграшу' ? 'Цього разу без виграшу:' : 'Ваша нагорода:'}
                </span>
                <PrizeLabel label={result} />
              </span>
            ) : (
              'Спробуйте свою удачу'
            )}
          </div>
        </div>
      </FullPage>
    </>
  );
}
