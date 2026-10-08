import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';

const Chart = () => {
  const [priceData, setPriceData] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('5m');
  const [indicators, setIndicators] = useState({
    ema: true,
    rsi: false,
    volume: false
  });
  const [currentPrice, setCurrentPrice] = useState(null);
  const [priceChange, setPriceChange] = useState({ value: 0, percentage: 0 });

  useEffect(() => {
    fetchPriceData();
    const interval = setInterval(fetchPriceData, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, [selectedSymbol, timeframe]);

  const fetchPriceData = async () => {
    try {
      const data = await window.electronAPI.getPriceData(selectedSymbol, timeframe, 100);
      if (data && data.length > 0) {
        const processedData = data.map((item, index) => ({
          time: new Date(item.timestamp).toLocaleTimeString(),
          price: parseFloat(item.close),
          ema: item.ema || null,
          rsi: item.rsi || null,
          volume: parseFloat(item.volume)
        }));
        
        setPriceData(processedData);
        
        // Update current price and change
        const latest = processedData[processedData.length - 1];
        const previous = processedData[processedData.length - 2];
        if (latest && previous) {
          setCurrentPrice(latest.price);
          const change = latest.price - previous.price;
          const changePercent = (change / previous.price) * 100;
          setPriceChange({ value: change, percentage: changePercent });
        }
      }
    } catch (error) {
      console.error('Failed to fetch price data:', error);
    }
  };

  const formatPrice = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 8
    }).format(value);
  };

  const formatVolume = (value) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(2)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(2)}K`;
    }
    return value.toFixed(2);
  };

  return (
    <div className="p-6 bg-gray-900 text-white min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
          <div className="flex items-center mb-4 md:mb-0">
            <Activity className="mr-3" size={32} />
            <div>
              <h1 className="text-3xl font-bold">{selectedSymbol}</h1>
              <div className="flex items-center mt-1">
                <span className="text-2xl font-mono mr-3">
                  {currentPrice ? formatPrice(currentPrice) : '--'}
                </span>
                <div className={`flex items-center ${
                  priceChange.value >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {priceChange.value >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                  <span className="ml-1 font-medium">
                    {priceChange.value >= 0 ? '+' : ''}{priceChange.value.toFixed(4)} 
                    ({priceChange.percentage >= 0 ? '+' : ''}{priceChange.percentage.toFixed(2)}%)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap gap-4">
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="px-4 py-2 bg-gray-800 border border-gray-600 rounded focus:border-blue-400"
            >
              <option value="BTCUSDT">BTC/USDT</option>
              <option value="ETHUSDT">ETH/USDT</option>
              <option value="ADAUSDT">ADA/USDT</option>
              <option value="DOGEUSDT">DOGE/USDT</option>
            </select>

            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="px-4 py-2 bg-gray-800 border border-gray-600 rounded focus:border-blue-400"
            >
              <option value="1m">1m</option>
              <option value="5m">5m</option>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
            </select>
          </div>
        </div>

        {/* Indicators Toggle */}
        <div className="flex flex-wrap gap-4 mb-6">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={indicators.ema}
              onChange={(e) => setIndicators({...indicators, ema: e.target.checked})}
              className="mr-2"
            />
            <span className="text-yellow-400">EMA</span>
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={indicators.rsi}
              onChange={(e) => setIndicators({...indicators, rsi: e.target.checked})}
              className="mr-2"
            />
            <span className="text-purple-400">RSI</span>
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={indicators.volume}
              onChange={(e) => setIndicators({...indicators, volume: e.target.checked})}
              className="mr-2"
            />
            <span className="text-blue-400">Volume</span>
          </label>
        </div>

        {/* Price Chart */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Price Chart</h2>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={priceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="time" 
                stroke="#9CA3AF"
                fontSize={12}
              />
              <YAxis 
                stroke="#9CA3AF"
                fontSize={12}
                tickFormatter={formatPrice}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1F2937', 
                  border: '1px solid #374151',
                  borderRadius: '6px'
                }}
                labelStyle={{ color: '#F3F4F6' }}
                formatter={(value, name) => [
                  name === 'price' ? formatPrice(value) : value.toFixed(2),
                  name.toUpperCase()
                ]}
              />
              <Legend />
              
              <Line 
                type="monotone" 
                dataKey="price" 
                stroke="#10B981" 
                strokeWidth={2}
                dot={false}
                name="Price"
              />
              
              {indicators.ema && (
                <Line 
                  type="monotone" 
                  dataKey="ema" 
                  stroke="#F59E0B" 
                  strokeWidth={1}
                  strokeDasharray="5 5"
                  dot={false}
                  name="EMA"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Volume Chart */}
        {indicators.volume && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Volume</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={priceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="time" 
                  stroke="#9CA3AF"
                  fontSize={12}
                />
                <YAxis 
                  stroke="#9CA3AF"
                  fontSize={12}
                  tickFormatter={formatVolume}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1F2937', 
                    border: '1px solid #374151',
                    borderRadius: '6px'
                  }}
                  formatter={(value) => [formatVolume(value), 'Volume']}
                />
                
                <Line 
                  type="monotone" 
                  dataKey="volume" 
                  stroke="#3B82F6" 
                  strokeWidth={2}
                  dot={false}
                  fill="#3B82F6"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* RSI Chart */}
        {indicators.rsi && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">RSI (Relative Strength Index)</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={priceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  dataKey="time" 
                  stroke="#9CA3AF"
                  fontSize={12}
                />
                <YAxis 
                  stroke="#9CA3AF"
                  fontSize={12}
                  domain={[0, 100]}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1F2937', 
                    border: '1px solid #374151',
                    borderRadius: '6px'
                  }}
                  formatter={(value) => [value?.toFixed(2) || 'N/A', 'RSI']}
                />
                
                <Line 
                  type="monotone" 
                  dataKey="rsi" 
                  stroke="#8B5CF6" 
                  strokeWidth={2}
                  dot={false}
                />
                
                {/* RSI Reference Lines */}
                <Line 
                  type="monotone" 
                  dataKey={() => 70} 
                  stroke="#EF4444" 
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  dot={false}
                />
                <Line 
                  type="monotone" 
                  dataKey={() => 30} 
                  stroke="#EF4444" 
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chart;