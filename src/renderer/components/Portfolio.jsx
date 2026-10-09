import React, { useState, useEffect } from 'react';
import { RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell as BarCell
} from 'recharts';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4', '#10b981', '#f43f5e'];

const Portfolio = () => {
  const [portfolio, setPortfolio] = useState({
    totalBalance: 0,
    totalPnL: 0,
    totalPnLPercent: 0,
    assets: [],
    positions: []
  });
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    fetchPortfolioData();
    const interval = setInterval(fetchPortfolioData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchPortfolioData = async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getPortfolio?.();
      if (data) setPortfolio(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch portfolio:', err);
    } finally {
      setLoading(false);
    }
  };

  const fmtMoney = (v) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD',
      minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(v || 0);

  const fmtPct = (v) =>
    v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

  const pieData = portfolio.assets.map((a) => ({
    name: a.asset,
    value: a.usdValue,
    percentage: portfolio.totalBalance > 0
      ? ((a.usdValue / portfolio.totalBalance) * 100).toFixed(1)
      : '0.0'
  }));

  const barData = portfolio.positions.map((p) => ({
    symbol: p.symbol,
    pnl: p.unrealizedPnl,
    pnlPercent: p.pnlPercent
  }));

  const profitableCount = portfolio.positions.filter((p) => p.unrealizedPnl > 0).length;

  return (
    <div className="min-h-screen bg-[#0a0e17] text-slate-200">
      <div className="max-w-[1400px] mx-auto px-8 py-10">

        {/* ═══════════ HEADER ═══════════ */}
        <header className="flex items-start justify-between mb-10">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-white">
              Portfolio
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {lastUpdated
                ? <>Updated <span className="font-mono">{lastUpdated.toLocaleTimeString()}</span></>
                : 'Loading…'}
            </p>
          </div>

          <button
            onClick={fetchPortfolioData}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium
                       text-slate-300 border border-slate-800
                       hover:border-slate-700 hover:text-white
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors"
          >
            <RefreshCw
              size={14}
              className={loading ? 'animate-spin' : ''}
            />
            Refresh
          </button>
        </header>

        {/* ═══════════ PRIMARY METRICS — divided strip ═══════════ */}
        <section className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-800/60
                            border-y border-slate-800/60 mb-12">
          <div className="px-6 py-6">
            <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2">
              Total Balance
            </div>
            <div className="text-2xl font-semibold font-mono tracking-tight text-white">
              {fmtMoney(portfolio.totalBalance)}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {portfolio.assets.length} asset{portfolio.assets.length !== 1 ? 's' : ''}
            </div>
          </div>

          <div className="px-6 py-6">
            <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2">
              Unrealized P&L
            </div>
            <div className={`text-2xl font-semibold font-mono tracking-tight ${
              portfolio.totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {portfolio.totalPnL >= 0 ? '+' : ''}{fmtMoney(portfolio.totalPnL)}
            </div>
            <div className={`text-xs mt-1 font-mono ${
              portfolio.totalPnLPercent >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'
            }`}>
              {fmtPct(portfolio.totalPnLPercent)}
            </div>
          </div>

          <div className="px-6 py-6">
            <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2">
              Open Positions
            </div>
            <div className="text-2xl font-semibold font-mono tracking-tight text-white">
              {portfolio.positions.length}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {profitableCount} in profit
            </div>
          </div>
        </section>

        {/* ═══════════ CHARTS ═══════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-12">

          {/* Allocation */}
          <section>
            <div className="flex items-baseline justify-between mb-5">
              <h2 className="text-[15px] font-medium text-slate-200">Allocation</h2>
              <span className="text-xs text-slate-500 font-mono">
                {pieData.length} assets
              </span>
            </div>

            {pieData.length > 0 ? (
              <div className="rounded-xl border border-slate-800/80 bg-slate-900/20 p-6">
                <div className="relative">
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={62}
                        outerRadius={96}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="#0a0e17"
                        strokeWidth={2}
                      >
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          border: '1px solid #1e293b',
                          borderRadius: 8,
                          fontSize: 12,
                          padding: '8px 12px'
                        }}
                        formatter={(v, _n, { payload }) => [
                          `${fmtMoney(v)} · ${payload.percentage}%`,
                          payload.name
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>

                  {/* Center total */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">
                      Total
                    </span>
                    <span className="text-base font-semibold font-mono text-white mt-0.5">
                      {fmtMoney(portfolio.totalBalance)}
                    </span>
                  </div>
                </div>

                {/* Legend — plain rows */}
                <div className="mt-6 space-y-2">
                  {pieData.map((entry, i) => (
                    <div key={entry.name} className="flex items-center text-xs">
                      <span
                        className="w-2 h-2 rounded-full mr-3 flex-shrink-0"
                        style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      />
                      <span className="text-slate-300 flex-1 truncate">{entry.name}</span>
                      <span className="text-slate-500 font-mono mr-4">{fmtMoney(entry.value)}</span>
                      <span className="text-slate-400 font-mono w-12 text-right">
                        {entry.percentage}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyBox label="No assets" />
            )}
          </section>

          {/* Position performance */}
          <section>
            <div className="flex items-baseline justify-between mb-5">
              <h2 className="text-[15px] font-medium text-slate-200">Position P&L</h2>
              <span className="text-xs text-slate-500 font-mono">
                {barData.length} open
              </span>
            </div>

            {barData.length > 0 ? (
              <div className="rounded-xl border border-slate-800/80 bg-slate-900/20 p-6">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={barData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="2 4" vertical={false} />
                    <XAxis
                      dataKey="symbol"
                      stroke="#475569"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#475569"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${v}`}
                      width={60}
                    />
                    <Tooltip
                      cursor={{ fill: '#1e293b', opacity: 0.3 }}
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        border: '1px solid #1e293b',
                        borderRadius: 8,
                        fontSize: 12,
                        padding: '8px 12px'
                      }}
                      formatter={(v, _n, { payload }) => [
                        `${v >= 0 ? '+' : ''}${fmtMoney(v)} · ${fmtPct(payload.pnlPercent)}`,
                        payload.symbol
                      ]}
                    />
                    <Bar dataKey="pnl" radius={[4, 4, 0, 0]} maxBarSize={48}>
                      {barData.map((entry, i) => (
                        <BarCell
                          key={i}
                          fill={entry.pnl >= 0 ? '#10b981' : '#f43f5e'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyBox label="No open positions" />
            )}
          </section>
        </div>

        {/* ═══════════ ASSETS TABLE ═══════════ */}
        <section className="mb-12">
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="text-[15px] font-medium text-slate-200">Assets</h2>
            <span className="text-xs text-slate-500 font-mono">
              {portfolio.assets.length} total
            </span>
          </div>

          {portfolio.assets.length > 0 ? (
            <div className="rounded-xl border border-slate-800/80 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900/40 text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="text-left  font-medium px-5 py-3">Asset</th>
                    <th className="text-right font-medium px-5 py-3">Balance</th>
                    <th className="text-right font-medium px-5 py-3">USD Value</th>
                    <th className="text-right font-medium px-5 py-3">Price</th>
                    <th className="text-right font-medium px-5 py-3">24h</th>
                    <th className="text-right font-medium px-5 py-3">Allocation</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.assets.map((a) => {
                    const alloc = portfolio.totalBalance > 0
                      ? (a.usdValue / portfolio.totalBalance) * 100
                      : 0;
                    return (
                      <tr
                        key={a.asset}
                        className="border-t border-slate-800/40 hover:bg-slate-800/20 transition-colors"
                      >
                        <td className="px-5 py-3.5 font-medium text-slate-200">{a.asset}</td>
                        <td className="px-5 py-3.5 text-right font-mono text-slate-300">{a.balance}</td>
                        <td className="px-5 py-3.5 text-right font-mono text-white">{fmtMoney(a.usdValue)}</td>
                        <td className="px-5 py-3.5 text-right font-mono text-slate-400">{fmtMoney(a.price)}</td>
                        <td className={`px-5 py-3.5 text-right font-mono ${
                          a.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {fmtPct(a.change24h)}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-3">
                            <div className="w-20 h-1 rounded-full bg-slate-800 overflow-hidden">
                              <div
                                className="h-full bg-indigo-500"
                                style={{ width: `${Math.min(alloc, 100)}%` }}
                              />
                            </div>
                            <span className="font-mono text-xs text-slate-400 w-11 text-right">
                              {alloc.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyBox label="No assets" />
          )}
        </section>

        {/* ═══════════ POSITIONS TABLE ═══════════ */}
        <section>
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="text-[15px] font-medium text-slate-200">Open Positions</h2>
            <span className="text-xs text-slate-500 font-mono">
              {portfolio.positions.length} total
            </span>
          </div>

          {portfolio.positions.length > 0 ? (
            <div className="rounded-xl border border-slate-800/80 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900/40 text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="text-left  font-medium px-5 py-3">Symbol</th>
                    <th className="text-left  font-medium px-5 py-3">Side</th>
                    <th className="text-right font-medium px-5 py-3">Size</th>
                    <th className="text-right font-medium px-5 py-3">Entry</th>
                    <th className="text-right font-medium px-5 py-3">Mark</th>
                    <th className="text-right font-medium px-5 py-3">Unrealized</th>
                    <th className="text-right font-medium px-5 py-3">Return</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.positions.map((p, i) => {
                    const isLong = p.side === 'long' || p.side === 'BUY' || p.side === 'buy';
                    const up = p.unrealizedPnl >= 0;
                    return (
                      <tr
                        key={`${p.symbol}-${i}`}
                        className="border-t border-slate-800/40 hover:bg-slate-800/20 transition-colors"
                      >
                        <td className="px-5 py-3.5 font-medium text-slate-200">{p.symbol}</td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                            isLong ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            {isLong ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                            {String(p.side).toUpperCase()}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-slate-300">{p.size}</td>
                        <td className="px-5 py-3.5 text-right font-mono text-slate-400">
                          {fmtMoney(p.entryPrice)}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-slate-300">
                          {fmtMoney(p.markPrice)}
                        </td>
                        <td className={`px-5 py-3.5 text-right font-mono font-medium ${
                          up ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {up ? '+' : ''}{fmtMoney(p.unrealizedPnl)}
                        </td>
                        <td className={`px-5 py-3.5 text-right font-mono text-xs ${
                          up ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {fmtPct(p.pnlPercent)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyBox label="No open positions" />
          )}
        </section>

      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   EMPTY BOX
   ═══════════════════════════════════════════════════════════════ */
const EmptyBox = ({ label }) => (
  <div className="border border-dashed border-slate-800 rounded-xl py-16 text-center">
    <p className="text-slate-500 text-sm">{label}</p>
  </div>
);

export default Portfolio;