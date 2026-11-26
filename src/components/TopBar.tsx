import { ArrowRight, Menu, Plus, User as UserIcon } from 'lucide-react';

interface TopBarProps {
  isAuthenticated: boolean;
  userEmail?: string | null;
  userName?: string | null;
  avatarUrl?: string | null;
  walletBalance: number;
  onOpenDrawer: () => void;
  onOpenDeposit: () => void;
  onOpenProfile: () => void;
  onOpenAuth: () => void;
}

export function TopBar({
  isAuthenticated,
  userEmail,
  userName,
  avatarUrl,
  walletBalance,
  onOpenDrawer,
  onOpenDeposit,
  onOpenProfile,
  onOpenAuth,
}: TopBarProps) {
  const displayBalance =
    walletBalance === 0 ? '00' : walletBalance.toLocaleString('en-US');
  const initial = (userName || userEmail || 'V').trim().charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-30 w-full border-b border-[#D4AF37]/20 bg-[#FAF7F0]/95 pt-[env(safe-area-inset-top)] backdrop-blur-md dark:border-[#D4AF37]/20 dark:bg-[#0A0906]/95">
      <div className="mx-auto flex h-[58px] w-full max-w-7xl items-center justify-between gap-2 px-3 sm:px-6">
        {/* Left: Menu Hamburger + Bold App Logo + Brand Wordmark */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onOpenDrawer}
            aria-label="Open left corner menu"
            className="flex min-h-[42px] min-w-[42px] shrink-0 items-center justify-center rounded-xl text-[#3E3522] transition-colors hover:bg-[#D4AF37]/15 focus-visible:outline-2 focus-visible:outline-[#D4AF37] dark:text-[#F5D77A] dark:hover:bg-[#D4AF37]/15 cursor-pointer"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Bold VeriBox Crest Badge */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-[#D4AF37] bg-[#14120D] shadow-md shadow-[#D4AF37]/25">
              <img
                src="/pwa-192x192.png"
                alt="VeriBox"
                className="h-full w-full object-cover scale-105"
              />
            </div>
            <span className="font-display text-base sm:text-lg font-black tracking-tight text-[#1A160D] whitespace-nowrap dark:text-[#F5D77A]">
              VeriBox
            </span>
          </div>
        </div>

        {/* Right: Prominent Get Started when logged out; Wallet Balance + Profile when logged in */}
        {!isAuthenticated ? (
          <button
            type="button"
            onClick={onOpenAuth}
            className="group inline-flex min-h-[40px] items-center gap-2 rounded-full border border-[#D4AF37]/80 bg-[#D4AF37] px-4 py-2 text-xs sm:text-sm font-black text-[#0A0906] shadow-md shadow-[#D4AF37]/25 transition-all hover:bg-[#E5C150] hover:scale-[1.02] active:scale-95 shrink-0 cursor-pointer"
          >
            <span>Get Started</span>
            <ArrowRight className="h-3.5 w-3.5 stroke-[2.5] transition-transform group-hover:translate-x-0.5" />
          </button>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenDeposit}
              aria-label={`Wallet balance: ${displayBalance} Naira. Tap to deposit`}
              className="group inline-flex min-h-[40px] items-center gap-2 rounded-full border border-[#D4AF37]/80 bg-[#D4AF37] p-1.5 pr-2 pl-1.5 text-[#0A0906] shadow-md shadow-[#D4AF37]/20 transition-all hover:bg-[#E5C150] hover:scale-[1.02] active:scale-95 shrink-0 cursor-pointer"
            >
              {/* Left coin icon with Naira currency symbol */}
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0A0906] text-[#F5D77A] shadow-inner transition-transform group-hover:rotate-12">
                <span className="font-mono text-xs font-black">₦</span>
              </div>

              {/* Center balance amount */}
              <span className="px-1 font-mono text-sm font-black tracking-tight tabular-nums text-[#0A0906]">
                {displayBalance}
              </span>

              {/* Right circular plus button */}
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0A0906]/20 text-[#0A0906] transition-colors group-hover:bg-[#0A0906] group-hover:text-[#F5D77A]">
                <Plus className="h-3.5 w-3.5 stroke-[3]" />
              </div>
            </button>

            <button
              type="button"
              onClick={onOpenProfile}
              aria-label="Open profile and account settings"
              title={userName || userEmail || 'Profile'}
              className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-[#D4AF37]/70 bg-[#14120D] text-xs font-black text-[#F5D77A] shadow-sm transition-all hover:border-[#D4AF37] hover:scale-105 active:scale-95 cursor-pointer"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={userName || 'User profile'}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : initial ? (
                <span>{initial}</span>
              ) : (
                <UserIcon className="h-4 w-4" />
              )}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
