import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CreditCard,
  Loader2,
  PhoneCall,
  ShieldCheck,
  Smartphone,
  Wallet,
  X,
} from 'lucide-react';
import { parseJsonResponse } from '../utils/apiFetch';

interface DepositModalProps {
  open: boolean;
  walletBalance: number;
  walletUserId: string;
  userEmail?: string | null;
  onClose: () => void;
  onCreditSuccess: (amount: number, message: string, serverBalance?: number | null) => void;
}

const PRESET_AMOUNTS = [500, 1000, 2000, 5000, 10000, 20000];

export function DepositModal({
  open,
  walletBalance,
  walletUserId,
  userEmail,
  onClose,
  onCreditSuccess,
}: DepositModalProps) {
  const [amount, setAmount] = useState<number>(5000);
  const [customInput, setCustomInput] = useState<string>('5000');
  const [email, setEmail] = useState<string>(userEmail || '');
  const [emailTouched, setEmailTouched] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [paystackConfigured, setPaystackConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    if (!emailTouched && userEmail) {
      setEmail(userEmail);
    }
  }, [userEmail, emailTouched]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    let cancelled = false;
    fetch('/api/wallet/status')
      .then((r) => parseJsonResponse<{ configured?: boolean }>(r))
      .then((d) => {
        if (!cancelled) {
          setPaystackConfigured(Boolean(d.configured));
        }
      })
      .catch(() => {
        if (!cancelled) setPaystackConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const handleSelectPreset = (val: number) => {
    setAmount(val);
    setCustomInput(String(val));
    setError(null);
  };

  const handleCustomChange = (val: string) => {
    const clean = val.replace(/\D/g, '');
    setCustomInput(clean);
    const num = Number(clean);
    setAmount(num);
    setError(null);
  };

  const handleProceedDeposit = async () => {
    if (!amount || amount < 100) {
      setError('Minimum deposit is ₦100');
      return;
    }
    const finalEmail = email.trim() || userEmail || 'customer@veribox.app';
    if (!finalEmail.includes('@')) {
      setError('Please provide a valid email address for receipt');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/wallet/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          email: finalEmail,
          userId: walletUserId,
        }),
      });

      const data = await parseJsonResponse<{
        configured?: boolean;
        demoMode?: boolean;
        authorization_url?: string;
        reference?: string;
        error?: string;
        message?: string;
      }>(res);

      if (res.ok && data.configured && data.authorization_url) {
        if (data.reference) {
          try {
            localStorage.setItem('veribox_pending_paystack_ref', data.reference);
          } catch {
            // Non-blocking
          }
        }
        window.location.href = data.authorization_url;
        return;
      }

      // Only use instant test-mode credit when Paystack is explicitly unconfigured
      if (res.ok && data.configured === false) {
        const demoRes = await fetch('/api/wallet/demo-credit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount, userId: walletUserId }),
        });
        const demoData = await parseJsonResponse<{
          success?: boolean;
          balance?: number;
          supabasePersisted?: boolean;
          error?: string;
        }>(demoRes);
        if (demoRes.ok && demoData.success) {
          onCreditSuccess(
            amount,
            `Test deposit of ₦${amount.toLocaleString()} credited to wallet!`,
            demoData.supabasePersisted && typeof demoData.balance === 'number'
              ? demoData.balance
              : null
          );
          onClose();
          return;
        }
        throw new Error(demoData.error || 'Unable to credit test wallet');
      }

      throw new Error(data.error || 'Unable to process deposit');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deposit initiation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deposit-modal-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-[#D4AF37]/35 bg-white shadow-2xl dark:bg-[#14120D]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#D4AF37]/20 p-4 sm:p-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#D4AF37]/40 bg-[#D4AF37]/15 text-[#8A6208] dark:text-[#F5D77A]">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="deposit-modal-title"
                className="font-display text-lg font-extrabold text-[#1A160D] dark:text-[#FAF6EC]"
              >
                Fund Wallet
              </h2>
              <p className="text-xs text-[#6E6552] dark:text-[#A89F8C]">
                Instant Naira deposit for private numbers &amp; SMS
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close deposit modal"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#6E6552] hover:bg-[#D4AF37]/15 dark:text-[#A89F8C] dark:hover:bg-[#D4AF37]/15"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="max-h-[75vh] overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Current Balance Bar */}
          <div className="flex items-center justify-between rounded-2xl border border-[#D4AF37]/25 bg-[#FAF7F0] p-4 dark:bg-[#0B0A07]">
            <div>
              <span className="text-xs font-semibold text-[#6E6552] dark:text-[#A89F8C]">
                Current Balance
              </span>
              <p className="mt-0.5 font-mono text-2xl font-black text-[#8A6208] dark:text-[#F5D77A]">
                ₦{walletBalance.toLocaleString('en-US')}
              </p>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>{paystackConfigured === false ? 'Test Mode' : 'Active'}</span>
            </div>
          </div>

          {paystackConfigured === false && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs font-medium text-amber-800 dark:text-amber-200">
              Paystack live key is not set on this server — deposits credit your test wallet
              immediately so you can test the flow.
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs font-medium text-rose-700 dark:text-rose-200">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Amount Presets */}
          <div>
            <label className="mb-2 block text-xs font-bold text-[#6E6552] dark:text-[#A89F8C]">
              Select Deposit Amount
            </label>
            <div className="grid grid-cols-3 gap-2">
              {PRESET_AMOUNTS.map((val) => {
                const isSelected = amount === val;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleSelectPreset(val)}
                    className={`min-h-[44px] rounded-xl border px-3 py-2 text-xs font-extrabold transition-all ${
                      isSelected
                        ? 'border-[#D4AF37] bg-[#D4AF37] text-[#0A0906] shadow-sm'
                        : 'border-[#D4AF37]/25 bg-[#FAF7F0] text-[#3E3522] hover:bg-[#D4AF37]/15 dark:bg-[#0B0A07] dark:text-[#EAE2CF]'
                    }`}
                  >
                    ₦{val.toLocaleString()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Amount Field */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-[#6E6552] dark:text-[#A89F8C]">
              Or Enter Custom Amount (₦)
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-base font-bold text-[#8A7F6A]">
                ₦
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={customInput}
                onChange={(e) => handleCustomChange(e.target.value)}
                placeholder="5000"
                className="h-12 w-full rounded-xl border border-[#D4AF37]/35 bg-[#FAF7F0] pl-10 pr-4 font-mono text-base font-extrabold text-[#1A160D] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
              />
            </div>
          </div>

          {/* Receipt Email Address */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-[#6E6552] dark:text-[#A89F8C]">
              Email Address (for confirmation)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmailTouched(true);
                setEmail(e.target.value);
              }}
              placeholder="yourname@gmail.com"
              className="h-11 w-full rounded-xl border border-[#D4AF37]/35 bg-[#FAF7F0] px-3.5 text-xs text-[#1A160D] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
            />
          </div>

          {/* Supported Channels Badges */}
          <div className="rounded-2xl border border-[#D4AF37]/15 bg-[#FAF7F0]/60 p-3.5 dark:bg-[#0B0A07]/60">
            <p className="text-[11px] font-bold text-[#6E6552] dark:text-[#A89F8C]">
              Instant Payment Methods Supported:
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-[#3E3522] dark:text-[#D5CCB8]">
              <div className="flex items-center gap-2">
                <CreditCard className="h-3.5 w-3.5 text-[#D4AF37]" />
                <span>Debit / ATM Card</span>
              </div>
              <div className="flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5 text-[#D4AF37]" />
                <span>Direct Bank Transfer</span>
              </div>
              <div className="flex items-center gap-2">
                <Smartphone className="h-3.5 w-3.5 text-[#D4AF37]" />
                <span>USSD Code (*737#, etc.)</span>
              </div>
              <div className="flex items-center gap-2">
                <PhoneCall className="h-3.5 w-3.5 text-[#D4AF37]" />
                <span>OPay / Kuda / Mobile</span>
              </div>
            </div>
          </div>

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={() => void handleProceedDeposit()}
            disabled={loading || !amount || amount < 100}
            className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-[#D4AF37] px-5 py-3 text-sm font-extrabold text-[#0A0906] transition-all hover:bg-[#E5C150] active:scale-[0.98] disabled:opacity-60 cursor-pointer shadow-lg shadow-[#D4AF37]/20"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  {paystackConfigured === false
                    ? 'Crediting Test Wallet...'
                    : 'Connecting to Secure Checkout...'}
                </span>
              </>
            ) : (
              <>
                <Wallet className="h-4 w-4" />
                <span>
                  {paystackConfigured === false
                    ? `Add Test Credit ₦${amount ? amount.toLocaleString() : '0'}`
                    : `Pay ₦${amount ? amount.toLocaleString() : '0'}`}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
