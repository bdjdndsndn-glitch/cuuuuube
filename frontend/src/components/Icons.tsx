/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

interface IconProps {
  className?: string;
}

const MEDAL_COLORS: Record<number, [string, string, string]> = {
  1: ['#FDE68A', '#F59E0B', '#B45309'],
  2: ['#F1F5F9', '#94A3B8', '#475569'],
  3: ['#FDBA74', '#C2410C', '#7C2D12'],
};

/** Преміальна медаль (1–3 місце) зі стрічкою та градієнтом */
export function MedalIcon({ place, className = 'w-8 h-8' }: IconProps & { place: 1 | 2 | 3 }) {
  const [light, mid, dark] = MEDAL_COLORS[place];
  const id = `medal-${place}`;
  return (
    <svg viewBox="0 0 32 32" className={className} aria-label={`${place} місце`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="0.55" stopColor={mid} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
      </defs>
      <path d="M10 2h5l-3.5 9H7z" fill="#0ea5e9" />
      <path d="M22 2h-5l3.5 9H25z" fill="#0369a1" />
      <circle cx="16" cy="19" r="10" fill={`url(#${id})`} stroke={dark} strokeWidth="1" />
      <circle cx="16" cy="19" r="7" fill="none" stroke={light} strokeOpacity="0.7" strokeWidth="1" />
      <text x="16" y="23" textAnchor="middle" fontSize="10" fontWeight="900" fill={dark} fontFamily="Montserrat, system-ui">
        {place}
      </text>
    </svg>
  );
}

export function TrophyIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M5 3h14v2h2v4a4 4 0 0 1-4 4h-.35A5.99 5.99 0 0 1 13 16.9V19h4v2H7v-2h4v-2.1A5.99 5.99 0 0 1 7.35 13H7a4 4 0 0 1-4-4V5h2V3zm0 4v2a2 2 0 0 0 2 2V7H5zm14 0h-2v4a2 2 0 0 0 2-2V7z" />
    </svg>
  );
}

export function BoltIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12L13 2z" />
    </svg>
  );
}

const ACHIEVEMENT_PATHS: Record<string, string> = {
  first_solve: 'M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z',
  solves_10: 'M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4-6.2-4.5-6.2 4.5 2.4-7.4L2 9.4h7.6z',
  solves_100: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 3l1.8 5.5H19l-4.7 3.4 1.8 5.5L12 16l-4.1 3.4 1.8-5.5L5 10.5h5.2z',
  sub_60: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm1 4v4.6l3.2 1.9-.8 1.3L11 13.5V8zM9 1h6v2H9z',
  sub_30: 'M13 2L4.5 13.5H11L10 22l8.5-11.5H12L13 2z',
  all_sizes: 'M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 4h8v4h-8zm0-4h8v3h-8z',
  daily_first: 'M7 2h2v2h6V2h2v2h3v18H4V4h3zm-1 6v12h12V8zm2 2h3v3H8z',
  streak_7: 'M12 2c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 1-3-1-6 1-9z',
  daily_win: 'M12 2l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L2 9l6-1z',
  top3_week: 'M2 20h20v2H2zm1-3h5V9H3zm7 0h5V3h-5zm7 0h4v-6h-4z',
  inviter: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4 0-7 2-7 5v2h14v-2c0-3-3-5-7-5zm9-6h2v2h2v2h-2v2h-2v-2h-2V9h2z',
  duel_streak_3: 'M6.92 5H5l9 9 1-.94L6.92 5zM14.8 3.4a1 1 0 0 1 1.4 0l4.4 4.4a1 1 0 0 1 0 1.4L19 10.8l1.6 1.6a1 1 0 0 1 0 1.4l-.7.7 1.4 1.4a1 1 0 1 1-1.4 1.4l-1.4-1.4-.7.7a1 1 0 0 1-1.4 0L14.8 15 6.2 21.4a1 1 0 0 1-1.3-.1l-2.2-2.2a1 1 0 0 1-.1-1.3L9 9.2 7.4 7.6a1 1 0 0 1 0-1.4l.7-.7L6.7 4.1a1 1 0 0 1 1.4-1.4l1.4 1.4.7-.7a1 1 0 0 1 1.4 0L13.2 5l1.6-1.6z',
  duel_streak_5: 'M12 23c-4.4 0-8-3.2-8-7.6 0-3 1.7-5.2 3.3-7.1.4-.5 1.2-.2 1.2.4.1 1.3.5 2.3 1.4 3 .3-3.2 1.7-6.6 5-8.6.5-.3 1.2.1 1.1.7-.2 1.6.2 3 1.2 4.3 1.6 2 2.8 4.1 2.8 7.3 0 4.4-3.6 7.6-8 7.6z',
  duel_streak_10: 'M3 18h18v2H3zm0-2l-1-9 5 4 5-7 5 7 5-4-1 9z',
};

/** Значок досягнення: емальований щит із гравіюванням */
export function AchievementIcon({ id, unlocked, className = 'w-12 h-12' }: IconProps & { id: string; unlocked: boolean }) {
  const gid = `ach-${id}`;
  return (
    <svg viewBox="0 0 48 48" className={className}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={unlocked ? '#38bdf8' : '#334155'} />
          <stop offset="1" stopColor={unlocked ? '#1d4ed8' : '#0f172a'} />
        </linearGradient>
      </defs>
      <path d="M24 3l17 6v13c0 10-7 18-17 23C14 40 7 32 7 22V9z" fill={`url(#${gid})`} stroke={unlocked ? '#bae6fd' : '#475569'} strokeWidth="1.5" />
      <path d="M24 7l13 4.6V22c0 8-5.5 14.5-13 18.6C16.5 36.5 11 30 11 22V11.6z" fill="none" stroke={unlocked ? '#e0f2fe' : '#475569'} strokeOpacity="0.5" strokeWidth="1" />
      <g transform="translate(12 12) scale(1)">
        <path d={ACHIEVEMENT_PATHS[id] || ACHIEVEMENT_PATHS.first_solve} fill={unlocked ? '#f8fafc' : '#64748b'} />
      </g>
    </svg>
  );
}
