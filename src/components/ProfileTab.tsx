import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  MailPlus,
  MessageSquareText,
  Moon,
  PauseCircle,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Trash2,
  User,
  UserCheck,
  Wallet,
  XCircle,
} from 'lucide-react';
import type {
  AdminDiagnosticsResponse,
  AdminInboundTestResult,
  AdminManagedUser,
  AdminTransferRecord,
  CopiedOtpRecord,
  PhoneNumberEntry,
  StrictBanEntry,
  TempEmailAccount,
  UserModerationAction,
  UserModerationStatus,
  WalletTransferRecord,
} from '../types';
import { formatRelativeTime } from '../utils/clipboard';
import { PWAInstallButton } from './PWAInstallButton';

export type ProfileSubTab = 'account' | 'transfers' | 'admin';

interface ProfileTabProps {
  isAuthenticated: boolean;
  isOwnerAdmin?: boolean;
  ownerEmail?: string;
  emailDomain?: string;
  initialSubTab?: ProfileSubTab;
  userEmail?: string | null;
  userName?: string | null;
  avatarUrl?: string | null;
  activeEmail: TempEmailAccount | null;
  savedEmails: TempEmailAccount[];
  savedNumbers: PhoneNumberEntry[];
  otpHistory: CopiedOtpRecord[];
  autoRefresh: boolean;
  isDark: boolean;
  walletBalance?: number;
  transfers?: WalletTransferRecord[];
  transfersLoading?: boolean;
  transfersError?: string | null;
  // Owner-only props (empty/undefined for non-owners)
  adminDiagnostics?: AdminDiagnosticsResponse | null;
  adminLoading?: boolean;
  adminError?: string | null;
  adminUsers?: AdminManagedUser[];
  strictBans?: StrictBanEntry[];
  banningVisitor?: boolean;
  adminUsersLoading?: boolean;
  adminUsersError?: string | null;
  moderatingUserId?: string | null;
  adminTransfers?: AdminTransferRecord[];
  adminTransfersLoading?: boolean;
  adminTransfersError?: string | null;
  testingInbound?: boolean;
  adminTestResult?: AdminInboundTestResult | null;
  adminTestError?: string | null;
  onCreateEmail: () => void;
  onSelectEmail: (account: TempEmailAccount) => void;
  onOpenSmsNumber: (entry: PhoneNumberEntry) => void;
  onRemoveSavedNumber: (digits: string) => void;
  onToggleAutoRefresh: () => void;
  onToggleTheme: () => void;
  onClearHistory: () => void;
  onCopyText: (value: string, label: string) => void;
  onOpenAuth: () => void;
  onSignOut: () => void;
  onBackToHome: () => void;
  onRefreshTransfers?: () => void;
  onSendTransfer?: (payload: {
    recipientEmail: string;
    amount: number;
    note?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onOpenDeposit?: () => void;
  onRefreshAdmin?: () => void;
  onRefreshAdminUsers?: () => void;
  onModerateUser?: (
    userId: string,
    action: UserModerationAction,
    options?: { reason?: string; strict?: boolean }
  ) => void;
  onBanVisitor?: (payload: {
    targetType: 'email' | 'ip';
    targetValue: string;
    reason?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onRemoveStrictBan?: (banId: string) => void;
  onRefreshAdminTransfers?: () => void;
  onClearAdminAlerts?: () => void;
  onTestInbound?: (targetAddress: string) => void;
  onSendEmail?: (payload: {
    fromAddress: string;
    toAddress: string;
    subject: string;
    text: string;
  }) => Promise<{ ok: boolean; id?: string | null; error?: string }>;
}

type UserTransferFilter = 'all' | 'sent' | 'received' | 'deposit' | 'debit';
type AdminTransferFilter = 'all' | 'p2p_transfer' | 'deposit' | 'debit' | 'refund' | 'issues';

export function ProfileTab({
  isAuthenticated,
  isOwnerAdmin = false,
  ownerEmail = 'preciousddkid@gmail.com',
  emailDomain = 'veribox.name.ng',
  initialSubTab = 'account',
  userEmail,
  userName,
  avatarUrl,
  activeEmail,
  savedEmails,
  savedNumbers,
  otpHistory,
  autoRefresh,
  isDark,
  walletBalance = 0,
  transfers = [],
  transfersLoading = false,
  transfersError = null,
  adminDiagnostics = null,
  adminLoading = false,
  adminError = null,
  adminUsers = [],
  strictBans = [],
  banningVisitor = false,
  adminUsersLoading = false,
  adminUsersError = null,
  moderatingUserId = null,
  adminTransfers = [],
  adminTransfersLoading = false,
  adminTransfersError = null,
  testingInbound = false,
  adminTestResult = null,
  adminTestError = null,
  onCreateEmail,
  onSelectEmail,
  onOpenSmsNumber,
  onRemoveSavedNumber,
  onToggleAutoRefresh,
  onToggleTheme,
  onClearHistory,
  onCopyText,
  onOpenAuth,
  onSignOut,
  onBackToHome,
  onRefreshTransfers,
  onSendTransfer,
  onOpenDeposit,
  onRefreshAdmin,
  onRefreshAdminUsers,
  onModerateUser,
  onBanVisitor,
  onRemoveStrictBan,
  onRefreshAdminTransfers,
  onClearAdminAlerts,
  onTestInbound,
  onSendEmail,
}: ProfileTabProps) {
  const [subTab, setSubTab] = useState<ProfileSubTab>(
    initialSubTab === 'admin' && isOwnerAdmin ? 'admin' : initialSubTab
  );

  // Sync if caller explicitly switches into Profile -> Admin (e.g. from an alert)
  useEffect(() => {
    if (initialSubTab === 'admin' && isOwnerAdmin) {
      setSubTab('admin');
    } else if (!isOwnerAdmin && subTab === 'admin') {
      setSubTab('account');
    }
  }, [initialSubTab, isOwnerAdmin, subTab]);

  // Account expandables
  const [expandedAccountSection, setExpandedAccountSection] = useState<
    'emails' | 'numbers' | 'otps' | null
  >(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // User Transfers state
  const [transferSearch, setTransferSearch] = useState('');
  const [transferFilter, setTransferFilter] = useState<UserTransferFilter>('all');
  const [showSendForm, setShowSendForm] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [sendingTransfer, setSendingTransfer] = useState(false);
  const [transferFeedback, setTransferFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Owner Admin Console state
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | UserModerationStatus>('all');
  const [moderationReasonInput, setModerationReasonInput] = useState('');
  const [visitorBanType, setVisitorBanType] = useState<'email' | 'ip'>('ip');
  const [visitorBanValue, setVisitorBanValue] = useState('');
  const [visitorBanReason, setVisitorBanReason] = useState('');
  const [visitorBanFeedback, setVisitorBanFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [adminTransferSearch, setAdminTransferSearch] = useState('');
  const [adminTransferFilter, setAdminTransferFilter] = useState<AdminTransferFilter>('all');
  const [showInboundTools, setShowInboundTools] = useState(false);
  const [testAddress, setTestAddress] = useState(
    activeEmail?.address || `diag.test@${emailDomain}`
  );
  const [copiedSpf, setCopiedSpf] = useState(false);
  const [warmupFrom, setWarmupFrom] = useState(activeEmail?.address || `hello@${emailDomain}`);
  const [warmupTo, setWarmupTo] = useState(ownerEmail);
  const [warmupSubject, setWarmupSubject] = useState('Quick hello from VeriBox Mail');
  const [warmupText, setWarmupText] = useState(
    'Hi, testing real two-way email delivery from @veribox.name.ng. Reply from Gmail to verify live inbox delivery.'
  );
  const [warmupSending, setWarmupSending] = useState(false);
  const [warmupStatus, setWarmupStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (activeEmail?.address) {
      setTestAddress(activeEmail.address);
      setWarmupFrom(activeEmail.address);
    }
  }, [activeEmail?.address]);

  const recommendedSpf =
    adminDiagnostics?.dnsCheck?.recommendedSpfRecord || `v=spf1 include:send.${emailDomain} ~all`;

  const handleCopySpf = () => {
    void navigator.clipboard.writeText(recommendedSpf);
    setCopiedSpf(true);
    window.setTimeout(() => setCopiedSpf(false), 2200);
  };

  const handleSendWarmup = async () => {
    if (!onSendEmail || warmupSending) return;
    setWarmupSending(true);
    setWarmupStatus(null);
    const res = await onSendEmail({
      fromAddress: warmupFrom.trim().toLowerCase(),
      toAddress: warmupTo.trim().toLowerCase(),
      subject: warmupSubject.trim(),
      text: warmupText.trim(),
    });
    setWarmupSending(false);
    if (res.ok) {
      setWarmupStatus({
        ok: true,
        text: `Sent via Resend (${res.id || 'queued'}). Reply from ${warmupTo.trim()} to see replies arrive in ${warmupFrom.trim()}.`,
      });
    } else {
      setWarmupStatus({
        ok: false,
        text: res.error || 'Could not send email via Resend.',
      });
    }
  };

  const handleCopy = (id: string, value: string, label: string) => {
    onCopyText(value, label);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
  };

  const filteredTransfers = useMemo(() => {
    const q = transferSearch.trim().toLowerCase();
    return transfers.filter((t) => {
      if (transferFilter === 'sent' && t.direction !== 'sent') return false;
      if (
        transferFilter === 'received' &&
        t.direction !== 'received' &&
        t.direction !== 'refund'
      ) {
        return false;
      }
      if (transferFilter === 'deposit' && t.direction !== 'deposit') return false;
      if (transferFilter === 'debit' && t.direction !== 'debit') return false;
      if (!q) return true;
      return (
        t.reference.toLowerCase().includes(q) ||
        t.details.toLowerCase().includes(q) ||
        t.counterpartyLabel.toLowerCase().includes(q) ||
        t.senderLabel.toLowerCase().includes(q) ||
        t.recipientLabel.toLowerCase().includes(q) ||
        (t.senderEmail || '').toLowerCase().includes(q) ||
        (t.recipientEmail || '').toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q)
      );
    });
  }, [transfers, transferSearch, transferFilter]);

  const filteredAdminUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return adminUsers.filter((u) => {
      if (userStatusFilter !== 'all' && u.status !== userStatusFilter) return false;
      if (!q) return true;
      return (
        u.email.toLowerCase().includes(q) ||
        (u.fullName || '').toLowerCase().includes(q) ||
        u.status.toLowerCase().includes(q)
      );
    });
  }, [adminUsers, userSearch, userStatusFilter]);

  const userCounts = useMemo(
    () => ({
      all: adminUsers.length,
      verified: adminUsers.filter((u) => u.status === 'verified').length,
      restricted: adminUsers.filter((u) => u.status === 'restricted').length,
      suspended: adminUsers.filter((u) => u.status === 'suspended').length,
      banned: adminUsers.filter((u) => u.status === 'banned').length,
    }),
    [adminUsers]
  );

  const filteredAdminTransfers = useMemo(() => {
    const q = adminTransferSearch.trim().toLowerCase();
    return adminTransfers.filter((t) => {
      if (adminTransferFilter === 'p2p_transfer' && t.txType !== 'p2p_transfer') return false;
      if (adminTransferFilter === 'deposit' && t.txType !== 'deposit') return false;
      if (adminTransferFilter === 'debit' && t.txType !== 'debit') return false;
      if (adminTransferFilter === 'refund' && t.txType !== 'refund') return false;
      if (
        adminTransferFilter === 'issues' &&
        !['pending', 'failed', 'error'].includes(t.status.toLowerCase())
      ) {
        return false;
      }
      if (!q) return true;
      return (
        t.reference.toLowerCase().includes(q) ||
        t.senderLabel.toLowerCase().includes(q) ||
        t.recipientLabel.toLowerCase().includes(q) ||
        (t.senderEmail || '').toLowerCase().includes(q) ||
        (t.recipientEmail || '').toLowerCase().includes(q) ||
        t.details.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q)
      );
    });
  }, [adminTransfers, adminTransferSearch, adminTransferFilter]);

  const handleTransferSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!onSendTransfer) return;
    setTransferFeedback(null);
    const cleanEmail = recipientEmail.trim().toLowerCase();
    const numericAmount = Math.round(Number(transferAmount));
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setTransferFeedback({
        type: 'error',
        text: 'Enter a valid recipient email address.',
      });
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount < 50) {
      setTransferFeedback({
        type: 'error',
        text: 'Minimum transfer amount is ₦50.',
      });
      return;
    }

