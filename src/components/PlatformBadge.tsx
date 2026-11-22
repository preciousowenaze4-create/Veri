import type { PlatformFilter } from '../types';

export interface PlatformThemeMeta {
  id: PlatformFilter;
  label: string;
  activeClass: string;
  idleClass: string;
  accentText: string;
  dotColor: string;
}

export const PLATFORM_THEMES: PlatformThemeMeta[] = [
  {
    id: 'instagram',
    label: 'Instagram',
    activeClass:
      'bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white border-transparent shadow-sm',
    idleClass:
      'border-[#DD2A7B]/40 bg-[#DD2A7B]/10 text-[#F472B6] hover:border-[#DD2A7B]/80',
    accentText: 'text-[#F472B6]',
    dotColor: 'bg-[#DD2A7B]',
  },
  {
    id: 'facebook',
    label: 'Facebook',
    activeClass: 'bg-[#1877F2] text-white border-transparent shadow-sm',
    idleClass:
      'border-[#1877F2]/40 bg-[#1877F2]/10 text-[#60A5FA] hover:border-[#1877F2]/80',
    accentText: 'text-[#60A5FA]',
    dotColor: 'bg-[#1877F2]',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    activeClass:
      'bg-gradient-to-r from-[#0F0F12] via-[#1A1218] to-[#0F0F12] text-white border-[#FE2C55] shadow-sm',
    idleClass:
      'border-[#FE2C55]/45 bg-[#FE2C55]/10 text-[#FB7185] hover:border-[#25F4EE]/70',
    accentText: 'text-[#25F4EE]',
    dotColor: 'bg-[#FE2C55]',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    activeClass: 'bg-[#25D366] text-[#052E16] border-transparent shadow-sm',
    idleClass:
      'border-[#25D366]/40 bg-[#25D366]/10 text-[#4ADE80] hover:border-[#25D366]/80',
    accentText: 'text-[#4ADE80]',
    dotColor: 'bg-[#25D366]',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    activeClass: 'bg-[#26A5E4] text-white border-transparent shadow-sm',
    idleClass:
      'border-[#26A5E4]/40 bg-[#26A5E4]/10 text-[#38BDF8] hover:border-[#26A5E4]/80',
    accentText: 'text-[#38BDF8]',
    dotColor: 'bg-[#26A5E4]',
  },
  {
    id: 'google',
    label: 'Google',
    activeClass: 'bg-[#4285F4] text-white border-transparent shadow-sm',
    idleClass:
      'border-[#4285F4]/40 bg-[#4285F4]/10 text-[#60A5FA] hover:border-[#4285F4]/80',
    accentText: 'text-[#60A5FA]',
    dotColor: 'bg-[#4285F4]',
  },
  {
    id: 'all',
    label: 'All Apps',
    activeClass: 'bg-[#D4AF37] text-[#0A0906] border-transparent shadow-sm',
    idleClass:
      'border-[#D4AF37]/40 bg-[#D4AF37]/10 text-[#F5D77A] hover:border-[#D4AF37]/80',
    accentText: 'text-[#F5D77A]',
    dotColor: 'bg-[#D4AF37]',
  },
];

export function getPlatformTheme(id: PlatformFilter): PlatformThemeMeta {
  return PLATFORM_THEMES.find((p) => p.id === id) || PLATFORM_THEMES[PLATFORM_THEMES.length - 1];
}
