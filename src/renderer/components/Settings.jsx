import React, { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, Save, TestTube } from 'lucide-react';

const Settings = () => {
  const [settings, setSettings] = useState({
    binance: {
      apiKey: '',
      apiSecret: '',
      testnet: true
    },
    bybit: {
      apiKey: '',
      apiSecret: '',
      testnet: true
    },
    risk: {
      positionSize: 2,
      stopLoss: 3,
      takeProfit: 5,
      maxDrawdown: 15
    },
    trading: {
      activeExchange: 'binance',
      strategy: 'EMA',
      symbols: ['BTCUSDT', 'ETHUSDT'],
      timeframe: '5m'
    }
  });

  const [showSecrets, setShowSecrets] = useState({
    binanceSecret: false,
    bybitSecret: false
  });

  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedSettings = await window.electronAPI.getSettings();
      if (savedSettings) {
        setSettings({ ...settings, ...savedSettings });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleSave = async () => {
    try {
      await window.electronAPI.saveSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const testConnection = async (exchange) => {
    setTesting(true);
    try {
      const result = await window.electronAPI.testExchangeConnection(exchange, settings[exchange]);
      alert(result.success ? 'Connection successful!' : `Connection failed: ${result.error}`);
    } catch (error) {
      alert(`Test failed: ${error.message}`);
    }
    setTesting(false);
  };

  const updateSetting = (path, value) => {
    const keys = path.split('.');
    const newSettings = { ...settings };
    let current = newSettings;
    
    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
    
    setSettings(newSettings);
  };

  return (
    <div className="p-6 bg-gray-900 text-white min-h-screen">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 flex items-center">
          <Lock className="mr-3" />
          Settings
        </h1>

        {/* Exchange Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Binance */}
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4 text-yellow-400">Binance</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">API Key</label>
                <input
                  type="text"
                  value={settings.binance.apiKey}
                  onChange={(e) => updateSetting('binance.apiKey', e.target.value)}
                  className="w-full p-3 bg-gray-700 rounded border border-gray-600 focus:border-yellow-400"
                  placeholder="Enter Binance API Key"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">API Secret</label>
                <div className="relative">
                  <input
                    type={showSecrets.binanceSecret ? "text" : "password"}
                    value={settings.binance.apiSecret}
                    onChange={(e) => updateSetting('binance.apiSecret', e.target.value)}
                    className="w-full p-3 bg-gray-700 rounded border border-gray-600 focus:border-yellow-400 pr-10"
                    placeholder="Enter Binance API Secret"
                  />
                  <button
                    onClick={() => setShowSecrets({...showSecrets, binanceSecret: !showSecrets.binanceSecret})}
                    className="absolute right-3 top-3 text-gray-400 hover:text-white"
                  >
                    {showSecrets.binanceSecret ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={settings.binance.testnet}
                    onChange={(e) => updateSetting('binance.testnet', e.target.checked)}
                    className="mr-2"
                  />
                  Use Testnet
                </label>
                <button
                  onClick={() => testConnection('binance')}
                  disabled={testing}
                  className="flex items-center px-3 py-2 bg-yellow-600 hover:bg-yellow-700 rounded text-sm"
                >
                  <TestTube size={16} className="mr-1" />
                  Test
                </button>
              </div>
            </div>
          </div>

          {/* Bybit */}
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4 text-orange-400">Bybit</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">API Key</label>
                <input
                  type="text"
                  value={settings.bybit.apiKey}
                  onChange={(e) => updateSetting('bybit.apiKey', e.target.value)}
                  className="w-full p-3 bg-gray-700 rounded border border-gray-600 focus:border-orange-400"
                  placeholder="Enter Bybit API Key"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">API Secret</label>
                <div className="relative">
                  <input
                    type={showSecrets.bybitSecret ? "text" : "password"}
                    value={settings.bybit.apiSecret}
                    onChange={(e) => updateSetting('bybit.apiSecret', e.target.value)}
                    className="w-full p-3 bg-gray-700 rounded border border-gray-600 focus:border-orange-400 pr-10"
                    placeholder="Enter Bybit API Secret"
                  />
                  <button
                    onClick={() => setShowSecrets({...showSecrets, bybitSecret: !showSecrets.bybitSecret})}
                    className="absolute right-3 top-3 text-gray-400 hover:text-white"
                  >
                    {showSecrets.bybitSecret ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={settings.bybit.testnet}
                    onChange={(e) => updateSetting('bybit.testnet', e.target.checked)}
                    className="mr-2"
                  />
                  Use Testnet
                </label>
                <button
                  onClick={() => testConnection('bybit')}
                  disabled={testing}
                  className="flex items-center px-3 py-2 bg-orange-600 hover:bg-orange-700 rounded text-sm"
                >
                  <TestTube size={16} className="mr-1" />
                  Test
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Risk Management */}
        <div className="bg-gray-800 p-6 rounded-lg mb-8">
          <h2 className="text-xl font-semibold mb-4 text-red-400">Risk Management</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Position Size (%)</label>
              <input
                type="number"
                value={settings.risk.positionSize}
                onChange={(e) => updateSetting('risk.positionSize', parseFloat(e.target.value))}
                className="w-full p-3 bg-gray-700 rounded border border-gray-600 focus:border-red-400"
                min="0.1"
                max="10"
                step="0.1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Stop Loss (%)</label>
              <input
                type="number"
                value={settings.risk.stopLoss}
                onChange={(e) => updateSetting('risk.stopLoss', parseFloat(e.target.value))}
                className="w-full p-3 bg-gray-700 rounded border border-gray-600 focus:border-red-400"
                min="0.5"
                max="20"
                step="0.1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Take Profit (%)</label>
              <input
                type="number"
                value={settings.risk.takeProfit}
                onChange={(e) => updateSetting('risk.takeProfit', parseFloat(e.target.value))}
                className="w-full p-3 bg-gray-700 rounded border border-gray-600 focus:border-red-400"
                min="1"
                max="50"
                step="0.1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Max Drawdown (%)</label>
              <input
                type="number"
                value={settings.risk.maxDrawdown}
                onChange={(e) => updateSetting('risk.maxDrawdown', parseFloat(e.target.value))}
                className="w-full p-3 bg-gray-700 rounded border border-gray-600 focus:border-red-400"
                min="5"
                max="50"
                step="1"
              />
            </div>
          </div>
        </div>

        {/* Trading Settings */}
        <div className="bg-gray-800 p-6 rounded-lg mb-8">
          <h2 className="text-xl font-semibold mb-4 text-blue-400">Trading Configuration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium mb-2">Active Exchange</label>
              <select
                value={settings.trading.activeExchange}
                onChange={(e) => updateSetting('trading.activeExchange', e.target.value)}
                className="w-full p-3 bg-gray-700 rounded border border-gray-600 focus:border-blue-400"
              >
                <option value="binance">Binance</option>
                <option value="bybit">Bybit</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Strategy</label>
              <select
                value={settings.trading.strategy}
                onChange={(e) => updateSetting('trading.strategy', e.target.value)}
                className="w-full p-3 bg-gray-700 rounded border border-gray-600 focus:border-blue-400"
              >
                <option value="EMA">EMA Crossover</option>
                <option value="RSI">RSI Strategy</option>
                <option value="COMBINED">Combined Strategy</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Timeframe</label>
              <select
                value={settings.trading.timeframe}
                onChange={(e) => updateSetting('trading.timeframe', e.target.value)}
                className="w-full p-3 bg-gray-700 rounded border border-gray-600 focus:border-blue-400"
              >
                <option value="1m">1 Minute</option>
                <option value="5m">5 Minutes</option>
                <option value="15m">15 Minutes</option>
                <option value="1h">1 Hour</option>
                <option value="4h">4 Hours</option>
                <option value="1d">1 Day</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Trading Symbols</label>
              <input
                type="text"
                value={settings.trading.symbols.join(', ')}
                onChange={(e) => updateSetting('trading.symbols', e.target.value.split(',').map(s => s.trim()))}
                className="w-full p-3 bg-gray-700 rounded border border-gray-600 focus:border-blue-400"
                placeholder="BTCUSDT, ETHUSDT, ADAUSDT"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-center">
          <button
            onClick={handleSave}
            className={`flex items-center px-6 py-3 rounded-lg font-medium transition-all ${
              saved 
                ? 'bg-green-600 text-white' 
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            <Save className="mr-2" size={20} />
            {saved ? 'Settings Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;