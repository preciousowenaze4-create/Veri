import { useCallback, useEffect, useRef, useState } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { AlertTriangle, RefreshCw, ShieldAlert, WifiOff, X } from 'lucide-react';
import { AuthModal } from './components/AuthModal';
import { BottomNav } from './components/BottomNav';
import { CornerDrawer } from './components/CornerDrawer';
import { CreateEmailTab } from './components/CreateEmailTab';
import { DepositModal } from './components/DepositModal';
import { HomeEmailTab } from './components/HomeEmailTab';
import { ImageGenTab } from './components/ImageGenTab';
import { ProfileTab, type ProfileSubTab } from './components/ProfileTab';
import { SmsTab } from './components/SmsTab';
import { TopBar } from './components/TopBar';
import { useOnlineStatus } from './hooks/usePWAInstall';
import type {
  AdminDiagnosticsResponse,
  AdminInboundTestResult,
  AdminManagedUser,
  AdminTransferRecord,
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
  StrictBanEntry,
  TabId,
  TempEmailAccount,
  UserModerationAction,
  UserModerationLockoutState,
  WalletTransferRecord,
} from './types';
import { parseJsonResponse } from './utils/apiFetch';
import { copyToClipboard } from './utils/clipboard';
import { CUSTOM_EMAIL_DOMAIN } from './utils/directEmailFallback';
import {
  ensureSupabaseClient,
  getActiveSupabaseClient,
  syncSupabaseRealtimeAuth,
} from './utils/supabase';

