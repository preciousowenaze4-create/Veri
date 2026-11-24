import { useEffect, useState } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  User as UserIcon,
  X,
} from 'lucide-react';
import { ensureSupabaseClient } from '../utils/supabase';

interface AuthModalProps {
  open: boolean;
  actionReason?: string | null;
  onClose: () => void;
  onAuthSuccess: (user: SupabaseUser, message: string) => void;
}

type AuthTabMode = 'signin' | 'signup';

export function AuthModal({
  open,
  actionReason,
  onClose,
  onAuthSuccess,
}: AuthModalProps) {
  const [mode, setMode] = useState<AuthTabMode>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setNotice(null);
    setSubmitting(false);
    setGoogleLoading(false);
  }, [open]);

  if (!open) return null;

  const getRedirectUrl = () => {
    const cleanPath = window.location.pathname || '/';
    return `${window.location.origin}${cleanPath}`;
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setNotice(null);
    setGoogleLoading(true);
    try {
      const client = await ensureSupabaseClient();
      if (!client) {
        throw new Error(
          'Authentication is not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment variables.'
        );
      }

      const { error: oauthErr } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getRedirectUrl(),
          queryParams: {
            prompt: 'select_account',
          },
        },
      });

      if (oauthErr) {
        throw new Error(oauthErr.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start Google sign in.');
      setGoogleLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const client = await ensureSupabaseClient();
      if (!client) {
        throw new Error(
          'Authentication is not configured yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment variables.'
        );
      }

      if (mode === 'signin') {
        const { data, error: signInErr } = await client.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (signInErr) {
          throw new Error(signInErr.message);
        }
        if (data.user) {
          onAuthSuccess(data.user, 'Signed in successfully!');
        }
      } else {
        const cleanName = fullName.trim();
        const { data, error: signUpErr } = await client.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            emailRedirectTo: getRedirectUrl(),
            data: cleanName ? { full_name: cleanName } : undefined,
          },
        });
        if (signUpErr) {
          throw new Error(signUpErr.message);
        }

        if (data.session && data.user) {
          onAuthSuccess(data.user, 'Account created! Welcome to VeriBox.');
        } else if (data.user) {
          setNotice(
            `Confirmation link sent to ${trimmedEmail}. Please verify your email, then sign in.`
          );
          setMode('signin');
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Authentication failed. Please check your details.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border border-[#D4AF37]/40 bg-white shadow-2xl dark:bg-[#14120D]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#D4AF37]/20 p-4 sm:p-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-[#D4AF37] bg-[#14120D] shadow-md shadow-[#D4AF37]/20">
              <img
                src="/pwa-192x192.png"
                alt="VeriBox"
                className="h-full w-full object-cover scale-105"
              />
            </div>
            <div className="min-w-0">
              <h2
                id="auth-modal-title"
                className="font-display text-lg font-extrabold text-[#1A160D] truncate dark:text-[#FAF6EC]"
              >
                {mode === 'signin' ? 'Sign In to VeriBox' : 'Create VeriBox Account'}
              </h2>
              <p className="text-xs text-[#6E6552] truncate dark:text-[#A89F8C]">
                {actionReason || 'Access temp emails, OTP numbers, wallet & images'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication modal"
            className="flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-xl text-[#6E6552] hover:bg-[#D4AF37]/15 dark:text-[#A89F8C] dark:hover:bg-[#D4AF37]/15"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[82vh] overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Prominent Continue with Google */}
          <button
            type="button"
            onClick={() => void handleGoogleSignIn()}
            disabled={googleLoading || submitting}
            className="flex min-h-[50px] w-full items-center justify-center gap-3 rounded-2xl border-2 border-[#D4AF37]/60 bg-[#FAF7F0] px-4 py-2.5 text-sm font-extrabold text-[#1A160D] shadow-sm transition-all hover:border-[#D4AF37] hover:bg-white hover:shadow-md active:scale-[0.98] disabled:opacity-60 cursor-pointer dark:bg-[#0B0A07] dark:text-[#FAF6EC] dark:hover:bg-[#19160F]"
          >
            {googleLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-[#D4AF37]" />
                <span>Connecting to Google...</span>
              </>
            ) : (
              <>
                <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-[#D4AF37]/20" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#8A7F6A] dark:text-[#A89F8C]">
              or continue with email
            </span>
            <div className="h-px flex-1 bg-[#D4AF37]/20" />
          </div>

          {/* Sign In / Sign Up Tabs */}
          <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-[#D4AF37]/25 bg-[#FAF7F0] p-1 dark:bg-[#0B0A07]">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError(null);
              }}
              className={`min-h-[40px] rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                mode === 'signin'
                  ? 'bg-[#D4AF37] text-[#0A0906] shadow-sm'
                  : 'text-[#6E6552] hover:text-[#1A160D] dark:text-[#A89F8C] dark:hover:text-[#FAF6EC]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
              className={`min-h-[40px] rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                mode === 'signup'
                  ? 'bg-[#D4AF37] text-[#0A0906] shadow-sm'
                  : 'text-[#6E6552] hover:text-[#1A160D] dark:text-[#A89F8C] dark:hover:text-[#FAF6EC]'
              }`}
            >
              Sign Up
            </button>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/35 bg-rose-500/10 p-3 text-xs font-medium text-rose-700 dark:text-rose-200">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-700 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-500" />
              <span>{notice}</span>
            </div>
          )}

          {/* Email & Password Form */}
          <form onSubmit={(e) => void handleEmailSubmit(e)} className="space-y-3.5">
            {mode === 'signup' && (
              <div>
                <label
                  htmlFor="auth-fullname"
                  className="mb-1 block text-xs font-bold text-[#6E6552] dark:text-[#A89F8C]"
                >
                  Full Name (optional)
                </label>
                <div className="relative">
                  <UserIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A7F6A]" />
                  <input
                    id="auth-fullname"
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your name"
                    className="h-11 w-full rounded-xl border border-[#D4AF37]/35 bg-[#FAF7F0] pl-10 pr-3.5 text-sm text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
                  />
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="auth-email"
                className="mb-1 block text-xs font-bold text-[#6E6552] dark:text-[#A89F8C]"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A7F6A]" />
                <input
                  id="auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-11 w-full rounded-xl border border-[#D4AF37]/35 bg-[#FAF7F0] pl-10 pr-3.5 text-sm text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="mb-1 block text-xs font-bold text-[#6E6552] dark:text-[#A89F8C]"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A7F6A]" />
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signin' ? 'Enter your password' : 'At least 6 characters'}
                  className="h-11 w-full rounded-xl border border-[#D4AF37]/35 bg-[#FAF7F0] pl-10 pr-11 text-sm text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0B0A07] dark:text-[#FAF6EC]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#6E6552] hover:bg-[#D4AF37]/10 dark:text-[#A89F8C]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || googleLoading}
              className="mt-1 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-[#D4AF37] px-5 py-3 text-sm font-extrabold text-[#0A0906] shadow-lg shadow-[#D4AF37]/25 transition-all hover:bg-[#E5C150] active:scale-[0.98] disabled:opacity-60 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{mode === 'signin' ? 'Signing In...' : 'Creating Account...'}</span>
                </>
              ) : (
                <>
                  <span>{mode === 'signin' ? 'Sign In' : 'Create Account'}</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] font-medium text-[#8A7F6A] dark:text-[#A89F8C]">
            <ShieldCheck className="h-3.5 w-3.5 text-[#D4AF37]" />
            <span>Secured with Supabase Authentication</span>
          </div>
        </div>
      </div>
    </div>
  );
}
