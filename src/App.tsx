import { useCallback, useEffect, useRef, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { BottomNav } from './components/BottomNav';
import { CornerDrawer } from './components/CornerDrawer';
import { CreateEmailTab } from './components/CreateEmailTab';
import { DepositModal } from './components/DepositModal';
import { HomeEmailTab } from './components/HomeEmailTab';
import { ImageGenTab } from './components/ImageGenTab';
import { ProfileTab } from './components/ProfileTab';
import { SmsTab } from './components/SmsTab';
import { TopBar } from './components/TopBar';
import { useOnlineStatus } from './hooks/usePWAInstall';
import type {
  CopiedOtpRecord,
  EmailMessageDetail,
  EmailMessageSummary,
  LowestNumberDeal,
  NumberCountryOption,
  NumberProviderId,
  NumberProviderQuote,
  NumberServiceOption,
  PhoneNumberEntry,
  PlatformFilter,
  PrivateNumberOrder,
  TabId,
  TempEmailAccount,
} from './types';
import { parseJsonResponse } from './utils/apiFetch';
import { copyToClipboard } from './utils/clipboard';
import {
  createDirectGuerrillaAccount,
  deleteDirectGuerrillaMessage,
  fetchDirectGuerrillaMessageDetail,
  fetchDirectGuerrillaMessages,
} from './utils/directEmailFallback';
import { supabase } from './utils/supabase';

const STORAGE_KEYS = {
  emails: 'veribox_saved_emails_v2',
  activeEmail: 'veribox_active_email_v2',
  savedNumbers: 'veribox_saved_numbers_v2',
  otpHistory: 'veribox_otp_history_v2',
  theme: 'veribox_theme_v2',
  autoRefresh: 'veribox_autorefresh_v2',
  activeOrders: 'veribox_active_orders_v2',
  numberHistory: 'veribox_number_history_v2',
  walletBalance: 'veribox_wallet_balance_v2',
  walletUserId: 'veribox_wallet_user_id_v2',
  creditedRefs: 'veribox_credited_refs_v2',
  pendingRef: 'veribox_pending_paystack_ref',
};

const DEFAULT_SERVICES: NumberServiceOption[] = [
  { id: 'whatsapp', name: 'WhatsApp', popular: true },
  { id: 'instagram', name: 'Instagram', popular: true },
  { id: 'facebook', name: 'Facebook', popular: true },
  { id: 'tiktok', name: 'TikTok', popular: true },
  { id: 'telegram', name: 'Telegram', popular: true },
  { id: 'google', name: 'Google / Gmail', popular: true },
];

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function getOrCreateWalletUserId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEYS.walletUserId);
    if (existing) return existing;
    const created = `vbw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(STORAGE_KEYS.walletUserId, created);
    return created;
  } catch {
    return 'vbw-default';
  }
}

function markReferenceCredited(reference: string): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.creditedRefs);
    const list: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (list.includes(reference)) return false;
    const next = [reference, ...list].slice(0, 100);
    localStorage.setItem(STORAGE_KEYS.creditedRefs, JSON.stringify(next));
    return true;
  } catch {
    return true;
  }
}

export default function App() {
  const isOnline = useOnlineStatus();
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [fiveSimConfigured, setFiveSimConfigured] = useState<boolean>(false);
  const [grizzlyConfigured, setGrizzlyConfigured] = useState<boolean>(false);

  const [isDark, setIsDark] = useState<boolean>(() => {
    const stored = readStorage<string | null>(STORAGE_KEYS.theme, null);
    if (stored === 'light') return false;
    return true;
  });

  const [autoRefresh, setAutoRefresh] = useState<boolean>(() =>
    readStorage<boolean>(STORAGE_KEYS.autoRefresh, true)
  );
  const [countdown, setCountdown] = useState<number>(15);

  // Naira Wallet Balance state (starts at 0 NGN, synced with Supabase & Paystack webhook)
  const [walletUserId] = useState<string>(() => getOrCreateWalletUserId());
  const [walletBalance, setWalletBalance] = useState<number>(() =>
    readStorage<number>(STORAGE_KEYS.walletBalance, 0)
  );
  const [depositModalOpen, setDepositModalOpen] = useState<boolean>(false);

  // Private Numbers Flow state (Setup -> Active Receiver -> History)
  const [services, setServices] = useState<NumberServiceOption[]>(DEFAULT_SERVICES);
  const [selectedService, setSelectedService] = useState<NumberServiceOption | null>(null);
  const [servicesLoading, setServicesLoading] = useState<boolean>(true);

  const [countries, setCountries] = useState<NumberCountryOption[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<NumberCountryOption | null>(null);
  const [selectedProviderQuote, setSelectedProviderQuote] = useState<NumberProviderQuote | null>(null);
  const [countriesLoading, setCountriesLoading] = useState<boolean>(false);
  const [lowestDeals, setLowestDeals] = useState<LowestNumberDeal[]>([]);
  const [lowestDealsLoading, setLowestDealsLoading] = useState<boolean>(false);
  const [quantity, setQuantity] = useState<number>(1);

  const [activeOrders, setActiveOrders] = useState<PrivateNumberOrder[]>(() =>
    readStorage<PrivateNumberOrder[]>(STORAGE_KEYS.activeOrders, [])
  );
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(() => {
    const saved = readStorage<PrivateNumberOrder[]>(STORAGE_KEYS.activeOrders, []);
    return saved[0]?.id ?? null;
  });
  const [numberHistory, setNumberHistory] = useState<PrivateNumberOrder[]>(() =>
    readStorage<PrivateNumberOrder[]>(STORAGE_KEYS.numberHistory, [])
  );
  const [numbersViewMode, setNumbersViewMode] = useState<'setup' | 'receiver' | 'history'>('setup');
  const [acquiring, setAcquiring] = useState<boolean>(false);
  const [acquireError, setAcquireError] = useState<string | null>(null);
  const [streamConnected, setStreamConnected] = useState<boolean>(false);

  // Email state
  const [savedEmails, setSavedEmails] = useState<TempEmailAccount[]>(() =>
    readStorage<TempEmailAccount[]>(STORAGE_KEYS.emails, [])
  );
  const [activeEmail, setActiveEmail] = useState<TempEmailAccount | null>(() =>
    readStorage<TempEmailAccount | null>(STORAGE_KEYS.activeEmail, null)
  );
  const [emailMessages, setEmailMessages] = useState<EmailMessageSummary[]>([]);
  const [selectedEmailDetail, setSelectedEmailDetail] = useState<EmailMessageDetail | null>(null);
  const [loadingEmailMessages, setLoadingEmailMessages] = useState<boolean>(false);
  const [loadingEmailDetail, setLoadingEmailDetail] = useState<boolean>(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [generatingEmail, setGeneratingEmail] = useState<boolean>(false);

  // Profile / Vault state
  const [savedNumbers, setSavedNumbers] = useState<PhoneNumberEntry[]>(() =>
    readStorage<PhoneNumberEntry[]>(STORAGE_KEYS.savedNumbers, [])
  );
  const [otpHistory, setOtpHistory] = useState<CopiedOtpRecord[]>(() =>
    readStorage<CopiedOtpRecord[]>(STORAGE_KEYS.otpHistory, [])
  );

  const lastFetchedAddressRef = useRef<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem(STORAGE_KEYS.theme, JSON.stringify(isDark ? 'dark' : 'light'));
  }, [isDark]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.autoRefresh, JSON.stringify(autoRefresh));
  }, [autoRefresh]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.emails, JSON.stringify(savedEmails));
  }, [savedEmails]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.activeEmail, JSON.stringify(activeEmail));
  }, [activeEmail]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.savedNumbers, JSON.stringify(savedNumbers));
  }, [savedNumbers]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.otpHistory, JSON.stringify(otpHistory));
  }, [otpHistory]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.activeOrders, JSON.stringify(activeOrders));
  }, [activeOrders]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.numberHistory, JSON.stringify(numberHistory));
  }, [numberHistory]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.walletBalance, JSON.stringify(walletBalance));
  }, [walletBalance]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => {
      setToast((prev) => (prev === message ? null : prev));
    }, 2400);
  }, []);

  const syncServerWalletBalance = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/wallet/balance?userId=${encodeURIComponent(walletUserId)}`
      );
      if (!res.ok) return;
      const data = await parseJsonResponse<{
        balance?: number | null;
        supabasePersisted?: boolean;
      }>(res);
      if (data.supabasePersisted && typeof data.balance === 'number') {
        setWalletBalance(data.balance);
      }
    } catch {
      // Keep local balance when offline
    }
  }, [walletUserId]);

  const verifyDepositReference = useCallback(
    async (reference: string) => {
      if (!reference) return;
      try {
        const res = await fetch(
          `/api/wallet/verify/${encodeURIComponent(reference)}?userId=${encodeURIComponent(
            walletUserId
          )}`
        );
        const data = await parseJsonResponse<{
          success?: boolean;
          amount?: number;
          balance?: number | null;
          supabasePersisted?: boolean;
          alreadyProcessed?: boolean;
        }>(res);
        if (res.ok && data.success) {
          try {
            localStorage.removeItem(STORAGE_KEYS.pendingRef);
          } catch {
            // Non-blocking
          }
          const isNewForClient = markReferenceCredited(reference);
          if (data.supabasePersisted && typeof data.balance === 'number') {
            setWalletBalance(data.balance);
            if (isNewForClient && data.amount) {
              showToast(
                `Deposit confirmed! ₦${data.amount.toLocaleString()} credited to your wallet`
              );
            }
          } else if (isNewForClient && data.amount) {
            setWalletBalance((prev) => prev + data.amount!);
            showToast(
              `Deposit confirmed! ₦${data.amount.toLocaleString()} credited to your wallet`
            );
          }
        }
      } catch {
        // Retry on next focus if transient
      }
    },
    [walletUserId, showToast]
  );

  // Sync wallet balance from server/Supabase + subscribe to Supabase Realtime updates
  useEffect(() => {
    void syncServerWalletBalance();

    const sb = supabase;
    if (!sb) return;
    const channel = sb
      .channel(`wallet-sync-${walletUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wallets',
          filter: `user_id=eq.${walletUserId}`,
        },
        (payload) => {
          const nextRow = payload.new as { balance?: number | string } | undefined;
          if (nextRow && typeof nextRow.balance !== 'undefined') {
            const numeric = Math.max(0, Number(nextRow.balance) || 0);
            setWalletBalance((prev) => {
              if (numeric > prev) {
                showToast(
                  `Wallet updated: +₦${(numeric - prev).toLocaleString()} received!`
                );
              }
              return numeric;
            });
          }
        }
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [walletUserId, syncServerWalletBalance, showToast]);

  // Automatically verify payment redirect / pending Paystack reference on mount & tab focus
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlReference = params.get('reference') || params.get('trxref');
    if (urlReference) {
      void verifyDepositReference(urlReference).finally(() => {
        window.history.replaceState({}, document.title, window.location.pathname);
      });
    } else {
      try {
        const pendingRef = localStorage.getItem(STORAGE_KEYS.pendingRef);
        if (pendingRef) {
          void verifyDepositReference(pendingRef);
        }
      } catch {
        // Non-blocking
      }
    }

    const handleResume = () => {
      void syncServerWalletBalance();
      try {
        const pendingRef = localStorage.getItem(STORAGE_KEYS.pendingRef);
        if (pendingRef) {
          void verifyDepositReference(pendingRef);
        }
      } catch {
        // Non-blocking
      }
    };

    window.addEventListener('focus', handleResume);
    return () => window.removeEventListener('focus', handleResume);
  }, [verifyDepositReference, syncServerWalletBalance]);

  const handleCopyText = useCallback(
    async (
      value: string,
      label: string,
      otpMeta?: { source: string; channel: 'SMS' | 'Email' }
    ) => {
      const ok = await copyToClipboard(value);
      if (ok) {
        showToast(label);
        if (otpMeta) {
          setOtpHistory((prev) => [
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              code: value,
              source: otpMeta.source,
              channel: otpMeta.channel,
              copiedAt: new Date().toISOString(),
            },
            ...prev
              .filter((item) => item.code !== value || item.source !== otpMeta.source)
              .slice(0, 19),
          ]);
        }
      }
    },
    [showToast]
  );

  // Private Numbers API helpers
  const loadServices = useCallback(async () => {
    setServicesLoading(true);
    try {
      const res = await fetch('/api/numbers/services');
      const data = await parseJsonResponse<{
        configured?: boolean;
        fivesimConfigured?: boolean;
        grizzlyConfigured?: boolean;
        services?: NumberServiceOption[];
      }>(res);
      if (typeof data.fivesimConfigured === 'boolean') {
        setFiveSimConfigured(data.fivesimConfigured);
      } else if (typeof data.configured === 'boolean') {
        setFiveSimConfigured(data.configured);
      }
      if (typeof data.grizzlyConfigured === 'boolean') {
        setGrizzlyConfigured(data.grizzlyConfigured);
      }
      if (Array.isArray(data.services) && data.services.length > 0) {
        setServices(data.services);
      }
    } catch {
      // Keep default popular services
    } finally {
      setServicesLoading(false);
    }
  }, []);

  const loadLowestDeals = useCallback(async (refresh = false) => {
    setLowestDealsLoading(true);
    try {
      const res = await fetch(`/api/numbers/lowest${refresh ? '?refresh=1' : ''}`);
      const data = await parseJsonResponse<{ deals?: LowestNumberDeal[] }>(res);
      if (res.ok && Array.isArray(data.deals)) {
        setLowestDeals(data.deals);
      }
    } catch {
      // Non-blocking
    } finally {
      setLowestDealsLoading(false);
    }
  }, []);

  const pickBestProviderForCountry = useCallback(
    (country: NumberCountryOption, preferredProvider?: NumberProviderId): NumberProviderQuote | null => {
      const list = country.providers || [];
      if (list.length === 0) return null;
      if (preferredProvider) {
        const match = list.find((p) => p.provider === preferredProvider);
        if (match) return match;
      }
      return list.find((p) => p.configured) || list[0];
    },
    []
  );

  const loadCountriesForService = useCallback(
    async (
      serviceId: string,
      refresh = false,
      preselectCountrySlug?: string,
      preselectProviderId?: NumberProviderId
    ) => {
      setCountriesLoading(true);
      setCountries([]);
      setSelectedCountry(null);
      setSelectedProviderQuote(null);
      try {
        const res = await fetch(
          `/api/numbers/countries?service=${encodeURIComponent(serviceId)}${refresh ? '&refresh=1' : ''}`
        );
        const data = await parseJsonResponse<{ countries?: NumberCountryOption[]; error?: string }>(res);
        if (!res.ok) {
          throw new Error(data.error || 'Could not load countries for this app');
        }
        if (Array.isArray(data.countries)) {
          setCountries(data.countries);
          if (preselectCountrySlug) {
            const matched = data.countries.find((c) => c.slug === preselectCountrySlug);
            if (matched) {
              setSelectedCountry(matched);
              setSelectedProviderQuote(pickBestProviderForCountry(matched, preselectProviderId));
            }
          }
        }
      } catch (err) {
        setAcquireError(
          err instanceof Error ? err.message : 'Unable to fetch country availability'
        );
      } finally {
        setCountriesLoading(false);
      }
    },
    [pickBestProviderForCountry]
  );

  const syncOrderIntoState = useCallback((updated: PrivateNumberOrder) => {
    const mergeOrder = (o: PrivateNumberOrder): PrivateNumberOrder => ({
      ...o,
      ...updated,
      provider: o.provider || updated.provider,
      phone: updated.phone || o.phone,
      digits: updated.digits || o.digits,
      country: updated.country || o.country,
      countryCode: o.countryCode || updated.countryCode,
      service: updated.service || o.service,
      serviceName: o.serviceName || updated.serviceName,
      price: updated.price ?? o.price,
      rawPriceUsd: updated.rawPriceUsd ?? o.rawPriceUsd,
      currency: o.currency || updated.currency,
      expires: updated.expires || o.expires,
      createdAt: o.createdAt || updated.createdAt,
      sms: Array.isArray(updated.sms) ? updated.sms : o.sms,
    });

    setActiveOrders((prev) => prev.map((o) => (o.id === updated.id ? mergeOrder(o) : o)));
    setNumberHistory((prev) => prev.map((o) => (o.id === updated.id ? mergeOrder(o) : o)));
  }, []);

  const handleAcquireNumbers = useCallback(async () => {
    if (!selectedService || !selectedCountry) return;

    const chosenProvider: NumberProviderId =
      selectedProviderQuote?.provider ||
      selectedCountry.providers?.[0]?.provider ||
      'fivesim';
    const chosenCountryId =
      selectedProviderQuote?.countryId ||
      selectedCountry.providers?.[0]?.countryId ||
      selectedCountry.slug;
    const unitPriceNgn =
      selectedProviderQuote?.inStockMinPrice ||
      selectedProviderQuote?.minPrice ||
      selectedCountry.inStockMinPrice ||
      selectedCountry.minPrice ||
      0;
    const requiredNgn = unitPriceNgn * quantity;
    if (walletBalance < requiredNgn) {
      setDepositModalOpen(true);
      showToast(
        `Insufficient wallet balance (₦${walletBalance.toLocaleString()}). Required: ₦${requiredNgn.toLocaleString()} - Please deposit to proceed.`
      );
      return;
    }

    setAcquiring(true);
    setAcquireError(null);
    try {
      const res = await fetch('/api/numbers/acquire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: chosenProvider,
          countryId: chosenCountryId,
          countryName: selectedCountry.country,
          service: selectedService.id,
          serviceName: selectedService.name,
          country: selectedCountry.slug,
          countryCode: selectedCountry.countryCode,
          quantity,
          walletBalance,
        }),
      });
      const data = await parseJsonResponse<{ orders?: PrivateNumberOrder[]; error?: string }>(res);
      if (res.status === 402) {
        setDepositModalOpen(true);
        throw new Error(data.error || 'Insufficient wallet balance for live operator price.');
      }
      if (!res.ok || !Array.isArray(data.orders) || data.orders.length === 0) {
        throw new Error(data.error || 'Could not assign numbers right now.');
      }

      const actualChargedNgn = data.orders.reduce(
        (sum, ord) => sum + (typeof ord.price === 'number' && ord.price > 0 ? ord.price : unitPriceNgn),
        0
      );

      setWalletBalance((prev) => Math.max(0, prev - actualChargedNgn));
      if (actualChargedNgn > 0) {
        void fetch('/api/wallet/deduct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: walletUserId,
            amount: actualChargedNgn,
            reference: `order-${data.orders[0].id}`,
          }),
        }).catch(() => undefined);
      }

      setActiveOrders((prev) => {
        const newIds = new Set(data.orders!.map((o) => o.id));
        return [...data.orders!, ...prev.filter((o) => !newIds.has(o.id))];
      });
      setSelectedOrderId(data.orders[0].id);
      setNumberHistory((prev) => {
        const existingIds = new Set(data.orders!.map((o) => o.id));
        return [...data.orders!, ...prev.filter((o) => !existingIds.has(o.id))].slice(0, 50);
      });
      setNumbersViewMode('receiver');
      showToast(
        data.orders.length === 1
          ? `Assigned ${data.orders[0].phone} (₦${actualChargedNgn.toLocaleString()} deducted)`
          : `Assigned ${data.orders.length} numbers (₦${actualChargedNgn.toLocaleString()} deducted)`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to assign numbers';
      setAcquireError(msg);
      showToast(msg);
    } finally {
      setAcquiring(false);
    }
  }, [
    selectedCountry,
    selectedProviderQuote,
    selectedService,
    quantity,
    walletBalance,
    walletUserId,
    showToast,
  ]);

  const handleCheckOrder = useCallback(
    async (orderId: number, providerOverride?: NumberProviderId) => {
      const matched =
        activeOrders.find((o) => o.id === orderId) ||
        numberHistory.find((o) => o.id === orderId);
      const provider = providerOverride || matched?.provider || 'fivesim';
      try {
        const res = await fetch(
          `/api/numbers/check/${orderId}?provider=${encodeURIComponent(provider)}`
        );
        const data = await parseJsonResponse<{ order?: PrivateNumberOrder; error?: string }>(res);
        if (res.ok && data.order) {
          syncOrderIntoState(data.order);
        }
      } catch {
        // Non-blocking
      }
    },
    [activeOrders, numberHistory, syncOrderIntoState]
  );

  const handleCancelOrder = useCallback(
    async (orderId: number) => {
      const targetOrder = activeOrders.find((o) => o.id === orderId);
      const provider = targetOrder?.provider || 'fivesim';
      try {
        const res = await fetch(
          `/api/numbers/cancel/${orderId}?provider=${encodeURIComponent(provider)}`,
          { method: 'POST' }
        );
        const data = await parseJsonResponse<{ order?: PrivateNumberOrder }>(res);
        if (res.ok && data.order) {
          syncOrderIntoState(data.order);
        } else {
          setNumberHistory((prev) =>
            prev.map((o) => (o.id === orderId ? { ...o, status: 'CANCELED' } : o))
          );
        }

        // Refund Naira if cancelled before any SMS arrived
        if (targetOrder && targetOrder.sms.length === 0 && targetOrder.price) {
          setWalletBalance((prev) => prev + targetOrder.price!);
          void fetch('/api/wallet/refund', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: walletUserId,
              amount: targetOrder.price,
              reference: `refund-${targetOrder.id}`,
            }),
          }).catch(() => undefined);
        }

        setActiveOrders((prev) => {
          const remaining = prev.filter((o) => o.id !== orderId);
          setSelectedOrderId((curr) => (curr === orderId ? remaining[0]?.id ?? null : curr));
          if (remaining.length === 0) {
            setNumbersViewMode('setup');
          }
          return remaining;
        });
        showToast(
          targetOrder?.price && targetOrder.sms.length === 0
            ? `Number cancelled · ₦${targetOrder.price.toLocaleString()} refunded`
            : 'Number session cancelled'
        );
      } catch {
        showToast('Could not cancel number session');
      }
    },
    [activeOrders, syncOrderIntoState, walletUserId, showToast]
  );

  const handleFinishOrder = useCallback(
    async (orderId: number) => {
      const targetOrder =
        activeOrders.find((o) => o.id === orderId) ||
        numberHistory.find((o) => o.id === orderId);
      const provider = targetOrder?.provider || 'fivesim';
      try {
        const res = await fetch(
          `/api/numbers/finish/${orderId}?provider=${encodeURIComponent(provider)}`,
          { method: 'POST' }
        );
        const data = await parseJsonResponse<{ order?: PrivateNumberOrder }>(res);
        if (res.ok && data.order) {
          syncOrderIntoState(data.order);
        }
        showToast('Number marked complete');
      } catch {
        showToast('Could not complete session');
      }
    },
    [activeOrders, numberHistory, syncOrderIntoState, showToast]
  );

  const handleReuseFromHistory = useCallback(
    (order: PrivateNumberOrder) => {
      setActiveOrders((prev) => {
        if (prev.some((o) => o.id === order.id)) return prev;
        return [order, ...prev];
      });
      setSelectedOrderId(order.id);
      setNumbersViewMode('receiver');
      void handleCheckOrder(order.id, order.provider || 'fivesim');
    },
    [handleCheckOrder]
  );

  const handleDeleteFromHistory = useCallback(
    (orderId: number) => {
      setNumberHistory((prev) => prev.filter((o) => o.id !== orderId));
      setActiveOrders((prev) => prev.filter((o) => o.id !== orderId));
      showToast('Removed from history');
    },
    [showToast]
  );

  const selectedOrder =
    activeOrders.find((o) => o.id === selectedOrderId) || activeOrders[0] || null;

  // Live SSE stream for active selected private number
  useEffect(() => {
    if (
      activeTab !== 'numbers' ||
      numbersViewMode !== 'receiver' ||
      !selectedOrder ||
      ['FINISHED', 'CANCELED', 'TIMEOUT', 'BANNED'].includes(selectedOrder.status)
    ) {
      setStreamConnected(false);
      return;
    }

    const provider = selectedOrder.provider || 'fivesim';
    const es = new EventSource(
      `/api/numbers/stream/${selectedOrder.id}?provider=${encodeURIComponent(provider)}`
    );
    es.onopen = () => setStreamConnected(true);
    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          type?: string;
          order?: PrivateNumberOrder;
        };
        if (payload.type === 'order' && payload.order) {
          syncOrderIntoState(payload.order);
        }
      } catch {
        // Ignore parse glitch
      }
    };
    es.onerror = () => setStreamConnected(false);

    return () => {
      es.close();
      setStreamConnected(false);
    };
  }, [
    activeTab,
    numbersViewMode,
    selectedOrder?.id,
    selectedOrder?.provider,
    selectedOrder?.status,
    syncOrderIntoState,
  ]);

  // Automatic polling fallback when SSE disconnects (e.g. serverless deployments)
  useEffect(() => {
    if (
      activeTab !== 'numbers' ||
      numbersViewMode !== 'receiver' ||
      !selectedOrder ||
      streamConnected ||
      ['FINISHED', 'CANCELED', 'TIMEOUT', 'BANNED'].includes(selectedOrder.status)
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      void handleCheckOrder(selectedOrder.id, selectedOrder.provider || 'fivesim');
    }, 3500);

    return () => window.clearInterval(timer);
  }, [
    activeTab,
    numbersViewMode,
    selectedOrder?.id,
    selectedOrder?.provider,
    selectedOrder?.status,
    streamConnected,
    handleCheckOrder,
  ]);

  const handlePickPlatformFromDrawer = useCallback(
    (p: PlatformFilter) => {
      const match = services.find((s) => s.id === p) || {
        id: p === 'all' ? 'other' : p,
        name: p === 'all' ? 'Other App' : p.charAt(0).toUpperCase() + p.slice(1),
      };
      setSelectedService(match);
      setAcquireError(null);
      setNumbersViewMode('setup');
      setActiveTab('numbers');
      void loadCountriesForService(match.id);
    },
    [services, loadCountriesForService]
  );

  const refreshEmailInbox = useCallback(
    async (accountOverride?: TempEmailAccount | null) => {
      const target = accountOverride ?? activeEmail;
      if (!target) return;
      setLoadingEmailMessages(true);
      setEmailError(null);
      try {
        let token = target.token;
        const provider = target.provider || 'mailtm';
        let res = await fetch('/api/email/messages', {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-email-provider': provider,
            'x-email-address': target.address,
          },
          signal: AbortSignal.timeout(8000),
        });

        if (res.status === 401 && provider === 'mailtm' && target.password) {
          const loginRes = await fetch('/api/email/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: target.address, password: target.password }),
            signal: AbortSignal.timeout(7000),
          });
          if (loginRes.ok) {
            const loginJson = await parseJsonResponse<{ token: string }>(loginRes);
            token = loginJson.token;
            const refreshedAccount = { ...target, token };
            lastFetchedAddressRef.current = refreshedAccount.address;
            setActiveEmail(refreshedAccount);
            setSavedEmails((prev) =>
              prev.map((a) => (a.address === target.address ? refreshedAccount : a))
            );
            res = await fetch('/api/email/messages', {
              headers: {
                Authorization: `Bearer ${token}`,
                'x-email-provider': provider,
                'x-email-address': target.address,
              },
              signal: AbortSignal.timeout(8000),
            });
          }
        }

        const data = await parseJsonResponse<{ messages?: EmailMessageSummary[]; error?: string }>(res);
        if (!res.ok) {
          throw new Error(data.error || 'Failed to read email inbox');
        }
        setEmailMessages(data.messages || []);
      } catch (err) {
        if ((target.provider || '').toLowerCase() === 'guerrilla' && target.token) {
          try {
            const directMsgs = await fetchDirectGuerrillaMessages(target.token);
            setEmailMessages(directMsgs);
            return;
          } catch {
            // Fall through to error message
          }
        }
        setEmailError(err instanceof Error ? err.message : 'Failed to load emails');
      } finally {
        setLoadingEmailMessages(false);
      }
    },
    [activeEmail]
  );

  const handleGenerateInstantEmail = useCallback(async () => {
    setGeneratingEmail(true);
    setEmailError(null);
    try {
      let created: TempEmailAccount | null = null;
      try {
        const res = await fetch('/api/email/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'auto' }),
          signal: AbortSignal.timeout(8000),
        });
        const data = await parseJsonResponse<TempEmailAccount & { error?: string }>(res);
        if (res.ok && data.address) {
          created = data;
        }
      } catch {
        // Fall through to direct browser CORS provider
      }

      if (!created) {
        created = await createDirectGuerrillaAccount();
      }

      setActiveEmail(created);
      setSavedEmails((prev) =>
        [created!, ...prev.filter((a) => a.address !== created!.address)].slice(0, 15)
      );
      setSelectedEmailDetail(null);
      setEmailMessages([]);
      showToast(`Generated: ${created.address}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not generate email';
      setEmailError(msg);
      showToast(msg);
    } finally {
      setGeneratingEmail(false);
    }
  }, [showToast]);

  const handleOpenEmailDetail = useCallback(
    async (id: string) => {
      if (!activeEmail) return;
      setLoadingEmailDetail(true);
      try {
        let detail: EmailMessageDetail | null = null;
        try {
          const res = await fetch(`/api/email/messages/${encodeURIComponent(id)}`, {
            headers: {
              Authorization: `Bearer ${activeEmail.token}`,
              'x-email-provider': activeEmail.provider || 'mailtm',
              'x-email-address': activeEmail.address,
            },
            signal: AbortSignal.timeout(8000),
          });
          const data = await parseJsonResponse<EmailMessageDetail & { error?: string }>(res);
          if (res.ok && data.id) {
            detail = data;
          }
        } catch {
          // Try direct CORS fallback for GuerrillaMail below
        }

        if (!detail && (activeEmail.provider || '').toLowerCase() === 'guerrilla' && activeEmail.token) {
          detail = await fetchDirectGuerrillaMessageDetail(activeEmail.token, id);
        }

        if (!detail) {
          throw new Error('Could not load email');
        }

        setSelectedEmailDetail(detail);
        setEmailMessages((prev) => prev.map((m) => (m.id === id ? { ...m, seen: true } : m)));
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Failed to open email');
      } finally {
        setLoadingEmailDetail(false);
      }
    },
    [activeEmail, showToast]
  );

  const handleDeleteEmailMessage = useCallback(
    async (id: string) => {
      if (!activeEmail) return;
      try {
        try {
          await fetch(`/api/email/messages/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${activeEmail.token}`,
              'x-email-provider': activeEmail.provider || 'mailtm',
              'x-email-address': activeEmail.address,
            },
            signal: AbortSignal.timeout(6000),
          });
        } catch {
          if ((activeEmail.provider || '').toLowerCase() === 'guerrilla' && activeEmail.token) {
            await deleteDirectGuerrillaMessage(activeEmail.token, id);
          }
        }
        setEmailMessages((prev) => prev.filter((m) => m.id !== id));
        setSelectedEmailDetail(null);
        showToast('Email deleted');
      } catch {
        showToast('Could not delete email');
      }
    },
    [activeEmail, showToast]
  );

  useEffect(() => {
    void loadServices();
    void loadLowestDeals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeEmail && savedEmails.length === 0) {
      void (async () => {
        try {
          const res = await fetch('/api/email/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: 'auto' }),
            signal: AbortSignal.timeout(7000),
          });
          if (res.ok) {
            const data = await parseJsonResponse<TempEmailAccount>(res);
            if (data.address) {
              setActiveEmail(data);
              setSavedEmails([data]);
              return;
            }
          }
        } catch {
          // Fall back cleanly to browser direct provider
        }
        try {
          const directAcct = await createDirectGuerrillaAccount();
          setActiveEmail(directAcct);
          setSavedEmails([directAcct]);
        } catch {
          // User can tap Create or Generate manually
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only auto-fetch inbox when the active email address changes (prevents duplicate fetches)
  useEffect(() => {
    if (activeEmail && lastFetchedAddressRef.current !== activeEmail.address) {
      lastFetchedAddressRef.current = activeEmail.address;
      void refreshEmailInbox(activeEmail);
    }
  }, [activeEmail, refreshEmailInbox]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (activeTab === 'home' && activeEmail) {
            void refreshEmailInbox(activeEmail);
          }
          return 15;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, activeTab, activeEmail, refreshEmailInbox]);

  const unreadEmailCount = emailMessages.filter((m) => !m.seen).length;

  return (
    <div className="min-h-dvh w-full bg-[#FAF7F0] text-[#1A160D] dark:bg-[#0A0906] dark:text-[#FAF6EC]">
      <TopBar
        walletBalance={walletBalance}
        onOpenDrawer={() => setDrawerOpen(true)}
        onOpenDeposit={() => setDepositModalOpen(true)}
      />

      <CornerDrawer
        open={drawerOpen}
        activeTab={activeTab}
        activeEmailAddress={activeEmail?.address ?? null}
        walletBalance={walletBalance}
        isDark={isDark}
        onClose={() => setDrawerOpen(false)}
        onNavigate={(tab) => setActiveTab(tab)}
        onSelectPlatform={handlePickPlatformFromDrawer}
        onToggleTheme={() => setIsDark((prev) => !prev)}
        onOpenDeposit={() => setDepositModalOpen(true)}
      />

      <DepositModal
        open={depositModalOpen}
        walletBalance={walletBalance}
        walletUserId={walletUserId}
        userEmail={activeEmail?.address ?? null}
        onClose={() => setDepositModalOpen(false)}
        onCreditSuccess={(creditedAmount, message, serverBalance) => {
          if (typeof serverBalance === 'number') {
            setWalletBalance(serverBalance);
          } else {
            setWalletBalance((prev) => prev + creditedAmount);
          }
          showToast(message);
        }}
      />

      {!isOnline && (
        <div className="fixed bottom-20 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg">
          <WifiOff className="h-3.5 w-3.5" />
          <span>Offline Mode — Cached shell active</span>
        </div>
      )}

      {toast && (
        <div
          role="status"
          className="fixed left-1/2 top-16 z-50 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-[#D4AF37]/40 bg-[#1A160D] px-4 py-2 text-center text-xs font-bold text-[#F5D77A] shadow-xl whitespace-normal break-words"
        >
          {toast}
        </div>
      )}

      <main className="mx-auto w-full max-w-7xl px-3 pb-24 pt-3 sm:px-6 sm:pt-5">
        {activeTab === 'home' && (
          <HomeEmailTab
            activeEmail={activeEmail}
            savedEmails={savedEmails}
            messages={emailMessages}
            selectedMessage={selectedEmailDetail}
            loadingMessages={loadingEmailMessages}
            loadingDetail={loadingEmailDetail}
            emailError={emailError}
            countdown={countdown}
            autoRefresh={autoRefresh}
            onGoToCreate={() => setActiveTab('create')}
            onGoToNumbers={() => setActiveTab('numbers')}
            onGenerateEmail={handleGenerateInstantEmail}
            generatingEmail={generatingEmail}
            onSelectAccount={(acct) => {
              setActiveEmail(acct);
              setSelectedEmailDetail(null);
              showToast(`Switched to ${acct.address}`);
            }}
            onRefreshInbox={() => {
              setCountdown(15);
              void refreshEmailInbox();
            }}
            onOpenMessage={(id) => void handleOpenEmailDetail(id)}
            onCloseMessage={() => setSelectedEmailDetail(null)}
            onDeleteMessage={(id) => void handleDeleteEmailMessage(id)}
            onCopyText={handleCopyText}
          />
        )}

        {activeTab === 'create' && (
          <CreateEmailTab
            savedEmails={savedEmails}
            onComplete={(newAccount) => {
              setActiveEmail(newAccount);
              setSavedEmails((prev) =>
                [newAccount, ...prev.filter((a) => a.address !== newAccount.address)].slice(0, 12)
              );
              setSelectedEmailDetail(null);
              setEmailMessages([]);
              setActiveTab('home');
            }}
            onSelectExisting={(acct) => {
              setActiveEmail(acct);
              setSelectedEmailDetail(null);
              setActiveTab('home');
              showToast(`Signed in as ${acct.address}`);
            }}
            onCancel={() => setActiveTab('home')}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'numbers' && (
          <SmsTab
            fiveSimConfigured={fiveSimConfigured}
            grizzlyConfigured={grizzlyConfigured}
            services={services}
            selectedService={selectedService}
            servicesLoading={servicesLoading}
            countries={countries}
            selectedCountry={selectedCountry}
            selectedProviderQuote={selectedProviderQuote}
            countriesLoading={countriesLoading}
            lowestDeals={lowestDeals}
            lowestDealsLoading={lowestDealsLoading}
            quantity={quantity}
            activeOrders={activeOrders}
            selectedOrder={selectedOrder}
            acquiring={acquiring}
            acquireError={acquireError}
            streamConnected={streamConnected}
            numberHistory={numberHistory}
            viewMode={numbersViewMode}
            onChangeViewMode={(mode) => setNumbersViewMode(mode)}
            onSelectService={(svc) => {
              setSelectedService(svc);
              setAcquireError(null);
              void loadCountriesForService(svc.id, false);
            }}
            onSelectCountry={(c) => {
              setSelectedCountry(c);
              setSelectedProviderQuote(pickBestProviderForCountry(c));
              setAcquireError(null);
            }}
            onSelectProviderQuote={(quote) => {
              setSelectedProviderQuote(quote);
              setAcquireError(null);
            }}
            onSelectLowestDeal={(deal) => {
              const svcMatch = services.find((s) => s.id === deal.serviceId) || {
                id: deal.serviceId,
                name: deal.serviceName,
                popular: true,
              };
              setSelectedService(svcMatch);
              setAcquireError(null);
              void loadCountriesForService(deal.serviceId, false, deal.slug, deal.provider);
            }}
            onRefreshLowestDeals={() => void loadLowestDeals(true)}
            onRefreshCountries={() => {
              if (selectedService) {
                void loadCountriesForService(selectedService.id, true);
              }
            }}
            onChangeQuantity={(qty) => setQuantity(qty)}
            onAcquireNumbers={() => void handleAcquireNumbers()}
            onSelectOrder={(ord) => setSelectedOrderId(ord.id)}
            onCheckOrder={(id) => void handleCheckOrder(id)}
            onCancelOrder={(id) => void handleCancelOrder(id)}
            onFinishOrder={(id) => void handleFinishOrder(id)}
            onReuseFromHistory={handleReuseFromHistory}
            onDeleteFromHistory={handleDeleteFromHistory}
            onCopyText={handleCopyText}
          />
        )}

        {activeTab === 'images' && (
          <ImageGenTab
            onCopyText={(val, label) => void handleCopyText(val, label)}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileTab
            activeEmail={activeEmail}
            savedEmails={savedEmails}
            savedNumbers={savedNumbers}
            otpHistory={otpHistory}
            autoRefresh={autoRefresh}
            isDark={isDark}
            onCreateEmail={() => setActiveTab('create')}
            onSelectEmail={(acct) => {
              setActiveEmail(acct);
              setSelectedEmailDetail(null);
              setActiveTab('home');
            }}
            onRemoveEmail={(address) => {
              const remaining = savedEmails.filter((e) => e.address !== address);
              setSavedEmails(remaining);
              if (activeEmail?.address === address) {
                setActiveEmail(remaining[0] || null);
              }
              showToast('Email removed');
            }}
            onOpenSmsNumber={(entry) => {
              const matched = numberHistory.find((h) => h.digits === entry.digits);
              if (matched) {
                handleReuseFromHistory(matched);
              } else {
                setNumbersViewMode('setup');
              }
              setActiveTab('numbers');
            }}
            onRemoveSavedNumber={(digits) => {
              setSavedNumbers((prev) => prev.filter((n) => n.digits !== digits));
              showToast('Number removed');
            }}
            onToggleAutoRefresh={() => setAutoRefresh((prev) => !prev)}
            onToggleTheme={() => setIsDark((prev) => !prev)}
            onClearHistory={() => {
              setOtpHistory([]);
              showToast('OTP history cleared');
            }}
            onCopyText={(val, label) => void handleCopyText(val, label)}
          />
        )}
      </main>

      <BottomNav
        activeTab={activeTab}
        unreadEmailCount={unreadEmailCount}
        onChange={(tab) => setActiveTab(tab)}
      />
    </div>
  );
}
