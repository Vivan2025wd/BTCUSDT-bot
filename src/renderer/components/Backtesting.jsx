import React, { useState } from 'react';
import { Play, Square, TrendingUp, TrendingDown, Download } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';

const Backtesting = () => {
  const [config, setConfig] = useState({
    symbol: 'BTCUSDT',
    strategy: 'EMA',
    timeframe: '1h',
    startDate: '2023-01-01',
    endDate: '2024-01-01',
    initialBalance: 10000,
    commission: 0.1
  });

  const [results, setResults] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const update = (key, value) => setConfig((c) => ({ ...c, [key]: value }));

  const runBacktest = async () => {
    setIsRunning(true);
    setProgress(0);

    const tick = setInterval(() => {
      setProgress((p) => (p >= 90 ? (clearInterval(tick), 90) : p + 10));
    }, 500);

    try {
      const res = await window.electronAPI.runBacktest?.(config);
      clearInterval(tick);
      setProgress(100);
      setResults(res);
    } catch (err) {
      console.error('Backtest failed:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const stopBacktest = async () => {
    try {
      await window.electronAPI.stopBacktest?.();
    } catch {}
    setIsRunning(false);
    setProgress(0);
  };

  const fmtMoney = (v) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD',
      minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(v || 0);

  const fmtPct = (v) =>
    v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

  return (
    <div className="min-h-screen bg-[#0a0e17] text-slate-200">
      <div className="max-w-[1400px] mx-auto px-8 py-10">

        {/* ═══════════════ HEADER ═══════════════ */}
        <header className="mb-10">
          <h1 className="text-[22px] font-semibold tracking-tight text-white">
            Backtesting
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Test strategies against historical market data
          </p>
        </header>

        {/* ═══════════════ CONFIG TOOLBAR ═══════════════ */}
        <section className="rounded-xl border border-slate-800/80 bg-slate-900/30 p-6 mb-10">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-x-5 gap-y-4">
            <Field label="Symbol">
              <select
                value={config.symbol}
                onChange={(e) => update('symbol', e.target.value)}
                disabled={isRunning}
                className="input"
              >
                <option value="BTCUSDT">BTC / USDT</option>
                <option value="ETHUSDT">ETH / USDT</option>
                <option value="ADAUSDT">ADA / USDT</option>
                <option value="DOGEUSDT">DOGE / USDT</option>
              </select>
            </Field>

            <Field label="Strategy">
              <select
                value={config.strategy}
                onChange={(e) => update('strategy', e.target.value)}
                disabled={isRunning}
                className="input"
              >
                <option value="EMA">EMA Crossover</option>
                <option value="RSI">RSI</option>
                <option value="COMBINED">Combined</option>
              </select>
            </Field>

            <Field label="Timeframe">
              <select
                value={config.timeframe}
                onChange={(e) => update('timeframe', e.target.value)}
                disabled={isRunning}
                className="input"
              >
                <option value="5m">5m</option>
                <option value="15m">15m</option>
                <option value="1h">1h</option>
                <option value="4h">4h</option>
                <option value="1d">1d</option>
              </select>
            </Field>

            <Field label="From">
              <input
                type="date"
                value={config.startDate}
                onChange={(e) => update('startDate', e.target.value)}
                disabled={isRunning}
                className="input"
              />
            </Field>

            <Field label="To">
              <input
                type="date"
                value={config.endDate}
                onChange={(e) => update('endDate', e.target.value)}
                disabled={isRunning}
                className="input"
              />
            </Field>

            <Field label="Capital">
              <input
                type="number"
                value={config.initialBalance}
                onChange={(e) => update('initialBalance', parseFloat(e.target.value))}
                disabled={isRunning}
                min="1000"
                step="1000"
                className="input font-mono"
              />
            </Field>

            <Field label="Fee %">
              <input
                type="number"
                value={config.commission}
                onChange={(e) => update('commission', parseFloat(e.target.value))}
                disabled={isRunning}
                min="0"
                max="1"
                step="0.01"
                className="input font-mono"
              />
            </Field>
          </div>

          {/* Action row */}
          <div className="flex items-center justify-between mt-6 pt-5 border-t border-slate-800/60">
            <div className="text-xs text-slate-500">
              {isRunning
                ? <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                    Running simulation…
                  </span>
                : <>Ready · {config.symbol} · {config.timeframe} · {config.strategy}</>
              }
            </div>

            <div className="flex items-center gap-3">
              {isRunning && (
                <div className="w-40 h-1 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}

              {isRunning ? (
                <button onClick={stopBacktest} className="btn-stop">
                  <Square size={13} />
                  Stop
                </button>
              ) : (
                <button onClick={runBacktest} className="btn-run">
                  <Play size={13} />
                  Run Backtest
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ═══════════════ RESULTS ═══════════════ */}
        {results ? (
          <div className="space-y-10">
            <PrimaryMetrics results={results} fmtPct={fmtPct} />
            <SecondaryMetrics results={results} fmtMoney={fmtMoney} fmtPct={fmtPct} />
            <EquityChart data={results.equityCurve} fmtMoney={fmtMoney} />
            <TradesTable trades={results.trades} fmtMoney={fmtMoney} fmtPct={fmtPct} />
          </div>
        ) : (
          <EmptyState />
        )}

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
        .input:disabled { opacity: 0.4; cursor: not-allowed; }
        .input::-webkit-calendar-picker-indicator { filter: invert(0.5); cursor: pointer; }
        select.input {
          cursor: pointer;
          appearance: none;
          padding-right: 2rem;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 0.75rem center;
        }
        .input[type="number"]::-webkit-outer-spin-button,
        .input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none; margin: 0;
        }

        .btn-run {
          display: inline-flex; align-items: center; gap: 0.5rem;
          padding: 0.5rem 1.125rem;
          background-color: rgb(99 102 241);
          color: white; font-size: 0.8125rem; font-weight: 500;
          border-radius: 0.5rem;
          transition: background-color 0.15s ease;
        }
        .btn-run:hover { background-color: rgb(79 70 229); }

        .btn-stop {
          display: inline-flex; align-items: center; gap: 0.5rem;
          padding: 0.5rem 1.125rem;
          background-color: rgb(244 63 94 / 0.9);
          color: white; font-size: 0.8125rem; font-weight: 500;
          border-radius: 0.5rem;
          transition: background-color 0.15s ease;
        }
        .btn-stop:hover { background-color: rgb(225 29 72); }
      `}</style>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   FIELD (config toolbar input)
   ═══════════════════════════════════════════════════════════════ */
const Field = ({ label, children }) => (
  <div className="min-w-0">
    <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
      {label}
    </label>
    {children}
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   PRIMARY METRICS — 4 big numbers, dividers, no cards
   ═══════════════════════════════════════════════════════════════ */
const PrimaryMetrics = ({ results, fmtPct }) => {
  const items = [
    {
      label: 'Total Return',
      value: fmtPct(results.totalReturn),
      tone: results.totalReturn >= 0 ? 'up' : 'down'
    },
    {
      label: 'Win Rate',
      value: `${(results.winRate || 0).toFixed(1)}%`,
      tone: results.winRate >= 50 ? 'up' : 'neutral'
    },
    {
      label: 'Total Trades',
      value: results.totalTrades ?? 0,
      tone: 'neutral'
    },
    {
      label: 'Profit Factor',
      value: results.profitFactor?.toFixed(2) || '—',
      tone: results.profitFactor > 1 ? 'up' : 'down'
    }
  ];

  const toneClass = {
    up: 'text-emerald-400',
    down: 'text-rose-400',
    neutral: 'text-white'
  };

  return (
    <section className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-800/60
                        border-y border-slate-800/60">
      {items.map((m) => (
        <div key={m.label} className="px-6 py-6">
          <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2">
            {m.label}
          </div>
          <div className={`text-2xl font-semibold font-mono tracking-tight ${toneClass[m.tone]}`}>
            {m.value}
          </div>
        </div>
      ))}
    </section>
  );
};

/* ═══════════════════════════════════════════════════════════════
   SECONDARY METRICS — plain text strip
   ═══════════════════════════════════════════════════════════════ */
const SecondaryMetrics = ({ results, fmtMoney, fmtPct }) => {
  const items = [
    { label: 'Sharpe', value: results.sharpeRatio?.toFixed(2) || '—' },
    { label: 'Max Drawdown', value: fmtPct(results.maxDrawdown) },
    { label: 'Avg Win', value: fmtMoney(results.avgWin), tone: 'up' },
    { label: 'Avg Loss', value: fmtMoney(Math.abs(results.avgLoss || 0)), tone: 'down' },
    { label: 'Wins', value: results.winningTrades ?? '—' },
    { label: 'Losses', value: results.losingTrades ?? '—' }
  ];

  return (
    <section className="flex flex-wrap gap-x-10 gap-y-4">
      {items.map((it) => (
        <div key={it.label} className="flex items-baseline gap-2 text-sm">
          <span className="text-slate-500">{it.label}</span>
          <span className={`font-mono font-medium ${
            it.tone === 'up' ? 'text-emerald-400' :
            it.tone === 'down' ? 'text-rose-400' :
            'text-slate-300'
          }`}>
            {it.value}
          </span>
        </div>
      ))}
    </section>
  );
};

/* ═══════════════════════════════════════════════════════════════
   EQUITY CHART
   ═══════════════════════════════════════════════════════════════ */
const EquityChart = ({ data, fmtMoney }) => (
  <section>
    <div className="flex items-baseline justify-between mb-5">
      <h2 className="text-[15px] font-medium text-slate-200">Equity Curve</h2>
      <span className="text-xs text-slate-500 font-mono">
        {data?.length || 0} data points
      </span>
    </div>

    <div className="rounded-xl border border-slate-800/80 bg-slate-900/20 p-4">
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data || []} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1e293b" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="date"
            stroke="#475569"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis
            stroke="#475569"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmtMoney}
            width={70}
            domain={['auto', 'auto']}
          />
          <Tooltip
            cursor={{ stroke: '#334155', strokeWidth: 1 }}
            contentStyle={{
              backgroundColor: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: 8,
              fontSize: 12,
              padding: '8px 12px'
            }}
            labelStyle={{ color: '#94a3b8', fontSize: 11 }}
            formatter={(v) => [fmtMoney(v), 'Balance']}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#10b981"
            strokeWidth={1.75}
            fill="url(#equityFill)"
            dot={false}
            activeDot={{ r: 3.5, fill: '#10b981', stroke: '#0a0e17', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </section>
);

/* ═══════════════════════════════════════════════════════════════
   TRADES TABLE
   ═══════════════════════════════════════════════════════════════ */
const TradesTable = ({ trades, fmtMoney, fmtPct }) => {
  const recent = (trades || []).slice(-10).reverse();

  return (
    <section>
      <div className="flex items-baseline justify-between mb-5">
        <h2 className="text-[15px] font-medium text-slate-200">Recent Trades</h2>
        <span className="text-xs text-slate-500 font-mono">
          last {recent.length} of {trades?.length || 0}
        </span>
      </div>

      <div className="rounded-xl border border-slate-800/80 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-900/40 text-[10px] uppercase tracking-wider text-slate-500">
              <th className="text-left  font-medium px-5 py-3">Date</th>
              <th className="text-left  font-medium px-5 py-3">Side</th>
              <th className="text-right font-medium px-5 py-3">Entry</th>
              <th className="text-right font-medium px-5 py-3">Exit</th>
              <th className="text-right font-medium px-5 py-3">P&L</th>
              <th className="text-right font-medium px-5 py-3">Return</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((t, i) => {
              const isBuy = t.side === 'buy';
              const up = t.pnl >= 0;
              const retUp = t.returnPercent >= 0;
              return (
                <tr
                  key={i}
                  className="border-t border-slate-800/40 hover:bg-slate-800/20 transition-colors"
                >
                  <td className="px-5 py-3 text-xs font-mono text-slate-500">
                    {new Date(t.entryTime).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                      isBuy ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {isBuy ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      {t.side.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-slate-300">
                    {fmtMoney(t.entryPrice)}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-slate-400">
                    {fmtMoney(t.exitPrice)}
                  </td>
                  <td className={`px-5 py-3 text-right font-mono font-medium ${
                    up ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {up ? '+' : ''}{fmtMoney(t.pnl)}
                  </td>
                  <td className={`px-5 py-3 text-right font-mono text-xs ${
                    retUp ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {fmtPct(t.returnPercent)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};

/* ═══════════════════════════════════════════════════════════════
   EMPTY STATE
   ═══════════════════════════════════════════════════════════════ */
const EmptyState = () => (
  <div className="border border-dashed border-slate-800 rounded-xl py-24 text-center">
    <p className="text-slate-400 text-sm">No backtest results yet</p>
    <p className="text-slate-600 text-xs mt-2">
      Configure your parameters above and click Run Backtest
    </p>
  </div>
);

export default Backtesting;