import React, { useState, useEffect } from 'react';
import {
  BarChart3, Settings as SettingsIcon, History, Wallet,
  Activity, ChevronLeft, ChevronRight, Radio, Shield,
  LineChart, Menu, X, TrendingUp, Circle
} from 'lucide-react';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import Chart from './components/Chart';
import TradeHistory from './components/TradeHistory';
import Portfolio from './components/Portfolio';
import Backtesting from './components/Backtesting';

/* ═══════════════════════════════════════════════════════════════
   NAV CONFIG
   ═══════════════════════════════════════════════════════════════ */

const NAV_ITEMS = [
  { id: 'dashboard', name: 'Dashboard', icon: BarChart3,    accent: 'indigo',  description: 'Bot control & overview' },
  { id: 'chart',     name: 'Chart',     icon: LineChart,    accent: 'emerald', description: 'Live market data' },
  { id: 'portfolio', name: 'Portfolio', icon: Wallet,       accent: 'violet',  description: 'Balances & positions' },
  { id: 'history',   name: 'History',   icon: History,      accent: 'blue',    description: 'Past trades' },
  { id: 'backtest',  name: 'Backtest',  icon: Activity,     accent: 'amber',   description: 'Strategy testing' },
  { id: 'settings',  name: 'Settings',  icon: SettingsIcon, accent: 'slate',   description: 'API keys & risk' }
];

const COMPONENTS = {
  dashboard: Dashboard,
  chart:     Chart,
  portfolio: Portfolio,
  history:   TradeHistory,
  backtest:  Backtesting,
  settings:  Settings
};

const ACCENTS = {
  indigo:  { text: 'text-indigo-400',  bg: 'bg-indigo-500/10',  ring: 'ring-indigo-500/20',  bar: 'bg-indigo-500'  },
  emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20', bar: 'bg-emerald-500' },
  violet:  { text: 'text-violet-400',  bg: 'bg-violet-500/10',  ring: 'ring-violet-500/20',  bar: 'bg-violet-500'  },
  blue:    { text: 'text-blue-400',    bg: 'bg-blue-500/10',    ring: 'ring-blue-500/20',    bar: 'bg-blue-500'    },
  amber:   { text: 'text-amber-400',   bg: 'bg-amber-500/10',   ring: 'ring-amber-500/20',   bar: 'bg-amber-500'   },
  slate:   { text: 'text-slate-400',   bg: 'bg-slate-500/10',   ring: 'ring-slate-500/20',   bar: 'bg-slate-500'   }
};

/* ═══════════════════════════════════════════════════════════════
   APP
   ═══════════════════════════════════════════════════════════════ */

