import type { ReactNode } from 'react';

interface AppLogoProps {
  id: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

const MONOGRAM_PALETTE = [
  'bg-[#1D4ED8] text-white',
  'bg-[#047857] text-white',
  'bg-[#B45309] text-white',
  'bg-[#7C3AED] text-white',
  'bg-[#BE123C] text-white',
  'bg-[#0F766E] text-white',
  'bg-[#4338CA] text-white',
  'bg-[#C2410C] text-white',
];

function getDeterministicStyle(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return MONOGRAM_PALETTE[Math.abs(hash) % MONOGRAM_PALETTE.length];
}

function getInitials(name: string): string {
  const words = name
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return (words[0] || name || 'AP').slice(0, 2).toUpperCase();
}

export function AppLogo({ id, name, size = 'md' }: AppLogoProps) {
  const key = id.toLowerCase().trim();
  const boxClass =
    size === 'sm'
      ? 'h-5 w-5 rounded-md text-[9px]'
      : size === 'lg'
        ? 'h-8 w-8 rounded-xl text-xs'
        : 'h-6 w-6 rounded-lg text-[10px]';
  const svgClass = size === 'sm' ? 'h-3.5 w-3.5' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';

  const brand = renderBrandLogo(key, svgClass);
  if (brand) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden shadow-xs ${boxClass} ${brand.wrapperClass}`}
        aria-hidden="true"
      >
        {brand.icon}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center font-extrabold tracking-tight shadow-xs ${boxClass} ${getDeterministicStyle(key || name)}`}
      aria-hidden="true"
    >
      {getInitials(name)}
    </span>
  );
}

