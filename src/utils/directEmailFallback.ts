import type { EmailSuggestionOption } from '../types';

export const CUSTOM_EMAIL_DOMAIN = 'veribox.name.ng';

export const REALISTIC_FIRST_NAMES = [
  'david',
  'alex',
  'sarah',
  'michael',
  'daniel',
  'emmanuel',
  'james',
  'amara',
  'grace',
  'victor',
  'john',
  'rachel',
  'joshua',
  'chris',
  'brian',
  'samuel',
  'chidi',
  'jessica',
  'anthony',
  'fiona',
  'kevin',
  'elizabeth',
  'marcus',
  'olivia',
  'benjamin',
  'nathan',
  'sophia',
  'elijah',
];

export const REALISTIC_LAST_NAMES = [
  'turner',
  'eze',
  'martins',
  'okafor',
  'clark',
  'adebayo',
  'stone',
  'miller',
  'johnson',
  'davis',
  'brown',
  'okeke',
  'adams',
  'walker',
  'taylor',
  'wilson',
  'baker',
  'evans',
  'collins',
  'morgan',
  'edwards',
  'bell',
  'cooper',
  'wood',
];

export interface IdentityTrustEvaluation {
  score: number; // 0 - 100
  level: 'high' | 'medium' | 'low';
  label: string;
  badge: string;
  reasons: string[];
  isSocialSafe: boolean;
}

export function evaluateIdentityTrust(username: string): IdentityTrustEvaluation {
  const norm = normalizeCustomUsername(username);
  if (!norm || norm.length < 3) {
    return {
      score: 30,
      level: 'low',
      label: 'Too short (minimum 3 chars)',
      badge: 'Low Trust',
      reasons: ['Username is too short for social platform verification.'],
      isSocialSafe: false,
    };
  }

  const redFlags = ['temp', 'burner', 'fake', 'bot', 'box', 'veribox', 'disposable', 'trash', 'test', 'spam', 'dummy'];
  for (const flag of redFlags) {
    if (norm.includes(flag)) {
      return {
        score: 38,
        level: 'low',
        label: `Contains flagged keyword ("${flag}")`,
        badge: 'Social Ban Risk',
        reasons: [
          `Social platforms (Meta/Facebook, Instagram, Google) maintain blocklists for words like "${flag}". Avoid this to prevent account suspensions.`,
        ],
        isSocialSafe: false,
      };
    }
  }

  // Pure digits or hex strings
  if (/^\d+$/.test(norm) || /^[a-f0-9]{6,}$/i.test(norm)) {
    return {
      score: 45,
      level: 'low',
      label: 'Random digits or hex string',
      badge: 'Bot Pattern',
      reasons: ['Random numbers or hex strings trigger automated bot detection on registration forms.'],
      isSocialSafe: false,
    };
  }

  // Generic patterns like user123 or mail456
  if (/^(?:user|mail|admin|account|support)\d*$/i.test(norm)) {
    return {
      score: 52,
      level: 'medium',
      label: 'Generic prefix',
      badge: 'Medium Trust',
      reasons: ['Generic words like "user" or "mail" can lower trust on strict platforms like Facebook.'],
      isSocialSafe: false,
    };
  }

  // Natural human name pattern (e.g. first.last, first_last, or realistic name combination)
  const hasDot = norm.includes('.');
  const hasUnderscore = norm.includes('_');
  const endsWithTwoDigits = /\d{2}$/.test(norm);

  if ((hasDot || hasUnderscore) && !endsWithTwoDigits) {
    return {
      score: 99,
      level: 'high',
      label: 'Optimal Human Name Pattern',
      badge: 'Facebook & Instagram Safe',
      reasons: [
        'Natural first.last human name pattern. Has the highest approval rate across Meta, Google, and TikTok.',
      ],
      isSocialSafe: true,
    };
  }

  if (hasDot || hasUnderscore || endsWithTwoDigits) {
    return {
      score: 94,
      level: 'high',
      label: 'Realistic Personal Alias',
      badge: 'High Trust',
      reasons: ['Realistic personal name structure with normal birth or graduation digits.'],
      isSocialSafe: true,
    };
  }

  if (norm.length >= 4 && /^[a-z]+$/i.test(norm)) {
    return {
      score: 90,
      level: 'high',
      label: 'Clean Alphabetical Identity',
      badge: 'Verified Identity',
      reasons: ['Clean natural letters without bot patterns.'],
      isSocialSafe: true,
    };
  }

  return {
    score: 82,
    level: 'high',
    label: 'Standard Valid Address',
    badge: 'Valid',
    reasons: ['Valid syntax without known fraud triggers.'],
    isSocialSafe: true,
  };
}

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

export function getRandomRealisticPair(): { first: string; last: string } {
  const first = REALISTIC_FIRST_NAMES[Math.floor(Math.random() * REALISTIC_FIRST_NAMES.length)];
  const last = REALISTIC_LAST_NAMES[Math.floor(Math.random() * REALISTIC_LAST_NAMES.length)];
  return { first, last };
}

export function generateCustomDomainSuggestions(
  firstName: string,
  lastName: string,
  domain: string = CUSTOM_EMAIL_DOMAIN
): EmailSuggestionOption[] {
  const cleanDomain =
    (domain || CUSTOM_EMAIL_DOMAIN).trim().toLowerCase().replace(/^@+/, '') || CUSTOM_EMAIL_DOMAIN;

  let cleanFirst = firstName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14);
  let cleanLast = lastName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14);

  // If first name is missing or generic, substitute with realistic authentic names
  if (!cleanFirst || cleanFirst === 'user' || cleanFirst === 'veribox' || cleanFirst.length < 2) {
    const pair = getRandomRealisticPair();
    cleanFirst = pair.first;
    if (!cleanLast || cleanLast === 'mail') cleanLast = pair.last;
  }
  if (!cleanLast || cleanLast === 'mail') {
    cleanLast = REALISTIC_LAST_NAMES[Math.floor(Math.random() * REALISTIC_LAST_NAMES.length)];
  }

  const birthYr = Math.floor(88 + Math.random() * 14); // 88 - 01 (realistic age 24 - 38)
  const yrStr = birthYr < 10 ? `0${birthYr}` : String(birthYr);
  const n1 = Math.floor(12 + Math.random() * 87);

  const candidates = [
    `${cleanFirst}.${cleanLast}`,
    `${cleanFirst}${cleanLast}`,
    `${cleanFirst}.${cleanLast}${yrStr}`,
    `${cleanFirst.slice(0, 1)}.${cleanLast}`,
    `${cleanFirst}${cleanLast}${yrStr}`,
    `${cleanFirst.slice(0, 1)}${cleanLast}${n1}`,
  ];

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const c of candidates) {
    const norm = normalizeCustomUsername(c);
    if (norm.length >= 3 && !seen.has(norm)) {
      seen.add(norm);
      unique.push(norm);
    }
    if (unique.length >= 5) break;
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

