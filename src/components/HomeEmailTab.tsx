import { useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Inbox,
  MailPlus,
  Phone,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type { EmailMessageDetail, EmailMessageSummary, TempEmailAccount } from '../types';
import { formatRelativeTime } from '../utils/clipboard';

interface HomeEmailTabProps {
  activeEmail: TempEmailAccount | null;
  savedEmails: TempEmailAccount[];
  messages: EmailMessageSummary[];
  selectedMessage: EmailMessageDetail | null;
  loadingMessages: boolean;
  loadingDetail: boolean;
  emailError: string | null;
  countdown: number;
  autoRefresh: boolean;
  onGoToCreate: () => void;
  onGoToNumbers: () => void;
  onSelectAccount: (account: TempEmailAccount) => void;
  onDeleteAccount: (address: string) => void;
  onRefreshInbox: () => void;
  onOpenMessage: (id: string) => void;
  onCloseMessage: () => void;
  onDeleteMessage: (id: string) => void;
  onCopyText: (
    value: string,
    label: string,
    otpMeta?: { source: string; channel: 'SMS' | 'Email' }
  ) => void;
}

function providerName(mode?: string): string {
  const modeTag =
    mode === 'business' ? ' · Business' : mode === 'privacy' ? ' · Privacy' : ' · Personal';
  return `VeriBox Mail · @veribox.name.ng${modeTag}`;
}

export function HomeEmailTab({
  activeEmail,
  savedEmails,
  messages,
  selectedMessage,
  loadingMessages,
  loadingDetail,
  emailError,
  countdown,
  autoRefresh,
  onGoToCreate,
  onGoToNumbers,
  onSelectAccount,
  onDeleteAccount,
  onRefreshInbox,
  onOpenMessage,
  onCloseMessage,
  onDeleteMessage,
  onCopyText,
}: HomeEmailTabProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [confirmDeleteAddress, setConfirmDeleteAddress] = useState<string | null>(null);

  const handleCopy = (key: string, value: string, label: string, otpSource?: string) => {
    onCopyText(value, label, otpSource ? { source: otpSource, channel: 'Email' } : undefined);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1600);
  };

  return (
    <div className="space-y-4">
      {/* Top Card: Your Active Email + Switch Created Emails */}
      <section className="rounded-2xl border border-[#D4AF37]/30 bg-white p-4 sm:p-5 dark:bg-[#14120D]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-[#8A6208] dark:text-[#D4AF37]">
              Home · @veribox.name.ng Mail
            </p>
            <h1 className="mt-0.5 font-display text-base sm:text-lg font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
              Receive Codes &amp; Emails Here
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onGoToNumbers}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#D4AF37]/30 px-3 py-1.5 text-xs font-bold text-[#4F4736] hover:bg-[#D4AF37]/10 whitespace-nowrap cursor-pointer dark:text-[#F5D77A]"
            >
              <Phone className="h-3.5 w-3.5" />
              <span>Numbers</span>
            </button>
            <button
              type="button"
              onClick={onGoToCreate}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#D4AF37] px-3.5 py-1.5 text-xs font-bold text-[#0A0906] hover:bg-[#E5C150] whitespace-nowrap cursor-pointer"
            >
              <MailPlus className="h-3.5 w-3.5" />
              <span>Create Email</span>
            </button>
          </div>
        </div>

        {activeEmail ? (
          <div className="mt-3.5 rounded-xl border border-[#D4AF37]/25 bg-[#FAF7F0] p-3.5 dark:bg-[#0B0A07]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm sm:text-base font-bold text-[#1A160D] dark:text-[#F5D77A]">
                  {activeEmail.address}
                </p>
                <p className="mt-1 text-xs text-[#6E6552] dark:text-[#A89F8C]">
                  {providerName(activeEmail.accountMode)} · Created{' '}
                  {formatRelativeTime(activeEmail.createdAt)}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    handleCopy('active-email', activeEmail.address, 'Email address copied')
                  }
                  className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2 text-xs font-bold text-[#0A0906] hover:bg-[#E5C150] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedKey === 'active-email' ? (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      <span>Copy Email</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setConfirmDeleteAddress((prev) =>
                      prev === activeEmail.address ? null : activeEmail.address
                    )
                  }
                  aria-label="Delete active email"
                  title="Delete email from Home"
                  className="flex min-h-[42px] min-w-[42px] items-center justify-center rounded-xl border border-rose-500/30 text-rose-600 transition-colors hover:bg-rose-500/10 cursor-pointer dark:text-rose-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {confirmDeleteAddress === activeEmail.address && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-rose-700 dark:text-rose-200">
                    Delete {activeEmail.address} from Home?
                  </p>
                  <p className="text-[11px] text-rose-600/85 dark:text-rose-200/80">
                    You can recover it anytime in Create using its password.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteAddress(null)}
                    className="min-h-[34px] rounded-lg px-2.5 text-xs font-bold text-[#4F4736] hover:bg-black/5 dark:text-[#D5CCB8]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const targetAddr = activeEmail.address;
                      setConfirmDeleteAddress(null);
                      onDeleteAccount(targetAddr);
                    }}
                    className="min-h-[34px] rounded-lg bg-rose-600 px-3 text-xs font-bold text-white hover:bg-rose-500 cursor-pointer"
                  >
                    Delete Email
                  </button>
                </div>
              </div>
            )}

            {savedEmails.length > 1 && (
              <div className="mt-3 border-t border-[#D4AF37]/15 pt-3">
                <button
                  type="button"
                  onClick={() => setSwitcherOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between text-xs font-bold text-[#8A6208] dark:text-[#F5D77A]"
                >
                  <span>Switch or Manage @veribox.name.ng Emails ({savedEmails.length})</span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${switcherOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {switcherOpen && (
                  <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
                    {savedEmails.map((acct) => {
                      const isCurrent = activeEmail.address === acct.address;
                      return (
                        <div
                          key={acct.address}
                          className={`flex min-h-[42px] w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 transition-colors ${
                            isCurrent
                              ? 'border-[#D4AF37] bg-[#D4AF37]/15'
                              : 'border-[#D4AF37]/15 hover:bg-[#D4AF37]/10'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onSelectAccount(acct);
                              setSwitcherOpen(false);
                            }}
                            className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left cursor-pointer"
                          >
                            <span className="font-mono text-xs font-bold text-[#1A160D] truncate dark:text-[#FAF6EC]">
                              {acct.address}
                            </span>
                            <span className="text-xs font-bold text-[#9A6F09] shrink-0 dark:text-[#F5D77A]">
                              {isCurrent ? 'Active' : 'Switch'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              onDeleteAccount(acct.address);
                            }}
                            aria-label={`Delete ${acct.address}`}
                            title="Delete email"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#6E6552] hover:bg-rose-500/15 hover:text-rose-500 cursor-pointer dark:text-[#A89F8C]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3.5 rounded-xl border border-dashed border-[#D4AF37]/30 p-4 text-center">
            <p className="text-sm text-[#6E6552] dark:text-[#A89F8C]">
              No @veribox.name.ng email active yet. Tap <strong>Create Email</strong> above to claim a custom address or sign into an existing one.
            </p>
          </div>
        )}
      </section>

      {/* Bottom Card: Incoming Emails & Verification Codes with Copy Icons */}
      <section className="rounded-2xl border border-[#D4AF37]/25 bg-white p-4 sm:p-5 dark:bg-[#14120D]">
        {selectedMessage ? (
          <div>
            <div className="flex items-center justify-between gap-3 border-b border-[#D4AF37]/15 pb-3.5">
              <button
                type="button"
                onClick={onCloseMessage}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl px-2 text-sm font-bold text-[#3E3522] hover:bg-[#D4AF37]/10 dark:text-[#F5D77A]"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Inbox</span>
              </button>

              <button
                type="button"
                onClick={() => onDeleteMessage(selectedMessage.id)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rose-500/30 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-500/10 dark:text-rose-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete</span>
              </button>
            </div>

            {loadingDetail ? (
              <div className="py-12 text-center text-sm text-[#6E6552] dark:text-[#A89F8C]">
                Loading email...
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <h2 className="font-display text-lg font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                    {selectedMessage.subject}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#6E6552] dark:text-[#A89F8C]">
                    <span className="font-semibold text-[#1A160D] dark:text-[#FAF6EC]">
                      {selectedMessage.fromName}
                    </span>
                    {selectedMessage.fromAddress && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{selectedMessage.fromAddress}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">
                      {formatRelativeTime(selectedMessage.createdAt)}
                    </span>
                  </div>
                </div>

                {selectedMessage.otp && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/15 p-4">
                    <div>
                      <p className="text-xs font-bold text-[#8A6208] dark:text-[#F5D77A]">
                        Verification Code
                      </p>
                      <p className="mt-0.5 font-mono text-2xl font-extrabold tracking-widest text-[#1A160D] dark:text-[#FAF6EC]">
                        {selectedMessage.otp}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          `detail-${selectedMessage.id}`,
                          selectedMessage.otp!,
                          `Code ${selectedMessage.otp} copied`,
                          selectedMessage.fromName
                        )
                      }
                      className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2 text-sm font-bold text-[#0A0906] hover:bg-[#E5C150]"
                    >
                      {copiedKey === `detail-${selectedMessage.id}` ? (
                        <>
                          <Check className="h-4 w-4" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          <span>Copy Code</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                <div className="rounded-xl border border-[#D4AF37]/20 bg-[#FAF7F0] p-4 text-sm leading-relaxed text-[#2C261A] whitespace-pre-wrap break-words dark:bg-[#0B0A07] dark:text-[#EAE2CF]">
                  {selectedMessage.text || 'Empty message body'}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D4AF37]/15 pb-3.5">
              <div>
                <h2 className="font-display text-base sm:text-lg font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
                  Email & Code Inbox
                </h2>
                <p className="mt-0.5 text-xs text-[#6E6552] tabular-nums dark:text-[#A89F8C]">
                  {activeEmail
                    ? autoRefresh
                      ? `Checking automatically in ${countdown}s · Tap code to copy`
                      : 'Tap Check Mail to pull new codes'
                    : 'Create an email to receive verification codes'}
                </p>
              </div>

              <button
                type="button"
                onClick={onRefreshInbox}
                disabled={loadingMessages || !activeEmail}
                className="inline-flex min-h-[38px] items-center gap-2 rounded-xl bg-[#D4AF37]/15 px-3.5 py-1.5 text-xs font-bold text-[#8A6208] transition-colors hover:bg-[#D4AF37]/25 disabled:opacity-50 whitespace-nowrap shrink-0 dark:text-[#F5D77A]"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingMessages ? 'animate-spin' : ''}`} />
                <span>Check Mail</span>
              </button>
            </div>

            {emailError && (
              <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-700 dark:text-rose-200">
                {emailError}
              </div>
            )}

            <div className="mt-4 space-y-2.5">
              {loadingMessages && messages.length === 0 ? (
                <div className="space-y-2.5">
                  {[1, 2, 3].map((n) => (
                    <div
                      key={n}
                      className="h-20 rounded-xl border border-[#D4AF37]/15 bg-[#FAF7F0] dark:bg-[#0B0A07]"
                    />
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#D4AF37]/30 py-12 text-center px-4">
                  <Inbox className="h-8 w-8 text-[#D4AF37]" />
                  <p className="mt-3 text-sm font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                    Waiting for incoming emails & codes
                  </p>
                  <p className="mt-1 max-w-sm text-xs text-[#6E6552] dark:text-[#A89F8C]">
                    Copy your email address above and use it on any site or app. Incoming verification codes will appear here with a copy icon.
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className="rounded-xl border border-[#D4AF37]/20 bg-[#FAF7F0]/70 p-4 transition-colors hover:border-[#D4AF37]/45 dark:bg-[#0B0A07]"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenMessage(msg.id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-[#6E6552] dark:text-[#A89F8C]">
                        <span className="font-bold text-[#8A6208] truncate dark:text-[#F5D77A]">
                          {msg.fromName}
                        </span>
                        <span className="tabular-nums shrink-0">
                          {formatRelativeTime(msg.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-bold text-[#1A160D] truncate dark:text-[#FAF6EC]">
                        {msg.subject}
                      </p>
                      {msg.intro && (
                        <p className="mt-1 text-xs text-[#6E6552] line-clamp-2 dark:text-[#A89F8C]">
                          {msg.intro}
                        </p>
                      )}
                    </button>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {msg.otp && (
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(msg.id, msg.otp!, `Code ${msg.otp} copied`, msg.fromName)
                          }
                          className="inline-flex min-h-[38px] items-center gap-2 rounded-lg bg-[#D4AF37] px-3.5 py-1 font-mono text-sm font-extrabold tracking-widest text-[#0A0906] hover:bg-[#E5C150]"
                        >
                          <span>{msg.otp}</span>
                          {copiedKey === msg.id ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Copy className="h-3.5 w-3.5 opacity-80" />
                          )}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            `subj-${msg.id}`,
                            msg.otp || `${msg.subject}\n${msg.intro}`,
                            'Email content copied'
                          )
                        }
                        aria-label="Copy email text"
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[#D4AF37]/30 px-3 py-1 text-xs font-bold text-[#4F4736] hover:bg-[#D4AF37]/10 dark:text-[#D5CCB8]"
                      >
                        {copiedKey === `subj-${msg.id}` ? (
                          <Check className="h-3.5 w-3.5 text-[#D4AF37]" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        <span>Copy</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
