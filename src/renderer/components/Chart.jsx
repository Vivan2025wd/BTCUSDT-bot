// src/renderer/components/Chart.jsx
import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import {
  TrendingUp, TrendingDown, Activity, RefreshCw,
  CandlestickChart, BarChart3, Waves, Radio
} from 'lucide-react';

const Chart = ({ symbol, isRunning, onSymbolChange }) => {
  const [priceData, setPriceData] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState(symbol || 'BTCUSDT');
  const [timeframe, setTimeframe] = useState('5m');
  const [indicators, setIndicators] = useState({
    ema: true,
    rsi: false,
    volume: false
  });
  const [currentPrice, setCurrentPrice] = useState(null);
  const [priceChange, setPriceChange] = useState({ value: 0, percentage: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  // ✅ Sync when parent changes symbol
  useEffect(() => {
    if (symbol && symbol !== selectedSymbol) {
      setSelectedSymbol(symbol);
    }
  }, [symbol]);

  // ✅ Fetch price data
  useEffect(() => {
    fetchPriceData();
    const interval = setInterval(fetchPriceData, 5000);
    return () => clearInterval(interval);
  }, [selectedSymbol, timeframe]);

  // ✅ Notify parent when user changes the symbol here
  const handleSymbolChange = (value) => {
    setSelectedSymbol(value);
    onSymbolChange?.(value);
  };

  const fetchPriceData = async () => {
    try {
      const data = await window.electronAPI?.getPriceData?.(
        selectedSymbol,
        timeframe,
        100
      );

      if (data && data.length > 0) {
        const processed = data.map((item) => ({
          time: new Date(item.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          }),
          fullTime: new Date(item.timestamp).toLocaleString(),
          price: parseFloat(item.close),
          ema: item.ema || null,
          rsi: item.rsi || null,
          volume: parseFloat(item.volume)
        }));

        setPriceData(processed);
        setLastUpdate(new Date());

        const latest = processed[processed.length - 1];
        const previous = processed[processed.length - 2];
        if (latest && previous) {
          setCurrentPrice(latest.price);
          const change = latest.price - previous.price;
          const changePercent = (change / previous.price) * 100;
          setPriceChange({ value: change, percentage: changePercent });
        }
      }
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch price data:', error);
      setIsLoading(false);
    }
  };

  const formatPrice = (value) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 8
    }).format(value || 0);

  const formatPriceShort = (value) => {
    if (value == null) return '—';
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
    if (value >= 1)    return `$${value.toFixed(2)}`;
    return `$${value.toFixed(4)}`;
  };

  const formatVolume = (value) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000)    return `${(value / 1000).toFixed(2)}K`;
    return (value || 0).toFixed(2);
  };

  const isUp = priceChange.value >= 0;
  const priceColor = isUp ? '#10b981' : '#ef4444';

  /* ─── Tooltip ─── */
  const ChartTooltip = ({ active, payload, valueFormatter }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-[#0f172a] border border-slate-800 rounded-lg px-3 py-2 shadow-2xl">
        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 font-medium">
          {payload[0]?.payload?.fullTime}
        </p>
        <div className="space-y-1">
          {payload.map((entry, i) => (
            <div key={i} className="flex items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-slate-400">{entry.name}</span>
              </div>
              <span className="font-mono text-slate-100 font-medium">
                {valueFormatter ? valueFormatter(entry.value, entry.name) : entry.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  /* ─── Indicator config ─── */
  const indicatorConfig = [
    { key: 'ema',    label: 'EMA',    color: 'amber',  icon: Waves },
    { key: 'rsi',    label: 'RSI',    color: 'violet', icon: Activity },
    { key: 'volume', label: 'Volume', color: 'blue',   icon: BarChart3 }
  ];

  const indicatorColorMap = {
    amber:  { on: 'bg-amber-500/15 text-amber-400 ring-amber-500/30',    dot: 'bg-amber-400' },
    violet: { on: 'bg-violet-500/15 text-violet-400 ring-violet-500/30', dot: 'bg-violet-400' },
    blue:   { on: 'bg-blue-500/15 text-blue-400 ring-blue-500/30',       dot: 'bg-blue-400' }
  };

  return (
    <div className="w-full text-slate-200">

      {/* ═══════════════ HEADER / TICKER ═══════════════ */}
      <div className="bg-[#111827]/60 backdrop-blur-sm rounded-xl border border-slate-800/60 overflow-hidden mb-4">
        <div className="p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">

          <div className="flex items-start gap-5">
            <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/10 to-blue-500/10 ring-1 ring-emerald-500/20">
              <Activity size={28} className="text-emerald-400" />
            </div>

            <div>
              <div className="flex items-center gap-2.5 mb-1.5">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  {selectedSymbol.replace('USDT', '')}
                  <span className="text-slate-500 font-normal">/USDT</span>
                </h1>
                <span className="text-[10px] uppercase tracking-wider font-medium px-2 py-0.5 rounded
                                 bg-slate-800/80 text-slate-400 ring-1 ring-slate-700/60">
                  {timeframe}
                </span>
              </div>

              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-semibold font-mono tracking-tight text-white leading-none">
                  {currentPrice ? formatPrice(currentPrice) : '—'}
                </span>

                <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium font-mono ring-1 ${
                  isUp
                    ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-400 ring-rose-500/20'
                }`}>
                  {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  <span>
                    {isUp ? '+' : ''}{priceChange.value.toFixed(4)}
                  </span>
                  <span className="opacity-70">
                    ({isUp ? '+' : ''}{priceChange.percentage.toFixed(2)}%)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-1.5 w-1.5">
                    {isRunning && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    )}
                    <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                      isRunning ? 'bg-emerald-400' : 'bg-slate-600'
                    }`} />
                  </span>
                  <span className="uppercase tracking-wider font-medium">
                    {isRunning ? 'Live' : 'Idle'}
                  </span>
                </div>
                {lastUpdate && (
                  <>
                    <span className="text-slate-700">•</span>
                    <span className="font-mono">
                      Updated {lastUpdate.toLocaleTimeString()}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Symbol selector */}
            <div className="relative">
              <select
                value={selectedSymbol}
                onChange={(e) => handleSymbolChange(e.target.value)}
                className="appearance-none pl-3.5 pr-9 py-2 rounded-lg text-sm font-medium
                           bg-slate-900/60 text-slate-200
                           border border-slate-800/60 hover:border-slate-700
                           focus:border-indigo-500/60 outline-none cursor-pointer transition-all"
              >
                <option value="BTCUSDT">BTC / USDT</option>
                <option value="ETHUSDT">ETH / USDT</option>
                <option value="SOLUSDT">SOL / USDT</option>
                <option value="ADAUSDT">ADA / USDT</option>
                <option value="DOGEUSDT">DOGE / USDT</option>
              </select>
              <CandlestickChart
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
              />
            </div>

            {/* Timeframe segmented control */}
            <div className="flex p-1 rounded-lg bg-slate-900/60 border border-slate-800/60">
              {['1m', '5m', '15m', '1h', '4h', '1d'].map((tf) => {
                const active = timeframe === tf;
                return (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium font-mono uppercase
                                tracking-wide transition-all ${
                      active
                        ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    {tf}
                  </button>
                );
              })}
            </div>

            <button
              onClick={fetchPriceData}
              className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/60
                         text-slate-400 hover:text-slate-200 hover:border-slate-700
                         transition-all group"
              title="Refresh data"
            >
              <RefreshCw size={16} className="group-hover:rotate-180 transition-transform duration-500" />
            </button>
          </div>
        </div>

        {/* Indicator toggles */}
        <div className="px-6 py-3 border-t border-slate-800/60 flex items-center gap-3 bg-slate-900/20">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
            Indicators
          </span>

          <div className="flex flex-wrap gap-2">
            {indicatorConfig.map(({ key, label, color, icon: Icon }) => {
              const active = indicators[key];
              const c = indicatorColorMap[color];
              return (
                <button
                  key={key}
                  onClick={() => setIndicators({ ...indicators, [key]: !active })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                              ring-1 transition-all ${
                    active
                      ? c.on
                      : 'bg-slate-800/40 text-slate-500 ring-slate-700/40 hover:text-slate-300'
                  }`}
                >
                  <Icon size={12} />
                  <span>{label}</span>
                  {active && <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ═══════════════ PRICE CHART ═══════════════ */}
      <div className="bg-[#111827]/60 backdrop-blur-sm rounded-xl border border-slate-800/60 overflow-hidden mb-4">
        <div className="px-6 py-4 border-b border-slate-800/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp size={15} className="text-emerald-400" />
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">
              Price Chart
            </h2>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <LegendDot color="#10b981" label="Price" />
            {indicators.ema && <LegendDot color="#f59e0b" label="EMA" dashed />}
          </div>
        </div>

        <div className="p-6 pt-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-[420px]">
              <div className="text-center">
                <div className="w-8 h-8 mx-auto mb-3 rounded-full border-2 border-slate-800 border-t-indigo-500 animate-spin" />
                <p className="text-xs text-slate-500">Loading chart…</p>
              </div>
            </div>
          ) : priceData.length === 0 ? (
            <ChartEmpty label="No price data available" />
          ) : (
            <ResponsiveContainer width="100%" height={420}>
              <AreaChart data={priceData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={priceColor} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={priceColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="time"
                  stroke="#475569"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#1e293b' }}
                  minTickGap={50}
                />
                <YAxis
                  stroke="#475569"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#1e293b' }}
                  tickFormatter={formatPriceShort}
                  width={70}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      valueFormatter={(v, name) =>
                        name === 'EMA' ? formatPriceShort(v) : formatPrice(v)
                      }
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  name="Price"
                  stroke={priceColor}
                  strokeWidth={2}
                  fill="url(#priceGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: priceColor, stroke: '#0a0e17', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
                {indicators.ema && (
                  <Line
                    type="monotone"
                    dataKey="ema"
                    name="EMA"
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                    dot={false}
                    isAnimationActive={false}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ═══════════════ VOLUME CHART ═══════════════ */}
      {indicators.volume && (
        <div className="bg-[#111827]/60 backdrop-blur-sm rounded-xl border border-slate-800/60 overflow-hidden mb-4">
          <div className="px-6 py-4 border-b border-slate-800/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 size={15} className="text-blue-400" />
              <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">
                Volume
              </h2>
            </div>
            <LegendDot color="#3b82f6" label="Volume" />
          </div>

          <div className="p-6 pt-4">
            {priceData.length === 0 ? (
              <ChartEmpty label="No volume data available" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={priceData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="volGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="time"
                    stroke="#475569"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#1e293b' }}
                    minTickGap={50}
                  />
                  <YAxis
                    stroke="#475569"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#1e293b' }}
                    tickFormatter={formatVolume}
                    width={70}
                  />
                  <Tooltip content={<ChartTooltip valueFormatter={(v) => formatVolume(v)} />} />
                  <Area
                    type="monotone"
                    dataKey="volume"
                    name="Volume"
                    stroke="#3b82f6"
                    strokeWidth={1.5}
                    fill="url(#volGradient)"
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════ RSI CHART ═══════════════ */}
      {indicators.rsi && (
        <div className="bg-[#111827]/60 backdrop-blur-sm rounded-xl border border-slate-800/60 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity size={15} className="text-violet-400" />
              <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">
                RSI
              </h2>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <LegendDot color="#8b5cf6" label="RSI (14)" />
              <LegendDot color="#ef4444" label="70 / 30" dashed />
            </div>
          </div>

          <div className="p-6 pt-4">
            {priceData.length === 0 ? (
              <ChartEmpty label="No RSI data available" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={priceData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="time"
                    stroke="#475569"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#1e293b' }}
                    minTickGap={50}
                  />
                  <YAxis
                    stroke="#475569"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#1e293b' }}
                    domain={[0, 100]}
                    ticks={[0, 30, 50, 70, 100]}
                    width={70}
                  />
                  <Tooltip content={<ChartTooltip valueFormatter={(v) => v?.toFixed(2) || 'N/A'} />} />

                  <ReferenceLine
                    y={70}
                    stroke="#ef4444"
                    strokeDasharray="3 3"
                    strokeOpacity={0.5}
                  />
                  <ReferenceLine
                    y={30}
                    stroke="#ef4444"
                    strokeDasharray="3 3"
                    strokeOpacity={0.5}
                  />
                  <ReferenceLine y={50} stroke="#64748b" strokeDasharray="2 4" strokeOpacity={0.3} />

                  <Line
                    type="monotone"
                    dataKey="rsi"
                    name="RSI"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

const LegendDot = ({ color, label, dashed = false }) => (
  <div className="flex items-center gap-1.5">
    <span
      className="w-3 h-0.5 rounded-full"
      style={{
        backgroundColor: dashed ? 'transparent' : color,
        backgroundImage: dashed
          ? `repeating-linear-gradient(to right, ${color} 0 3px, transparent 3px 6px)`
          : 'none'
      }}
    />
    <span className="text-slate-400">{label}</span>
  </div>
);

const ChartEmpty = ({ label }) => (
  <div className="flex flex-col items-center justify-center h-[220px] text-center">
    <div className="p-4 rounded-xl bg-slate-800/30 ring-1 ring-slate-800/60 mb-3">
      <Radio size={24} className="text-slate-600" />
    </div>
    <p className="text-sm text-slate-500">{label}</p>
    <p className="text-xs text-slate-600 mt-1">
      Start the bot to load market data
    </p>
  </div>
);

export default Chart;