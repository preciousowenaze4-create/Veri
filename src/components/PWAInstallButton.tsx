import { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export function PWAInstallButton({ compact = false }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-[#D4AF37]/50 bg-[#D4AF37]/15 px-3.5 py-2 text-xs font-semibold text-[#926B0C] transition-colors hover:bg-[#D4AF37]/25 whitespace-nowrap shrink-0 dark:text-[#F5D77A]"
      >
        <Download className="h-3.5 w-3.5 shrink-0" />
        <span>{compact ? 'Add App' : 'Add to Home Screen'}</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3.5 py-2 text-xs font-semibold text-[#8A6208] transition-colors hover:bg-[#D4AF37]/20 whitespace-nowrap shrink-0 dark:text-[#F5D77A]"
      >
        <Smartphone className="h-3.5 w-3.5 shrink-0" />
        <span>{compact ? 'Install' : 'Add to Home Screen'}</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Add VeriBox to Home Screen"
        >
          <div className="w-full max-w-sm rounded-2xl border border-[#D4AF37]/30 bg-white p-5 shadow-2xl dark:bg-[#14120D]">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-base font-bold text-[#1A160D] dark:text-[#FAF6EC]">
                Install VeriBox App
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close"
                className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-[#6E6552] hover:bg-black/5 dark:text-[#A89F8C] dark:hover:bg-white/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="mt-3 space-y-2 text-sm text-[#4F4736] dark:text-[#D5CCB8]">
                <li>1. Tap the <strong>Share</strong> icon in Safari.</li>
                <li>2. Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                <li>3. Tap <strong>Add</strong> to launch VeriBox full-screen like a native app.</li>
              </ol>
            ) : (
              <ol className="mt-3 space-y-2 text-sm text-[#4F4736] dark:text-[#D5CCB8]">
                <li>1. Open your browser menu (three dots in the corner).</li>
                <li>2. Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>.</li>
                <li>3. Launch VeriBox from your phone home screen in standalone app mode.</li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 min-h-[44px] w-full rounded-xl bg-[#D4AF37] px-4 py-2 text-sm font-bold text-[#0A0906] transition-colors hover:bg-[#E5C150]"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
}
