import React, { useState, useEffect } from 'react';
import { Download, TrendingUp, TrendingDown, X } from 'lucide-react';

const TradeHistory = () => {
  const [trades, setTrades] = useState([]);
  const [filteredTrades, setFilteredTrades] = useState([]);
  const [filters, setFilters] = useState({
    symbol: 'all',
    type: 'all',
    status: 'all',
    dateFrom: '',
    dateTo: ''
  });
  const [stats, setStats] = useState({
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    totalPnL: 0,
    winRate: 0,
    avgWin: 0,
    avgLoss: 0
  });

  useEffect(() => {
    (async () => {
      try {
        const data = await window.electronAPI.getTrades?.();
        setTrades(data || []);
      } catch (err) {
        console.error('Failed to fetch trades:', err);
      }
    })();
  }, []);

  useEffect(() => {
    let out = [...trades];
    if (filters.symbol !== 'all') out = out.filter((t) => t.symbol === filters.symbol);
    if (filters.type !== 'all') out = out.filter((t) => t.side === filters.type);
    if (filters.status !== 'all') out = out.filter((t) => t.status === filters.status);
    if (filters.dateFrom) out = out.filter((t) => new Date(t.timestamp) >= new Date(filters.dateFrom));
    if (filters.dateTo) out = out.filter((t) => new Date(t.timestamp) <= new Date(filters.dateTo));
    setFilteredTrades(out);
  }, [trades, filters]);

  useEffect(() => {
    const closed = filteredTrades.filter((t) => t.status === 'closed');
    const wins = closed.filter((t) => t.pnl > 0);
    const losses = closed.filter((t) => t.pnl < 0);

    const totalPnL = closed.reduce((s, t) => s + t.pnl, 0);
    const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;

    setStats({
      totalTrades: closed.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      totalPnL,
      winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
      avgWin,
      avgLoss
    });
  }, [filteredTrades]);

  const exportTrades = async () => {
    try {
      await window.electronAPI.exportTrades?.(filteredTrades);
    } catch (err) {
      console.error('Failed to export trades:', err);
    }
  };

  const updateFilter = (key, value) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const resetFilters = () =>
    setFilters({ symbol: 'all', type: 'all', status: 'all', dateFrom: '', dateTo: '' });

  const hasActiveFilters = Object.values(filters).some((v) => v !== 'all' && v !== '');

  const fmtMoney = (v) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(v || 0);

  const fmtPct = (v) => `${(v || 0).toFixed(1)}%`;

  const fmtQty = (v) =>
    v == null ? '—' : Number(v).toString().replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');

  return (
    <div className="min-h-screen bg-[#0a0e17] text-slate-200">
      <div className="max-w-[1400px] mx-auto px-8 py-10">

        {/* ═══════════════ HEADER ═══════════════ */}
        <header className="flex items-start justify-between gap-6 mb-10">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-white">
              Trade History
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {filteredTrades.length === trades.length
                ? `${trades.length} trade${trades.length === 1 ? '' : 's'}`
                : `${filteredTrades.length} of ${trades.length} trades`}
            </p>
          </div>

          <button
            onClick={exportTrades}
            disabled={filteredTrades.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg
                       text-sm font-medium text-slate-200
                       border border-slate-800 hover:border-slate-700
                       hover:bg-slate-900/60
                       disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors"
          >
            <Download size={14} />
            Export CSV
          </button>
        </header>

        {/* ═══════════════ STATS ═══════════════ */}
        <section className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-800/60
                            border-y border-slate-800/60 mb-10">
          <BigStat label="Total P&L" value={`${stats.totalPnL >= 0 ? '+' : ''}${fmtMoney(stats.totalPnL)}`}
                   tone={stats.totalPnL > 0 ? 'up' : stats.totalPnL < 0 ? 'down' : 'neutral'} />
          <BigStat label="Win Rate" value={fmtPct(stats.winRate)}
                   tone={stats.winRate >= 50 ? 'up' : 'neutral'} />
          <BigStat label="Trades" value={stats.totalTrades} />
          <BigStat label="Avg Win / Loss"
                   value={<span>
                     <span className="text-emerald-400">{fmtMoney(stats.avgWin)}</span>
                     <span className="text-slate-600 mx-2">/</span>
                     <span className="text-rose-400">{fmtMoney(Math.abs(stats.avgLoss))}</span>
                   </span>} />
        </section>

        {/* ═══════════════ SECONDARY STATS ═══════════════ */}
        <section className="flex flex-wrap gap-x-10 gap-y-3 mb-10 text-sm">
          <SmallStat label="Wins" value={stats.winningTrades} />
          <SmallStat label="Losses" value={stats.losingTrades} />
          <SmallStat label="Showing" value={`${filteredTrades.length} / ${trades.length}`} />
        </section>

        {/* ═══════════════ FILTERS ═══════════════ */}
        <section className="rounded-xl border border-slate-800/80 bg-slate-900/20 p-5 mb-10">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Select
              label="Symbol"
              value={filters.symbol}
              onChange={(v) => updateFilter('symbol', v)}
              options={[
                { value: 'all', label: 'All symbols' },
                { value: 'BTCUSDT', label: 'BTC / USDT' },
                { value: 'ETHUSDT', label: 'ETH / USDT' },
                { value: 'ADAUSDT', label: 'ADA / USDT' }
              ]}
            />
            <Select
              label="Type"
              value={filters.type}
              onChange={(v) => updateFilter('type', v)}
              options={[
                { value: 'all', label: 'All types' },
                { value: 'buy', label: 'Buy' },
                { value: 'sell', label: 'Sell' }
              ]}
            />
            <Select
              label="Status"
              value={filters.status}
              onChange={(v) => updateFilter('status', v)}
              options={[
                { value: 'all', label: 'All statuses' },
                { value: 'open', label: 'Open' },
                { value: 'closed', label: 'Closed' },
                { value: 'cancelled', label: 'Cancelled' }
              ]}
            />
            <DateField
              label="From"
              value={filters.dateFrom}
              onChange={(v) => updateFilter('dateFrom', v)}
            />
            <DateField
              label="To"
              value={filters.dateTo}
              onChange={(v) => updateFilter('dateTo', v)}
            />
          </div>

          {hasActiveFilters && (
            <div className="flex justify-end mt-4 pt-4 border-t border-slate-800/60">
              <button
                onClick={resetFilters}
                className="text-xs text-slate-500 hover:text-slate-200 transition-colors"
              >
                Clear all filters
              </button>
            </div>
          )}
        </section>

        {/* ═══════════════ TABLE ═══════════════ */}
        <section>
          {filteredTrades.length > 0 ? (
            <div className="rounded-xl border border-slate-800/80 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900/40 text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="text-left  font-medium px-5 py-3">Date</th>
                    <th className="text-left  font-medium px-5 py-3">Symbol</th>
                    <th className="text-left  font-medium px-5 py-3">Side</th>
                    <th className="text-right font-medium px-5 py-3">Quantity</th>
                    <th className="text-right font-medium px-5 py-3">Entry</th>
                    <th className="text-right font-medium px-5 py-3">Exit</th>
                    <th className="text-right font-medium px-5 py-3">P&L</th>
                    <th className="text-center font-medium px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrades.map((t, i) => {
                    const isBuy = t.side === 'buy';
                    const up = t.pnl > 0;
                    const down = t.pnl < 0;
                    return (
                      <tr
                        key={t.id || i}
                        className="border-t border-slate-800/40 hover:bg-slate-800/20 transition-colors"
                      >
                        <td className="px-5 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">
                          {new Date(t.timestamp).toLocaleString('en-US', {
                            month: 'short', day: '2-digit',
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </td>
                        <td className="px-5 py-3 text-slate-200 font-medium whitespace-nowrap">
                          {t.symbol}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                            isBuy ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            {isBuy ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                            {t.side?.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-slate-400">
                          {fmtQty(t.quantity)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-slate-300">
                          {fmtMoney(t.entryPrice)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-slate-500">
                          {t.exitPrice ? fmtMoney(t.exitPrice) : '—'}
                        </td>
                        <td className={`px-5 py-3 text-right font-mono font-medium whitespace-nowrap ${
                          up ? 'text-emerald-400' : down ? 'text-rose-400' : 'text-slate-500'
                        }`}>
                          {up || down ? `${up ? '+' : ''}${fmtMoney(t.pnl)}` : '—'}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className={`text-[11px] font-medium ${
                            t.status === 'open' ? 'text-blue-400' :
                            t.status === 'closed' ? 'text-slate-400' :
                            'text-slate-600'
                          }`}>
                            {t.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState hasFilters={hasActiveFilters} onReset={resetFilters} />
          )}
        </section>

      </div>

      {/* ═══════════════ STYLES ═══════════════ */}
      <style>{`
        .input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          background-color: rgb(10 14 23 / 0.6);
          border: 1px solid rgb(30 41 59 / 0.8);
          border-radius: 0.5rem;
          color: rgb(226 232 240);
          font-size: 0.8125rem;
          outline: none;
          transition: border-color 0.15s ease;
        }
        .input:hover:not(:disabled) { border-color: rgb(51 65 85); }
        .input:focus { border-color: rgb(99 102 241 / 0.6); }
        .input::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
        select.input {
          cursor: pointer;
          appearance: none;
          padding-right: 2rem;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 0.75rem center;
        }
      `}</style>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

const BigStat = ({ label, value, tone = 'neutral' }) => {
  const toneClass = {
    up: 'text-emerald-400',
    down: 'text-rose-400',
    neutral: 'text-white'
  }[tone];

  return (
    <div className="px-6 py-6">
      <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2">
        {label}
      </div>
      <div className={`text-2xl font-semibold font-mono tracking-tight ${toneClass}`}>
        {value}
      </div>
    </div>
  );
};

const SmallStat = ({ label, value }) => (
  <div className="flex items-baseline gap-2">
    <span className="text-slate-500">{label}</span>
    <span className="font-mono font-medium text-slate-300">{value}</span>
  </div>
);

const Select = ({ label, value, onChange, options }) => (
  <div className="min-w-0">
    <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
      {label}
    </label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="input"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  </div>
);

const DateField = ({ label, value, onChange }) => (
  <div className="min-w-0">
    <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
      {label}
    </label>
    <div className="relative">
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input font-mono"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded
                     text-slate-500 hover:text-slate-200 transition-colors"
          aria-label="Clear date"
        >
          <X size={11} />
        </button>
      )}
    </div>
  </div>
);

const EmptyState = ({ hasFilters, onReset }) => (
  <div className="border border-dashed border-slate-800 rounded-xl py-20 text-center">
    <p className="text-slate-400 text-sm">
      {hasFilters ? 'No matching trades' : 'No trades yet'}
    </p>
    <p className="text-slate-600 text-xs mt-2">
      {hasFilters
        ? 'Try adjusting or clearing the filters above'
        : 'Your executed trades will appear here once the bot starts trading'}
    </p>
    {hasFilters && (
      <button
        onClick={onReset}
        className="mt-5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
      >
        Clear all filters
      </button>
    )}
  </div>
);

export default TradeHistory;