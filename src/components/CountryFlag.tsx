interface CountryFlagProps {
  code: string;
  className?: string;
}

export function CountryFlag({ code, className = 'h-5 w-7' }: CountryFlagProps) {
  const c = code.toUpperCase();

  const renderSvg = () => {
    switch (c) {
      case 'US':
        return (
          <svg viewBox="0 0 28 20" className="h-full w-full">
            <rect width="28" height="20" fill="#B22234" />
            <rect y="3" width="28" height="2.2" fill="#FFF" />
            <rect y="7.4" width="28" height="2.2" fill="#FFF" />
            <rect y="11.8" width="28" height="2.2" fill="#FFF" />
            <rect y="16.2" width="28" height="2.2" fill="#FFF" />
            <rect width="12" height="10.8" fill="#3C3B6E" />
            <circle cx="3" cy="3" r="0.8" fill="#FFF" />
            <circle cx="6" cy="3" r="0.8" fill="#FFF" />
            <circle cx="9" cy="3" r="0.8" fill="#FFF" />
            <circle cx="4.5" cy="5.4" r="0.8" fill="#FFF" />
            <circle cx="7.5" cy="5.4" r="0.8" fill="#FFF" />
            <circle cx="3" cy="7.8" r="0.8" fill="#FFF" />
            <circle cx="6" cy="7.8" r="0.8" fill="#FFF" />
            <circle cx="9" cy="7.8" r="0.8" fill="#FFF" />
          </svg>
        );
      case 'GB':
        return (
          <svg viewBox="0 0 28 20" className="h-full w-full">
            <rect width="28" height="20" fill="#012169" />
            <path d="M0 0 L28 20 M28 0 L0 20" stroke="#FFF" strokeWidth="3.6" />
            <path d="M0 0 L28 20 M28 0 L0 20" stroke="#C8102E" strokeWidth="1.8" />
            <path d="M14 0 V20 M0 10 H28" stroke="#FFF" strokeWidth="5.4" />
            <path d="M14 0 V20 M0 10 H28" stroke="#C8102E" strokeWidth="3.2" />
          </svg>
        );
      case 'CA':
        return (
          <svg viewBox="0 0 28 20" className="h-full w-full">
            <rect width="28" height="20" fill="#FFF" />
            <rect width="7" height="20" fill="#D80621" />
            <rect x="21" width="7" height="20" fill="#D80621" />
            <path d="M14 4 L15.5 8 L18.5 7.5 L16.5 10.5 L18 13 L14.7 12.5 L14.7 16 H13.3 V12.5 L10 13 L11.5 10.5 L9.5 7.5 L12.5 8 Z" fill="#D80621" />
          </svg>
        );
      case 'FI':
        return (
          <svg viewBox="0 0 28 20" className="h-full w-full">
            <rect width="28" height="20" fill="#FFF" />
            <rect x="8" width="4.5" height="20" fill="#003580" />
            <rect y="7.8" width="28" height="4.5" fill="#003580" />
          </svg>
        );
      case 'SE':
        return (
          <svg viewBox="0 0 28 20" className="h-full w-full">
            <rect width="28" height="20" fill="#006AA7" />
            <rect x="8" width="4" height="20" fill="#FECC00" />
            <rect y="8" width="28" height="4" fill="#FECC00" />
          </svg>
        );
      case 'DK':
        return (
          <svg viewBox="0 0 28 20" className="h-full w-full">
            <rect width="28" height="20" fill="#C60C30" />
            <rect x="8" width="3.5" height="20" fill="#FFF" />
            <rect y="8.2" width="28" height="3.5" fill="#FFF" />
          </svg>
        );
      case 'NL':
        return (
          <svg viewBox="0 0 28 20" className="h-full w-full">
            <rect width="28" height="6.7" fill="#AE1C28" />
            <rect y="6.7" width="28" height="6.7" fill="#FFF" />
            <rect y="13.3" width="28" height="6.7" fill="#21468B" />
          </svg>
        );
      case 'DE':
        return (
          <svg viewBox="0 0 28 20" className="h-full w-full">
            <rect width="28" height="6.7" fill="#111111" />
            <rect y="6.7" width="28" height="6.7" fill="#DD0000" />
            <rect y="13.3" width="28" height="6.7" fill="#FFCE00" />
          </svg>
        );
      case 'FR':
        return (
          <svg viewBox="0 0 28 20" className="h-full w-full">
            <rect width="9.3" height="20" fill="#0055A4" />
            <rect x="9.3" width="9.4" height="20" fill="#FFF" />
            <rect x="18.7" width="9.3" height="20" fill="#EF4135" />
          </svg>
        );
      case 'BE':
        return (
          <svg viewBox="0 0 28 20" className="h-full w-full">
            <rect width="9.3" height="20" fill="#111111" />
            <rect x="9.3" width="9.4" height="20" fill="#FAE042" />
            <rect x="18.7" width="9.3" height="20" fill="#ED2939" />
          </svg>
        );
      case 'ES':
        return (
          <svg viewBox="0 0 28 20" className="h-full w-full">
            <rect width="28" height="5" fill="#AA151B" />
            <rect y="5" width="28" height="10" fill="#F1BF00" />
            <rect y="15" width="28" height="5" fill="#AA151B" />
          </svg>
        );
      case 'RU':
        return (
          <svg viewBox="0 0 28 20" className="h-full w-full">
            <rect width="28" height="6.7" fill="#FFF" />
            <rect y="6.7" width="28" height="6.7" fill="#0039A6" />
            <rect y="13.3" width="28" height="6.7" fill="#D52B1E" />
          </svg>
        );
      case 'CN':
        return (
          <svg viewBox="0 0 28 20" className="h-full w-full">
            <rect width="28" height="20" fill="#DE2910" />
            <circle cx="6" cy="5.5" r="2.2" fill="#FFDE00" />
            <circle cx="10.5" cy="3" r="0.8" fill="#FFDE00" />
            <circle cx="12" cy="5" r="0.8" fill="#FFDE00" />
            <circle cx="11.5" cy="7.5" r="0.8" fill="#FFDE00" />
            <circle cx="9.8" cy="9" r="0.8" fill="#FFDE00" />
          </svg>
        );
      case 'HK':
        return (
          <svg viewBox="0 0 28 20" className="h-full w-full">
            <rect width="28" height="20" fill="#DE2910" />
            <circle cx="14" cy="10" r="4" fill="#FFF" />
            <circle cx="14" cy="10" r="1.4" fill="#DE2910" />
          </svg>
        );
      case 'PH':
        return (
          <svg viewBox="0 0 28 20" className="h-full w-full">
            <rect width="28" height="10" fill="#0038A8" />
            <rect y="10" width="28" height="10" fill="#CE1126" />
            <polygon points="0,0 13,10 0,20" fill="#FFF" />
            <circle cx="4.5" cy="10" r="2.1" fill="#FCD116" />
          </svg>
        );
      case 'ID':
        return (
          <svg viewBox="0 0 28 20" className="h-full w-full">
            <rect width="28" height="10" fill="#CE1126" />
            <rect y="10" width="28" height="10" fill="#FFF" />
          </svg>
        );
      case 'MY':
        return (
          <svg viewBox="0 0 28 20" className="h-full w-full">
            <rect width="28" height="20" fill="#CC0001" />
            <rect y="3" width="28" height="2.4" fill="#FFF" />
            <rect y="7.8" width="28" height="2.4" fill="#FFF" />
            <rect y="12.6" width="28" height="2.4" fill="#FFF" />
            <rect y="17.2" width="28" height="2.4" fill="#FFF" />
            <rect width="13" height="10.5" fill="#010066" />
            <circle cx="6.2" cy="5.2" r="2.6" fill="#FFCC00" />
          </svg>
        );
      case 'SI':
        return (
          <svg viewBox="0 0 28 20" className="h-full w-full">
            <rect width="28" height="6.7" fill="#FFF" />
            <rect y="6.7" width="28" height="6.7" fill="#005DA4" />
            <rect y="13.3" width="28" height="6.7" fill="#ED1C24" />
          </svg>
        );
      case 'MK':
        return (
          <svg viewBox="0 0 28 20" className="h-full w-full">
            <rect width="28" height="20" fill="#D20000" />
            <path d="M0 0 L28 20 M28 0 L0 20 M14 0 V20 M0 10 H28" stroke="#FFE600" strokeWidth="2.2" />
            <circle cx="14" cy="10" r="3.4" fill="#FFE600" />
          </svg>
        );
      default: {
        if (/^[A-Z]{2}$/.test(c)) {
          const flag = String.fromCodePoint(
            0x1f1e6 + c.charCodeAt(0) - 65,
            0x1f1e6 + c.charCodeAt(1) - 65
          );
          return (
            <span className="flex h-full w-full items-center justify-center bg-[#1A160D] text-[15px] leading-none">
              {flag}
            </span>
          );
        }
        return (
          <svg viewBox="0 0 28 20" className="h-full w-full">
            <rect width="28" height="20" fill="#1F1A0F" />
            <circle cx="14" cy="10" r="6" fill="none" stroke="#D4AF37" strokeWidth="1.6" />
            <ellipse cx="14" cy="10" rx="3" ry="6" fill="none" stroke="#D4AF37" strokeWidth="1.2" />
            <line x1="8" y1="10" x2="20" y2="10" stroke="#D4AF37" strokeWidth="1.2" />
          </svg>
        );
      }
    }
  };

  return (
    <span
      className={`inline-flex shrink-0 overflow-hidden rounded-[4px] border border-white/15 shadow-xs ${className}`}
      aria-hidden="true"
    >
      {renderSvg()}
    </span>
  );
}