const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Track viewport size
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Close mobile drawer when a tab is selected
  const handleNavigate = (id) => {
    setActiveTab(id);
    setMobileOpen(false);
  };

  // Close mobile drawer on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (isMobile && mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isMobile, mobileOpen]);

  const ActiveComponent = COMPONENTS[activeTab] || Dashboard;
  const activeItem = NAV_ITEMS.find(n => n.id === activeTab);

  return (
    <div className="flex h-screen bg-[#0a0e17] text-slate-200 overflow-hidden">

      {/* ═══════════════════════════════════════════════════════
          SIDEBAR — desktop always visible, mobile as drawer
          ═══════════════════════════════════════════════════════ */}

      {/* Mobile overlay */}
      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40
                     animate-[fadeIn_0.15s_ease-out]"
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          'flex flex-col bg-[#0d1220] border-r border-slate-800/60',
          'transition-[width,transform] duration-300 ease-out',
          // Desktop behavior
          !isMobile
            ? collapsed ? 'w-[68px]' : 'w-[240px]'
            : // Mobile behavior — fixed drawer
              `fixed inset-y-0 left-0 z-50 w-[280px] transform ${
                mobileOpen ? 'translate-x-0' : '-translate-x-full'
              }`
        ].join(' ')}
      >
        {/* ── Mobile close button ── */}
        {isMobile && (
          <button
            onClick={() => setMobileOpen(false)}
            className="absolute top-4 right-4 p-1.5 rounded-lg
                       text-slate-500 hover:text-slate-200 hover:bg-slate-800/60
                       transition-colors z-10"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        )}

        {/* ── Brand ── */}
        <div className={[
          'flex items-center gap-3 border-b border-slate-800/60',
          collapsed && !isMobile ? 'px-3 py-5 justify-center' : 'px-5 py-5'
        ].join(' ')}>
          <div className="relative flex-shrink-0">
            <div className="w-9 h-9 rounded-xl
                            bg-gradient-to-br from-indigo-500/25 to-violet-500/15
                            ring-1 ring-indigo-500/30
                            flex items-center justify-center">
              <Activity size={17} className="text-indigo-300" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full
                             bg-emerald-500 ring-2 ring-[#0d1220]">
              <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
            </span>
          </div>

          {(!collapsed || isMobile) && (
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-semibold text-white tracking-tight truncate">
                Privacy Trading Bot
              </h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">
                Self-Hosted
              </p>
            </div>
          )}
        </div>

        {/* ── Navigation ── */}
        <nav className={[
          'flex-1 py-4 space-y-1 overflow-y-auto',
          collapsed && !isMobile ? 'px-2' : 'px-3'
        ].join(' ')}>

          {(!collapsed || isMobile) && (
            <p className="px-3 pb-2 text-[10px] uppercase tracking-wider
                          text-slate-600 font-medium">
              Navigation
            </p>
          )}

          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const a = ACCENTS[item.accent];

            return (
              <button
                key={item.id}
                onClick={() => handleNavigate(item.id)}
                title={collapsed && !isMobile ? item.name : undefined}
                aria-current={isActive ? 'page' : undefined}
                className={[
                  'group relative w-full flex items-center gap-3 rounded-lg',
                  'transition-all duration-200',
                  collapsed && !isMobile
                    ? 'justify-center px-0 py-2.5'
                    : 'px-3 py-2.5',
                  isActive
                    ? 'bg-slate-800/60 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
                ].join(' ')}
              >
                {/* Active indicator bar */}
                {isActive && (!collapsed || isMobile) && (
                  <span className={`absolute left-0 top-1/2 -translate-y-1/2
                                    w-0.5 h-5 rounded-r-full ${a.bar}`} />
                )}

                {/* Icon badge */}
                <div className={[
                  'relative flex-shrink-0 w-7 h-7 rounded-md',
                  'flex items-center justify-center transition-all duration-200',
                  isActive
                    ? `${a.bg} ring-1 ${a.ring}`
                    : 'ring-1 ring-transparent group-hover:bg-slate-800/60'
                ].join(' ')}>
                  <Icon
                    size={15}
                    className={isActive ? a.text : 'text-slate-500 group-hover:text-slate-300'}
                  />
                </div>

                {(!collapsed || isMobile) && (
                  <>
                    <div className="flex-1 text-left min-w-0">
                      <span className={`block text-sm font-medium truncate
                                        ${isActive ? 'text-white' : ''}`}>
                        {item.name}
                      </span>
                      {/* Show description only in mobile drawer */}
                      {isMobile && (
                        <span className="block text-[10px] text-slate-600 truncate">
                          {item.description}
                        </span>
                      )}
                    </div>

                    {isActive && (
                      <ChevronRight size={13} className="text-slate-500 flex-shrink-0" />
                    )}
                  </>
                )}

                {/* Tooltip on collapsed desktop */}
                {collapsed && !isMobile && (
                  <div className="absolute left-full ml-3 px-2.5 py-1.5 rounded-md
                                  bg-slate-900 text-slate-200 text-xs font-medium
                                  border border-slate-800 shadow-xl
                                  opacity-0 pointer-events-none
                                  group-hover:opacity-100
                                  transition-opacity duration-150
                                  whitespace-nowrap z-50">
                    {item.name}
                  </div>
                )}
              </button>
            );
          })}
        </nav>

        {/* ── Footer ── */}
        <div className={[
          'border-t border-slate-800/60 space-y-2',
          collapsed && !isMobile ? 'p-2' : 'p-3'
        ].join(' ')}>

          {/* Status card */}
          {collapsed && !isMobile ? (
            <div className="flex justify-center py-2">
              <div className="relative">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20
                                flex items-center justify-center">
                  <Radio size={13} className="text-emerald-400" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full
                                 bg-emerald-400 ring-2 ring-[#0d1220]" />
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-slate-900/50 border border-slate-800/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full
                                     rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5
                                     bg-emerald-400" />
                  </span>
                  <span className="text-[10px] uppercase tracking-wider
                                   text-emerald-400 font-medium">
                    Running
                  </span>
                </div>
                <Shield size={11} className="text-slate-600" />
              </div>

              <div className="flex items-center justify-between text-[10px]
                              font-mono text-slate-500">
                <span>v1.0.0</span>
                <span>Local</span>
              </div>
            </div>
          )}

          {/* Collapse toggle — desktop only */}
          {!isMobile && (
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="group w-full flex items-center justify-center gap-2
                         py-2 rounded-lg text-xs font-medium
                         text-slate-500 hover:text-slate-200
                         hover:bg-slate-800/40
                         transition-all duration-200"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? (
                <ChevronRight size={14}
                  className="group-hover:translate-x-0.5 transition-transform" />
              ) : (
                <>
                  <ChevronLeft size={14}
                    className="group-hover:-translate-x-0.5 transition-transform" />
                  <span>Collapse</span>
                </>
              )}
            </button>
          )}
        </div>
      </aside>

      {/* ═══════════════════════════════════════════════════════
          MAIN — this is where scrolling is fixed
          ═══════════════════════════════════════════════════════ */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="h-14 flex items-center justify-between
                           px-4 sm:px-6 flex-shrink-0
                           border-b border-slate-800/60
                           bg-[#0d1220]/60 backdrop-blur-sm">

          {/* Left: mobile menu + breadcrumb */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* Mobile menu button */}
            {isMobile && (
              <button
                onClick={() => setMobileOpen(true)}
                className="p-2 -ml-2 rounded-lg flex-shrink-0
                           text-slate-400 hover:text-slate-200 hover:bg-slate-800/60
                           transition-colors"
                aria-label="Open menu"
              >
                <Menu size={18} />
              </button>
            )}

            {/* Breadcrumb */}
            <div className="flex items-center gap-2 min-w-0 text-xs">
              <span className="hidden sm:inline text-slate-500 uppercase
                               tracking-wider text-[10px] font-medium truncate">
                Privacy Trading Bot
              </span>
              <ChevronRight size={11} className="hidden sm:block text-slate-700 flex-shrink-0" />
              <span className="text-slate-200 font-medium truncate">
                {activeItem?.name || 'Dashboard'}
              </span>
            </div>
          </div>

          {/* Right: live indicator */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="hidden xs:flex items-center gap-1.5 px-2.5 py-1 rounded-md
                            bg-emerald-500/10 border border-emerald-500/20">
              <Circle size={8} className="text-emerald-400 fill-emerald-400" />
              <span className="text-[10px] font-mono text-emerald-400
                               uppercase tracking-wider">
                Live
              </span>
            </div>
          </div>
        </header>

        {/* ─── CONTENT — THIS is the fix ─── */}
        {/* min-h-0 is required for flex children to scroll properly */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <ActiveComponent />
        </div>
      </main>

      {/* ═══════════════════════════════════════════════════════
          GLOBAL STYLES
          ═══════════════════════════════════════════════════════ */}
      <style>{`
        /* Custom scrollbar */
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb {
          background: rgba(71, 85, 105, 0.4);
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(71, 85, 105, 0.7);
        }
        ::-webkit-scrollbar-corner { background: transparent; }

        /* Mobile overlay fade-in */
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* Prevent horizontal scroll on mobile */
        html, body { overflow-x: hidden; }
      `}</style>
    </div>
  );
};

export default App;