import { FormEvent, useEffect, useState } from 'react';
import { AdminOverview, AdminPlayer, api } from '../utils/api';

function number(value: number): string {
  return value.toLocaleString('uk-UA');
}

function AdminStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-black tabular-nums text-white">{number(value)}</div>
    </div>
  );
}

export function AdminPanel() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [query, setQuery] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<AdminPlayer | null>(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [txHashes, setTxHashes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshOverview = async () => {
    setError(null);
    try {
      setOverview(await api.adminOverview());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не вдалося завантажити адмін-панель');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshOverview();
  }, []);

  const searchPlayers = async (event?: FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.adminSearchPlayers(query.trim());
      setPlayers(result.players);
      setSelectedPlayer(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не вдалося знайти гравців');
    } finally {
      setBusy(false);
    }
  };

  const adjustCoins = async () => {
    if (!selectedPlayer || !reason.trim()) return;
    const parsedDelta = Number(delta);
    if (!Number.isSafeInteger(parsedDelta) || parsedDelta === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await api.adminAdjustCoins(selectedPlayer.user_id, parsedDelta, reason.trim());
      setSelectedPlayer(updated);
      setPlayers((current) => current.map((player) => player.user_id === updated.user_id ? updated : player));
      setDelta('');
      setReason('');
      setNotice(`Баланс ${updated.username ? `@${updated.username}` : updated.user_id} оновлено: ${number(updated.coins)} монет.`);
      await refreshOverview();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не вдалося змінити баланс');
    } finally {
      setBusy(false);
    }
  };

  const resetWheel = async () => {
    if (!selectedPlayer || !window.confirm(`Скинути таймер і додаткові оберти гравця ${selectedPlayer.username ? `@${selectedPlayer.username}` : selectedPlayer.user_id}?`)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.adminResetPlayerWheel(selectedPlayer.user_id);
      setNotice('Стан колеса скинуто.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не вдалося скинути колесо');
    } finally {
      setBusy(false);
    }
  };

  const updateWithdrawal = async (requestId: string, status: 'completed' | 'rejected') => {
    const txHash = txHashes[requestId]?.trim();
    if (status === 'completed' && !txHash) {
      setError('Додайте tx hash після ручної on-chain виплати.');
      return;
    }
    if (status === 'rejected' && !window.confirm('Відхилити заявку? TON буде повернуто на внутрішній баланс гравця.')) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.adminUpdateWithdrawal(requestId, status, txHash);
      setNotice(status === 'completed' ? 'Виплату позначено завершеною.' : 'Заявку відхилено, TON повернуто гравцю.');
      await refreshOverview();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не вдалося оновити заявку');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#080d18] px-4 py-5 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300">THE CUBE · CONTROL</p>
            <h1 className="mt-1 text-2xl font-black">Адмін-панель</h1>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void refreshOverview()} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/5">Оновити</button>
            <a href="/" className="rounded-lg bg-white/5 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/10">До гри</a>
          </div>
        </header>

        {error && <div role="alert" className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}
        {notice && <div role="status" className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{notice}</div>}

        {loading ? (
          <p className="py-12 text-center text-sm text-slate-400">Завантаження даних…</p>
        ) : overview ? (
          <>
            <section className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Загальна статистика">
              <AdminStat label="Гравці" value={overview.players_total} />
              <AdminStat label="Монети в обігу" value={overview.coins_total} />
              <AdminStat label="Збирання" value={overview.solves_total} />
              <AdminStat label="Дуелі" value={overview.duels_total} />
            </section>

            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
              <div className="space-y-3 rounded-xl border border-white/10 bg-slate-900/50 p-3 sm:p-4">
                <div>
                  <h2 className="text-sm font-extrabold">Гравці</h2>
                  <p className="mt-0.5 text-[11px] text-slate-400">Пошук за Telegram ID, ніком або ім’ям</p>
                </div>
                <form onSubmit={searchPlayers} className="flex gap-2">
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="@username або Telegram ID" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400/50" />
                  <button disabled={busy} className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-extrabold text-slate-950 disabled:opacity-50">Знайти</button>
                </form>
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {players.map((player) => (
                    <button key={player.user_id} type="button" onClick={() => setSelectedPlayer(player)} className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${selectedPlayer?.user_id === player.user_id ? 'border-sky-400/40 bg-sky-500/10' : 'border-white/5 bg-slate-950/50 hover:bg-white/5'}`}>
                      <span className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-xs font-bold">{player.username ? `@${player.username}` : player.first_name} <span className="font-mono font-normal text-slate-500">· {player.user_id}</span></span>
                        <span className="shrink-0 font-mono text-xs text-amber-200">{number(player.coins)} C</span>
                      </span>
                    </button>
                  ))}
                  {!players.length && <p className="py-4 text-center text-xs text-slate-500">Введіть запит і натисніть «Знайти».</p>}
                </div>

                {selectedPlayer && (
                  <div className="space-y-3 rounded-lg border border-sky-300/20 bg-slate-950/70 p-3" data-testid="admin-player-actions">
                    <div>
                      <div className="text-sm font-extrabold">{selectedPlayer.username ? `@${selectedPlayer.username}` : selectedPlayer.first_name}</div>
                      <div className="text-[10px] text-slate-400">ID {selectedPlayer.user_id} · {number(selectedPlayer.coins)} монет · {number(Math.floor(selectedPlayer.ton_balance_nano / 100_000_000)) / 10} TON · {selectedPlayer.extra_spins} додаткових обертів</div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[120px_1fr_auto]">
                      <input type="number" step="1" value={delta} onChange={(event) => setDelta(event.target.value)} placeholder="± монети" className="min-w-0 rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm font-mono outline-none focus:border-sky-400/50" />
                      <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} placeholder="Причина корекції" className="min-w-0 rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm outline-none focus:border-sky-400/50" />
                      <button type="button" onClick={() => void adjustCoins()} disabled={busy || !Number(delta) || reason.trim().length < 3} className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-extrabold text-slate-950 disabled:opacity-40">Змінити баланс</button>
                    </div>
                    <button type="button" onClick={() => void resetWheel()} disabled={busy} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/5 disabled:opacity-50">Скинути колесо фортуни</button>
                  </div>
                )}
              </div>

              <div className="space-y-3 rounded-xl border border-white/10 bg-slate-900/50 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-extrabold">Заявки на виведення</h2>
                  <span className="rounded-full bg-amber-400/10 px-2 py-1 text-[10px] font-bold text-amber-200">{overview.pending_withdrawals.length} очікують</span>
                </div>
                <div className="max-h-[34rem] space-y-2 overflow-y-auto">
                  {overview.pending_withdrawals.map((withdrawal) => (
                    <article key={withdrawal.request_id} className="space-y-2 rounded-lg border border-white/10 bg-slate-950/70 p-3" data-testid={`admin-withdrawal-${withdrawal.request_id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-extrabold">{withdrawal.username ? `@${withdrawal.username}` : `ID ${withdrawal.user_id}`}</div>
                          <div className="mt-0.5 font-mono text-lg font-black text-sky-200">{withdrawal.amount_ton} TON</div>
                        </div>
                        <span className="shrink-0 text-[9px] text-slate-500">{new Date(withdrawal.requested_at).toLocaleString('uk-UA')}</span>
                      </div>
                      <code className="block break-all rounded bg-black/30 p-2 text-[10px] text-slate-400">{withdrawal.wallet_address}</code>
                      <input value={txHashes[withdrawal.request_id] || ''} onChange={(event) => setTxHashes((current) => ({ ...current, [withdrawal.request_id]: event.target.value }))} placeholder="Transaction hash після ручної виплати" className="w-full rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-xs font-mono outline-none focus:border-sky-400/50" />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => void updateWithdrawal(withdrawal.request_id, 'completed')} disabled={busy || (txHashes[withdrawal.request_id] || '').trim().length < 8} className="flex-1 rounded-lg bg-emerald-500/15 px-3 py-2 text-[10px] font-bold text-emerald-200 border border-emerald-300/20 disabled:opacity-40">Виплату виконано</button>
                        <button type="button" onClick={() => void updateWithdrawal(withdrawal.request_id, 'rejected')} disabled={busy} className="rounded-lg border border-rose-300/20 bg-rose-500/10 px-3 py-2 text-[10px] font-bold text-rose-200 disabled:opacity-40">Відхилити й повернути TON</button>
                      </div>
                    </article>
                  ))}
                  {!overview.pending_withdrawals.length && <p className="py-8 text-center text-xs text-slate-500">Немає заявок, що очікують обробки.</p>}
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
