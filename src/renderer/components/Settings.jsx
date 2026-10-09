// src/renderer/components/Settings.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  Eye, EyeOff, Save, CheckCircle2, XCircle, Loader2,
  AlertTriangle, Lock, Unlock, KeyRound, Shield, ShieldCheck,
  Activity, TrendingUp, Percent, ChevronRight
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   SETTINGS PAGE
   ═══════════════════════════════════════════════════════════════ */

const Settings = () => {
  const [settings, setSettings] = useState({
    binance: { apiKey: '', apiSecret: '', testnet: true },
    bybit:   { apiKey: '', apiSecret: '', testnet: true },
    risk:    { positionSize: 2, stopLoss: 3, takeProfit: 5, maxDrawdown: 15 },
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

  const [saveStatus, setSaveStatus]   = useState('idle');
  const [testStatus, setTestStatus]   = useState({ binance: 'idle', bybit: 'idle' });
  const [testMessage, setTestMessage] = useState({ binance: '', bybit: '' });

  // Vault (encryption) state
  const [unlocked, setUnlocked]           = useState(false);
  const [hasStoredKeys, setHasStoredKeys] = useState(false);
  const [password, setPassword]           = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [unlockBusy, setUnlockBusy]       = useState(false);

  // Dirty tracking
  const [initialSnapshot, setInitialSnapshot] = useState(null);

  useEffect(() => { bootstrap(); }, []);

  /* ─────────────────────────────────────────────────────────────
     BOOTSTRAP — load config + check vault state
     ───────────────────────────────────────────────────────────── */
  const bootstrap = async () => {
    try {
      const saved = await window.electronAPI?.getSettings?.();
      let next = null;

      setSettings((prev) => {
        next = {
          ...prev,
          ...saved,
          binance: { ...prev.binance, testnet: saved?.binance?.testnet ?? prev.binance.testnet },
          bybit:   { ...prev.bybit,   testnet: saved?.bybit?.testnet   ?? prev.bybit.testnet },
          risk:    { ...prev.risk,    ...(saved?.risk    || {}) },
          trading: { ...prev.trading, ...(saved?.trading || {}) }
        };
        return next;
      });

      const keys = await window.electronAPI?.loadApiKeys?.();

      if (keys?.locked) {
        setHasStoredKeys(true);
        setUnlocked(false);
      } else if (keys?.binance || keys?.apiKey) {
        setHasStoredKeys(true);
        setUnlocked(true);
        setSettings((prev) => ({
          ...prev,
          binance: {
            ...prev.binance,
            apiKey:    keys.binance?.apiKey    || keys.apiKey    || '',
            apiSecret: keys.binance?.apiSecret || keys.apiSecret || ''
          },
          bybit: {
            ...prev.bybit,
            apiKey:    keys.bybit?.apiKey    || '',
            apiSecret: keys.bybit?.apiSecret || ''
          }
        }));
      }

      setTimeout(() => setInitialSnapshot(JSON.stringify(next)), 0);
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  /* ─────────────────────────────────────────────────────────────
     UNLOCK / SET PASSWORD
     ───────────────────────────────────────────────────────────── */
  const unlock = async () => {
    setUnlockBusy(true);
    setPasswordError('');
    try {
      const r = await window.electronAPI?.setEncryptionPassword?.(password);
      if (!r?.success) {
        setPasswordError(r?.error || 'Failed to unlock');
        return false;
      }

      const keys = await window.electronAPI?.loadApiKeys?.();
      if (keys?.binance || keys?.apiKey) {
        setSettings((prev) => ({
          ...prev,
          binance: {
            ...prev.binance,
            apiKey:    keys.binance?.apiKey    || keys.apiKey    || '',
            apiSecret: keys.binance?.apiSecret || keys.apiSecret || ''
          },
          bybit: {
            ...prev.bybit,
            apiKey:    keys.bybit?.apiKey    || '',
            apiSecret: keys.bybit?.apiSecret || ''
          }
        }));
      }
      setUnlocked(true);
      setPassword('');
      return true;
    } catch (err) {
      setPasswordError(err.message);
      return false;
    } finally {
      setUnlockBusy(false);
    }
  };

  /* ─────────────────────────────────────────────────────────────
     SAVE — config.json + encrypted keys.enc
     ───────────────────────────────────────────────────────────── */
  const handleSave = async () => {
    const hasKeys =
      (settings.binance.apiKey && settings.binance.apiSecret) ||
      (settings.bybit.apiKey && settings.bybit.apiSecret);

    if (hasKeys && !unlocked) {
      setPasswordError('Set an encryption password to save keys');
      // Scroll to vault banner
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSaveStatus('saving');

    try {
      // 1. Save non-key settings (never plaintext keys to config.json)
      const { binance, bybit, ...rest } = settings;
      const settingsToSave = {
        ...rest,
        binance: { testnet: binance.testnet },
        bybit:   { testnet: bybit.testnet }
      };
      await window.electronAPI?.saveSettings?.(settingsToSave);

      // 2. Save keys encrypted
      if (hasKeys) {
        const payload = {};
        if (settings.binance.apiKey && settings.binance.apiSecret) {
          payload.binance = {
            apiKey:    settings.binance.apiKey,
            apiSecret: settings.binance.apiSecret
          };
        }
        if (settings.bybit.apiKey && settings.bybit.apiSecret) {
          payload.bybit = {
            apiKey:    settings.bybit.apiKey,
            apiSecret: settings.bybit.apiSecret
          };
        }

        const r = await window.electronAPI?.saveApiKeys?.(payload);
        if (!r?.success) throw new Error(r?.error || 'Failed to save encrypted keys');
        setHasStoredKeys(true);
      }

      setInitialSnapshot(JSON.stringify(settings));
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2200);
    } catch (err) {
      console.error('Save failed:', err);
      setSaveStatus('idle');
      window.electronAPI?.showErrorDialog?.('Save failed', err.message);
    }
  };

  /* ─────────────────────────────────────────────────────────────
     TEST CONNECTION
     ───────────────────────────────────────────────────────────── */
  const testConnection = async (exchange) => {
    setTestStatus((s) => ({ ...s, [exchange]: 'testing' }));
    setTestMessage((m) => ({ ...m, [exchange]: '' }));
    try {
      const result = await window.electronAPI?.testExchangeConnection?.(
        exchange,
        settings[exchange]
      );
      if (result?.success) {
        setTestStatus((s) => ({ ...s, [exchange]: 'success' }));
        setTestMessage((m) => ({ ...m, [exchange]: 'Connected' }));
      } else {
        setTestStatus((s) => ({ ...s, [exchange]: 'error' }));
        setTestMessage((m) => ({ ...m, [exchange]: result?.error || 'Failed' }));
      }
    } catch (err) {
      setTestStatus((s) => ({ ...s, [exchange]: 'error' }));
      setTestMessage((m) => ({ ...m, [exchange]: err.message }));
    }
    setTimeout(() => {
      setTestStatus((s) => ({ ...s, [exchange]: 'idle' }));
      setTestMessage((m) => ({ ...m, [exchange]: '' }));
    }, 3500);
  };

  /* ─────────────────────────────────────────────────────────────
     UPDATE HELPER
     ───────────────────────────────────────────────────────────── */
  const update = (path, value) => {
    const keys = path.split('.');
    setSettings((prev) => {
      const next = structuredClone(prev);
      let cur = next;
      for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
      cur[keys[keys.length - 1]] = value;
      return next;
    });
  };

  /* ─────────────────────────────────────────────────────────────
     COMPUTED
     ───────────────────────────────────────────────────────────── */
  const isDirty = useMemo(() => {
    if (!initialSnapshot) return false;
    return JSON.stringify(settings) !== initialSnapshot;
  }, [settings, initialSnapshot]);

  const rrRatio = settings.risk.stopLoss > 0
    ? settings.risk.takeProfit / settings.risk.stopLoss
    : 0;
  const breakevenWinRate = rrRatio > 0 ? 100 / (1 + rrRatio) : 0;
  const maxPositions = settings.risk.positionSize > 0
    ? Math.floor(100 / settings.risk.positionSize)
    : 0;

  /* ─────────────────────────────────────────────────────────────
     RENDER
     ───────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-[#0a0e17] text-slate-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10 pb-24">

        {/* ═══════════════ HEADER with Save button ═══════════════ */}
        <header className="mb-8 sm:mb-12 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
              Settings
            </h1>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              Configure exchanges, risk controls, and trading strategy
            </p>
          </div>

          {/* Inline Save button — always visible, only disabled while saving */}
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className={`inline-flex items-center justify-center gap-2
                        px-4 sm:px-5 py-2.5 rounded-lg text-sm font-medium
                        flex-shrink-0 transition-all duration-150
                        ${saveStatus === 'saved'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white'}
                        disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            {saveStatus === 'saving' ? (
              <><Loader2 size={15} className="animate-spin" /> <span>Saving…</span></>
            ) : saveStatus === 'saved' ? (
              <><CheckCircle2 size={15} /> <span>Saved</span></>
            ) : (
              <><Save size={15} /> <span>Save Settings</span></>
            )}
          </button>
        </header>

        {/* ═══════════════ VAULT STATUS ═══════════════ */}
        <VaultBanner
          unlocked={unlocked}
          hasStoredKeys={hasStoredKeys}
          password={password}
          passwordError={passwordError}
          busy={unlockBusy}
          onPasswordChange={(v) => { setPassword(v); setPasswordError(''); }}
          onUnlock={unlock}
        />

        {/* ═══════════════ EXCHANGES ═══════════════ */}
        <Section
          icon={Shield}
          title="Exchanges"
          subtitle="API credentials for your trading accounts"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            <ExchangeCard
              name="Binance"
              badge="B"
              accent="amber"
              settings={settings.binance}
              showSecret={showSecrets.binanceSecret}
              onToggleSecret={() =>
                setShowSecrets((s) => ({ ...s, binanceSecret: !s.binanceSecret }))
              }
              onChange={(k, v) => update(`binance.${k}`, v)}
              testStatus={testStatus.binance}
              testMessage={testMessage.binance}
              onTest={() => testConnection('binance')}
              locked={!unlocked && hasStoredKeys}
            />

            <ExchangeCard
              name="Bybit"
              badge="B"
              accent="orange"
              settings={settings.bybit}
              showSecret={showSecrets.bybitSecret}
              onToggleSecret={() =>
                setShowSecrets((s) => ({ ...s, bybitSecret: !s.bybitSecret }))
              }
              onChange={(k, v) => update(`bybit.${k}`, v)}
              testStatus={testStatus.bybit}
              testMessage={testMessage.bybit}
              onTest={() => testConnection('bybit')}
              locked={!unlocked && hasStoredKeys}
            />
          </div>

          {/* Security notice */}
          <div className="mt-6 flex items-start gap-3 px-4 py-3.5 rounded-lg
                          bg-amber-500/[0.04] border border-amber-500/15">
            <AlertTriangle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed">
              <p className="text-amber-300/90 font-medium mb-0.5">
                Keep your keys safe
              </p>
              <p className="text-slate-500">
                Keys are encrypted locally with AES-256-GCM. Never enable
                withdrawal permissions. Restrict keys to your IP where possible.
              </p>
            </div>
          </div>
        </Section>

        {/* ═══════════════ RISK ═══════════════ */}
        <Section
          icon={ShieldCheck}
          title="Risk Management"
          subtitle="Capital exposure and stop parameters per trade"
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <NumberField
              label="Position size"
              hint="Per trade"
              suffix="%"
              value={settings.risk.positionSize}
              onChange={(v) => update('risk.positionSize', v)}
              min={0.1} max={10} step={0.1}
            />
            <NumberField
              label="Stop loss"
              hint="From entry"
              suffix="%"
              value={settings.risk.stopLoss}
              onChange={(v) => update('risk.stopLoss', v)}
              min={0.5} max={20} step={0.1}
            />
            <NumberField
              label="Take profit"
              hint="From entry"
              suffix="%"
              value={settings.risk.takeProfit}
              onChange={(v) => update('risk.takeProfit', v)}
              min={1} max={50} step={0.1}
            />
            <NumberField
              label="Max drawdown"
              hint="Circuit breaker"
              suffix="%"
              value={settings.risk.maxDrawdown}
              onChange={(v) => update('risk.maxDrawdown', v)}
              min={5} max={50} step={1}
            />
          </div>

          {/* Computed previews */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <PreviewCard
              icon={Percent}
              label="Risk / Reward"
              value={`1 : ${rrRatio.toFixed(2)}`}
              sub="Reward per unit of risk"
            />
            <PreviewCard
              icon={TrendingUp}
              label="Breakeven win rate"
              value={`${breakevenWinRate.toFixed(1)}%`}
              sub="Minimum to stay profitable"
            />
            <PreviewCard
              icon={Activity}
              label="Max concurrent"
              value={maxPositions}
              sub="Open positions at once"
            />
          </div>
        </Section>

        {/* ═══════════════ TRADING ═══════════════ */}
        <Section
          icon={Activity}
          title="Trading Configuration"
          subtitle="Active strategy, timeframe, and monitored pairs"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <SelectField
              label="Active exchange"
              value={settings.trading.activeExchange}
              onChange={(v) => update('trading.activeExchange', v)}
              options={[
                { value: 'binance', label: 'Binance' },
                { value: 'bybit',   label: 'Bybit' }
              ]}
            />
            <SelectField
              label="Strategy"
              value={settings.trading.strategy}
              onChange={(v) => update('trading.strategy', v)}
              options={[
                { value: 'EMA',      label: 'EMA Crossover' },
                { value: 'RSI',      label: 'RSI' },
                { value: 'COMBINED', label: 'Combined' }
              ]}
            />
            <SelectField
              label="Timeframe"
              value={settings.trading.timeframe}
              onChange={(v) => update('trading.timeframe', v)}
              options={[
                { value: '1m',  label: '1 minute' },
                { value: '5m',  label: '5 minutes' },
                { value: '15m', label: '15 minutes' },
                { value: '1h',  label: '1 hour' },
                { value: '4h',  label: '4 hours' },
                { value: '1d',  label: '1 day' }
              ]}
            />
            <TextField
              label="Trading pairs"
              hint="Comma separated"
              value={settings.trading.symbols.join(', ')}
              onChange={(v) =>
                update(
                  'trading.symbols',
                  v.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
                )
              }
              placeholder="BTCUSDT, ETHUSDT"
            />
          </div>

          {settings.trading.symbols.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {settings.trading.symbols.map((s) => (
                <span
                  key={s}
                  className="text-[11px] font-mono px-2 py-1 rounded-md
                             bg-slate-800/60 text-slate-300 border border-slate-700/50"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </Section>

        {/* ═══════════════ BOTTOM SAVE BUTTON ═══════════════ */}
        <div className="mt-12 pt-8 border-t border-slate-800/60 flex flex-col sm:flex-row
                        items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2.5 text-xs">
            {saveStatus === 'saving' && (
              <>
                <Loader2 size={13} className="text-indigo-400 animate-spin" />
                <span className="text-slate-400">Saving…</span>
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <CheckCircle2 size={13} className="text-emerald-400" />
                <span className="text-emerald-400">All changes saved</span>
              </>
            )}
            {saveStatus === 'idle' && isDirty && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span className="text-amber-300/90">Unsaved changes</span>
              </>
            )}
            {saveStatus === 'idle' && !isDirty && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                <span className="text-slate-500">All changes saved</span>
              </>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className={`inline-flex items-center gap-2
                        px-5 py-2.5 rounded-lg text-sm font-medium
                        transition-all duration-150
                        ${saveStatus === 'saved'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white'}
                        disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            {saveStatus === 'saving' ? (
              <><Loader2 size={15} className="animate-spin" /> Saving…</>
            ) : saveStatus === 'saved' ? (
              <><CheckCircle2 size={15} /> Saved</>
            ) : (
              <><Save size={15} /> Save Settings</>
            )}
          </button>
        </div>
      </div>

      {/* ═══════════════ GLOBAL INPUT STYLES ═══════════════ */}
      <style>{`
        .input {
          width: 100%;
          padding: 0.625rem 0.875rem;
          background-color: rgb(10 14 23 / 0.6);
          border: 1px solid rgb(30 41 59 / 0.8);
          border-radius: 0.5rem;
          color: rgb(226 232 240);
          font-size: 0.875rem;
          line-height: 1.25rem;
          outline: none;
          transition: border-color 0.15s ease, background-color 0.15s ease;
        }
        .input::placeholder { color: rgb(71 85 105); }
        .input:hover:not(:disabled):not(:focus) { border-color: rgb(51 65 85); }
        .input:focus {
          border-color: rgb(99 102 241 / 0.6);
          background-color: rgb(10 14 23 / 0.9);
        }
        .input:disabled { opacity: 0.5; cursor: not-allowed; }
        select.input {
          cursor: pointer;
          appearance: none;
          padding-right: 2.25rem;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 0.875rem center;
        }
        .input[type="number"]::-webkit-outer-spin-button,
        .input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .input[type="number"] { -moz-appearance: textfield; }
      `}</style>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════ */

/* ─── Vault banner ─── */
const VaultBanner = ({
  unlocked, hasStoredKeys, password, passwordError,
  busy, onPasswordChange, onUnlock
}) => {
  if (unlocked && hasStoredKeys) return null;

  const isNew = !hasStoredKeys;

  return (
    <section className="mb-8 sm:mb-10 rounded-xl border border-slate-800/80 bg-slate-900/30 p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`flex-shrink-0 p-2 rounded-lg ${
            unlocked
              ? 'bg-emerald-500/10 ring-1 ring-emerald-500/20'
              : 'bg-amber-500/10 ring-1 ring-amber-500/20'
          }`}>
            {unlocked
              ? <Unlock size={15} className="text-emerald-400" />
              : <Lock size={15} className="text-amber-400" />}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-slate-100">
              {unlocked
                ? 'Vault unlocked'
                : isNew
                  ? 'Set an encryption password'
                  : 'Vault locked'}
            </h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              {unlocked
                ? 'Your API keys are decrypted and ready to use.'
                : isNew
                  ? 'Required to encrypt your API keys before saving.'
                  : 'Enter your password to view and edit saved API keys.'}
            </p>
          </div>
        </div>

        {!unlocked && (
          <div className="flex items-stretch gap-2 sm:flex-shrink-0 w-full sm:w-auto sm:min-w-[320px]">
            <div className="relative flex-1">
              <KeyRound
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                onKeyDown={(e) =>
                  e.key === 'Enter' && !busy && password.length >= 8 && onUnlock()
                }
                placeholder={isNew ? 'New password · min 8 chars' : 'Password'}
                className="input font-mono text-sm pl-9"
                autoComplete="new-password"
              />
            </div>
            <button
              onClick={onUnlock}
              disabled={busy || password.length < 8}
              className="inline-flex items-center gap-1.5 px-4 rounded-lg text-sm font-medium
                         bg-indigo-600 hover:bg-indigo-500 text-white
                         disabled:opacity-40 disabled:cursor-not-allowed transition-colors
                         flex-shrink-0"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Unlock size={14} />}
              <span className="hidden sm:inline">{isNew ? 'Set' : 'Unlock'}</span>
              <span className="sm:hidden">{isNew ? 'Set' : 'Go'}</span>
            </button>
          </div>
        )}
      </div>

      {passwordError && (
        <div className="mt-3 flex items-center gap-2 text-xs text-rose-400">
          <XCircle size={12} />
          <span>{passwordError}</span>
        </div>
      )}
    </section>
  );
};

/* ─── Section wrapper ─── */
const Section = ({ icon: Icon, title, subtitle, children }) => (
  <section className="mb-8 sm:mb-12 last:mb-0">
    <div className="mb-5 sm:mb-6 flex items-start gap-3">
      <div className="flex-shrink-0 p-2 rounded-lg bg-slate-800/50 ring-1 ring-slate-700/50">
        <Icon size={15} className="text-slate-400" />
      </div>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-slate-100 tracking-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{subtitle}</p>
        )}
      </div>
    </div>
    {children}
  </section>
);

/* ─── Exchange card ─── */
const ExchangeCard = ({
  name, badge, accent, settings, showSecret, onToggleSecret,
  onChange, testStatus, testMessage, onTest, locked
}) => {
  const accents = {
    amber:  { text: 'text-amber-400',  bg: 'bg-amber-500/10',  ring: 'ring-amber-500/20' },
    orange: { text: 'text-orange-400', bg: 'bg-orange-500/10', ring: 'ring-orange-500/20' }
  }[accent];

  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/20
                    p-4 sm:p-5 flex flex-col gap-4
                    hover:border-slate-800 transition-colors">

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-lg ${accents.bg} ring-1 ${accents.ring}
                           flex items-center justify-center flex-shrink-0`}>
            <span className={`text-sm font-bold ${accents.text}`}>{badge}</span>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-100 truncate">{name}</h3>
            <p className="text-[11px] text-slate-500">Spot & Futures</p>
          </div>
        </div>

        <TestBadge status={testStatus} message={testMessage} />
      </div>

      <div className="space-y-3">
        <div>
          <FieldLabel>API Key</FieldLabel>
          <input
            type="text"
            value={settings.apiKey}
            onChange={(e) => onChange('apiKey', e.target.value)}
            disabled={locked}
            className="input font-mono text-xs"
            placeholder={locked ? 'Locked' : 'Paste your API key'}
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        <div>
          <FieldLabel>API Secret</FieldLabel>
          <div className="relative">
            <input
              type={showSecret ? 'text' : 'password'}
              value={settings.apiSecret}
              onChange={(e) => onChange('apiSecret', e.target.value)}
              disabled={locked}
              className="input font-mono text-xs pr-10"
              placeholder={locked ? 'Locked' : '••••••••••••••••'}
              spellCheck={false}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={onToggleSecret}
              disabled={locked}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded
                         text-slate-500 hover:text-slate-300 hover:bg-slate-800/60
                         disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label={showSecret ? 'Hide secret' : 'Show secret'}
            >
              {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 mt-auto">
        <Toggle
          checked={settings.testnet}
          onChange={(v) => onChange('testnet', v)}
          label="Testnet"
        />
        <button
          onClick={onTest}
          disabled={testStatus === 'testing' || locked}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                     bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-slate-100
                     border border-slate-700/60 hover:border-slate-600
                     disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {testStatus === 'testing'
            ? <><Loader2 size={11} className="animate-spin" /> Testing</>
            : <><ChevronRight size={11} /> Test</>}
        </button>
      </div>
    </div>
  );
};

/* ─── Test status badge ─── */
const TestBadge = ({ status, message }) => {
  if (status === 'idle') return null;

  const config = {
    testing: { color: 'text-slate-400',   Icon: Loader2,      spin: true  },
    success: { color: 'text-emerald-400', Icon: CheckCircle2, spin: false },
    error:   { color: 'text-rose-400',    Icon: XCircle,      spin: false }
  }[status];

  const { color, Icon, spin } = config;

  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium
                      ${color} flex-shrink-0`}>
      <Icon size={11} className={spin ? 'animate-spin' : ''} />
      <span className="hidden sm:inline max-w-[120px] truncate">
        {status === 'testing' ? 'Testing' : message}
      </span>
    </span>
  );
};

/* ─── Field label ─── */
const FieldLabel = ({ children }) => (
  <label className="block text-[11px] font-medium text-slate-500
                    uppercase tracking-wider mb-1.5">
    {children}
  </label>
);

/* ─── Number field ─── */
const NumberField = ({ label, hint, suffix, value, onChange, min, max, step }) => (
  <div className="min-w-0">
    <FieldLabel>{label}</FieldLabel>
    <div className="relative">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        min={min} max={max} step={step}
        className="input font-mono pr-9"
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs
                         text-slate-500 font-mono pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
    {hint && <p className="text-[10px] text-slate-600 mt-1.5">{hint}</p>}
  </div>
);

/* ─── Text field ─── */
const TextField = ({ label, hint, value, onChange, placeholder }) => (
  <div className="min-w-0">
    <FieldLabel>{label}</FieldLabel>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="input font-mono"
      placeholder={placeholder}
      spellCheck={false}
    />
    {hint && <p className="text-[10px] text-slate-600 mt-1.5">{hint}</p>}
  </div>
);

/* ─── Select field ─── */
const SelectField = ({ label, value, onChange, options }) => (
  <div className="min-w-0">
    <FieldLabel>{label}</FieldLabel>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="input"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  </div>
);

/* ─── Preview card ─── */
const PreviewCard = ({ icon: Icon, label, value, sub }) => (
  <div className="rounded-xl border border-slate-800/80 bg-slate-900/20
                  p-4 hover:border-slate-800 transition-colors">
    <div className="flex items-center gap-2 mb-2">
      <Icon size={12} className="text-slate-500" />
      <span className="text-[10px] font-medium text-slate-500
                       uppercase tracking-wider">
        {label}
      </span>
    </div>
    <div className="text-xl font-semibold font-mono tracking-tight text-slate-100">
      {value}
    </div>
    {sub && <p className="text-[10px] text-slate-600 mt-1.5">{sub}</p>}
  </div>
);

/* ─── Toggle switch ─── */
const Toggle = ({ checked, onChange, label }) => (
  <label className="flex items-center gap-2.5 cursor-pointer select-none">
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-4 w-7 items-center rounded-full
                  transition-colors duration-200 flex-shrink-0 ${
        checked ? 'bg-emerald-500' : 'bg-slate-700'
      }`}
    >
      <span
        className={`inline-block h-3 w-3 transform rounded-full bg-white
                    shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-[14px]' : 'translate-x-0.5'
        }`}
      />
    </button>
    <span className={`text-xs font-medium ${checked ? 'text-slate-300' : 'text-slate-500'}`}>
      {label}
    </span>
  </label>
);

export default Settings;