import type { EmailSuggestionOption } from '../types';

export const CUSTOM_EMAIL_DOMAIN = 'veribox.name.ng';

export function extractOtpFromText(text: string): string | null {
  if (!text) return null;
  const labeledMatch = text.match(
    /(?:code|otp|pin|verification|passcode|token|verify|confirm)[^\dA-Z]{0,18}(\d{4,8})\b/i
  );
  if (labeledMatch?.[1]) return labeledMatch[1];

  const standaloneMatch = text.match(/\b(\d{6})\b/) || text.match(/\b(\d{4,5})\b/);
  return standaloneMatch?.[1] || null;
}

export function normalizeCustomUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .split('@')[0]
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 30);
}

export function generateCustomDomainSuggestions(
  firstName: string,
  lastName: string,
  domain: string = CUSTOM_EMAIL_DOMAIN
): EmailSuggestionOption[] {
  const cleanDomain = (domain || CUSTOM_EMAIL_DOMAIN).trim().toLowerCase().replace(/^@+/, '') || CUSTOM_EMAIL_DOMAIN;
  const cleanFirst =
    firstName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 12) || 'user';
  const cleanLast =
    lastName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 12) || 'mail';

  const n1 = Math.floor(12 + Math.random() * 87);
  const n2 = Math.floor(101 + Math.random() * 890);
  const n3 = Math.floor(14 + Math.random() * 85);

  const candidates = [
    `${cleanFirst}${cleanLast}`,
    `${cleanFirst}.${cleanLast}`,
    `${cleanFirst.slice(0, 1)}${cleanLast}${n1}`,
    `${cleanFirst}${n2}`,
    `${cleanFirst}.${cleanLast}${n3}`,
  ];

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const c of candidates) {
    const norm = normalizeCustomUsername(c);
    if (norm.length >= 3 && !seen.has(norm)) {
      seen.add(norm);
      unique.push(norm);
    }
    if (unique.length >= 4) break;
  }

  return unique.map((username, idx) => ({
    id: `opt-${idx + 1}`,
    address: `${username}@${cleanDomain}`,
    username,
    domain: cleanDomain,
    provider: 'veribox',
    providerLabel: `@${cleanDomain}`,
  }));
}
