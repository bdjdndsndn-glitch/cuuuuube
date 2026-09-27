/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface LeaderEntry {
  rank: number;
  user_id: number;
  name: string;
  username?: string | null;
  photo_url?: string | null;
  time_ms: number;
}

export interface MyRank {
  rank: number;
  time_ms: number;
}

export type Period = 'all' | 'week';

export interface LeaderboardData {
  size: number;
  period: Period;
  total: number;
  top: LeaderEntry[];
  me: MyRank | null;
  friend_ids: number[];
}

export interface DailyData {
  date: string;
  size: number;
  moves: string;
  total: number;
  top: LeaderEntry[];
  me: MyRank | null;
  seconds_until_next: number;
  reminder_enabled: boolean;
  friend_ids: number[];
}

export interface TournamentEntry {
  rank: number;
  user_id: number;
  name: string;
  username?: string | null;
  photo_url?: string | null;
  points: number;
  days: number;
  best_rank: number;
}

export interface TournamentData {
  week_start: string;
  week_end: string;
  seconds_until_end: number;
  total: number;
  top: TournamentEntry[];
  me: { rank: number; points: number; days: number } | null;
  last_week: { week_start: string; week_end: string; podium: TournamentEntry[] } | null;
  friend_ids: number[];
}

export interface Achievement {
  id: string;
  title: string;
  desc: string;
  unlocked_at: string | null;
}

export interface AchievementsData {
  items: Achievement[];
  newly_unlocked: string[];
}

export interface ScoreResult {
  best_ms: number;
  rank: number;
  is_new_best: boolean;
}

export interface Mission {
  id: string;
  type: 'subscribe' | 'wallet' | string;
  title: string;
  desc: string;
  reward: number;
  link?: string | null;
  completed: boolean;
}

export interface MissionsData {
  coins: number;
  ton_balance_nano: number;
  items: Mission[];
}

export interface AdStatus {
  coins: number;
  can_watch: boolean;
  seconds_left: number;
  reward: number;
}

export interface WalletWithdrawal {
  request_id: string;
  coins: number;
  amount_nano: number;
  amount_ton: string;
  wallet_address: string;
  status: 'pending' | string;
  requested_at: string;
}

export interface WalletExchangeResult {
  exchanged_coins: number;
  credited_nano: number;
  ton_balance_nano: number;
  coins: number;
}

export interface WalletWithdrawalsData {
  withdrawals: WalletWithdrawal[];
}

export interface FortuneWheelResult {
  prize: string;
  coins_awarded: number;
  ton_awarded: string | null;
  coins: number;
  extra_spins: number;
  seconds_until_next: number;
}

export interface FortuneWheelStatus {
  coins: number;
  extra_spins: number;
  fortune_wheel_last_spin_at: string | null;
  seconds_until_next: number;
}

export interface DuelPlayer {
  user_id: number;
  name: string;
  username?: string | null;
  photo_url?: string | null;
  time_ms: number | null;
}

export type DuelStatus = 'waiting' | 'pending' | 'finished';

export interface Duel {
  code: string;
  size: number;
  moves: string;
  status: DuelStatus;
  creator: DuelPlayer;
  opponent: DuelPlayer | null;
  winner_id: number | null;
  my_role: 'creator' | 'opponent' | null;
  can_play: boolean;
  created_at: string;
  reward_coins: number;
  my_streak: number;
}

export interface DuelStats {
  streak: number;
  best_streak: number;
  wins: number;
  losses: number;
  draws: number;
  coins: number;
  win_reward: number;
  draw_reward: number;
}

export const BOT_USERNAME = 'the_cube_game_bot';

const RAW_API_BASE = (
  import.meta.env.REACT_APP_BACKEND_URL ??
  import.meta.env.VITE_BACKEND_URL ??
  import.meta.env.API_BASE_URL ??
  ''
).trim().replace(/\/+$/, '');

export const API_BASE = RAW_API_BASE;
const API = `${API_BASE}/api`;

function stringifyApiMessage(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['message', 'msg', 'detail', 'error']) {
      if (typeof record[key] === 'string' && record[key].trim()) return record[key] as string;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text().catch(() => '');
  let body: unknown = null;

  if (contentType.includes('application/json') || contentType.includes('+json')) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  console.error('[API error]', {
    status: response.status,
    url: response.url,
    body: body ?? text,
  });

  if (response.status === 422) {
    return 'Не вдалося виконати запит. Перевірте дані та спробуйте ще раз.';
  }

  if (body && typeof body === 'object') {
    const parsedBody = body as Record<string, unknown>;
    return stringifyApiMessage(parsedBody.detail ?? parsedBody.message, fallback);
  }

  if (!text || text.trim().startsWith('<!doctype html') || text.trim().startsWith('<html')) {
    return 'Backend returned HTML instead of JSON. Check backend URL, routing, and CORS.';
  }
  return text.slice(0, 200) || fallback;
}

