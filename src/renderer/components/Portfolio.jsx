import React, { useState, useEffect } from 'react';
import { Wallet, TrendingUp, TrendingDown, PieChart as PieChartIcon, RefreshCw } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

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
    const interval = setInterval(fetchPortfolioData, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchPortfolioData = async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getPortfolio();
      setPortfolio(data);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch portfolio:', error);
    }
    setLoading(false);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4
    }).format(value);
  };

  const formatPercent = (value) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const getPnLColor = (value) => {
    return value > 0 ? 'text-green-400' : value < 0 ? 'text-red-400' : 'text-gray-400';
  };

  const COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4', '#84CC16'];

  const pieChartData = portfolio.assets.map(asset => ({
    name: asset.asset,
    value: asset.usdValue,
    percentage: ((asset.usdValue / portfolio.totalBalance) * 100).toFixed(1)
  }));

  const performanceData = portfolio.positions.map(position => ({
    symbol: position.symbol,
    pnl: position.unrealizedPnl,
    pnlPercent: position.pnlPercent
  }));

  return (
    <div className="p-6 bg-gray-900 text-white min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center">
            <Wallet className="mr-3" size={32} />
            <div>
              <h1 className="text-3xl font-bold">Portfolio</h1>
              <p className="text-gray-400">
                Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Never'}
              </p>
            </div>
          </div>
          <button
            onClick={fetchPortfolioData}
            disabled={loading}
            className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
          >
            <RefreshCw className={`mr-2 ${loading ? 'animate-spin' : ''}`} size={20} />
            Refresh
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gray-800 p-6 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Total Balance</p>
                <p className="text-3xl font-bold">{formatCurrency(portfolio.totalBalance)}</p>
              </div>
              <Wallet className="text-blue-400" size={32} />
            </div>
          </div>

          <div className="bg-gray-800 p-6 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Total P&L</p>
                <p className={`text-3xl font-bold ${getPnLColor(portfolio.totalPnL)}`}>
                  {formatCurrency(portfolio.totalPnL)}
                </p>
                <p className={`text-sm ${getPnLColor(portfolio.totalPnLPercent)}`}>
                  {formatPercent(portfolio.totalPnLPercent)}
                </p>
              </div>
              {portfolio.totalPnL >= 0 ? (
                <TrendingUp className="text-green-400" size={32} />
              ) : (
                <TrendingDown className="text-red-400" size={32} />
              )}
            </div>
          </div>

          <div className="bg-gray-800 p-6 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Active Positions</p>
                <p className="text-3xl font-bold">{portfolio.positions.length}</p>
                <p className="text-sm text-gray-400">
                  {portfolio.positions.filter(p => p.unrealizedPnl > 0).length} profitable
                </p>
              </div>
              <PieChartIcon className="text-purple-400" size={32} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Asset Allocation */}
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Asset Allocation</h2>
            {pieChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                    label={({name, percentage}) => `${name} ${percentage}%`}
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <PieChartIcon size={48} className="mx-auto mb-4 opacity-50" />
                <p>No assets to display</p>
              </div>
            )}
          </div>

          {/* Position Performance */}
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Position Performance</h2>
            {performanceData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={performanceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="symbol" stroke="#9CA3AF" fontSize={12} />
                  <YAxis stroke="#9CA3AF" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1F2937',
                      border: '1px solid #374151',
                      borderRadius: '6px'
                    }}
                    formatter={(value, name) => [
                      name === 'pnl' ? formatCurrency(value) : formatPercent(value),
                      name === 'pnl' ? 'P&L' : 'P&L %'
                    ]}
                  />
                  <Bar
                    dataKey="pnl"
                    fill="#3B82F6"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <TrendingUp size={48} className="mx-auto mb-4 opacity-50" />
                <p>No positions to display</p>
              </div>
            )}
          </div>
        </div>

        {/* Assets Table */}
        <div className="bg-gray-800 rounded-lg mb-6">
          <div className="p-6 border-b border-gray-700">
            <h2 className="text-xl font-semibold">Assets</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left">Asset</th>
                  <th className="px-6 py-3 text-right">Balance</th>
                  <th className="px-6 py-3 text-right">USD Value</th>
                  <th className="px-6 py-3 text-right">Price</th>
                  <th className="px-6 py-3 text-right">24h Change</th>
                  <th className="px-6 py-3 text-right">Allocation</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.assets.map((asset, index) => (
                  <tr key={asset.asset} className="border-t border-gray-700 hover:bg-gray-750">
                    <td className="px-6 py-4 font-medium">{asset.asset}</td>
                    <td className="px-6 py-4 text-right font-mono">{asset.balance}</td>
                    <td className="px-6 py-4 text-right font-mono">{formatCurrency(asset.usdValue)}</td>
                    <td className="px-6 py-4 text-right font-mono">{formatCurrency(asset.price)}</td>
                    <td className={`px-6 py-4 text-right font-mono ${getPnLColor(asset.change24h)}`}>
                      {formatPercent(asset.change24h)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {((asset.usdValue / portfolio.totalBalance) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {portfolio.assets.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <Wallet size={48} className="mx-auto mb-4 opacity-50" />
                <p>No assets found in portfolio.</p>
              </div>
            )}
          </div>
        </div>

        {/* Open Positions Table */}
        <div className="bg-gray-800 rounded-lg">
          <div className="p-6 border-b border-gray-700">
            <h2 className="text-xl font-semibold">Open Positions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left">Symbol</th>
                  <th className="px-6 py-3 text-left">Side</th>
                  <th className="px-6 py-3 text-right">Size</th>
                  <th className="px-6 py-3 text-right">Entry Price</th>
                  <th className="px-6 py-3 text-right">Mark Price</th>
                  <th className="px-6 py-3 text-right">Unrealized P&L</th>
                  <th className="px-6 py-3 text-right">ROE %</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.positions.map((position, index) => (
                  <tr key={`${position.symbol}-${index}`} className="border-t border-gray-700 hover:bg-gray-750">
                    <td className="px-6 py-4 font-medium">{position.symbol}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        position.side === 'long' 
                          ? 'bg-green-900 text-green-400' 
                          : 'bg-red-900 text-red-400'
                      }`}>
                        {position.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-mono">{position.size}</td>
                    <td className="px-6 py-4 text-right font-mono">{formatCurrency(position.entryPrice)}</td>
                    <td className="px-6 py-4 text-right font-mono">{formatCurrency(position.markPrice)}</td>
                    <td className={`px-6 py-4 text-right font-mono font-bold ${getPnLColor(position.unrealizedPnl)}`}>
                      {formatCurrency(position.unrealizedPnl)}
                    </td>
                    <td className={`px-6 py-4 text-right font-mono font-bold ${getPnLColor(position.pnlPercent)}`}>
                      {formatPercent(position.pnlPercent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {portfolio.positions.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <TrendingUp size={48} className="mx-auto mb-4 opacity-50" />
                <p>No open positions.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Portfolio;
