import { useCallback, useEffect, useRef, useState } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { WifiOff } from 'lucide-react';
import { AdminDiagnosticsTab } from './components/AdminDiagnosticsTab';
import { AuthModal } from './components/AuthModal';
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
  AdminDiagnosticsResponse,
  AdminInboundTestResult,
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
import { CUSTOM_EMAIL_DOMAIN } from './utils/directEmailFallback';
import { ensureSupabaseClient, getActiveSupabaseClient } from './utils/supabase';

const STORAGE_KEYS = {
  emails: 'veribox_saved_emails_v2',
  deletedEmails: 'veribox_deleted_emails_v2',
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
  dailyGenerateQuota: 'veribox_daily_generate_quota_v1',
};

const FREE_DAILY_EMAIL_LIMIT = 5;
const OWNER_ADMIN_EMAIL = 'preciousddkid@gmail.com';

function getLocalDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function readDailyGenerateCount(userId: string): number {
  const today = getLocalDateKey();
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.dailyGenerateQuota);
    if (!raw) return 0;
    const map = JSON.parse(raw) as Record<string, { date?: string; count?: number }>;
    const entry = map[userId];
    if (!entry || entry.date !== today) return 0;
    return Math.max(0, Math.min(FREE_DAILY_EMAIL_LIMIT, Number(entry.count) || 0));
  } catch {
    return 0;
  }
}

function writeDailyGenerateCount(userId: string, nextCount: number): number {
  const today = getLocalDateKey();
  const clamped = Math.max(0, Math.min(FREE_DAILY_EMAIL_LIMIT, nextCount));
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.dailyGenerateQuota);
    const map = raw ? (JSON.parse(raw) as Record<string, { date?: string; count?: number }>) : {};
    map[userId] = { date: today, count: clamped };
    localStorage.setItem(STORAGE_KEYS.dailyGenerateQuota, JSON.stringify(map));
  } catch {
    // Non-blocking
  }
  return clamped;
}

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

