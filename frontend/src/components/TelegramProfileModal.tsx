/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { useTonConnectUI, useTonWallet, useTonAddress } from '@tonconnect/ui-react';
import { TelegramUser } from '../types';
import { api, inviteLink, formatTime } from '../utils/api';
import { shareToTelegram } from '../utils/telegramAuth';
import { triggerLayerTurnVibration } from '../utils/haptics';
import { getGame } from '../utils/gameBridge';
import { getUITheme, setUITheme, syncCubeAccent, UITheme } from '../utils/uiTheme';
import { FullPage } from './FullPage';
import { AchievementsGrid } from './AchievementsGrid';

interface TelegramProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: TelegramUser | null;
  isRealTelegram: boolean;
}

interface CountryInfo {
  name: string;
  code: string;
  flag: string;
  expiresAt: number;
}

const SIZES = [2, 3, 4, 5];
const TESTNET_CHAIN = '-3';
const COIN_TO_TON = 0.0001;
const MIN_WITHDRAWAL_NANO = 10_000_000_000;
const COUNTRY_CACHE_KEY = 'thecube-profile-country';
const COUNTRY_CACHE_TTL = 24 * 60 * 60 * 1000;

const coinIcon = (
  <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-yellow-100 via-amber-400 to-orange-600 shadow-[inset_-1px_-2px_2px_rgba(120,53,15,0.45),inset_1px_1px_2px_rgba(255,255,255,0.8),0_2px_4px_rgba(120,53,15,0.35)] [transform:rotateX(12deg)]" aria-hidden="true">
    <span className="absolute inset-[2px] flex items-center justify-center rounded-full border border-yellow-50/80 bg-gradient-to-br from-amber-300 to-yellow-500 text-[8px] font-black leading-none text-orange-800">C</span>
    <span className="absolute -bottom-0.5 left-0.5 right-0.5 h-1 rounded-full bg-orange-700/45 blur-[1px]" />
  </span>
);

function coinsToTon(coins: number): string {
  return (coins * COIN_TO_TON).toFixed(4);
}

function shortAddress(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

function formatTon(nano: number): string {
  const ton = nano / 1e9;
  return ton.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: ton < 1 ? 4 : 2 });
}

