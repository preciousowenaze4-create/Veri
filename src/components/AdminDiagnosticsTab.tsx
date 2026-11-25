import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Database,
  Loader2,
  Mail,
  Play,
  RefreshCw,
  Server,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type {
  AdminDiagnosticsResponse,
  AdminInboundTestResult,
  AdminTableProbe,
} from '../types';
import { formatRelativeTime } from '../utils/clipboard';

interface AdminDiagnosticsTabProps {
  ownerEmail: string;
  emailDomain: string;
  activeEmailAddress: string | null;
  diagnostics: AdminDiagnosticsResponse | null;
  loading: boolean;
  error: string | null;
  testingInbound: boolean;
  testResult: AdminInboundTestResult | null;
  testError: string | null;
  onRefresh: () => void;
  onTestInbound: (targetAddress: string) => void;
  onSwitchToUserView: () => void;
}

function ProbeCard({
  title,
  tableName,
  probe,
}: {
  title: string;
  tableName: string;
  probe?: AdminTableProbe;
}) {
  const ok = Boolean(probe?.ok);
  return (
    <div
      className={`rounded-xl border p-3.5 ${
        ok
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'border-rose-500/40 bg-rose-500/10'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {ok ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0 text-rose-500" />
          )}
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-[#1A160D] dark:text-[#FAF6EC] truncate">
              {title}
            </p>
            <p className="font-mono text-[10px] text-[#6E6552] dark:text-[#A89F8C]">
              public.{tableName}
            </p>
          </div>
        </div>

        <span
          className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-[11px] font-bold ${
            ok
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-500/20 text-rose-700 dark:text-rose-200'
          }`}
        >
          HTTP {probe?.httpStatus ?? '—'}
        </span>
      </div>

      {ok ? (
        <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          Query succeeded · {probe?.rowCount ?? 0} total rows accessible
        </p>
      ) : (
        <div className="mt-2 space-y-1 text-xs text-rose-700 dark:text-rose-200">
          <p className="font-mono font-bold break-all">
            {probe?.errorCode ? `[${probe.errorCode}] ` : ''}
            {probe?.errorMessage || 'Table query failed'}
          </p>
          {probe?.errorHint && (
            <p className="text-[11px] opacity-85 break-words">Hint: {probe.errorHint}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminDiagnosticsTab({
  ownerEmail,
  emailDomain,
  activeEmailAddress,
  diagnostics,
  loading,
  error,
  testingInbound,
  testResult,
  testError,
  onRefresh,
  onTestInbound,
  onSwitchToUserView,
}: AdminDiagnosticsTabProps) {
  const defaultTarget = activeEmailAddress || `diag.test@${emailDomain}`;
  const [testAddress, setTestAddress] = useState(defaultTarget);

  useEffect(() => {
    if (activeEmailAddress) {
      setTestAddress(activeEmailAddress);
    }
  }, [activeEmailAddress]);

  const env = diagnostics?.environment;

  return (
    <div className="space-y-4">
      {/* Owner Admin Header */}
      <section className="rounded-2xl border border-[#D4AF37]/40 bg-white p-4 sm:p-5 dark:bg-[#14120D]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#D4AF37] text-[#0A0906] shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#8A6208] dark:text-[#D4AF37]">
                Owner Admin Diagnostics
              </p>
              <h1 className="font-display text-base sm:text-lg font-extrabold text-[#1A160D] dark:text-[#FAF6EC] truncate">
                Inbound Email &amp; Router Monitor
              </h1>
              <p className="font-mono text-[11px] text-[#6E6552] dark:text-[#A89F8C] truncate">
                Signed in as {ownerEmail}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onSwitchToUserView}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#D4AF37]/35 px-3 py-1.5 text-xs font-bold text-[#4F4736] hover:bg-[#D4AF37]/10 cursor-pointer dark:text-[#F5D77A]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>User Dashboard</span>
            </button>

            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#D4AF37] px-3.5 py-1.5 text-xs font-extrabold text-[#0A0906] hover:bg-[#E5C150] disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Checking...' : 'Run Check'}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-xs text-rose-700 dark:text-rose-200">
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="font-mono break-all">{error}</span>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}
      </section>

      {/* Environment & Supabase Table Probes */}
      <section className="rounded-2xl border border-[#D4AF37]/30 bg-white p-4 sm:p-5 space-y-4 dark:bg-[#14120D]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-[#D4AF37]" />
            <h2 className="font-display text-sm sm:text-base font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
              Supabase &amp; Backend Configuration
            </h2>
          </div>
          {diagnostics?.checkedAt && (
            <span className="text-[11px] text-[#6E6552] dark:text-[#A89F8C]">
              Checked {formatRelativeTime(diagnostics.checkedAt)}
            </span>
          )}
        </div>

        {loading && !diagnostics ? (
          <div className="flex items-center gap-2 py-6 text-xs text-[#6E6552] dark:text-[#A89F8C]">
            <Loader2 className="h-4 w-4 animate-spin text-[#D4AF37]" />
            <span>Running live diagnostics on mailboxes, RLS policies, and inbound logs...</span>
          </div>
        ) : diagnostics ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-xl border border-[#D4AF37]/20 bg-[#FAF7F0] p-2.5 dark:bg-[#0B0A07]">
                <p className="text-[10px] font-bold text-[#6E6552] dark:text-[#A89F8C]">
                  Email Domain
                </p>
                <p className="mt-0.5 font-mono text-xs font-bold text-[#1A160D] dark:text-[#F5D77A] truncate">
                  @{env?.emailDomain}
                </p>
              </div>
              <div className="rounded-xl border border-[#D4AF37]/20 bg-[#FAF7F0] p-2.5 dark:bg-[#0B0A07]">
                <p className="text-[10px] font-bold text-[#6E6552] dark:text-[#A89F8C]">
                  Inbound Secret
                </p>
                <p
                  className={`mt-0.5 text-xs font-extrabold ${
                    env?.inboundSecretConfigured
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {env?.inboundSecretConfigured ? 'Configured' : 'Not Set'}
                </p>
              </div>
              <div className="rounded-xl border border-[#D4AF37]/20 bg-[#FAF7F0] p-2.5 dark:bg-[#0B0A07]">
                <p className="text-[10px] font-bold text-[#6E6552] dark:text-[#A89F8C]">
                  Supabase URL
                </p>
                <p
                  className={`mt-0.5 text-xs font-extrabold ${
                    env?.supabaseConfigured
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {env?.supabaseConfigured ? 'Connected' : 'Missing'}
                </p>
              </div>
              <div className="rounded-xl border border-[#D4AF37]/20 bg-[#FAF7F0] p-2.5 dark:bg-[#0B0A07]">
                <p className="text-[10px] font-bold text-[#6E6552] dark:text-[#A89F8C]">
                  Service Role Key
                </p>
                <p
                  className={`mt-0.5 text-xs font-extrabold ${
                    env?.supabaseServiceRoleConfigured
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {env?.supabaseServiceRoleConfigured ? 'Set (RLS Bypass)' : 'Missing (Anon Only)'}
                </p>
              </div>
            </div>

            {!env?.supabaseServiceRoleConfigured && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                <strong>RLS Warning:</strong> <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> is not set on the backend. With Row Level Security enabled on <code className="font-mono">mailboxes</code> and <code className="font-mono">mailbox_messages</code>, the backend cannot write or read inbound emails in Supabase until the service role key is added.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ProbeCard
                title="Mailboxes Table Query"
                tableName="mailboxes"
                probe={diagnostics.probes.mailboxes}
              />
              <ProbeCard
                title="Inbound Messages Table Query"
                tableName="mailbox_messages"
                probe={diagnostics.probes.mailboxMessages}
              />
            </div>
          </>
        ) : null}
      </section>

      {/* Test Inbound Pipeline */}
      <section className="rounded-2xl border border-[#D4AF37]/30 bg-white p-4 sm:p-5 space-y-3 dark:bg-[#14120D]">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-[#D4AF37]" />
          <h2 className="font-display text-sm sm:text-base font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
            Test Inbound Pipeline
          </h2>
        </div>
        <p className="text-xs text-[#6E6552] dark:text-[#A89F8C]">
          Dispatches a synthetic verification email through <code className="font-mono">/api/email/inbound</code> and verifies Supabase write + readback immediately.
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={testAddress}
            onChange={(e) => setTestAddress(e.target.value)}
            placeholder={`diag.test@${emailDomain}`}
            className="min-h-[42px] flex-1 rounded-xl border border-[#D4AF37]/30 bg-[#FAF7F0] px-3 py-2 font-mono text-xs text-[#1A160D] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
          />
          <button
            type="button"
            disabled={testingInbound}
            onClick={() => onTestInbound(testAddress)}
            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-4 py-2 text-xs font-extrabold text-[#0A0906] hover:bg-[#E5C150] disabled:opacity-60 cursor-pointer shrink-0"
          >
            {testingInbound ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            <span>{testingInbound ? 'Testing...' : 'Test Inbound Pipeline'}</span>
          </button>
        </div>

        {testError && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 font-mono text-xs text-rose-700 dark:text-rose-200 break-all">
            {testError}
          </div>
        )}

        {testResult && (
          <div className="rounded-xl border border-[#D4AF37]/25 bg-[#FAF7F0] p-3.5 space-y-2 dark:bg-[#0B0A07]">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-md px-2 py-0.5 font-mono font-bold ${
                    testResult.httpStatus >= 200 && testResult.httpStatus < 300
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  HTTP {testResult.httpStatus}
                </span>
                <span className="font-mono text-[#6E6552] dark:text-[#A89F8C]">
                  {testResult.latencyMs}ms
                </span>
                {testResult.otpDetected && (
                  <span className="rounded-md bg-[#D4AF37]/20 px-2 py-0.5 font-mono font-bold text-[#8A6208] dark:text-[#F5D77A]">
                    OTP: {testResult.otpDetected}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 font-mono text-[11px]">
                <span
                  className={
                    testResult.supabaseWriteOk
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }
                >
                  Write: {testResult.supabaseWriteOk ? 'OK' : 'FAILED'}
                </span>
                <span
                  className={
                    testResult.supabaseReadbackOk
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }
                >
                  Readback: {testResult.supabaseReadbackOk ? 'OK' : 'FAILED'}
                </span>
              </div>
            </div>

            {testResult.supabaseError && (
              <p className="rounded-lg bg-rose-500/10 p-2 font-mono text-[11px] text-rose-700 dark:text-rose-200 break-all">
                Supabase Error: {testResult.supabaseError}
              </p>
            )}

            <pre className="max-h-40 overflow-auto rounded-lg bg-black/5 p-2.5 font-mono text-[11px] text-[#2C261A] dark:bg-black/40 dark:text-[#EAE2CF]">
              {JSON.stringify(testResult.responseBody, null, 2)}
            </pre>
          </div>
        )}
      </section>

      {/* Raw Inbound Webhook Attempts / Unmatched Logs */}
      <section className="rounded-2xl border border-[#D4AF37]/30 bg-white p-4 sm:p-5 space-y-3 dark:bg-[#14120D]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[#D4AF37]" />
            <h2 className="font-display text-sm sm:text-base font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
              Inbound Webhook Logs &amp; Unmatched Routes ({diagnostics?.recentInboundAttempts.length ?? 0})
            </h2>
          </div>
        </div>

        {!diagnostics || diagnostics.recentInboundAttempts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#D4AF37]/25 p-4 text-xs text-[#6E6552] dark:text-[#A89F8C]">
            No inbound requests hit this backend instance yet since the last cold start. Use <strong>Test Inbound Pipeline</strong> above or send a real verification email to check if Cloudflare Worker requests reach <code className="font-mono">/api/email/inbound</code>.
          </p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {diagnostics.recentInboundAttempts.map((log) => (
              <div
                key={log.id}
                className="rounded-xl border border-[#D4AF37]/20 bg-[#FAF7F0] p-3 text-xs dark:bg-[#0B0A07]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                        log.status === 'stored'
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                      }`}
                    >
                      {log.status} · HTTP {log.httpStatus}
                    </span>
                    {log.otpDetected && (
                      <span className="font-mono text-[11px] font-bold text-[#8A6208] dark:text-[#F5D77A]">
                        OTP: {log.otpDetected}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-[#6E6552] dark:text-[#A89F8C]">
                    {formatRelativeTime(log.timestamp)}
                  </span>
                </div>

                <p className="mt-1.5 font-mono text-[11px] text-[#1A160D] dark:text-[#FAF6EC] break-all">
                  To: {log.recipients.join(', ') || log.rawToPreview || '(none)'} · From:{' '}
                  {log.fromAddress || '(unknown)'}
                </p>
                <p className="mt-0.5 text-[11px] text-[#6E6552] dark:text-[#A89F8C] truncate">
                  Subject: {log.subject}
                </p>
                {log.error && (
                  <p className="mt-1 rounded bg-rose-500/10 px-2 py-1 font-mono text-[11px] text-rose-700 dark:text-rose-200 break-all">
                    {log.error}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Latest Stored Emails in Database */}
      <section className="rounded-2xl border border-[#D4AF37]/30 bg-white p-4 sm:p-5 space-y-3 dark:bg-[#14120D]">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-[#D4AF37]" />
          <h2 className="font-display text-sm sm:text-base font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
            Latest Stored Messages ({diagnostics?.latestMessages.length ?? 0})
          </h2>
        </div>

        {!diagnostics || diagnostics.latestMessages.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#D4AF37]/25 p-4 text-xs text-[#6E6552] dark:text-[#A89F8C]">
            No records returned from <code className="font-mono">public.mailbox_messages</code>.
          </p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {diagnostics.latestMessages.map((msg) => (
              <div
                key={msg.id}
                className="rounded-xl border border-[#D4AF37]/20 bg-[#FAF7F0] p-3 text-xs dark:bg-[#0B0A07]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-bold text-[#8A6208] dark:text-[#F5D77A] truncate">
                    → {msg.recipientAddress}
                  </span>
                  <span className="text-[11px] text-[#6E6552] dark:text-[#A89F8C] shrink-0">
                    {formatRelativeTime(msg.createdAt)}
                  </span>
                </div>
                <p className="mt-1 font-bold text-[#1A160D] dark:text-[#FAF6EC] truncate">
                  {msg.subject}
                </p>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#6E6552] dark:text-[#A89F8C]">
                  <span className="truncate">From: {msg.fromAddress || msg.fromName}</span>
                  {msg.otp && (
                    <span className="rounded bg-[#D4AF37] px-1.5 py-0.5 font-mono text-[10px] font-extrabold text-[#0A0906]">
                      Code: {msg.otp}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