function isCustomDomainMailbox(
  account: TempEmailAccount | null | undefined,
  domain: string = CUSTOM_EMAIL_DOMAIN
): account is TempEmailAccount {
  const cleanDomain = (domain || CUSTOM_EMAIL_DOMAIN).trim().toLowerCase().replace(/^@+/, '');
  return Boolean(
    account &&
      typeof account.address === 'string' &&
      account.address.toLowerCase().endsWith(`@${cleanDomain}`)
  );
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
  const [countdown, setCountdown] = useState<number>(2);

  // Supabase Auth & Naira Wallet Balance state (synced with Supabase & Paystack webhook)
  const [authUser, setAuthUser] = useState<SupabaseUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authActionReason, setAuthActionReason] = useState<string | null>(null);
  const pendingAuthActionRef = useRef<(() => void) | null>(null);
  const handledManualAuthRef = useRef<boolean>(false);

  const [guestWalletId] = useState<string>(() => getOrCreateWalletUserId());
  const isAuthenticated = Boolean(authUser);
  const isOwnerAdmin =
    (authUser?.email || '').trim().toLowerCase() === OWNER_ADMIN_EMAIL;
  const walletUserId = authUser?.id || guestWalletId;
  const [walletBalance, setWalletBalance] = useState<number>(() =>
    readStorage<number>(STORAGE_KEYS.walletBalance, 0)
  );
  const [depositModalOpen, setDepositModalOpen] = useState<boolean>(false);

  // Owner Admin Diagnostics state (only active when signed in as preciousddkid@gmail.com)
  const [adminDiagnostics, setAdminDiagnostics] = useState<AdminDiagnosticsResponse | null>(null);
  const [adminLoading, setAdminLoading] = useState<boolean>(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [testingInbound, setTestingInbound] = useState<boolean>(false);
  const [adminTestResult, setAdminTestResult] = useState<AdminInboundTestResult | null>(null);
  const [adminTestError, setAdminTestError] = useState<string | null>(null);
  const autoSwitchedAdminUserIdRef = useRef<string | null>(null);

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

  // Email state (custom domain from process.env.EMAIL_DOMAIN)
  const [emailDomain, setEmailDomain] = useState<string>(CUSTOM_EMAIL_DOMAIN);
  const [savedEmails, setSavedEmails] = useState<TempEmailAccount[]>(() =>
    readStorage<TempEmailAccount[]>(STORAGE_KEYS.emails, []).filter((a) =>
      isCustomDomainMailbox(a, CUSTOM_EMAIL_DOMAIN)
    )
  );
  const [deletedEmails, setDeletedEmails] = useState<TempEmailAccount[]>(() =>
    readStorage<TempEmailAccount[]>(STORAGE_KEYS.deletedEmails, []).filter((a) =>
      isCustomDomainMailbox(a, CUSTOM_EMAIL_DOMAIN)
    )
  );
  const [activeEmail, setActiveEmail] = useState<TempEmailAccount | null>(() => {
    const stored = readStorage<TempEmailAccount | null>(STORAGE_KEYS.activeEmail, null);
    return isCustomDomainMailbox(stored, CUSTOM_EMAIL_DOMAIN) ? stored : null;
  });
  const [emailMessages, setEmailMessages] = useState<EmailMessageSummary[]>([]);
  const [selectedEmailDetail, setSelectedEmailDetail] = useState<EmailMessageDetail | null>(null);
  const [loadingEmailMessages, setLoadingEmailMessages] = useState<boolean>(false);
  const [loadingEmailDetail, setLoadingEmailDetail] = useState<boolean>(false);
  const [generatingEmail, setGeneratingEmail] = useState<boolean>(false);
  const [emailStreamConnected, setEmailStreamConnected] = useState<boolean>(false);
  const [dailyGenerateUsed, setDailyGenerateUsed] = useState<number>(() =>
    readDailyGenerateCount(walletUserId)
  );
  const [emailError, setEmailError] = useState<string | null>(null);

  // Profile / Vault state
  const [savedNumbers, setSavedNumbers] = useState<PhoneNumberEntry[]>(() =>
    readStorage<PhoneNumberEntry[]>(STORAGE_KEYS.savedNumbers, [])
  );
  const [otpHistory, setOtpHistory] = useState<CopiedOtpRecord[]>(() =>
    readStorage<CopiedOtpRecord[]>(STORAGE_KEYS.otpHistory, [])
  );

  const lastFetchedAddressRef = useRef<string | null>(null);
  const knownEmailMsgIdsRef = useRef<Set<string>>(new Set());
  const notifiedSmsOrderIdsRef = useRef<Set<number>>(new Set());
  const autoRefundedOrderIdsRef = useRef<Set<number>>(new Set());

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
    localStorage.setItem(STORAGE_KEYS.deletedEmails, JSON.stringify(deletedEmails));
  }, [deletedEmails]);

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

  useEffect(() => {
    setDailyGenerateUsed(readDailyGenerateCount(walletUserId));
  }, [walletUserId]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => {
      setToast((prev) => (prev === message ? null : prev));
    }, 2400);
  }, []);



  const openAuthModal = useCallback((reason?: string, pendingAction?: () => void) => {
    pendingAuthActionRef.current = pendingAction || null;
    setAuthActionReason(reason || null);
    setAuthModalOpen(true);
  }, []);

  const requireAuth = useCallback(
    (reason: string, action: () => void) => {
      if (authUser) {
        action();
        return;
      }
      openAuthModal(reason, action);
    },
    [authUser, openAuthModal]
  );

  const getAuthAccessToken = useCallback(async (): Promise<string | null> => {
    const client = getActiveSupabaseClient() || (await ensureSupabaseClient());
    if (!client) return null;
    try {
      const { data } = await client.auth.getSession();
      return data.session?.access_token || null;
    } catch {
      return null;
    }
  }, []);

  const fetchAdminDiagnostics = useCallback(async () => {
    if (!isOwnerAdmin) return;
    setAdminLoading(true);
    setAdminError(null);
    try {
      const token = await getAuthAccessToken();
      if (!token) {
        throw new Error('HTTP 401: Missing active Supabase session token for admin diagnostics.');
      }
      const res = await fetch('/api/admin/diagnostics', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(10000),
      });
      const data = await parseJsonResponse<AdminDiagnosticsResponse & { error?: string }>(res);
      if (!res.ok) {
        throw new Error(
          `HTTP ${res.status}: ${data.error || res.statusText || 'Failed to load diagnostics'}`
        );
      }
      setAdminDiagnostics(data);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.name === 'TimeoutError' || err.name === 'AbortError'
            ? 'Request timed out while loading admin diagnostics'
            : err.message
          : 'Failed to load admin diagnostics';
      setAdminError(message);
    } finally {
      setAdminLoading(false);
    }
  }, [isOwnerAdmin, getAuthAccessToken]);

  const handleTestInboundPipeline = useCallback(
    async (targetAddress: string) => {
      if (!isOwnerAdmin) return;
      setTestingInbound(true);
      setAdminTestError(null);
      try {
        const token = await getAuthAccessToken();
        if (!token) {
          throw new Error('HTTP 401: Missing active Supabase session token.');
        }
        const res = await fetch('/api/admin/test-inbound', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ targetAddress }),
          signal: AbortSignal.timeout(12000),
        });
        const data = await parseJsonResponse<AdminInboundTestResult & { error?: string }>(res);
        if (!res.ok && typeof data.httpStatus !== 'number') {
          throw new Error(
            `HTTP ${res.status}: ${data.error || res.statusText || 'Inbound test request failed'}`
          );
        }
        setAdminTestResult(data);
        void fetchAdminDiagnostics();
      } catch (err) {
        const message =
          err instanceof Error
            ? err.name === 'TimeoutError' || err.name === 'AbortError'
              ? 'Request timed out while testing inbound pipeline'
              : err.message
            : 'Inbound pipeline test failed';
        setAdminTestError(message);
      } finally {
        setTestingInbound(false);
      }
    },
    [isOwnerAdmin, getAuthAccessToken, fetchAdminDiagnostics]
  );

  // Auto-switch owner account (preciousddkid@gmail.com) to Owner Admin Diagnostics on sign-in,
  // and immediately lock out non-owner accounts if activeTab was ever 'admin'.
  useEffect(() => {
    if (isOwnerAdmin && authUser?.id) {
      if (autoSwitchedAdminUserIdRef.current !== authUser.id) {
        autoSwitchedAdminUserIdRef.current = authUser.id;
        setActiveTab('admin');
        void fetchAdminDiagnostics();
      }
    } else {
      autoSwitchedAdminUserIdRef.current = null;
      setAdminDiagnostics(null);
      setAdminError(null);
      setAdminTestResult(null);
      setAdminTestError(null);
      setActiveTab((prev) => (prev === 'admin' ? 'home' : prev));
    }
  }, [isOwnerAdmin, authUser?.id, fetchAdminDiagnostics]);

  const handleSignOut = useCallback(async () => {
    const client = getActiveSupabaseClient() || (await ensureSupabaseClient());
    if (client) {
      await client.auth.signOut().catch(() => undefined);
    }
    pendingAuthActionRef.current = null;
    autoSwitchedAdminUserIdRef.current = null;
    setAuthUser(null);
    setWalletBalance(0);
    setAdminDiagnostics(null);
    setAdminError(null);
    setAdminTestResult(null);
    setAdminTestError(null);
    setActiveTab((prev) => (prev === 'admin' ? 'home' : prev));
    setAuthModalOpen(false);
    setAuthActionReason(null);
    showToast('Signed out');
  }, [showToast]);

  // Hydrate Supabase Auth session and listen for Google OAuth / Email Sign-In events
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;

    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('error_description') || params.get('error');
    if (oauthError) {
      showToast(oauthError);
      const clean = new URL(window.location.href);
      clean.searchParams.delete('error');
      clean.searchParams.delete('error_description');
      clean.searchParams.delete('error_code');
      window.history.replaceState({}, document.title, `${clean.pathname}${clean.search}`);
    }

    void ensureSupabaseClient().then(async (client) => {
      if (!active || !client) return;

      try {
        const { data } = await client.auth.getSession();
        if (active && data.session?.user) {
          setAuthUser(data.session.user);
        }
      } catch {
        // Non-blocking
      }

      const { data: listener } = client.auth.onAuthStateChange((event, session) => {
        if (!active) return;
        const nextUser = session?.user ?? null;
        setAuthUser(nextUser);

        if (nextUser && (event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
          setAuthModalOpen(false);
          setAuthActionReason(null);

          const url = new URL(window.location.href);
          if (url.searchParams.has('code') || url.hash.includes('access_token')) {
            url.searchParams.delete('code');
            url.searchParams.delete('state');
            window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
          }

          if (handledManualAuthRef.current) {
            return;
          }

          const pending = pendingAuthActionRef.current;
          pendingAuthActionRef.current = null;
          if (pending) {
            pending();
          } else if (event === 'SIGNED_IN') {
            const label =
              (nextUser.user_metadata?.full_name as string | undefined) ||
              nextUser.email ||
              'your account';
            showToast(`Signed in as ${label}`);
          }
        } else if (event === 'SIGNED_OUT') {
          pendingAuthActionRef.current = null;
          setWalletBalance(0);
        }
      });

      unsubscribe = () => listener.subscription.unsubscribe();
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [showToast]);

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

  // Sync wallet balance from server/Supabase + subscribe to Supabase Realtime updates when signed in
  useEffect(() => {
    if (!authUser) {
      return;
    }

    void syncServerWalletBalance();

    let active = true;
    let cleanupChannel: (() => void) | null = null;

    void ensureSupabaseClient().then((sb) => {
      if (!active || !sb) return;
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

      cleanupChannel = () => {
        void sb.removeChannel(channel);
      };
    });

    return () => {
      active = false;
      cleanupChannel?.();
    };
  }, [authUser, walletUserId, syncServerWalletBalance, showToast]);

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

  const activeOrdersRef = useRef(activeOrders);
  activeOrdersRef.current = activeOrders;
  const numberHistoryRef = useRef(numberHistory);
  numberHistoryRef.current = numberHistory;

  const refundOrderHold = useCallback(
    async (orderId: number, amountNgn: number, toastMessage?: string) => {
      if (amountNgn <= 0 || autoRefundedOrderIdsRef.current.has(orderId)) return;
      autoRefundedOrderIdsRef.current.add(orderId);
      setWalletBalance((prev) => prev + amountNgn);
      try {
        const res = await fetch('/api/wallet/refund', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: walletUserId,
            amount: amountNgn,
            reference: `refund-${orderId}`,
          }),
        });
        const data = await parseJsonResponse<{ balance?: number | null }>(res);
        if (res.ok && typeof data.balance === 'number') {
          setWalletBalance(data.balance);
        }
      } catch {
        // Local optimistic refund already applied; webhook/sync reconciles
      }
      if (toastMessage) {
        showToast(toastMessage);
      }
    },
    [walletUserId, showToast]
  );

  const syncOrderIntoState = useCallback(
    (updated: PrivateNumberOrder) => {
      const existing =
        activeOrdersRef.current.find((o) => o.id === updated.id) ||
        numberHistoryRef.current.find((o) => o.id === updated.id);

      const mergedSms = Array.isArray(updated.sms) ? updated.sms : existing?.sms || [];
      const orderPrice = updated.price ?? existing?.price ?? 0;

      if (mergedSms.length > 0 && !notifiedSmsOrderIdsRef.current.has(updated.id)) {
        notifiedSmsOrderIdsRef.current.add(updated.id);
        showToast('Verification code received! Charge finalized.');
      }

      if (
        mergedSms.length === 0 &&
        ['CANCELED', 'TIMEOUT', 'BANNED'].includes(updated.status) &&
        orderPrice > 0 &&
        !autoRefundedOrderIdsRef.current.has(updated.id)
      ) {
        void refundOrderHold(
          updated.id,
          orderPrice,
          `Order ${updated.status.toLowerCase()} · ₦${orderPrice.toLocaleString()} refunded`
        );
      }

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
    },
    [refundOrderHold, showToast]
  );

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
      selectedProviderQuote?.minPrice ||
      selectedCountry.minPrice ||
      selectedProviderQuote?.inStockMinPrice ||
      selectedCountry.inStockMinPrice ||
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
          userId: walletUserId,
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
      const data = await parseJsonResponse<{
        orders?: PrivateNumberOrder[];
        balance?: number;
        error?: string;
      }>(res);
      if (res.status === 402) {
        if (typeof data.balance === 'number') {
          setWalletBalance(data.balance);
        }
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
        })
          .then((r) => parseJsonResponse<{ balance?: number | null }>(r).then((d) => ({ ok: r.ok, d })))
          .then(({ ok, d }) => {
            if (ok && typeof d.balance === 'number') {
              setWalletBalance(d.balance);
            }
          })
          .catch(() => undefined);
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
      // Immediately kick off a check on acquired numbers so incoming codes show with zero delay
      void handleCheckOrder(data.orders[0].id, data.orders[0].provider || 'fivesim');
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
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: walletUserId,
              refundAmount: targetOrder?.price || 0,
            }),
          }
        );
        const data = await parseJsonResponse<{
          cancelled?: boolean;
          alreadyHasSms?: boolean;
          refunded?: boolean;
          refundedAmount?: number;
          walletBalance?: number | null;
          order?: PrivateNumberOrder;
          error?: string;
        }>(res);

        if (res.status === 409 && data.alreadyHasSms) {
          if (data.order) {
            syncOrderIntoState(data.order);
          }
          showToast(data.error || 'Verification code already arrived — charge finalized.');
          return;
        }

        if (!res.ok) {
          throw new Error(data.error || 'Could not cancel number session');
        }

        if (data.order) {
          autoRefundedOrderIdsRef.current.add(orderId);
          syncOrderIntoState(data.order);
        } else {
          setNumberHistory((prev) =>
            prev.map((o) => (o.id === orderId ? { ...o, status: 'CANCELED' } : o))
          );
        }

        if (typeof data.walletBalance === 'number') {
          autoRefundedOrderIdsRef.current.add(orderId);
          setWalletBalance(data.walletBalance);
        } else if (
          targetOrder &&
          targetOrder.sms.length === 0 &&
          targetOrder.price &&
          !autoRefundedOrderIdsRef.current.has(orderId)
        ) {
          await refundOrderHold(targetOrder.id, targetOrder.price);
        }

        setActiveOrders((prev) => {
          const remaining = prev.filter((o) => o.id !== orderId);
          setSelectedOrderId((curr) => (curr === orderId ? remaining[0]?.id ?? null : curr));
          if (remaining.length === 0) {
            setNumbersViewMode('setup');
          }
          return remaining;
        });

        const refundedAmt = data.refundedAmount || (targetOrder?.sms.length === 0 ? targetOrder?.price : 0) || 0;
        showToast(
          refundedAmt > 0
            ? `Number cancelled · ₦${refundedAmt.toLocaleString()} refunded`
            : 'Number session cancelled'
        );
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not cancel number session');
      }
    },
    [activeOrders, syncOrderIntoState, walletUserId, refundOrderHold, showToast]
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

  // Fast, zero-lag 2-second polling for active number codes (works seamlessly on Vercel & mobile)
  useEffect(() => {
    if (
      activeTab !== 'numbers' ||
      numbersViewMode !== 'receiver' ||
      !selectedOrder ||
      ['FINISHED', 'CANCELED', 'TIMEOUT', 'BANNED'].includes(selectedOrder.status)
    ) {
      return;
    }

    let cancelled = false;
    let inFlight = false;

    const pollNow = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        await handleCheckOrder(selectedOrder.id, selectedOrder.provider || 'fivesim');
      } finally {
        inFlight = false;
      }
    };

    void pollNow();
    const timer = window.setInterval(() => {
      void pollNow();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    activeTab,
    numbersViewMode,
    selectedOrder?.id,
    selectedOrder?.provider,
    selectedOrder?.status,
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

  const applyInboxSnapshot = useCallback(
    (address: string, nextMessages: EmailMessageSummary[], notifyNew = false) => {
      const normalized = address.toLowerCase();
      if (lastFetchedAddressRef.current !== normalized) {
        knownEmailMsgIdsRef.current = new Set(nextMessages.map((m) => m.id));
        lastFetchedAddressRef.current = normalized;
      } else if (notifyNew) {
        const newlyArrived = nextMessages.filter((m) => !knownEmailMsgIdsRef.current.has(m.id));
        if (newlyArrived.length > 0) {
          const newest = newlyArrived[0];
          showToast(
            newest.otp
              ? `New email from ${newest.fromName} · Code ${newest.otp}`
              : `New email: ${newest.subject}`
          );
        }
        for (const m of nextMessages) knownEmailMsgIdsRef.current.add(m.id);
      } else {
        for (const m of nextMessages) knownEmailMsgIdsRef.current.add(m.id);
      }
      setEmailMessages(nextMessages);
    },
    [showToast]
  );

  const refreshEmailInbox = useCallback(
    async (accountOverride?: TempEmailAccount | null, silent = false) => {
      const target = accountOverride ?? activeEmail;
      if (!target) return;
      if (!silent) {
        setLoadingEmailMessages(true);
        setEmailError(null);
      }
      try {
        const res = await fetch('/api/email/messages', {
          headers: {
            Authorization: `Bearer ${target.token}`,
            'x-email-provider': 'veribox',
            'x-email-address': target.address,
          },
          signal: AbortSignal.timeout(8000),
        });

        const data = await parseJsonResponse<{
          messages?: EmailMessageSummary[];
          error?: string;
          warning?: string;
          code?: string;
        }>(res);
        if (!res.ok) {
          const codeSuffix = data.code ? ` [${data.code}]` : '';
          throw new Error(
            `HTTP ${res.status}${codeSuffix}: ${data.error || res.statusText || 'Failed to read email inbox'}`
          );
        }
        applyInboxSnapshot(target.address, data.messages || [], silent);
        setEmailError(data.warning ? `Sync warning: ${data.warning}` : null);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.name === 'TimeoutError' || err.name === 'AbortError'
              ? 'Request timed out while checking email inbox (8s timeout)'
              : err.message
            : 'Failed to load emails';
        setEmailError(message);
      } finally {
        if (!silent) {
          setLoadingEmailMessages(false);
        }
      }
    },
    [activeEmail, applyInboxSnapshot]
  );

  const handleGenerateCustomEmail = useCallback(async () => {
    const usedToday = readDailyGenerateCount(walletUserId);
    setDailyGenerateUsed(usedToday);
    if (usedToday >= FREE_DAILY_EMAIL_LIMIT) {
      const limitMsg = `Daily free limit reached (${FREE_DAILY_EMAIL_LIMIT}/${FREE_DAILY_EMAIL_LIMIT} today). Resets tomorrow or use Create (₦50).`;
      setEmailError(limitMsg);
      showToast(limitMsg);
      return;
    }

    setGeneratingEmail(true);
    setEmailError(null);
    try {
      const res = await fetch('/api/email/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: walletUserId,
          accountMode: 'personal',
        }),
        signal: AbortSignal.timeout(9000),
      });
      const data = await parseJsonResponse<TempEmailAccount & { error?: string }>(res);
      if (!res.ok || !data.address) {
        throw new Error(data.error || `Could not generate @${emailDomain} email`);
      }

      const nextUsed = writeDailyGenerateCount(walletUserId, usedToday + 1);
      setDailyGenerateUsed(nextUsed);
      const remaining = Math.max(0, FREE_DAILY_EMAIL_LIMIT - nextUsed);

      lastFetchedAddressRef.current = null;
      knownEmailMsgIdsRef.current = new Set();
      setActiveEmail(data);
      setSavedEmails((prev) =>
        [data, ...prev.filter((a) => a.address.toLowerCase() !== data.address.toLowerCase())].slice(
          0,
          20
        )
      );
      setSelectedEmailDetail(null);
      setEmailMessages([]);
      setCountdown(3);
      showToast(`Generated ${data.address} · ${remaining}/${FREE_DAILY_EMAIL_LIMIT} free left today`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Could not generate @${emailDomain} email`;
      setEmailError(msg);
      showToast(msg);
    } finally {
      setGeneratingEmail(false);
    }
  }, [walletUserId, emailDomain, showToast]);

  const handleOpenEmailDetail = useCallback(
    async (id: string) => {
      if (!activeEmail) return;
      setLoadingEmailDetail(true);
      try {
        const res = await fetch(`/api/email/messages/${encodeURIComponent(id)}`, {
          headers: {
            Authorization: `Bearer ${activeEmail.token}`,
            'x-email-provider': 'veribox',
            'x-email-address': activeEmail.address,
          },
          signal: AbortSignal.timeout(8000),
        });
        const data = await parseJsonResponse<EmailMessageDetail & { error?: string }>(res);
        if (!res.ok || !data.id) {
          throw new Error(`HTTP ${res.status}: ${data.error || res.statusText || 'Could not load email'}`);
        }

        setSelectedEmailDetail(data);
        setEmailMessages((prev) => prev.map((m) => (m.id === id ? { ...m, seen: true } : m)));
        setEmailError(null);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.name === 'TimeoutError' || err.name === 'AbortError'
              ? 'Request timed out while opening email'
              : err.message
            : 'Failed to open email';
        setEmailError(msg);
        showToast(msg);
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
        await fetch(`/api/email/messages/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${activeEmail.token}`,
            'x-email-provider': 'veribox',
            'x-email-address': activeEmail.address,
          },
          signal: AbortSignal.timeout(6000),
        });
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
    void (async () => {
      try {
        const res = await fetch('/api/email/domains');
        if (!res.ok) return;
        const data = await parseJsonResponse<{ domain?: string }>(res);
        if (data.domain && typeof data.domain === 'string') {
          const clean = data.domain.trim().toLowerCase().replace(/^@+/, '');
          if (clean) setEmailDomain(clean);
        }
      } catch {
        // Keep default configured domain
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteEmailAccount = useCallback(
    (address: string) => {
      const lower = address.toLowerCase();
      const target =
        savedEmails.find((e) => e.address.toLowerCase() === lower) ||
        (activeEmail?.address.toLowerCase() === lower ? activeEmail : null);

      if (target) {
        setDeletedEmails((prev) =>
          [target, ...prev.filter((d) => d.address.toLowerCase() !== lower)].slice(0, 25)
        );
        void fetch('/api/email/manage/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: target.address, token: target.token }),
        }).catch(() => undefined);
      }

      const remaining = savedEmails.filter((e) => e.address.toLowerCase() !== lower);
      setSavedEmails(remaining);

      if (activeEmail?.address.toLowerCase() === lower) {
        const nextActive = remaining[0] || null;
        lastFetchedAddressRef.current = null;
        knownEmailMsgIdsRef.current = new Set();
        setActiveEmail(nextActive);
        setSelectedEmailDetail(null);
        setEmailMessages([]);
        setEmailError(null);
      }

      showToast('Email deleted from Home · Recover anytime in Create with its password');
    },
    [savedEmails, activeEmail, showToast]
  );

  // Sync user's saved mailboxes when signed in
  useEffect(() => {
    if (!authUser) return;
    let active = true;
    void (async () => {
      try {
        const res = await fetch(`/api/email/list?userId=${encodeURIComponent(authUser.id)}`, {
          signal: AbortSignal.timeout(7000),
        });
        if (!res.ok || !active) return;
        const data = await parseJsonResponse<{ accounts?: TempEmailAccount[] }>(res);
        if (!active || !Array.isArray(data.accounts) || data.accounts.length === 0) return;
        const serverList = data.accounts.filter((a) => isCustomDomainMailbox(a, emailDomain));
        if (serverList.length === 0) return;
        setSavedEmails((prev) => {
          const map = new Map<string, TempEmailAccount>();
          for (const item of prev) map.set(item.address.toLowerCase(), item);
          for (const srv of serverList) {
            const existing = map.get(srv.address.toLowerCase());
            map.set(srv.address.toLowerCase(), {
              ...srv,
              password: existing?.password || srv.password || '',
            });
          }
          return Array.from(map.values()).slice(0, 20);
        });
        setActiveEmail((prev) => prev || serverList[0]);
      } catch {
        // Non-blocking
      }
    })();
    return () => {
      active = false;
    };
  }, [authUser, emailDomain]);

  // Fetch inbox immediately when active email changes
  useEffect(() => {
    if (activeEmail && lastFetchedAddressRef.current !== activeEmail.address.toLowerCase()) {
      knownEmailMsgIdsRef.current = new Set();
      void refreshEmailInbox(activeEmail, false);
    }
  }, [activeEmail, refreshEmailInbox]);

  // Real-time SSE stream for instant incoming emails on active mailbox
  useEffect(() => {
    if (!autoRefresh || activeTab !== 'home' || !activeEmail) {
      setEmailStreamConnected(false);
      return;
    }

    const params = new URLSearchParams({
      address: activeEmail.address,
      token: activeEmail.token,
    });
    const es = new EventSource(`/api/email/stream?${params.toString()}`);
    es.onopen = () => setEmailStreamConnected(true);
    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          type?: string;
          messages?: EmailMessageSummary[];
        };
        if (Array.isArray(payload.messages)) {
          applyInboxSnapshot(
            activeEmail.address,
            payload.messages,
            payload.type === 'new_email'
          );
        }
      } catch {
        // Ignore malformed SSE event
      }
    };
    es.onerror = () => setEmailStreamConnected(false);

    return () => {
      es.close();
      setEmailStreamConnected(false);
    };
  }, [autoRefresh, activeTab, activeEmail?.address, activeEmail?.token, applyInboxSnapshot]);

  // Fast 2-second silent polling + immediate refresh when returning from another app/tab
  useEffect(() => {
    if (!autoRefresh || activeTab !== 'home' || !activeEmail) return;
    setCountdown(2);
    const timer = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          void refreshEmailInbox(activeEmail, true);
          return 2;
        }
        return prev - 1;
      });
    }, 1000);

    const handleResume = () => {
      if (document.visibilityState === 'hidden') return;
      setCountdown(2);
      void refreshEmailInbox(activeEmail, true);
    };

    window.addEventListener('focus', handleResume);
    window.addEventListener('pageshow', handleResume);
    document.addEventListener('visibilitychange', handleResume);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('pageshow', handleResume);
      document.removeEventListener('visibilitychange', handleResume);
    };
  }, [autoRefresh, activeTab, activeEmail, refreshEmailInbox]);

  const unreadEmailCount = emailMessages.filter((m) => !m.seen).length;

  return (
    <div className="min-h-dvh w-full bg-[#FAF7F0] text-[#1A160D] dark:bg-[#0A0906] dark:text-[#FAF6EC]">
      <TopBar
        isAuthenticated={isAuthenticated}
        isOwnerAdmin={isOwnerAdmin}
        activeTab={activeTab}
        userEmail={authUser?.email ?? null}
        userName={
          (authUser?.user_metadata?.full_name as string | undefined) ||
          (authUser?.user_metadata?.name as string | undefined) ||
          null
        }
        avatarUrl={(authUser?.user_metadata?.avatar_url as string | undefined) || null}
        walletBalance={walletBalance}
        onOpenDrawer={() => setDrawerOpen(true)}
        onOpenDeposit={() =>
          requireAuth('Sign in to fund your Naira wallet', () => setDepositModalOpen(true))
        }
        onOpenProfile={() => setActiveTab('profile')}
        onOpenAuth={() => openAuthModal()}
        onToggleAdmin={() => {
          if (!isOwnerAdmin) return;
          if (activeTab === 'admin') {
            setActiveTab('home');
          } else {
            setActiveTab('admin');
            void fetchAdminDiagnostics();
          }
        }}
      />

      <CornerDrawer
        open={drawerOpen}
        isAuthenticated={isAuthenticated}
        isOwnerAdmin={isOwnerAdmin}
        userEmail={authUser?.email ?? null}
        userName={
          (authUser?.user_metadata?.full_name as string | undefined) ||
          (authUser?.user_metadata?.name as string | undefined) ||
          null
        }
        activeTab={activeTab}
        activeEmailAddress={activeEmail?.address ?? null}
        walletBalance={walletBalance}
        isDark={isDark}
        onClose={() => setDrawerOpen(false)}
        onNavigate={(tab) => {
          if (tab === 'admin') {
            if (!isOwnerAdmin) return;
            setActiveTab('admin');
            void fetchAdminDiagnostics();
            return;
          }
          setActiveTab(tab);
        }}
        onSelectPlatform={(p) =>
          requireAuth('Sign in to get a dedicated phone number', () =>
            handlePickPlatformFromDrawer(p)
          )
        }
        onToggleTheme={() => setIsDark((prev) => !prev)}
        onOpenDeposit={() =>
          requireAuth('Sign in to fund your Naira wallet', () => setDepositModalOpen(true))
        }
        onOpenAuth={() => openAuthModal()}
        onSignOut={() => void handleSignOut()}
      />

      <AuthModal
        open={authModalOpen}
        actionReason={authActionReason}
        onClose={() => {
          pendingAuthActionRef.current = null;
          setAuthModalOpen(false);
          setAuthActionReason(null);
        }}
        onAuthSuccess={(user, msg) => {
          handledManualAuthRef.current = true;
          window.setTimeout(() => {
            handledManualAuthRef.current = false;
          }, 1500);
          setAuthUser(user);
          setAuthModalOpen(false);
          setAuthActionReason(null);
          showToast(msg);
          const pending = pendingAuthActionRef.current;
          pendingAuthActionRef.current = null;
          if (pending) {
            if ((user.email || '').trim().toLowerCase() === OWNER_ADMIN_EMAIL) {
              autoSwitchedAdminUserIdRef.current = user.id;
            }
            pending();
          }
        }}
      />

      <DepositModal
        open={depositModalOpen}
        walletBalance={walletBalance}
        walletUserId={walletUserId}
        userEmail={authUser?.email || activeEmail?.address || null}
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
            emailDomain={emailDomain}
            activeEmail={activeEmail}
            savedEmails={savedEmails}
            messages={emailMessages}
            selectedMessage={selectedEmailDetail}
            loadingMessages={loadingEmailMessages}
            loadingDetail={loadingEmailDetail}
            generatingEmail={generatingEmail}
            emailStreamConnected={emailStreamConnected}
            dailyGenerateUsed={dailyGenerateUsed}
            dailyGenerateLimit={FREE_DAILY_EMAIL_LIMIT}
            emailError={emailError}
            countdown={countdown}
            autoRefresh={autoRefresh}
            onGenerateEmail={() =>
              requireAuth(`Sign in to generate a live @${emailDomain} email`, () => {
                void handleGenerateCustomEmail();
              })
            }
            onGoToCreate={() =>
              requireAuth(`Sign in to create an @${emailDomain} email`, () =>
                setActiveTab('create')
              )
            }
            onGoToNumbers={() => setActiveTab('numbers')}
            onSelectAccount={(acct) =>
              requireAuth('Sign in to switch email accounts', () => {
                setActiveEmail(acct);
                setSelectedEmailDetail(null);
                showToast(`Switched to ${acct.address}`);
              })
            }
            onDeleteAccount={(address) =>
              requireAuth('Sign in to manage email addresses', () => {
                handleDeleteEmailAccount(address);
              })
            }
            onRefreshInbox={() =>
              requireAuth('Sign in to check your email inbox', () => {
                setCountdown(3);
                void refreshEmailInbox(activeEmail, false);
              })
            }
            onOpenMessage={(id) =>
              requireAuth('Sign in to read inbox messages', () => {
                void handleOpenEmailDetail(id);
              })
            }
            onCloseMessage={() => setSelectedEmailDetail(null)}
            onDeleteMessage={(id) =>
              requireAuth('Sign in to manage inbox messages', () => {
                void handleDeleteEmailMessage(id);
              })
            }
            onCopyText={handleCopyText}
          />
        )}

        {activeTab === 'create' && (
          <CreateEmailTab
            emailDomain={emailDomain}
            isAuthenticated={isAuthenticated}
            onRequireAuth={(reason) =>
              openAuthModal(reason || 'Sign in to create an email', () => setActiveTab('create'))
            }
            walletBalance={walletBalance}
            walletUserId={walletUserId}
            onWalletBalanceChange={setWalletBalance}
            onOpenDeposit={() => setDepositModalOpen(true)}
            savedEmails={savedEmails}
            deletedEmails={deletedEmails}
            onComplete={(newAccount) => {
              setDeletedEmails((prev) =>
                prev.filter((d) => d.address.toLowerCase() !== newAccount.address.toLowerCase())
              );
              setActiveEmail(newAccount);
              setSavedEmails((prev) =>
                [newAccount, ...prev.filter((a) => a.address !== newAccount.address)].slice(0, 12)
              );
              setSelectedEmailDetail(null);
              setEmailMessages([]);
              setActiveTab('home');
            }}
            onSelectExisting={(acct) => {
              lastFetchedAddressRef.current = null;
              setDeletedEmails((prev) =>
                prev.filter((d) => d.address.toLowerCase() !== acct.address.toLowerCase())
              );
              setSavedEmails((prev) =>
                [acct, ...prev.filter((a) => a.address.toLowerCase() !== acct.address.toLowerCase())].slice(
                  0,
                  12
                )
              );
              setActiveEmail(acct);
              setSelectedEmailDetail(null);
              setActiveTab('home');
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
            walletBalance={walletBalance}
            activeOrders={activeOrders}
            selectedOrder={selectedOrder}
            acquiring={acquiring}
            acquireError={acquireError}
            streamConnected={streamConnected}
            numberHistory={numberHistory}
            viewMode={numbersViewMode}
            onChangeViewMode={(mode) => setNumbersViewMode(mode)}
            onSelectService={(svc) =>
              requireAuth(`Sign in to get a ${svc.name} phone number`, () => {
                setSelectedService(svc);
                setAcquireError(null);
                void loadCountriesForService(svc.id, false);
              })
            }
            onSelectCountry={(c) => {
              setSelectedCountry(c);
              setSelectedProviderQuote(pickBestProviderForCountry(c));
              setAcquireError(null);
            }}
            onSelectProviderQuote={(quote) => {
              setSelectedProviderQuote(quote);
              setAcquireError(null);
            }}
            onSelectLowestDeal={(deal) =>
              requireAuth(
                `Sign in to get a ${deal.serviceName} number (${deal.country})`,
                () => {
                  const svcMatch = services.find((s) => s.id === deal.serviceId) || {
                    id: deal.serviceId,
                    name: deal.serviceName,
                    popular: true,
                  };
                  setSelectedService(svcMatch);
                  setAcquireError(null);
                  void loadCountriesForService(deal.serviceId, false, deal.slug, deal.provider);
                }
              )
            }
            onRefreshLowestDeals={() => void loadLowestDeals(true)}
            onRefreshCountries={() => {
              if (selectedService) {
                void loadCountriesForService(selectedService.id, true);
              }
            }}
            onChangeQuantity={(qty) => setQuantity(qty)}
            onOpenDeposit={() =>
              requireAuth('Sign in to fund your Naira wallet', () => setDepositModalOpen(true))
            }
            onAcquireNumbers={() =>
              requireAuth('Sign in to acquire dedicated phone numbers', () => {
                void handleAcquireNumbers();
              })
            }
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
            isAuthenticated={isAuthenticated}
            onRequireAuth={(reason) =>
              openAuthModal(reason || 'Sign in to generate free AI images')
            }
            onCopyText={(val, label) => void handleCopyText(val, label)}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileTab
            isAuthenticated={isAuthenticated}
            userEmail={authUser?.email ?? null}
            userName={
              (authUser?.user_metadata?.full_name as string | undefined) ||
              (authUser?.user_metadata?.name as string | undefined) ||
              null
            }
            avatarUrl={(authUser?.user_metadata?.avatar_url as string | undefined) || null}
            activeEmail={activeEmail}
            savedEmails={savedEmails}
            savedNumbers={savedNumbers}
            otpHistory={otpHistory}
            autoRefresh={autoRefresh}
            isDark={isDark}
            onCreateEmail={() =>
              requireAuth('Sign in to create an email', () => setActiveTab('create'))
            }
            onSelectEmail={(acct) => {
              setActiveEmail(acct);
              setSelectedEmailDetail(null);
              setActiveTab('home');
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
            onOpenAuth={() => openAuthModal()}
            onSignOut={() => void handleSignOut()}
          />
        )}

        {isOwnerAdmin && activeTab === 'admin' && (
          <AdminDiagnosticsTab
            ownerEmail={authUser?.email || OWNER_ADMIN_EMAIL}
            emailDomain={emailDomain}
            activeEmailAddress={activeEmail?.address ?? null}
            diagnostics={adminDiagnostics}
            loading={adminLoading}
            error={adminError}
            testingInbound={testingInbound}
            testResult={adminTestResult}
            testError={adminTestError}
            onRefresh={() => void fetchAdminDiagnostics()}
            onTestInbound={(addr) => void handleTestInboundPipeline(addr)}
            onSwitchToUserView={() => setActiveTab('home')}
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