const STORAGE_KEYS = {
  emails: 'veribox_saved_emails_v3',
  deletedEmails: 'veribox_deleted_emails_v3',
  activeEmail: 'veribox_active_email_v3',
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

function scopedEmailStorageKey(baseKey: string, userId: string): string {
  return `${baseKey}:${userId || 'guest'}`;
}

function readScopedEmailList(
  baseKey: string,
  userId: string,
  domain: string = CUSTOM_EMAIL_DOMAIN
): TempEmailAccount[] {
  return readStorage<TempEmailAccount[]>(scopedEmailStorageKey(baseKey, userId), []).filter((a) =>
    isCustomDomainMailbox(a, domain)
  );
}

function readScopedActiveEmail(
  userId: string,
  domain: string = CUSTOM_EMAIL_DOMAIN
): TempEmailAccount | null {
  const stored = readStorage<TempEmailAccount | null>(
    scopedEmailStorageKey(STORAGE_KEYS.activeEmail, userId),
    null
  );
  return isCustomDomainMailbox(stored, domain) ? stored : null;
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
  const countdown = 3;

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
  const [reservedBalance, setReservedBalance] = useState<number>(0);
  const [depositModalOpen, setDepositModalOpen] = useState<boolean>(false);
  const [moderationLockout, setModerationLockout] = useState<UserModerationLockoutState | null>(null);

  // Owner Admin Diagnostics state (only active when signed in as preciousddkid@gmail.com)
  const [adminDiagnostics, setAdminDiagnostics] = useState<AdminDiagnosticsResponse | null>(null);
  const [adminLoading, setAdminLoading] = useState<boolean>(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [testingInbound, setTestingInbound] = useState<boolean>(false);
  const [adminTestResult, setAdminTestResult] = useState<AdminInboundTestResult | null>(null);
  const [adminTestError, setAdminTestError] = useState<string | null>(null);
  const [profileInitialSubTab, setProfileInitialSubTab] = useState<ProfileSubTab>('account');
  const [adminUsers, setAdminUsers] = useState<AdminManagedUser[]>([]);
  const [strictBans, setStrictBans] = useState<StrictBanEntry[]>([]);
  const [banningVisitor, setBanningVisitor] = useState<boolean>(false);
  const [adminUsersLoading, setAdminUsersLoading] = useState<boolean>(false);
  const [adminUsersError, setAdminUsersError] = useState<string | null>(null);
  const [moderatingUserId, setModeratingUserId] = useState<string | null>(null);
  const [adminTransfers, setAdminTransfers] = useState<AdminTransferRecord[]>([]);
  const [adminTransfersLoading, setAdminTransfersLoading] = useState<boolean>(false);
  const [adminTransfersError, setAdminTransfersError] = useState<string | null>(null);
  const [userTransfers, setUserTransfers] = useState<WalletTransferRecord[]>([]);
  const [userTransfersLoading, setUserTransfersLoading] = useState<boolean>(false);
  const [userTransfersError, setUserTransfersError] = useState<string | null>(null);
  const [domainErrorPopup, setDomainErrorPopup] = useState<{
    title: string;
    errors: string[];
    timestamp: string;
  } | null>(null);
  const autoSwitchedAdminUserIdRef = useRef<string | null>(null);
  const adminDiagnosticsInFlightRef = useRef<boolean>(false);
  const lastAlertedSignatureRef = useRef<string>('');
  const dismissedAlertSignatureRef = useRef<string>('');

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

  // Email state (custom domain from process.env.EMAIL_DOMAIN, strictly isolated per walletUserId)
  const [emailDomain, setEmailDomain] = useState<string>(CUSTOM_EMAIL_DOMAIN);
  const [emailScopeId, setEmailScopeId] = useState<string>(walletUserId);
  const [savedEmails, setSavedEmails] = useState<TempEmailAccount[]>(() =>
    readScopedEmailList(STORAGE_KEYS.emails, walletUserId, CUSTOM_EMAIL_DOMAIN)
  );
  const [deletedEmails, setDeletedEmails] = useState<TempEmailAccount[]>(() =>
    readScopedEmailList(STORAGE_KEYS.deletedEmails, walletUserId, CUSTOM_EMAIL_DOMAIN)
  );
  const [activeEmail, setActiveEmail] = useState<TempEmailAccount | null>(() =>
    readScopedActiveEmail(walletUserId, CUSTOM_EMAIL_DOMAIN)
  );
  const [emailMessages, setEmailMessages] = useState<EmailMessageSummary[]>([]);
  const [selectedEmailDetail, setSelectedEmailDetail] = useState<EmailMessageDetail | null>(null);
  const [loadingEmailMessages, setLoadingEmailMessages] = useState<boolean>(false);
  const [loadingEmailDetail, setLoadingEmailDetail] = useState<boolean>(false);
  const [generatingEmail, setGeneratingEmail] = useState<boolean>(false);
  const [emailStreamConnected, setEmailStreamConnected] = useState<boolean>(false);
  const [supabaseRealtimeConnected, setSupabaseRealtimeConnected] = useState<boolean>(false);
  const [lastEmailCheckedAt, setLastEmailCheckedAt] = useState<string | null>(null);
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
  const emailMessagesRef = useRef<EmailMessageSummary[]>(emailMessages);
  emailMessagesRef.current = emailMessages;
  const inboxPollInFlightRef = useRef<boolean>(false);
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

  // Switch isolated email vault whenever the active user (or guest session) changes
  useEffect(() => {
    if (walletUserId === emailScopeId) return;
    lastFetchedAddressRef.current = null;
    knownEmailMsgIdsRef.current = new Set();
    setEmailMessages([]);
    setSelectedEmailDetail(null);
    setEmailError(null);
    setSavedEmails(readScopedEmailList(STORAGE_KEYS.emails, walletUserId, emailDomain));
    setDeletedEmails(readScopedEmailList(STORAGE_KEYS.deletedEmails, walletUserId, emailDomain));
    setActiveEmail(readScopedActiveEmail(walletUserId, emailDomain));
    setEmailScopeId(walletUserId);
  }, [walletUserId, emailScopeId, emailDomain]);

  useEffect(() => {
    if (emailScopeId !== walletUserId) return;
    localStorage.setItem(
      scopedEmailStorageKey(STORAGE_KEYS.emails, emailScopeId),
      JSON.stringify(savedEmails)
    );
  }, [savedEmails, emailScopeId, walletUserId]);

  useEffect(() => {
    if (emailScopeId !== walletUserId) return;
    localStorage.setItem(
      scopedEmailStorageKey(STORAGE_KEYS.deletedEmails, emailScopeId),
      JSON.stringify(deletedEmails)
    );
  }, [deletedEmails, emailScopeId, walletUserId]);

  useEffect(() => {
    if (emailScopeId !== walletUserId) return;
    localStorage.setItem(
      scopedEmailStorageKey(STORAGE_KEYS.activeEmail, emailScopeId),
      JSON.stringify(activeEmail)
    );
  }, [activeEmail, emailScopeId, walletUserId]);

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

  const handleModerationHttpFailure = useCallback(
    (
      status: number,
      data: {
        code?: string;
        error?: string;
        moderation?: UserModerationLockoutState;
      }
    ): boolean => {
      if (status === 403 && data?.code === 'ACCOUNT_MODERATED') {
        setModerationLockout(
          data.moderation || {
            blocked: true,
            status: 'banned',
            reason: data.error || 'Access blocked by administrator.',
            strict: true,
          }
        );
        return true;
      }
      return false;
    },
    []
  );

  const checkModerationStatus = useCallback(async () => {
    if (isOwnerAdmin) {
      setModerationLockout(null);
      return;
    }
    try {
      const token = await getAuthAccessToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const query = walletUserId ? `?userId=${encodeURIComponent(walletUserId)}` : '';
      const res = await fetch(`/api/auth/moderation-status${query}`, {
        cache: 'no-store',
        headers,
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) return;
      const data = await parseJsonResponse<UserModerationLockoutState>(res);
      if (data.blocked) {
        setModerationLockout(data);
      } else {
        setModerationLockout(null);
      }
    } catch {
      // Non-blocking
    }
  }, [isOwnerAdmin, getAuthAccessToken, walletUserId]);

  const fetchAdminDiagnostics = useCallback(
    async (silent = false) => {
      if (!isOwnerAdmin || adminDiagnosticsInFlightRef.current) return;
      adminDiagnosticsInFlightRef.current = true;
      if (!silent) {
        setAdminLoading(true);
      }
      setAdminError(null);
      try {
        const token = await getAuthAccessToken();
        if (!token) {
          throw new Error('HTTP 401: Missing active Supabase session token for admin diagnostics.');
        }
        const res = await fetch(silent ? '/api/admin/diagnostics' : '/api/admin/diagnostics?force=1', {
          cache: 'no-store',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(9000),
        });
        const data = await parseJsonResponse<AdminDiagnosticsResponse & { error?: string }>(res);
        if (!res.ok) {
          throw new Error(
            `HTTP ${res.status}: ${data.error || res.statusText || 'Failed to load diagnostics'}`
          );
        }
        setAdminDiagnostics(data);

        const activeIssues: string[] = Array.isArray(data.connectionErrors)
          ? [...data.connectionErrors]
          : [];
        if (
          data.domainConnection &&
          !data.domainConnection.ok &&
          data.domainConnection.error &&
          !activeIssues.includes(data.domainConnection.error)
        ) {
          activeIssues.unshift(data.domainConnection.error);
        }

        if (activeIssues.length > 0) {
          const signature = activeIssues.join('||');
          if (
            signature !== lastAlertedSignatureRef.current &&
            signature !== dismissedAlertSignatureRef.current
          ) {
            lastAlertedSignatureRef.current = signature;
            setDomainErrorPopup({
              title: `${data.environment?.emailDomain || emailDomain} Connection Alert`,
              errors: activeIssues,
              timestamp: data.checkedAt || new Date().toISOString(),
            });
          }
        } else {
          lastAlertedSignatureRef.current = '';
          dismissedAlertSignatureRef.current = '';
          setDomainErrorPopup(null);
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.name === 'TimeoutError' || err.name === 'AbortError'
              ? 'Request timed out while loading admin diagnostics'
              : err.message
            : 'Failed to load admin diagnostics';
        setAdminError(message);
        if (
          message !== lastAlertedSignatureRef.current &&
          message !== dismissedAlertSignatureRef.current
        ) {
          lastAlertedSignatureRef.current = message;
          setDomainErrorPopup({
            title: `${emailDomain} Diagnostics Connection Error`,
            errors: [message],
            timestamp: new Date().toISOString(),
          });
        }
      } finally {
        adminDiagnosticsInFlightRef.current = false;
        if (!silent) {
          setAdminLoading(false);
        }
      }
    },
    [isOwnerAdmin, getAuthAccessToken, emailDomain]
  );

  const dismissDomainErrorPopup = useCallback(async () => {
    if (domainErrorPopup) {
      dismissedAlertSignatureRef.current = domainErrorPopup.errors.join('||');
    }
    setDomainErrorPopup(null);
    if (!isOwnerAdmin) return;
    try {
      const token = await getAuthAccessToken();
      if (!token) return;
      await fetch('/api/admin/diagnostics/clear-alerts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Non-blocking
    }
  }, [domainErrorPopup, isOwnerAdmin, getAuthAccessToken]);

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
          body: JSON.stringify({
            recipientAddress: targetAddress,
            targetAddress,
          }),
          signal: AbortSignal.timeout(10500),
        });
        const data = await parseJsonResponse<AdminInboundTestResult & { error?: string }>(res);
        if (!res.ok && typeof data.httpStatus !== 'number') {
          throw new Error(
            `HTTP ${res.status}: ${data.error || res.statusText || 'Inbound test request failed'}`
          );
        }
        setAdminTestResult(data);
        const directErrors: string[] = [];
        if (Array.isArray(data.checks)) {
          for (const check of data.checks) {
            if (check.ok === false) {
              directErrors.push(`${check.label}: ${check.error || check.detail}`);
            }
          }
        }
        if (data.productionProbe && !data.productionProbe.reachable) {
          directErrors.push(
            `${data.productionProbe.url} -> HTTP ${data.productionProbe.httpStatus ?? 'ERR'}: ${data.productionProbe.detail}`
          );
        }
        if (data.supabaseError && !directErrors.some((e) => e.includes(data.supabaseError!))) {
          directErrors.push(data.supabaseError);
        }
        if (data.webhookLogError && !directErrors.some((e) => e.includes(data.webhookLogError!))) {
          directErrors.push(data.webhookLogError);
        }
        if (data.inboxError && data.inboxApiOk === false) {
          directErrors.push(data.inboxError);
        }
        const readinessFailed =
          directErrors.length > 0 ||
          data.ready === false ||
          (typeof data.ready !== 'boolean' && data.httpStatus >= 400);
        if (readinessFailed) {
          setDomainErrorPopup({
            title: `System Readiness Check Failed (${emailDomain})`,
            errors:
              directErrors.length > 0
                ? directErrors
                : [`Webhook readiness endpoint returned HTTP ${data.httpStatus}`],
            timestamp: data.testedAt || new Date().toISOString(),
          });
        }
        adminDiagnosticsInFlightRef.current = false;
        await fetchAdminDiagnostics(true);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.name === 'TimeoutError' || err.name === 'AbortError'
              ? 'Request timed out while checking system readiness'
              : err.message
            : 'System readiness check failed';
        setAdminTestError(message);
        setDomainErrorPopup({
          title: `System Readiness Check Error (${emailDomain})`,
          errors: [message],
          timestamp: new Date().toISOString(),
        });
      } finally {
        setTestingInbound(false);
      }
    },
    [isOwnerAdmin, getAuthAccessToken, fetchAdminDiagnostics, emailDomain]
  );

  const fetchAdminUsers = useCallback(async () => {
    if (!isOwnerAdmin) return;
    setAdminUsersLoading(true);
    setAdminUsersError(null);
    try {
      const token = await getAuthAccessToken();
      if (!token) {
        throw new Error('HTTP 401: Missing active Supabase session token.');
      }
      const res = await fetch('/api/admin/users', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(9000),
      });
      const data = await parseJsonResponse<{
        users?: AdminManagedUser[];
        strictBans?: StrictBanEntry[];
        error?: string;
      }>(res);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${data.error || res.statusText || 'Failed to load users'}`);
      }
      setAdminUsers(Array.isArray(data.users) ? data.users : []);
      setStrictBans(Array.isArray(data.strictBans) ? data.strictBans : []);
    } catch (err) {
      setAdminUsersError(
        err instanceof Error ? err.message : 'Failed to load registered users'
      );
    } finally {
      setAdminUsersLoading(false);
    }
  }, [isOwnerAdmin, getAuthAccessToken]);

  const handleModerateUser = useCallback(
    async (
      userId: string,
      action: UserModerationAction,
      options?: { reason?: string; strict?: boolean }
    ) => {
      if (!isOwnerAdmin) return;
      setModeratingUserId(userId);
      setAdminUsersError(null);
      try {
        const token = await getAuthAccessToken();
        if (!token) {
          throw new Error('HTTP 401: Missing active Supabase session token.');
        }
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/action`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action,
            reason: options?.reason?.trim() || undefined,
            strict: options?.strict ?? action === 'ban',
          }),
          signal: AbortSignal.timeout(9000),
        });
        const data = await parseJsonResponse<{
          ok?: boolean;
          status?: AdminManagedUser['status'];
          emailConfirmed?: boolean;
          reason?: string | null;
          strictBanned?: boolean;
          error?: string;
        }>(res);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${data.error || 'User action failed'}`);
        }
        setAdminUsers((prev) =>
          prev.map((u) =>
            u.id === userId
              ? {
                  ...u,
                  status: data.status || u.status,
                  emailConfirmed:
                    typeof data.emailConfirmed === 'boolean'
                      ? data.emailConfirmed
                      : u.emailConfirmed,
                  moderationReason:
                    typeof data.reason !== 'undefined' ? data.reason : u.moderationReason,
                  strictBanned:
                    typeof data.strictBanned === 'boolean'
                      ? data.strictBanned
                      : u.strictBanned,
                }
              : u
          )
        );
        showToast(
          action === 'ban'
            ? 'User strictly banned & signed out everywhere'
            : `User updated: ${data.status || action}`
        );
        void fetchAdminUsers();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update user';
        setAdminUsersError(msg);
        showToast(msg);
      } finally {
        setModeratingUserId(null);
      }
    },
    [isOwnerAdmin, getAuthAccessToken, showToast, fetchAdminUsers]
  );

  const handleBanVisitor = useCallback(
    async (payload: { targetType: 'email' | 'ip'; targetValue: string; reason?: string }) => {
      if (!isOwnerAdmin) return { ok: false, error: 'Owner access required' };
      setBanningVisitor(true);
      setAdminUsersError(null);
      try {
        const token = await getAuthAccessToken();
        if (!token) {
          throw new Error('HTTP 401: Missing active Supabase session token.');
        }
        const res = await fetch('/api/admin/bans', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(9000),
        });
        const data = await parseJsonResponse<{
          ok?: boolean;
          strictBans?: StrictBanEntry[];
          error?: string;
        }>(res);
        if (!res.ok || !data.ok) {
          throw new Error(data.error || `HTTP ${res.status}: Failed to apply strict ban`);
        }
        if (Array.isArray(data.strictBans)) {
          setStrictBans(data.strictBans);
        }
        showToast(`Strict ${payload.targetType.toUpperCase()} ban applied: ${payload.targetValue}`);
        void fetchAdminUsers();
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to ban visitor';
        setAdminUsersError(msg);
        showToast(msg);
        return { ok: false, error: msg };
      } finally {
        setBanningVisitor(false);
      }
    },
    [isOwnerAdmin, getAuthAccessToken, showToast, fetchAdminUsers]
  );

  const handleRemoveStrictBan = useCallback(
    async (banId: string) => {
      if (!isOwnerAdmin) return;
      try {
        const token = await getAuthAccessToken();
        if (!token) return;
        const res = await fetch('/api/admin/bans/remove', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ id: banId }),
          signal: AbortSignal.timeout(9000),
        });
        const data = await parseJsonResponse<{
          ok?: boolean;
          strictBans?: StrictBanEntry[];
          error?: string;
        }>(res);
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Could not remove ban');
        }
        if (Array.isArray(data.strictBans)) {
          setStrictBans(data.strictBans);
        }
        showToast('Strict ban removed');
        void fetchAdminUsers();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not remove ban');
      }
    },
    [isOwnerAdmin, getAuthAccessToken, showToast, fetchAdminUsers]
  );

  const fetchAdminTransfers = useCallback(async () => {
    if (!isOwnerAdmin) return;
    setAdminTransfersLoading(true);
    setAdminTransfersError(null);
    try {
      const token = await getAuthAccessToken();
      if (!token) {
        throw new Error('HTTP 401: Missing active Supabase session token.');
      }
      const res = await fetch('/api/admin/transfers', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(9000),
      });
      const data = await parseJsonResponse<{
        transfers?: AdminTransferRecord[];
        error?: string;
        probeError?: string | null;
      }>(res);
      if (!res.ok) {
        throw new Error(
          `HTTP ${res.status}: ${data.error || res.statusText || 'Failed to load transfer history'}`
        );
      }
      setAdminTransfers(Array.isArray(data.transfers) ? data.transfers : []);
      if (data.probeError) {
        setAdminTransfersError(data.probeError);
      }
    } catch (err) {
      setAdminTransfersError(
        err instanceof Error ? err.message : 'Failed to load transfer history'
      );
    } finally {
      setAdminTransfersLoading(false);
    }
  }, [isOwnerAdmin, getAuthAccessToken]);

  const clearAdminAlerts = useCallback(async () => {
    if (!isOwnerAdmin) return;
    try {
      const token = await getAuthAccessToken();
      if (!token) return;
      await fetch('/api/admin/diagnostics/clear-alerts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      adminDiagnosticsInFlightRef.current = false;
      await fetchAdminDiagnostics(true);
      showToast('Error log cleared');
    } catch {
      // Non-blocking
    }
  }, [isOwnerAdmin, getAuthAccessToken, fetchAdminDiagnostics, showToast]);

  const fetchUserTransfers = useCallback(async () => {
    if (!authUser?.id) {
      setUserTransfers([]);
      setUserTransfersError(null);
      return;
    }
    setUserTransfersLoading(true);
    setUserTransfersError(null);
    try {
      const token = await getAuthAccessToken();
      if (!token) {
        throw new Error('Sign in required to view your transfer history.');
      }
      const res = await fetch('/api/wallet/transfers', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(9000),
      });
      const data = await parseJsonResponse<{
        transfers?: WalletTransferRecord[];
        error?: string;
      }>(res);
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}: Could not load transfers`);
      }
      setUserTransfers(Array.isArray(data.transfers) ? data.transfers : []);
    } catch (err) {
      setUserTransfersError(
        err instanceof Error ? err.message : 'Failed to load your transfer history'
      );
    } finally {
      setUserTransfersLoading(false);
    }
  }, [authUser?.id, getAuthAccessToken]);

  const handleSendP2pTransfer = useCallback(
    async (payload: {
      recipientEmail: string;
      amount: number;
      note?: string;
    }): Promise<{ ok: boolean; error?: string }> => {
      try {
        const token = await getAuthAccessToken();
        if (!token) {
          return { ok: false, error: 'Please sign in to send a Naira transfer.' };
        }
        const res = await fetch('/api/wallet/transfer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(12000),
        });
        const data = await parseJsonResponse<{
          ok?: boolean;
          balance?: number;
          transfer?: WalletTransferRecord;
          error?: string;
        }>(res);
        if (!res.ok || !data.ok) {
          return { ok: false, error: data.error || `Transfer failed (HTTP ${res.status})` };
        }
        if (typeof data.balance === 'number') {
          setWalletBalance(data.balance);
        }
        if (data.transfer) {
          setUserTransfers((prev) => [data.transfer!, ...prev]);
        }
        showToast(`Sent ₦${payload.amount.toLocaleString()} to ${payload.recipientEmail}`);
        void fetchUserTransfers();
        if (isOwnerAdmin) {
          void fetchAdminTransfers();
        }
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Transfer failed',
        };
      }
    },
    [getAuthAccessToken, showToast, fetchUserTransfers, isOwnerAdmin, fetchAdminTransfers]
  );

  // Preload owner admin data quietly on sign-in (without leaving Home), and clear/lock on non-owner
  useEffect(() => {
    if (isOwnerAdmin && authUser?.id) {
      if (autoSwitchedAdminUserIdRef.current !== authUser.id) {
        autoSwitchedAdminUserIdRef.current = authUser.id;
        void fetchAdminDiagnostics(true);
        void fetchAdminUsers();
        void fetchAdminTransfers();
      }
    } else {
      autoSwitchedAdminUserIdRef.current = null;
      lastAlertedSignatureRef.current = '';
      setAdminDiagnostics(null);
      setAdminError(null);
      setAdminTestResult(null);
      setAdminTestError(null);
      setAdminUsers([]);
      setStrictBans([]);
      setAdminUsersError(null);
      setAdminTransfers([]);
      setAdminTransfersError(null);
      setDomainErrorPopup(null);
      setProfileInitialSubTab((prev) => (prev === 'admin' ? 'account' : prev));
      setActiveTab((prev) => (prev === 'admin' ? 'home' : prev));
    }
  }, [isOwnerAdmin, authUser?.id, fetchAdminDiagnostics, fetchAdminUsers, fetchAdminTransfers]);

  useEffect(() => {
    void checkModerationStatus();
    const handleFocus = () => {
      if (document.visibilityState !== 'hidden') {
        void checkModerationStatus();
      }
    };
    window.addEventListener('focus', handleFocus);
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        void checkModerationStatus();
      }
    }, 25000);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', handleFocus);
    };
  }, [checkModerationStatus]);

  // Real-time Supabase Postgres subscription for owner admin
  useEffect(() => {
    if (!isOwnerAdmin || !authUser?.id) {
      return;
    }

    let active = true;
    let cleanupChannel: (() => void) | null = null;

    void ensureSupabaseClient().then(async (sb) => {
      if (!active || !sb) return;
      const token = await syncSupabaseRealtimeAuth(sb);
      if (!active || !token) return;
      const channel = sb
        .channel(`owner-admin-realtime-${authUser.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'inbound_webhook_logs' },
          () => {
            void fetchAdminDiagnostics(true);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'mailbox_messages' },
          () => {
            void fetchAdminDiagnostics(true);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'mailboxes' },
          () => {
            void fetchAdminDiagnostics(true);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'wallet_transactions' },
          () => {
            void fetchAdminTransfers();
            void fetchAdminDiagnostics(true);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'app_error_logs' },
          () => {
            void fetchAdminDiagnostics(true);
          }
        )
        .subscribe((status) => {
          if (!active) return;
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            void sb.removeChannel(channel);
          }
        });

      cleanupChannel = () => {
        void sb.removeChannel(channel);
      };
    });

    return () => {
      active = false;
      cleanupChannel?.();
    };
  }, [isOwnerAdmin, authUser?.id, fetchAdminDiagnostics, fetchAdminTransfers]);

  // Real-time silent polling while owner is viewing Profile/Admin
  useEffect(() => {
    if (!isOwnerAdmin) return;

    const handleResume = () => {
      if (document.visibilityState === 'hidden') return;
      void fetchAdminDiagnostics(true);
    };

    window.addEventListener('focus', handleResume);
    document.addEventListener('visibilitychange', handleResume);

    const intervalMs = activeTab === 'profile' ? 6000 : 45000;
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void fetchAdminDiagnostics(true);
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleResume);
      document.removeEventListener('visibilitychange', handleResume);
    };
  }, [isOwnerAdmin, activeTab, fetchAdminDiagnostics]);

  const handleSignOut = useCallback(async () => {
    const client = getActiveSupabaseClient() || (await ensureSupabaseClient());
    if (client) {
      await client.auth.signOut().catch(() => undefined);
    }
    pendingAuthActionRef.current = null;
    autoSwitchedAdminUserIdRef.current = null;
    lastAlertedSignatureRef.current = '';
    dismissedAlertSignatureRef.current = '';
    lastFetchedAddressRef.current = null;
    knownEmailMsgIdsRef.current = new Set();
    setEmailMessages([]);
    setSelectedEmailDetail(null);
    setEmailError(null);
    setAuthUser(null);
    setWalletBalance(0);
    setReservedBalance(0);
    setModerationLockout(null);
    setUserTransfers([]);
    setUserTransfersError(null);
    setAdminDiagnostics(null);
    setAdminError(null);
    setAdminTestResult(null);
    setAdminTestError(null);
    setAdminUsers([]);
    setStrictBans([]);
    setAdminUsersError(null);
    setAdminTransfers([]);
    setAdminTransfersError(null);
    setDomainErrorPopup(null);
    setProfileInitialSubTab('account');
    setActiveTab((prev) => (prev === 'admin' ? 'home' : prev));
    setAuthModalOpen(false);
    setAuthActionReason(null);
    showToast('Signed out');
    void checkModerationStatus();
  }, [showToast, checkModerationStatus]);

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
        if (active && data.session?.access_token) {
          void client.realtime.setAuth(data.session.access_token);
        }
        if (active && data.session?.user) {
          setAuthUser(data.session.user);
        }
      } catch {
        // Non-blocking
      }

      const { data: listener } = client.auth.onAuthStateChange((event, session) => {
        if (!active) return;
        if (session?.access_token) {
          void client.realtime.setAuth(session.access_token);
        }
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
        reservedBalance?: number;
        supabasePersisted?: boolean;
      }>(res);
      if (data.supabasePersisted && typeof data.balance === 'number') {
        setWalletBalance(data.balance);
      }
      if (typeof data.reservedBalance === 'number') {
        setReservedBalance(data.reservedBalance);
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

  // Sync wallet balance & user's own transfer history from server/Supabase + subscribe to Supabase Realtime updates when signed in
  useEffect(() => {
    if (!authUser) {
      setUserTransfers([]);
      setUserTransfersError(null);
      return;
    }

    void syncServerWalletBalance();
    void fetchUserTransfers();

    let active = true;
    let cleanupChannel: (() => void) | null = null;

    void ensureSupabaseClient().then(async (sb) => {
      if (!active || !sb) return;
      const token = await syncSupabaseRealtimeAuth(sb);
      if (!active || !token) return;
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
            void fetchUserTransfers();
          }
        )
        .subscribe((status) => {
          if (!active) return;
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            void sb.removeChannel(channel);
          }
        });

      cleanupChannel = () => {
        void sb.removeChannel(channel);
      };
    });

    return () => {
      active = false;
      cleanupChannel?.();
    };
  }, [authUser, walletUserId, syncServerWalletBalance, fetchUserTransfers, showToast]);

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

  const computedLocalHoldNgn = activeOrders.reduce((sum, o) => {
    const waiting =
      o.chargeOnCode !== false &&
      !o.charged &&
      o.sms.length === 0 &&
      !['FINISHED', 'CANCELED', 'TIMEOUT', 'BANNED'].includes(o.status);
    return sum + (waiting ? Math.round(o.price || 0) : 0);
  }, 0);
  const effectiveReservedBalance = Math.max(reservedBalance, computedLocalHoldNgn);

  const syncOrderIntoState = useCallback(
    (
      updated: PrivateNumberOrder,
      serverBalances?: {
        walletBalance?: number | null;
        reservedBalance?: number;
        chargedNow?: boolean;
        chargedAmount?: number;
      }
    ) => {
      const existing =
        activeOrdersRef.current.find((o) => o.id === updated.id) ||
        numberHistoryRef.current.find((o) => o.id === updated.id);

      const mergedSms = Array.isArray(updated.sms) ? updated.sms : existing?.sms || [];
      const orderPrice = updated.price ?? existing?.price ?? 0;
      const isChargeOnCode = updated.chargeOnCode ?? existing?.chargeOnCode ?? true;
      const wasChargedBefore = Boolean(existing?.charged);
      const isNowCharged = Boolean(updated.charged) || (mergedSms.length > 0 && wasChargedBefore);

      if (typeof serverBalances?.walletBalance === 'number') {
        setWalletBalance(serverBalances.walletBalance);
      }
      if (typeof serverBalances?.reservedBalance === 'number') {
        setReservedBalance(serverBalances.reservedBalance);
      }

      if (mergedSms.length > 0 && !notifiedSmsOrderIdsRef.current.has(updated.id)) {
        notifiedSmsOrderIdsRef.current.add(updated.id);
        const chargedLabel =
          serverBalances?.chargedAmount && serverBalances.chargedAmount > 0
            ? ` · ₦${serverBalances.chargedAmount.toLocaleString()} deducted`
            : orderPrice > 0 && !wasChargedBefore
              ? ` · ₦${orderPrice.toLocaleString()} deducted`
              : '';
        showToast(`Verification code received!${chargedLabel}`);

        if (
          typeof serverBalances?.walletBalance !== 'number' &&
          orderPrice > 0 &&
          !wasChargedBefore &&
          !updated.charged
        ) {
          setWalletBalance((prev) => Math.max(0, prev - orderPrice));
          void getAuthAccessToken().then((sbToken) => {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (sbToken) headers.Authorization = `Bearer ${sbToken}`;
            return fetch('/api/wallet/deduct', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                userId: walletUserId,
                amount: orderPrice,
                reference: `order-${updated.id}`,
                details: `${existing?.serviceName || updated.serviceName || 'Verification'} private number (${existing?.phone || updated.phone || updated.id})`,
              }),
            })
              .then((r) => parseJsonResponse<{ balance?: number | null }>(r).then((d) => ({ ok: r.ok, d })))
              .then(({ ok, d }) => {
                if (ok && typeof d.balance === 'number') {
                  setWalletBalance(d.balance);
                }
              })
              .catch(() => undefined);
          });
        }
      }

      if (
        mergedSms.length === 0 &&
        ['CANCELED', 'TIMEOUT', 'BANNED'].includes(updated.status) &&
        !autoRefundedOrderIdsRef.current.has(updated.id)
      ) {
        autoRefundedOrderIdsRef.current.add(updated.id);
        if (!isChargeOnCode && wasChargedBefore && orderPrice > 0) {
          void refundOrderHold(
            updated.id,
            orderPrice,
            `Order ${updated.status.toLowerCase()} · ₦${orderPrice.toLocaleString()} refunded`
          );
        } else {
          showToast(`Number ${updated.status.toLowerCase()} · Hold released (₦0 charged)`);
        }
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
        chargeOnCode: updated.chargeOnCode ?? o.chargeOnCode,
        charged: isNowCharged || Boolean(updated.charged),
        chargeToken: updated.chargeToken || o.chargeToken,
      });

      setActiveOrders((prev) => prev.map((o) => (o.id === updated.id ? mergeOrder(o) : o)));
      setNumberHistory((prev) => prev.map((o) => (o.id === updated.id ? mergeOrder(o) : o)));
    },
    [refundOrderHold, showToast, getAuthAccessToken, walletUserId]
  );

  const acquireNumbersForParams = useCallback(
    async (params: {
      provider: NumberProviderId;
      countryId: string;
      countryName: string;
      service: string;
      serviceName: string;
      countrySlug: string;
      countryCode?: string;
      unitPriceNgn: number;
      qty: number;
    }): Promise<PrivateNumberOrder[] | null> => {
      const availableBalance = Math.max(0, walletBalance - effectiveReservedBalance);
      const requiredNgn = params.unitPriceNgn * params.qty;
      if (requiredNgn > 0 && availableBalance < requiredNgn) {
        setDepositModalOpen(true);
        showToast(
          `Insufficient available balance (₦${availableBalance.toLocaleString()}). Required: ₦${requiredNgn.toLocaleString()} — Top up to proceed.`
        );
        return null;
      }

      setAcquiring(true);
      setAcquireError(null);
      try {
        const sbToken = await getAuthAccessToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (sbToken) {
          headers.Authorization = `Bearer ${sbToken}`;
        }
        const res = await fetch('/api/numbers/acquire', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            userId: walletUserId,
            provider: params.provider,
            countryId: params.countryId,
            countryName: params.countryName,
            service: params.service,
            serviceName: params.serviceName,
            country: params.countrySlug,
            countryCode: params.countryCode,
            quantity: params.qty,
            walletBalance,
          }),
        });
        const data = await parseJsonResponse<{
          orders?: PrivateNumberOrder[];
          walletBalance?: number | null;
          reservedBalance?: number;
          balance?: number;
          code?: string;
          moderation?: UserModerationLockoutState;
          error?: string;
        }>(res);
        if (handleModerationHttpFailure(res.status, data)) {
          throw new Error(data.error || 'Access restricted by administrator.');
        }
        if (res.status === 402) {
          if (typeof data.balance === 'number') {
            setWalletBalance(data.balance);
          }
          setDepositModalOpen(true);
          throw new Error(data.error || 'Insufficient available wallet balance.');
        }
        if (!res.ok || !Array.isArray(data.orders) || data.orders.length === 0) {
          throw new Error(data.error || 'Could not assign numbers right now.');
        }

        if (typeof data.walletBalance === 'number') {
          setWalletBalance(data.walletBalance);
        }
        if (typeof data.reservedBalance === 'number') {
          setReservedBalance(data.reservedBalance);
        }

        const preparedOrders: PrivateNumberOrder[] = data.orders.map((ord) => ({
          ...ord,
          charged: false,
          chargeOnCode: true,
        }));

        setActiveOrders((prev) => {
          const newIds = new Set(preparedOrders.map((o) => o.id));
          return [...preparedOrders, ...prev.filter((o) => !newIds.has(o.id))];
        });
        setSelectedOrderId(preparedOrders[0].id);
        setNumberHistory((prev) => {
          const existingIds = new Set(preparedOrders.map((o) => o.id));
          return [...preparedOrders, ...prev.filter((o) => !existingIds.has(o.id))].slice(0, 50);
        });
        setNumbersViewMode('receiver');
        showToast(
          preparedOrders.length === 1
            ? `Assigned ${preparedOrders[0].phone} (₦0 charged until SMS arrives)`
            : `Assigned ${preparedOrders.length} numbers (₦0 charged until SMS arrives)`
        );
        return preparedOrders;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to assign numbers';
        setAcquireError(msg);
        showToast(msg);
        return null;
      } finally {
        setAcquiring(false);
      }
    },
    [walletBalance, effectiveReservedBalance, walletUserId, getAuthAccessToken, handleModerationHttpFailure, showToast]
  );

  const handleCheckOrder = useCallback(
    async (orderId: number, providerOverride?: NumberProviderId, tokenOverride?: string) => {
      const matched =
        activeOrdersRef.current.find((o) => o.id === orderId) ||
        numberHistoryRef.current.find((o) => o.id === orderId);
      const provider = providerOverride || matched?.provider || 'fivesim';
      const chargeToken = tokenOverride || matched?.chargeToken;
      try {
        const sbToken = await getAuthAccessToken();
        const headers: Record<string, string> = {};
        if (sbToken) {
          headers.Authorization = `Bearer ${sbToken}`;
        }
        const qs = new URLSearchParams({
          provider,
          userId: walletUserId,
        });
        if (chargeToken) {
          qs.set('chargeToken', chargeToken);
        }
        const res = await fetch(`/api/numbers/check/${orderId}?${qs.toString()}`, {
          headers,
        });
        const data = await parseJsonResponse<{
          order?: PrivateNumberOrder;
          walletBalance?: number | null;
          reservedBalance?: number;
          chargedNow?: boolean;
          chargedAmount?: number;
          code?: string;
          moderation?: UserModerationLockoutState;
          error?: string;
        }>(res);
        if (handleModerationHttpFailure(res.status, data)) {
          return;
        }
        if (res.ok && data.order) {
          syncOrderIntoState(data.order, {
            walletBalance: data.walletBalance,
            reservedBalance: data.reservedBalance,
            chargedNow: data.chargedNow,
            chargedAmount: data.chargedAmount,
          });
        }
      } catch {
        // Non-blocking
      }
    },
    [syncOrderIntoState, getAuthAccessToken, walletUserId, handleModerationHttpFailure]
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

    const acquired = await acquireNumbersForParams({
      provider: chosenProvider,
      countryId: chosenCountryId,
      countryName: selectedCountry.country,
      service: selectedService.id,
      serviceName: selectedService.name,
      countrySlug: selectedCountry.slug,
      countryCode: selectedCountry.countryCode,
      unitPriceNgn,
      qty: quantity,
    });
    if (acquired?.[0]) {
      void handleCheckOrder(acquired[0].id, acquired[0].provider || 'fivesim', acquired[0].chargeToken);
    }
  }, [selectedService, selectedCountry, selectedProviderQuote, quantity, acquireNumbersForParams, handleCheckOrder]);

  const handleCancelOrder = useCallback(
    async (orderId: number, suppressNavigateSetup = false): Promise<boolean> => {
      const targetOrder = activeOrdersRef.current.find((o) => o.id === orderId);
      const provider = targetOrder?.provider || 'fivesim';
      try {
        const sbToken = await getAuthAccessToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (sbToken) {
          headers.Authorization = `Bearer ${sbToken}`;
        }
        const res = await fetch(
          `/api/numbers/cancel/${orderId}?provider=${encodeURIComponent(provider)}`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              userId: walletUserId,
              refundAmount: targetOrder?.price || 0,
              chargeToken: targetOrder?.chargeToken,
              wasCharged: Boolean(targetOrder?.charged && targetOrder?.chargeOnCode === false),
            }),
          }
        );
        const data = await parseJsonResponse<{
          cancelled?: boolean;
          holdReleased?: boolean;
          alreadyHasSms?: boolean;
          refunded?: boolean;
          refundedAmount?: number;
          walletBalance?: number | null;
          reservedBalance?: number;
          order?: PrivateNumberOrder;
          code?: string;
          moderation?: UserModerationLockoutState;
          error?: string;
        }>(res);

        if (handleModerationHttpFailure(res.status, data)) {
          return false;
        }

        if (res.status === 409 && data.alreadyHasSms) {
          if (data.order) {
            syncOrderIntoState(data.order, {
              walletBalance: data.walletBalance,
              reservedBalance: data.reservedBalance,
            });
          }
          showToast(data.error || 'Verification code already arrived — charge finalized.');
          return false;
        }

        if (!res.ok) {
          throw new Error(data.error || 'Could not cancel number session');
        }

        autoRefundedOrderIdsRef.current.add(orderId);
        if (typeof data.walletBalance === 'number') {
          setWalletBalance(data.walletBalance);
        }
        if (typeof data.reservedBalance === 'number') {
          setReservedBalance(data.reservedBalance);
        }

        if (data.order) {
          syncOrderIntoState(data.order, {
            walletBalance: data.walletBalance,
            reservedBalance: data.reservedBalance,
          });
        } else {
          setNumberHistory((prev) =>
            prev.map((o) => (o.id === orderId ? { ...o, status: 'CANCELED' } : o))
          );
        }

        if (
          !data.holdReleased &&
          data.refunded &&
          typeof data.walletBalance !== 'number' &&
          targetOrder?.price
        ) {
          await refundOrderHold(targetOrder.id, targetOrder.price);
        }

        setActiveOrders((prev) => {
          const remaining = prev.filter((o) => o.id !== orderId);
          setSelectedOrderId((curr) => (curr === orderId ? remaining[0]?.id ?? null : curr));
          if (remaining.length === 0 && !suppressNavigateSetup) {
            setNumbersViewMode('setup');
          }
          return remaining;
        });

        const refundedAmt = data.refundedAmount || 0;
        if (refundedAmt > 0) {
          showToast(`Number cancelled · ₦${refundedAmt.toLocaleString()} refunded`);
        } else if (!suppressNavigateSetup) {
          showToast('Number cancelled · Hold released (₦0 charged)');
        }
        return true;
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not cancel number session');
        return false;
      }
    },
    [walletUserId, getAuthAccessToken, handleModerationHttpFailure, syncOrderIntoState, refundOrderHold, showToast]
  );

  const handleSwapNumber = useCallback(
    async (order: PrivateNumberOrder) => {
      const isWaiting =
        order.sms.length === 0 && ['PENDING', 'RECEIVED'].includes(order.status);
      if (isWaiting) {
        const ok = await handleCancelOrder(order.id, true);
        if (!ok) return;
      }

      const provider = order.provider || 'fivesim';
      const matchingCountry =
        countries.find(
          (c) =>
            c.slug.toLowerCase() === order.country.toLowerCase() ||
            c.country.toLowerCase() === order.country.toLowerCase() ||
            (order.countryCode && c.countryCode.toUpperCase() === order.countryCode.toUpperCase())
        ) || selectedCountry;
      const matchingQuote = matchingCountry?.providers?.find((p) => p.provider === provider);
      const countryId =
        matchingQuote?.countryId ||
        matchingCountry?.slug ||
        order.country.toLowerCase().replace(/[^a-z0-9]/g, '');

      const fresh = await acquireNumbersForParams({
        provider,
        countryId,
        countryName: order.country,
        service: order.service,
        serviceName: order.serviceName,
        countrySlug: matchingCountry?.slug || countryId,
        countryCode: order.countryCode || matchingCountry?.countryCode,
        unitPriceNgn: order.price || matchingQuote?.minPrice || 0,
        qty: 1,
      });
      if (fresh?.[0]) {
        void handleCheckOrder(fresh[0].id, fresh[0].provider || 'fivesim', fresh[0].chargeToken);
      }
    },
    [handleCancelOrder, countries, selectedCountry, acquireNumbersForParams, handleCheckOrder]
  );

  const handleFinishOrder = useCallback(
    async (orderId: number) => {
      const targetOrder =
        activeOrders.find((o) => o.id === orderId) ||
        numberHistory.find((o) => o.id === orderId);
      const provider = targetOrder?.provider || 'fivesim';
      try {
        const sbToken = await getAuthAccessToken();
        const headers: Record<string, string> = {};
        if (sbToken) {
          headers.Authorization = `Bearer ${sbToken}`;
        }
        const res = await fetch(
          `/api/numbers/finish/${orderId}?provider=${encodeURIComponent(provider)}`,
          { method: 'POST', headers }
        );
        const data = await parseJsonResponse<{
          order?: PrivateNumberOrder;
          code?: string;
          moderation?: UserModerationLockoutState;
        }>(res);
        if (handleModerationHttpFailure(res.status, data)) {
          return;
        }
        if (res.ok && data.order) {
          syncOrderIntoState(data.order);
        }
        showToast('Number marked complete');
      } catch {
        showToast('Could not complete session');
      }
    },
    [activeOrders, numberHistory, getAuthAccessToken, handleModerationHttpFailure, syncOrderIntoState, showToast]
  );

  const handleReuseFromHistory = useCallback(
    (order: PrivateNumberOrder) => {
      setActiveOrders((prev) => {
        if (prev.some((o) => o.id === order.id)) return prev;
        return [order, ...prev];
      });
      setSelectedOrderId(order.id);
      setNumbersViewMode('receiver');
      void handleCheckOrder(order.id, order.provider || 'fivesim', order.chargeToken);
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
    const qs = new URLSearchParams({
      provider,
      userId: walletUserId,
    });
    if (selectedOrder.chargeToken) {
      qs.set('chargeToken', selectedOrder.chargeToken);
    }
    const es = new EventSource(`/api/numbers/stream/${selectedOrder.id}?${qs.toString()}`);
    es.onopen = () => setStreamConnected(true);
    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as {
          type?: string;
          order?: PrivateNumberOrder;
          walletBalance?: number | null;
          reservedBalance?: number;
          chargedNow?: boolean;
          chargedAmount?: number;
        };
        if (payload.type === 'order' && payload.order) {
          syncOrderIntoState(payload.order, {
            walletBalance: payload.walletBalance,
            reservedBalance: payload.reservedBalance,
            chargedNow: payload.chargedNow,
            chargedAmount: payload.chargedAmount,
          });
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
    selectedOrder?.chargeToken,
    walletUserId,
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
      if (silent && inboxPollInFlightRef.current) return;
      inboxPollInFlightRef.current = true;
      if (!silent) {
        setLoadingEmailMessages(true);
        setEmailError(null);
      }
      try {
        const sbToken = await getAuthAccessToken();
        const headers: Record<string, string> = {
          Authorization: `Bearer ${target.token}`,
          'x-email-provider': 'veribox',
          'x-email-address': target.address,
          'Cache-Control': 'no-cache',
        };
        if (sbToken) {
          headers['x-supabase-token'] = sbToken;
        }
        const res = await fetch('/api/email/messages', {
          cache: 'no-store',
          headers,
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
        setLastEmailCheckedAt(new Date().toISOString());
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
        inboxPollInFlightRef.current = false;
        if (!silent) {
          setLoadingEmailMessages(false);
        }
      }
    },
    [activeEmail, applyInboxSnapshot, getAuthAccessToken]
  );

  const handleGenerateCustomEmail = useCallback(async () => {
    const usedToday = readDailyGenerateCount(walletUserId);
    setDailyGenerateUsed(usedToday);
    if (!isOwnerAdmin && usedToday >= FREE_DAILY_EMAIL_LIMIT) {
      const limitMsg = `Daily free limit reached (${FREE_DAILY_EMAIL_LIMIT}/${FREE_DAILY_EMAIL_LIMIT} today). Resets tomorrow or use Create (₦50).`;
      setEmailError(limitMsg);
      showToast(limitMsg);
      return;
    }

    setGeneratingEmail(true);
    setEmailError(null);
    try {
      const sbToken = await getAuthAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sbToken) {
        headers['x-supabase-token'] = sbToken;
      }

      const res = await fetch('/api/email/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId: walletUserId,
          accountMode: 'personal',
        }),
        signal: AbortSignal.timeout(9000),
      });
      const data = await parseJsonResponse<
        TempEmailAccount & { error?: string; ownerUnlimited?: boolean }
      >(res);
      if (!res.ok || !data.address) {
        throw new Error(data.error || `Could not generate @${emailDomain} email`);
      }

      const unlimited = isOwnerAdmin || Boolean(data.ownerUnlimited);
      let remaining = FREE_DAILY_EMAIL_LIMIT;
      if (!unlimited) {
        const nextUsed = writeDailyGenerateCount(walletUserId, usedToday + 1);
        setDailyGenerateUsed(nextUsed);
        remaining = Math.max(0, FREE_DAILY_EMAIL_LIMIT - nextUsed);
      }

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
      showToast(
        unlimited
          ? `Generated ${data.address} · Owner Unlimited`
          : `Generated ${data.address} · ${remaining}/${FREE_DAILY_EMAIL_LIMIT} free left today`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Could not generate @${emailDomain} email`;
      setEmailError(msg);
      showToast(msg);
    } finally {
      setGeneratingEmail(false);
    }
  }, [walletUserId, isOwnerAdmin, emailDomain, getAuthAccessToken, showToast]);

  const handleOpenEmailDetail = useCallback(
    async (id: string) => {
      if (!activeEmail) return;
      setLoadingEmailDetail(true);
      try {
        const sbToken = await getAuthAccessToken();
        const headers: Record<string, string> = {
          Authorization: `Bearer ${activeEmail.token}`,
          'x-email-provider': 'veribox',
          'x-email-address': activeEmail.address,
        };
        if (sbToken) {
          headers['x-supabase-token'] = sbToken;
        }
        const res = await fetch(`/api/email/messages/${encodeURIComponent(id)}`, {
          headers,
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
    [activeEmail, getAuthAccessToken, showToast]
  );

  const handleDeleteEmailMessage = useCallback(
    async (id: string) => {
      if (!activeEmail) return;
      try {
        const sbToken = await getAuthAccessToken();
        const headers: Record<string, string> = {
          Authorization: `Bearer ${activeEmail.token}`,
          'x-email-provider': 'veribox',
          'x-email-address': activeEmail.address,
        };
        if (sbToken) {
          headers['x-supabase-token'] = sbToken;
        }
        await fetch(`/api/email/messages/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers,
          signal: AbortSignal.timeout(6000),
        });
        setEmailMessages((prev) => prev.filter((m) => m.id !== id));
        setSelectedEmailDetail(null);
        showToast('Email deleted');
      } catch {
        showToast('Could not delete email');
      }
    },
    [activeEmail, getAuthAccessToken, showToast]
  );

  const handleSendEmail = useCallback(
    async (payload: {
      fromAddress: string;
      toAddress: string;
      subject: string;
      text: string;
    }): Promise<{ ok: boolean; id?: string | null; error?: string }> => {
      try {
        const sbToken = await getAuthAccessToken();
        const matchingAcct =
          activeEmail?.address.toLowerCase() === payload.fromAddress.toLowerCase()
            ? activeEmail
            : savedEmails.find(
                (e) => e.address.toLowerCase() === payload.fromAddress.toLowerCase()
              ) || null;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'x-email-address': payload.fromAddress,
        };
        if (matchingAcct?.token) {
          headers.Authorization = `Bearer ${matchingAcct.token}`;
        } else if (sbToken) {
          headers.Authorization = `Bearer ${sbToken}`;
        }
        if (sbToken) {
          headers['x-supabase-token'] = sbToken;
        }

        const res = await fetch('/api/email/send', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(12000),
        });
        const data = await parseJsonResponse<{
          ok?: boolean;
          id?: string | null;
          error?: string;
        }>(res);
        if (!res.ok || !data.ok) {
          return {
            ok: false,
            error: data.error || `HTTP ${res.status}: Failed to send email`,
          };
        }
        showToast(`Email sent to ${payload.toAddress}`);
        return { ok: true, id: data.id || null };
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.name === 'TimeoutError' || err.name === 'AbortError'
                ? 'Request timed out while sending email'
                : err.message
              : 'Failed to send email',
        };
      }
    },
    [activeEmail, savedEmails, getAuthAccessToken, showToast]
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

  // Sync user's saved mailboxes when signed in (strictly scoped to authUser.id)
  useEffect(() => {
    if (!authUser || emailScopeId !== authUser.id) return;
    let active = true;
    void (async () => {
      try {
        const sbToken = await getAuthAccessToken();
        const headers: Record<string, string> = {};
        if (sbToken) {
          headers['x-supabase-token'] = sbToken;
        }
        const res = await fetch(`/api/email/list?userId=${encodeURIComponent(authUser.id)}`, {
          headers,
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
  }, [authUser, emailScopeId, emailDomain, getAuthAccessToken]);

  // Fetch inbox immediately when active email changes
  useEffect(() => {
    if (activeEmail && lastFetchedAddressRef.current !== activeEmail.address.toLowerCase()) {
      knownEmailMsgIdsRef.current = new Set();
      void refreshEmailInbox(activeEmail, false);
    }
  }, [activeEmail, refreshEmailInbox]);

  // 1. Supabase Realtime INSERT subscription filtered for the active mailbox (auto-reconnects cleanly & never blocks HTTPS sync)
  useEffect(() => {
    if (!autoRefresh || !activeEmail?.address || !authUser?.id) {
      setSupabaseRealtimeConnected(false);
      return;
    }

    const targetAddr = activeEmail.address.trim().toLowerCase();
    let cancelled = false;
    let cleanupChannel: (() => void) | null = null;
    let retryTimer: number | null = null;
    let retryCount = 0;

    const connectRealtime = async () => {
      const sb = await ensureSupabaseClient();
      if (cancelled || !sb) return;

      const accessToken = await syncSupabaseRealtimeAuth(sb);
      if (cancelled || !accessToken) {
        setSupabaseRealtimeConnected(false);
        return;
      }

      cleanupChannel?.();
      cleanupChannel = null;

      const channel = sb
        .channel(`inbox-realtime-${authUser.id}-${targetAddr}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'mailbox_messages',
            filter: `recipient_address=eq.${targetAddr}`,
          },
          (payload) => {
            if (cancelled) return;
            const row = payload.new as Record<string, unknown> | undefined;
            if (!row || !row.id) return;
            const rowId = String(row.id);
            if (rowId.startsWith('att_')) return;

            const incomingMsg: EmailMessageSummary = {
              id: rowId,
              fromName: String(row.from_name || row.from_address || 'Unknown sender'),
              fromAddress: String(row.from_address || ''),
              subject: String(row.subject || '(No subject)'),
              intro: String(row.body_text || '').slice(0, 180),
              seen: Boolean(row.seen),
              createdAt: String(row.created_at || new Date().toISOString()),
              otp: row.otp ? String(row.otp) : null,
            };

            const nextList = [
              incomingMsg,
              ...emailMessagesRef.current.filter((m) => m.id !== rowId),
            ].slice(0, 50);
            applyInboxSnapshot(targetAddr, nextList, true);
            setLastEmailCheckedAt(new Date().toISOString());
          }
        )
        .subscribe((status) => {
          if (cancelled) return;
          if (status === 'SUBSCRIBED') {
            retryCount = 0;
            setSupabaseRealtimeConnected(true);
            return;
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setSupabaseRealtimeConnected(false);
            void sb.removeChannel(channel);
            // Immediately pull via HTTPS so incoming codes are never delayed if mobile WebSocket drops
            void refreshEmailInbox(activeEmail, true);
            if (!cancelled && retryCount < 3) {
              const delayMs = [5000, 12000, 25000][retryCount] ?? 25000;
              retryCount += 1;
              if (retryTimer !== null) window.clearTimeout(retryTimer);
              retryTimer = window.setTimeout(() => {
                if (!cancelled) void connectRealtime();
              }, delayMs);
            }
          }
        });

      cleanupChannel = () => {
        void sb.removeChannel(channel);
      };
    };

    void connectRealtime();

    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      setSupabaseRealtimeConnected(false);
      cleanupChannel?.();
    };
  }, [autoRefresh, activeEmail?.address, authUser?.id, applyInboxSnapshot, refreshEmailInbox]);

  // 2. Real-time SSE stream for instant incoming emails on persistent local server
  useEffect(() => {
    const isLocalHost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    if (!isLocalHost || !autoRefresh || activeTab !== 'home' || !activeEmail) {
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
          setLastEmailCheckedAt(new Date().toISOString());
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

  // 3. Lightweight 2.5-second HTTPS live sync + immediate refresh when returning to Home or switching back from another app
  useEffect(() => {
    if (!autoRefresh || activeTab !== 'home' || !activeEmail) return;
    if (lastFetchedAddressRef.current === activeEmail.address.toLowerCase()) {
      void refreshEmailInbox(activeEmail, true);
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      void refreshEmailInbox(activeEmail, true);
    }, 2500);

    const handleResume = () => {
      if (document.visibilityState === 'hidden') return;
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
        onOpenProfile={() => {
          setProfileInitialSubTab('account');
          setActiveTab('profile');
          if (authUser) {
            void fetchUserTransfers();
          }
          if (isOwnerAdmin) {
            void fetchAdminDiagnostics(true);
            void fetchAdminUsers();
            void fetchAdminTransfers();
          }
        }}
        onOpenAuth={() => openAuthModal()}
      />

      <CornerDrawer
        open={drawerOpen}
        isAuthenticated={isAuthenticated}
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
          if (tab === 'profile') {
            setProfileInitialSubTab('account');
            if (authUser) {
              void fetchUserTransfers();
            }
            if (isOwnerAdmin) {
              void fetchAdminDiagnostics(true);
              void fetchAdminUsers();
              void fetchAdminTransfers();
            }
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
          void fetchUserTransfers();
          if (isOwnerAdmin) {
            void fetchAdminTransfers();
          }
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

      {isOwnerAdmin && domainErrorPopup && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Domain connection error alert"
          className="fixed inset-x-0 top-14 z-50 mx-auto w-[calc(100%-1.5rem)] max-w-xl animate-in fade-in duration-150"
        >
          <div className="rounded-2xl border-2 border-rose-500/80 bg-[#1A0D0E] p-4 text-rose-50 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-extrabold uppercase tracking-wider text-rose-300">
                    Real-Time Domain Error Alert
                  </p>
                  <h2 className="font-display text-sm font-extrabold text-white truncate">
                    {domainErrorPopup.title}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void dismissDomainErrorPopup()}
                aria-label="Dismiss domain error popup"
                className="rounded-lg p-1.5 text-rose-200 hover:bg-rose-500/20 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ul className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
              {domainErrorPopup.errors.map((errMsg, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 rounded-lg bg-rose-950/70 px-2.5 py-1.5 font-mono text-[11px] text-rose-100 break-words"
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-400" />
                  <span>{errMsg}</span>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => void fetchAdminDiagnostics(false)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-400/40 bg-rose-500/15 px-3 py-1.5 text-xs font-bold text-rose-100 hover:bg-rose-500/30 cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${adminLoading ? 'animate-spin' : ''}`} />
                <span>Re-check Domain</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!isOwnerAdmin) return;
                  setProfileInitialSubTab('admin');
                  setActiveTab('profile');
                  void fetchAdminDiagnostics(false);
                  void fetchAdminUsers();
                  void fetchAdminTransfers();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500 px-3.5 py-1.5 text-xs font-extrabold text-white hover:bg-rose-400 cursor-pointer"
              >
                <span>Open Owner Admin</span>
              </button>
              <button
                type="button"
                onClick={() => void dismissDomainErrorPopup()}
                className="rounded-xl px-2.5 py-1.5 text-xs font-bold text-rose-200 hover:bg-white/10 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {moderationLockout?.blocked && moderationLockout.status !== 'restricted' && !isOwnerAdmin ? (
        <main className="mx-auto flex min-h-[75vh] w-full max-w-lg items-center justify-center px-4 py-10">
          <div className="w-full rounded-3xl border-2 border-rose-500/60 bg-white p-6 text-center shadow-2xl dark:bg-[#14120D]">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-500">
              <ShieldAlert className="h-7 w-7" />
            </div>
            <p className="mt-3 text-[11px] font-extrabold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Account {moderationLockout.status}
              {moderationLockout.matchType ? ` · ${moderationLockout.matchType.toUpperCase()} Block` : ''}
            </p>
            <h1 className="mt-1 font-display text-xl font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
              Access Suspended by Administrator
            </h1>
            <p className="mt-2 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs font-medium text-rose-700 dark:text-rose-200">
              {moderationLockout.reason ||
                'Your access to VeriBox has been disabled by the platform owner.'}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              {isAuthenticated && (
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="rounded-xl border border-rose-500/35 px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-500/10 dark:text-rose-300"
                >
                  Sign Out
                </button>
              )}
              <button
                type="button"
                onClick={() => void checkModerationStatus()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#D4AF37] px-4 py-2 text-xs font-extrabold text-[#0A0906] hover:bg-[#E5C150]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Re-check Access</span>
              </button>
            </div>
          </div>
        </main>
      ) : (
        <>
          {moderationLockout?.blocked && moderationLockout.status === 'restricted' && !isOwnerAdmin && (
            <div className="mx-auto mt-3 w-full max-w-7xl px-3 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-500/50 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-amber-800 dark:text-amber-200">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                  <span>
                    Your account is currently restricted: {moderationLockout.reason || 'Purchases and email actions are paused by the owner.'}
                  </span>
                </div>
              </div>
            </div>
          )}

      <main className="mx-auto w-full max-w-7xl px-3 pb-24 pt-3 sm:px-6 sm:pt-5">
        {activeTab === 'home' && (
          <HomeEmailTab
            emailDomain={emailDomain}
            isOwnerAdmin={isOwnerAdmin}
            activeEmail={activeEmail}
            savedEmails={savedEmails}
            messages={emailMessages}
            selectedMessage={selectedEmailDetail}
            loadingMessages={loadingEmailMessages}
            loadingDetail={loadingEmailDetail}
            generatingEmail={generatingEmail}
            emailStreamConnected={emailStreamConnected || supabaseRealtimeConnected}
            lastCheckedAt={lastEmailCheckedAt}
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
            onSendEmail={(payload) => {
              if (!isAuthenticated) {
                openAuthModal('Sign in to send emails from VeriBox');
                return Promise.resolve({ ok: false, error: 'Sign in required' });
              }
              return handleSendEmail(payload);
            }}
            onCopyText={handleCopyText}
          />
        )}

        {activeTab === 'create' && (
          <CreateEmailTab
            emailDomain={emailDomain}
            isOwnerAdmin={isOwnerAdmin}
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
            reservedBalance={effectiveReservedBalance}
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
            onSwapNumber={(ord) =>
              requireAuth('Sign in to swap to a fresh phone number', () => {
                void handleSwapNumber(ord);
              })
            }
            onFinishOrder={(id) => void handleFinishOrder(id)}
            onReuseFromHistory={handleReuseFromHistory}
            onDeleteFromHistory={handleDeleteFromHistory}
            onCopyText={handleCopyText}
          />
        )}

        {activeTab === 'images' && (
          <ImageGenTab
            isOwnerAdmin={isOwnerAdmin}
            isAuthenticated={isAuthenticated}
            getAuthToken={getAuthAccessToken}
            onModerationBlocked={(status, payload) => {
              handleModerationHttpFailure(status, payload);
            }}
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
            isOwnerAdmin={isOwnerAdmin}
            ownerEmail={authUser?.email || OWNER_ADMIN_EMAIL}
            emailDomain={emailDomain}
            initialSubTab={profileInitialSubTab}
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
            walletBalance={walletBalance}
            transfers={userTransfers}
            transfersLoading={userTransfersLoading}
            transfersError={userTransfersError}
            adminDiagnostics={isOwnerAdmin ? adminDiagnostics : null}
            adminLoading={adminLoading}
            adminError={adminError}
            adminUsers={isOwnerAdmin ? adminUsers : []}
            strictBans={isOwnerAdmin ? strictBans : []}
            banningVisitor={banningVisitor}
            adminUsersLoading={adminUsersLoading}
            adminUsersError={adminUsersError}
            moderatingUserId={moderatingUserId}
            adminTransfers={isOwnerAdmin ? adminTransfers : []}
            adminTransfersLoading={adminTransfersLoading}
            adminTransfersError={adminTransfersError}
            testingInbound={testingInbound}
            adminTestResult={isOwnerAdmin ? adminTestResult : null}
            adminTestError={isOwnerAdmin ? adminTestError : null}
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
            onBackToHome={() => setActiveTab('home')}
            onRefreshTransfers={() => void fetchUserTransfers()}
            onSendTransfer={handleSendP2pTransfer}
            onOpenDeposit={() =>
              requireAuth('Sign in to fund your Naira wallet', () => setDepositModalOpen(true))
            }
            onRefreshAdmin={
              isOwnerAdmin
                ? () => {
                    void fetchAdminDiagnostics(false);
                    void fetchAdminUsers();
                    void fetchAdminTransfers();
                  }
                : undefined
            }
            onRefreshAdminUsers={isOwnerAdmin ? () => void fetchAdminUsers() : undefined}
            onModerateUser={
              isOwnerAdmin
                ? (userId, action, options) => void handleModerateUser(userId, action, options)
                : undefined
            }
            onBanVisitor={isOwnerAdmin ? handleBanVisitor : undefined}
            onRemoveStrictBan={isOwnerAdmin ? (id) => void handleRemoveStrictBan(id) : undefined}
            onRefreshAdminTransfers={isOwnerAdmin ? () => void fetchAdminTransfers() : undefined}
            onClearAdminAlerts={isOwnerAdmin ? () => void clearAdminAlerts() : undefined}
            onTestInbound={
              isOwnerAdmin ? (addr) => void handleTestInboundPipeline(addr) : undefined
            }
            onSendEmail={isOwnerAdmin ? handleSendEmail : undefined}
          />
        )}
      </main>

      <BottomNav
        activeTab={activeTab}
        unreadEmailCount={unreadEmailCount}
        onChange={(tab) => {
          if (tab === 'profile') {
            setProfileInitialSubTab('account');
            if (authUser) {
              void fetchUserTransfers();
            }
            if (isOwnerAdmin) {
              void fetchAdminDiagnostics(true);
              void fetchAdminUsers();
              void fetchAdminTransfers();
            }
          }
          setActiveTab(tab);
        }}
      />
        </>
      )}
    </div>
  );
}
