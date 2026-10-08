import React, { useState } from 'react';
import { BarChart3, Settings as SettingsIcon, History, Wallet, TrendingUp } from 'lucide-react';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import Chart from './components/Chart';
import TradeHistory from './components/TradeHistory'; // default export
import Portfolio from './components/Portfolio';
import Backtesting from './components/Backtesting';


const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  const navigation = [
    { id: 'dashboard', name: 'Dashboard', icon: BarChart3, component: Dashboard },
    { id: 'chart', name: 'Chart', icon: TrendingUp, component: Chart },
    { id: 'portfolio', name: 'Portfolio', icon: Wallet, component: Portfolio },
    { id: 'history', name: 'History', icon: History, component: TradeHistory },
    { id: 'backtest', name: 'Backtest', icon: BarChart3, component: Backtesting },
    { id: 'settings', name: 'Settings', icon: SettingsIcon, component: Settings }
  ];

  

  const ActiveComponent = navigation.find(nav => nav.id === activeTab)?.component || Dashboard;

  return (
<div className="flex h-screen bg-gray-100 text-black">
  {/* Sidebar */}
  <div className="w-64 bg-white shadow-lg relative">
    <div className="p-6">
      <h1 className="text-2xl font-bold text-blue-600">TradingBot</h1>
      <p className="text-gray-600 text-sm">Self-Hosted Trading</p>
    </div>

    <nav className="mt-8">
      {navigation.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center px-6 py-3 text-left transition-colors ${
              activeTab === item.id
                ? 'bg-blue-100 text-blue-700 border-r-2 border-blue-400'
                : 'text-gray-700 hover:bg-gray-200 hover:text-black'
            }`}
          >
            <Icon className="mr-3" size={20} />
            {item.name}
          </button>
        );
      })}
    </nav>

    <div className="absolute bottom-4 left-4 right-4">
      <div className="bg-gray-200 p-3 rounded-lg text-sm">
        <div className="flex items-center text-gray-700">
          <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
          Status: Running
        </div>
        <div className="text-xs text-gray-500 mt-1">
          v1.0.0 - Self-Hosted
        </div>
      </div>
    </div>
  </div>

  {/* Main Content */}
  <div className="flex-1 overflow-hidden">
    <ActiveComponent />
  </div>
</div>
  );
};


export default App;
