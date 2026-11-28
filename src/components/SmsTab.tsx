import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  Copy,
  History,
  Loader2,
  MessageSquareText,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Smartphone,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  Wallet,
  XCircle,
} from 'lucide-react';
import type {
  LowestNumberDeal,
  NumberCountryOption,
  NumberProviderId,
  NumberProviderQuote,
  NumberServiceOption,
  PrivateNumberOrder,
} from '../types';
import { formatRelativeTime } from '../utils/clipboard';
import { AppLogo } from './AppLogo';
import { CountryFlag } from './CountryFlag';

interface SmsTabProps {
  fiveSimConfigured: boolean;
  grizzlyConfigured: boolean;
  services: NumberServiceOption[];
  selectedService: NumberServiceOption | null;
  servicesLoading: boolean;
  countries: NumberCountryOption[];
  selectedCountry: NumberCountryOption | null;
  selectedProviderQuote: NumberProviderQuote | null;
  countriesLoading: boolean;
  lowestDeals: LowestNumberDeal[];
  lowestDealsLoading: boolean;
  quantity: number;
  walletBalance?: number;
  reservedBalance?: number;
  activeOrders: PrivateNumberOrder[];
  selectedOrder: PrivateNumberOrder | null;
  acquiring: boolean;
  acquireError: string | null;
  streamConnected: boolean;
  numberHistory: PrivateNumberOrder[];
  viewMode: 'setup' | 'receiver' | 'history';
  onChangeViewMode: (mode: 'setup' | 'receiver' | 'history') => void;
  onSelectService: (service: NumberServiceOption) => void;
  onSelectCountry: (country: NumberCountryOption) => void;
  onSelectProviderQuote: (quote: NumberProviderQuote) => void;
  onSelectLowestDeal: (deal: LowestNumberDeal) => void;
  onRefreshLowestDeals: () => void;
  onRefreshCountries: () => void;
  onChangeQuantity: (qty: number) => void;
  onOpenDeposit?: () => void;
  onAcquireNumbers: () => void;
  onSelectOrder: (order: PrivateNumberOrder) => void;
  onCheckOrder: (orderId: number) => void;
  onCancelOrder: (orderId: number) => void;
  onSwapNumber?: (order: PrivateNumberOrder) => void;
  onFinishOrder: (orderId: number) => void;
  onReuseFromHistory: (order: PrivateNumberOrder) => void;
  onDeleteFromHistory: (orderId: number) => void;
  onCopyText: (
    value: string,
    label: string,
    otpMeta?: { source: string; channel: 'SMS' | 'Email' }
  ) => void;
}

const QUANTITY_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  RUB: '₽',
  EUR: '€',
  GBP: '£',
  NGN: '₦',
};

function formatPrice(amount?: number, currency = 'NGN'): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return '—';
  const code = (currency || 'NGN').toUpperCase();
  const symbol = CURRENCY_SYMBOLS[code] || '₦';
  if (code === 'NGN') {
    return `${symbol}${Math.round(amount).toLocaleString('en-US')}`;
  }
  const formatted = amount >= 0.01 ? amount.toFixed(2) : amount.toFixed(3);
  return `${symbol}${formatted}`;
}

function formatUsdCompact(amount?: number): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return '';
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  const three = Number(amount.toFixed(3));
  const two = Number(amount.toFixed(2));
  if (Math.abs(three - two) >= 0.0009 && three > 0) {
    return `$${three.toFixed(3)}`;
  }
  return `$${amount >= 0.01 ? amount.toFixed(2) : amount.toFixed(3)}`;
}

function formatStock(count?: number): string {
  if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return '0';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 10_000) return `${Math.round(count / 1_000)}K`;
  return count.toLocaleString();
}

const POPULAR_QUICK_APPS = [
  { id: 'whatsapp', label: 'WhatsApp', aliases: ['whatsapp', 'wa'] },
  { id: 'telegram', label: 'Telegram', aliases: ['telegram', 'tg'] },
  { id: 'tiktok', label: 'TikTok', aliases: ['tiktok', 'lf'] },
  { id: 'instagram', label: 'Instagram', aliases: ['instagram', 'ig'] },
  { id: 'google', label: 'Google', aliases: ['google', 'go', 'gmail'] },
  { id: 'facebook', label: 'Facebook', aliases: ['facebook', 'fb'] },
  { id: 'twitter', label: 'X / Twitter', aliases: ['twitter', 'tw', 'x / twitter'] },
  { id: 'paypal', label: 'PayPal', aliases: ['paypal', 'ts'] },
];

const SMS_SOUND_PREF_KEY = 'veribox_sms_sound_v1';

