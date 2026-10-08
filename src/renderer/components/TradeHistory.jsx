import React, { useState, useEffect } from 'react';
import { History, Download, Filter, TrendingUp, TrendingDown } from 'lucide-react';

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
    fetchTrades();
  }, []);

  useEffect(() => {
    applyFilters();
    calculateStats();
  }, [trades, filters]);

  const fetchTrades = async () => {
    try {
      const tradeData = await window.electronAPI.getTrades();
      setTrades(tradeData || []);
    } catch (error) {
      console.error('Failed to fetch trades:', error);
    }
  };

  const applyFilters = () => {
    let filtered = [...trades];

    if (filters.symbol !== 'all') {
      filtered = filtered.filter(trade => trade.symbol === filters.symbol);
    }

    if (filters.type !== 'all') {
      filtered = filtered.filter(trade => trade.side === filters.type);
    }

    if (filters.status !== 'all') {
      filtered = filtered.filter(trade => trade.status === filters.status);
    }

    if (filters.dateFrom) {
      filtered = filtered.filter(trade => 
        new Date(trade.timestamp) >= new Date(filters.dateFrom)
      );
    }

    if (filters.dateTo) {
      filtered = filtered.filter(trade => 
        new Date(trade.timestamp) <= new Date(filters.dateTo)
      );
    }

    setFilteredTrades(filtered);
  };

  const calculateStats = () => {
    const completedTrades = filteredTrades.filter(trade => trade.status === 'closed');
    const winningTrades = completedTrades.filter(trade => trade.pnl > 0);
    const losingTrades = completedTrades.filter(trade => trade.pnl < 0);

    const totalPnL = completedTrades.reduce((sum, trade) => sum + trade.pnl, 0);
    const avgWin = winningTrades.length > 0 
      ? winningTrades.reduce((sum, trade) => sum + trade.pnl, 0) / winningTrades.length 
      : 0;
    const avgLoss = losingTrades.length > 0 
      ? losingTrades.reduce((sum, trade) => sum + trade.pnl, 0) / losingTrades.length 
      : 0;

    setStats({
      totalTrades: completedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      totalPnL,
      winRate: completedTrades.length > 0 ? (winningTrades.length / completedTrades.length) * 100 : 0,
      avgWin,
      avgLoss
    });
  };

  const exportTrades = async () => {
    try {
      await window.electronAPI.exportTrades(filteredTrades);
      alert('Trades exported successfully!');
    } catch (error) {
      console.error('Failed to export trades:', error);
      alert('Failed to export trades');
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4
    }).format(value);
  };

  const formatPercentage = (value) => {
    return `${value.toFixed(2)}%`;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'open': return 'text-blue-400 bg-blue-900';
      case 'closed': return 'text-green-400 bg-green-900';
      case 'cancelled': return 'text-gray-400 bg-gray-700';
      default: return 'text-gray-400 bg-gray-700';
    }
  };

  const getPnLColor = (pnl) => {
    return pnl > 0 ? 'text-green-400' : pnl < 0 ? 'text-red-400' : 'text-gray-400';
  };

  return (
    <div className="p-6 bg-gray-900 text-white min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold flex items-center">
            <History className="mr-3" />
            Trade History
          </h1>
          <button
            onClick={exportTrades}
            className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Download className="mr-2" size={20} />
            Export CSV
          </button>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-400">Total Trades</div>
            <div className="text-2xl font-bold">{stats.totalTrades}</div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-400">Win Rate</div>
            <div className="text-2xl font-bold text-green-400">{formatPercentage(stats.winRate)}</div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-400">Total P&L</div>
            <div className={`text-2xl font-bold ${getPnLColor(stats.totalPnL)}`}>
              {formatCurrency(stats.totalPnL)}
            </div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-400">Winning Trades</div>
            <div className="text-2xl font-bold text-green-400">{stats.winningTrades}</div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-400">Losing Trades</div>
            <div className="text-2xl font-bold text-red-400">{stats.losingTrades}</div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-400">Avg Win</div>
            <div className="text-2xl font-bold text-green-400">{formatCurrency(stats.avgWin)}</div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-sm text-gray-400">Avg Loss</div>
            <div className="text-2xl font-bold text-red-400">{formatCurrency(Math.abs(stats.avgLoss))}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-gray-800 p-6 rounded-lg mb-6">
          <div className="flex items-center mb-4">
            <Filter className="mr-2" size={20} />
            <h2 className="text-xl font-semibold">Filters</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Symbol</label>
              <select
                value={filters.symbol}
                onChange={(e) => setFilters({...filters, symbol: e.target.value})}
                className="w-full p-2 bg-gray-700 border border-gray-600 rounded focus:border-blue-400"
              >
                <option value="all">All Symbols</option>
                <option value="BTCUSDT">BTC/USDT</option>
                <option value="ETHUSDT">ETH/USDT</option>
                <option value="ADAUSDT">ADA/USDT</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Type</label>
              <select
                value={filters.type}
                onChange={(e) => setFilters({...filters, type: e.target.value})}
                className="w-full p-2 bg-gray-700 border border-gray-600 rounded focus:border-blue-400"
              >
                <option value="all">All Types</option>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({...filters, status: e.target.value})}
                className="w-full p-2 bg-gray-700 border border-gray-600 rounded focus:border-blue-400"
              >
                <option value="all">All Status</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">From Date</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
                className="w-full p-2 bg-gray-700 border border-gray-600 rounded focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">To Date</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters({...filters, dateTo: e.target.value})}
                className="w-full p-2 bg-gray-700 border border-gray-600 rounded focus:border-blue-400"
              />
            </div>
          </div>
        </div>

        {/* Trades Table */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left">Date/Time</th>
                  <th className="px-4 py-3 text-left">Symbol</th>
                  <th className="px-4 py-3 text-left">Side</th>
                  <th className="px-4 py-3 text-right">Quantity</th>
                  <th className="px-4 py-3 text-right">Entry Price</th>
                  <th className="px-4 py-3 text-right">Exit Price</th>
                  <th className="px-4 py-3 text-right">P&L</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-left">Strategy</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrades.map((trade, index) => (
                  <tr key={trade.id || index} className="border-t border-gray-700 hover:bg-gray-750">
                    <td className="px-4 py-3 text-sm">
                      {new Date(trade.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-medium">{trade.symbol}</td>
                    <td className="px-4 py-3">
                      <div className={`flex items-center ${
                        trade.side === 'buy' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {trade.side === 'buy' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                        <span className="ml-1 capitalize">{trade.side}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{trade.quantity}</td>
                    <td className="px-4 py-3 text-right font-mono">{formatCurrency(trade.entryPrice)}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {trade.exitPrice ? formatCurrency(trade.exitPrice) : '--'}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-bold ${getPnLColor(trade.pnl)}`}>
                      {trade.pnl !== 0 ? formatCurrency(trade.pnl) : '--'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(trade.status)}`}>
                        {trade.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">{trade.strategy || 'Manual'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {filteredTrades.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <History size={48} className="mx-auto mb-4 opacity-50" />
                <p>No trades found matching your filters.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradeHistory; // <- THIS IS CRUCIAL
