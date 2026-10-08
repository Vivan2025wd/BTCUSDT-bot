import { useState, useEffect, useCallback } from 'react';

const useTrading = () => {
  const [botStatus, setBotStatus] = useState('stopped'); // stopped, running, paused
  const [activeStrategy, setActiveStrategy] = useState('EMA');
  const [tradingPairs, setTradingPairs] = useState(['BTCUSDT']);
  const [currentPrices, setCurrentPrices] = useState({});
  const [openPositions, setOpenPositions] = useState([]);
  const [recentTrades, setRecentTrades] = useState([]);
  const [performance, setPerformance] = useState({
    dailyPnL: 0,
    totalPnL: 0,
    winRate: 0,
    totalTrades: 0
  });

  // Bot control functions
  const startBot = useCallback(async (strategy = 'EMA', pairs = ['BTCUSDT']) => {
    try {
      await window.electronAPI.startBot({ strategy, pairs });
      setBotStatus('running');
      setActiveStrategy(strategy);
      setTradingPairs(pairs);
      return { success: true };
    } catch (error) {
      console.error('Failed to start bot:', error);
      return { success: false, error: error.message };
    }
  }, []);

  const stopBot = useCallback(async () => {
    try {
      await window.electronAPI.stopBot();
      setBotStatus('stopped');
      return { success: true };
    } catch (error) {
      console.error('Failed to stop bot:', error);
      return { success: false, error: error.message };
    }
  }, []);

  const pauseBot = useCallback(async () => {
    try {
      await window.electronAPI.pauseBot();
      setBotStatus('paused');
      return { success: true };
    } catch (error) {
      console.error('Failed to pause bot:', error);
      return { success: false, error: error.message };
    }
  }, []);

  const resumeBot = useCallback(async () => {
    try {
      await window.electronAPI.resumeBot();
      setBotStatus('running');
      return { success: true };
    } catch (error) {
      console.error('Failed to resume bot:', error);
      return { success: false, error: error.message };
    }
  }, []);

  // Manual trading functions
  const placeBuyOrder = useCallback(async (symbol, quantity, price = null) => {
    try {
      const result = await window.electronAPI.placeBuyOrder({ symbol, quantity, price });
      return result;
    } catch (error) {
      console.error('Failed to place buy order:', error);
      return { success: false, error: error.message };
    }
  }, []);

  const placeSellOrder = useCallback(async (symbol, quantity, price = null) => {
    try {
      const result = await window.electronAPI.placeSellOrder({ symbol, quantity, price });
      return result;
    } catch (error) {
      console.error('Failed to place sell order:', error);
      return { success: false, error: error.message };
    }
  }, []);

  const closePosition = useCallback(async (symbol) => {
    try {
      const result = await window.electronAPI.closePosition(symbol);
      return result;
    } catch (error) {
      console.error('Failed to close position:', error);
      return { success: false, error: error.message };
    }
  }, []);

  // Data fetching functions
  const fetchTradingData = useCallback(async () => {
    try {
      const [prices, positions, trades, perf] = await Promise.all([
        window.electronAPI.getCurrentPrices(tradingPairs),
        window.electronAPI.getOpenPositions(),
        window.electronAPI.getRecentTrades(10),
        window.electronAPI.getPerformanceStats()
      ]);

      setCurrentPrices(prices || {});
      setOpenPositions(positions || []);
      setRecentTrades(trades || []);
      setPerformance(perf || {
        dailyPnL: 0,
        totalPnL: 0,
        winRate: 0,
        totalTrades: 0
      });
    } catch (error) {
      console.error('Failed to fetch trading data:', error);
    }
  }, [tradingPairs]);

  // Get bot status
  const getBotStatus = useCallback(async () => {
    try {
      const status = await window.electronAPI.getBotStatus();
      setBotStatus(status.status);
      setActiveStrategy(status.strategy);
      setTradingPairs(status.pairs || []);
    } catch (error) {
      console.error('Failed to get bot status:', error);
    }
  }, []);

  // Initialize and set up periodic updates
  useEffect(() => {
    getBotStatus();
    fetchTradingData();

    // Set up periodic updates
    const statusInterval = setInterval(getBotStatus, 5000); // Check status every 5s
    const dataInterval = setInterval(fetchTradingData, 10000); // Update data every 10s

    return () => {
      clearInterval(statusInterval);
      clearInterval(dataInterval);
    };
  }, [getBotStatus, fetchTradingData]);

  // Listen for real-time updates from the main process
  useEffect(() => {
    const handleTradingUpdate = (data) => {
      switch (data.type) {
        case 'PRICE_UPDATE':
          setCurrentPrices(prev => ({ ...prev, [data.symbol]: data.price }));
          break;
        case 'POSITION_UPDATE':
          setOpenPositions(data.positions);
          break;
        case 'TRADE_COMPLETED':
          setRecentTrades(prev => [data.trade, ...prev.slice(0, 9)]);
          fetchTradingData(); // Refresh all data
          break;
        case 'PERFORMANCE_UPDATE':
          setPerformance(data.performance);
          break;
        case 'BOT_STATUS_CHANGE':
          setBotStatus(data.status);
          break;
        default:
          break;
      }
    };

    // Set up IPC listener
    if (window.electronAPI?.onTradingUpdate) {
      window.electronAPI.onTradingUpdate(handleTradingUpdate);
    }

    return () => {
      if (window.electronAPI?.removeTradingUpdateListener) {
        window.electronAPI.removeTradingUpdateListener();
      }
    };
  }, [fetchTradingData]);

  return {
    // Status
    botStatus,
    activeStrategy,
    tradingPairs,
    
    // Data
    currentPrices,
    openPositions,
    recentTrades,
    performance,
    
    // Bot controls
    startBot,
    stopBot,
    pauseBot,
    resumeBot,
    
    // Manual trading
    placeBuyOrder,
    placeSellOrder,
    closePosition,
    
    // Data refresh
    fetchTradingData,
    getBotStatus
  };
};

export default useTrading;