function formatExpiryCountdown(
  expires: string | undefined,
  nowMs: number
): { label: string; expired: boolean } | null {
  if (!expires) return null;
  const target = Date.parse(expires);
  if (!Number.isFinite(target)) return null;
  const diffSec = Math.floor((target - nowMs) / 1000);
  if (diffSec <= 0) return { label: 'Expired', expired: true };
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return {
    label: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} left`,
    expired: false,
  };
}

function playSmsArrivalChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const playTone = (freq: number, startOffset: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.14, now + startOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
    };

    playTone(587.33, 0, 0.16); // D5
    playTone(880.0, 0.14, 0.24); // A5
    window.setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 600);
  } catch {
    // Ignore browser autoplay restrictions
  }
}

function getProviderLabel(provider?: NumberProviderId): string {
  return provider === 'grizzly' ? 'Grizzly SMS' : '5sim';
}

export function SmsTab({
  fiveSimConfigured,
  grizzlyConfigured,
  services,
  selectedService,
  servicesLoading,
  countries,
  selectedCountry,
  selectedProviderQuote,
  countriesLoading,
  lowestDeals,
  lowestDealsLoading,
  quantity,
  walletBalance,
  reservedBalance = 0,
  activeOrders,
  selectedOrder,
  acquiring,
  acquireError,
  streamConnected,
  numberHistory,
  viewMode,
  onChangeViewMode,
  onSelectService,
  onSelectCountry,
  onSelectProviderQuote,
  onSelectLowestDeal,
  onRefreshLowestDeals,
  onRefreshCountries,
  onChangeQuantity,
  onOpenDeposit,
  onAcquireNumbers,
  onSelectOrder,
  onCheckOrder,
  onCancelOrder,
  onSwapNumber,
  onFinishOrder,
  onReuseFromHistory,
  onDeleteFromHistory,
  onCopyText,
}: SmsTabProps) {
  const [appDropdownOpen, setAppDropdownOpen] = useState(false);
  const [appSearch, setAppSearch] = useState('');
  const [countryDropdownOpen, setCountryDropdownOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [countrySort, setCountrySort] = useState<'az' | 'lowest' | 'instock'>('az');
  const [countryBudget, setCountryBudget] = useState<'all' | 'under500' | 'under1500'>('all');
  const [showAllDeals, setShowAllDeals] = useState(false);
  const [qtyDropdownOpen, setQtyDropdownOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SMS_SOUND_PREF_KEY) !== 'false';
    } catch {
      return true;
    }
  });
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const appRef = useRef<HTMLDivElement | null>(null);
  const countryRef = useRef<HTMLDivElement | null>(null);
  const qtyRef = useRef<HTMLDivElement | null>(null);
  const prevSmsTrackerRef = useRef<{ orderId: number | null; count: number }>({
    orderId: null,
    count: 0,
  });

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (appRef.current && !appRef.current.contains(target)) setAppDropdownOpen(false);
      if (countryRef.current && !countryRef.current.contains(target)) setCountryDropdownOpen(false);
      if (qtyRef.current && !qtyRef.current.contains(target)) setQtyDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    if (viewMode !== 'receiver' || !selectedOrder?.expires) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [viewMode, selectedOrder?.id, selectedOrder?.expires]);

  useEffect(() => {
    if (!selectedOrder) {
      prevSmsTrackerRef.current = { orderId: null, count: 0 };
      return;
    }
    const prev = prevSmsTrackerRef.current;
    const nextCount = selectedOrder.sms.length;
    if (prev.orderId === selectedOrder.id && nextCount > prev.count && soundEnabled) {
      playSmsArrivalChime();
    }
    prevSmsTrackerRef.current = { orderId: selectedOrder.id, count: nextCount };
  }, [selectedOrder?.id, selectedOrder?.sms.length, soundEnabled, selectedOrder]);

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SMS_SOUND_PREF_KEY, String(next));
      } catch {
        // Ignore storage error
      }
      return next;
    });
  };

  const quickPopularApps = useMemo(() => {
    if (services.length === 0) return [];
    const matched: NumberServiceOption[] = [];
    const seen = new Set<string>();
    for (const preset of POPULAR_QUICK_APPS) {
      const found = services.find((s) => {
        const sid = s.id.toLowerCase();
        const sname = s.name.toLowerCase();
        return preset.aliases.some((alias) => sid === alias || sname.includes(alias));
      });
      if (found && !seen.has(found.id)) {
        seen.add(found.id);
        matched.push(found);
      }
    }
    return matched;
  }, [services]);

  const filteredServices = useMemo(() => {
    const q = appSearch.trim().toLowerCase();
    if (!q) return services.slice(0, 120);
    return services
      .filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
      .slice(0, 120);
  }, [services, appSearch]);

  const filteredCountries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    let list = q
      ? countries.filter(
          (c) =>
            c.country.toLowerCase().includes(q) ||
            c.countryCode.toLowerCase().includes(q) ||
            c.dialCode.includes(q)
        )
      : [...countries];

    if (countryBudget === 'under500') {
      list = list.filter((c) => (c.minPrice || 0) > 0 && (c.minPrice || 0) <= 500);
    } else if (countryBudget === 'under1500') {
      list = list.filter((c) => (c.minPrice || 0) > 0 && (c.minPrice || 0) <= 1500);
    }

    if (countrySort === 'instock') {
      list = list.filter((c) => (c.stockCount || 0) > 0);
      list.sort((a, b) => (b.stockCount || 0) - (a.stockCount || 0));
    } else if (countrySort === 'lowest') {
      list.sort((a, b) => {
        const pa = a.minPrice && a.minPrice > 0 ? a.minPrice : Number.MAX_SAFE_INTEGER;
        const pb = b.minPrice && b.minPrice > 0 ? b.minPrice : Number.MAX_SAFE_INTEGER;
        return pa - pb || a.country.localeCompare(b.country);
      });
    } else {
      list.sort((a, b) => a.country.localeCompare(b.country));
    }
    return list;
  }, [countries, countrySearch, countrySort, countryBudget]);

  const cheapestCountryOption = useMemo(() => {
    const priced = countries.filter((c) => (c.minPrice || 0) > 0);
    if (priced.length === 0) return null;
    const inStock = priced.filter((c) => (c.stockCount || 0) > 0);
    const pool = inStock.length > 0 ? inStock : priced;
    return pool.reduce((best, cur) =>
      (cur.minPrice || Number.MAX_SAFE_INTEGER) < (best.minPrice || Number.MAX_SAFE_INTEGER)
        ? cur
        : best
    );
  }, [countries]);

  const lowestCountryPrice = useMemo(() => {
    const prices = countries
      .map((c) => c.minPrice || 0)
      .filter((p) => p > 0);
    return prices.length > 0 ? Math.min(...prices) : 0;
  }, [countries]);

  const handleCopy = (key: string, value: string, label: string, otpSource?: string) => {
    onCopyText(value, label, otpSource ? { source: otpSource, channel: 'SMS' } : undefined);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1600);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Top Mode Switcher: Get Number | History */}
      <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-[#D4AF37]/25 bg-white p-1.5 dark:bg-[#14120D]">
        <button
          type="button"
          onClick={() =>
            onChangeViewMode(
              viewMode === 'history'
                ? activeOrders.length > 0
                  ? 'receiver'
                  : 'setup'
                : viewMode
            )
          }
          className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-extrabold transition-colors whitespace-nowrap ${
            viewMode !== 'history'
              ? 'bg-[#D4AF37] text-[#0A0906]'
              : 'text-[#6E6552] hover:bg-[#D4AF37]/10 dark:text-[#D5CCB8]'
          }`}
        >
          <Smartphone className="h-3.5 w-3.5 shrink-0" />
          <span>Get Number</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeViewMode('history')}
          className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-extrabold transition-colors whitespace-nowrap ${
            viewMode === 'history'
              ? 'bg-[#D4AF37] text-[#0A0906]'
              : 'text-[#6E6552] hover:bg-[#D4AF37]/10 dark:text-[#D5CCB8]'
          }`}
        >
          <History className="h-3.5 w-3.5 shrink-0" />
          <span>History ({numberHistory.length})</span>
        </button>
      </div>

      {/* VIEW 1: PROGRESSIVE SETUP (1. Select App -> 2. Select Country sorted by Lowest Price -> 3. Quantity & Continue) */}
      {viewMode === 'setup' && (
        <section className="rounded-3xl border border-[#D4AF37]/30 bg-white p-5 shadow-lg sm:p-6 dark:bg-[#14120D]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-xl font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
                Get a Dedicated Phone Number
              </h1>
              <p className="mt-0.5 text-xs text-[#6E6552] dark:text-[#A89F8C]">
                {selectedService
                  ? selectedCountry
                    ? 'Compare both server options below, pick your quantity, and buy'
                    : `Select a country (A–Z) to compare live lowest rates for ${selectedService.name}`
                  : 'Choose the app you want to verify'}
              </p>
            </div>

            {activeOrders.length > 0 && (
              <button
                type="button"
                onClick={() => onChangeViewMode('receiver')}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#D4AF37]/35 px-3 py-1.5 text-xs font-bold text-[#8A6208] hover:bg-[#D4AF37]/10 shrink-0 dark:text-[#F5D77A]"
              >
                <span>Active ({activeOrders.length})</span>
              </button>
            )}
          </div>

          {!fiveSimConfigured && !grizzlyConfigured && (
            <div className="mt-4 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4">
              <div className="flex items-start gap-2.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                <div>
                  <p className="font-bold">Number API keys not set on server</p>
                  <p className="mt-0.5 opacity-90">
                    Add <code className="font-mono">GRIZZLYSMS_API_KEY</code> and/or{' '}
                    <code className="font-mono">FIVESIM_API_KEY</code> in your Vercel or server
                    environment variables to purchase dedicated numbers. Live lowest prices are shown
                    below.
                  </p>
                </div>
              </div>
            </div>
          )}

          {acquireError && (
            <div className="mt-4 rounded-xl border border-rose-500/35 bg-rose-500/10 p-3.5 text-xs font-medium text-rose-700 dark:text-rose-200">
              {acquireError}
            </div>
          )}

          {/* Live Lowest Prices Across Popular Apps */}
          {!selectedService && (lowestDeals.length > 0 || lowestDealsLoading) && (
            <div className="mt-4 rounded-2xl border border-[#D4AF37]/25 bg-[#FAF7F0] p-3.5 dark:bg-[#0B0A07]">
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <p className="text-xs font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
                  Lowest Live Prices Right Now
                </p>
                <button
                  type="button"
                  onClick={onRefreshLowestDeals}
                  disabled={lowestDealsLoading}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#D4AF37]/30 px-2 py-1 text-[11px] font-bold text-[#8A6208] hover:bg-[#D4AF37]/10 disabled:opacity-60 dark:text-[#F5D77A]"
                >
                  <RefreshCw className={`h-3 w-3 ${lowestDealsLoading ? 'animate-spin' : ''}`} />
                  <span>Track Lowest</span>
                </button>
              </div>
              {lowestDealsLoading && lowestDeals.length === 0 ? (
                <div className="flex items-center gap-2 py-3 text-xs text-[#8A7F6A]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#D4AF37]" />
                  <span>Scanning lowest country prices...</span>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {lowestDeals.slice(0, showAllDeals ? 8 : 4).map((deal) => (
                      <button
                        key={`${deal.serviceId}-${deal.slug}`}
                        type="button"
                        onClick={() => onSelectLowestDeal(deal)}
                        className="flex items-center justify-between gap-2 rounded-xl border border-[#D4AF37]/25 bg-white px-2.5 py-2 text-left transition-colors hover:border-[#D4AF37] dark:bg-[#14120D]"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <AppLogo id={deal.serviceId} name={deal.serviceName} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
                              {deal.serviceName}
                            </p>
                            <p className="truncate text-[10px] text-[#6E6552] dark:text-[#A89F8C]">
                              {deal.country} · {deal.providerName || getProviderLabel(deal.provider)}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 font-mono text-xs font-extrabold text-emerald-700 tabular-nums dark:text-emerald-300">
                          {formatPrice(deal.minPrice, deal.currency)}
                        </span>
                      </button>
                    ))}
                  </div>
                  {lowestDeals.length > 4 && (
                    <button
                      type="button"
                      onClick={() => setShowAllDeals((prev) => !prev)}
                      className="mt-2.5 inline-flex w-full items-center justify-center rounded-xl border border-[#D4AF37]/25 py-1.5 text-[11px] font-bold text-[#8A6208] hover:bg-[#D4AF37]/10 dark:text-[#F5D77A]"
                    >
                      {showAllDeals
                        ? 'Show less'
                        : `Show more (${Math.min(lowestDeals.length, 8) - 4} more deals)`}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          <div className="mt-5 space-y-4">
            {/* STEP 1: Select App Dropdown */}
            <div className="relative" ref={appRef}>
              <label className="mb-1.5 block text-xs font-bold text-[#6E6552] dark:text-[#A89F8C]">
                1. Select App
              </label>
              <button
                type="button"
                onClick={() => {
                  setAppDropdownOpen((prev) => !prev);
                  setCountryDropdownOpen(false);
                  setQtyDropdownOpen(false);
                }}
                className="flex h-12 w-full items-center justify-between gap-3 rounded-xl border border-[#D4AF37]/35 bg-[#FAF7F0] px-3.5 text-left text-sm font-bold text-[#1A160D] transition-colors hover:border-[#D4AF37] dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  {selectedService ? (
                    <>
                      <AppLogo id={selectedService.id} name={selectedService.name} size="md" />
                      <span className="truncate">{selectedService.name}</span>
                    </>
                  ) : (
                    <span className="truncate text-[#8A7F6A]">
                      {servicesLoading && services.length === 0
                        ? 'Loading apps...'
                        : 'Select App (WhatsApp, TikTok, Instagram...)'}
                    </span>
                  )}
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-[#D4AF37] transition-transform ${
                    appDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {appDropdownOpen && (
                <div className="absolute left-0 right-0 z-40 mt-1.5 overflow-hidden rounded-2xl border border-[#D4AF37]/35 bg-white shadow-2xl dark:bg-[#14120D]">
                  <div className="border-b border-[#D4AF37]/15 p-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8A7F6A]" />
                      <input
                        type="search"
                        value={appSearch}
                        onChange={(e) => setAppSearch(e.target.value)}
                        placeholder={`Search ${services.length}+ apps (TikTok, WhatsApp, Instagram...)`}
                        className="h-9 w-full rounded-lg border border-[#D4AF37]/20 bg-[#FAF7F0] pl-8 pr-3 text-xs text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
                      />
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto p-1.5 space-y-1">
                    {filteredServices.length === 0 ? (
                      <p className="py-4 text-center text-xs text-[#8A7F6A]">No apps found</p>
                    ) : (
                      filteredServices.map((svc) => {
                        const isSelected = selectedService?.id === svc.id;
                        return (
                          <button
                            key={svc.id}
                            type="button"
                            onClick={() => {
                              onSelectService(svc);
                              setAppDropdownOpen(false);
                              setAppSearch('');
                            }}
                            className={`flex min-h-[44px] w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                              isSelected
                                ? 'bg-[#D4AF37]/20 font-bold text-[#1A160D] dark:text-[#F5D77A]'
                                : 'text-[#3E3522] hover:bg-[#D4AF37]/10 dark:text-[#EAE2CF]'
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <AppLogo id={svc.id} name={svc.name} size="md" />
                              <span className="truncate font-semibold">{svc.name}</span>
                            </div>
                            {isSelected && <Check className="h-4 w-4 shrink-0 text-[#D4AF37]" />}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Quick 1-Tap Popular Apps */}
              {quickPopularApps.length > 0 && !appDropdownOpen && (
                <div className="mt-2.5">
                  <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-[#8A7F6A] dark:text-[#A89F8C]">
                    Popular 1-Tap Apps
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {quickPopularApps.map((svc) => {
                      const active = selectedService?.id === svc.id;
                      return (
                        <button
                          key={`quick-${svc.id}`}
                          type="button"
                          onClick={() => {
                            onSelectService(svc);
                            setAppDropdownOpen(false);
                          }}
                          className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                            active
                              ? 'border-[#D4AF37] bg-[#D4AF37]/20 text-[#1A160D] dark:text-[#F5D77A]'
                              : 'border-[#D4AF37]/25 bg-[#FAF7F0] text-[#4F4736] hover:border-[#D4AF37] dark:bg-[#0B0A07] dark:text-[#EAE2CF]'
                          }`}
                        >
                          <AppLogo id={svc.id} name={svc.name} size="sm" />
                          <span>{svc.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* STEP 2: Select Country Dropdown — Sorted strictly A to Z */}
            {selectedService && (
              <div className="relative" ref={countryRef}>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-xs font-bold text-[#6E6552] dark:text-[#A89F8C]">
                    2. Select Country ({selectedService.name})
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {!countriesLoading && countries.length > 0 && (
                      <span className="text-[11px] font-bold text-emerald-700 tabular-nums dark:text-emerald-300">
                        {countries.length} countries
                      </span>
                    )}
                    {!countriesLoading && cheapestCountryOption && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectCountry(cheapestCountryOption);
                          setCountryDropdownOpen(false);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                      >
                        <Sparkles className="h-3 w-3" />
                        <span>Pick Cheapest</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onRefreshCountries}
                      disabled={countriesLoading}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#D4AF37]/30 px-2 py-0.5 text-[11px] font-bold text-[#8A6208] hover:bg-[#D4AF37]/10 disabled:opacity-60 dark:text-[#F5D77A]"
                    >
                      <RefreshCw className={`h-3 w-3 ${countriesLoading ? 'animate-spin' : ''}`} />
                      <span>Refresh</span>
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={countriesLoading}
                  onClick={() => {
                    setCountryDropdownOpen((prev) => !prev);
                    setAppDropdownOpen(false);
                    setQtyDropdownOpen(false);
                  }}
                  className="flex h-12 w-full items-center justify-between gap-3 rounded-xl border border-[#D4AF37]/35 bg-[#FAF7F0] px-3.5 text-left text-sm font-bold text-[#1A160D] transition-colors hover:border-[#D4AF37] disabled:opacity-75 dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    {countriesLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#D4AF37]" />
                        <span className="truncate text-xs font-semibold text-[#8A7F6A]">
                          Fetching live country rates (A–Z)...
                        </span>
                      </>
                    ) : selectedCountry ? (
                      <>
                        <CountryFlag code={selectedCountry.countryCode} />
                        <span className="truncate">
                          {selectedCountry.country}{' '}
                          <span className="font-mono text-xs text-[#8A7F6A]">
                            ({selectedCountry.dialCode})
                          </span>
                        </span>
                      </>
                    ) : (
                      <span className="truncate text-[#8A7F6A]">
                        Select Country (A–Z)
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!countriesLoading && selectedCountry?.minPrice ? (
                      <div className="flex flex-col items-end leading-tight">
                        <span className="font-mono text-[11px] font-extrabold text-[#8A6208] tabular-nums dark:text-[#F5D77A]">
                          {formatPrice(selectedCountry.minPrice, selectedCountry.currency)}
                        </span>
                        {selectedCountry.rawPriceUsd ? (
                          <span className="text-[9px] text-[#8A7F6A] tabular-nums dark:text-[#A89F8C]">
                            ≈ {formatUsdCompact(selectedCountry.rawPriceUsd)}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <ChevronDown
                      className={`h-4 w-4 text-[#D4AF37] transition-transform ${
                        countryDropdownOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                </button>

                {countryDropdownOpen && !countriesLoading && (
                  <div className="absolute left-0 right-0 z-40 mt-1.5 overflow-hidden rounded-2xl border border-[#D4AF37]/35 bg-white shadow-2xl dark:bg-[#14120D]">
                    <div className="space-y-2 border-b border-[#D4AF37]/15 p-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8A7F6A]" />
                        <input
                          type="search"
                          value={countrySearch}
                          onChange={(e) => setCountrySearch(e.target.value)}
                          placeholder={`Search ${countries.length} countries`}
                          className="h-9 w-full rounded-lg border border-[#D4AF37]/20 bg-[#FAF7F0] pl-8 pr-3 text-xs text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {(
                          [
                            { id: 'az', label: 'A–Z' },
                            { id: 'lowest', label: 'Lowest ₦' },
                            { id: 'instock', label: 'In Stock' },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setCountrySort(opt.id)}
                            className={`rounded-lg px-2.5 py-1 text-[10.5px] font-extrabold transition-colors ${
                              countrySort === opt.id
                                ? 'bg-[#D4AF37] text-[#0A0906]'
                                : 'bg-[#FAF7F0] text-[#6E6552] hover:bg-[#D4AF37]/15 dark:bg-[#0B0A07] dark:text-[#A89F8C]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                        <span className="mx-0.5 text-[#D4AF37]/40">|</span>
                        {(
                          [
                            { id: 'all', label: 'All ₦' },
                            { id: 'under500', label: '≤ ₦500' },
                            { id: 'under1500', label: '≤ ₦1,500' },
                          ] as const
                        ).map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => setCountryBudget(b.id)}
                            className={`rounded-lg px-2 py-1 text-[10.5px] font-bold transition-colors ${
                              countryBudget === b.id
                                ? 'bg-emerald-600 text-white'
                                : 'bg-[#FAF7F0] text-[#6E6552] hover:bg-emerald-500/15 dark:bg-[#0B0A07] dark:text-[#A89F8C]'
                            }`}
                          >
                            {b.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="max-h-72 overflow-y-auto p-1.5 space-y-1">
                      {filteredCountries.length === 0 ? (
                        <p className="py-4 text-center text-xs text-[#8A7F6A]">
                          No countries available for {selectedService.name}
                        </p>
                      ) : (
                        filteredCountries.map((c) => {
                          const isSelected = selectedCountry?.slug === c.slug;
                          const countryDisplayPrice = c.minPrice || 0;
                          const isLowest =
                            lowestCountryPrice > 0 && countryDisplayPrice === lowestCountryPrice;
                          return (
                            <button
                              key={`${c.slug}-${c.country}`}
                              type="button"
                              onClick={() => {
                                onSelectCountry(c);
                                setCountryDropdownOpen(false);
                                setCountrySearch('');
                              }}
                              className={`flex min-h-[46px] w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                                isSelected
                                  ? 'bg-[#D4AF37]/20 font-bold text-[#1A160D] dark:text-[#F5D77A]'
                                  : 'text-[#3E3522] hover:bg-[#D4AF37]/10 dark:text-[#EAE2CF]'
                              }`}
                            >
                              <div className="flex min-w-0 items-center gap-2.5">
                                <CountryFlag code={c.countryCode} />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <p className="truncate font-semibold">{c.country}</p>
                                    {isLowest && (
                                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300">
                                        Lowest
                                      </span>
                                    )}
                                  </div>
                                  <p className="font-mono text-[11px] text-[#8A7F6A] tabular-nums dark:text-[#A89F8C]">
                                    {c.dialCode}
                                    {c.stockCount ? ` · ${formatStock(c.stockCount)} avail` : ''}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-col items-end shrink-0 leading-tight">
                                <div className="flex items-center gap-1">
                                  <span className="font-mono text-[11px] font-extrabold text-[#8A6208] tabular-nums dark:text-[#F5D77A]">
                                    {formatPrice(countryDisplayPrice, c.currency)}
                                  </span>
                                  {isSelected && <Check className="h-3.5 w-3.5 text-[#D4AF37]" />}
                                </div>
                                {c.rawPriceUsd ? (
                                  <span className="text-[9px] text-[#8A7F6A] tabular-nums dark:text-[#A89F8C]">
                                    ≈ {formatUsdCompact(c.rawPriceUsd)}
                                  </span>
                                ) : null}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 3: Choose Service Provider (2 Options shown immediately after Country is selected) */}
            {selectedService && selectedCountry && (() => {
              const grizzlyQuote =
                selectedCountry.providers?.find((p) => p.provider === 'grizzly') || null;
              const fivesimQuote =
                selectedCountry.providers?.find((p) => p.provider === 'fivesim') || null;

              const twoOptions: Array<{
                provider: NumberProviderId;
                label: string;
                subtitle: string;
                quote: NumberProviderQuote | null;
                envVar: string;
              }> = [
                {
                  provider: 'grizzly',
                  label: 'Grizzly SMS',
                  subtitle: 'Low-rate global pool',
                  quote: grizzlyQuote,
                  envVar: 'GRIZZLYSMS_API_KEY',
                },
                {
                  provider: 'fivesim',
                  label: '5sim',
                  subtitle: 'Dedicated operator pool',
                  quote: fivesimQuote,
                  envVar: 'FIVESIM_API_KEY',
                },
              ];

              // Order cheapest available quote first so lowest price appears top-left
              twoOptions.sort((a, b) => {
                const pa = a.quote?.minPrice || Number.MAX_SAFE_INTEGER;
                const pb = b.quote?.minPrice || Number.MAX_SAFE_INTEGER;
                return pa - pb;
              });

              const lowestAvailableQuotePrice = Math.min(
                ...[grizzlyQuote?.minPrice, fivesimQuote?.minPrice].filter(
                  (v): v is number => typeof v === 'number' && v > 0
                )
              );

              const activeQuote =
                selectedProviderQuote ||
                selectedCountry.providers?.[0] ||
                null;
              const checkoutUnitNgn =
                activeQuote?.minPrice ||
                selectedCountry.minPrice ||
                activeQuote?.inStockMinPrice ||
                selectedCountry.inStockMinPrice;
              const checkoutUnitUsd =
                activeQuote?.rawPriceUsd ||
                selectedCountry.rawPriceUsd ||
                activeQuote?.inStockPriceUsd ||
                selectedCountry.inStockPriceUsd;
              const activeProviderConfigured = Boolean(activeQuote?.configured);

              return (
                <>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <label className="block text-xs font-bold text-[#6E6552] dark:text-[#A89F8C]">
                        3. Choose Service Option (2 Providers)
                      </label>
                      <span className="text-[11px] font-semibold text-[#8A7F6A] dark:text-[#A89F8C]">
                        Live lowest prices compared
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {twoOptions.map((opt) => {
                        const q = opt.quote;
                        const isSelected = Boolean(
                          q && activeQuote && q.provider === activeQuote.provider
                        );
                        const isCheapest =
                          Boolean(q) &&
                          Number.isFinite(lowestAvailableQuotePrice) &&
                          q!.minPrice === lowestAvailableQuotePrice;
                        const unitUsd = q?.rawPriceUsd || 0;

                        return (
                          <button
                            key={opt.provider}
                            type="button"
                            disabled={!q}
                            onClick={() => {
                              if (q) onSelectProviderQuote(q);
                            }}
                            className={`flex flex-col justify-between gap-2 rounded-2xl border p-3 text-left transition-all ${
                              !q
                                ? 'cursor-not-allowed border-[#D4AF37]/15 bg-[#FAF7F0]/50 opacity-60 dark:bg-[#0B0A07]/60'
                                : isSelected
                                  ? 'border-[#D4AF37] bg-[#D4AF37]/15 shadow-sm'
                                  : 'border-[#D4AF37]/25 bg-[#FAF7F0] hover:border-[#D4AF37]/60 dark:bg-[#0B0A07]'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-xs font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
                                    {opt.label}
                                  </span>
                                  {isCheapest && (
                                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9.5px] font-extrabold text-emerald-700 dark:text-emerald-300">
                                      Lowest
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 text-[10.5px] text-[#6E6552] dark:text-[#A89F8C]">
                                  {opt.subtitle}
                                </p>
                              </div>
                              {isSelected && (
                                <Check className="h-3.5 w-3.5 shrink-0 text-[#D4AF37]" />
                              )}
                            </div>

                            {q ? (
                              <div className="flex items-center justify-between gap-2 border-t border-[#D4AF37]/15 pt-2">
                                <div className="flex items-baseline gap-1.5">
                                  <span className="font-mono text-xs font-extrabold text-[#8A6208] tabular-nums dark:text-[#F5D77A]">
                                    {formatPrice(q.minPrice, 'NGN')}
                                  </span>
                                  {unitUsd > 0 && (
                                    <span className="text-[10px] text-[#8A7F6A] tabular-nums dark:text-[#A89F8C]">
                                      ({formatUsdCompact(unitUsd)})
                                    </span>
                                  )}
                                </div>
                                <div className="text-right">
                                  <p className="font-mono text-[10px] font-semibold text-[#6E6552] tabular-nums dark:text-[#A89F8C]">
                                    {formatStock(q.stockCount)} avail
                                  </p>
                                  {!q.configured && (
                                    <p className="text-[9.5px] font-bold text-amber-600 dark:text-amber-300">
                                      Add {opt.envVar}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="border-t border-[#D4AF37]/15 pt-2">
                                <p className="text-[11px] font-semibold text-[#8A7F6A] dark:text-[#A89F8C]">
                                  No stock for {selectedCountry.country}
                                </p>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* STEP 4: Quantity & Buy */}
                  <div className="relative" ref={qtyRef}>
                    <label className="mb-1.5 block text-xs font-bold text-[#6E6552] dark:text-[#A89F8C]">
                      4. How Many Numbers ({activeQuote ? activeQuote.name : 'Provider'})
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setQtyDropdownOpen((prev) => !prev);
                        setAppDropdownOpen(false);
                        setCountryDropdownOpen(false);
                      }}
                      className="flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-[#D4AF37]/35 bg-[#FAF7F0] px-3.5 text-left text-xs font-bold text-[#1A160D] transition-colors hover:border-[#D4AF37] dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
                    >
                      <span>
                        {quantity} {quantity === 1 ? 'Number' : 'Numbers'}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {checkoutUnitNgn ? (
                          <div className="flex items-baseline gap-1.5">
                            <span className="font-mono text-[11px] font-extrabold text-[#8A6208] tabular-nums dark:text-[#F5D77A]">
                              {formatPrice(checkoutUnitNgn * quantity, selectedCountry.currency)}
                            </span>
                            {checkoutUnitUsd ? (
                              <span className="text-[9.5px] text-[#8A7F6A] tabular-nums dark:text-[#A89F8C]">
                                ({formatUsdCompact(checkoutUnitUsd * quantity)})
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        <ChevronDown
                          className={`h-4 w-4 text-[#D4AF37] transition-transform ${
                            qtyDropdownOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    </button>

                    {qtyDropdownOpen && (
                      <div className="absolute bottom-full left-0 right-0 z-50 mb-1.5 overflow-hidden rounded-2xl border border-[#D4AF37]/40 bg-white shadow-2xl dark:bg-[#14120D]">
                        <div className="border-b border-[#D4AF37]/15 px-3 py-1.5 text-[10px] font-bold text-[#8A7F6A] dark:text-[#A89F8C]">
                          Scroll to select 1–10 numbers
                        </div>
                        <div className="max-h-60 overflow-y-auto overscroll-contain p-1.5 space-y-0.5">
                          {QUANTITY_OPTIONS.map((num) => (
                            <button
                              key={num}
                              type="button"
                              onClick={() => {
                                onChangeQuantity(num);
                                setQtyDropdownOpen(false);
                              }}
                              className={`flex min-h-[40px] w-full items-center justify-between rounded-xl px-3 py-1.5 text-left text-xs font-bold transition-colors ${
                                quantity === num
                                  ? 'bg-[#D4AF37]/20 text-[#1A160D] dark:text-[#F5D77A]'
                                  : 'text-[#3E3522] hover:bg-[#D4AF37]/10 dark:text-[#EAE2CF]'
                              }`}
                            >
                              <span>
                                {num} {num === 1 ? 'Number' : 'Numbers'}
                              </span>
                              <div className="flex items-center gap-1.5">
                                {checkoutUnitNgn ? (
                                  <div className="flex items-baseline gap-1">
                                    <span className="font-mono text-[11px] font-bold text-[#8A6208] tabular-nums dark:text-[#F5D77A]">
                                      {formatPrice(checkoutUnitNgn * num, selectedCountry.currency)}
                                    </span>
                                    {checkoutUnitUsd ? (
                                      <span className="text-[9.5px] text-[#8A7F6A] tabular-nums dark:text-[#A89F8C]">
                                        ({formatUsdCompact(checkoutUnitUsd * num)})
                                      </span>
                                    ) : null}
                                  </div>
                                ) : null}
                                {quantity === num && <Check className="h-3.5 w-3.5 text-[#D4AF37]" />}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Pay-on-SMS-Arrival & Available Wallet Balance Check */}
                  {typeof walletBalance === 'number' && checkoutUnitNgn ? (() => {
                    const orderTotalNgn = Math.round(checkoutUnitNgn * quantity);
                    const availableBalance = Math.max(0, walletBalance - reservedBalance);
                    const hasEnough = availableBalance >= orderTotalNgn;
                    const deficit = Math.max(0, orderTotalNgn - Math.floor(availableBalance));
                    return (
                      <div className="space-y-2">
                        <div
                          className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-xs ${
                            hasEnough
                              ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300'
                              : 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-200'
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                            <Wallet className="h-3.5 w-3.5 shrink-0" />
                            <span className="font-semibold">
                              Wallet: <strong className="font-mono">{formatPrice(walletBalance, 'NGN')}</strong>
                            </span>
                            {reservedBalance > 0 && (
                              <span className="font-semibold text-amber-700 dark:text-amber-300">
                                · Held: <strong className="font-mono">{formatPrice(reservedBalance, 'NGN')}</strong>
                                {' · '}Avail: <strong className="font-mono">{formatPrice(availableBalance, 'NGN')}</strong>
                              </span>
                            )}
                            <span className="font-semibold">
                              · Order: <strong className="font-mono">{formatPrice(orderTotalNgn, 'NGN')}</strong>
                            </span>
                          </div>
                          {!hasEnough && (
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono text-[11px] font-bold">
                                Need {formatPrice(deficit, 'NGN')} more
                              </span>
                              {onOpenDeposit && (
                                <button
                                  type="button"
                                  onClick={onOpenDeposit}
                                  className="rounded-lg bg-[#D4AF37] px-2.5 py-1 text-[11px] font-extrabold text-[#0A0906] hover:bg-[#E5C150]"
                                >
                                  Top Up
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <p className="rounded-xl border border-[#D4AF37]/20 bg-[#FAF7F0] px-3 py-2 text-[11px] font-semibold text-[#6E6552] dark:bg-[#0B0A07] dark:text-[#A89F8C]">
                          Pay only when SMS arrives — ₦0 is deducted until your verification code is delivered.
                        </p>
                      </div>
                    );
                  })() : null}

                  {/* Buy Button */}
                  <button
                    type="button"
                    onClick={onAcquireNumbers}
                    disabled={acquiring || !activeQuote || !activeProviderConfigured}
                    className="mt-2 inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-[#D4AF37] px-5 py-3 text-sm font-extrabold text-[#0A0906] transition-colors hover:bg-[#E5C150] disabled:opacity-60"
                  >
                    {acquiring ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>
                          Buying via {activeQuote?.name || 'Provider'}...
                        </span>
                      </>
                    ) : !activeQuote ? (
                      <span>Select a Provider Option Above</span>
                    ) : !activeProviderConfigured ? (
                      <span>
                        {activeQuote.provider === 'grizzly'
                          ? 'Set GRIZZLYSMS_API_KEY to Buy'
                          : 'Set FIVESIM_API_KEY to Buy'}
                      </span>
                    ) : (
                      <>
                        <span>
                          Buy via {activeQuote.name} ({formatPrice(checkoutUnitNgn ? checkoutUnitNgn * quantity : undefined, selectedCountry.currency)})
                        </span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </>
              );
            })()}
          </div>
        </section>
      )}

      {/* VIEW 2: ACTIVE RECEIVER (Shows assigned number(s) + live waiting loader & incoming SMS/OTP) */}
      {viewMode === 'receiver' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onChangeViewMode('setup')}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#D4AF37]/30 px-3.5 py-2 text-xs font-bold text-[#4F4736] hover:bg-[#D4AF37]/10 dark:text-[#F5D77A]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Get New Number</span>
            </button>

            <button
              type="button"
              onClick={() => onChangeViewMode('history')}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#D4AF37]/30 px-3.5 py-2 text-xs font-bold text-[#4F4736] hover:bg-[#D4AF37]/10 dark:text-[#F5D77A]"
            >
              <History className="h-3.5 w-3.5" />
              <span>History</span>
            </button>
          </div>

          {activeOrders.length > 0 && (
            <section className="space-y-2.5">
              {activeOrders.map((order) => {
                const isSelected = selectedOrder?.id === order.id;
                return (
                  <div
                    key={order.id}
                    className={`rounded-2xl border p-4 transition-all ${
                      isSelected
                        ? 'border-[#D4AF37] bg-white shadow-md dark:bg-[#14120D]'
                        : 'border-[#D4AF37]/25 bg-white/80 dark:bg-[#14120D]/80'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => onSelectOrder(order)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#6E6552] dark:text-[#A89F8C]">
                          <AppLogo id={order.service} name={order.serviceName} size="sm" />
                          <CountryFlag code={order.countryCode || 'GB'} className="h-4 w-6" />
                          <span className="font-bold text-[#8A6208] dark:text-[#F5D77A]">
                            {order.serviceName}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{order.country}</span>
                          <span className="rounded bg-[#D4AF37]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#8A6208] dark:text-[#F5D77A]">
                            {getProviderLabel(order.provider)}
                          </span>
                          {order.price ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono font-bold text-[#8A6208] dark:text-[#F5D77A]">
                                {formatPrice(order.price, order.currency)}
                              </span>
                              {order.rawPriceUsd ? (
                                <span className="text-[10px] text-[#8A7F6A] tabular-nums dark:text-[#A89F8C]">
                                  ({formatUsdCompact(order.rawPriceUsd)})
                                </span>
                              ) : null}
                            </>
                          ) : null}
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold ${
                              order.charged || order.sms.length > 0
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {order.charged || order.sms.length > 0 ? 'Paid' : '₦0 Hold · Pay on Code'}
                          </span>
                        </div>
                        <p className="mt-1.5 font-mono text-xl sm:text-2xl font-extrabold tracking-tight text-[#1A160D] dark:text-[#FAF6EC]">
                          {order.phone}
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(`ord-${order.id}`, order.phone, `${order.phone} copied`)
                        }
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2 text-xs font-bold text-[#0A0906] hover:bg-[#E5C150] shrink-0"
                      >
                        {copiedKey === `ord-${order.id}` ? (
                          <>
                            <Check className="h-4 w-4" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4" />
                            <span>Copy Number</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {selectedOrder && (() => {
            const expiryInfo = formatExpiryCountdown(selectedOrder.expires, nowMs);
            return (
            <section className="rounded-3xl border border-[#D4AF37]/30 bg-white p-5 dark:bg-[#14120D]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D4AF37]/15 pb-3.5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
                      {selectedOrder.serviceName} Code Inbox
                    </h2>
                    {expiryInfo && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-mono text-[11px] font-extrabold tabular-nums ${
                          expiryInfo.expired
                            ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
                            : 'bg-[#D4AF37]/15 text-[#8A6208] dark:text-[#F5D77A]'
                        }`}
                      >
                        <Clock className="h-3 w-3" />
                        <span>{expiryInfo.label}</span>
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-[#8A6208] dark:text-[#F5D77A]">
                    <Radio className="h-3.5 w-3.5" />
                    <span>
                      {streamConnected
                        ? 'Listening in real time for your SMS'
                        : ['PENDING', 'RECEIVED'].includes(selectedOrder.status)
                          ? 'Syncing live for incoming SMS...'
                          : `Status: ${selectedOrder.status}`}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleSound}
                    aria-label={soundEnabled ? 'Mute SMS arrival sound' : 'Enable SMS arrival sound'}
                    className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                      soundEnabled
                        ? 'border-[#D4AF37]/35 bg-[#FAF7F0] text-[#8A6208] dark:bg-[#0B0A07] dark:text-[#F5D77A]'
                        : 'border-[#D4AF37]/20 text-[#8A7F6A] dark:text-[#A89F8C]'
                    }`}
                  >
                    {soundEnabled ? (
                      <Volume2 className="h-3.5 w-3.5" />
                    ) : (
                      <VolumeX className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">{soundEnabled ? 'Sound On' : 'Muted'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onCheckOrder(selectedOrder.id)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#D4AF37]/15 px-3.5 py-2 text-xs font-bold text-[#8A6208] hover:bg-[#D4AF37]/25 dark:text-[#F5D77A]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Check SMS</span>
                  </button>

                  {selectedOrder.sms.length === 0 &&
                    ['PENDING', 'RECEIVED'].includes(selectedOrder.status) && (
                      <>
                        {onSwapNumber && (
                          <button
                            type="button"
                            disabled={acquiring}
                            onClick={() => onSwapNumber(selectedOrder)}
                            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#D4AF37]/40 bg-[#FAF7F0] px-3 py-2 text-xs font-bold text-[#8A6208] hover:bg-[#D4AF37]/15 disabled:opacity-60 dark:bg-[#0B0A07] dark:text-[#F5D77A]"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span>Swap Number</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onCancelOrder(selectedOrder.id)}
                          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rose-500/35 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-500/10 dark:text-rose-300"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span>Cancel</span>
                        </button>
                      </>
                    )}

                  {selectedOrder.sms.length > 0 && selectedOrder.status !== 'FINISHED' && (
                    <button
                      type="button"
                      onClick={() => onFinishOrder(selectedOrder.id)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Done</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-3">
                {selectedOrder.sms.length === 0 &&
                ['PENDING', 'RECEIVED'].includes(selectedOrder.status) ? (
                  <p className="rounded-xl border border-[#D4AF37]/20 bg-[#FAF7F0] px-3 py-2 text-[11px] font-semibold text-[#6E6552] dark:bg-[#0B0A07] dark:text-[#A89F8C]">
                    No SMS yet · Pay only when SMS arrives (
                    {selectedOrder.price
                      ? formatPrice(selectedOrder.price, selectedOrder.currency)
                      : 'quoted rate'}
                    ). Tap Swap Number or Cancel anytime with ₦0 charged.
                  </p>
                ) : selectedOrder.sms.length > 0 ? (
                  <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    Code received · Charge finalized. Tap any code below to copy.
                  </p>
                ) : null}
              </div>

              <div className="mt-4">
                {selectedOrder.sms.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#D4AF37]/35 py-12 text-center px-4">
                    {['PENDING', 'RECEIVED'].includes(selectedOrder.status) ? (
                      <Loader2 className="h-8 w-8 animate-spin text-[#D4AF37]" />
                    ) : (
                      <MessageSquareText className="h-8 w-8 text-[#D4AF37]" />
                    )}
                    <p className="mt-3 text-sm font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                      {['PENDING', 'RECEIVED'].includes(selectedOrder.status)
                        ? `Waiting for ${selectedOrder.serviceName} SMS code...`
                        : `Session ${selectedOrder.status.toLowerCase()}`}
                    </p>
                    <p className="mt-1 max-w-sm text-xs text-[#6E6552] dark:text-[#A89F8C]">
                      Copy {selectedOrder.phone} above and enter it in {selectedOrder.serviceName}.
                      Your verification code will appear right here automatically.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedOrder.sms.map((msg) => (
                      <article
                        key={msg.id}
                        className="rounded-2xl border border-[#D4AF37]/25 bg-[#FAF7F0] p-4 dark:bg-[#0B0A07]"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs text-[#6E6552] dark:text-[#A89F8C]">
                          <span className="font-bold text-[#8A6208] dark:text-[#F5D77A]">
                            {msg.sender}
                          </span>
                          <span className="tabular-nums">{formatRelativeTime(msg.receivedAt)}</span>
                        </div>
                        <p className="mt-1.5 text-sm text-[#1A160D] break-words dark:text-[#EAE2CF]">
                          {msg.text}
                        </p>
                        {msg.otp && (
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() =>
                                handleCopy(msg.id, msg.otp!, `Code ${msg.otp} copied`, msg.sender)
                              }
                              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2 font-mono text-base font-extrabold tracking-widest text-[#0A0906] hover:bg-[#E5C150]"
                            >
                              <span>{msg.otp}</span>
                              {copiedKey === msg.id ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <Copy className="h-4 w-4 opacity-80" />
                              )}
                            </button>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </section>
            );
          })()}
        </div>
      )}

      {/* VIEW 3: NUMBER HISTORY */}
      {viewMode === 'history' && (
        <section className="rounded-3xl border border-[#D4AF37]/30 bg-white p-5 dark:bg-[#14120D]">
          <div className="flex items-center justify-between gap-3 border-b border-[#D4AF37]/15 pb-3.5">
            <div>
              <h2 className="font-display text-lg font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
                Number History
              </h2>
              <p className="mt-0.5 text-xs text-[#6E6552] dark:text-[#A89F8C]">
                Reuse any saved number to view or receive codes again, or delete it
              </p>
            </div>
            <button
              type="button"
              onClick={() => onChangeViewMode('setup')}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#D4AF37] px-3.5 py-2 text-xs font-bold text-[#0A0906] hover:bg-[#E5C150] shrink-0"
            >
              <span>Get New</span>
            </button>
          </div>

          <div className="mt-4 space-y-2.5">
            {numberHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#D4AF37]/30 py-12 text-center px-4">
                <Clock className="h-8 w-8 text-[#D4AF37]" />
                <p className="mt-3 text-sm font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                  No number history yet
                </p>
                <p className="mt-1 max-w-sm text-xs text-[#6E6552] dark:text-[#A89F8C]">
                  Numbers you acquire stay saved here so you can reuse or delete them anytime.
                </p>
              </div>
            ) : (
              numberHistory.map((item) => {
                const latestOtp = item.sms.find((m) => m.otp)?.otp;
                return (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-[#D4AF37]/20 bg-[#FAF7F0]/70 p-4 dark:bg-[#0B0A07]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#6E6552] dark:text-[#A89F8C]">
                          <AppLogo id={item.service} name={item.serviceName} size="sm" />
                          <CountryFlag code={item.countryCode || 'GB'} className="h-4 w-6" />
                          <span className="font-bold text-[#8A6208] dark:text-[#F5D77A]">
                            {item.serviceName}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{item.country}</span>
                          <span className="rounded bg-[#D4AF37]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#8A6208] dark:text-[#F5D77A]">
                            {getProviderLabel(item.provider)}
                          </span>
                          {item.price ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono font-bold text-[#8A6208] dark:text-[#F5D77A]">
                                {formatPrice(item.price, item.currency)}
                              </span>
                            </>
                          ) : null}
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">{formatRelativeTime(item.createdAt)}</span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              item.charged || item.sms.length > 0
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                : ['CANCELED', 'TIMEOUT', 'BANNED'].includes(item.status)
                                  ? 'bg-[#D4AF37]/10 text-[#6E6552] dark:text-[#A89F8C]'
                                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {item.charged || item.sms.length > 0
                              ? 'Paid'
                              : ['CANCELED', 'TIMEOUT', 'BANNED'].includes(item.status)
                                ? '₦0 (Cancelled)'
                                : 'Hold'}
                          </span>
                        </div>

                        <p className="mt-1.5 font-mono text-lg font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
                          {item.phone}
                        </p>

                        {latestOtp && (
                          <p className="mt-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                            Code received: <span className="font-mono">{latestOtp}</span>
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => onReuseFromHistory(item)}
                          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#D4AF37] px-3 py-2 text-xs font-bold text-[#0A0906] hover:bg-[#E5C150]"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Reuse</span>
                        </button>

                        {onSwapNumber && (
                          <button
                            type="button"
                            disabled={acquiring}
                            onClick={() => onSwapNumber({ ...item, sms: [], status: 'FINISHED' })}
                            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#D4AF37]/35 px-3 py-2 text-xs font-bold text-[#8A6208] hover:bg-[#D4AF37]/10 disabled:opacity-60 dark:text-[#F5D77A]"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            <span>Fresh</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(`hist-${item.id}`, item.phone, `${item.phone} copied`)
                          }
                          aria-label="Copy number"
                          className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-[#D4AF37]/30 text-[#4F4736] hover:bg-[#D4AF37]/10 dark:text-[#F5D77A]"
                        >
                          {copiedKey === `hist-${item.id}` ? (
                            <Check className="h-4 w-4 text-[#D4AF37]" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => onDeleteFromHistory(item.id)}
                          aria-label="Delete number from history"
                          className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-rose-500/30 text-rose-600 hover:bg-rose-500/10 dark:text-rose-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      )}
    </div>
  );
}
