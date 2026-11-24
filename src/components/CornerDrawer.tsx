import {
  ArrowRight,
  Home,
  LogOut,
  MailPlus,
  Moon,
  Phone,
  Sparkles,
  Sun,
  User,
  X,
} from 'lucide-react';
import type { PlatformFilter, TabId } from '../types';
import { AppLogo } from './AppLogo';
import { PWAInstallButton } from './PWAInstallButton';

interface CornerDrawerProps {
  open: boolean;
  isAuthenticated: boolean;
  userEmail?: string | null;
  userName?: string | null;
  activeTab: TabId;
  activeEmailAddress: string | null;
  walletBalance?: number;
  isDark: boolean;
  onClose: () => void;
  onNavigate: (tab: TabId) => void;
  onSelectPlatform: (platform: PlatformFilter) => void;
  onToggleTheme: () => void;
  onOpenDeposit?: () => void;
  onOpenAuth?: () => void;
  onSignOut?: () => void;
}

export function CornerDrawer({
  open,
  isAuthenticated,
  userEmail,
  userName,
  activeTab,
  activeEmailAddress,
  walletBalance = 0,
  isDark,
  onClose,
  onNavigate,
  onSelectPlatform,
  onToggleTheme,
  onOpenDeposit,
  onOpenAuth,
  onSignOut,
}: CornerDrawerProps) {
  if (!open) return null;

  const go = (tab: TabId) => {
    onNavigate(tab);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Corner menu">
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-80 max-w-[85vw] flex-col border-r border-[#D4AF37]/25 bg-[#FAF7F0] dark:border-[#D4AF37]/20 dark:bg-[#110F0A]">
        <div className="flex items-center justify-between border-b border-[#D4AF37]/20 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-[#D4AF37] bg-[#14120D] shadow-lg shadow-[#D4AF37]/25">
              <img
                src="/pwa-192x192.png"
                alt="VeriBox"
                className="h-full w-full object-cover scale-105"
              />
            </div>
            <div className="min-w-0">
              <p className="font-display text-lg font-black text-[#1A160D] truncate dark:text-[#F5D77A]">
                VeriBox
              </p>
              <p className="text-xs font-semibold text-[#8A6208] truncate dark:text-[#D5CCB8]">
                Custom Mail &amp; Private SMS
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#6E6552] hover:bg-[#D4AF37]/15 dark:text-[#A89F8C] dark:hover:bg-[#D4AF37]/15"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {/* Wallet Balance or Get Started Auth Card */}
          {isAuthenticated ? (
            <div className="rounded-2xl border border-[#D4AF37]/35 bg-[#FAF7F0] p-3.5 space-y-2.5 dark:bg-[#0B0A07]">
              {(userName || userEmail) && (
                <div className="border-b border-[#D4AF37]/15 pb-2">
                  <p className="text-xs font-extrabold text-[#1A160D] truncate dark:text-[#FAF6EC]">
                    {userName || 'VeriBox Member'}
                  </p>
                  {userEmail && (
                    <p className="font-mono text-[11px] text-[#6E6552] truncate dark:text-[#A89F8C]">
                      {userEmail}
                    </p>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-bold text-[#6E6552] dark:text-[#A89F8C]">
                    Wallet Balance
                  </span>
                  <p className="font-mono text-xl font-black text-[#8A6208] dark:text-[#F5D77A]">
                    ₦{walletBalance === 0 ? '00' : walletBalance.toLocaleString('en-US')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenDeposit?.();
                  }}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#D4AF37] px-3.5 py-1.5 text-xs font-black text-[#0A0906] hover:bg-[#E5C150] shadow-sm active:scale-95 cursor-pointer"
                >
                  <span>Deposit</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#D4AF37]/35 bg-[#FAF7F0] p-3.5 dark:bg-[#0B0A07]">
              <p className="text-xs font-extrabold text-[#1A160D] dark:text-[#FAF6EC]">
                Sign in to unlock all features
              </p>
              <p className="mt-0.5 text-[11px] text-[#6E6552] dark:text-[#A89F8C]">
                Create custom @veribox.name.ng emails, get private OTP numbers, and manage your wallet.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAuth?.();
                }}
                className="mt-3 inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl bg-[#D4AF37] px-3.5 py-2 text-xs font-black text-[#0A0906] hover:bg-[#E5C150] shadow-sm cursor-pointer"
              >
                <span>Get Started</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div>
            <p className="px-3 pb-2 text-xs font-semibold text-[#6E6552] dark:text-[#A89F8C]">
              Email & Code Actions
            </p>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => go('create')}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-xl bg-[#D4AF37] px-3 py-2.5 text-left text-sm font-bold text-[#0A0906] transition-colors hover:bg-[#E5C150]"
              >
                <MailPlus className="h-4 w-4 shrink-0" />
                <span className="truncate">Create New Email</span>
              </button>

              <button
                type="button"
                onClick={() => go('home')}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  activeTab === 'home'
                    ? 'bg-[#D4AF37]/15 text-[#1A160D] dark:text-[#F5D77A]'
                    : 'text-[#3E3522] hover:bg-[#D4AF37]/10 dark:text-[#EAE2CF] dark:hover:bg-[#D4AF37]/10'
                }`}
              >
                <Home className="h-4 w-4 shrink-0 text-[#B48811] dark:text-[#D4AF37]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate">Home (Email Inbox)</div>
                  {activeEmailAddress && (
                    <div className="font-mono text-[11px] text-[#6E6552] truncate dark:text-[#A89F8C]">
                      {activeEmailAddress}
                    </div>
                  )}
                </div>
              </button>
            </div>
          </div>

          <div>
            <p className="px-3 pb-2 text-xs font-semibold text-[#6E6552] dark:text-[#A89F8C]">
              Navigation
            </p>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => go('numbers')}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  activeTab === 'numbers'
                    ? 'bg-[#D4AF37]/15 text-[#1A160D] dark:text-[#F5D77A]'
                    : 'text-[#3E3522] hover:bg-[#D4AF37]/10 dark:text-[#EAE2CF] dark:hover:bg-[#D4AF37]/10'
                }`}
              >
                <Phone className="h-4 w-4 shrink-0" />
                <span>Phone Numbers</span>
              </button>

              <button
                type="button"
                onClick={() => go('images')}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  activeTab === 'images'
                    ? 'bg-[#D4AF37]/15 text-[#1A160D] dark:text-[#F5D77A]'
                    : 'text-[#3E3522] hover:bg-[#D4AF37]/10 dark:text-[#EAE2CF] dark:hover:bg-[#D4AF37]/10'
                }`}
              >
                <Sparkles className="h-4 w-4 shrink-0" />
                <span>VeriBox AI &amp; Images</span>
              </button>

              <button
                type="button"
                onClick={() => go('profile')}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  activeTab === 'profile'
                    ? 'bg-[#D4AF37]/15 text-[#1A160D] dark:text-[#F5D77A]'
                    : 'text-[#3E3522] hover:bg-[#D4AF37]/10 dark:text-[#EAE2CF] dark:hover:bg-[#D4AF37]/10'
                }`}
              >
                <User className="h-4 w-4 shrink-0" />
                <span>Profile & Saved Vault</span>
              </button>
            </div>
          </div>

          <div>
            <p className="px-3 pb-2 text-xs font-semibold text-[#6E6552] dark:text-[#A89F8C]">
              Quick Platform SMS
            </p>
            <div className="grid grid-cols-2 gap-2 px-1">
              {(['instagram', 'facebook', 'tiktok', 'whatsapp'] as PlatformFilter[]).map((platform) => (
                <button
                  key={platform}
                  type="button"
                  onClick={() => {
                    onSelectPlatform(platform);
                    onClose();
                  }}
                  className="flex min-h-[42px] items-center gap-2 rounded-xl border border-[#D4AF37]/30 px-2.5 py-2 text-left text-xs font-bold capitalize text-[#3E3522] transition-colors hover:border-[#D4AF37] hover:bg-[#D4AF37]/15 dark:text-[#F5D77A]"
                >
                  <AppLogo id={platform} name={platform} size="sm" />
                  <span className="truncate">{platform}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="px-1">
            <PWAInstallButton />
          </div>
        </div>

        <div className="border-t border-[#D4AF37]/20 p-3 space-y-2">
          <button
            type="button"
            onClick={onToggleTheme}
            className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-[#D4AF37]/30 px-3.5 py-2 text-sm font-medium text-[#3E3522] transition-colors hover:bg-[#D4AF37]/10 dark:text-[#FAF6EC] dark:hover:bg-[#D4AF37]/10"
          >
            <span>{isDark ? 'Warm Ivory Mode' : 'Obsidian Gold Mode'}</span>
            {isDark ? <Sun className="h-4 w-4 text-[#F5D77A]" /> : <Moon className="h-4 w-4 text-[#8A6208]" />}
          </button>

          {isAuthenticated && onSignOut && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onSignOut();
              }}
              className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-rose-500/30 px-3.5 py-2 text-sm font-bold text-rose-600 transition-colors hover:bg-rose-500/10 dark:text-rose-400"
            >
              <span>Sign Out</span>
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
