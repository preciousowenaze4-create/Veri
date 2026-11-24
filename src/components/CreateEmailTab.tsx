import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  RotateCw,
  Shield,
  ShieldCheck,
  User,
  Wallet,
  X,
} from 'lucide-react';
import type { AccountMode, EmailSuggestionOption, TempEmailAccount } from '../types';
import { parseJsonResponse } from '../utils/apiFetch';
import {
  CUSTOM_EMAIL_DOMAIN,
  generateCustomDomainSuggestions,
  normalizeCustomUsername,
} from '../utils/directEmailFallback';

const CREATE_EMAIL_FEE_NGN = 50;

interface CreateEmailTabProps {
  emailDomain?: string;
  isAuthenticated?: boolean;
  onRequireAuth?: (reason?: string) => void;
  walletBalance?: number;
  walletUserId?: string;
  onWalletBalanceChange?: (nextBalance: number) => void;
  onOpenDeposit?: () => void;
  savedEmails: TempEmailAccount[];
  deletedEmails?: TempEmailAccount[];
  onComplete: (account: TempEmailAccount) => void;
  onSelectExisting: (account: TempEmailAccount) => void;
  onCancel: () => void;
  onShowToast: (msg: string) => void;
}

type BrowserScreen =
  | 'signin'
  | 'signin-password'
  | 'name'
  | 'birthdate'
  | 'choose'
  | 'password'
  | 'terms';

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
  emailDomain = CUSTOM_EMAIL_DOMAIN,
  isAuthenticated = true,
  onRequireAuth,
  walletBalance = 0,
  walletUserId = 'default-wallet',
  onWalletBalanceChange,
  onOpenDeposit,
  savedEmails,
  deletedEmails = [],
  onComplete,
  onSelectExisting,
  onCancel,
  onShowToast,
}: CreateEmailTabProps) {
  const activeDomain =
    (emailDomain || CUSTOM_EMAIL_DOMAIN).trim().toLowerCase().replace(/^@+/, '') ||
    CUSTOM_EMAIL_DOMAIN;

  // Navigation State
  const [inBrowser, setInBrowser] = useState(false);
  const [screen, setScreen] = useState<BrowserScreen>('signin');
  const [isBrowserLoading, setIsBrowserLoading] = useState(false);
  const [browserProgress, setBrowserProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);

  // Form State
  const [accountMode, setAccountMode] = useState<AccountMode>('personal');
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  // Existing Email Login / Recovery State
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [showRecoveryPassword, setShowRecoveryPassword] = useState(false);
  const [verifyingLogin, setVerifyingLogin] = useState(false);

  // Birthday & Profile
  const [birthMonth, setBirthMonth] = useState('December');
  const [birthDay, setBirthDay] = useState('18');
  const [birthYear, setBirthYear] = useState('2000');
  const [gender, setGender] = useState('Rather not say');

  // Password for new account
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Email Choices & ₦50 Fee Session Tracking
  const [options, setOptions] = useState<EmailSuggestionOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<EmailSuggestionOption | null>(null);
  const [customUsername, setCustomUsername] = useState('');
  const [checkingCustom, setCheckingCustom] = useState(false);
  const [customStatus, setCustomStatus] = useState<{
    available: boolean;
    address: string;
    message: string;
  } | null>(null);
  const [paidSessionRef, setPaidSessionRef] = useState<string | null>(null);
  const paidSessionRefCurrent = useRef<string | null>(null);
  const [chargingCreateFee, setChargingCreateFee] = useState(false);
  const [liveServerBalance, setLiveServerBalance] = useState<number | null>(null);
  const walletUserIdRef = useRef(walletUserId);
  walletUserIdRef.current = walletUserId;
  const onWalletBalanceChangeRef = useRef(onWalletBalanceChange);
  onWalletBalanceChangeRef.current = onWalletBalanceChange;

  useEffect(() => {
    return () => {
      const refToRefund = paidSessionRefCurrent.current;
      if (!refToRefund) return;
      paidSessionRefCurrent.current = null;
      void fetch('/api/wallet/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: walletUserIdRef.current,
          amount: CREATE_EMAIL_FEE_NGN,
          reference: `refund-${refToRefund}`,
        }),
        keepalive: true,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { balance?: number | null } | null) => {
          if (d && typeof d.balance === 'number') {
            onWalletBalanceChangeRef.current?.(d.balance);
          }
        })
        .catch(() => undefined);
    };
  }, []);

  // Terms Checkboxes
  const [agreeSpamShield, setAgreeSpamShield] = useState(true);
  const [agreeOtpExtract, setAgreeOtpExtract] = useState(true);
  const [agreeEncryption, setAgreeEncryption] = useState(true);

  // Error & Submission
  const [error, setError] = useState<string | null>(null);
  const [creatingFinal, setCreatingFinal] = useState(false);

  const effectiveBalance =
    typeof liveServerBalance === 'number' ? liveServerBalance : walletBalance;

  useEffect(() => {
    setLiveServerBalance(walletBalance);
  }, [walletBalance]);

  useEffect(() => {
    if (!inBrowser || screen !== 'choose' || !isAuthenticated) return;
    let active = true;
    void (async () => {
      try {
        const res = await fetch(
          `/api/wallet/balance?userId=${encodeURIComponent(walletUserId)}`
        );
        if (!res.ok || !active) return;
        const data = await parseJsonResponse<{
          balance?: number | null;
          supabasePersisted?: boolean;
        }>(res);
        if (active && typeof data.balance === 'number') {
          setLiveServerBalance(data.balance);
          onWalletBalanceChange?.(data.balance);
        }
      } catch {
        // Keep prop balance
      }
    })();
    return () => {
      active = false;
    };
  }, [inBrowser, screen, isAuthenticated, walletUserId, onWalletBalanceChange]);

  const refundHeldCreateFee = async (reasonToast?: string) => {
    const refToRefund = paidSessionRefCurrent.current;
    if (!refToRefund) return;
    paidSessionRefCurrent.current = null;
    setPaidSessionRef(null);
    try {
      const res = await fetch('/api/wallet/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: walletUserId,
          amount: CREATE_EMAIL_FEE_NGN,
          reference: `refund-${refToRefund}`,
        }),
      });
      const data = await parseJsonResponse<{ balance?: number | null }>(res);
      if (res.ok && typeof data.balance === 'number') {
        setLiveServerBalance(data.balance);
        onWalletBalanceChange?.(data.balance);
      } else {
        const next = effectiveBalance + CREATE_EMAIL_FEE_NGN;
        setLiveServerBalance(next);
        onWalletBalanceChange?.(next);
      }
      if (reasonToast) {
        onShowToast(reasonToast);
      }
    } catch {
      // Best-effort refund
    }
  };

  // Trigger smooth browser page loading
  const navigateBrowserTo = (
    nextScreen: BrowserScreen,
    delayMs = 360,
    statusText?: string
  ) => {
    setError(null);
    setCreateMenuOpen(false);
    setLoadingMessage(statusText || null);
    setIsBrowserLoading(true);
    setBrowserProgress(35);
    const pTimer = setTimeout(() => setBrowserProgress(85), 160);

    setTimeout(() => {
      clearTimeout(pTimer);
      setBrowserProgress(100);
      setScreen(nextScreen);
      setError(null);
      setIsBrowserLoading(false);
      setLoadingMessage(null);
      setTimeout(() => setBrowserProgress(0), 200);
    }, delayMs);
  };

  const handleLaunchBrowser = () => {
    if (!isAuthenticated) {
      onRequireAuth?.('Sign in to create or recover a private VeriBox email');
      return;
    }
    setInBrowser(true);
    navigateBrowserTo('signin', 280);
  };

  const handleCloseBrowser = () => {
    void refundHeldCreateFee('Setup cancelled · ₦50 refunded to your wallet');
    setInBrowser(false);
    setScreen('signin');
    setCreateMenuOpen(false);
    setLoadingMessage(null);
    setError(null);
  };

  // STEP 1A: Sign in Screen -> Next (ONLY for logging into / recovering an existing @veribox.name.ng email)
  const handleSignInNext = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const rawQuery = usernameInput.trim().toLowerCase();
    if (!rawQuery) return;

    let query = rawQuery;
    if (!query.includes('@')) {
      const norm = normalizeCustomUsername(query);
      if (!norm || norm.length < 3) {
        setError(
          `Enter your @${activeDomain} email (e.g. name@${activeDomain}) to sign in, or choose an option under Create account below.`
        );
        return;
      }
      query = `${norm}@${activeDomain}`;
    } else {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(query)) {
        setError(
          `Enter a valid @${activeDomain} email address to sign in, or choose an option under Create account below.`
        );
        return;
      }
      if (!query.endsWith(`@${activeDomain}`)) {
        setError(
          `Only @${activeDomain} mailboxes are supported here. Enter your @${activeDomain} address or create a new one below.`
        );
        return;
      }
    }

    setIsBrowserLoading(true);
    setBrowserProgress(45);
    setLoadingMessage(`Checking ${activeDomain} directory...`);

    try {
      const localMatch =
        savedEmails.find((a) => a.address.toLowerCase() === query) ||
        deletedEmails.find((a) => a.address.toLowerCase() === query) ||
        null;

      let existsOnServer = false;
      try {
        const res = await fetch('/api/email/check-exists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: query }),
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = await parseJsonResponse<{ exists?: boolean }>(res);
          existsOnServer = Boolean(data.exists);
        }
      } catch {
        // Fall back to local cache check
      }

      if (!localMatch && !existsOnServer) {
        setError(
          `No mailbox found for ${query}. Check the spelling or choose an option under Create account below.`
        );
        return;
      }

      setRecoveryEmail(localMatch?.address || query);
      setRecoveryPassword('');
      setShowRecoveryPassword(false);
      setBrowserProgress(100);
      setScreen('signin-password');
    } finally {
      setIsBrowserLoading(false);
      setLoadingMessage(null);
      setTimeout(() => setBrowserProgress(0), 200);
    }
  };

  // STEP 1B: Selecting Personal / Business / Privacy automatically loads Name entry screen first
  const handleSelectAccountModeAndStart = (mode: AccountMode) => {
    setAccountMode(mode);
    setCreateMenuOpen(false);
    setError(null);
    const label =
      mode === 'business'
        ? 'Loading business email setup...'
        : mode === 'privacy'
          ? 'Loading high-privacy stealth setup...'
          : 'Loading personal email setup...';
    navigateBrowserTo('name', 420, label);
  };

  // STEP 1D: First Name & Second Name -> Next (Proceeds to Birthday & Age)
  const handleNameNext = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanFirst = firstName.trim();
    if (cleanFirst.length < 2) {
      setError('Please enter your first name (at least 2 letters).');
      return;
    }
    navigateBrowserTo('birthdate', 320);
  };

  // STEP 1C: Verify password to sign in / recover an existing or deleted email
  const handleVerifyRecoverySignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const enteredPass = recoveryPassword.trim();
    if (!enteredPass) {
      setError('Please enter the password for this email account.');
      return;
    }

    const cleanAddr = recoveryEmail.trim().toLowerCase();
    const localMatch =
      savedEmails.find((a) => a.address.toLowerCase() === cleanAddr) ||
      deletedEmails.find((a) => a.address.toLowerCase() === cleanAddr) ||
      null;

    setVerifyingLogin(true);
    setIsBrowserLoading(true);
    setBrowserProgress(55);

    try {
      // Check server login / @veribox.name.ng mailbox registry
      try {
        const res = await fetch('/api/email/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: cleanAddr, password: enteredPass }),
          signal: AbortSignal.timeout(7000),
        });
        const data = await parseJsonResponse<{
          token?: string;
          id?: string;
          address?: string;
          provider?: TempEmailAccount['provider'];
          domain?: string;
          createdAt?: string;
          accountMode?: AccountMode;
          displayName?: string;
          error?: string;
        }>(res);

        if (res.ok && data.token) {
          setBrowserProgress(100);
          const restored: TempEmailAccount = {
            id: data.id || localMatch?.id || data.token,
            address: data.address || localMatch?.address || cleanAddr,
            password: enteredPass,
            token: data.token,
            provider: 'veribox',
            domain: data.domain || localMatch?.domain || activeDomain,
            createdAt: data.createdAt || localMatch?.createdAt || new Date().toISOString(),
            accountMode: data.accountMode || localMatch?.accountMode,
            displayName: data.displayName || localMatch?.displayName,
          };
          onShowToast(`Signed into ${restored.address}`);
          onSelectExisting(restored);
          return;
        }

        if (res.status === 401) {
          // If local match exists with password, double-check strictly before rejecting
          if (localMatch && localMatch.password && localMatch.password === enteredPass) {
            setBrowserProgress(100);
            onShowToast(`Recovered ${localMatch.address}`);
            onSelectExisting(localMatch);
            return;
          }
          setError(data.error || 'Incorrect password for this email address.');
          return;
        }
      } catch {
        // Fallback to local vault verification below
      }

      if (localMatch) {
        if (localMatch.password && localMatch.password !== enteredPass) {
          setError('Incorrect password for this email address.');
          return;
        }
        if (!localMatch.password) {
          setError(
            'This email was instant-generated without a password. Create a custom email to protect it with a password.'
          );
          return;
        }
        setBrowserProgress(100);
        onShowToast(`Recovered ${localMatch.address}`);
        onSelectExisting(localMatch);
        return;
      }

      setError('Could not verify password for this email. Check your credentials and try again.');
    } finally {
      setVerifyingLogin(false);
      setIsBrowserLoading(false);
      setTimeout(() => setBrowserProgress(0), 200);
    }
  };

  // STEP 2: Birthday & Age -> Next (Fetches live email choices personalized to First + Second Name)
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
    const cleanFirst = firstName.trim().replace(/[^a-zA-Z0-9]/g, '') || 'veribox';
    const cleanSecond =
      lastName.trim().replace(/[^a-zA-Z0-9]/g, '') || birthYear.slice(-2) || 'mail';

    try {
      const params = new URLSearchParams({
        firstName: cleanFirst,
        lastName: cleanSecond,
      });
      const res = await fetch(`/api/email/suggestions?${params.toString()}`, {
        signal: AbortSignal.timeout(6000),
      });
      const data = await parseJsonResponse<{
        options?: EmailSuggestionOption[];
        error?: string;
      }>(res);

      if (!res.ok || !Array.isArray(data.options) || data.options.length === 0) {
        throw new Error(data.error || 'Could not load email choices');
      }

      setOptions(data.options);
      setSelectedOption(data.options[0]);
      setCustomUsername('');
      setCustomStatus(null);
      setBrowserProgress(100);
      setScreen('choose');
    } catch {
      const fallbackOptions = generateCustomDomainSuggestions(cleanFirst, cleanSecond, activeDomain);
      setOptions(fallbackOptions);
      setSelectedOption(fallbackOptions[0]);
      setCustomUsername('');
      setCustomStatus(null);
      setBrowserProgress(100);
      setScreen('choose');
    } finally {
      setIsBrowserLoading(false);
      setTimeout(() => setBrowserProgress(0), 200);
    }
  };

  const handleCheckCustomUsername = async (): Promise<EmailSuggestionOption | null> => {
    setError(null);
    const norm = normalizeCustomUsername(customUsername);
    if (norm.length < 3) {
      const msg = 'Custom username must be at least 3 characters (letters, numbers, dot, _, -).';
      setCustomStatus({ available: false, address: '', message: msg });
      setError(msg);
      return null;
    }

    setCheckingCustom(true);
    try {
      const res = await fetch('/api/email/check-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: norm }),
        signal: AbortSignal.timeout(6000),
      });
      const data = await parseJsonResponse<{
        available?: boolean;
        username?: string;
        address?: string;
        error?: string;
      }>(res);

      const resolvedAddr = data.address || `${norm}@${activeDomain}`;
      if (!res.ok || !data.available) {
        const msg = data.error || `${resolvedAddr} is already taken.`;
        setCustomStatus({ available: false, address: resolvedAddr, message: msg });
        setError(msg);
        return null;
      }

      const customOpt: EmailSuggestionOption = {
        id: 'custom',
        address: resolvedAddr,
        username: data.username || norm,
        domain: activeDomain,
        provider: 'veribox',
        providerLabel: `@${activeDomain}`,
      };
      setSelectedOption(customOpt);
      setCustomStatus({
        available: true,
        address: resolvedAddr,
        message: `${resolvedAddr} is available!`,
      });
      return customOpt;
    } catch {
      const fallbackAddr = `${norm}@${activeDomain}`;
      const customOpt: EmailSuggestionOption = {
        id: 'custom',
        address: fallbackAddr,
        username: norm,
        domain: activeDomain,
        provider: 'veribox',
        providerLabel: `@${activeDomain}`,
      };
      setSelectedOption(customOpt);
      setCustomStatus({
        available: true,
        address: fallbackAddr,
        message: `${fallbackAddr} ready`,
      });
      return customOpt;
    } finally {
      setCheckingCustom(false);
    }
  };

  // STEP 3: Choose Email Address -> Next (Verifies availability & charges ₦50 from wallet before advancing)
  const handleChooseNext = async () => {
    setError(null);
    let targetOption = selectedOption;

    if (targetOption?.id === 'custom' || (!targetOption && customUsername.trim().length > 0)) {
      const verifiedCustom = await handleCheckCustomUsername();
      if (!verifiedCustom) return;
      targetOption = verifiedCustom;
    }

    if (!targetOption) {
      setError(`Please select or enter a @${activeDomain} address`);
      return;
    }

    // Re-check availability on server before charging ₦50
    try {
      const availRes = await fetch('/api/email/check-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: targetOption.username }),
        signal: AbortSignal.timeout(5000),
      });
      const availData = await parseJsonResponse<{ available?: boolean; error?: string }>(availRes);
      if (availRes.ok && availData.available === false) {
        setError(availData.error || `${targetOption.address} was just claimed. Pick another address.`);
        return;
      }
    } catch {
      // Non-blocking precheck; create-selected enforces uniqueness as well
    }

    if (paidSessionRefCurrent.current) {
      navigateBrowserTo('password');
      return;
    }

    setChargingCreateFee(true);
    setIsBrowserLoading(true);
    setBrowserProgress(45);
    const chargeRef = `create-email-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    try {
      const res = await fetch('/api/wallet/deduct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: walletUserId,
          amount: CREATE_EMAIL_FEE_NGN,
          reference: chargeRef,
        }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await parseJsonResponse<{
        balance?: number | null;
        insufficient?: boolean;
        error?: string;
      }>(res);

      if (res.status === 402 || data.insufficient) {
        const serverBal = typeof data.balance === 'number' ? data.balance : effectiveBalance;
        setLiveServerBalance(serverBal);
        onWalletBalanceChange?.(serverBal);
        const msg = `Insufficient wallet balance (₦${serverBal.toLocaleString()}). You need ₦${CREATE_EMAIL_FEE_NGN} to create a @${activeDomain} email.`;
        setError(msg);
        onShowToast(msg);
        onOpenDeposit?.();
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Could not process ₦50 wallet payment.');
      }

      const nextBal =
        typeof data.balance === 'number'
          ? data.balance
          : Math.max(0, effectiveBalance - CREATE_EMAIL_FEE_NGN);
      setLiveServerBalance(nextBal);
      onWalletBalanceChange?.(nextBal);
      paidSessionRefCurrent.current = chargeRef;
      setPaidSessionRef(chargeRef);
      onShowToast(`₦${CREATE_EMAIL_FEE_NGN} deducted for @${activeDomain} email`);
      navigateBrowserTo('password', 320);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to verify wallet balance';
      setError(msg);
      onShowToast(msg);
    } finally {
      setChargingCreateFee(false);
      setIsBrowserLoading(false);
      setTimeout(() => setBrowserProgress(0), 200);
    }
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

  // STEP 5: Privacy & Terms Scroll -> Allow (Creates Live @veribox.name.ng Account)
  const handleAllowAndFinish = async () => {
    if (!selectedOption) return;
    setError(null);
    setCreatingFinal(true);
    setIsBrowserLoading(true);
    setBrowserProgress(60);

    try {
      const finalPassword = password.trim();
      const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');

      const res = await fetch('/api/email/create-selected', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'veribox',
          username: selectedOption.username,
          domain: activeDomain,
          address: selectedOption.address,
          password: finalPassword,
          displayName: fullName || undefined,
          accountMode,
          userId: walletUserId,
        }),
        signal: AbortSignal.timeout(9000),
      });

      const parsed = await parseJsonResponse<TempEmailAccount & { error?: string }>(res);
      if (!res.ok || !parsed.address) {
        throw new Error(parsed.error || `Could not activate @${activeDomain} mailbox.`);
      }

      setBrowserProgress(100);
      paidSessionRefCurrent.current = null;
      setPaidSessionRef(null);

      const newAccount: TempEmailAccount = {
        id: parsed.id,
        address: parsed.address,
        password: parsed.password || finalPassword,
        token: parsed.token,
        provider: 'veribox',
        domain: parsed.domain || activeDomain,
        createdAt: parsed.createdAt || new Date().toISOString(),
        accountMode,
        displayName: parsed.displayName || fullName || undefined,
      };

      onShowToast(`Mailbox active: ${newAccount.address}`);
      onComplete(newAccount);
    } catch (err) {
      await refundHeldCreateFee('Activation failed · ₦50 refunded to your wallet');
      setError(err instanceof Error ? err.message : `Could not finalize @${activeDomain} account`);
      setCreatingFinal(false);
      setIsBrowserLoading(false);
    }
  };

  const hasTypedEmail = usernameInput.trim().length > 0;

  // Browser Address Bar Label based on current screen
  const browserUrl =
    screen === 'signin'
      ? `https://mail.${activeDomain}/v3/signin/identifier`
      : screen === 'signin-password'
        ? `https://mail.${activeDomain}/v3/signin/challenge/pwd`
        : screen === 'name'
          ? `https://mail.${activeDomain}/v3/signup/name`
          : screen === 'birthdate'
            ? `https://mail.${activeDomain}/v3/signup/basicinfo`
            : screen === 'choose'
              ? `https://mail.${activeDomain}/v3/signup/webaddress`
              : screen === 'password'
                ? `https://mail.${activeDomain}/v3/signup/passwd`
                : `https://mail.${activeDomain}/v3/signup/privacyterms`;

  // 1. INITIAL TRIGGER CARD
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
                  Custom @{activeDomain} Email Hosting
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
              Create or Recover @{activeDomain}
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm text-[#6E6552] dark:text-[#A89F8C]">
              Claim a custom @{activeDomain} address with password protection or sign back into a saved mailbox
            </p>
          </div>

          {/* Long curved button with our app logo */}
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
                    Continue to @{activeDomain}
                  </p>
                  <p className="text-[11px] text-[#8A7F6A] truncate dark:text-[#A89F8C]">
                    Sign in, recover, or claim new mailbox
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
                <span>Free Password Recovery</span>
              </div>
              <div className="flex items-center gap-2">
                <Wallet className="h-3.5 w-3.5 text-[#D4AF37]" />
                <span>₦{CREATE_EMAIL_FEE_NGN} / Custom Mailbox</span>
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
                    mail.{activeDomain}
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

            {isBrowserLoading && loadingMessage ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#D4AF37]/40 bg-[#D4AF37]/10">
                  <Loader2 className="h-6 w-6 animate-spin text-[#D4AF37]" />
                </div>
                <p className="font-display text-sm font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                  {loadingMessage}
                </p>
                <p className="text-xs text-[#6E6552] dark:text-[#A89F8C]">
                  Please wait a moment
                </p>
              </div>
            ) : null}

            {/* SCREEN 1: SIGN IN / RECOVER EXISTING EMAIL OR PICK CREATE ACCOUNT OPTION */}
            {!loadingMessage && screen === 'signin' && (
              <form onSubmit={handleSignInNext} className="mt-6 space-y-4">
                <div>
                  <h2 className="font-display text-2xl font-black tracking-tight text-[#1A160D] dark:text-[#FAF6EC]">
                    Sign in
                  </h2>
                  <p className="mt-0.5 text-xs text-[#6E6552] dark:text-[#A89F8C]">
                    to continue to VeriBox Mail (@{activeDomain})
                  </p>
                </div>

                <div className="pt-2 space-y-1.5">
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(e) => {
                      setUsernameInput(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder={`Enter username or name@${activeDomain}`}
                    className="h-12 w-full rounded-xl border border-[#D4AF37]/35 bg-[#FAF7F0] px-4 font-mono text-sm font-semibold text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0A0906] dark:text-[#FAF6EC]"
                  />
                  <p className="px-1 text-[11px] text-[#8A7F6A] dark:text-[#A89F8C]">
                    Already created or deleted an @{activeDomain} email? Enter it above and tap Next to sign in with your password.
                  </p>
                </div>

                {/* Create Account Selector Menu — selecting an option immediately loads the Name screen */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setCreateMenuOpen((prev) => !prev)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold text-[#8A6208] hover:bg-[#D4AF37]/10 cursor-pointer dark:text-[#F5D77A]"
                  >
                    <span>Create account: {modeLabel(accountMode)}</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${
                        createMenuOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {createMenuOpen && (
                    <div className="mt-2 w-full overflow-hidden rounded-2xl border border-[#D4AF37]/35 bg-[#FAF7F0] p-1.5 shadow-xl dark:bg-[#19160F]">
                      <button
                        type="button"
                        onClick={() => handleSelectAccountModeAndStart('personal')}
                        className="flex min-h-[44px] w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-[#1A160D] hover:bg-[#D4AF37]/15 cursor-pointer dark:text-[#FAF6EC]"
                      >
                        <span className="flex items-center gap-2.5">
                          <User className="h-4 w-4 text-[#D4AF37]" />
                          <span>For my personal use</span>
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-[#D4AF37]/70" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectAccountModeAndStart('business')}
                        className="flex min-h-[44px] w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-[#1A160D] hover:bg-[#D4AF37]/15 cursor-pointer dark:text-[#FAF6EC]"
                      >
                        <span className="flex items-center gap-2.5">
                          <Briefcase className="h-4 w-4 text-[#D4AF37]" />
                          <span>For work or business</span>
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-[#D4AF37]/70" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectAccountModeAndStart('privacy')}
                        className="flex min-h-[44px] w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-[#1A160D] hover:bg-[#D4AF37]/15 cursor-pointer dark:text-[#FAF6EC]"
                      >
                        <span className="flex items-center gap-2.5">
                          <Shield className="h-4 w-4 text-[#D4AF37]" />
                          <span>High-privacy stealth</span>
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-[#D4AF37]/70" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end pt-3">
                  <button
                    type="submit"
                    disabled={!hasTypedEmail || isBrowserLoading}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#D4AF37] px-7 py-2.5 text-xs font-extrabold text-[#0A0906] shadow-md transition-all hover:bg-[#E5C150] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <span>Next</span>
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </button>
                </div>
              </form>
            )}

            {/* SCREEN 1B: ENTER PASSWORD TO SIGN IN / RECOVER EXISTING EMAIL */}
            {!loadingMessage && screen === 'signin-password' && (
              <form onSubmit={handleVerifyRecoverySignIn} className="mt-6 space-y-4">
                <div>
                  <h2 className="font-display text-2xl font-black tracking-tight text-[#1A160D] dark:text-[#FAF6EC]">
                    Welcome back
                  </h2>
                  <p className="mt-0.5 text-xs text-[#6E6552] dark:text-[#A89F8C]">
                    Enter the password you created to sign in and recover this mailbox
                  </p>
                </div>

                {/* Email Pill */}
                <div className="flex items-center justify-between gap-2 rounded-xl border border-[#D4AF37]/30 bg-[#FAF7F0] px-3.5 py-2.5 dark:bg-[#0A0906]">
                  <div className="flex min-w-0 items-center gap-2">
                    <Mail className="h-4 w-4 shrink-0 text-[#D4AF37]" />
                    <span className="truncate font-mono text-xs font-bold text-[#1A160D] dark:text-[#F5D77A]">
                      {recoveryEmail}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigateBrowserTo('signin', 240)}
                    className="shrink-0 text-[11px] font-bold text-[#8A6208] hover:underline dark:text-[#F5D77A]"
                  >
                    Change
                  </button>
                </div>

                <div className="space-y-3 pt-1">
                  <div className="relative">
                    <input
                      type={showRecoveryPassword ? 'text' : 'password'}
                      required
                      autoFocus
                      value={recoveryPassword}
                      onChange={(e) => {
                        setRecoveryPassword(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="Enter your password"
                      className="h-12 w-full rounded-xl border border-[#D4AF37]/35 bg-[#FAF7F0] pl-4 pr-11 text-sm font-semibold text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0A0906] dark:text-[#FAF6EC]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRecoveryPassword((prev) => !prev)}
                      aria-label={showRecoveryPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#6E6552] hover:bg-[#D4AF37]/10 dark:text-[#A89F8C]"
                    >
                      {showRecoveryPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-[#6E6552] dark:text-[#A89F8C]">
                    <input
                      type="checkbox"
                      checked={showRecoveryPassword}
                      onChange={(e) => setShowRecoveryPassword(e.target.checked)}
                      className="h-4 w-4 rounded border-[#D4AF37]/40 accent-[#D4AF37]"
                    />
                    <span>Show password</span>
                  </label>
                </div>

                <div className="flex items-center justify-between pt-5">
                  <button
                    type="button"
                    onClick={() => navigateBrowserTo('signin', 240)}
                    disabled={verifyingLogin}
                    className="inline-flex min-h-[42px] items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-[#7B6F57] hover:bg-[#D4AF37]/10 dark:text-[#A89F8C]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="submit"
                    disabled={verifyingLogin || !recoveryPassword.trim()}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#D4AF37] px-7 py-2.5 text-xs font-extrabold text-[#0A0906] shadow-md hover:bg-[#E5C150] disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {verifyingLogin ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Signing In...</span>
                      </>
                    ) : (
                      <>
                        <span>Sign In</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* SCREEN 1D: FIRST NAME & SECOND NAME */}
            {!loadingMessage && screen === 'name' && (
              <form onSubmit={handleNameNext} className="mt-6 space-y-4">
                <div>
                  <h2 className="font-display text-2xl font-black tracking-tight text-[#1A160D] dark:text-[#FAF6EC]">
                    Create a VeriBox Mail
                  </h2>
                  <p className="mt-0.5 text-xs text-[#6E6552] dark:text-[#A89F8C]">
                    {modeLabel(accountMode)} · Enter your first name and second name
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-[#6E6552] dark:text-[#A89F8C]">
                      First name
                    </label>
                    <input
                      type="text"
                      required
                      autoFocus
                      value={firstName}
                      onChange={(e) => {
                        setFirstName(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="First name"
                      className="h-12 w-full rounded-xl border border-[#D4AF37]/35 bg-[#FAF7F0] px-4 text-sm font-semibold text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0A0906] dark:text-[#FAF6EC]"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-bold text-[#6E6552] dark:text-[#A89F8C]">
                      Second name <span className="font-normal opacity-75">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => {
                        setLastName(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="Second / Last name (optional)"
                      className="h-12 w-full rounded-xl border border-[#D4AF37]/35 bg-[#FAF7F0] px-4 text-sm font-semibold text-[#1A160D] placeholder:text-[#8A7F6A] focus:border-[#D4AF37] focus:outline-none dark:bg-[#0A0906] dark:text-[#FAF6EC]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-6">
                  <button
                    type="button"
                    onClick={() => navigateBrowserTo('signin')}
                    className="inline-flex min-h-[42px] items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-[#7B6F57] hover:bg-[#D4AF37]/10 cursor-pointer dark:text-[#A89F8C]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="submit"
                    disabled={firstName.trim().length < 2}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#D4AF37] px-7 py-2.5 text-xs font-extrabold text-[#0A0906] hover:bg-[#E5C150] shadow-md disabled:opacity-45 cursor-pointer"
                  >
                    <span>Next</span>
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </button>
                </div>
              </form>
            )}

            {/* SCREEN 2: BIRTHDAY & AGE / DATE */}
            {!loadingMessage && screen === 'birthdate' && (
              <form onSubmit={handleBirthdateNext} className="mt-6 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-2xl font-black tracking-tight text-[#1A160D] dark:text-[#FAF6EC]">
                      Basic information
                    </h2>
                    <p className="mt-0.5 text-xs text-[#6E6552] dark:text-[#A89F8C]">
                      {firstName.trim() ? `${firstName.trim()} · ` : ''}Enter your birthday and gender
                    </p>
                  </div>
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
                    onClick={() => navigateBrowserTo('name')}
                    className="inline-flex min-h-[42px] items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-[#7B6F57] hover:bg-[#D4AF37]/10 cursor-pointer dark:text-[#A89F8C]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="submit"
                    className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#D4AF37] px-7 py-2.5 text-xs font-extrabold text-[#0A0906] hover:bg-[#E5C150] shadow-md cursor-pointer"
                  >
                    <span>Next</span>
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </button>
                </div>
              </form>
            )}

            {/* SCREEN 3: CHOOSE OR CREATE CUSTOM @veribox.name.ng ADDRESS (₦50 fee on Next) */}
            {!loadingMessage && screen === 'choose' && (
              <div className="mt-6 space-y-4">
                <div>
                  <h2 className="font-display text-2xl font-black tracking-tight text-[#1A160D] dark:text-[#FAF6EC]">
                    Choose your @{activeDomain} address
                  </h2>
                  <p className="mt-0.5 text-xs text-[#6E6552] dark:text-[#A89F8C]">
                    Pick a suggested address or type your own custom username (₦{CREATE_EMAIL_FEE_NGN} fee)
                  </p>
                </div>

                {/* Live Wallet Balance & Fee Summary Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#D4AF37]/30 bg-[#FAF7F0] px-3.5 py-2.5 text-xs dark:bg-[#0A0906]">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-3.5 w-3.5 text-[#D4AF37]" />
                    <span className="font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                      Wallet: ₦{effectiveBalance.toLocaleString()}
                    </span>
                  </div>
                  {paidSessionRef ? (
                    <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300">
                      ₦{CREATE_EMAIL_FEE_NGN} Paid
                    </span>
                  ) : (
                    <span className="rounded-md bg-[#D4AF37]/15 px-2 py-0.5 text-[11px] font-extrabold text-[#8A6208] dark:text-[#F5D77A]">
                      Fee: ₦{CREATE_EMAIL_FEE_NGN} on Next
                    </span>
                  )}
                </div>

                {!paidSessionRef && effectiveBalance < CREATE_EMAIL_FEE_NGN && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-500/35 bg-rose-500/10 px-3.5 py-2.5 text-xs">
                    <span className="font-semibold text-rose-700 dark:text-rose-200">
                      Insufficient balance (₦{effectiveBalance.toLocaleString()}). Deposit at least ₦
                      {CREATE_EMAIL_FEE_NGN} to continue.
                    </span>
                    {onOpenDeposit && (
                      <button
                        type="button"
                        onClick={onOpenDeposit}
                        className="rounded-lg bg-[#D4AF37] px-3 py-1 text-[11px] font-extrabold text-[#0A0906] hover:bg-[#E5C150] cursor-pointer"
                      >
                        Top Up Wallet
                      </button>
                    )}
                  </div>
                )}

                <div className="divide-y divide-[#D4AF37]/15 overflow-hidden rounded-2xl border border-[#D4AF37]/25 bg-[#FAF7F0]/70 dark:bg-[#0A0906]">
                  {options.map((opt) => {
                    const isSelected = selectedOption?.id === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setSelectedOption(opt);
                          setError(null);
                        }}
                        className={`flex min-h-[50px] w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors cursor-pointer ${
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
                        <span className="shrink-0 font-mono text-[11px] font-bold text-[#8A6208] dark:text-[#F5D77A]">
                          ₦{CREATE_EMAIL_FEE_NGN}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Username Picker */}
                <div className="rounded-2xl border border-[#D4AF37]/30 bg-[#FAF7F0]/70 p-3.5 space-y-2.5 dark:bg-[#0A0906]">
                  <p className="text-xs font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                    Or create your own custom username
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-1 min-w-0 items-center rounded-xl border border-[#D4AF37]/35 bg-white px-3 dark:bg-[#14120D]">
                      <input
                        type="text"
                        value={customUsername}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setCustomUsername(raw);
                          setCustomStatus(null);
                          setError(null);
                          const norm = normalizeCustomUsername(raw);
                          if (norm.length >= 3) {
                            setSelectedOption({
                              id: 'custom',
                              address: `${norm}@${activeDomain}`,
                              username: norm,
                              domain: activeDomain,
                              provider: 'veribox',
                              providerLabel: `@${activeDomain}`,
                            });
                          }
                        }}
                        placeholder="yourname"
                        className="h-10 min-w-0 flex-1 bg-transparent font-mono text-xs font-bold text-[#1A160D] placeholder:text-[#8A7F6A] focus:outline-none dark:text-[#FAF6EC]"
                      />
                      <span className="shrink-0 font-mono text-[11px] font-bold text-[#8A6208] dark:text-[#D4AF37]">
                        @{activeDomain}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCheckCustomUsername()}
                      disabled={checkingCustom || customUsername.trim().length < 3}
                      className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-[#D4AF37]/50 bg-[#D4AF37]/15 px-3 text-xs font-bold text-[#8A6208] hover:bg-[#D4AF37]/25 disabled:opacity-50 cursor-pointer dark:text-[#F5D77A]"
                    >
                      {checkingCustom ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Check'}
                    </button>
                  </div>
                  {customStatus && (
                    <p
                      className={`text-[11px] font-semibold ${
                        customStatus.available
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-rose-600 dark:text-rose-300'
                      }`}
                    >
                      {customStatus.message}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-6">
                  <button
                    type="button"
                    onClick={() => navigateBrowserTo('birthdate')}
                    disabled={chargingCreateFee}
                    className="inline-flex min-h-[42px] items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-[#7B6F57] hover:bg-[#D4AF37]/10 dark:text-[#A89F8C]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Back</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleChooseNext()}
                    disabled={!selectedOption || chargingCreateFee}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-[#D4AF37] px-7 py-2.5 text-xs font-extrabold text-[#0A0906] hover:bg-[#E5C150] shadow-md disabled:opacity-60 cursor-pointer"
                  >
                    {chargingCreateFee ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Charging ₦{CREATE_EMAIL_FEE_NGN}...</span>
                      </>
                    ) : (
                      <>
                        <span>
                          {paidSessionRef ? 'Next' : `Next · ₦${CREATE_EMAIL_FEE_NGN}`}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* SCREEN 4: PASSWORD */}
            {!loadingMessage && screen === 'password' && (
              <form onSubmit={handlePasswordNext} className="mt-6 space-y-4">
                <div>
                  <h2 className="font-display text-2xl font-black tracking-tight text-[#1A160D] dark:text-[#FAF6EC]">
                    Create a strong password
                  </h2>
                  <p className="mt-0.5 text-xs text-[#6E6552] dark:text-[#A89F8C]">
                    Save this password — you can use it anytime to sign back in or recover your email
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
                      placeholder="Password (min 6 characters)"
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
                    className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#D4AF37] px-7 py-2.5 text-xs font-extrabold text-[#0A0906] hover:bg-[#E5C150] shadow-md cursor-pointer"
                  >
                    <span>Next</span>
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </button>
                </div>
              </form>
            )}

            {/* SCREEN 5: PRIVACY & TERMS SCROLL WITH ALLOW */}
            {!loadingMessage && screen === 'terms' && selectedOption && (
              <div className="mt-6 space-y-4">
                <div>
                  <h2 className="font-display text-2xl font-black tracking-tight text-[#1A160D] dark:text-[#FAF6EC]">
                    Privacy and Terms
                  </h2>
                  <p className="mt-0.5 text-xs text-[#6E6552] dark:text-[#A89F8C]">
                    Scroll and review your options, then tap Confirm to activate
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
                    Terms of VeriBox Custom Domain Mail (@{activeDomain}):
                  </p>
                  <p className="leading-relaxed">
                    By tapping Allow &amp; Confirm, you activate your dedicated @{activeDomain} mailbox. Your
                    inbox receives incoming verification codes and emails routed to {activeDomain} in real time.
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
                      <span>Password-protected recovery on this device</span>
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
                        <span>Allow &amp; Confirm</span>
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
