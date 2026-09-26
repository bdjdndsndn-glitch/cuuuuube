/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { api, LeaderboardData, Period } from '../utils/api';
import { getGame } from '../utils/gameBridge';
import { playTick } from '../utils/sound';
import { FullPage } from './FullPage';
import { LeaderList } from './LeaderList';
import { TrophyIcon } from './Icons';

interface LeaderboardPanelProps {
  isOpen: boolean;
  onClose: () => void;
  myUserId?: number;
  inTelegram: boolean;
}

const SIZES = [2, 3, 4, 5];

const BADGE =
  'w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400/25 to-orange-600/15 border border-amber-300/30 flex items-center justify-center text-amber-300 shadow-lg shadow-amber-500/10 shrink-0';

/** «Лідери» — повноекранна мобільна сторінка рейтингу (іконка кубка) */
export function LeaderboardPanel({ isOpen, onClose, myUserId, inTelegram }: LeaderboardPanelProps) {
  const [size, setSize] = useState(3);
  const [period, setPeriod] = useState<Period>('all');
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSize(getGame()?.cube?.sizeGenerated || 3);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .leaderboard(size, period)
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message || 'Не вдалося завантажити рейтинг'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isOpen, size, period, reload]);

  const tabs = (
    <>
      <div className="flex gap-1.5 mb-2 p-1 rounded-xl bg-slate-950/70 border border-white/5" data-testid="leaderboard-period-tabs">
        {(['all', 'week'] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => { playTick(); setPeriod(p); }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${p === period ? 'bg-amber-400/20 text-amber-200' : 'text-slate-400 hover:text-white'}`}
            data-testid={`leaderboard-period-${p}`}
          >
            {p === 'all' ? 'Усі часи' : 'Цей тиждень'}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5" data-testid="leaderboard-size-tabs">
        {SIZES.map((s) => (
          <button
            key={s}
            onClick={() => { playTick(); setSize(s); }}
            className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${s === size ? 'bg-sky-500/25 border-sky-400/50 text-sky-200' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
            data-testid={`leaderboard-size-${s}`}
          >
            {s}x{s}
          </button>
        ))}
      </div>
    </>
  );

  return (
    <FullPage
      isOpen={isOpen}
      onClose={onClose}
      title="Лідери"
      subtitle="Найкращі часи гравців Telegram"
      icon={<TrophyIcon className="w-5 h-5" />}
      glow="rgba(251,191,36,0.14)"
      badgeClass={BADGE}
      sticky={tabs}
      testId="leaders-page"
    >
      <LeaderList
        entries={data?.top || []}
        me={data?.me || null}
        myUserId={myUserId}
        total={data?.total || 0}
        loading={loading && !data}
        error={error}
        emptyText={period === 'week' ? 'Цього тижня ще ніхто не зібрав цей кубик. Станьте першим!' : 'Ще ніхто не зібрав цей кубик. Станьте першим!'}
        inTelegram={inTelegram}
        friendIds={data?.friend_ids || []}
        onRetry={() => setReload((v) => v + 1)}
      />
      {data && data.friend_ids.length > 0 && (
        <p className="mt-2 text-[11px] text-emerald-300/80" data-testid="friends-count">
          Ваших друзів у грі: {data.friend_ids.length} · у цьому рейтингу: {data.top.filter((e) => data.friend_ids.includes(e.user_id)).length}
        </p>
      )}
    </FullPage>
  );
}
