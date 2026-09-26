/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { useTonConnectUI, useTonWallet, useTonAddress } from '@tonconnect/ui-react';
import { triggerLayerTurnVibration } from '../utils/haptics';
import { useTelegramBackButton } from '../utils/backButton';

interface TonWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TESTNET_CHAIN = '-3';

function shortAddress(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-6)}` : addr;
}

function formatTon(nano: number): string {
  const ton = nano / 1e9;
  return ton.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: ton < 1 ? 4 : 2 });
}

/**
 * Модальне вікно деталей підключеного гаманця: скорочена адреса та баланс TON
 */
export function TonWalletModal({ isOpen, onClose }: TonWalletModalProps) {
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const address = useTonAddress();
  const rawAddress = useTonAddress(false);
  const [copied, setCopied] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceError, setBalanceError] = useState(false);

  const isTestnet = wallet?.account?.chain === TESTNET_CHAIN;
  useTelegramBackButton(isOpen && Boolean(wallet), onClose);

  useEffect(() => {
    if (!isOpen || !rawAddress) return;
    let cancelled = false;
    setBalance(null);
    setBalanceError(false);
    const host = isTestnet ? 'https://testnet.tonapi.io' : 'https://tonapi.io';
    fetch(`${host}/v2/accounts/${rawAddress}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { balance?: number }) => {
        if (!cancelled) setBalance(Number(data.balance ?? 0));
      })
      .catch(() => {
        if (!cancelled) setBalanceError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, rawAddress, isTestnet]);

  if (!isOpen || !wallet) return null;

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard?.writeText(address);
    setCopied(true);
    triggerLayerTurnVibration(30, true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDisconnect = async () => {
    triggerLayerTurnVibration(30, true);
    await tonConnectUI.disconnect();
    onClose();
  };

  const walletName = (wallet as { name?: string }).name || wallet.device?.appName || 'Tonkeeper';
  const explorer = isTestnet ? 'https://testnet.tonscan.org' : 'https://tonscan.org';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 pointer-events-auto"
      onClick={onClose}
      data-testid="wallet-modal-overlay"
    >
      <div
        className="relative w-full max-w-sm rounded-2xl bg-slate-900/95 border border-sky-500/30 p-5 shadow-2xl text-white select-none sheet-enter"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: '0 12px 36px rgba(0, 0, 0, 0.6), 0 0 20px rgba(0, 152, 234, 0.2)' }}
        data-testid="wallet-modal"
      >
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-sky-400" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L3 8.5V15.5L12 22L21 15.5V8.5L12 2ZM12 4.3L18.5 9L12 13.7L5.5 9L12 4.3ZM5 10.8L11 15.1V20L5 15.6V10.8ZM13 20V15.1L19 10.8V15.6L13 20Z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                {walletName}
                <span className="text-[10px] bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded font-mono">
                  {isTestnet ? 'TON Testnet' : 'TON Mainnet'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">Гаманець підключено</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            data-testid="wallet-modal-close"
          >
            ✕
          </button>
        </div>

        {/* Баланс */}
        <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-sky-600/25 to-blue-900/30 border border-sky-500/20 text-center">
          <span className="text-[11px] text-sky-200/80 font-medium">Баланс</span>
          <div className="mt-1 text-2xl font-black tracking-tight" data-testid="wallet-balance">
            {balance !== null ? (
              <>
                {formatTon(balance)} <span className="text-base text-sky-300 font-bold">TON</span>
              </>
            ) : balanceError ? (
              <span className="text-sm text-slate-400 font-medium">Не вдалося завантажити</span>
            ) : (
              <span className="text-sm text-slate-400 font-medium animate-pulse">Завантаження…</span>
            )}
          </div>
        </div>

        {/* Адреса */}
        <div className="mt-3 p-3 rounded-xl bg-slate-950/70 border border-white/5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-slate-400 font-medium">Адреса гаманця</span>
            <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Активний
            </span>
          </div>
          <button
            onClick={() => setShowFull((v) => !v)}
            className="w-full text-left font-mono text-xs text-sky-200 break-all bg-black/40 p-2 rounded-lg border border-white/5 hover:border-sky-500/30 transition-colors"
            title={showFull ? 'Сховати повну адресу' : 'Показати повну адресу'}
            data-testid="wallet-address"
          >
            {showFull ? address : shortAddress(address)}
          </button>

          <div className="mt-2.5 flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 py-1.5 px-3 rounded-lg bg-sky-600/30 hover:bg-sky-600/45 border border-sky-500/30 text-sky-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95"
              data-testid="wallet-copy-button"
            >
              {copied ? '✓ Скопійовано!' : 'Скопіювати адресу'}
            </button>

            <a
              href={`${explorer}/address/${address}`}
              target="_blank"
              rel="noreferrer"
              className="py-1.5 px-3 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium transition-colors"
            >
              TonScan ↗
            </a>
          </div>
        </div>

        <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-400 leading-tight">Прив'язано до рекорду та досягнень у THE CUBE</p>

          <button
            onClick={handleDisconnect}
            className="py-1.5 px-3 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-semibold whitespace-nowrap transition-colors active:scale-95"
            data-testid="wallet-disconnect-button"
          >
            Від'єднати
          </button>
        </div>
      </div>
    </div>
  );
}