/** Персональний кабінет гравця: профіль, статистика, гаманець, тема, досягнення */
export function TelegramProfileModal({ isOpen, onClose, user, isRealTelegram }: TelegramProfileModalProps) {
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const address = useTonAddress();
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState<UITheme>(getUITheme());
  const [accent, setAccent] = useState('#38bdf8');
  const [coins, setCoins] = useState(0);
  const [tonBalanceNano, setTonBalanceNano] = useState(0);
  const [exchangeCoins, setExchangeCoins] = useState(0);
  const [country, setCountry] = useState<CountryInfo | null>(null);
  const [exchangeBusy, setExchangeBusy] = useState(false);
  const [exchangeMessage, setExchangeMessage] = useState<string | null>(null);
  const [withdrawConfirm, setWithdrawConfirm] = useState(false);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawMessage, setWithdrawMessage] = useState<string | null>(null);
  const [withdrawalPending, setWithdrawalPending] = useState(false);

  const isTestnet = wallet?.account?.chain === TESTNET_CHAIN;

  useEffect(() => {
    if (isOpen) {
      const c = syncCubeAccent();
      if (c) setAccent(c);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !user) return;
    let cancelled = false;
    try {
      const cached = sessionStorage.getItem(COUNTRY_CACHE_KEY);
      if (cached) {
        const value = JSON.parse(cached) as CountryInfo;
        if (value.expiresAt > Date.now() && value.name && value.code && value.flag) {
          setCountry(value);
          return () => {
            cancelled = true;
          };
        }
      }
    } catch {
      try {
        sessionStorage.removeItem(COUNTRY_CACHE_KEY);
      } catch {
        // Storage may be disabled by the browser.
      }
    }

    setCountry(null);
    const controller = new AbortController();
    fetch('https://ipwho.is/', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('GeoIP unavailable'))))
      .then((result: { success?: boolean; country?: string; country_code?: string; flag?: { emoji?: string } }) => {
        const code = result.country_code?.toUpperCase();
        if (cancelled || result.success === false || !result.country || !code || !/^[A-Z]{2}$/.test(code)) return;
        const flag = result.flag?.emoji || String.fromCodePoint(...Array.from(code, (letter) => 127397 + letter.charCodeAt(0)));
        const value: CountryInfo = { name: result.country, code, flag, expiresAt: Date.now() + COUNTRY_CACHE_TTL };
        setCountry(value);
        try {
          sessionStorage.setItem(COUNTRY_CACHE_KEY, JSON.stringify(value));
        } catch {
          // Country display remains available even when browser storage is blocked.
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isOpen, user?.id]);

  useEffect(() => {
    if (!isOpen || !isRealTelegram) return;
    let cancelled = false;
    api
      .missions()
      .then((d) => {
        if (cancelled) return;
        setCoins(d.coins);
        setExchangeCoins(d.coins);
        setTonBalanceNano(d.ton_balance_nano ?? 0);
      })
      .catch(() => {});
    api.walletWithdrawals()
      .then(({ withdrawals }) => {
        if (cancelled) return;
        const pending = withdrawals.some((request) => request.status === 'pending');
        setWithdrawalPending(pending);
        if (pending) setWithdrawMessage('Заявка очікує ручної обробки.');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, isRealTelegram]);

  useEffect(() => {
    if (!isOpen || !isRealTelegram || !wallet || !address) return;
    void api.syncWalletAddress(address)
      .then(() => setWithdrawMessage(null))
      .catch((error: Error) => setWithdrawMessage(error.message || 'Не вдалося оновити підключений гаманець'));
  }, [address, isOpen, isRealTelegram, wallet]);

  const game = getGame();
  const scores = game?.scores?.data || {};
  const solvedSizes = SIZES.filter((s) => scores[s]?.best);
  const best3 = scores[3]?.best || 0;
  const overallBest = solvedSizes.length
    ? solvedSizes.reduce((min, s) => Math.min(min, scores[s].best), Infinity)
    : 0;

  const initials = user?.first_name ? user.first_name.slice(0, 2).toUpperCase() : 'TG';

  const toggleTheme = () => {
    triggerLayerTurnVibration(20, true);
    const next: UITheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setUITheme(next);
  };

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard?.writeText(address);
    setCopied(true);
    triggerLayerTurnVibration(25, true);
    setTimeout(() => setCopied(false), 2000);
  };

  const submitExchange = async () => {
    if (!address || !wallet || exchangeCoins < 1 || exchangeCoins > coins || exchangeBusy) return;
    setExchangeBusy(true);
    setExchangeMessage(null);
    try {
      const exchange = await api.createWalletExchange(exchangeCoins, address);
      setCoins(exchange.coins);
      setExchangeCoins(0);
      setTonBalanceNano(exchange.ton_balance_nano);
      setExchangeMessage(`${exchange.exchanged_coins.toLocaleString('uk-UA')} монет обміняно на ${formatTon(exchange.credited_nano)} TON.`);
      triggerLayerTurnVibration(25, true);
    } catch (error) {
      setExchangeMessage(error instanceof Error ? error.message : 'Не вдалося обміняти монети');
    } finally {
      setExchangeBusy(false);
    }
  };

  const submitWithdrawal = async () => {
    if (!address || !wallet || tonBalanceNano < MIN_WITHDRAWAL_NANO || withdrawalPending || withdrawBusy) return;
    const amountNano = tonBalanceNano;
    setWithdrawBusy(true);
    setWithdrawMessage(null);
    try {
      const withdrawal = await api.createWalletWithdrawal(amountNano, address);
      setTonBalanceNano((current) => Math.max(0, current - withdrawal.amount_nano));
      setWithdrawConfirm(false);
      setWithdrawalPending(true);
      setWithdrawMessage(`Заявку на ${withdrawal.amount_ton} TON створено. Очікує ручної виплати.`);
      triggerLayerTurnVibration(25, true);
    } catch (error) {
      setWithdrawMessage(error instanceof Error ? error.message : 'Не вдалося створити заявку');
    } finally {
      setWithdrawBusy(false);
    }
  };


  const profileIcon = (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
      <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.42 0-8 2.69-8 6v2h16v-2c0-3.31-3.58-6-8-6z" />
    </svg>
  );

  return (
    <FullPage
      isOpen={isOpen}
      onClose={onClose}
      title="Мій кабінет"
      subtitle="Профіль гравця THE CUBE"
      icon={profileIcon}
      glow="rgba(56,189,248,0.16)"
      testId="profile-modal"
    >
      {user ? (
        <div className="space-y-0.5 pb-16 animate-in fade-in slide-in-from-bottom-2 duration-300" data-testid="profile-user-info">
          {/* Профіль гравця — компактна картка */}
          <div
            className="relative flex items-center gap-2 p-1.5 rounded-2xl border border-white/10 overflow-hidden shadow-lg transition-all duration-300 hover:border-white/20"
            style={{ background: `linear-gradient(120deg, ${accent}22, rgba(2,6,23,0.55) 62%)` }}
          >
            <div
              className="absolute inset-0 opacity-20 pointer-events-none"
              style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1.5px)', backgroundSize: '13px 13px' }}
            />
            <div className="relative shrink-0">
              {user.photo_url ? (
                <img src={user.photo_url} alt={user.first_name} className="w-12 h-12 rounded-xl object-cover shadow-lg transition-transform duration-300 hover:scale-105" style={{ boxShadow: `0 0 0 2px ${accent}66` }} />
              ) : (
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black text-white shadow-lg transition-transform duration-300 hover:scale-105" style={{ background: `linear-gradient(135deg, ${accent}, #2563eb)`, boxShadow: `0 0 0 2px ${accent}66` }}>
                  {initials}
                </div>
              )}
              {user.is_premium && (
                <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 flex items-center justify-center text-[9px] shadow ring-2 ring-slate-950" title="Telegram Premium">★</span>
              )}
            </div>
            <div className="relative min-w-0 flex-1">
              <h4 className="flex min-w-0 items-center gap-1.5 text-base font-extrabold tracking-tight leading-tight" data-testid="profile-user-name">
                <span className="truncate">{user.first_name} {user.last_name || ''}</span>
                {user.username?.toLowerCase() === 'mouurice' && (
                  <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" role="img" aria-label="Власник THE CUBE">
                    <title>Власник THE CUBE</title>
                    <circle cx="10" cy="10" r="9" fill="#38bdf8" />
                    <path d="m5.5 10.2 3 3 6-6.2" fill="none" stroke="#082f49" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </h4>
              {user.username ? (
                <div className="flex min-w-0 items-center gap-1">
                  <p className={`min-w-0 truncate text-[11px] text-sky-300 font-mono ${country ? 'max-w-[calc(100%-1.25rem)]' : 'max-w-full'}`}>@{user.username}</p>
                  {country && <span className="shrink-0 text-[13px] leading-none" title={`Країна за IP: ${country.name}`} aria-label={`Країна за IP: ${country.name}`}>{country.flag}</span>}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 truncate">Гравець THE CUBE</p>
              )}
              {overallBest > 0 && (
                <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/30 border border-white/10">
                  <svg viewBox="0 0 24 24" className="w-3 h-3 fill-amber-300"><path d="M12 2l2.9 6.2 6.6.6-5 4.4 1.5 6.5L12 17l-6 3.2 1.5-6.5-5-4.4 6.6-.6z" /></svg>
                  <span className="text-[10px] font-black font-mono text-white">{formatTime(overallBest)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Зведена статистика гравця */}
          <div className="grid grid-cols-3 gap-0.5" data-testid="profile-stats">
            <div className="py-1 px-1 rounded-xl bg-slate-950/60 border border-white/5 text-center transition-colors duration-300 hover:border-white/15" style={{ boxShadow: `inset 0 0 0 1px ${accent}22` }}>
              <div className="text-[8px] uppercase tracking-wider text-slate-400 font-bold">Рекорд 3×3</div>
              <div className="mt-0.5 text-sm font-black font-mono tabular-nums" style={{ color: accent }}>{best3 ? formatTime(best3) : '—'}</div>
            </div>
            <div className="py-1 px-1 rounded-xl bg-slate-950/60 border border-white/5 text-center transition-colors duration-300 hover:border-white/15">
              <div className="text-[8px] uppercase tracking-wider text-slate-400 font-bold">Зібрано</div>
              <div className="mt-0.5 text-sm font-black text-emerald-300">{solvedSizes.length}<span className="text-slate-500 text-[11px]">/4</span></div>
            </div>
            <div className="py-1 px-1 rounded-xl bg-slate-950/60 border border-white/5 text-center transition-colors duration-300 hover:border-white/15">
              <div className="text-[8px] uppercase tracking-wider text-slate-400 font-bold">Гаманець</div>
              <div className="mt-0.5 text-sm font-black" style={{ color: wallet ? '#34d399' : '#64748b' }}>{wallet ? '✓' : '—'}</div>
            </div>
          </div>

          {/* Швидкий перемикач теми поруч із базовою інформацією профілю */}
          <button
            onClick={toggleTheme}
            role="switch"
            aria-checked={theme === 'dark'}
            aria-label="Тема інтерфейсу"
            className={`w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-2xl border transition-all duration-300 ${theme === 'dark' ? 'bg-slate-950/70 border-sky-400/25 hover:border-sky-300/45' : 'bg-slate-900/80 border-amber-300/25 hover:border-amber-200/45'}`}
            data-testid="theme-toggle"
          >
            <div className="flex items-center gap-2.5 min-w-0 text-left">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border border-white/10 shadow-inner" style={{ background: `${accent}20`, color: accent }}>
                {theme === 'dark' ? (
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.39 5.39 0 0 1-7.54-7.54c-.44-.06-.9-.1-1.36-.1z" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-5v3m0 14v3m10-10h-3M5 12H2m15.07-7.07l-2.12 2.12M6.05 17.95l-2.12 2.12m14.14 0l-2.12-2.12M6.05 6.05L3.93 3.93" /></svg>
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold">Оформлення</span>
                <span className="block text-[11px] font-semibold text-white truncate">{theme === 'dark' ? 'Темна тема' : 'Світла тема'}</span>
              </span>
            </div>
            <span className={`relative w-12 h-6 rounded-full border border-white/10 transition-colors shrink-0 ${theme === 'dark' ? 'bg-sky-500/70' : 'bg-slate-600'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300 ${theme === 'dark' ? 'left-[26px]' : 'left-0.5'}`} />
            </span>
          </button>

          {/* Найкращі часи за розмірами кубика */}
          <div className="relative top-3" data-testid="profile-best-times">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Найкращі часи</h4>
              <span className="text-[10px] text-sky-300 font-semibold">{solvedSizes.length} / 4</span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {SIZES.map((s) => {
                const best = scores[s]?.best;
                return (
                  <div
                    key={s}
                    className={`rounded-lg py-1 text-center border transition-colors ${best ? 'bg-sky-500/10 border-sky-400/30' : 'bg-slate-950/50 border-white/5'}`}
                    data-testid={`profile-size-${s}`}
                  >
                    <div className={`text-[10px] font-black ${best ? 'text-white' : 'text-slate-500'}`}>{s}×{s}</div>
                    <div className={`mt-0.5 text-[10px] font-bold font-mono ${best ? 'text-sky-200' : 'text-slate-600'}`}>{best ? formatTime(best) : '—'}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ігрові монети + обмін на TON */}
          {isRealTelegram && (
            <div className="relative top-4 overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400/12 via-slate-950/70 to-orange-500/10 border border-amber-300/35 px-2 py-1 shadow-[0_0_18px_rgba(251,191,36,0.12)] transition-all duration-300 hover:-translate-y-0.5 hover:border-amber-200/60 hover:shadow-[0_0_24px_rgba(251,191,36,0.2)]" data-testid="cabinet-coins">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-60" />
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="relative w-5 h-5 rounded-lg bg-amber-300/20 border border-amber-200/40 flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(251,191,36,0.25)] animate-pulse [&>svg]:w-3 [&>svg]:h-3">{coinIcon}</span>
                  <div className="min-w-0">
                    <div className="text-[9px] uppercase tracking-[0.12em] text-amber-100/75 font-extrabold leading-none">Баланс монет</div>
                    <div className="mt-0.5 text-base font-black text-amber-200 leading-none tabular-nums tracking-wide truncate drop-shadow-[0_0_8px_rgba(251,191,36,0.35)]" data-testid="cabinet-coins-balance">{coins}</div>
                  </div>
                </div>
                <div className="shrink-0 rounded-lg bg-sky-300/10 border border-sky-200/25 px-2 py-1 text-right shadow-[0_0_10px_rgba(56,189,248,0.1)]">
                  <div className="text-[8px] uppercase tracking-[0.12em] text-sky-100/75 font-extrabold leading-none">Баланс TON</div>
                  <div className="mt-0.5 text-xs font-black text-sky-200 font-mono tabular-nums" data-testid="cabinet-coins-ton">{formatTon(tonBalanceNano)}</div>
                </div>
              </div>

              <div className="mt-0.5 pt-0.5 border-t border-white/8" data-testid="coin-exchange">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-100">Обмін на TON</span>
                  <span className="text-[9px] text-slate-400 whitespace-nowrap shrink-0">1 монета = {COIN_TO_TON} TON</span>
                </div>
                <div className="flex items-stretch gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={coins}
                    inputMode="numeric"
                    value={exchangeCoins}
                    onChange={(e) => setExchangeCoins(Math.max(0, Math.min(coins, Math.floor(Number(e.target.value) || 0))))}
                    data-testid="exchange-input"
                    className="min-w-0 flex-1 w-full bg-black/30 border border-white/10 rounded-lg px-2.5 py-0.5 text-sm font-mono font-bold text-amber-200 outline-none focus:border-amber-400/50 transition-colors"
                  />
                  <button
                    onClick={() => setExchangeCoins(coins)}
                    data-testid="exchange-max"
                    className="shrink-0 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-black text-slate-200 transition-colors active:scale-95"
                  >
                    MAX
                  </button>
                  <div className="shrink-0 flex items-center gap-1 rounded-lg bg-sky-500/20 border border-sky-300/40 px-2.5 shadow-[0_0_10px_rgba(56,189,248,0.12)]">
                    <span className="text-sm font-black text-sky-200 font-mono tabular-nums" data-testid="exchange-result">{coinsToTon(exchangeCoins)}</span>
                    <span className="text-[9px] text-sky-200 font-extrabold">TON</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(coins, 1)}
                  value={exchangeCoins}
                  onChange={(e) => setExchangeCoins(Number(e.target.value))}
                  onPointerDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchMove={(e) => e.stopPropagation()}
                  disabled={coins === 0}
                  aria-label="Кількість монет для обміну"
                  data-testid="exchange-slider"
                  className="w-full accent-amber-400 disabled:opacity-40"
                  style={{ touchAction: 'none', WebkitTapHighlightColor: 'transparent' }}
                />
                <button
                  type="button"
                  onClick={() => void submitExchange()}
                  disabled={!wallet || exchangeCoins < 1 || exchangeBusy}
                  data-testid="exchange-submit"
                  className="mt-1 w-full rounded-lg border border-amber-300/30 bg-amber-400/15 py-1 text-[10px] font-bold text-amber-100 transition-colors hover:bg-amber-400/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {exchangeBusy ? 'Обмінюємо…' : 'Обміняти'}
                </button>
                {!wallet && <p className="mt-0.5 text-center text-[9px] text-slate-400">Підключіть збережений гаманець</p>}
                {exchangeMessage && <p className="mt-1 text-center text-[9px] leading-relaxed text-amber-100" role="status">{exchangeMessage}</p>}
              </div>
            </div>
          )}

          {/* Гаманець TON — для майбутніх оплат і покупок */}
          <div className="relative top-6 rounded-2xl bg-gradient-to-br from-sky-600/15 to-blue-900/20 border border-sky-500/20 p-1 transition-all duration-300 hover:border-sky-400/35" data-testid="cabinet-wallet">
            <div className="flex items-center justify-between mb-0.5 gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-sky-400 shrink-0"><path d="M12 2L3 8.5V15.5L12 22L21 15.5V8.5L12 2ZM12 4.3L18.5 9L12 13.7L5.5 9L12 4.3Z" /></svg>
                <span className="text-[11px] font-bold truncate">Гаманець TON</span>
                {wallet && <span className="text-[8px] bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded font-mono shrink-0">{isTestnet ? 'Testnet' : 'Mainnet'}</span>}
              </div>
              {wallet && <span className="text-[9px] text-emerald-400 flex items-center gap-1 shrink-0"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Підключено</span>}
            </div>
            {wallet ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <button onClick={handleCopy} className="font-mono text-[11px] text-sky-200 bg-black/30 px-2 py-1 rounded-lg border border-white/5 hover:border-sky-500/30 transition-colors" data-testid="wallet-address">
                    {copied ? '✓ Скопійовано' : shortAddress(address)}
                  </button>
                  <span className="text-right" data-testid="wallet-balance">
                    <span className="block text-[8px] uppercase tracking-wide text-slate-400">До виведення</span>
                    <span className="text-sm font-black text-sky-200">{formatTon(tonBalanceNano)} <span className="text-[11px] text-sky-300">TON</span></span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setWithdrawMessage(null);
                    setWithdrawConfirm(true);
                  }}
                  disabled={tonBalanceNano < MIN_WITHDRAWAL_NANO || withdrawalPending || withdrawBusy}
                  title={tonBalanceNano < MIN_WITHDRAWAL_NANO ? 'Мінімальний баланс для виведення — 10 TON' : undefined}
                  data-testid="wallet-withdraw-button"
                  className="mt-1 w-full py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-200 border border-sky-400/30 text-[10px] font-semibold transition-colors active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {withdrawBusy ? 'Створюємо заявку…' : 'Вивести TON'}
                </button>
                {tonBalanceNano < MIN_WITHDRAWAL_NANO && (
                  <p className="mt-0.5 text-center text-[9px] text-slate-400">Для виведення потрібно щонайменше 10 TON</p>
                )}
                {withdrawalPending && <p className="mt-0.5 text-center text-[9px] text-amber-200">Попередня заявка ще обробляється</p>}
                {withdrawConfirm && (
                  <div className="mt-1 rounded-lg border border-sky-300/20 bg-slate-950/60 p-2" data-testid="withdraw-confirm">
                    <p className="text-[10px] leading-relaxed text-slate-300">
                      Подати заявку на весь баланс {formatTon(tonBalanceNano)} TON на {shortAddress(address)}? TON резервується до ручної обробки.
                    </p>
                    <div className="mt-1.5 flex gap-1.5">
                      <button
                        type="button"
                        onClick={submitWithdrawal}
                        disabled={withdrawBusy}
                        className="flex-1 rounded-md bg-sky-500/20 px-2 py-1 text-[10px] font-bold text-sky-100 border border-sky-300/25 disabled:opacity-50"
                      >
                        Підтвердити
                      </button>
                      <button
                        type="button"
                        onClick={() => setWithdrawConfirm(false)}
                        disabled={withdrawBusy}
                        className="rounded-md bg-white/5 px-2 py-1 text-[10px] font-semibold text-slate-300 border border-white/10 disabled:opacity-50"
                      >
                        Скасувати
                      </button>
                    </div>
                  </div>
                )}
                {withdrawMessage && <p className="mt-1 text-center text-[9px] leading-relaxed text-sky-200" role="status">{withdrawMessage}</p>}
                <button onClick={() => { triggerLayerTurnVibration(25, true); tonConnectUI.disconnect(); }} className="mt-1 w-full py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/25 text-[10px] font-semibold transition-colors active:scale-95" data-testid="wallet-disconnect-button">
                  Від'єднати гаманець
                </button>
              </>
            ) : (
              <>
                <button onClick={() => { triggerLayerTurnVibration(30, true); tonConnectUI.openModal().catch(() => {}); }} className="w-full py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-[11px] font-bold transition-all active:scale-95 shadow-lg shadow-sky-500/25" data-testid="wallet-connect-button">
                  Підключити Tonkeeper
                </button>
                <p className="mt-0.5 text-[9px] text-center font-semibold tracking-wide bg-gradient-to-r from-sky-300 via-cyan-200 to-amber-300 bg-clip-text text-transparent animate-pulse [animation-duration:1.6s] shadow-[0_0_12px_rgba(56,189,248,0.45)]">Скоро: оплата та покупки всередині гри</p>
              </>
            )}
          </div>

          <button
            onClick={() => {
              triggerLayerTurnVibration(25, true);
              shareToTelegram('Збираєш кубик Рубіка? Заходь у THE CUBE — позмагаємось у рейтингу та виклику дня!', inviteLink(user.id));
            }}
            data-testid="invite-friend-button"
              className="relative top-9 w-full flex items-center justify-center gap-2 py-1.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-[11px] shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all duration-300"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M15 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-9 4a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm9 1c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zM6 13c-.29 0-.62.02-.97.05C3.4 13.31 0 14.31 0 16.5V19h6v-2.5c0-1.28.5-2.3 1.28-3.06C6.86 13.15 6.42 13 6 13z" /></svg>
            Запросити друга
          </button>

          {isRealTelegram && (
            <div
              className="mt-10"
            >
              <AchievementsGrid />
            </div>
          )}

          <div
            className="fixed inset-x-0 z-20 px-4 pointer-events-none"
            style={{ bottom: 'max(4px, env(safe-area-inset-bottom, 4px))' }}
          >
            <div className="mx-auto flex max-w-md flex-wrap justify-center gap-x-2 text-[9px] text-slate-500">
              <span>ID: <span className="font-mono text-slate-300">{user.id}</span></span>
              <span>{isRealTelegram ? 'Telegram WebApp' : 'Браузер'}</span>
              {user.language_code && <span className="uppercase">{user.language_code}</span>}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-4" data-testid="profile-no-user">
          <div className="mx-auto w-20 h-20 rounded-3xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 flex items-center justify-center shadow-xl">
            <svg viewBox="0 0 24 24" className="w-9 h-9 fill-slate-500"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.42 0-8 2.69-8 6v2h16v-2c0-3.31-3.58-6-8-6z" /></svg>
          </div>
          <h4 className="mt-3 text-sm font-extrabold text-white">Кабінет у Telegram</h4>
          <p className="mt-1.5 text-xs text-slate-300 leading-relaxed max-w-xs mx-auto">
            Профіль підключається <b className="text-sky-300">автоматично</b> під час запуску гри через Telegram-бота. У звичайному браузері дані користувача недоступні.
          </p>
          <a
            href="https://t.me/the_cube_game_bot"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition-all active:scale-95 shadow-lg shadow-sky-500/25"
            data-testid="open-in-telegram-button"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" /></svg>
            Відкрити в Telegram
          </a>
          <button onClick={toggleTheme} className="mt-3 w-full flex items-center justify-between p-3 rounded-2xl bg-slate-950/60 border border-white/5 hover:bg-slate-900/70 transition-colors" data-testid="theme-toggle">
            <span className="text-xs font-semibold">Тема інтерфейсу: {theme === 'dark' ? 'Темна' : 'Світла'}</span>
            <span className={`relative w-11 h-6 rounded-full transition-colors ${theme === 'dark' ? 'bg-slate-600' : 'bg-amber-400'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${theme === 'dark' ? 'left-[22px]' : 'left-0.5'}`} />
            </span>
          </button>
        </div>
      )}
    </FullPage>
  );
}