export function getInitData(): string {
  return window.Telegram?.WebApp?.initData || '';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) {
    throw new Error('Backend URL is not configured. Set REACT_APP_BACKEND_URL or VITE_BACKEND_URL.');
  }

  const url = `${API}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': getInitData(),
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const message = await readApiError(res, `HTTP ${res.status}`);
    throw new Error(message);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType && !contentType.includes('application/json') && !contentType.includes('+json')) {
    const text = await res.text();
    if (!text || text.trim().startsWith('<!doctype html') || text.trim().startsWith('<html')) {
      throw new Error('Backend returned HTML instead of JSON. Check backend URL, routing, and CORS.');
    }
    throw new Error(`Unexpected response type from backend: ${contentType || 'unknown'}`);
  }

  const text = await res.text();
  if (!text) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Backend returned invalid JSON. Check the backend endpoint and response format.');
  }
}

export const api = {
  leaderboard: (size: number, period: Period) => request<LeaderboardData>(`/leaderboard?size=${size}&period=${period}`),
  setReminder: (enabled: boolean) =>
    request<DailyData>('/daily/reminder', { method: 'POST', body: JSON.stringify({ enabled }) }),
  tournament: () => request<TournamentData>('/tournament'),
  achievements: () => request<AchievementsData>('/achievements'),
  submitScore: (size: number, time_ms: number) =>
    request<ScoreResult>('/scores', { method: 'POST', body: JSON.stringify({ size, time_ms }) }),
  daily: () => request<DailyData>('/daily'),
  submitDaily: (date: string, time_ms: number) =>
    request<DailyData>('/daily/score', { method: 'POST', body: JSON.stringify({ date, time_ms }) }),
  missions: () => request<MissionsData>('/missions'),
  adsgramStatus: () => request<AdStatus>('/adsgram/status'),
  fortuneWheelStatus: () => request<FortuneWheelStatus>('/fortune-wheel/status'),
  fortuneWheelSpin: () => request<FortuneWheelResult>('/fortune-wheel/spin', { method: 'POST' }),
  createWalletExchange: (coins: number, wallet_address: string) =>
    request<WalletExchangeResult>('/wallet/exchange', {
      method: 'POST',
      body: JSON.stringify({ coins, wallet_address }),
    }),
  walletWithdrawals: () => request<WalletWithdrawalsData>('/wallet/withdrawals'),
  createWalletWithdrawal: (amount_nano: number, wallet_address: string) =>
    request<WalletWithdrawal>('/wallet/withdrawals', {
      method: 'POST',
      body: JSON.stringify({ amount_nano, wallet_address }),
    }),
  claimMission: (id: string, wallet_address?: string) =>
    request<MissionsData>(`/missions/${id}/claim`, {
      method: 'POST',
      body: JSON.stringify({ wallet_address: wallet_address ?? null }),
    }),
  sendTestDigest: () => request<{ sent: boolean }>('/digest/test', { method: 'POST' }),
  rewardSpin: () => request<{ ok: boolean; extra_spins: number; coins: number; coins_awarded: number; reward_type: string }>(
    '/reward/spin',
    { method: 'POST', body: JSON.stringify({ reward_type: 'extra_spin' }) },
  ),
  duels: () => request<Duel[]>('/duels'),
  duelStats: () => request<DuelStats>('/duels/me'),
  duel: (code: string) => request<Duel>(`/duels/${encodeURIComponent(code)}`),
  createDuel: (size: number) => request<Duel>('/duels', { method: 'POST', body: JSON.stringify({ size }) }),
  joinDuel: (code: string) => request<Duel>(`/duels/${encodeURIComponent(code)}/join`, { method: 'POST' }),
  cancelDuel: (code: string) =>
    request<{ ok: boolean; code: string }>(`/duels/${encodeURIComponent(code)}/cancel`, { method: 'POST' }),
  submitDuelScore: (code: string, time_ms: number) =>
    request<Duel>(`/duels/${encodeURIComponent(code)}/score`, { method: 'POST', body: JSON.stringify({ time_ms }) }),
};

export function duelLink(code: string): string {
  return `https://t.me/${BOT_USERNAME}?startapp=duel_${code}`;
}

/** Параметр запуску Mini App: initDataUnsafe.start_param, tgWebAppStartParam або ?startapp= (браузер) */
export function getStartParam(): string | null {
  const tg = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
  if (tg) return tg;
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return search.get('tgWebAppStartParam') || hash.get('tgWebAppStartParam') || search.get('startapp');
}

export function resolvePhoto(url?: string | null): string | null {
  if (!url) return null;
  return url.startsWith('/') ? `${API_BASE}${url}` : url;
}

export function inviteLink(userId?: number): string {
  const base = import.meta.env.VITE_TELEGRAM_APP_URL || window.location.origin;
  return userId ? `${base}?startapp=ref_${userId}` : base;
}

export function formatTime(ms: number): string {
  const s = Math.floor((ms / 1000) % 60);
  const m = Math.floor(ms / 60000);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