    setSendingTransfer(true);
    try {
      const result = await onSendTransfer({
        recipientEmail: cleanEmail,
        amount: numericAmount,
        note: transferNote.trim() || undefined,
      });
      if (result.ok) {
        setRecipientEmail('');
        setTransferAmount('');
        setTransferNote('');
        setShowSendForm(false);
        setTransferFeedback({
          type: 'success',
          text: `Sent ₦${numericAmount.toLocaleString()} to ${cleanEmail}.`,
        });
      } else {
        setTransferFeedback({
          type: 'error',
          text: result.error || 'Transfer could not be completed.',
        });
      }
    } finally {
      setSendingTransfer(false);
    }
  };

  const env = adminDiagnostics?.environment;
  const recentErrors = adminDiagnostics?.recentErrors || [];
  const supabaseHealthy = Boolean(
    env?.supabaseConfigured &&
      adminDiagnostics?.probes.mailboxes.ok &&
      adminDiagnostics?.probes.mailboxMessages.ok &&
      (adminDiagnostics?.probes.inboundWebhookLogs?.ok ?? true) &&
      (adminDiagnostics?.probes.wallets?.ok ?? true) &&
      (adminDiagnostics?.probes.walletTransactions?.ok ?? true) &&
      (adminDiagnostics?.probes.appErrorLogs?.ok ?? true)
  );

  const tableProbes = adminDiagnostics
    ? [
        { name: 'mailboxes', probe: adminDiagnostics.probes.mailboxes },
        { name: 'mailbox_messages', probe: adminDiagnostics.probes.mailboxMessages },
        { name: 'inbound_webhook_logs', probe: adminDiagnostics.probes.inboundWebhookLogs },
        { name: 'wallets', probe: adminDiagnostics.probes.wallets },
        { name: 'wallet_transactions', probe: adminDiagnostics.probes.walletTransactions },
        { name: 'app_error_logs', probe: adminDiagnostics.probes.appErrorLogs },
        { name: 'created_email_registry', probe: adminDiagnostics.probes.createdEmailRegistry },
        { name: 'user_moderation', probe: adminDiagnostics.probes.userModeration },
      ].filter((item) => Boolean(item.probe))
    : [];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Compact Profile Header with VeriBox Logo */}
      <div className="flex items-center justify-between gap-3 px-0.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#D4AF37]/70 bg-[#14120D]">
            <img
              src="/pwa-192x192.png"
              alt="VeriBox"
              className="h-full w-full object-cover"
            />
          </div>
          <h1 className="font-display text-xl font-black tracking-tight text-[#1A160D] dark:text-[#FAF6EC]">
            Profile
          </h1>
        </div>
        <p className="font-mono text-xs font-semibold text-[#6E6552] truncate dark:text-[#A89F8C]">
          {savedEmails.length} emails · ₦{walletBalance.toLocaleString()}
        </p>
      </div>

      {/* Segmented Tabs: Account | Transfers | (Owner-Only) Admin */}
      <nav
        aria-label="Profile sections"
        className="flex items-center gap-1 rounded-2xl border border-[#D4AF37]/25 bg-white p-1 dark:bg-[#14120D]"
      >
        <button
          type="button"
          onClick={() => setSubTab('account')}
          className={`flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-extrabold transition-colors cursor-pointer ${
            subTab === 'account'
              ? 'bg-[#D4AF37] text-[#0A0906] shadow-xs'
              : 'text-[#6E6552] hover:bg-[#D4AF37]/10 dark:text-[#D5CCB8]'
          }`}
        >
          <span>Account</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSubTab('transfers');
            if (isAuthenticated) {
              onRefreshTransfers?.();
            }
          }}
          className={`flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-extrabold transition-colors cursor-pointer ${
            subTab === 'transfers'
              ? 'bg-[#D4AF37] text-[#0A0906] shadow-xs'
              : 'text-[#6E6552] hover:bg-[#D4AF37]/10 dark:text-[#D5CCB8]'
          }`}
        >
          <span>Transfers</span>
          {isAuthenticated && transfers.length > 0 && (
            <span
              className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-black tabular-nums ${
                subTab === 'transfers'
                  ? 'bg-[#0A0906]/15 text-[#0A0906]'
                  : 'bg-[#D4AF37]/20 text-[#8A6208] dark:text-[#F5D77A]'
              }`}
            >
              {transfers.length}
            </span>
          )}
        </button>

        {isOwnerAdmin && (
          <button
            type="button"
            onClick={() => {
              setSubTab('admin');
              onRefreshAdmin?.();
            }}
            className={`flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-extrabold transition-colors cursor-pointer ${
              subTab === 'admin'
                ? 'bg-[#D4AF37] text-[#0A0906] shadow-xs'
                : 'text-[#8A6208] hover:bg-[#D4AF37]/10 dark:text-[#F5D77A]'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            <span>Admin</span>
          </button>
        )}
      </nav>

      {/* ======================================================== */}
      {/* TAB 1: ACCOUNT                                           */}
      {/* ======================================================== */}
      {subTab === 'account' && (
        <div className="space-y-4">
          {/* Centered Profile Card */}
          <section className="rounded-2xl border border-[#D4AF37]/25 bg-white px-5 py-6 text-center dark:bg-[#14120D]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-[#D4AF37] bg-[#14120D] text-[#F5D77A] shadow-md">
              {isAuthenticated && avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={userName || 'User avatar'}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <User className="h-7 w-7" />
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
              <h2 className="font-display text-lg font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
                {isAuthenticated
                  ? userName || userEmail || 'VeriBox Account'
                  : 'Guest Preview'}
              </h2>
              {isAuthenticated && (
                <CheckCircle2 className="h-4 w-4 text-[#D4AF37]" aria-label="Verified" />
              )}
              {isOwnerAdmin && (
                <span className="rounded-full bg-[#D4AF37] px-2 py-0.5 font-mono text-[10px] font-black uppercase text-[#0A0906]">
                  Owner
                </span>
              )}
            </div>

            {isAuthenticated && userEmail && (
              <p className="mt-0.5 font-mono text-xs text-[#6E6552] dark:text-[#A89F8C]">
                {userEmail}
              </p>
            )}

            <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-[#D4AF37]/25 bg-[#FAF7F0] px-3 py-1 text-[11px] font-semibold text-[#6E6552] dark:bg-[#0B0A07] dark:text-[#D5CCB8]">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isAuthenticated ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span>{isAuthenticated ? 'Supabase · Active' : 'Sign in to sync'}</span>
            </div>
          </section>

          {/* Compact Account Settings & Saved Items */}
          <section className="overflow-hidden rounded-2xl border border-[#D4AF37]/25 bg-white divide-y divide-[#D4AF37]/15 dark:bg-[#14120D]">
            {/* Auto-Refresh */}
            <button
              type="button"
              role="switch"
              aria-checked={autoRefresh}
              onClick={onToggleAutoRefresh}
              className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[#D4AF37]/5 cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#D4AF37]/15 text-[#8A6208] dark:text-[#F5D77A]">
                  <RefreshCw className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                    Auto-Refresh Inboxes
                  </p>
                  <p className="text-xs text-[#6E6552] truncate dark:text-[#A89F8C]">
                    Live email &amp; SMS code stream
                  </p>
                </div>
              </div>
              <span
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  autoRefresh ? 'bg-[#D4AF37]' : 'bg-[#6E6552]/30 dark:bg-[#2A2418]'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    autoRefresh ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </span>
            </button>

            {/* Theme */}
            <button
              type="button"
              role="switch"
              aria-checked={isDark}
              onClick={onToggleTheme}
              className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[#D4AF37]/5 cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#D4AF37]/15 text-[#8A6208] dark:text-[#F5D77A]">
                  {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                    {isDark ? 'Obsidian Gold Theme' : 'Warm Ivory Theme'}
                  </p>
                  <p className="text-xs text-[#6E6552] truncate dark:text-[#A89F8C]">
                    Switch dark &amp; light appearance
                  </p>
                </div>
              </div>
              <span
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  isDark ? 'bg-[#D4AF37]' : 'bg-[#6E6552]/30'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    isDark ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </span>
            </button>

            {/* Created Emails */}
            <div>
              <div className="flex min-h-[56px] items-center justify-between gap-2 px-4 py-3">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedAccountSection((prev) => (prev === 'emails' ? null : 'emails'))
                  }
                  className="flex flex-1 items-center gap-3 min-w-0 text-left cursor-pointer"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#D4AF37]/15 text-[#8A6208] dark:text-[#F5D77A]">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                      Created Emails
                    </p>
                    <p className="text-xs text-[#6E6552] dark:text-[#A89F8C]">
                      {savedEmails.length} custom @{emailDomain} addresses
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={isAuthenticated ? onCreateEmail : onOpenAuth}
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-[#D4AF37] px-2.5 py-1 text-[11px] font-black text-[#0A0906] hover:bg-[#E5C150] cursor-pointer"
                  >
                    <MailPlus className="h-3 w-3" />
                    <span>Create</span>
                  </button>
                  <button
                    type="button"
                    aria-label="Toggle created emails list"
                    onClick={() =>
                      setExpandedAccountSection((prev) => (prev === 'emails' ? null : 'emails'))
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6E6552] hover:bg-[#D4AF37]/10 cursor-pointer dark:text-[#A89F8C]"
                  >
                    {expandedAccountSection === 'emails' ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {expandedAccountSection === 'emails' && (
                <div className="border-t border-[#D4AF37]/15 bg-[#FAF7F0] px-4 py-3 space-y-2 dark:bg-[#0B0A07]">
                  {savedEmails.length === 0 ? (
                    <p className="text-xs text-[#6E6552] dark:text-[#A89F8C]">
                      No created emails yet.
                    </p>
                  ) : (
                    savedEmails.map((acct) => {
                      const isActive = activeEmail?.address === acct.address;
                      return (
                        <div
                          key={acct.address}
                          className="flex items-center justify-between gap-2 rounded-xl border border-[#D4AF37]/20 bg-white px-3 py-2 dark:bg-[#14120D]"
                        >
                          <div className="min-w-0">
                            <p className="font-mono text-xs font-bold text-[#1A160D] truncate dark:text-[#FAF6EC]">
                              {acct.address}
                            </p>
                            <p className="text-[11px] text-[#6E6552] dark:text-[#A89F8C]">
                              {isActive ? 'Active inbox' : formatRelativeTime(acct.createdAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => onSelectEmail(acct)}
                              className="rounded-lg bg-[#D4AF37] px-2.5 py-1 text-[11px] font-bold text-[#0A0906] cursor-pointer"
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopy(acct.address, acct.address, 'Email copied')}
                              aria-label="Copy email"
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#D4AF37]/25 text-[#6E6552] cursor-pointer dark:text-[#D5CCB8]"
                            >
                              {copiedId === acct.address ? (
                                <Check className="h-3.5 w-3.5 text-[#D4AF37]" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* Saved Phone Numbers */}
            <div>
              <button
                type="button"
                onClick={() =>
                  setExpandedAccountSection((prev) => (prev === 'numbers' ? null : 'numbers'))
                }
                className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[#D4AF37]/5 cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#D4AF37]/15 text-[#8A6208] dark:text-[#F5D77A]">
                    <Phone className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                      Saved Phone Numbers
                    </p>
                    <p className="text-xs text-[#6E6552] dark:text-[#A89F8C]">
                      {savedNumbers.length} bookmarked numbers
                    </p>
                  </div>
                </div>
                {expandedAccountSection === 'numbers' ? (
                  <ChevronUp className="h-4 w-4 text-[#6E6552] dark:text-[#A89F8C]" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-[#6E6552] dark:text-[#A89F8C]" />
                )}
              </button>

              {expandedAccountSection === 'numbers' && (
                <div className="border-t border-[#D4AF37]/15 bg-[#FAF7F0] px-4 py-3 space-y-2 dark:bg-[#0B0A07]">
                  {savedNumbers.length === 0 ? (
                    <p className="text-xs text-[#6E6552] dark:text-[#A89F8C]">
                      No saved phone numbers yet.
                    </p>
                  ) : (
                    savedNumbers.map((entry) => (
                      <div
                        key={entry.digits}
                        className="flex items-center justify-between gap-2 rounded-xl border border-[#D4AF37]/20 bg-white px-3 py-2 dark:bg-[#14120D]"
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                            {entry.number}
                          </p>
                          <p className="text-[11px] text-[#6E6552] dark:text-[#A89F8C]">
                            {entry.country} · {entry.platform}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => onOpenSmsNumber(entry)}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#D4AF37] px-2.5 py-1 text-[11px] font-bold text-[#0A0906] cursor-pointer"
                          >
                            <MessageSquareText className="h-3 w-3" />
                            <span>SMS</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveSavedNumber(entry.digits)}
                            aria-label="Remove saved number"
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#D4AF37]/25 text-[#6E6552] hover:text-rose-500 cursor-pointer dark:text-[#A89F8C]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Copied OTP History */}
            <div>
              <div className="flex min-h-[56px] items-center justify-between gap-2 px-4 py-3">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedAccountSection((prev) => (prev === 'otps' ? null : 'otps'))
                  }
                  className="flex flex-1 items-center gap-3 min-w-0 text-left cursor-pointer"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#D4AF37]/15 text-[#8A6208] dark:text-[#F5D77A]">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                      Copied OTP History
                    </p>
                    <p className="text-xs text-[#6E6552] dark:text-[#A89F8C]">
                      {otpHistory.length} saved verification codes
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-1.5 shrink-0">
                  {otpHistory.length > 0 && !confirmClear && (
                    <button
                      type="button"
                      onClick={() => setConfirmClear(true)}
                      className="rounded-lg border border-[#D4AF37]/25 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-500/10 cursor-pointer dark:text-rose-400"
                    >
                      Clear
                    </button>
                  )}
                  {confirmClear && (
                    <button
                      type="button"
                      onClick={() => {
                        onClearHistory();
                        setConfirmClear(false);
                      }}
                      className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white cursor-pointer"
                    >
                      Confirm
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Toggle copied OTP list"
                    onClick={() =>
                      setExpandedAccountSection((prev) => (prev === 'otps' ? null : 'otps'))
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6E6552] hover:bg-[#D4AF37]/10 cursor-pointer dark:text-[#A89F8C]"
                  >
                    {expandedAccountSection === 'otps' ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {expandedAccountSection === 'otps' && (
                <div className="border-t border-[#D4AF37]/15 bg-[#FAF7F0] px-4 py-3 space-y-2 dark:bg-[#0B0A07]">
                  {otpHistory.length === 0 ? (
                    <p className="text-xs text-[#6E6552] dark:text-[#A89F8C]">
                      Codes you copy from SMS or Email will appear here.
                    </p>
                  ) : (
                    otpHistory.slice(0, 12).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-[#D4AF37]/20 bg-white px-3 py-2 dark:bg-[#14120D]"
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-black tracking-wider text-[#1A160D] dark:text-[#F5D77A]">
                            {item.code}
                          </p>
                          <p className="text-[11px] text-[#6E6552] truncate dark:text-[#A89F8C]">
                            {item.channel} · {item.source} · {formatRelativeTime(item.copiedAt)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(item.id, item.code, `OTP ${item.code} copied`)}
                          className="rounded-lg border border-[#D4AF37]/25 px-2.5 py-1 text-[11px] font-bold text-[#8A6208] cursor-pointer dark:text-[#F5D77A]"
                        >
                          {copiedId === item.id ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </section>

          <div className="flex justify-center">
            <PWAInstallButton />
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 2: TRANSFERS (USER'S OWN HISTORY + SEND TRANSFER)    */}
      {/* ======================================================== */}
      {subTab === 'transfers' && (
        !isAuthenticated ? (
          <section className="rounded-2xl border border-[#D4AF37]/25 bg-white p-6 text-center space-y-3 dark:bg-[#14120D]">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#D4AF37]/15 text-[#D4AF37]">
              <Wallet className="h-6 w-6" />
            </div>
            <h2 className="font-display text-base font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
              Sign in to view Transfer History
            </h2>
            <p className="mx-auto max-w-sm text-xs text-[#6E6552] dark:text-[#A89F8C]">
              See transfers you sent or received and manage your Naira wallet.
            </p>
            <button
              type="button"
              onClick={onOpenAuth}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-[#D4AF37] px-5 py-2 text-xs font-black text-[#0A0906] hover:bg-[#E5C150] cursor-pointer"
            >
              <span>Get Started</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </section>
        ) : (
          <div className="space-y-4">
            {/* Compact Wallet & Send Transfer Bar */}
            <section className="rounded-2xl border border-[#D4AF37]/25 bg-white p-4 space-y-3 dark:bg-[#14120D]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold text-[#6E6552] dark:text-[#A89F8C]">
                    Available Wallet Balance
                  </p>
                  <p className="font-mono text-xl font-black text-[#8A6208] dark:text-[#F5D77A]">
                    ₦{walletBalance.toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {onOpenDeposit && (
                    <button
                      type="button"
                      onClick={onOpenDeposit}
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-[#D4AF37]/35 px-3 py-1.5 text-xs font-bold text-[#8A6208] hover:bg-[#D4AF37]/10 cursor-pointer dark:text-[#F5D77A]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Deposit</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowSendForm((prev) => !prev);
                      setTransferFeedback(null);
                    }}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#D4AF37] px-3.5 py-1.5 text-xs font-black text-[#0A0906] hover:bg-[#E5C150] cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>{showSendForm ? 'Close' : 'Send Transfer'}</span>
                  </button>
                </div>
              </div>

              {transferFeedback && (
                <div
                  className={`rounded-xl border p-2.5 text-xs font-semibold ${
                    transferFeedback.type === 'success'
                      ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-200'
                  }`}
                >
                  {transferFeedback.text}
                </div>
              )}

              {showSendForm && (
                <form onSubmit={handleTransferSubmit} className="space-y-2.5 border-t border-[#D4AF37]/15 pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="email"
                      required
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      placeholder="Recipient email"
                      className="min-h-[40px] w-full rounded-xl border border-[#D4AF37]/25 bg-[#FAF7F0] px-3 py-2 text-xs text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
                    />
                    <input
                      type="number"
                      min={50}
                      max={500000}
                      step={1}
                      required
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      placeholder="Amount (₦)"
                      className="min-h-[40px] w-full rounded-xl border border-[#D4AF37]/25 bg-[#FAF7F0] px-3 py-2 font-mono text-xs text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      maxLength={120}
                      value={transferNote}
                      onChange={(e) => setTransferNote(e.target.value)}
                      placeholder="Note (optional)"
                      className="min-h-[40px] flex-1 rounded-xl border border-[#D4AF37]/25 bg-[#FAF7F0] px-3 py-2 text-xs text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
                    />
                    <button
                      type="submit"
                      disabled={sendingTransfer || !onSendTransfer}
                      className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-[#D4AF37] px-4 py-2 text-xs font-black text-[#0A0906] hover:bg-[#E5C150] disabled:opacity-60 cursor-pointer shrink-0"
                    >
                      {sendingTransfer ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      <span>{sendingTransfer ? 'Sending...' : 'Send ₦'}</span>
                    </button>
                  </div>
                </form>
              )}
            </section>

            {/* User's Own Transfer History */}
            <section className="rounded-2xl border border-[#D4AF37]/25 bg-white p-4 space-y-3 dark:bg-[#14120D]">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-sm font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
                  Transfer History
                </h2>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-[#6E6552] dark:text-[#A89F8C]">
                    {transfers.length} records
                  </span>
                  {onRefreshTransfers && (
                    <button
                      type="button"
                      onClick={onRefreshTransfers}
                      disabled={transfersLoading}
                      aria-label="Refresh transfer history"
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#D4AF37]/30 text-[#8A6208] hover:bg-[#D4AF37]/10 cursor-pointer dark:text-[#F5D77A]"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${transfersLoading ? 'animate-spin' : ''}`}
                      />
                    </button>
                  )}
                </div>
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8A7F6A]" />
                <input
                  type="text"
                  value={transferSearch}
                  onChange={(e) => setTransferSearch(e.target.value)}
                  placeholder="Search transfers..."
                  className="h-9 w-full rounded-xl border border-[#D4AF37]/25 bg-[#FAF7F0] pl-9 pr-3 text-xs text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'sent', label: 'Sent' },
                    { id: 'received', label: 'Received' },
                    { id: 'deposit', label: 'Deposits' },
                    { id: 'debit', label: 'Spends' },
                  ] as const
                ).map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setTransferFilter(chip.id)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                      transferFilter === chip.id
                        ? 'bg-[#D4AF37] text-[#0A0906]'
                        : 'border border-[#D4AF37]/20 bg-[#FAF7F0] text-[#6E6552] hover:bg-[#D4AF37]/10 dark:bg-[#0B0A07] dark:text-[#D5CCB8]'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {transfersError && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-700 dark:text-rose-200">
                  {transfersError}
                </div>
              )}

              {transfersLoading && transfers.length === 0 ? (
                <div className="flex items-center gap-2 py-6 text-xs text-[#6E6552] dark:text-[#A89F8C]">
                  <Loader2 className="h-4 w-4 animate-spin text-[#D4AF37]" />
                  <span>Loading your transfers...</span>
                </div>
              ) : filteredTransfers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#D4AF37]/25 py-8 text-center text-xs text-[#6E6552] dark:text-[#A89F8C]">
                  {transfers.length === 0
                    ? 'No transfers recorded for your account yet.'
                    : 'No transfers match this filter.'}
                </div>
              ) : (
                <div className="divide-y divide-[#D4AF37]/15 max-h-[420px] overflow-y-auto">
                  {filteredTransfers.map((item) => {
                    const isIncoming =
                      item.direction === 'received' ||
                      item.direction === 'deposit' ||
                      item.direction === 'refund';
                    const statusBadge =
                      item.status === 'failed' || item.status === 'error'
                        ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                        : item.status === 'pending'
                          ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                          : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';

                    return (
                      <div key={item.reference} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                              isIncoming
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : 'bg-[#D4AF37]/15 text-[#8A6208] dark:text-[#F5D77A]'
                            }`}
                          >
                            {isIncoming ? (
                              <ArrowDownLeft className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-extrabold text-[#1A160D] dark:text-[#FAF6EC] truncate">
                                {item.counterpartyLabel}
                              </span>
                              <span
                                className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${statusBadge}`}
                              >
                                {item.status}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#6E6552] truncate dark:text-[#A89F8C]">
                              {formatRelativeTime(item.createdAt)} · {item.details}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p
                            className={`font-mono text-sm font-black tabular-nums ${
                              isIncoming
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-[#1A160D] dark:text-[#FAF6EC]'
                            }`}
                          >
                            {isIncoming ? '+' : '-'}₦{item.amount.toLocaleString()}
                          </p>
                          <p className="font-mono text-[10px] text-[#8A7F6A] dark:text-[#A89F8C]">
                            {item.reference.slice(-8)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )
      )}

      {/* ======================================================== */}
      {/* TAB 3: ADMIN (OWNER-ONLY — COMPACT, RIGHT INSIDE PROFILE) */}
      {/* ======================================================== */}
      {isOwnerAdmin && subTab === 'admin' && (
        <div className="space-y-4">
          {/* 1. Compact Owner Admin Console (Users Ban / Verify / Restrict) */}
          <section className="rounded-2xl border border-[#D4AF37]/30 bg-white p-4 space-y-3 dark:bg-[#14120D]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1A160D] text-[#F5D77A] border border-[#D4AF37]/40">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-display text-sm font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
                    Owner Admin Console
                  </h2>
                  <p className="text-[11px] text-[#6E6552] dark:text-[#A89F8C]">
                    {userCounts.all} signed-in · {userCounts.verified} verified ·{' '}
                    {userCounts.restricted} restricted · {userCounts.banned} banned
                  </p>
                </div>
              </div>

              {onRefreshAdminUsers && (
                <button
                  type="button"
                  onClick={onRefreshAdminUsers}
                  disabled={adminUsersLoading}
                  aria-label="Refresh users"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#D4AF37]/30 text-[#8A6208] hover:bg-[#D4AF37]/10 cursor-pointer dark:text-[#F5D77A]"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${adminUsersLoading ? 'animate-spin' : ''}`}
                  />
                </button>
              )}
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8A7F6A]" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search signed-in user email or name..."
                className="h-9 w-full rounded-xl border border-[#D4AF37]/25 bg-[#FAF7F0] pl-9 pr-3 text-xs text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
              />
            </div>

            <input
              type="text"
              maxLength={140}
              value={moderationReasonInput}
              onChange={(e) => setModerationReasonInput(e.target.value)}
              placeholder="Optional ban/restriction reason (applies to next Ban, Restrict, or Suspend)..."
              className="h-9 w-full rounded-xl border border-[#D4AF37]/20 bg-[#FAF7F0] px-3 text-xs text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
            />

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: `All (${userCounts.all})` },
                  { id: 'verified', label: `Verified (${userCounts.verified})` },
                  { id: 'restricted', label: `Restricted (${userCounts.restricted})` },
                  { id: 'banned', label: `Banned (${userCounts.banned})` },
                  ...(userCounts.suspended > 0
                    ? [{ id: 'suspended' as const, label: `Suspended (${userCounts.suspended})` }]
                    : []),
                ] as const
              ).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setUserStatusFilter(chip.id)}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                    userStatusFilter === chip.id
                      ? 'bg-[#D4AF37] text-[#0A0906]'
                      : 'border border-[#D4AF37]/20 bg-[#FAF7F0] text-[#6E6552] hover:bg-[#D4AF37]/10 dark:bg-[#0B0A07] dark:text-[#D5CCB8]'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {adminUsersError && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-2.5 font-mono text-[11px] text-rose-700 dark:text-rose-200">
                {adminUsersError}
              </div>
            )}

            {adminUsersLoading && adminUsers.length === 0 ? (
              <div className="flex items-center gap-2 py-6 text-xs text-[#6E6552] dark:text-[#A89F8C]">
                <Loader2 className="h-4 w-4 animate-spin text-[#D4AF37]" />
                <span>Loading users...</span>
              </div>
            ) : filteredAdminUsers.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#D4AF37]/25 py-6 text-center text-xs text-[#6E6552] dark:text-[#A89F8C]">
                No matching users found.
              </p>
            ) : (
              <div className="divide-y divide-[#D4AF37]/15 max-h-96 overflow-y-auto">
                {filteredAdminUsers.map((u) => {
                  const isSelf = u.email.trim().toLowerCase() === ownerEmail.trim().toLowerCase();
                  const busy = moderatingUserId === u.id;
                  return (
                    <div key={u.id} className="py-3 space-y-2">
                      {/* Action Row on Top */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {onModerateUser && !isSelf ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                onModerateUser(
                                  u.id,
                                  u.status === 'banned' ? 'restore' : 'ban',
                                  {
                                    reason: moderationReasonInput.trim() || undefined,
                                    strict: true,
                                  }
                                )
                              }
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold cursor-pointer disabled:opacity-50 ${
                                u.status === 'banned'
                                  ? 'border-rose-500 bg-rose-600 text-white'
                                  : 'border-rose-500/35 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 dark:text-rose-300'
                              }`}
                            >
                              <Ban className="h-3 w-3" />
                              <span>{u.status === 'banned' ? 'Banned (Unban)' : 'Strict Ban'}</span>
                            </button>

                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => onModerateUser(u.id, 'verify')}
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold cursor-pointer disabled:opacity-50 ${
                                u.status === 'verified'
                                  ? 'border-[#D4AF37] bg-[#D4AF37] text-[#0A0906]'
                                  : 'border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#8A6208] hover:bg-[#D4AF37]/20 dark:text-[#F5D77A]'
                              }`}
                            >
                              <UserCheck className="h-3 w-3" />
                              <span>{u.status === 'verified' ? 'Verified' : 'Verify'}</span>
                            </button>

                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                onModerateUser(
                                  u.id,
                                  u.status === 'restricted' ? 'restore' : 'restrict',
                                  { reason: moderationReasonInput.trim() || undefined }
                                )
                              }
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold cursor-pointer disabled:opacity-50 ${
                                u.status === 'restricted'
                                  ? 'border-amber-500 bg-amber-500 text-[#0A0906]'
                                  : 'border-amber-500/35 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300'
                              }`}
                            >
                              <ShieldAlert className="h-3 w-3" />
                              <span>{u.status === 'restricted' ? 'Restricted' : 'Restrict'}</span>
                            </button>

                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                onModerateUser(
                                  u.id,
                                  u.status === 'suspended' ? 'restore' : 'suspend',
                                  { reason: moderationReasonInput.trim() || undefined }
                                )
                              }
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold cursor-pointer disabled:opacity-50 ${
                                u.status === 'suspended'
                                  ? 'border-orange-500 bg-orange-500 text-white'
                                  : 'border-orange-500/35 bg-orange-500/10 text-orange-700 hover:bg-orange-500/20 dark:text-orange-300'
                              }`}
                            >
                              <PauseCircle className="h-3 w-3" />
                              <span>{u.status === 'suspended' ? 'Suspended' : 'Suspend'}</span>
                            </button>
                          </div>
                        ) : (
                          <span className="rounded-full bg-[#D4AF37] px-2.5 py-0.5 font-mono text-[10px] font-black uppercase text-[#0A0906]">
                            Owner
                          </span>
                        )}

                        <span className="text-[11px] text-[#6E6552] dark:text-[#A89F8C]">
                          {u.lastSignInAt ? formatRelativeTime(u.lastSignInAt) : 'Never'}
                        </span>
                      </div>

                      {/* Identity & Wallet Summary */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="font-mono text-xs font-extrabold text-[#1A160D] truncate dark:text-[#FAF6EC]">
                              {u.email || u.id}
                            </p>
                            {u.status === 'verified' && (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#D4AF37]" />
                            )}
                            {u.strictBanned && (
                              <span className="rounded bg-rose-500/15 px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-rose-600 dark:text-rose-300">
                                STRICT BAN
                              </span>
                            )}
                            {u.lastIp && (
                              <span className="rounded bg-[#FAF7F0] px-1.5 py-0.5 font-mono text-[9.5px] text-[#6E6552] border border-[#D4AF37]/20 dark:bg-[#0B0A07] dark:text-[#A89F8C]">
                                {u.lastIp}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#6E6552] truncate dark:text-[#A89F8C]">
                            {u.fullName || 'VeriBox User'} · {u.mailboxCount} emails
                            {u.moderationReason ? ` · ${u.moderationReason}` : ''}
                          </p>
                        </div>
                        <span className="font-mono text-xs font-black text-[#8A6208] shrink-0 dark:text-[#F5D77A]">
                          ₦{u.walletBalance.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 1b. Strict Visitor & IP / Email Blocker */}
          <section className="rounded-2xl border border-rose-500/30 bg-white p-4 space-y-3 dark:bg-[#14120D]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Ban className="h-4 w-4 text-rose-500 shrink-0" />
                <div>
                  <h2 className="font-display text-sm font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
                    Visitor &amp; IP / Email Blocker ({strictBans.length})
                  </h2>
                  <p className="text-[11px] text-[#6E6552] dark:text-[#A89F8C]">
                    Strictly block abusive visitors by IP address or email before they can use any VeriBox tool
                  </p>
                </div>
              </div>
            </div>

            {onBanVisitor && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setVisitorBanFeedback(null);
                  const cleanVal = visitorBanValue.trim();
                  if (!cleanVal) {
                    setVisitorBanFeedback({
                      type: 'error',
                      text: `Enter a valid ${visitorBanType === 'ip' ? 'IP address' : 'email address'} to block.`,
                    });
                    return;
                  }
                  const res = await onBanVisitor({
                    targetType: visitorBanType,
                    targetValue: cleanVal,
                    reason: visitorBanReason.trim() || undefined,
                  });
                  if (res.ok) {
                    setVisitorBanValue('');
                    setVisitorBanReason('');
                    setVisitorBanFeedback({
                      type: 'success',
                      text: `Blocked ${visitorBanType.toUpperCase()} "${cleanVal}" strictly.`,
                    });
                  } else {
                    setVisitorBanFeedback({
                      type: 'error',
                      text: res.error || 'Could not apply visitor ban.',
                    });
                  }
                }}
                className="space-y-2"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  {(['ip', 'email'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setVisitorBanType(t)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-bold cursor-pointer ${
                        visitorBanType === t
                          ? 'bg-rose-600 text-white'
                          : 'border border-[#D4AF37]/25 bg-[#FAF7F0] text-[#6E6552] dark:bg-[#0B0A07] dark:text-[#D5CCB8]'
                      }`}
                    >
                      {t === 'ip' ? 'Ban Visitor IP' : 'Ban Email'}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    value={visitorBanValue}
                    onChange={(e) => setVisitorBanValue(e.target.value)}
                    placeholder={
                      visitorBanType === 'ip'
                        ? 'IP address (e.g. 102.89.40.12)'
                        : 'Email address (e.g. abuser@gmail.com)'
                    }
                    className="h-9 w-full rounded-xl border border-[#D4AF37]/25 bg-[#FAF7F0] px-3 font-mono text-xs text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-rose-500 focus:outline-none dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
                  />
                  <input
                    type="text"
                    maxLength={140}
                    value={visitorBanReason}
                    onChange={(e) => setVisitorBanReason(e.target.value)}
                    placeholder="Reason (optional)"
                    className="h-9 w-full rounded-xl border border-[#D4AF37]/25 bg-[#FAF7F0] px-3 text-xs text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-rose-500 focus:outline-none dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  {visitorBanFeedback ? (
                    <span
                      className={`text-[11px] font-semibold ${
                        visitorBanFeedback.type === 'success'
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-rose-600 dark:text-rose-300'
                      }`}
                    >
                      {visitorBanFeedback.text}
                    </span>
                  ) : (
                    <span className="text-[11px] text-[#8A7F6A] dark:text-[#A89F8C]">
                      Blocks all API &amp; UI access immediately
                    </span>
                  )}
                  <button
                    type="submit"
                    disabled={banningVisitor}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-1.5 text-xs font-extrabold text-white hover:bg-rose-500 disabled:opacity-60 cursor-pointer shrink-0"
                  >
                    {banningVisitor ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Ban className="h-3.5 w-3.5" />
                    )}
                    <span>Block Visitor</span>
                  </button>
                </div>
              </form>
            )}

            {strictBans.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#D4AF37]/20 py-4 text-center text-xs text-[#6E6552] dark:text-[#A89F8C]">
                No strict email or IP bans active.
              </p>
            ) : (
              <div className="divide-y divide-[#D4AF37]/15 max-h-60 overflow-y-auto">
                {strictBans.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-rose-500/15 px-1.5 py-0.5 font-mono text-[9.5px] font-extrabold uppercase text-rose-600 dark:text-rose-300">
                          {entry.targetType}
                        </span>
                        <span className="font-mono text-xs font-bold text-[#1A160D] truncate dark:text-[#FAF6EC]">
                          {entry.targetValue}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#6E6552] truncate dark:text-[#A89F8C]">
                        {entry.reason || 'Strict ban active'} · {formatRelativeTime(entry.createdAt)}
                      </p>
                    </div>
                    {onRemoveStrictBan && (
                      <button
                        type="button"
                        onClick={() => onRemoveStrictBan(entry.id)}
                        className="rounded-lg border border-[#D4AF37]/30 px-2.5 py-1 text-[11px] font-bold text-[#8A6208] hover:bg-[#D4AF37]/10 cursor-pointer shrink-0 dark:text-[#F5D77A]"
                      >
                        Unban
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 2. Owner Transfer History (All Users) */}
          <section className="rounded-2xl border border-[#D4AF37]/30 bg-white p-4 space-y-3 dark:bg-[#14120D]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-[#D4AF37]" />
                <h2 className="font-display text-sm font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
                  Transfer History ({adminTransfers.length})
                </h2>
              </div>
              {onRefreshAdminTransfers && (
                <button
                  type="button"
                  onClick={onRefreshAdminTransfers}
                  disabled={adminTransfersLoading}
                  aria-label="Refresh all transfers"
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#D4AF37]/30 text-[#8A6208] hover:bg-[#D4AF37]/10 cursor-pointer dark:text-[#F5D77A]"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${adminTransfersLoading ? 'animate-spin' : ''}`}
                  />
                </button>
              )}
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8A7F6A]" />
              <input
                type="text"
                value={adminTransferSearch}
                onChange={(e) => setAdminTransferSearch(e.target.value)}
                placeholder="Search sender, recipient, reference, or details..."
                className="h-9 w-full rounded-xl border border-[#D4AF37]/25 bg-[#FAF7F0] pl-9 pr-3 text-xs text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'p2p_transfer', label: 'P2P' },
                  { id: 'deposit', label: 'Deposits' },
                  { id: 'debit', label: 'Spends' },
                  { id: 'refund', label: 'Refunds' },
                  { id: 'issues', label: 'Failed / Pending' },
                ] as const
              ).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setAdminTransferFilter(chip.id)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                    adminTransferFilter === chip.id
                      ? 'bg-[#D4AF37] text-[#0A0906]'
                      : 'border border-[#D4AF37]/20 bg-[#FAF7F0] text-[#6E6552] hover:bg-[#D4AF37]/10 dark:bg-[#0B0A07] dark:text-[#D5CCB8]'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {adminTransfersError && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-2.5 font-mono text-[11px] text-rose-700 dark:text-rose-200">
                {adminTransfersError}
              </div>
            )}

            {adminTransfersLoading && adminTransfers.length === 0 ? (
              <div className="flex items-center gap-2 py-5 text-xs text-[#6E6552] dark:text-[#A89F8C]">
                <Loader2 className="h-4 w-4 animate-spin text-[#D4AF37]" />
                <span>Loading transfer history...</span>
              </div>
            ) : filteredAdminTransfers.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#D4AF37]/25 py-5 text-center text-xs text-[#6E6552] dark:text-[#A89F8C]">
                {adminTransfers.length === 0
                  ? 'No wallet transfers recorded yet.'
                  : 'No transfers match this filter.'}
              </p>
            ) : (
              <div className="divide-y divide-[#D4AF37]/15 max-h-80 overflow-y-auto">
                {filteredAdminTransfers.map((tx) => {
                  const statusTone =
                    tx.status === 'failed' || tx.status === 'error'
                      ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                      : tx.status === 'pending'
                        ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                        : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
                  return (
                    <div key={tx.reference} className="py-2.5 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs font-extrabold text-[#1A160D] dark:text-[#FAF6EC] truncate">
                            {tx.senderLabel} → {tx.recipientLabel}
                          </span>
                          <span
                            className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase shrink-0 ${statusTone}`}
                          >
                            {tx.status}
                          </span>
                        </div>
                        <span className="font-mono text-xs font-black tabular-nums text-[#8A6208] shrink-0 dark:text-[#F5D77A]">
                          ₦{tx.amount.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#6E6552] dark:text-[#A89F8C]">
                        <span className="truncate">
                          {formatRelativeTime(tx.createdAt)} · {tx.details}
                        </span>
                        <span className="font-mono text-[10px]">{tx.reference.slice(-10)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 3. Compact Supabase Connection & Errors Card */}
          <section className="rounded-2xl border border-[#D4AF37]/30 bg-white p-4 space-y-3 dark:bg-[#14120D]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Database className="h-4 w-4 text-[#D4AF37] shrink-0" />
                <h2 className="font-display text-sm font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
                  Supabase Status &amp; Errors
                </h2>
                {adminDiagnostics && (
                  <span
                    className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-bold ${
                      supabaseHealthy
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    {supabaseHealthy ? 'Connected' : 'Error'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {adminDiagnostics?.supabaseProjectHost && (
                  <span className="hidden sm:inline font-mono text-[10px] text-[#6E6552] dark:text-[#A89F8C]">
                    {adminDiagnostics.supabaseProjectHost}
                  </span>
                )}
                {onRefreshAdmin && (
                  <button
                    type="button"
                    onClick={onRefreshAdmin}
                    disabled={adminLoading}
                    className="inline-flex items-center gap-1 rounded-xl border border-[#D4AF37]/35 px-2.5 py-1 text-[11px] font-bold text-[#8A6208] hover:bg-[#D4AF37]/10 cursor-pointer dark:text-[#F5D77A]"
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${adminLoading ? 'animate-spin' : ''}`}
                    />
                    <span>Check</span>
                  </button>
                )}
              </div>
            </div>

            {adminError && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-2.5 font-mono text-[11px] text-rose-700 dark:text-rose-200">
                {adminError}
              </div>
            )}

            {/* Compact Table Chips */}
            {tableProbes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tableProbes.map(({ name, probe }) => (
                  <span
                    key={name}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-mono text-[10px] font-bold ${
                      probe?.ok
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200'
                    }`}
                  >
                    {probe?.ok ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    <span>{name}</span>
                    {probe?.ok && typeof probe.rowCount === 'number' && (
                      <span className="opacity-75">({probe.rowCount})</span>
                    )}
                  </span>
                ))}
              </div>
            )}

            {/* Recent App / Database / Webhook Errors */}
            <div className="rounded-xl border border-[#D4AF37]/20 bg-[#FAF7F0] p-3 space-y-2 dark:bg-[#0B0A07]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
                  Recent Errors ({recentErrors.length})
                </span>
                {recentErrors.length > 0 && onClearAdminAlerts && (
                  <button
                    type="button"
                    onClick={onClearAdminAlerts}
                    className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer dark:text-rose-400"
                  >
                    Clear Log
                  </button>
                )}
              </div>

              {recentErrors.length === 0 ? (
                <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  No Supabase, webhook, wallet, or routing errors detected.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {recentErrors.map((errItem) => (
                    <div
                      key={errItem.id}
                      className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-2.5 py-2 text-[11px]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold uppercase text-rose-700 dark:text-rose-300">
                          {errItem.source}
                          {errItem.code ? ` · ${errItem.code}` : ''}
                        </span>
                        <span className="font-mono text-[10px] text-[#6E6552] dark:text-[#A89F8C]">
                          {formatRelativeTime(errItem.timestamp)}
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-rose-700 dark:text-rose-200 break-words">
                        {errItem.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Collapsible System Readiness Check (non-polluting: does not insert emails or fake codes) */}
            {onTestInbound && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowInboundTools((prev) => !prev)}
                  className="flex w-full items-center justify-between rounded-xl border border-[#D4AF37]/20 px-3 py-2 text-xs font-bold text-[#6E6552] hover:bg-[#D4AF37]/5 cursor-pointer dark:text-[#D5CCB8]"
                >
                  <span>System Readiness Check &amp; DNS</span>
                  {showInboundTools ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>

                {showInboundTools && (
                  <div className="mt-2.5 space-y-2.5 rounded-xl border border-[#D4AF37]/20 bg-[#FAF7F0] p-3 dark:bg-[#0B0A07]">
                    <p className="text-[11px] text-[#6E6552] dark:text-[#A89F8C]">
                      Verifies Resend API key, Svix webhook signature check, Supabase schema, custom domain routing, and DNS without creating fake codes or inserting emails.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={testAddress}
                        onChange={(e) => setTestAddress(e.target.value)}
                        placeholder={`Optional mailbox check (e.g. user@${emailDomain})`}
                        className="min-h-[36px] flex-1 rounded-lg border border-[#D4AF37]/25 bg-white px-2.5 font-mono text-xs text-[#1A160D] focus:border-[#D4AF37] focus:outline-none dark:bg-[#14120D] dark:text-[#FAF6EC]"
                      />
                      <button
                        type="button"
                        disabled={testingInbound}
                        onClick={() => onTestInbound(testAddress)}
                        className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 text-xs font-black text-[#0A0906] hover:bg-[#E5C150] disabled:opacity-60 cursor-pointer"
                      >
                        {testingInbound ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        <span>{testingInbound ? 'Checking...' : 'Check Readiness'}</span>
                      </button>
                    </div>
                    {adminTestError && (
                      <p className="font-mono text-[11px] text-rose-600 dark:text-rose-300 break-words">
                        {adminTestError}
                      </p>
                    )}
                    {adminTestResult && (
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                          <span
                            className={`rounded px-1.5 py-0.5 font-bold ${
                              adminTestResult.ready === false ||
                              (typeof adminTestResult.ready !== 'boolean' &&
                                adminTestResult.httpStatus >= 400)
                                ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            }`}
                          >
                            {adminTestResult.ready === false ? 'NOT READY' : 'READY'} · Svix Probe HTTP {adminTestResult.httpStatus || 'ERR'} · {adminTestResult.latencyMs}ms
                          </span>
                        </div>
                        {Array.isArray(adminTestResult.checks) && adminTestResult.checks.length > 0 && (
                          <div className="space-y-1">
                            {adminTestResult.checks.map((item) => (
                              <div
                                key={item.key}
                                className={`rounded-lg border px-2 py-1 font-mono text-[10px] break-words ${
                                  item.ok === true
                                    ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
                                    : item.ok === false
                                      ? 'border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-200'
                                      : 'border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-300'
                                }`}
                              >
                                <span className="font-bold">
                                  [{item.ok === true ? 'OK' : item.ok === false ? 'ERR' : 'SKIP'}] {item.label}:
                                </span>{' '}
                                {item.error || item.detail}
                              </div>
                            ))}
                          </div>
                        )}
                        {adminTestResult.dnsCheck && !adminTestResult.dnsCheck.spfOk && (
                          <div className="rounded-lg border border-rose-500/35 bg-rose-500/10 p-2.5 text-[10px] text-rose-700 dark:text-rose-200 space-y-1.5">
                            <p className="font-bold flex items-center gap-1.5">
                              <AlertTriangle className="h-3 w-3 shrink-0 text-rose-600" />
                              <span>Missing Root SPF TXT Record on Cloudflare DNS</span>
                            </p>
                            <p className="opacity-95 leading-relaxed">
                              Do <strong>NOT</strong> turn on Cloudflare Email Routing (it conflicts with Resend MX records). Instead go to <strong>Cloudflare → DNS → Records → Add TXT</strong> with Name <code className="font-mono">@</code> and Content:
                            </p>
                            <div className="flex items-center justify-between gap-2 rounded bg-white/80 px-2 py-1 font-mono dark:bg-[#14120D]">
                              <span className="font-bold select-all break-all">
                                {adminTestResult.dnsCheck.recommendedSpfRecord || recommendedSpf}
                              </span>
                              <button
                                type="button"
                                onClick={handleCopySpf}
                                className="shrink-0 rounded bg-[#D4AF37] px-2 py-0.5 text-[10px] font-extrabold text-[#0A0906] cursor-pointer"
                              >
                                {copiedSpf ? 'Copied' : 'Copy'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 4. Domain Trust (Cloudflare DNS Fix) & Gmail Two-Way Warmup */}
          <section className="rounded-2xl border border-[#D4AF37]/30 bg-white p-4 space-y-3 dark:bg-[#14120D]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#D4AF37]" />
                <h2 className="font-display text-sm font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
                  Domain Trust &amp; Two-Way Gmail Chat
                </h2>
              </div>
              {typeof adminDiagnostics?.dnsCheck?.trustScore === 'number' && (
                <span
                  className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-bold ${
                    adminDiagnostics.dnsCheck.trustScore >= 90
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                  }`}
                >
                  DNS Trust: {adminDiagnostics.dnsCheck.trustScore}/100
                </span>
              )}
            </div>

            {adminDiagnostics?.dnsCheck && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px] font-mono">
                <div className="rounded-lg border border-[#D4AF37]/20 bg-[#FAF7F0] px-2.5 py-1.5 dark:bg-[#0B0A07]">
                  <p className="text-[#6E6552] dark:text-[#A89F8C]">Resend MX</p>
                  <p className={adminDiagnostics.dnsCheck.mxOk ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'font-bold text-rose-600'}>
                    {adminDiagnostics.dnsCheck.mxOk ? 'Active' : 'Missing'}
                  </p>
                </div>
                <div className="rounded-lg border border-[#D4AF37]/20 bg-[#FAF7F0] px-2.5 py-1.5 dark:bg-[#0B0A07]">
                  <p className="text-[#6E6552] dark:text-[#A89F8C]">Root SPF (@)</p>
                  <p className={adminDiagnostics.dnsCheck.spfOk ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'font-bold text-rose-600'}>
                    {adminDiagnostics.dnsCheck.spfOk ? 'Valid' : 'Missing'}
                  </p>
                </div>
                <div className="rounded-lg border border-[#D4AF37]/20 bg-[#FAF7F0] px-2.5 py-1.5 dark:bg-[#0B0A07]">
                  <p className="text-[#6E6552] dark:text-[#A89F8C]">Resend DKIM</p>
                  <p className={adminDiagnostics.dnsCheck.dkimOk ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'font-bold text-amber-600'}>
                    {adminDiagnostics.dnsCheck.dkimOk ? 'Verified' : 'Pending'}
                  </p>
                </div>
                <div className="rounded-lg border border-[#D4AF37]/20 bg-[#FAF7F0] px-2.5 py-1.5 dark:bg-[#0B0A07]">
                  <p className="text-[#6E6552] dark:text-[#A89F8C]">DMARC</p>
                  <p className={adminDiagnostics.dnsCheck.dmarcOk ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'font-bold text-amber-600'}>
                    {adminDiagnostics.dnsCheck.dmarcOk ? 'Configured' : 'Missing'}
                  </p>
                </div>
              </div>
            )}

            {adminDiagnostics?.dnsCheck && !adminDiagnostics.dnsCheck.spfOk && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-[11px] text-rose-800 dark:text-rose-200 space-y-2">
                <p className="font-extrabold flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                  <span>Cloudflare Fix: Add Root SPF in DNS → Records (Not Email Routing)</span>
                </p>
                <p className="leading-relaxed">
                  Cloudflare Email Routing fails with <em>&quot;Existing non-Cloudflare MX records conflict&quot;</em> because Resend already owns your MX records. Leave Email Routing turned OFF and open <strong>Cloudflare → DNS → Records → Add record</strong> (Type: <strong>TXT</strong>, Name: <strong>@</strong>):
                </p>
                <div className="flex items-center justify-between gap-2 rounded-lg border border-rose-500/25 bg-white/90 px-2.5 py-1.5 font-mono dark:bg-[#0B0A07]">
                  <span className="font-bold text-[#1A160D] dark:text-[#F5D77A] select-all break-all">
                    {recommendedSpf}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopySpf}
                    className="inline-flex items-center gap-1 shrink-0 rounded-md bg-[#D4AF37] px-2.5 py-1 text-[10px] font-extrabold text-[#0A0906] hover:bg-[#E5C150] cursor-pointer"
                  >
                    {copiedSpf ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedSpf ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            )}

            {onSendEmail && (
              <div className="rounded-xl border border-[#D4AF37]/20 bg-[#FAF7F0] p-3 space-y-2 dark:bg-[#0B0A07]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
                    Send Warmup Email to Gmail (Real Resend Outbound)
                  </span>
                  <span className="font-mono text-[10px] text-[#6E6552] dark:text-[#A89F8C]">
                    Two-way reply enabled
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="email"
                    value={warmupFrom}
                    onChange={(e) => setWarmupFrom(e.target.value)}
                    placeholder={`From (@${emailDomain})`}
                    className="h-9 rounded-lg border border-[#D4AF37]/25 bg-white px-2.5 font-mono text-xs text-[#1A160D] focus:border-[#D4AF37] focus:outline-none dark:bg-[#14120D] dark:text-[#FAF6EC]"
                  />
                  <input
                    type="email"
                    value={warmupTo}
                    onChange={(e) => setWarmupTo(e.target.value)}
                    placeholder="Recipient Gmail (e.g. name@gmail.com)"
                    className="h-9 rounded-lg border border-[#D4AF37]/25 bg-white px-2.5 font-mono text-xs text-[#1A160D] focus:border-[#D4AF37] focus:outline-none dark:bg-[#14120D] dark:text-[#FAF6EC]"
                  />
                </div>
                <input
                  type="text"
                  value={warmupSubject}
                  onChange={(e) => setWarmupSubject(e.target.value)}
                  placeholder="Subject"
                  className="h-9 w-full rounded-lg border border-[#D4AF37]/25 bg-white px-2.5 text-xs text-[#1A160D] focus:border-[#D4AF37] focus:outline-none dark:bg-[#14120D] dark:text-[#FAF6EC]"
                />
                <textarea
                  rows={2}
                  value={warmupText}
                  onChange={(e) => setWarmupText(e.target.value)}
                  placeholder="Write a conversational message to Gmail..."
                  className="w-full rounded-lg border border-[#D4AF37]/25 bg-white p-2.5 text-xs text-[#1A160D] focus:border-[#D4AF37] focus:outline-none dark:bg-[#14120D] dark:text-[#FAF6EC]"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={warmupSending}
                    onClick={() => void handleSendWarmup()}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 text-xs font-extrabold text-[#0A0906] hover:bg-[#E5C150] disabled:opacity-60 cursor-pointer"
                  >
                    {warmupSending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    <span>{warmupSending ? 'Sending...' : 'Send to Gmail'}</span>
                  </button>
                  {warmupStatus && (
                    <p
                      className={`text-[11px] font-semibold ${
                        warmupStatus.ok
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-rose-600 dark:text-rose-300'
                      }`}
                    >
                      {warmupStatus.text}
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Clean Bottom Action Bar (like reference screenshots) */}
      <div className="flex items-center gap-2.5 pt-1">
        {isAuthenticated ? (
          <>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-2xl border border-[#D4AF37]/30 bg-white px-4 py-2 text-xs font-extrabold text-rose-600 transition-colors hover:bg-rose-500/10 cursor-pointer dark:bg-[#14120D] dark:text-rose-400"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
            <button
              type="button"
              onClick={onBackToHome}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl bg-[#1A160D] px-4 py-2 text-xs font-extrabold text-[#F5D77A] transition-colors hover:bg-[#2A2418] cursor-pointer dark:bg-[#D4AF37] dark:text-[#0A0906] dark:hover:bg-[#E5C150]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Home</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onOpenAuth}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl bg-[#D4AF37] px-4 py-2 text-xs font-black text-[#0A0906] hover:bg-[#E5C150] cursor-pointer"
          >
            <span>Get Started</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
