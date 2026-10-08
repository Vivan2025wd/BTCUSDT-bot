import React, { useState, useEffect } from 'react';
import { Play, Pause, Square, BarChart3, Settings, Calendar } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const Backtesting = () => {
  const [backtestConfig, setBacktestConfig] = useState({
    symbol: 'BTCUSDT',
    strategy: 'EMA',
    timeframe: '1h',
    startDate: '2023-01-01',
    endDate: '2024-01-01',
    initialBalance: 10000,
    commission: 0.1
  });

  const [backtestResults, setBacktestResults] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const runBacktest = async () => {
    setIsRunning(true);
    setProgress(0);
    
    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 500);

      const results = await window.electronAPI.runBacktest(backtestConfig);
      
      clearInterval(progressInterval);
      setProgress(100);
      setBacktestResults(results);
    } catch (error) {
      console.error('Backtest failed:', error);
      alert('Backtest failed: ' + error.message);
    }
    
    setIsRunning(false);
  };

  const stopBacktest = async () => {
    try {
      await window.electronAPI.stopBacktest();
      setIsRunning(false);
      setProgress(0);
    } catch (error) {
      console.error('Failed to stop backtest:', error);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatPercent = (value) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  return (
    <div className="p-6 bg-gray-900 text-white min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold flex items-center">
            <BarChart3 className="mr-3" />
            Strategy Backtesting
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Configuration Panel */}
          <div className="lg:col-span-1">
            <div className="bg-gray-800 p-6 rounded-lg">
              <div className="flex items-center mb-4">
                <Settings className="mr-2" size={20} />
                <h2 className="text-xl font-semibold">Configuration</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Symbol</label>
                  <select
                    value={backtestConfig.symbol}
                    onChange={(e) => setBacktestConfig({...backtestConfig, symbol: e.target.value})}
                    className="w-full p-3 bg-gray-700 rounded border border-gray-600 focus:border-blue-400"
                    disabled={isRunning}
                  >
                    <option value="BTCUSDT">BTC/USDT</option>
                    <option value="ETHUSDT">ETH/USDT</option>
                    <option value="ADAUSDT">ADA/USDT</option>
                    <option value="DOGEUSDT">DOGE/USDT</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Strategy</label>
                  <select
                    value={backtestConfig.strategy}
                    onChange={(e) => setBacktestConfig({...backtestConfig, strategy: e.target.value})}
                    className="w-full p-3 bg-gray-700 rounded border border-gray-600 focus:border-blue-400"
                    disabled={isRunning}
                  >
                    <option value="EMA">EMA Crossover</option>
                    <option value="RSI">RSI Strategy</option>
                    <option value="COMBINED">Combined Strategy</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Timeframe</label>
                  <select
                    value={backtestConfig.timeframe}
                    onChange={(e) => setBacktestConfig({...backtestConfig, timeframe: e.target.value})}
                    className="w-full p-3 bg-gray-700 rounded border border-gray-600 focus:border-blue-400"
                    disabled={isRunning}
                  >
                    <option value="5m">5 Minutes</option>
                    <option value="15m">15 Minutes</option>
                    <option value="1h">1 Hour</option>
                    <option value="4h">4 Hours</option>
                    <option value="1d">1 Day</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Start Date</label>
                  <input
                    type="date"
                    value={backtestConfig.startDate}
                    onChange={(e) => setBacktestConfig({...backtestConfig, startDate: e.target.value})}
                    className="w-full p-3 bg-gray-700 rounded border border-gray-600 focus:border-blue-400"
                    disabled={isRunning}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">End Date</label>
                  <input
                    type="date"
                    value={backtestConfig.endDate}
                    onChange={(e) => setBacktestConfig({...backtestConfig, endDate: e.target.value})}
                    className="w-full p-3 bg-gray-700 rounded border border-gray-600 focus:border-blue-400"
                    disabled={isRunning}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Initial Balance ($)</label>
                  <input
                    type="number"
                    value={backtestConfig.initialBalance}
                    onChange={(e) => setBacktestConfig({...backtestConfig, initialBalance: parseFloat(e.target.value)})}
                    className="w-full p-3 bg-gray-700 rounded border border-gray-600 focus:border-blue-400"
                    disabled={isRunning}
                    min="1000"
                    step="1000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Commission (%)</label>
                  <input
                    type="number"
                    value={backtestConfig.commission}
                    onChange={(e) => setBacktestConfig({...backtestConfig, commission: parseFloat(e.target.value)})}
                    className="w-full p-3 bg-gray-700 rounded border border-gray-600 focus:border-blue-400"
                    disabled={isRunning}
                    min="0"
                    max="1"
                    step="0.01"
                  />
                </div>

                <div className="pt-4">
                  {!isRunning ? (
                    <button
                      onClick={runBacktest}
                      className="w-full flex items-center justify-center px-4 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors"
                    >
                      <Play className="mr-2" size={20} />
                      Run Backtest
                    </button>
                  ) : (
                    <button
                      onClick={stopBacktest}
                      className="w-full flex items-center justify-center px-4 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors"
                    >
                      <Square className="mr-2" size={20} />
                      Stop Backtest
                    </button>
                  )}
                </div>

                {isRunning && (
                  <div className="pt-2">
                    <div className="flex justify-between text-sm text-gray-400 mb-1">
                      <span>Progress</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Results Panel */}
          <div className="lg:col-span-2">
            {backtestResults ? (
              <div className="space-y-6">
                {/* Performance Metrics */}
                <div className="bg-gray-800 p-6 rounded-lg">
                  <h2 className="text-xl font-semibold mb-4">Performance Metrics</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-400">
                        {formatPercent(backtestResults.totalReturn)}
                      </div>
                      <div className="text-sm text-gray-400">Total Return</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-400">
                        {backtestResults.totalTrades}
                      </div>
                      <div className="text-sm text-gray-400">Total Trades</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-yellow-400">
                        {formatPercent(backtestResults.winRate)}
                      </div>
                      <div className="text-sm text-gray-400">Win Rate</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-400">
                        {backtestResults.sharpeRatio?.toFixed(2) || 'N/A'}
                      </div>
                      <div className="text-sm text-gray-400">Sharpe Ratio</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-400">
                        {formatPercent(backtestResults.maxDrawdown)}
                      </div>
                      <div className="text-sm text-gray-400">Max Drawdown</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-400">
                        {formatCurrency(backtestResults.avgWin)}
                      </div>
                      <div className="text-sm text-gray-400">Avg Win</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-400">
                        {formatCurrency(Math.abs(backtestResults.avgLoss))}
                      </div>
                      <div className="text-sm text-gray-400">Avg Loss</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-400">
                        {backtestResults.profitFactor?.toFixed(2) || 'N/A'}
                      </div>
                      <div className="text-sm text-gray-400">Profit Factor</div>
                    </div>
                  </div>
                </div>

                {/* Equity Curve */}
                <div className="bg-gray-800 p-6 rounded-lg">
                  <h2 className="text-xl font-semibold mb-4">Equity Curve</h2>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={backtestResults.equityCurve}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis 
                        dataKey="date" 
                        stroke="#9CA3AF"
                        fontSize={12}
                      />
                      <YAxis 
                        stroke="#9CA3AF"
                        fontSize={12}
                        tickFormatter={formatCurrency}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1F2937', 
                          border: '1px solid #374151',
                          borderRadius: '6px'
                        }}
                        labelStyle={{ color: '#F3F4F6' }}
                        formatter={(value, name) => [formatCurrency(value), 'Portfolio Value']}
                      />
                      <Legend />
                      
                      <Line 
                        type="monotone" 
                        dataKey="balance" 
                        stroke="#10B981" 
                        strokeWidth={2}
                        dot={false}
                        name="Portfolio Value"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Trade Analysis */}
                <div className="bg-gray-800 p-6 rounded-lg">
                  <h2 className="text-xl font-semibold mb-4">Trade Analysis</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-700">
                        <tr>
                          <th className="px-4 py-2 text-left">Date</th>
                          <th className="px-4 py-2 text-left">Side</th>
                          <th className="px-4 py-2 text-right">Entry</th>
                          <th className="px-4 py-2 text-right">Exit</th>
                          <th className="px-4 py-2 text-right">P&L</th>
                          <th className="px-4 py-2 text-right">Return %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backtestResults.trades.slice(-10).map((trade, index) => (
                          <tr key={index} className="border-t border-gray-700">
                            <td className="px-4 py-2 text-sm">
                              {new Date(trade.entryTime).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-2">
                              <span className={`px-2 py-1 rounded text-xs ${
                                trade.side === 'buy' 
                                  ? 'bg-green-900 text-green-400'
                                  : 'bg-red-900 text-red-400'
                              }`}>
                                {trade.side.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right font-mono">
                              {formatCurrency(trade.entryPrice)}
                            </td>
                            <td className="px-4 py-2 text-right font-mono">
                              {formatCurrency(trade.exitPrice)}
                            </td>
                            <td className={`px-4 py-2 text-right font-mono ${
                              trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {formatCurrency(trade.pnl)}
                            </td>
                            <td className={`px-4 py-2 text-right font-mono ${
                              trade.returnPercent >= 0 ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {formatPercent(trade.returnPercent)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-800 p-12 rounded-lg text-center">
                <BarChart3 size={64} className="mx-auto mb-4 text-gray-500" />
                <h2 className="text-xl font-semibold mb-2">No Backtest Results</h2>
                <p className="text-gray-400">
                  Configure your backtest parameters and click "Run Backtest" to see results.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Backtesting;