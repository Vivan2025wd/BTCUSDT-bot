// src/renderer/components/Dashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Play, Square, AlertCircle } from 'lucide-react';
import Chart from './Chart';
import Portfolio from './Portfolio';
import TradeHistory from './TradeHistory';

const Dashboard = () => {
  const [botStatus, setBotStatus] = useState({ isRunning: false, positions: [], stats: {} });
  const [balances, setBalances] = useState({ current: 0, start: 0, change: 0, changePercent: 0 });
  const [trades, setTrades] = useState([]);
  const [statusMessages, setStatusMessages] = useState([]);
  const [selectedPair, setSelectedPair] = useState('BTCUSDT');
  const [isLoading, setIsLoading] = useState(true);

  /* ────────── helpers (defined with useCallback so effects get stable refs) ────────── */
  const addStatusMessage = useCallback((message, type = 'info') => {
    setStatusMessages((prev) => [
      { id: Date.now() + Math.random(), message, type, timestamp: new Date() },
      ...prev.slice(0, 99)
    ]);
  }, []);

  const fmtMoney = useCallback((v) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(v || 0), []);

  const handleNewTrade = useCallback((d) => {
    setTrades((prev) => [
      { id: Date.now(), timestamp: new Date(), ...d },
      ...prev.slice(0, 99)
    ]);
    const msg = d.type === 'BUY'
      ? `Bought ${d.pair} @ ${d.position?.entryPrice}`
      : `Sold ${d.pair} · P&L ${fmtMoney(d.pnl)}`;
    addStatusMessage(msg, d.type === 'BUY' ? 'success' : (d.pnl > 0 ? 'success' : 'warning'));
  }, [addStatusMessage, fmtMoney]);

  /* ────────── data fetch ────────── */
  const updateBotStatus = useCallback(async () => {
    try {
      if (window.electronAPI?.getBotStatus) {
        setBotStatus(await window.electronAPI.getBotStatus());
      }
    } catch (err) { console.error(err); }
  }, []);

  const initializeDashboard = useCallback(async () => {
    try {
      if (window.electronAPI) {
        setBotStatus(await window.electronAPI.getBotStatus());
        setTrades((await window.electronAPI.getTradeHistory(50)) || []);
      }
      addStatusMessage('Dashboard initialized', 'info');
    } catch (err) {
      console.error(err);
      addStatusMessage('Failed to initialize dashboard', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [addStatusMessage]);

  /* ────────── bot control ────────── */
  const startBot = useCallback(async () => {
    try {
      if (!window.electronAPI) return;

      // ✅ SIMPLE: just call startBot. Main handles keys, config, everything.
      const res = await window.electronAPI.startBot({});

      if (res?.success) {
        const mode = res.mode === 'live' ? 'LIVE' : 'PAPER';
        addStatusMessage(
          `Bot started · ${mode} mode · ${(res.pairs || []).join(', ')}`,
          res.mode === 'live' ? 'success' : 'warning'
        );
        updateBotStatus();
      } else {
        addStatusMessage(`Failed to start: ${res?.error || 'unknown error'}`, 'error');
      }
    } catch (err) {
      addStatusMessage(`Failed to start: ${err.message}`, 'error');
    }
  }, [addStatusMessage, updateBotStatus]);

  const stopBot = useCallback(async () => {
    try {
      if (!window.electronAPI) return;
      const res = await window.electronAPI.stopBot();
      if (res?.success) {
        addStatusMessage('Bot stopped', 'info');
        setBotStatus((s) => ({ ...s, isRunning: false }));
      } else {
        addStatusMessage(`Failed to stop: ${res?.error || 'unknown'}`, 'error');
      }
    } catch (err) {
      addStatusMessage(`Failed to stop: ${err.message}`, 'error');
    }
  }, [addStatusMessage]);

  const emergencyStop = useCallback(async () => {
    if (!window.confirm('Emergency stop will close all positions immediately. Continue?')) return;
    await stopBot();
    addStatusMessage('Emergency stop executed', 'warning');
  }, [stopBot, addStatusMessage]);

  /* ────────── mount: init + subscribe ────────── */
  useEffect(() => {
    initializeDashboard();
    if (!window.electronAPI) return;

    window.electronAPI.onBotStatus((_, s) => addStatusMessage(s.message, s.type));
    window.electronAPI.onBotTrade((_, t) => handleNewTrade(t));
    window.electronAPI.onBotError((_, e) => addStatusMessage(e, 'error'));
    window.electronAPI.onBalanceUpdate((_, b) => setBalances(b));
    window.electronAPI.onToggleBot((_, start) => (start ? startBot() : stopBot()));
    window.electronAPI.onEmergencyStop(() => emergencyStop());

    return () => {
      if (!window.electronAPI) return;
      ['bot-status', 'bot-trade', 'bot-error', 'balance-update', 'toggle-bot', 'emergency-stop']
        .forEach((ch) => window.electronAPI.removeAllListeners(ch));
    };
  }, [initializeDashboard, addStatusMessage, handleNewTrade, startBot, stopBot, emergencyStop]);

  /* ────────── polling ────────── */
  useEffect(() => {
    const id = setInterval(() => {
      if (botStatus.isRunning) updateBotStatus();
    }, 5000);
    return () => clearInterval(id);
  }, [botStatus.isRunning, updateBotStatus]);

  /* ────────── formatters ────────── */
  const fmtPct = (v) => {
    const n = v || 0;
    return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
  };

  /* ────────── loading screen ────────── */
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0e17]">
        <div className="text-center">
          <div className="w-8 h-8 mx-auto mb-3 rounded-full border-2 border-slate-800 border-t-indigo-500 animate-spin" />
          <p className="text-xs text-slate-500">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  const stats = botStatus.stats || {};
  const totalPnL = stats.totalPnL || 0;
  const pnlUp = totalPnL >= 0;

  return (
    <div className="h-full flex flex-col bg-[#0a0e17] text-slate-200 overflow-hidden">

      {/* ═══════════════ HEADER ═══════════════ */}
      <header className="flex-shrink-0 h-14 px-6 border-b border-slate-800/60
                         flex items-center justify-between gap-6">
        <div className="flex items-center gap-5 min-w-0">
          <h1 className="text-sm font-semibold tracking-tight text-white whitespace-nowrap">
            Privacy Trading Bot
          </h1>

          <div className="flex items-center gap-2 text-xs">
            <span className="relative flex h-1.5 w-1.5">
              {botStatus.isRunning && (
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
              )}
              <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                botStatus.isRunning ? 'bg-emerald-400' : 'bg-slate-600'
              }`} />
            </span>
            <span className={`font-medium ${
              botStatus.isRunning ? 'text-emerald-400' : 'text-slate-500'
            }`}>
              {botStatus.isRunning ? 'Active' : 'Stopped'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-slate-600">Balance</div>
            <div className="text-sm font-mono font-medium text-white leading-tight mt-0.5">
              {fmtMoney(balances.current)}
              <span className={`ml-2 text-[11px] ${
                balances.change >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {fmtPct(balances.changePercent)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={botStatus.isRunning ? stopBot : startBot}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium
                          transition-colors ${
                botStatus.isRunning
                  ? 'bg-rose-500/90 hover:bg-rose-500 text-white'
                  : 'bg-emerald-500/90 hover:bg-emerald-500 text-white'
              }`}
            >
              {botStatus.isRunning ? <Square size={12} /> : <Play size={12} />}
              {botStatus.isRunning ? 'Stop' : 'Start'}
            </button>

            <button
              onClick={emergencyStop}
              title="Emergency stop"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
                         text-slate-400 hover:text-amber-400 hover:bg-amber-500/10
                         border border-slate-800 hover:border-amber-500/30
                         transition-colors"
            >
              <AlertCircle size={12} />
              <span className="hidden md:inline">Emergency</span>
            </button>
          </div>
        </div>
      </header>

      {/* ═══════════════ METRICS STRIP ═══════════════ */}
      <div className="flex-shrink-0 border-b border-slate-800/60
                      grid grid-cols-3 md:grid-cols-5 divide-x divide-slate-800/60">
        <Metric
          label="Total P&L"
          value={`${pnlUp ? '+' : ''}${fmtMoney(totalPnL)}`}
          tone={pnlUp ? 'up' : 'down'}
        />
        <Metric
          label="ROI"
          value={fmtPct(stats.roi || 0)}
          tone={(stats.roi || 0) >= 0 ? 'up' : 'down'}
        />
        <Metric
          label="Win Rate"
          value={`${(stats.winRate || 0).toFixed(1)}%`}
          tone={(stats.winRate || 0) >= 50 ? 'up' : 'neutral'}
        />
        <Metric label="Trades" value={stats.totalTrades || 0} tone="neutral" />
        <Metric
          label="Open"
          value={stats.openPositions ?? botStatus.positions.length ?? 0}
          tone="neutral"
        />
      </div>

      {/* ═══════════════ BODY ═══════════════ */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Main — chart */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex-shrink-0 px-6 py-2.5 border-b border-slate-800/60 flex items-center gap-4">
            <span className="text-[10px] uppercase tracking-wider text-slate-600">Pair</span>
            <div className="flex items-center gap-1">
              {['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].map((pair) => {
                const active = selectedPair === pair;
                return (
                  <button
                    key={pair}
                    onClick={() => setSelectedPair(pair)}
                    className={`px-3 py-1 rounded-md text-xs font-mono transition-colors ${
                      active
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                    }`}
                  >
                    {pair.replace('USDT', '/USDT')}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <Chart
              symbol={selectedPair}
              isRunning={botStatus.isRunning}
              onSymbolChange={setSelectedPair}
            />
          </div>
        </main>

        {/* Sidebar */}
        <aside className="w-[340px] flex-shrink-0 border-l border-slate-800/60 flex flex-col overflow-hidden">

          <section className="flex-1 flex flex-col overflow-hidden border-b border-slate-800/60 min-h-0">
            <div className="flex-shrink-0 px-5 py-3.5 flex items-center justify-between">
              <h3 className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                Open Positions
              </h3>
              <span className="text-[11px] font-mono text-slate-600">
                {botStatus.positions.length}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-4">
              {botStatus.positions.length === 0 ? (
                <p className="text-xs text-slate-600 py-6 text-center">No open positions</p>
              ) : (
                <div className="space-y-2">
                  {botStatus.positions.map((p, i) => {
                    const isLong = p.side === 'BUY';
                    const up = (p.unrealizedPnL || 0) >= 0;
                    return (
                      <div key={i} className="rounded-md border border-slate-800/60 bg-slate-900/20 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-slate-200">{p.pair}</span>
                          <span className={`text-[11px] font-medium ${
                            isLong ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            {p.side}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-y-1 text-[11px]">
                          <span className="text-slate-500">Entry</span>
                          <span className="text-right font-mono text-slate-300">
                            ${p.entryPrice?.toFixed(4)}
                          </span>
                          <span className="text-slate-500">Qty</span>
                          <span className="text-right font-mono text-slate-300">
                            {p.quantity?.toFixed(6)}
                          </span>
                          <span className="text-slate-500">Unrealized</span>
                          <span className={`text-right font-mono font-medium ${
                            up ? 'text-emerald-400' : 'text-rose-400'
                          }`}>
                            {up ? '+' : ''}{fmtMoney(p.unrealizedPnL || 0)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex-shrink-0 px-5 py-3.5 flex items-center justify-between">
              <h3 className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                Activity
              </h3>
              <span className="text-[11px] font-mono text-slate-600">
                {statusMessages.length}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-4">
              {statusMessages.length === 0 ? (
                <p className="text-xs text-slate-600 py-6 text-center">No activity yet</p>
              ) : (
                <ul className="space-y-1.5">
                  {statusMessages.slice(0, 30).map((msg) => {
                    const dot = {
                      success: 'bg-emerald-500',
                      error: 'bg-rose-500',
                      warning: 'bg-amber-500',
                      info: 'bg-slate-600'
                    }[msg.type] || 'bg-slate-600';

                    return (
                      <li key={msg.id} className="flex items-start gap-2.5 py-1.5 text-xs">
                        <span className={`mt-1.5 w-1 h-1 rounded-full flex-shrink-0 ${dot}`} />
                        <span className="flex-1 text-slate-400 leading-snug">{msg.message}</span>
                        <span className="text-[10px] font-mono text-slate-600 flex-shrink-0">
                          {msg.timestamp.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};

const Metric = ({ label, value, tone = 'neutral' }) => {
  const toneClass = {
    up: 'text-emerald-400',
    down: 'text-rose-400',
    neutral: 'text-white'
  }[tone];

  return (
    <div className="px-6 py-3.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-1">{label}</div>
      <div className={`text-lg font-mono font-medium tracking-tight ${toneClass}`}>{value}</div>
    </div>
  );
};

export default Dashboard;