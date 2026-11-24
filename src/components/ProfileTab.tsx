import { useState } from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  LogOut,
  Mail,
  MailPlus,
  MessageSquareText,
  Moon,
  ShieldCheck,
  Sun,
  Trash2,
  User,
} from 'lucide-react';
import type { CopiedOtpRecord, PhoneNumberEntry, TempEmailAccount } from '../types';
import { formatRelativeTime } from '../utils/clipboard';
import { PWAInstallButton } from './PWAInstallButton';

interface ProfileTabProps {
  isAuthenticated: boolean;
  userEmail?: string | null;
  userName?: string | null;
  avatarUrl?: string | null;
  activeEmail: TempEmailAccount | null;
  savedEmails: TempEmailAccount[];
  savedNumbers: PhoneNumberEntry[];
  otpHistory: CopiedOtpRecord[];
  autoRefresh: boolean;
  isDark: boolean;
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
}

export function ProfileTab({
  isAuthenticated,
  userEmail,
  userName,
  avatarUrl,
  activeEmail,
  savedEmails,
  savedNumbers,
  otpHistory,
  autoRefresh,
  isDark,
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
}: ProfileTabProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (id: string, value: string, label: string) => {
    onCopyText(value, label);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
  };

  return (
    <div className="space-y-6">
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
              <h1 className="font-display text-xl font-extrabold text-[#1A160D] truncate dark:text-[#FAF6EC]">
                {isAuthenticated
                  ? userName || userEmail || 'Your Verification Profile'
                  : 'Guest Preview Profile'}
              </h1>
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
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2 text-xs font-bold text-[#0A0906] transition-colors hover:bg-[#E5C150] whitespace-nowrap"
                >
                  <MailPlus className="h-4 w-4" />
                  <span>Create Email</span>
                </button>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rose-500/35 px-3.5 py-2 text-xs font-bold text-rose-600 transition-colors hover:bg-rose-500/10 whitespace-nowrap dark:text-rose-400"
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
                        {isActive ? 'Active inbox' : `Created ${formatRelativeTime(acct.createdAt)}`}
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
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#D4AF37] px-3 py-1.5 text-xs font-bold text-[#0A0906] hover:bg-[#E5C150]"
                    >
                      <MessageSquareText className="h-3.5 w-3.5" />
                      <span>Read SMS</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(entry.digits, entry.number, 'Number copied')}
                      aria-label="Copy phone number"
                      className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-[#D4AF37]/25 text-[#6E6552] hover:bg-[#D4AF37]/10 dark:text-[#D5CCB8]"
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
                      className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-[#D4AF37]/25 text-[#6E6552] hover:border-rose-400 hover:text-rose-500 dark:text-[#A89F8C]"
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
                className="text-xs font-bold text-[#6E6552] hover:text-rose-500 dark:text-[#A89F8C]"
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
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[#D4AF37]/30 px-3 py-1.5 text-xs font-bold text-[#4F4736] hover:bg-[#D4AF37]/10 dark:text-[#F5D77A]"
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
    </div>
  );
}