function renderBrandLogo(
  key: string,
  svgClass: string
): { wrapperClass: string; icon: ReactNode } | null {
  if (key.includes('tiktok')) {
    return {
      wrapperClass: 'bg-[#0D0D12] border border-white/15',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <path
            d="M14.5 3.5c.4 2.2 1.8 3.8 4 4.2v2.7a6.7 6.7 0 0 1-4-1.3v6.2a5.3 5.3 0 1 1-5.3-5.3c.4 0 .8 0 1.2.1v2.8a2.5 2.5 0 1 0 1.5 2.3V3.5h2.6Z"
            fill="#25F4EE"
            transform="translate(-0.7, -0.5)"
          />
          <path
            d="M14.5 3.5c.4 2.2 1.8 3.8 4 4.2v2.7a6.7 6.7 0 0 1-4-1.3v6.2a5.3 5.3 0 1 1-5.3-5.3c.4 0 .8 0 1.2.1v2.8a2.5 2.5 0 1 0 1.5 2.3V3.5h2.6Z"
            fill="#FE2C55"
            transform="translate(0.7, 0.5)"
          />
          <path
            d="M14.5 3.5c.4 2.2 1.8 3.8 4 4.2v2.7a6.7 6.7 0 0 1-4-1.3v6.2a5.3 5.3 0 1 1-5.3-5.3c.4 0 .8 0 1.2.1v2.8a2.5 2.5 0 1 0 1.5 2.3V3.5h2.6Z"
            fill="#FFFFFF"
          />
        </svg>
      ),
    };
  }

  if (key.includes('whatsapp')) {
    return {
      wrapperClass: 'bg-[#25D366] text-white',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <path
            d="M12 3.2a8.7 8.7 0 0 0-7.5 13.1L3.3 20.8l4.7-1.2A8.7 8.7 0 1 0 12 3.2Z"
            stroke="#FFF"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M9.3 8.8c-.2-.4-.4-.4-.7-.4h-.5c-.2 0-.6.1-.9.4-.3.3-1.1 1.1-1.1 2.6s1.1 3 1.3 3.2c.2.2 2.2 3.5 5.4 4.7 2.6 1 3.2.8 3.7.7.6-.1 1.8-.7 2.1-1.5.2-.7.2-1.4.2-1.5-.1-.1-.3-.2-.6-.4l-1.9-.9c-.3-.1-.5-.2-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.6c.2-.2.2-.4.3-.6 0-.2 0-.4-.1-.6l-.9-1.9Z"
            fill="#FFF"
          />
        </svg>
      ),
    };
  }

  if (key.includes('instagram')) {
    return {
      wrapperClass: 'bg-gradient-to-tr from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <rect x="4" y="4" width="16" height="16" rx="5" stroke="#FFF" strokeWidth="2.1" />
          <circle cx="12" cy="12" r="3.6" stroke="#FFF" strokeWidth="2.1" />
          <circle cx="16.6" cy="7.4" r="1.2" fill="#FFF" />
        </svg>
      ),
    };
  }

  if (key.includes('facebook')) {
    return {
      wrapperClass: 'bg-[#1877F2] text-white',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <path
            d="M14.2 20v-7.2h2.4l.4-2.8h-2.8V8.2c0-.8.2-1.4 1.4-1.4h1.5V4.3c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8V10H8.7v2.8h2.5V20h3Z"
            fill="#FFF"
          />
        </svg>
      ),
    };
  }

  if (key.includes('telegram')) {
    return {
      wrapperClass: 'bg-[#26A5E4] text-white',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <path
            d="M20.3 4.8 3.6 11.3c-1.1.4-1.1 1.1-.2 1.4l4.3 1.3 1.7 5.2c.2.5.4.7.8.7.4 0 .6-.2.9-.5l2.1-2 4.3 3.2c.8.4 1.3.2 1.5-.7L21.8 6c.3-1.1-.4-1.6-1.5-1.2Zm-3 3.7-7.7 6.9-.3 2.9-1.1-3.8 9.1-6Z"
            fill="#FFF"
          />
        </svg>
      ),
    };
  }

  if (key === 'google' || key.includes('gmail') || key.includes('google')) {
    return {
      wrapperClass: 'bg-white border border-black/10',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <path d="M21.3 12.2c0-.7-.1-1.3-.2-2H12v3.8h5.2a4.5 4.5 0 0 1-1.9 2.9v2.4h3.1c1.8-1.7 2.9-4.2 2.9-7.1Z" fill="#4285F4" />
          <path d="M12 21.7c2.6 0 4.8-.9 6.4-2.4l-3.1-2.4c-.9.6-2 .9-3.3.9-2.5 0-4.7-1.7-5.5-4H3.3v2.5A9.7 9.7 0 0 0 12 21.7Z" fill="#34A853" />
          <path d="M6.5 13.8a5.8 5.8 0 0 1 0-3.6V7.7H3.3a9.7 9.7 0 0 0 0 8.6l3.2-2.5Z" fill="#FBBC05" />
          <path d="M12 6.2c1.4 0 2.7.5 3.7 1.5l2.8-2.8A9.7 9.7 0 0 0 3.3 7.7l3.2 2.5c.8-2.3 3-4 5.5-4Z" fill="#EA4335" />
        </svg>
      ),
    };
  }

  if (key.includes('openai') || key.includes('chatgpt')) {
    return {
      wrapperClass: 'bg-[#10A37F] text-white',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <circle cx="12" cy="12" r="3" stroke="#FFF" strokeWidth="1.8" />
          <path
            d="M12 3.5v4.2M12 16.3v4.2M4.6 7.8l3.7 2.1M15.7 14.1l3.7 2.1M19.4 7.8l-3.7 2.1M8.3 14.1l-3.7 2.1"
            stroke="#FFF"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      ),
    };
  }

  if (key.includes('snapchat')) {
    return {
      wrapperClass: 'bg-[#FFFC00] text-[#0A0906]',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <path
            d="M12 4.3c2.5 0 4.2 1.8 4.2 4.3v1.9c.5 0 1-.2 1.3-.3.3 0 .6.2.6.5s-.3.6-.7.8l-1 .5c.4 1.2 1.4 2.1 2.7 2.4.4.1.6.4.5.7-.2.5-1 .8-2 1-.2.5-.5 1-1 1-.6 0-1.1-.4-2.2-.4s-1.6.9-2.4.9-1.3-.9-2.4-.9-1.6.4-2.2.4c-.5 0-.8-.5-1-1-1-.2-1.8-.5-2-1-.1-.3.1-.6.5-.7 1.3-.3 2.3-1.2 2.7-2.4l-1-.5c-.4-.2-.7-.5-.7-.8s.3-.5.6-.5c.3.1.8.3 1.3.3V8.6c0-2.5 1.7-4.3 4.2-4.3Z"
            fill="#FFF"
            stroke="#0A0906"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      ),
    };
  }

  if (key.includes('discord')) {
    return {
      wrapperClass: 'bg-[#5865F2] text-white',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <path
            d="M18.6 6.4A13 13 0 0 0 15.2 5l-.4.8a12 12 0 0 0-5.6 0L8.8 5a13 13 0 0 0-3.4 1.4C3.3 9.7 2.7 12.9 3 16c1.4 1.1 2.8 1.7 4.2 2.1l.9-1.4c-.5-.2-1-.5-1.5-.8l.4-.3a9.2 9.2 0 0 0 10 0l.4.3c-.5.3-1 .6-1.5.8l.9 1.4c1.4-.4 2.8-1 4.2-2.1.4-3.6-.6-6.8-2.4-9.6ZM9.5 14c-.8 0-1.4-.7-1.4-1.6s.6-1.6 1.4-1.6 1.4.7 1.4 1.6-.6 1.6-1.4 1.6Zm5 0c-.8 0-1.4-.7-1.4-1.6s.6-1.6 1.4-1.6 1.4.7 1.4 1.6-.6 1.6-1.4 1.6Z"
            fill="#FFF"
          />
        </svg>
      ),
    };
  }

  if (key === 'twitter' || key.includes('twitter')) {
    return {
      wrapperClass: 'bg-[#0D0D12] border border-white/15 text-white',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <path
            d="M17.8 4.5h2.6l-5.7 6.5 6.7 8.5h-5.2l-4.1-5.3-4.7 5.3H4.8l6.1-6.9L4.5 4.5h5.3l3.7 4.8 4.3-4.8Zm-.9 13.4h1.4L9 6H7.5l9.4 11.9Z"
            fill="#FFF"
          />
        </svg>
      ),
    };
  }

  if (key.includes('paypal')) {
    return {
      wrapperClass: 'bg-[#003087] text-white',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <path d="M8.5 18.5H6l1.9-12h4.7c2.4 0 3.9 1.2 3.5 3.4-.4 2.6-2.2 3.9-4.7 3.9H9.3l-.8 4.7Z" fill="#FFF" />
          <path d="M11.1 19.8H8.8l1.6-9.8h3.9c2 0 3.2 1 2.9 2.9-.3 2.1-1.9 3.2-3.9 3.2h-1.6l-.6 3.7Z" fill="#009CDE" fillOpacity="0.9" />
        </svg>
      ),
    };
  }

  if (key.includes('amazon')) {
    return {
      wrapperClass: 'bg-[#131921] text-white',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <path d="M7.5 11.5c0-2.1 1.6-3.5 4-3.5 1.8 0 3.1.8 3.3 2.1v4.4h-2v-1c-.6.8-1.4 1.2-2.4 1.2-1.7 0-2.9-1-2.9-3.2Zm5.3-.3c-.3-.9-1-1.4-1.8-1.4-1 0-1.6.7-1.6 1.7 0 1 .6 1.6 1.6 1.6.9 0 1.6-.6 1.8-1.9Z" fill="#FFF" />
          <path d="M5.5 16.5c3.8 2.4 8.7 2.4 12.6.2" stroke="#FF9900" strokeWidth="2" strokeLinecap="round" />
          <path d="m16.7 15.5 1.9.8-.5 2" stroke="#FF9900" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    };
  }

  if (key.includes('netflix')) {
    return {
      wrapperClass: 'bg-[#141414] border border-white/10',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <path d="M7 4h3v16H7V4Zm7 0h3v16h-3V4Z" fill="#B20710" />
          <path d="M7 4h3l7 16h-3L7 4Z" fill="#E50914" />
        </svg>
      ),
    };
  }

  if (key.includes('uber')) {
    return {
      wrapperClass: 'bg-[#09091A] border border-white/15',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <path d="M7.5 6.5v6.8a4.5 4.5 0 0 0 9 0V6.5" stroke="#FFF" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      ),
    };
  }

  if (key.includes('microsoft') || key.includes('outlook')) {
    return {
      wrapperClass: 'bg-[#1D1D1D] border border-white/10',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <rect x="4" y="4" width="7.2" height="7.2" fill="#F25022" />
          <rect x="12.8" y="4" width="7.2" height="7.2" fill="#7FBA00" />
          <rect x="4" y="12.8" width="7.2" height="7.2" fill="#00A4EF" />
          <rect x="12.8" y="12.8" width="7.2" height="7.2" fill="#FFB900" />
        </svg>
      ),
    };
  }

  if (key.includes('apple')) {
    return {
      wrapperClass: 'bg-[#141414] border border-white/15 text-white',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <path
            d="M15.6 12.6c0-2 1.6-3 1.7-3.1-.9-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7s-1.6-.7-2.6-.7c-1.4 0-2.6.8-3.3 2-1.4 2.4-.4 6 1 8 .7 1 1.5 2 2.5 2 1 0 1.4-.6 2.6-.6 1.2 0 1.5.6 2.6.6 1.1 0 1.8-.9 2.4-1.9.8-1.1 1.1-2.2 1.1-2.3 0 0-2.1-.8-2.1-3.1Zm-2-6c.5-.7.9-1.6.8-2.5-.8 0-1.7.5-2.3 1.2-.5.6-.9 1.5-.8 2.4.9.1 1.8-.4 2.3-1.1Z"
            fill="#FFF"
          />
        </svg>
      ),
    };
  }

  if (key.includes('yahoo')) {
    return {
      wrapperClass: 'bg-[#6001D2] text-white',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <path d="M5.5 6.5 11 14v4.5h2.2V14l5.3-7.5h-2.5l-3.9 5.5L8.1 6.5H5.5Z" fill="#FFF" />
          <circle cx="18.2" cy="17.2" r="1.3" fill="#FFF" />
        </svg>
      ),
    };
  }

  if (key.includes('viber')) {
    return {
      wrapperClass: 'bg-[#7360F2] text-white',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <path
            d="M12 4C7 4 4 7 4 11.4c0 2.7 1.3 4.8 3.4 6l-.4 2.7 2.8-1.5c.7.2 1.4.3 2.2.3 5 0 8-3 8-7.5S17 4 12 4Z"
            stroke="#FFF"
            strokeWidth="1.9"
            strokeLinejoin="round"
          />
          <path
            d="M9.6 8.8c.4-.3.8-.2 1.1.2l.8 1.1c.2.3.1.7-.1 1l-.4.4c.5.9 1.2 1.6 2.1 2.1l.4-.4c.3-.2.7-.3 1-.1l1.1.8c.4.3.5.7.2 1.1-.5.7-1.4 1-2.2.7-2.6-.8-4.7-2.9-5.5-5.5-.3-.8 0-1.7.7-2.2Z"
            fill="#FFF"
          />
        </svg>
      ),
    };
  }

  if (key === 'line') {
    return {
      wrapperClass: 'bg-[#06C755] text-white',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <path
            d="M12 4.5c-4.7 0-8.5 3-8.5 6.8 0 3.3 2.9 6 6.8 6.6.3.1.6.3.6.7v1.7c0 .3.3.5.6.3 2.5-1.5 5.4-4 7.1-6 .9-1 1.9-2.2 1.9-3.3 0-3.8-3.8-6.8-8.5-6.8Z"
            fill="#FFF"
          />
        </svg>
      ),
    };
  }

  if (key.includes('tinder')) {
    return {
      wrapperClass: 'bg-gradient-to-tr from-[#FD297B] to-[#FF655B] text-white',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <path
            d="M12.9 3.6c.4 2.7-.8 4.4-2.1 5.4-.4-1.3-.5-2.2-.3-3.1C7.3 7.5 6 10.6 6 13.2a6 6 0 0 0 12 0c0-4-2.3-7.5-5.1-9.6Z"
            fill="#FFF"
          />
        </svg>
      ),
    };
  }

  if (key.includes('spotify')) {
    return {
      wrapperClass: 'bg-[#1DB954] text-white',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <path d="M6 9.5c4-1.1 8.5-.9 12 .8M7 13c3.3-.9 7-.7 9.8.6M8.2 16.3c2.5-.6 5.2-.5 7.4.5" stroke="#FFF" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
    };
  }

  if (key.includes('linkedin')) {
    return {
      wrapperClass: 'bg-[#0A66C2] text-white',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <circle cx="7.2" cy="7.2" r="1.4" fill="#FFF" />
          <path d="M6 10.3h2.4V18H6v-7.7Zm4.5 0h2.3v1.1c.5-.8 1.3-1.3 2.5-1.3 2 0 3.2 1.2 3.2 3.5V18h-2.4v-3.9c0-1.1-.4-1.8-1.4-1.8s-1.8.7-1.8 1.9V18h-2.4v-7.7Z" fill="#FFF" />
        </svg>
      ),
    };
  }

  if (key.includes('youtube')) {
    return {
      wrapperClass: 'bg-[#FF0000] text-white',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <path d="M10 8.5 16 12l-6 3.5v-7Z" fill="#FFF" />
        </svg>
      ),
    };
  }

  if (key.includes('signal')) {
    return {
      wrapperClass: 'bg-[#3A76F0] text-white',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <path d="M12 5a7 7 0 0 1 6.2 10.3l.6 2.7-2.7-.6A7 7 0 1 1 12 5Z" fill="#FFF" />
          <circle cx="12" cy="12" r="8.6" stroke="#FFF" strokeWidth="1.4" strokeDasharray="2.5 2.5" />
        </svg>
      ),
    };
  }

  if (key.includes('wechat')) {
    return {
      wrapperClass: 'bg-[#07C160] text-white',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <ellipse cx="9.8" cy="10.2" rx="5.5" ry="4.4" fill="#FFF" />
          <ellipse cx="15" cy="14" rx="4.5" ry="3.6" fill="#E6FFF0" />
        </svg>
      ),
    };
  }

  if (key.includes('twitch')) {
    return {
      wrapperClass: 'bg-[#9146FF] text-white',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <path d="M5 4h14v10l-3.5 3.5H12l-2.5 2.5v-2.5H5V4Z" fill="#FFF" />
          <path d="M11 8v4M14.8 8v4" stroke="#9146FF" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ),
    };
  }

  if (key === 'other') {
    return {
      wrapperClass: 'bg-[#D4AF37] text-[#0A0906]',
      icon: (
        <svg viewBox="0 0 24 24" className={svgClass} fill="none">
          <rect x="6.5" y="3.5" width="11" height="17" rx="2.5" stroke="#0A0906" strokeWidth="2" />
          <circle cx="12" cy="17" r="1" fill="#0A0906" />
        </svg>
      ),
    };
  }

  return null;
}
