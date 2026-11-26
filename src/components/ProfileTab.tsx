import { useMemo, useState, type FormEvent } from 'react';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  Loader2,
  LogOut,
  Mail,
  MailPlus,
  MessageSquareText,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sun,
  Trash2,
  User,
  Wallet,
} from 'lucide-react';
import type {
  CopiedOtpRecord,
  PhoneNumberEntry,
  TempEmailAccount,
  WalletTransferRecord,
} from '../types';
import { formatRelativeTime } from '../utils/clipboard';
import { PWAInstallButton } from './PWAInstallButton';

interface ProfileTabProps {
  isAuthenticated: boolean;
  isOwnerAdmin?: boolean;
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
  onRefreshTransfers?: () => void;
  onSendTransfer?: (payload: {
    recipientEmail: string;
    amount: number;
    note?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onOpenAdmin?: () => void;
  onOpenDeposit?: () => void;
}

type ProfileSubTab = 'account' | 'transfers';
type UserTransferFilter = 'all' | 'sent' | 'received' | 'deposit' | 'debit';

export function ProfileTab({
  isAuthenticated,
  isOwnerAdmin = false,
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
  onRefreshTransfers,
  onSendTransfer,
  onOpenAdmin,
  onOpenDeposit,
}: ProfileTabProps) {
  const [subTab, setSubTab] = useState<ProfileSubTab>('account');
  const [confirmClear, setConfirmClear] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // User Transfer History filters & P2P send form
  const [transferSearch, setTransferSearch] = useState('');
  const [transferFilter, setTransferFilter] = useState<UserTransferFilter>('all');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [sendingTransfer, setSendingTransfer] = useState(false);
  const [transferFeedback, setTransferFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

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

  return (
    <div className="space-y-5">
      {/* Segmented Profile Navigation: Account | Transfers | (Owner-only) Admin */}
      <nav
        aria-label="Profile sections"
        className="flex items-center gap-1 rounded-2xl border border-[#D4AF37]/25 bg-white p-1.5 dark:bg-[#14120D]"
      >
        <button
          type="button"
          onClick={() => setSubTab('account')}
          className={`flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-extrabold transition-colors cursor-pointer ${
            subTab === 'account'
              ? 'bg-[#D4AF37] text-[#0A0906] shadow-sm'
              : 'text-[#6E6552] hover:bg-[#D4AF37]/10 dark:text-[#D5CCB8]'
          }`}
        >
          <User className="h-3.5 w-3.5 shrink-0" />
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
          className={`flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-extrabold transition-colors cursor-pointer ${
            subTab === 'transfers'
              ? 'bg-[#D4AF37] text-[#0A0906] shadow-sm'
              : 'text-[#6E6552] hover:bg-[#D4AF37]/10 dark:text-[#D5CCB8]'
          }`}
        >
          <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" />
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

        {isOwnerAdmin && onOpenAdmin && (
          <button
            type="button"
            onClick={onOpenAdmin}
            className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold text-[#8A6208] transition-colors hover:bg-[#D4AF37]/15 cursor-pointer dark:text-[#F5D77A]"
          >
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            <span>Admin</span>
          </button>
        )}
      </nav>

      {/* Profile Summary Header */}
      <section className="rounded-2xl border border-[#D4AF37]/30 bg-white p-5 dark:bg-[#14120D]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#D4AF37]/50 bg-[#D4AF37] text-[#0A0906]">
              {isAuthenticated && avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={userName || 'User avatar'}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <User className="h-6 w-6" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-xl font-extrabold text-[#1A160D] truncate dark:text-[#FAF6EC]">
                  {isAuthenticated
                    ? userName || userEmail || 'Your Verification Profile'
                    : 'Guest Preview Profile'}
                </h1>
                {isOwnerAdmin && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-[#D4AF37] px-2 py-0.5 font-mono text-[10px] font-black uppercase text-[#0A0906]">
                    <ShieldCheck className="h-3 w-3" />
                    <span>Owner</span>
                  </span>
                )}
              </div>
              {isAuthenticated && userEmail ? (
                <p className="font-mono text-xs text-[#8A6208] truncate dark:text-[#F5D77A]">
                  {userEmail}
                </p>
              ) : null}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#6E6552] tabular-nums dark:text-[#A89F8C]">
                <span>{savedEmails.length} emails</span>
                <span aria-hidden="true">·</span>
                <span>{savedNumbers.length} saved numbers</span>
                <span aria-hidden="true">·</span>
                <span>{otpHistory.length} copied codes</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <PWAInstallButton />
            {isAuthenticated ? (
              <>
                <button
                  type="button"
                  onClick={onCreateEmail}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2 text-xs font-bold text-[#0A0906] transition-colors hover:bg-[#E5C150] whitespace-nowrap cursor-pointer"
                >
                  <MailPlus className="h-4 w-4" />
                  <span>Create Email</span>
                </button>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rose-500/35 px-3.5 py-2 text-xs font-bold text-rose-600 transition-colors hover:bg-rose-500/10 whitespace-nowrap cursor-pointer dark:text-rose-400"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign Out</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onOpenAuth}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2 text-xs font-black text-[#0A0906] transition-colors hover:bg-[#E5C150] whitespace-nowrap cursor-pointer"
              >
                <span>Get Started</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </section>

      {subTab === 'transfers' ? (
        !isAuthenticated ? (
          <section className="rounded-2xl border border-[#D4AF37]/25 bg-white p-6 text-center space-y-3 dark:bg-[#14120D]">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#D4AF37]/15 text-[#D4AF37]">
              <Wallet className="h-6 w-6" />
            </div>
            <h2 className="font-display text-base font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
              Sign in to view your Transfer History
            </h2>
            <p className="mx-auto max-w-md text-xs leading-relaxed text-[#6E6552] dark:text-[#A89F8C]">
              Your private Naira wallet transfers, deposits, and purchases are linked to your signed-in account.
            </p>
            <button
              type="button"
              onClick={onOpenAuth}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-[#D4AF37] px-5 py-2 text-xs font-black text-[#0A0906] hover:bg-[#E5C150] cursor-pointer"
            >
              <span>Sign In / Get Started</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </section>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
            {/* Send Naira Transfer */}
            <section className="rounded-2xl border border-[#D4AF37]/25 bg-white p-5 space-y-4 lg:col-span-5 dark:bg-[#14120D]">
              <div className="flex items-center justify-between gap-2 border-b border-[#D4AF37]/15 pb-3">
                <div>
                  <h2 className="font-display text-base font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                    Send Naira Transfer
                  </h2>
                  <p className="text-xs text-[#6E6552] dark:text-[#A89F8C]">
                    Available balance:{' '}
                    <span className="font-mono font-extrabold text-[#8A6208] dark:text-[#F5D77A]">
                      ₦{walletBalance.toLocaleString()}
                    </span>
                  </p>
                </div>
                {onOpenDeposit && (
                  <button
                    type="button"
                    onClick={onOpenDeposit}
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 py-1 text-xs font-bold text-[#8A6208] hover:bg-[#D4AF37]/20 cursor-pointer dark:text-[#F5D77A]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Fund</span>
                  </button>
                )}
              </div>

              <form onSubmit={handleTransferSubmit} className="space-y-3">
                <div>
                  <label
                    htmlFor="transfer-recipient-email"
                    className="mb-1 block text-xs font-bold text-[#4F4736] dark:text-[#D5CCB8]"
                  >
                    Recipient Email
                  </label>
                  <input
                    id="transfer-recipient-email"
                    type="email"
                    required
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder="friend@gmail.com"
                    className="min-h-[42px] w-full rounded-xl border border-[#D4AF37]/25 bg-[#FAF7F0] px-3 py-2 text-xs text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="transfer-amount"
                    className="mb-1 block text-xs font-bold text-[#4F4736] dark:text-[#D5CCB8]"
                  >
                    Amount (₦)
                  </label>
                  <input
                    id="transfer-amount"
                    type="number"
                    min={50}
                    max={500000}
                    step={1}
                    required
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    placeholder="500"
                    className="min-h-[42px] w-full rounded-xl border border-[#D4AF37]/25 bg-[#FAF7F0] px-3 py-2 font-mono text-xs text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="transfer-note"
                    className="mb-1 block text-xs font-bold text-[#4F4736] dark:text-[#D5CCB8]"
                  >
                    Note (optional)
                  </label>
                  <input
                    id="transfer-note"
                    type="text"
                    maxLength={120}
                    value={transferNote}
                    onChange={(e) => setTransferNote(e.target.value)}
                    placeholder="For number verification or split bill"
                    className="min-h-[42px] w-full rounded-xl border border-[#D4AF37]/25 bg-[#FAF7F0] px-3 py-2 text-xs text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
                  />
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

                <button
                  type="submit"
                  disabled={sendingTransfer || !onSendTransfer}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2 text-xs font-black text-[#0A0906] transition-colors hover:bg-[#E5C150] disabled:opacity-60 cursor-pointer"
                >
                  {sendingTransfer ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  <span>{sendingTransfer ? 'Sending...' : 'Send Naira Transfer'}</span>
                </button>
              </form>
            </section>

            {/* User's Own Transfer History */}
            <section className="rounded-2xl border border-[#D4AF37]/25 bg-white p-5 space-y-3 lg:col-span-7 dark:bg-[#14120D]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D4AF37]/15 pb-3">
                <div>
                  <h2 className="font-display text-base font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                    My Transfer History ({transfers.length})
                  </h2>
                  <p className="text-xs text-[#6E6552] dark:text-[#A89F8C]">
                    Only transfers and wallet activity sent or received by your account
                  </p>
                </div>
                {onRefreshTransfers && (
                  <button
                    type="button"
                    onClick={onRefreshTransfers}
                    disabled={transfersLoading}
                    className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-[#D4AF37]/35 px-3 py-1 text-xs font-bold text-[#8A6208] hover:bg-[#D4AF37]/10 disabled:opacity-50 cursor-pointer dark:text-[#F5D77A]"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${transfersLoading ? 'animate-spin' : ''}`}
                    />
                    <span>{transfersLoading ? 'Loading...' : 'Refresh'}</span>
                  </button>
                )}
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8A7F6A]" />
                <input
                  type="text"
                  value={transferSearch}
                  onChange={(e) => setTransferSearch(e.target.value)}
                  placeholder="Search by email, details, or reference..."
                  className="h-10 w-full rounded-xl border border-[#D4AF37]/25 bg-[#FAF7F0] pl-9 pr-3 text-xs text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
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
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-200">
                  {transfersError}
                </div>
              )}

              {transfersLoading && transfers.length === 0 ? (
                <div className="flex items-center gap-2 py-8 text-xs text-[#6E6552] dark:text-[#A89F8C]">
                  <Loader2 className="h-4 w-4 animate-spin text-[#D4AF37]" />
                  <span>Loading your transfer history...</span>
                </div>
              ) : filteredTransfers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#D4AF37]/25 py-10 text-center text-xs text-[#6E6552] dark:text-[#A89F8C]">
                  {transfers.length === 0
                    ? 'No wallet transfers or transactions recorded yet.'
                    : 'No transfers match your current search or filter.'}
                </div>
              ) : (
                <div className="divide-y divide-[#D4AF37]/15 max-h-[480px] overflow-y-auto">
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
                          : isIncoming
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'bg-[#D4AF37]/15 text-[#8A6208] dark:text-[#F5D77A]';

                    return (
                      <div key={item.reference} className="flex items-start justify-between gap-3 py-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div
                            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                              isIncoming
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : 'bg-[#D4AF37]/15 text-[#8A6208] dark:text-[#F5D77A]'
                            }`}
                          >
                            {isIncoming ? (
                              <ArrowDownLeft className="h-4 w-4" />
                            ) : (
                              <ArrowUpRight className="h-4 w-4" />
                            )}
                          </div>
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="text-xs font-extrabold text-[#1A160D] dark:text-[#FAF6EC] truncate">
                                {item.counterpartyLabel}
                              </p>
                              <span
                                className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${statusBadge}`}
                              >
                                {item.status}
                              </span>
                            </div>
                            <p className="text-xs text-[#4F4736] dark:text-[#D5CCB8] break-words">
                              {item.details}
                            </p>
                            <p className="font-mono text-[10px] text-[#8A7F6A] dark:text-[#A89F8C] break-all">
                              {item.senderLabel} → {item.recipientLabel}
                            </p>
                            <p className="font-mono text-[10px] text-[#8A7F6A] dark:text-[#A89F8C]">
                              {formatRelativeTime(item.createdAt)} · Ref: {item.reference}
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
                          <p className="font-mono text-[10px] uppercase text-[#8A7F6A] dark:text-[#A89F8C]">
                            {item.direction}
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
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
            {/* Saved Emails (Read/Switch/Copy only — deletion is managed on Home) */}
            <section className="rounded-2xl border border-[#D4AF37]/20 bg-white p-5 lg:col-span-6 dark:bg-[#14120D]">
              <div className="flex items-center justify-between border-b border-[#D4AF37]/15 pb-3">
                <h2 className="font-display text-base font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                  Created Emails
                </h2>
                <span className="text-[11px] font-medium text-[#6E6552] dark:text-[#A89F8C]">
                  Manage or delete on Home
                </span>
              </div>

              {savedEmails.length === 0 ? (
                <div className="py-10 text-center text-sm text-[#6E6552] dark:text-[#A89F8C]">
                  No created emails yet. Tap Create Email above to start.
                </div>
              ) : (
                <div className="mt-3 space-y-2.5">
                  {savedEmails.map((acct) => {
                    const isActive = activeEmail?.address === acct.address;
                    return (
                      <div
                        key={acct.address}
                        className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 ${
                          isActive
                            ? 'border-[#D4AF37] bg-[#D4AF37]/10'
                            : 'border-[#D4AF37]/20'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-xs sm:text-sm font-bold text-[#1A160D] truncate dark:text-[#FAF6EC]">
                            {acct.address}
                          </p>
                          <p className="mt-0.5 text-xs text-[#6E6552] dark:text-[#A89F8C]">
                            {isActive
                              ? 'Active inbox'
                              : `Created ${formatRelativeTime(acct.createdAt)}`}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onSelectEmail(acct)}
                            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-xs font-bold text-[#0A0906] hover:bg-[#E5C150] cursor-pointer"
                          >
                            <Mail className="h-3.5 w-3.5" />
                            <span>{isActive ? 'Open Inbox' : 'Receive Here'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopy(acct.address, acct.address, 'Email copied')}
                            aria-label="Copy email"
                            className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-[#D4AF37]/25 text-[#6E6552] hover:bg-[#D4AF37]/10 cursor-pointer dark:text-[#D5CCB8]"
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
                  })}
                </div>
              )}
            </section>

            {/* Saved Numbers */}
            <section className="rounded-2xl border border-[#D4AF37]/20 bg-white p-5 lg:col-span-6 dark:bg-[#14120D]">
              <div className="flex items-center justify-between border-b border-[#D4AF37]/15 pb-3">
                <h2 className="font-display text-base font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                  Saved Phone Numbers
                </h2>
                <span className="text-xs text-[#6E6552] tabular-nums dark:text-[#A89F8C]">
                  {savedNumbers.length} saved
                </span>
              </div>

              {savedNumbers.length === 0 ? (
                <div className="py-10 text-center text-sm text-[#6E6552] dark:text-[#A89F8C]">
                  Bookmark any phone number in SMS or Numbers to keep it here.
                </div>
              ) : (
                <div className="mt-3 space-y-2.5">
                  {savedNumbers.map((entry) => (
                    <div
                      key={entry.digits}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#D4AF37]/20 p-3"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                          {entry.number}
                        </p>
                        <p className="text-xs text-[#6E6552] dark:text-[#A89F8C]">
                          {entry.country} · {entry.platform}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenSmsNumber(entry)}
                          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-xs font-bold text-[#0A0906] hover:bg-[#E5C150] cursor-pointer"
                        >
                          <MessageSquareText className="h-3.5 w-3.5" />
                          <span>Read SMS</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(entry.digits, entry.number, 'Number copied')}
                          aria-label="Copy phone number"
                          className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-[#D4AF37]/25 text-[#6E6552] hover:bg-[#D4AF37]/10 cursor-pointer dark:text-[#D5CCB8]"
                        >
                          {copiedId === entry.digits ? (
                            <Check className="h-3.5 w-3.5 text-[#D4AF37]" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveSavedNumber(entry.digits)}
                          aria-label="Remove saved number"
                          className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-[#D4AF37]/25 text-[#6E6552] hover:border-rose-400 hover:text-rose-500 cursor-pointer dark:text-[#A89F8C]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Recent Copied OTP Codes + Preferences */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
            <section className="rounded-2xl border border-[#D4AF37]/20 bg-white p-5 lg:col-span-7 dark:bg-[#14120D]">
              <div className="flex items-center justify-between border-b border-[#D4AF37]/15 pb-3">
                <h2 className="font-display text-base font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                  Recent Copied OTP Codes
                </h2>
                {otpHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearHistory}
                    className="text-xs font-bold text-[#6E6552] hover:text-rose-500 cursor-pointer dark:text-[#A89F8C]"
                  >
                    Clear Log
                  </button>
                )}
              </div>

              {otpHistory.length === 0 ? (
                <div className="py-8 text-center text-sm text-[#6E6552] dark:text-[#A89F8C]">
                  Codes you copy from SMS or Email will appear here for quick reuse.
                </div>
              ) : (
                <div className="mt-3 divide-y divide-[#D4AF37]/15">
                  {otpHistory.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="font-mono text-base font-bold tracking-wider text-[#1A160D] dark:text-[#F5D77A]">
                          {item.code}
                        </p>
                        <p className="text-xs text-[#6E6552] truncate dark:text-[#A89F8C]">
                          {item.channel} · {item.source} · {formatRelativeTime(item.copiedAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(item.id, item.code, `OTP ${item.code} copied`)}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[#D4AF37]/30 px-3 py-1.5 text-xs font-bold text-[#4F4736] hover:bg-[#D4AF37]/10 cursor-pointer dark:text-[#F5D77A]"
                      >
                        {copiedId === item.id ? (
                          <Check className="h-3.5 w-3.5 text-[#D4AF37]" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span>Copy</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-[#D4AF37]/20 bg-white p-5 lg:col-span-5 dark:bg-[#14120D]">
              <div className="flex items-center justify-between border-b border-[#D4AF37]/15 pb-3">
                <h2 className="font-display text-base font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                  Account &amp; App Settings
                </h2>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#8A6208] dark:text-[#F5D77A]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>{isAuthenticated ? 'Verified' : 'Preview'}</span>
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoRefresh}
                  onClick={onToggleAutoRefresh}
                  className="flex min-h-[54px] w-full items-center justify-between gap-3 rounded-xl border border-[#D4AF37]/20 px-4 py-3 text-left transition-colors hover:bg-[#D4AF37]/10 cursor-pointer"
                >
                  <div>
                    <p className="text-sm font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                      Auto-Refresh Inboxes
                    </p>
                    <p className="text-xs text-[#6E6552] dark:text-[#A89F8C]">
                      Real-time SMS stream and live Email polling
                    </p>
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

                <button
                  type="button"
                  role="switch"
                  aria-checked={isDark}
                  onClick={onToggleTheme}
                  className="flex min-h-[54px] w-full items-center justify-between gap-3 rounded-xl border border-[#D4AF37]/20 px-4 py-3 text-left transition-colors hover:bg-[#D4AF37]/10 cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#D4AF37]/15">
                      {isDark ? (
                        <Moon className="h-4 w-4 text-[#F5D77A]" />
                      ) : (
                        <Sun className="h-4 w-4 text-[#8A6208]" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                        {isDark ? 'Obsidian Gold Theme' : 'Warm Ivory Theme'}
                      </p>
                      <p className="text-xs text-[#6E6552] dark:text-[#A89F8C]">
                        Switch between dark &amp; light mode
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

                <div className="rounded-xl border border-[#D4AF37]/20 bg-[#FAF7F0] p-3.5 text-xs dark:bg-[#0B0A07]">
                  <p className="font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                    Email Deletion &amp; Password Recovery
                  </p>
                  <p className="mt-1 leading-relaxed text-[#6E6552] dark:text-[#A89F8C]">
                    Emails are managed and deleted exclusively from the <strong>Home</strong> tab. Deleted addresses can be recovered anytime in <strong>Create → VeriBox Mail</strong> using their password.
                  </p>
                </div>

                {confirmClear ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
                    <span className="text-xs font-semibold text-rose-700 dark:text-rose-200">
                      Clear OTP history?
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmClear(false)}
                        className="min-h-[36px] rounded-lg px-2.5 text-xs font-bold text-[#4F4736] dark:text-[#D5CCB8]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onClearHistory();
                          setConfirmClear(false);
                        }}
                        className="min-h-[36px] rounded-lg bg-rose-600 px-3 text-xs font-bold text-white cursor-pointer"
                      >
                        Confirm
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClear(true)}
                    className="flex min-h-[48px] w-full items-center justify-between rounded-xl border border-[#D4AF37]/20 px-4 py-3 text-left text-sm font-bold text-rose-600 transition-colors hover:bg-rose-500/10 cursor-pointer dark:text-rose-400"
                  >
                    <span>Clear Copied OTP Log</span>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
