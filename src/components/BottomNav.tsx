import { Home, MailPlus, Phone, Sparkles, User } from 'lucide-react';
import type { TabId } from '../types';

interface BottomNavProps {
  activeTab: TabId;
  unreadEmailCount: number;
  onChange: (tab: TabId) => void;
}

const NAV_ITEMS: Array<{ id: TabId; label: string; Icon: typeof Home }> = [
  { id: 'home', label: 'Home', Icon: Home },
  { id: 'create', label: 'Create', Icon: MailPlus },
  { id: 'numbers', label: 'Numbers', Icon: Phone },
  { id: 'images', label: 'Images', Icon: Sparkles },
  { id: 'profile', label: 'Profile', Icon: User },
];

export function BottomNav({
  activeTab,
  unreadEmailCount,
  onChange,
}: BottomNavProps) {
  return (
    <nav
      aria-label="Primary bottom navigation"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#D4AF37]/20 bg-[#FAF7F0]/95 backdrop-blur-md pb-safe dark:border-[#D4AF37]/20 dark:bg-[#0A0906]/95"
    >
      <div className="mx-auto grid h-16 w-full max-w-3xl grid-cols-5 items-center px-1 sm:px-2">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex min-h-[44px] flex-col items-center justify-center rounded-xl py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-[#D4AF37] cursor-pointer ${
                isActive
                  ? 'text-[#9A6F09] dark:text-[#F5D77A]'
                  : 'text-[#736954] hover:text-[#1A160D] dark:text-[#8F8673] dark:hover:text-[#FAF6EC]'
              }`}
            >
              {isActive && (
                <span className="absolute top-0 h-0.5 w-9 rounded-full bg-[#D4AF37]" />
              )}
              <div className="relative flex items-center justify-center">
                <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 1.9} />
                {id === 'home' && unreadEmailCount > 0 && (
                  <span className="ml-1 font-mono text-[10px] font-bold text-[#9A6F09] dark:text-[#F5D77A]">
                    {unreadEmailCount}
                  </span>
                )}
              </div>
              <span className="mt-1 text-[11px] font-bold tracking-tight whitespace-nowrap shrink-0">
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
