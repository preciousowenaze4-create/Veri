import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  LogOut,
  MailCheck,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import type { BanAppealRecord, UserModerationLockoutState } from '../types';
import { parseJsonResponse } from '../utils/apiFetch';

interface BanLockoutModalProps {
  lockout: UserModerationLockoutState;
  isAuthenticated: boolean;
  defaultEmail?: string | null;
  onAppealUpdated: (appeal: BanAppealRecord | null, unlocked?: boolean) => void;
  onRefreshStatus: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

function formatDateLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

function formatCountdown(msRemaining: number): string {
  const totalSec = Math.max(0, Math.floor(msRemaining / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function BanLockoutModal({
  lockout,
  isAuthenticated,
  defaultEmail,
  onAppealUpdated,
  onRefreshStatus,
  onSignOut,
}: BanLockoutModalProps) {
  const script = lockout.banScript;
  const appeal = lockout.appeal;

  const [showAppealForm, setShowAppealForm] = useState<boolean>(() =>
    Boolean(appeal && appeal.status !== 'none')
  );
  const [appealEmail, setAppealEmail] = useState<string>(
    appeal?.submittedEmail || lockout.email || defaultEmail || ''
  );
  const [appealName, setAppealName] = useState<string>(appeal?.fullName || '');
  const [appealDetails, setAppealDetails] = useState<string>(appeal?.appealDetails || '');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [evaluating, setEvaluating] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (appeal && appeal.status !== 'none') {
      setShowAppealForm(true);
    }
    if (!appealEmail && (appeal?.submittedEmail || lockout.email || defaultEmail)) {
      setAppealEmail(appeal?.submittedEmail || lockout.email || defaultEmail || '');
    }
  }, [appeal, lockout.email, defaultEmail, appealEmail]);

  // Live 1-second timer tick during countdown
  useEffect(() => {
    if (appeal?.status !== 'email_confirmed_waiting') return;
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [appeal?.status]);

  const msRemaining = useMemo(() => {
    if (!appeal?.reviewEligibleAt) return 0;
    const target = Date.parse(appeal.reviewEligibleAt);
    if (!Number.isFinite(target)) return 0;
    return Math.max(0, target - nowMs);
  }, [appeal?.reviewEligibleAt, nowMs]);

  const countdownReady =
    appeal?.status === 'email_confirmed_waiting' && msRemaining <= 0;

  const handleSubmitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const cleanEmail = appealEmail.trim().toLowerCase();
    const cleanDetails = appealDetails.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Enter the exact Google or Email address you used to register your VeriBox account.');
      return;
    }
    if (cleanDetails.length < 15) {
      setError('Please provide a clear appeal explanation (at least 15 characters).');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/ban-appeal/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          fullName: appealName.trim() || undefined,
          appealDetails: cleanDetails,
          blockedUserId: lockout.userId || undefined,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await parseJsonResponse<{
        ok?: boolean;
        appeal?: BanAppealRecord;
        message?: string;
        error?: string;
      }>(res);
      if (!res.ok || !data.ok || !data.appeal) {
        throw new Error(data.error || 'Could not submit your appeal right now.');
      }
      setNotice(data.message || 'Verification link sent to your email.');
      onAppealUpdated(data.appeal, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Appeal submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckClick = async () => {
    setChecking(true);
    setError(null);
    try {
      await onRefreshStatus();
    } finally {
      setChecking(false);
    }
  };

  const handleRunAiFinalVerify = async () => {
    setEvaluating(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/ban-appeal/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: appeal?.userId || lockout.userId || undefined,
          email: appeal?.submittedEmail || lockout.email || undefined,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await parseJsonResponse<{
        ok?: boolean;
        unlocked?: boolean;
        appeal?: BanAppealRecord;
        error?: string;
      }>(res);
      if (!res.ok) {
        throw new Error(data.error || 'Could not run AI final verification.');
      }
      if (data.appeal) {
        onAppealUpdated(data.appeal, Boolean(data.unlocked));
      }
      if (!data.unlocked && data.appeal?.aiVerdictNote) {
        setNotice(data.appeal.aiVerdictNote);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI verification check failed.');
    } finally {
      setEvaluating(false);
    }
  };

  const loginDayText =
    script?.lastLoginDayChecked || formatDateLabel(lockout.lastSignInAt) || 'Not recorded';
  const bannedDateText =
    formatDateLabel(lockout.bannedAt || script?.generatedAt) || 'Recent';

  return (
    <main className="mx-auto flex min-h-[82vh] w-full max-w-2xl items-center justify-center px-3 py-6 sm:px-4">
      <div className="w-full overflow-hidden rounded-3xl border border-rose-500/45 bg-white shadow-2xl dark:bg-[#14120D]">
        {/* Facebook-style Security Review Header */}
        <div className="border-b border-[#D4AF37]/20 bg-[#FAF7F0] px-5 py-4 sm:px-6 dark:bg-[#0B0A07]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-600/15 text-rose-600 dark:text-rose-400">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
                  Account {lockout.status === 'suspended' ? 'Suspended' : 'Disabled'}
                  {lockout.matchType ? ` · ${lockout.matchType.toUpperCase()} Security Lock` : ''}
                  {script?.caseId ? ` · ${script.caseId}` : ''}
                </p>
                <h1 className="mt-0.5 font-display text-lg sm:text-xl font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
                  {script?.headline || 'Your VeriBox Account Has Been Disabled'}
                </h1>
              </div>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#6E6552] tabular-nums dark:text-[#A89F8C]">
            <span>Action Date: {bannedDateText}</span>
            <span aria-hidden="true">·</span>
            <span>Last Login Checked: {loginDayText}</span>
            {typeof script?.accountAgeDays === 'number' && (
              <>
                <span aria-hidden="true">·</span>
                <span>Account Age: {script.accountAgeDays} days</span>
              </>
            )}
          </div>
        </div>

        {/* Scrollable Long-Form AI Explanation (Facebook-style paragraphs) */}
        <div className="max-h-[44vh] overflow-y-auto px-5 py-4 sm:px-6 space-y-3.5 text-sm leading-relaxed text-[#2A2418] dark:text-[#EAE2CF]">
          <p className="font-semibold text-[#1A160D] dark:text-[#FAF6EC]">
            {script?.summaryParagraph ||
              lockout.reason ||
              'Our automated security review and platform administrator placed a restriction on this account after reviewing recent activity.'}
          </p>

          {Array.isArray(script?.paragraphs) &&
            script.paragraphs.map((para, idx) => (
              <p key={idx} className="text-[13.5px] leading-relaxed text-[#4A4231] dark:text-[#D5CCB8]">
                {para}
              </p>
            ))}

          {Array.isArray(script?.whatHappenedBullets) && script.whatHappenedBullets.length > 0 && (
            <div className="border-t border-[#D4AF37]/20 pt-3">
              <p className="text-xs font-extrabold text-[#1A160D] dark:text-[#F5D77A]">
                Why This Action Was Taken
              </p>
              <ul className="mt-2 space-y-1.5 text-[13px] text-[#4A4231] dark:text-[#D5CCB8]">
                {script.whatHappenedBullets.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {script?.whatYouCanDo && (
            <div className="border-t border-[#D4AF37]/20 pt-3">
              <p className="text-xs font-extrabold text-[#1A160D] dark:text-[#F5D77A]">
                What You Can Do Next
              </p>
              <p className="mt-1 text-[13px] text-[#4A4231] dark:text-[#D5CCB8]">
                {script.whatYouCanDo}
              </p>
            </div>
          )}
        </div>

        {/* Real-Time Appeal & Verification Flow */}
        <div className="border-t border-[#D4AF37]/20 bg-[#FAF7F0]/70 px-5 py-4 sm:px-6 space-y-3 dark:bg-[#0B0A07]/70">
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-500/35 bg-rose-500/10 p-3 text-xs font-medium text-rose-700 dark:text-rose-200">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-700 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-500" />
              <span>{notice}</span>
            </div>
          )}

          {/* Appeal Status: Pending Email Link Tap */}
          {appeal?.status === 'pending_email_link' && (
            <div className="space-y-3 rounded-2xl border border-[#D4AF37]/35 bg-white p-4 dark:bg-[#14120D]">
              <div className="flex items-start gap-2.5">
                <MailCheck className="h-5 w-5 shrink-0 text-[#D4AF37] mt-0.5" />
                <div className="space-y-1 text-xs">
                  <p className="font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
                    Verification Link Sent to {appeal.submittedEmail}
                  </p>
                  <p className="text-[#6E6552] dark:text-[#A89F8C]">
                    Account matched via{' '}
                    <span className="font-semibold text-[#1A160D] dark:text-[#FAF6EC]">
                      {appeal.registeredAuthProvider === 'google' ? 'Google Login' : 'Email Login'}
                    </span>
                    . Open your email inbox, tap the verification link, and confirm it in your browser. This screen updates automatically once confirmed.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={checking}
                  onClick={() => void handleCheckClick()}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#D4AF37] px-3.5 py-2 text-xs font-extrabold text-[#0A0906] hover:bg-[#E5C150] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />
                  <span>{checking ? 'Checking...' : 'Check Browser Confirmation'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onAppealUpdated(null, false);
                    setShowAppealForm(true);
                  }}
                  className="inline-flex min-h-[38px] items-center rounded-xl border border-[#D4AF37]/30 px-3 py-2 text-xs font-bold text-[#6E6552] hover:bg-[#D4AF37]/10 whitespace-nowrap shrink-0 cursor-pointer dark:text-[#D5CCB8]"
                >
                  Edit Appeal Email
                </button>
              </div>
            </div>
          )}

          {/* Appeal Status: Email Confirmed in Browser -> Live Countdown */}
          {appeal?.status === 'email_confirmed_waiting' && (
            <div className="space-y-3 rounded-2xl border border-emerald-500/40 bg-white p-4 dark:bg-[#14120D]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" />
                  <div className="space-y-1 text-xs">
                    <p className="font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
                      Email Ownership Confirmed in Browser
                    </p>
                    <p className="text-[#6E6552] dark:text-[#A89F8C]">
                      Verified for <span className="font-mono font-bold">{appeal.submittedEmail}</span> (
                      {appeal.registeredAuthProvider === 'google' ? 'Google Account' : 'Email Account'}).
                      AI security verification completes when the review timer finishes.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D4AF37]/25 bg-[#FAF7F0] px-3.5 py-2.5 dark:bg-[#0B0A07]">
                <div className="flex items-center gap-2 text-xs font-bold text-[#6E6552] dark:text-[#D5CCB8]">
                  <Clock className="h-4 w-4 text-[#D4AF37]" />
                  <span>{countdownReady ? 'Review Window Complete' : 'AI Verification Countdown'}</span>
                </div>
                <span className="font-mono text-base font-black tabular-nums text-[#8A6208] dark:text-[#F5D77A]">
                  {formatCountdown(msRemaining)}
                </span>
              </div>

              {countdownReady && (
                <button
                  type="button"
                  disabled={evaluating}
                  onClick={() => void handleRunAiFinalVerify()}
                  className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-emerald-500 disabled:opacity-60 cursor-pointer"
                >
                  {evaluating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  <span>{evaluating ? 'AI Verifying Account...' : 'Complete AI Verification & Unlock Now'}</span>
                </button>
              )}
            </div>
          )}

          {/* Appeal Rejected */}
          {appeal?.status === 'rejected' && (
            <div className="space-y-2 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-xs text-rose-700 dark:text-rose-200">
              <p className="font-extrabold">Appeal Review Result: Declined</p>
              <p>{appeal.aiVerdictNote || 'Your appeal could not be verified at this time.'}</p>
              <button
                type="button"
                onClick={() => {
                  onAppealUpdated(null, false);
                  setShowAppealForm(true);
                }}
                className="mt-1 inline-flex items-center gap-1 font-bold underline cursor-pointer"
              >
                Submit a new appeal
              </button>
            </div>
          )}

          {/* Appeal Form (when user clicks Appeal or has not submitted yet) */}
          {(!appeal || appeal.status === 'none') && showAppealForm && (
            <form onSubmit={(e) => void handleSubmitAppeal(e)} className="space-y-3 rounded-2xl border border-[#D4AF37]/30 bg-white p-4 dark:bg-[#14120D]">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
                  Appeal &amp; Verify Your Registered Email
                </p>
                <span className="text-[11px] text-[#6E6552] dark:text-[#A89F8C]">
                  Google or Email Login
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="email"
                  required
                  value={appealEmail}
                  onChange={(e) => setAppealEmail(e.target.value)}
                  placeholder="Email used to register / Google login"
                  className="h-10 w-full rounded-xl border border-[#D4AF37]/30 bg-[#FAF7F0] px-3 text-xs text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
                />
                <input
                  type="text"
                  maxLength={100}
                  value={appealName}
                  onChange={(e) => setAppealName(e.target.value)}
                  placeholder="Full name on account (optional)"
                  className="h-10 w-full rounded-xl border border-[#D4AF37]/30 bg-[#FAF7F0] px-3 text-xs text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
                />
              </div>

              <textarea
                rows={3}
                required
                minLength={15}
                maxLength={1200}
                value={appealDetails}
                onChange={(e) => setAppealDetails(e.target.value)}
                placeholder="Explain in detail why this account should be reviewed (e.g. clarify your login, deposit attempt, or usage)..."
                className="w-full rounded-xl border border-[#D4AF37]/30 bg-[#FAF7F0] p-3 text-xs text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-[#6E6552] dark:text-[#A89F8C]">
                  We check Supabase for a match and email a confirmation link.
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#D4AF37] px-4 py-2 text-xs font-extrabold text-[#0A0906] hover:bg-[#E5C150] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {submitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  <span>{submitting ? 'Verifying & Sending...' : 'Submit Appeal & Send Link'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Action Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              {(!appeal || appeal.status === 'none') && !showAppealForm && (
                <button
                  type="button"
                  onClick={() => setShowAppealForm(true)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#D4AF37] px-4 py-2 text-xs font-extrabold text-[#0A0906] hover:bg-[#E5C150] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Appeal &amp; Verify Account</span>
                </button>
              )}

              <button
                type="button"
                disabled={checking}
                onClick={() => void handleCheckClick()}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#D4AF37]/35 px-3.5 py-2 text-xs font-bold text-[#8A6208] hover:bg-[#D4AF37]/10 whitespace-nowrap shrink-0 cursor-pointer dark:text-[#F5D77A]"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />
                <span>Re-check Access</span>
              </button>
            </div>

            {isAuthenticated && (
              <button
                type="button"
                onClick={() => void onSignOut()}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rose-500/35 px-3.5 py-2 text-xs font-bold text-rose-600 hover:bg-rose-500/10 whitespace-nowrap shrink-0 cursor-pointer dark:text-rose-300"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
