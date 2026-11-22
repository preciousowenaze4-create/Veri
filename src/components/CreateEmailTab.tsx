import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Lock,
  RotateCw,
  Shield,
  ShieldCheck,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import type { AccountMode, EmailSuggestionOption, TempEmailAccount } from '../types';

interface CreateEmailTabProps {
  savedEmails: TempEmailAccount[];
  onComplete: (account: TempEmailAccount) => void;
  onSelectExisting: (account: TempEmailAccount) => void;
  onCancel: () => void;
  onShowToast: (msg: string) => void;
}

type BrowserScreen = 'signin' | 'birthdate' | 'choose' | 'password' | 'terms';

const MONTH_OPTIONS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const GENDER_OPTIONS = ['Rather not say', 'Female', 'Male', 'Custom'];

function modeLabel(mode: AccountMode): string {
  if (mode === 'business') return 'For work or business';
  if (mode === 'privacy') return 'High-privacy stealth';
  return 'For my personal use';
}

export function CreateEmailTab({
  savedEmails,
  onComplete,
  onSelectExisting,
  onCancel,
  onShowToast,
}: CreateEmailTabProps) {
  // Navigation State
  const [inBrowser, setInBrowser] = useState(false);
  const [screen, setScreen] = useState<BrowserScreen>('signin');
  const [isBrowserLoading, setIsBrowserLoading] = useState(false);
  const [browserProgress, setBrowserProgress] = useState(0);

  // Form State
  const [accountMode, setAccountMode] = useState<AccountMode>('personal');
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');

  // Birthday & Profile
  const [birthMonth, setBirthMonth] = useState('December');
  const [birthDay, setBirthDay] = useState('18');
  const [birthYear, setBirthYear] = useState('2000');
  const [gender, setGender] = useState('Rather not say');

  // Password
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Email Choices
  const [options, setOptions] = useState<EmailSuggestionOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<EmailSuggestionOption | null>(null);

  // Terms Checkboxes
  const [agreeSpamShield, setAgreeSpamShield] = useState(true);
  const [agreeOtpExtract, setAgreeOtpExtract] = useState(true);
  const [agreeEncryption, setAgreeEncryption] = useState(true);

  // Error & Submission
  const [error, setError] = useState<string | null>(null);
  const [creatingFinal, setCreatingFinal] = useState(false);

  // Trigger smooth simulated browser page loading
  const navigateBrowserTo = (nextScreen: BrowserScreen, delayMs = 380) => {
    setIsBrowserLoading(true);
    setBrowserProgress(35);
    const pTimer = setTimeout(() => setBrowserProgress(85), 180);

    setTimeout(() => {
      clearTimeout(pTimer);
      setBrowserProgress(100);
      setScreen(nextScreen);
      setError(null);
      setIsBrowserLoading(false);
      setTimeout(() => setBrowserProgress(0), 200);
    }, delayMs);
  };

  const handleLaunchBrowser = () => {
    setInBrowser(true);
    navigateBrowserTo('signin', 300);
  };

  const handleCloseBrowser = () => {
    setInBrowser(false);
    setScreen('signin');
    setError(null);
  };

  // STEP 1: Sign in Screen -> Next
  const handleSignInNext = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const query = usernameInput.trim().toLowerCase();
    // If user enters an existing email, log in directly
    if (query && query.includes('@')) {
      const match = savedEmails.find((a) => a.address.toLowerCase() === query);
      if (match) {
        onSelectExisting(match);
        return;
      }
    }

    // Proceed to Birthday & Basic info
    navigateBrowserTo('birthdate');
  };

  // STEP 2: Birthday & Age -> Next (Fetches live email choices)
  const handleBirthdateNext = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const yr = Number(birthYear);
    if (!birthYear || isNaN(yr) || yr < 1920 || yr > 2026) {
      setError('Please enter a valid birth year (e.g. 2000)');
      return;
    }

    setIsBrowserLoading(true);
    setBrowserProgress(50);
    try {
      const cleanName = usernameInput.trim().replace(/[^a-zA-Z0-9]/g, '') || 'veribox';
      const params = new URLSearchParams({
        firstName: cleanName,
        lastName: birthYear.slice(-2),
      });
      const res = await fetch(`/api/email/suggestions?${params.toString()}`);
      const data = (await res.json()) as {
        options?: EmailSuggestionOption[];
        error?: string;
      };

      if (!res.ok || !Array.isArray(data.options) || data.options.length === 0) {
        throw new Error(data.error || 'Could not load email choices');
      }

      setOptions(data.options);
      setSelectedOption(data.options[0]);
      setBrowserProgress(100);
      setScreen('choose');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate email choices');
    } finally {
      setIsBrowserLoading(false);
      setTimeout(() => setBrowserProgress(0), 200);
    }
  };

  // STEP 3: Choose Email Address -> Next
  const handleChooseNext = () => {
    setError(null);
    if (!selectedOption) {
      setError('Please select an email address');
      return;
    }
    navigateBrowserTo('password');
  };

  // STEP 4: Password -> Next
  const handlePasswordNext = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.trim().length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    navigateBrowserTo('terms');
  };

  // STEP 5: Privacy & Terms Scroll -> Allow (Creates Live Account)
  const handleAllowAndFinish = async () => {
    if (!selectedOption) return;
    setError(null);
    setCreatingFinal(true);
    setIsBrowserLoading(true);
    setBrowserProgress(60);

    try {
      const res = await fetch('/api/email/create-selected', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedOption.provider,
          username: selectedOption.username,
          domain: selectedOption.domain,
          address: selectedOption.address,
          precreatedToken: selectedOption.precreatedToken,
          password: password.trim() || 'VeriBox#2026',
        }),
      });

      const data = (await res.json()) as TempEmailAccount & { error?: string };
      if (!res.ok || !data.address) {
        throw new Error(data.error || 'Account creation failed');
      }

      setBrowserProgress(100);

      const newAccount: TempEmailAccount = {
        id: data.id,
        address: data.address,
        password: data.password || password.trim(),
        token: data.token,
        provider: data.provider || 'tempmailio',
        createdAt: data.createdAt || new Date().toISOString(),
        accountMode,
        displayName: usernameInput.trim() || undefined,
      };

      onShowToast(`Email live: ${newAccount.address}`);
      // Return user directly back to the Home page with their new email ready
      onComplete(newAccount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not finalize email account');
      setCreatingFinal(false);
      setIsBrowserLoading(false);
    }
  };

  // Browser Address Bar Label based on current screen
  const browserUrl =
    screen === 'signin'
      ? 'https://accounts.veribox.net/v3/signin/identifier'
      : screen === 'birthdate'
        ? 'https://accounts.veribox.net/v3/signup/basicinfo'
        : screen === 'choose'
          ? 'https://accounts.veribox.net/v3/signup/webaddress'
          : screen === 'password'
            ? 'https://accounts.veribox.net/v3/signup/passwd'
            : 'https://accounts.veribox.net/v3/signup/privacyterms';

  // 1. INITIAL GOOGLE-STYLE SSO TRIGGER CARD
  if (!inBrowser) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col justify-center py-4 sm:py-8">
        <section className="rounded-3xl border border-[#D4AF37]/35 bg-white p-6 shadow-xl sm:p-7 dark:bg-[#12100B]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#D4AF37]/15 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#D4AF37] bg-[#14120D] shadow-sm">
                <img
                  src="/pwa-192x192.png"
                  alt="VeriBox"
                  className="h-full w-full object-cover scale-105"
                />
              </div>
              <div>
                <h1 className="font-display text-base font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
                  VeriBox Mail
                </h1>
                <p className="text-xs text-[#6E6552] dark:text-[#A89F8C]">
                  High-speed private disposable email
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl px-2.5 py-1 text-xs font-bold text-[#7B6F57] hover:bg-[#D4AF37]/10 dark:text-[#A89F8C]"
            >
              Home
            </button>
          </div>

          <div className="mt-6 text-center">
            <h2 className="font-display text-xl sm:text-2xl font-black tracking-tight text-[#1A160D] dark:text-[#FAF6EC]">
              Create an Email Account
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm text-[#6E6552] dark:text-[#A89F8C]">
              Receive OTPs, registration codes, and signups with zero spam
            </p>
          </div>

          {/* Long curved Google-style button with our app logo */}
          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={handleLaunchBrowser}
              className="group flex min-h-[56px] w-full items-center justify-between gap-3 rounded-full border-2 border-[#D4AF37]/50 bg-[#FAF7F0] p-1.5 pl-2 pr-5 transition-all hover:border-[#D4AF37] hover:bg-white hover:shadow-lg hover:scale-[1.01] active:scale-98 dark:bg-[#0B0A07] dark:hover:bg-[#14120D] cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#D4AF37] bg-[#14120D] shadow-inner transition-transform group-hover:scale-105">
                  <img
                    src="/pwa-192x192.png"
                    alt="VeriBox"
                    className="h-full w-full object-cover scale-110"
                  />
                </div>
                <div className="text-left min-w-0">
                  <p className="font-display text-sm sm:text-base font-extrabold tracking-tight text-[#1A160D] truncate dark:text-[#FAF6EC]">
                    Continue with VeriBox Mail
                  </p>
                  <p className="text-[11px] text-[#8A7F6A] truncate dark:text-[#A89F8C]">
                    Google-style instant browser setup
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-[#D4AF37] transition-transform group-hover:translate-x-1" />
            </button>
          </div>

          <div className="mt-6 rounded-2xl border border-[#D4AF37]/20 bg-[#FAF7F0]/60 p-4 dark:bg-[#0A0906]/60">
            <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-[#6E6552] dark:text-[#D5CCB8]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-[#D4AF37]" />
                <span>Zero Tracking</span>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-[#D4AF37]" />
                <span>Instant Activation</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // 2. SIMULATED IN-APP MOBILE BROWSER EXPERIENCE
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col justify-center py-2 sm:py-5">
      {/* Browser Window Device Shell */}
      <div className="overflow-hidden rounded-3xl border-2 border-[#D4AF37]/40 bg-white shadow-2xl dark:bg-[#12100B]">
        {/* Top Browser Header Chrome Bar */}
        <div className="border-b border-[#D4AF37]/25 bg-[#FAF7F0] px-3.5 py-2.5 dark:bg-[#0A0906]">
          <div className="flex items-center justify-between gap-2.5">
            {/* Traffic Light Window Dots */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
            </div>

            {/* Address Bar */}
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-[#D4AF37]/25 bg-white px-3 py-1 dark:bg-[#14120D]">
              <Lock className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span className="truncate font-mono text-[11px] text-[#6E6552] dark:text-[#A89F8C]">
                {browserUrl}
              </span>
            </div>

            {/* Browser Controls */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => navigateBrowserTo(screen, 300)}
                aria-label="Refresh browser page"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[#6E6552] hover:bg-[#D4AF37]/15 dark:text-[#A89F8C]"
              >
                <RotateCw className={`h-3.5 w-3.5 ${isBrowserLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={handleCloseBrowser}
                aria-label="Close browser"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[#6E6552] hover:bg-[#D4AF37]/15 dark:text-[#A89F8C]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Animated Page Load Progress Bar */}
          <div className="relative mt-2 h-0.5 w-full overflow-hidden bg-transparent">
            {isBrowserLoading && (
              <div
                className="h-full bg-gradient-to-r from-[#D4AF37] to-[#F5D77A] transition-all duration-300 ease-out"
                style={{ width: `${browserProgress}%` }}
              />
            )}
          </div>
        </div>

        {/* Browser Viewport Content Container */}
        <div className="p-5 sm:p-7 min-h-[460px] flex flex-col justify-between">
          <div>
            {/* Logo Emblem Header inside Web Page */}
            <div className="flex items-center justify-between border-b border-[#D4AF37]/15 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#D4AF37] bg-[#14120D]">
                  <img
                    src="/pwa-192x192.png"
                    alt="VeriBox"
                    className="h-full w-full object-cover scale-105"
                  />
                </div>
                <div>
                  <p className="font-display text-sm font-black text-[#1A160D] dark:text-[#FAF6EC]">
                    VeriBox Mail
                  </p>
                  <p className="text-[10px] text-[#8A7F6A] dark:text-[#A89F8C]">
                    accounts.veribox.net
                  </p>
                </div>
              </div>
              <span className="rounded-full border border-[#D4AF37]/30 bg-[#FAF7F0] px-2.5 py-0.5 text-[10px] font-bold text-[#8A6208] dark:bg-[#0B0A07] dark:text-[#F5D77A]">
                Secure Connection
              </span>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-rose-500/35 bg-rose-500/10 p-3 text-xs font-semibold text-rose-700 dark:text-rose-200">
                {error}
              </div>
            )}

            {/* SCREEN 1: SIGN IN (The second image without recent emails) */}
            {screen === 'signin' && (
              <form onSubmit={handleSignInNext} className="mt-6 space-y-4">
                <div>
                  <h2 className="font-display text-2xl font-black tracking-tight text-[#1A160D] dark:text-[#FAF6EC]">
                    Sign in
                  </h2>
                  <p className="mt-0.5 text-xs text-[#6E6552] dark:text-[#A89F8C]">
                    to continue to VeriBox Mail
                  </p>
                </div>

                <div className="pt-2">
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="Email or preferred username"
                    className="h-12 w-full rounded-xl border border-[#D4AF37]/35 bg-[#FAF7F0] px-4 font-mono text-sm font-semibold text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0A0906] dark:text-[#FAF6EC]"
                  />
                </div>

                {/* Create Account Selector Menu */}
                <div className="relative pt-2">
                  <button
                    type="button"
                    onClick={() => setCreateMenuOpen((prev) => !prev)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold text-[#8A6208] hover:bg-[#D4AF37]/10 dark:text-[#F5D77A]"
                  >
                    <span>Create account: {modeLabel(accountMode)}</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${
                        createMenuOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {createMenuOpen && (
                    <div className="absolute left-0 z-30 mt-1 w-64 overflow-hidden rounded-2xl border border-[#D4AF37]/35 bg-white p-1.5 shadow-2xl dark:bg-[#19160F]">
                      <button
                        type="button"
                        onClick={() => {
                          setAccountMode('personal');
                          setCreateMenuOpen(false);
                        }}
                        className="flex min-h-[42px] w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-[#1A160D] hover:bg-[#D4AF37]/15 dark:text-[#FAF6EC]"
                      >
                        <User className="h-4 w-4 text-[#D4AF37]" />
                        <span>For my personal use</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAccountMode('business');
                          setCreateMenuOpen(false);
                        }}
                        className="flex min-h-[42px] w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-[#1A160D] hover:bg-[#D4AF37]/15 dark:text-[#FAF6EC]"
                      >
                        <Briefcase className="h-4 w-4 text-[#D4AF37]" />
                        <span>For work or business</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAccountMode('privacy');
                          setCreateMenuOpen(false);
                        }}
                        className="flex min-h-[42px] w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-[#1A160D] hover:bg-[#D4AF37]/15 dark:text-[#FAF6EC]"
                      >
                        <Shield className="h-4 w-4 text-[#D4AF37]" />
                        <span>High-privacy stealth</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end pt-4">
                  <button
                    type="submit"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#D4AF37] px-7 py-2.5 text-xs font-extrabold text-[#0A0906] hover:bg-[#E5C150] shadow-md"
                  >
                    <span>Next</span>
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </button>
                </div>
              </form>
            )}

            {/* SCREEN 2: BIRTHDAY & AGE / DATE */}
            {screen === 'birthdate' && (
              <form onSubmit={handleBirthdateNext} className="mt-6 space-y-4">
                <div>
                  <h2 className="font-display text-2xl font-black tracking-tight text-[#1A160D] dark:text-[#FAF6EC]">
                    Basic information
                  </h2>
                  <p className="mt-0.5 text-xs text-[#6E6552] dark:text-[#A89F8C]">
                    Enter your birthday and gender
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2">
                  {/* Month */}
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-[#6E6552] dark:text-[#A89F8C]">
                      Month
                    </label>
                    <select
                      value={birthMonth}
                      onChange={(e) => setBirthMonth(e.target.value)}
                      className="h-11 w-full rounded-xl border border-[#D4AF37]/35 bg-[#FAF7F0] px-2.5 text-xs font-semibold text-[#1A160D] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0A0906] dark:text-[#FAF6EC]"
                    >
                      {MONTH_OPTIONS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Day */}
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-[#6E6552] dark:text-[#A89F8C]">
                      Day
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={birthDay}
                      onChange={(e) => setBirthDay(e.target.value)}
                      placeholder="18"
                      className="h-11 w-full rounded-xl border border-[#D4AF37]/35 bg-[#FAF7F0] px-3 font-mono text-xs font-semibold text-[#1A160D] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0A0906] dark:text-[#FAF6EC]"
                    />
                  </div>

                  {/* Year */}
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-[#6E6552] dark:text-[#A89F8C]">
                      Year
                    </label>
                    <input
                      type="number"
                      min={1920}
                      max={2026}
                      value={birthYear}
                      onChange={(e) => setBirthYear(e.target.value)}
                      placeholder="2000"
                      className="h-11 w-full rounded-xl border border-[#D4AF37]/35 bg-[#FAF7F0] px-3 font-mono text-xs font-semibold text-[#1A160D] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0A0906] dark:text-[#FAF6EC]"
                    />
                  </div>
                </div>

                {/* Gender */}
                <div className="pt-1">
                  <label className="mb-1 block text-[11px] font-bold text-[#6E6552] dark:text-[#A89F8C]">
                    Gender
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="h-11 w-full rounded-xl border border-[#D4AF37]/35 bg-[#FAF7F0] px-3 text-xs font-semibold text-[#1A160D] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0A0906] dark:text-[#FAF6EC]"
                  >
                    {GENDER_OPTIONS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between pt-6">
                  <button
                    type="button"
                    onClick={() => navigateBrowserTo('signin')}
                    className="inline-flex min-h-[42px] items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-[#7B6F57] hover:bg-[#D4AF37]/10 dark:text-[#A89F8C]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="submit"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#D4AF37] px-7 py-2.5 text-xs font-extrabold text-[#0A0906] hover:bg-[#E5C150] shadow-md"
                  >
                    <span>Next</span>
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </button>
                </div>
              </form>
            )}

            {/* SCREEN 3: CHOOSE EMAIL ADDRESS */}
            {screen === 'choose' && (
              <div className="mt-6 space-y-4">
                <div>
                  <h2 className="font-display text-2xl font-black tracking-tight text-[#1A160D] dark:text-[#FAF6EC]">
                    Choose your email address
                  </h2>
                  <p className="mt-0.5 text-xs text-[#6E6552] dark:text-[#A89F8C]">
                    Select an address generated from your details
                  </p>
                </div>

                <div className="divide-y divide-[#D4AF37]/15 overflow-hidden rounded-2xl border border-[#D4AF37]/25 bg-[#FAF7F0]/70 dark:bg-[#0A0906]">
                  {options.map((opt) => {
                    const isSelected = selectedOption?.id === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSelectedOption(opt)}
                        className={`flex min-h-[50px] w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors ${
                          isSelected ? 'bg-[#D4AF37]/15' : 'hover:bg-[#D4AF37]/10'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                              isSelected
                                ? 'border-[#D4AF37] bg-[#D4AF37] text-[#0A0906]'
                                : 'border-[#8A7F6A]'
                            }`}
                          >
                            {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                          </span>
                          <span className="truncate font-mono text-xs font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                            {opt.address}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-6">
                  <button
                    type="button"
                    onClick={() => navigateBrowserTo('birthdate')}
                    className="inline-flex min-h-[42px] items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-[#7B6F57] hover:bg-[#D4AF37]/10 dark:text-[#A89F8C]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleChooseNext}
                    disabled={!selectedOption}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#D4AF37] px-7 py-2.5 text-xs font-extrabold text-[#0A0906] hover:bg-[#E5C150] shadow-md disabled:opacity-60"
                  >
                    <span>Next</span>
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* SCREEN 4: PASSWORD */}
            {screen === 'password' && (
              <form onSubmit={handlePasswordNext} className="mt-6 space-y-4">
                <div>
                  <h2 className="font-display text-2xl font-black tracking-tight text-[#1A160D] dark:text-[#FAF6EC]">
                    Create a strong password
                  </h2>
                  <p className="mt-0.5 text-xs text-[#6E6552] dark:text-[#A89F8C]">
                    Create a password with letters and numbers
                  </p>
                </div>

                <div className="pt-2 space-y-3">
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      className="h-12 w-full rounded-xl border border-[#D4AF37]/35 bg-[#FAF7F0] pl-4 pr-11 text-sm font-semibold text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0A0906] dark:text-[#FAF6EC]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#6E6552] hover:bg-[#D4AF37]/10 dark:text-[#A89F8C]"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-[#6E6552] dark:text-[#A89F8C]">
                    <input
                      type="checkbox"
                      checked={showPassword}
                      onChange={(e) => setShowPassword(e.target.checked)}
                      className="h-4 w-4 rounded border-[#D4AF37]/40 accent-[#D4AF37]"
                    />
                    <span>Show password</span>
                  </label>
                </div>

                <div className="flex items-center justify-between pt-6">
                  <button
                    type="button"
                    onClick={() => navigateBrowserTo('choose')}
                    className="inline-flex min-h-[42px] items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-[#7B6F57] hover:bg-[#D4AF37]/10 dark:text-[#A89F8C]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="submit"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#D4AF37] px-7 py-2.5 text-xs font-extrabold text-[#0A0906] hover:bg-[#E5C150] shadow-md"
                  >
                    <span>Next</span>
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </button>
                </div>
              </form>
            )}

            {/* SCREEN 5: PRIVACY & TERMS SCROLL WITH ALLOW */}
            {screen === 'terms' && selectedOption && (
              <div className="mt-6 space-y-4">
                <div>
                  <h2 className="font-display text-2xl font-black tracking-tight text-[#1A160D] dark:text-[#FAF6EC]">
                    Privacy and Terms
                  </h2>
                  <p className="mt-0.5 text-xs text-[#6E6552] dark:text-[#A89F8C]">
                    Scroll and review your options, then tap Allow to activate
                  </p>
                </div>

                {/* Selected email summary chip */}
                <div className="rounded-xl border border-[#D4AF37]/30 bg-[#FAF7F0] p-3 dark:bg-[#0A0906]">
                  <p className="text-[11px] font-bold text-[#8A7F6A]">Your Account Address:</p>
                  <p className="font-mono text-xs font-bold text-[#8A6208] dark:text-[#F5D77A] truncate">
                    {selectedOption.address}
                  </p>
                </div>

                {/* Scrollable Terms & Options Box */}
                <div className="max-h-48 overflow-y-auto space-y-2 rounded-2xl border border-[#D4AF37]/25 bg-[#FAF7F0]/60 p-3.5 text-xs text-[#3E3522] dark:bg-[#0A0906]/80 dark:text-[#D5CCB8]">
                  <p className="font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                    Terms of VeriBox Ephemeral Mail:
                  </p>
                  <p className="leading-relaxed">
                    By tapping Allow, you agree to the VeriBox disposable mailbox protocols. Your
                    inbox will receive incoming emails, verification codes, and signups in real time.
                  </p>

                  <div className="pt-2 space-y-2">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agreeSpamShield}
                        onChange={(e) => setAgreeSpamShield(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-[#D4AF37]/40 accent-[#D4AF37]"
                      />
                      <span>Automatic incoming bot &amp; spam shielding</span>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agreeOtpExtract}
                        onChange={(e) => setAgreeOtpExtract(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-[#D4AF37]/40 accent-[#D4AF37]"
                      />
                      <span>Automatic OTP code extraction &amp; copy icon</span>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={agreeEncryption}
                        onChange={(e) => setAgreeEncryption(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-[#D4AF37]/40 accent-[#D4AF37]"
                      />
                      <span>Encrypted session memory on this device</span>
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-5">
                  <button
                    type="button"
                    onClick={() => navigateBrowserTo('password')}
                    disabled={creatingFinal}
                    className="inline-flex min-h-[42px] items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-[#7B6F57] hover:bg-[#D4AF37]/10 dark:text-[#A89F8C]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Back</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleAllowAndFinish()}
                    disabled={creatingFinal}
                    className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-full bg-[#D4AF37] px-8 py-2.5 text-xs font-black text-[#0A0906] hover:bg-[#E5C150] shadow-lg shadow-[#D4AF37]/25 disabled:opacity-60 cursor-pointer"
                  >
                    {creatingFinal ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Activating...</span>
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 stroke-[3]" />
                        <span>Allow</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
