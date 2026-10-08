import React, { useState, useEffect } from 'react';
import { Play, Square, AlertCircle, TrendingUp, TrendingDown, BarChart3, Settings } from 'lucide-react';
import Chart from './Chart';
import Portfolio from './Portfolio';
import TradeHistory from './TradeHistory';

const Dashboard = () => {
  const [botStatus, setBotStatus] = useState({
    isRunning: false,
    positions: [],
    stats: {}
  });
  
  const [balances, setBalances] = useState({
    current: 0,
    start: 0,
    change: 0,
    changePercent: 0
  });
  
  const [trades, setTrades] = useState([]);
  const [statusMessages, setStatusMessages] = useState([]);
  const [selectedPair, setSelectedPair] = useState('BTCUSDT');
  const [prices, setPrices] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Initialize dashboard
    initializeDashboard();
    
    // Setup event listeners
    if (window.electronAPI) {
      // Bot events
      window.electronAPI.onBotStatus((event, status) => {
        addStatusMessage(status.message, status.type);
      });
      
      window.electronAPI.onBotTrade((event, tradeData) => {
        handleNewTrade(tradeData);
      });
      
      window.electronAPI.onBotError((event, error) => {
        addStatusMessage(error, 'error');
      });
      
      window.electronAPI.onBalanceUpdate((event, newBalances) => {
        setBalances(newBalances);
      });
      
      // Menu triggers
      window.electronAPI.onToggleBot((event, shouldStart) => {
        if (shouldStart) {
          startBot();
        } else {
          stopBot();
        }
      });
      
      window.electronAPI.onEmergencyStop(() => {
        emergencyStop();
      });
    }
    
    // Cleanup listeners
    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeAllListeners('bot-status');
        window.electronAPI.removeAllListeners('bot-trade');
        window.electronAPI.removeAllListeners('bot-error');
        window.electronAPI.removeAllListeners('balance-update');
        window.electronAPI.removeAllListeners('toggle-bot');
        window.electronAPI.removeAllListeners('emergency-stop');
      }
    };
  }, []);

  // Periodic updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (botStatus.isRunning) {
        updateBotStatus();
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [botStatus.isRunning]);

  const initializeDashboard = async () => {
    try {
      if (window.electronAPI) {
        // Get initial bot status
        const status = await window.electronAPI.getBotStatus();
        setBotStatus(status);
        
        // Get trade history
        const tradeHistory = await window.electronAPI.getTradeHistory(50);
        setTrades(tradeHistory);
      }
      
      setIsLoading(false);
      addStatusMessage('Dashboard initialized', 'info');
    } catch (error) {
      console.error('Failed to initialize dashboard:', error);
      addStatusMessage('Failed to initialize dashboard', 'error');
      setIsLoading(false);
    }
  };

  const updateBotStatus = async () => {
    try {
      if (window.electronAPI) {
        const status = await window.electronAPI.getBotStatus();
        setBotStatus(status);
      }
    } catch (error) {
      console.error('Failed to update bot status:', error);
    }
  };

  const startBot = async () => {
    try {
      if (window.electronAPI) {
        // Load configuration
        const config = await window.electronAPI.loadConfig();
        
        // Load API keys
        const apiKeys = await window.electronAPI.loadApiKeys();
        if (!apiKeys) {
          addStatusMessage('Please configure API keys first', 'error');
          return;
        }
        
        const fullConfig = { ...config, apiKeys };
        const result = await window.electronAPI.startBot(fullConfig);
        
        if (result.success) {
          addStatusMessage('Bot started successfully', 'success');
          updateBotStatus();
        } else {
          addStatusMessage(`Failed to start bot: ${result.error}`, 'error');
        }
      }
    } catch (error) {
      console.error('Failed to start bot:', error);
      addStatusMessage(`Failed to start bot: ${error.message}`, 'error');
    }
  };

  const stopBot = async () => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.stopBot();
        
        if (result.success) {
          addStatusMessage('Bot stopped', 'info');
          setBotStatus(prev => ({ ...prev, isRunning: false }));
        } else {
          addStatusMessage(`Failed to stop bot: ${result.error}`, 'error');
        }
      }
    } catch (error) {
      console.error('Failed to stop bot:', error);
      addStatusMessage(`Failed to stop bot: ${error.message}`, 'error');
    }
  };

  const emergencyStop = async () => {
    if (window.confirm('Emergency stop will close all positions immediately. Continue?')) {
      try {
        await stopBot();
        addStatusMessage('Emergency stop executed', 'warning');
      } catch (error) {
        addStatusMessage('Emergency stop failed', 'error');
      }
    }
  };

  const handleNewTrade = (tradeData) => {
    const newTrade = {
      id: Date.now(),
      timestamp: new Date(),
      ...tradeData
    };
    
    setTrades(prev => [newTrade, ...prev.slice(0, 99)]); // Keep last 100 trades
    
    const message = tradeData.type === 'BUY' 
      ? `Bought ${tradeData.pair} at ${tradeData.position.entryPrice}`
      : `Sold ${tradeData.pair} - P&L: ${tradeData.pnl?.toFixed(2)} USDT`;
      
    addStatusMessage(message, tradeData.type === 'BUY' ? 'success' : 
      tradeData.pnl > 0 ? 'success' : 'warning');
  };

  const addStatusMessage = (message, type = 'info') => {
    const newMessage = {
      id: Date.now(),
      message,
      type,
      timestamp: new Date()
    };
    
    setStatusMessages(prev => [newMessage, ...prev.slice(0, 99)]);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value);
  };

  const formatPercent = (value) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
          <p className="text-white mt-4">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-white">Privacy Trading Bot</h1>
            <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${
              botStatus.isRunning 
                ? 'bg-green-600 text-white' 
                : 'bg-red-600 text-white'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                botStatus.isRunning ? 'bg-green-300' : 'bg-red-300'
              }`}></div>
              <span>{botStatus.isRunning ? 'Active' : 'Stopped'}</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Balance Display */}
            <div className="text-right">
              <div className="text-sm text-gray-400">Balance</div>
              <div className="text-lg font-semibold">
                {formatCurrency(balances.current)}
              </div>
              <div className={`text-xs ${
                balances.change >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {formatCurrency(balances.change)} ({formatPercent(balances.changePercent)})
              </div>
            </div>

            {/* Control Buttons */}
            <div className="flex space-x-2">
              <button
                onClick={botStatus.isRunning ? stopBot : startBot}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  botStatus.isRunning
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {botStatus.isRunning ? <Square size={16} /> : <Play size={16} />}
                <span>{botStatus.isRunning ? 'Stop' : 'Start'}</span>
              </button>
              
              <button
                onClick={emergencyStop}
                className="flex items-center space-x-2 px-4 py-2 rounded-lg font-medium bg-orange-600 hover:bg-orange-700 text-white transition-colors"
              >
                <AlertCircle size={16} />
                <span>Emergency</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Sidebar - Trading Stats */}
        <div className="w-80 bg-gray-800 border-r border-gray-700 p-6 overflow-y-auto">
          {/* Performance Stats */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <BarChart3 size={20} className="mr-2" />
              Performance
            </h3>
            
            <div className="space-y-4">
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="text-sm text-gray-400 mb-1">Total P&L</div>
                <div className={`text-xl font-bold ${
                  botStatus.stats.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {formatCurrency(botStatus.stats.totalPnL || 0)}
                </div>
              </div>
              
              <div className="bg-gray-700 rounded-lg p-4">
                <div className="text-sm text-gray-400 mb-1">ROI</div>
                <div className={`text-xl font-bold ${
                  botStatus.stats.roi >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {formatPercent(botStatus.stats.roi || 0)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-700 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Total Trades</div>
                  <div className="text-lg font-semibold">{botStatus.stats.totalTrades || 0}</div>
                </div>
                
                <div className="bg-gray-700 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Win Rate</div>
                  <div className="text-lg font-semibold text-blue-400">
                    {(botStatus.stats.winRate || 0).toFixed(1)}%
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-700 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Profitable</div>
                  <div className="text-lg font-semibold text-green-400">
                    {botStatus.stats.profitableTrades || 0}
                  </div>
                </div>
                
                <div className="bg-gray-700 rounded-lg p-3">
                  <div className="text-xs text-gray-400 mb-1">Open Positions</div>
                  <div className="text-lg font-semibold text-yellow-400">
                    {botStatus.stats.openPositions || 0}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Current Positions */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-4">Open Positions</h3>
            
            {botStatus.positions.length === 0 ? (
              <div className="text-gray-400 text-center py-4">No open positions</div>
            ) : (
              <div className="space-y-3">
                {botStatus.positions.map((position, index) => (
                  <div key={index} className="bg-gray-700 rounded-lg p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold">{position.pair}</span>
                      <span className={`px-2 py-1 rounded text-xs ${
                        position.side === 'BUY' ? 'bg-green-600' : 'bg-red-600'
                      }`}>
                        {position.side}
                      </span>
                    </div>
                    
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Entry:</span>
                        <span>${position.entryPrice.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Quantity:</span>
                        <span>{position.quantity.toFixed(6)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Unrealized P&L:</span>
                        <span className={
                          position.unrealizedPnL >= 0 ? 'text-green-400' : 'text-red-400'
                        }>
                          {formatCurrency(position.unrealizedPnL || 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Status Messages */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Status Log</h3>
            
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {statusMessages.slice(0, 20).map((msg) => (
                <div key={msg.id} className={`p-2 rounded text-sm ${
                  msg.type === 'success' ? 'bg-green-900 text-green-200' :
                  msg.type === 'error' ? 'bg-red-900 text-red-200' :
                  msg.type === 'warning' ? 'bg-yellow-900 text-yellow-200' :
                  'bg-gray-700 text-gray-300'
                }`}>
                  <div className="flex justify-between items-start">
                    <span className="flex-1">{msg.message}</span>
                    <span className="text-xs opacity-60 ml-2">
                      {msg.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Pair Selector */}
          <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-gray-400">Trading Pair:</span>
              <div className="flex space-x-2">
                {['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].map((pair) => (
                  <button
                    key={pair}
                    onClick={() => setSelectedPair(pair)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedPair === pair
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {pair.replace('USDT', '/USDT')}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Charts and Data */}
          <div className="flex-1 flex">
            {/* Chart Area */}
            <div className="flex-1 p-6">
              <Chart 
                symbol={selectedPair} 
                isRunning={botStatus.isRunning}
              />
            </div>

            {/* Portfolio & History */}
            <div className="w-96 border-l border-gray-700 flex flex-col">
              <div className="flex-1 p-4">
                <Portfolio 
                  balance={balances}
                  positions={botStatus.positions}
                  stats={botStatus.stats}
                />
              </div>
              
              <div className="flex-1 p-4 border-t border-gray-700">
                <TradeHistory trades={trades} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;