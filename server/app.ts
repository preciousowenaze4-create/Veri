import 'dotenv/config';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import express from 'express';
import { GoogleGenAI, Type, type GenerateContentResponse } from '@google/genai';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

interface CachedEntry<T> {
  data: T;
  expiresAt: number;
}

interface PhoneNumberEntry {
  number: string;
  digits: string;
  country: string;
  countryCode: string;
  dialCode: string;
  sourceUrl: string;
  provider: 'anonymsms' | 'mytempsms';
  platform: string;
  verifiedForPlatform: boolean;
}

interface SmsMessageEntry {
  id: string;
  sender: string;
  receivedAt: string;
  text: string;
  otp: string | null;
}

interface CountryOption {
  countryCode: string;
  country: string;
  dialCode: string;
  availableCount: number;
  platformVerifiedCount: number;
}

interface SessionBatchState {
  currentBatch: PhoneNumberEntry[];
  seenDigits: Set<string>;
  batchNumber: number;
}

const numberCache = new Map<string, CachedEntry<PhoneNumberEntry[]>>();
const sessionTracker = new Map<string, SessionBatchState>();

const COUNTRY_DEFINITIONS: Array<{
  countryCode: string;
  country: string;
  dialCode: string;
  prefix: string;
  anonymsmsPath?: string;
  mytempsmsPath?: string;
}> = [
  {
    countryCode: 'GB',
    country: 'United Kingdom',
    dialCode: '+44',
    prefix: '44',
    anonymsmsPath: '/united-kingdom',
    mytempsmsPath: '/receive-sms-online/uk-phone-number.html',
  },
  {
    countryCode: 'US',
    country: 'United States',
    dialCode: '+1',
    prefix: '1',
    anonymsmsPath: '/united-states',
    mytempsmsPath: '/receive-sms-online/usa-phone-number.html',
  },
  {
    countryCode: 'CA',
    country: 'Canada',
    dialCode: '+1',
    prefix: '1',
    mytempsmsPath: '/receive-sms-online/canada-phone-number.html',
  },
  {
    countryCode: 'FI',
    country: 'Finland',
    dialCode: '+358',
    prefix: '358',
    anonymsmsPath: '/finland',
    mytempsmsPath: '/receive-sms-online/finland-phone-number.html',
  },
  {
    countryCode: 'NL',
    country: 'Netherlands',
    dialCode: '+31',
    prefix: '31',
    anonymsmsPath: '/netherlands',
    mytempsmsPath: '/receive-sms-online/netherlands-phone-number.html',
  },
  {
    countryCode: 'DE',
    country: 'Germany',
    dialCode: '+49',
    prefix: '49',
    anonymsmsPath: '/germany',
    mytempsmsPath: '/receive-sms-online/germany-phone-number.html',
  },
  {
    countryCode: 'FR',
    country: 'France',
    dialCode: '+33',
    prefix: '33',
    anonymsmsPath: '/france',
    mytempsmsPath: '/receive-sms-online/france-phone-number.html',
  },
  {
    countryCode: 'ES',
    country: 'Spain',
    dialCode: '+34',
    prefix: '34',
    anonymsmsPath: '/spain',
  },
  {
    countryCode: 'SE',
    country: 'Sweden',
    dialCode: '+46',
    prefix: '46',
    mytempsmsPath: '/receive-sms-online/sweden-phone-number.html',
  },
  {
    countryCode: 'BE',
    country: 'Belgium',
    dialCode: '+32',
    prefix: '32',
    mytempsmsPath: '/receive-sms-online/belgium-phone-number.html',
  },
  {
    countryCode: 'DK',
    country: 'Denmark',
    dialCode: '+45',
    prefix: '45',
    mytempsmsPath: '/receive-sms-online/denmark-phone-number.html',
  },
  {
    countryCode: 'HK',
    country: 'Hong Kong',
    dialCode: '+852',
    prefix: '852',
    mytempsmsPath: '/receive-sms-online/hongkong-phone-number.html',
  },
  {
    countryCode: 'PH',
    country: 'Philippines',
    dialCode: '+63',
    prefix: '63',
    mytempsmsPath: '/receive-sms-online/philippines-phone-number.html',
  },
  {
    countryCode: 'ID',
    country: 'Indonesia',
    dialCode: '+62',
    prefix: '62',
    mytempsmsPath: '/receive-sms-online/indonesia-phone-number.html',
  },
  {
    countryCode: 'MY',
    country: 'Malaysia',
    dialCode: '+60',
    prefix: '60',
    mytempsmsPath: '/receive-sms-online/malaysia-phone-number.html',
  },
  {
    countryCode: 'CN',
    country: 'China',
    dialCode: '+86',
    prefix: '86',
    mytempsmsPath: '/receive-sms-online/china-phone-number.html',
  },
  {
    countryCode: 'SI',
    country: 'Slovenia',
    dialCode: '+386',
    prefix: '386',
    mytempsmsPath: '/receive-sms-online/slovenia-phone-number.html',
  },
  {
    countryCode: 'MK',
    country: 'North Macedonia',
    dialCode: '+389',
    prefix: '389',
    mytempsmsPath: '/receive-sms-online/macedonia-phone-number.html',
  },
  {
    countryCode: 'RU',
    country: 'Russia',
    dialCode: '+7',
    prefix: '7',
    anonymsmsPath: '/russia',
  },
];

const EXTRA_PREFIXES: Array<{ prefix: string; country: string; code: string; dialCode: string }> = [
  { prefix: '358', country: 'Finland', code: 'FI', dialCode: '+358' },
  { prefix: '389', country: 'North Macedonia', code: 'MK', dialCode: '+389' },
  { prefix: '386', country: 'Slovenia', code: 'SI', dialCode: '+386' },
  { prefix: '852', country: 'Hong Kong', code: 'HK', dialCode: '+852' },
  { prefix: '372', country: 'Estonia', code: 'EE', dialCode: '+372' },
  { prefix: '371', country: 'Latvia', code: 'LV', dialCode: '+371' },
  { prefix: '370', country: 'Lithuania', code: 'LT', dialCode: '+370' },
  { prefix: '351', country: 'Portugal', code: 'PT', dialCode: '+351' },
  { prefix: '353', country: 'Ireland', code: 'IE', dialCode: '+353' },
  { prefix: '420', country: 'Czech Republic', code: 'CZ', dialCode: '+420' },
  { prefix: '421', country: 'Slovakia', code: 'SK', dialCode: '+421' },
  { prefix: '380', country: 'Ukraine', code: 'UA', dialCode: '+380' },
  { prefix: '44', country: 'United Kingdom', code: 'GB', dialCode: '+44' },
  { prefix: '31', country: 'Netherlands', code: 'NL', dialCode: '+31' },
  { prefix: '49', country: 'Germany', code: 'DE', dialCode: '+49' },
  { prefix: '33', country: 'France', code: 'FR', dialCode: '+33' },
  { prefix: '46', country: 'Sweden', code: 'SE', dialCode: '+46' },
  { prefix: '47', country: 'Norway', code: 'NO', dialCode: '+47' },
  { prefix: '45', country: 'Denmark', code: 'DK', dialCode: '+45' },
  { prefix: '48', country: 'Poland', code: 'PL', dialCode: '+48' },
  { prefix: '34', country: 'Spain', code: 'ES', dialCode: '+34' },
  { prefix: '39', country: 'Italy', code: 'IT', dialCode: '+39' },
  { prefix: '43', country: 'Austria', code: 'AT', dialCode: '+43' },
  { prefix: '32', country: 'Belgium', code: 'BE', dialCode: '+32' },
  { prefix: '41', country: 'Switzerland', code: 'CH', dialCode: '+41' },
  { prefix: '61', country: 'Australia', code: 'AU', dialCode: '+61' },
  { prefix: '60', country: 'Malaysia', code: 'MY', dialCode: '+60' },
  { prefix: '62', country: 'Indonesia', code: 'ID', dialCode: '+62' },
  { prefix: '63', country: 'Philippines', code: 'PH', dialCode: '+63' },
  { prefix: '86', country: 'China', code: 'CN', dialCode: '+86' },
  { prefix: '7', country: 'Russia', code: 'RU', dialCode: '+7' },
  { prefix: '1', country: 'United States', code: 'US', dialCode: '+1' },
];

function inferCountry(digits: string): { country: string; code: string; dialCode: string } {
  for (const item of EXTRA_PREFIXES) {
    if (digits.startsWith(item.prefix)) {
      return { country: item.country, code: item.code, dialCode: item.dialCode };
    }
  }
  return { country: 'International', code: 'INT', dialCode: '+' };
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)));
}

function stripTags(html: string): string {
  const withoutBlocks = html
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ');
  const bounded = withoutBlocks.length > 90000 ? withoutBlocks.slice(0, 90000) : withoutBlocks;
  const withBreaks = bounded.replace(/<(?:br|p|div|li|tr|td|th|h[1-6])\b[^>]*>/gi, '\n');
  return decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractOtpCode(rawText: string): string | null {
  if (!rawText) return null;
  const text = rawText.length > 24000 ? rawText.slice(0, 24000) : rawText;

  // 1. Explicitly prefixed verification codes (e.g. G-123456, FB-123456, 123-456)
  const prefixed = text.match(/\b(?:G-|FB-|IG-|WA-|TT-)(\d{4,8})\b|\b(\d{3}-\d{3})\b/i);
  if (prefixed) return (prefixed[1] || prefixed[2] || '').trim();

  // Strip URLs before scanning prose/digits so tracking link query params are never mistaken for OTPs
  const textWithoutUrls = text.replace(/https?:\/\/[^\s<>)"']+/gi, ' ');

  // 2. "482910 is your verification code"
  const beforePhrase = textWithoutUrls.match(
    /\b(\d{4,8})\s+is\s+(?:your|the)\s+(?:[a-z]+\s+){0,4}(?:code|otp|pin|passcode|token)\b/i
  );
  if (beforePhrase) return beforePhrase[1];

  // 3. Spaced 6-digit OTPs near verification keywords ("123 456")
  const contextualSpaced = textWithoutUrls.match(
    /(?:code|otp|pin|verification|verify|confirm|confirmation|passcode|security|login|instagram|facebook|tiktok)[^\d\n]{0,60}\b(\d{3})\s+(\d{3})\b/i
  );
  if (contextualSpaced) return `${contextualSpaced[1]}${contextualSpaced[2]}`;

  // 4. Contextual OTPs ("Your verification code is: 482910" or "Code:\n482910")
  const contextual = textWithoutUrls.match(
    /(?:code|otp|pin|verification|verify|passcode|token|confirmation|one-time|security|login|رمز|código|код)[^\d]{0,80}\b(\d{4,8})\b/i
  );
  if (contextual) return contextual[1];

  // 5. Standalone OTP on its own line (common in centered HTML code boxes)
  const standaloneLine = textWithoutUrls.match(/^\s*(\d{4,8})\s*$/m);
  if (standaloneLine && !/^(?:19|20)\d{2}$/.test(standaloneLine[1])) {
    return standaloneLine[1];
  }

  // 6. Clean 6-digit or 5-digit fallback (ignoring years & long phone numbers)
  const sixDigit = textWithoutUrls.match(/\b(\d{6})\b/);
  if (sixDigit) return sixDigit[1];

  const fiveDigit = textWithoutUrls.match(/\b(\d{5})\b/);
  if (fiveDigit) return fiveDigit[1];

  const all4to8 = textWithoutUrls.match(/\b(\d{4,8})\b/g) || [];
  const nonYear = all4to8.find((n) => !/^(?:19|20)\d{2}$/.test(n));
  if (nonYear) return nonYear;

  return null;
}

const PLATFORM_PATH_MAP: Record<string, string> = {
  all: '/',
  facebook: '/facebook',
  instagram: '/instagram',
  tiktok: '/tiktok',
  whatsapp: '/whatsapp',
  telegram: '/telegram',
  google: '/google',
};

const PLATFORM_KEYWORDS: Record<string, RegExp> = {
  facebook: /\b(facebook|fb|meta|messenger)\b/i,
  instagram: /\b(instagram|ig|instagr|meta)\b/i,
  tiktok: /\b(tiktok|tik\s*tok|bytedance)\b/i,
  whatsapp: /\b(whatsapp|whats\s*app)\b/i,
  telegram: /\b(telegram)\b/i,
  google: /\b(google|gmail|youtube|g-\d{4,8})\b/i,
};

function matchesPlatform(msg: SmsMessageEntry, platform: string): boolean {
  const key = platform.toLowerCase();
  if (!key || key === 'all') return true;
  const regex = PLATFORM_KEYWORDS[key];
  if (!regex) return true;
  return regex.test(msg.sender) || regex.test(msg.text);
}

const FREE_SMS_DIRECTORY = [
  {
    name: 'Anonymsms',
    url: 'https://anonymsms.com/',
    platforms: ['Facebook', 'Instagram', 'TikTok', 'WhatsApp'],
    region: 'UK, US, Finland, Netherlands, Germany',
  },
  {
    name: 'MyTempSMS',
    url: 'https://mytempsms.com/',
    platforms: ['Facebook', 'Instagram', 'TikTok', 'WhatsApp'],
    region: '18 Countries Global',
  },
  {
    name: 'Receive-SMSS',
    url: 'https://receive-smss.com/',
    platforms: ['Facebook', 'WhatsApp', 'Google', 'TikTok'],
    region: 'US, UK, Canada, Europe',
  },
  {
    name: 'FreePhoneNum',
    url: 'https://freephonenum.com/',
    platforms: ['Facebook', 'Instagram', 'Telegram'],
    region: 'United States & Canada',
  },
  {
    name: 'Quackr',
    url: 'https://quackr.io/temporary-numbers',
    platforms: ['WhatsApp', 'TikTok', 'Instagram', 'Telegram'],
    region: 'US, UK, France, Germany',
  },
];

async function fetchAnonymsmsNumbers(
  targetPath: string,
  platformLabel: string,
  verifiedForPlatform: boolean
): Promise<PhoneNumberEntry[]> {
  const cacheKey = `anon::${targetPath}::${platformLabel}`;
  const cached = numberCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const response = await fetch(`https://anonymsms.com${targetPath}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(6500),
  });

  if (!response.ok) return [];

  const html = await response.text();
  const seen = new Set<string>();
  const numbers: PhoneNumberEntry[] = [];

  const anchorRegex = /href="\/number\/(\d{7,16})\/?"/g;
  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(html)) !== null) {
    const digits = match[1];
    if (seen.has(digits)) continue;
    seen.add(digits);
    const { country, code, dialCode } = inferCountry(digits);
    numbers.push({
      number: `+${digits}`,
      digits,
      country,
      countryCode: code,
      dialCode,
      sourceUrl: `https://anonymsms.com/number/${digits}/`,
      provider: 'anonymsms',
      platform: platformLabel,
      verifiedForPlatform,
    });
  }

  numberCache.set(cacheKey, {
    data: numbers.slice(0, 40),
    expiresAt: Date.now() + 90_000,
  });

  return numbers.slice(0, 40);
}

async function fetchMyTempSmsNumbers(
  mytempsmsPath: string,
  countryDef: (typeof COUNTRY_DEFINITIONS)[number],
  platformLabel: string
): Promise<PhoneNumberEntry[]> {
  const cacheKey = `mytemp::${mytempsmsPath}::${platformLabel}`;
  const cached = numberCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const response = await fetch(`https://mytempsms.com${mytempsmsPath}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(6500),
  });

  if (!response.ok) return [];
  const html = await response.text();

  const numbers: PhoneNumberEntry[] = [];
  const seen = new Set<string>();
  const itemRegex =
    /"@type":"ListItem","position":\d+,"name":"([^"]+)","url":"(https:\/\/mytempsms\.com\/receive-sms-online\/[^"]+\.html)"/g;

  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(html)) !== null) {
    const rawName = match[1].trim();
    const url = match[2];
    if (rawName.includes('*') || url.includes('buy_phone')) continue;
    const digits = rawName.replace(/\D/g, '');
    if (digits.length < 7 || seen.has(digits)) continue;
    seen.add(digits);

    numbers.push({
      number: `+${digits}`,
      digits,
      country: countryDef.country,
      countryCode: countryDef.countryCode,
      dialCode: countryDef.dialCode,
      sourceUrl: url,
      provider: 'mytempsms',
      platform: platformLabel,
      verifiedForPlatform: false,
    });
  }

  numberCache.set(cacheKey, {
    data: numbers.slice(0, 30),
    expiresAt: Date.now() + 120_000,
  });

  return numbers.slice(0, 30);
}

async function fetchCombinedPool(platformKey: string, countryCode?: string): Promise<PhoneNumberEntry[]> {
  const safePlatform = PLATFORM_PATH_MAP[platformKey] ? platformKey : 'all';
  const platformLabel =
    safePlatform === 'all'
      ? 'All Apps'
      : safePlatform.charAt(0).toUpperCase() + safePlatform.slice(1);

  const platformPath = PLATFORM_PATH_MAP[safePlatform] || '/';
  const countryDef =
    countryCode && countryCode !== 'ALL'
      ? COUNTRY_DEFINITIONS.find((c) => c.countryCode.toUpperCase() === countryCode.toUpperCase())
      : undefined;

  const tasks: Array<Promise<PhoneNumberEntry[]>> = [
    fetchAnonymsmsNumbers(platformPath, platformLabel, safePlatform !== 'all').catch(() => []),
  ];

  if (countryDef?.anonymsmsPath) {
    tasks.push(
      fetchAnonymsmsNumbers(countryDef.anonymsmsPath, platformLabel, false).catch(() => [])
    );
  }
  if (countryDef?.mytempsmsPath) {
    tasks.push(
      fetchMyTempSmsNumbers(countryDef.mytempsmsPath, countryDef, platformLabel).catch(() => [])
    );
  }
  if (!countryDef) {
    for (const code of ['US', 'GB', 'CA']) {
      const def = COUNTRY_DEFINITIONS.find((c) => c.countryCode === code);
      if (def?.mytempsmsPath) {
        tasks.push(fetchMyTempSmsNumbers(def.mytempsmsPath, def, platformLabel).catch(() => []));
      }
    }
  }

  const results = await Promise.all(tasks);
  const merged = new Map<string, PhoneNumberEntry>();

  for (const list of results) {
    for (const item of list) {
      if (countryDef && item.countryCode.toUpperCase() !== countryDef.countryCode.toUpperCase()) {
        if (!(countryDef.countryCode === 'CA' && item.countryCode === 'CA')) {
          continue;
        }
      }
      if (!merged.has(item.digits)) {
        merged.set(item.digits, item);
      }
    }
  }

  return Array.from(merged.values());
}

async function fetchSmsMessagesForEntry(
  digits: string,
  sourceUrl?: string
): Promise<SmsMessageEntry[]> {
  const isMyTemp = Boolean(sourceUrl && sourceUrl.includes('mytempsms.com'));
  const targetUrl =
    sourceUrl && (sourceUrl.startsWith('https://anonymsms.com/') || sourceUrl.startsWith('https://mytempsms.com/'))
      ? sourceUrl
      : `https://anonymsms.com/number/${digits}/`;

  const response = await fetch(targetUrl, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(7500),
  });

  if (!response.ok) {
    throw new Error(`Inbox unavailable (${response.status})`);
  }

  const html = await response.text();
  if (html.includes('<html id="__next_error__">')) {
    throw new Error('Number offline');
  }

  const messages: SmsMessageEntry[] = [];

  if (isMyTemp) {
    const articleRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
    let match: RegExpExecArray | null;
    let index = 0;
    while ((match = articleRegex.exec(html)) !== null && index < 60) {
      const block = match[1];
      const senderMatch = block.match(/class="sms-sender-name"[^>]*>([\s\S]*?)<\/span>/i);
      const bodyMatch = block.match(/class="sms-message"[^>]*>([\s\S]*?)<\/div>/i);
      const timeMatch = block.match(/class="sms-time"[^>]*>([\s\S]*?)<\/time>/i);

      const sender = senderMatch ? stripTags(senderMatch[1]) : 'Service';
      const text = bodyMatch ? stripTags(bodyMatch[1]) : '';
      const receivedAt = timeMatch ? stripTags(timeMatch[1]) : 'Just now';

      if (!text) continue;
      messages.push({
        id: `${digits}-${index}-${receivedAt}`,
        sender,
        receivedAt,
        text,
        otp: extractOtpCode(text),
      });
      index++;
    }
    return messages;
  }

  const cardMarker = '<div class="ring-gradient rounded-2xl bg-white/[0.03] p-5">';
  const rawCards = html.split(cardMarker).slice(1);
  let index = 0;

  for (const rawCard of rawCards) {
    if (index >= 60) break;
    // Isolate card content up to the closing </button></div> or </p></div> so OTPs never bleed across cards
    const endIdx = rawCard.indexOf('</p>');
    if (endIdx === -1) continue;
    const headerAndBody = rawCard.slice(0, endIdx);
    const tailEnd = rawCard.indexOf('</div>', endIdx);
    const tail = rawCard.slice(endIdx, tailEnd !== -1 ? tailEnd : endIdx + 600);

    const buttonOtpMatch = tail.match(/aria-label="Copy code"[^>]*>([\d-]+)<svg/);
    const buttonOtp = buttonOtpMatch ? buttonOtpMatch[1].trim() : null;

    const senderMatch = headerAndBody.match(/<(?:a|span)[^>]*>([^<]+)<\/(?:a|span)>/);
    const timeMatch = headerAndBody.match(/<time[^>]*dateTime="([^"]+)"[^>]*>([^<]*)<\/time>/);
    const bodyMatch = headerAndBody.match(/<p[^>]*>([\s\S]*)$/);

    const sender = senderMatch ? stripTags(senderMatch[1]) : 'Service';
    const receivedAt = timeMatch ? timeMatch[1] : new Date().toISOString();
    const text = bodyMatch ? stripTags(bodyMatch[1]) : '';

    if (!text) continue;
    const otp = buttonOtp || extractOtpCode(text);

    messages.push({
      id: `${digits}-${index}-${receivedAt}`,
      sender,
      receivedAt,
      text,
      otp,
    });
    index++;
  }

  return messages;
}

// ==========================================
// Custom Domain Email Configuration (process.env.EMAIL_DOMAIN)
// ==========================================
function getCustomEmailDomain(): string {
  const raw = (process.env.EMAIL_DOMAIN || 'veribox.name.ng')
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '');
  return raw || 'veribox.name.ng';
}

function getResendApiKey(): string {
  const raw = (process.env.RESEND_API_KEY || '')
    .trim()
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/^RESEND_API_KEY\s*=\s*/i, '')
    .trim()
    .replace(/^["'`]|["'`]$/g, '')
    .trim();
  if (!raw || raw.startsWith('MY_')) return '';
  return raw;
}

function getResendWebhookSecret(): string {
  const raw = (process.env.RESEND_WEBHOOK_SECRET || '')
    .trim()
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/^RESEND_WEBHOOK_SECRET\s*=\s*/i, '')
    .trim()
    .replace(/^["'`]|["'`]$/g, '')
    .trim();
  if (!raw || raw.startsWith('MY_')) return '';
  return raw;
}

const CUSTOM_EMAIL_DOMAIN = getCustomEmailDomain();

const RESERVED_EMAIL_USERNAMES = new Set(['postmaster', 'abuse', 'hostmaster', 'mailer-daemon']);

function decodeQuotedPrintable(input: string): string {
  const softUnwrapped = input.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < softUnwrapped.length; i++) {
    const ch = softUnwrapped[i];
    if (
      ch === '=' &&
      i + 2 < softUnwrapped.length &&
      /^[0-9A-Fa-f]{2}$/.test(softUnwrapped.slice(i + 1, i + 3))
    ) {
      bytes.push(parseInt(softUnwrapped.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      const code = softUnwrapped.charCodeAt(i);
      if (code <= 0xff) {
        bytes.push(code);
      } else {
        const utf8 = Buffer.from(ch, 'utf8');
        for (const b of utf8) bytes.push(b);
      }
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

function decodeMimeWord(input: string): string {
  return input.replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_m, _charset, encoding, data) => {
    try {
      if (encoding.toUpperCase() === 'B') {
        return Buffer.from(data, 'base64').toString('utf8');
      }
      return decodeQuotedPrintable(data.replace(/_/g, ' '));
    } catch {
      return data;
    }
  });
}

function normalizeCustomEmailUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .split('@')[0]
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 30);
}

function isValidCustomEmailUsername(username: string): boolean {
  if (!username || username.length < 3 || username.length > 30) return false;
  if (username.includes('..')) return false;
  if (!/^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/.test(username)) return false;
  if (RESERVED_EMAIL_USERNAMES.has(username)) return false;
  return true;
}

function extractAddressFromHeader(raw: string): { name: string; address: string } {
  const cleaned = (raw || '').trim();
  const angleMatch = /^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>/.exec(cleaned);
  if (angleMatch) {
    const name = angleMatch[1].replace(/^["']|["']$/g, '').trim();
    const address = angleMatch[2].trim().toLowerCase();
    return { name: name || address, address };
  }
  const emailMatch = /([a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/.exec(cleaned);
  const address = emailMatch ? emailMatch[1].toLowerCase() : cleaned.toLowerCase();
  return { name: address || 'Unknown sender', address };
}

function extractTargetRecipients(rawTo: unknown): string[] {
  const values: string[] = [];
  const pushItem = (item: unknown) => {
    if (!item) return;
    if (typeof item === 'string') {
      values.push(...item.split(','));
    } else if (Array.isArray(item)) {
      for (const entry of item) pushItem(entry);
    } else if (typeof item === 'object') {
      const obj = item as { email?: unknown; address?: unknown; to?: unknown };
      if (typeof obj.email === 'string') values.push(obj.email);
      if (typeof obj.address === 'string') values.push(obj.address);
      if (obj.to) pushItem(obj.to);
    }
  };
  pushItem(rawTo);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const val of values) {
    const { address } = extractAddressFromHeader(val);
    if (address && address.includes('@') && !seen.has(address)) {
      seen.add(address);
      out.push(address);
    }
  }
  return out;
}

function normalizeRecipientString(recipientAddress: unknown): string {
  if (typeof recipientAddress === 'string') {
    return recipientAddress.trim().toLowerCase();
  }
  if (Array.isArray(recipientAddress)) {
    return normalizeRecipientString(recipientAddress[0]);
  }
  if (recipientAddress && typeof recipientAddress === 'object') {
    const obj = recipientAddress as {
      address?: unknown;
      email?: unknown;
      recipient?: unknown;
      recipientAddress?: unknown;
    };
    const inner = obj.address ?? obj.email ?? obj.recipient ?? obj.recipientAddress;
    return typeof inner === 'string'
      ? inner.trim().toLowerCase()
      : normalizeRecipientString(inner ?? '');
  }
  if (recipientAddress === null || recipientAddress === undefined) {
    return '';
  }
  return String(recipientAddress).trim().toLowerCase();
}

// ==========================================
// Privacy-Safe Private Number Integration
// ==========================================
interface FiveSimGuestCountryRaw {
  iso?: Record<string, number>;
  prefix?: Record<string, number>;
  text_en?: string;
}

interface FiveSimOperatorOption {
  operator: string;
  cost: number;
  count: number;
  rate: number;
}

interface FiveSimCountryOption {
  slug: string;
  country: string;
  countryCode: string;
  dialCode: string;
  stockCount: number;
  minPrice: number;
  inStockMinPrice: number;
  currency: string;
  bestOperator: string;
  maxRate: number;
  operators: FiveSimOperatorOption[];
  lowestOperators?: string[];
}

const fiveSimCountriesCache: { data: Record<string, FiveSimGuestCountryRaw> | null; expiresAt: number } = {
  data: null,
  expiresAt: 0,
};
const fiveSimPricesCache = new Map<string, CachedEntry<FiveSimCountryOption[]>>();
const fiveSimCurrencyCache: { currency: string; expiresAt: number } = {
  currency: 'USD',
  expiresAt: 0,
};

const PRIORITY_5SIM_SLUGS = [
  'nigeria',
  'england',
  'usa',
  'canada',
  'netherlands',
  'germany',
  'indonesia',
  'philippines',
  'india',
  'brazil',
  'france',
  'spain',
  'poland',
  'malaysia',
  'southafrica',
  'kenya',
  'ghana',
  'italy',
  'sweden',
];

function getFiveSimApiKey(): string {
  const raw = (
    process.env.FIVESIM_API_KEY ||
    process.env.FIVESIM_KEY ||
    process.env.FIVE_SIM_API_KEY ||
    ''
  ).trim();
  const cleaned = raw
    .replace(/^["']|["']$/g, '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  if (!cleaned || cleaned === 'MY_FIVESIM_API_KEY' || cleaned.startsWith('MY_')) {
    console.warn('[VeriBox Warning] FIVESIM_API_KEY is not configured with a live token.');
    return '';
  }
  return cleaned;
}

function getGrizzlyApiKey(): string {
  const raw = (
    process.env.GRIZZLYSMS_API_KEY ||
    process.env.GRIZZLY_API_KEY ||
    process.env.GRIZZLYSMS_KEY ||
    ''
  ).trim();
  const cleaned = raw
    .replace(/^["']|["']$/g, '')
    .replace(/^api_key=/i, '')
    .trim();
  if (!cleaned || cleaned === 'MY_GRIZZLYSMS_API_KEY' || cleaned.startsWith('MY_')) {
    return '';
  }
  return cleaned;
}

function getPaystackSecretKey(): string {
  const raw = (
    process.env.PAYSTACK_SECRET_KEY ||
    process.env.PAYSTACK_SECRET ||
    process.env.PAYSTACK_KEY ||
    ''
  ).trim();
  const cleaned = raw.replace(/^["']|["']$/g, '').trim();
  if (!cleaned || cleaned === 'MY_PAYSTACK_SECRET_KEY' || cleaned.startsWith('MY_')) {
    console.warn('[VeriBox Warning] PAYSTACK_SECRET_KEY is not defined in environment variables.');
    return '';
  }
  return cleaned;
}

function normalizeSupabaseUrl(raw?: string): string {
  const cleaned = (raw || '').trim().replace(/^["']|["']$/g, '').trim();
  if (!cleaned) return '';
  try {
    const parsed = new URL(cleaned);
    return parsed.origin;
  } catch {
    return cleaned.replace(/\/+(rest|auth|storage|functions)\/v\d+\/*$/i, '').replace(/\/+$/, '');
  }
}

function getSupabaseServerConfig(): { url: string; key: string } {
  const url = normalizeSupabaseUrl(
    process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL
  );
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  )
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();
  return { url, key };
}

function getSupabasePublicConfig(): { url: string; anonKey: string } {
  const clean = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '').trim();
  const url = normalizeSupabaseUrl(
    process.env.VITE_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL
  );
  const anonKey = clean(
    process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  return {
    url,
    anonKey: anonKey.length > 10 && !anonKey.startsWith('MY_') ? anonKey : '',
  };
}

let cachedSupabaseClient: SupabaseClient | null = null;
let cachedSupabaseSignature = '';

function getSupabaseServerClient(): SupabaseClient | null {
  const { url, key } = getSupabaseServerConfig();
  if (!url || key.length < 10) return null;
  const sig = `${url}|${key.slice(0, 12)}`;
  if (!cachedSupabaseClient || cachedSupabaseSignature !== sig) {
    cachedSupabaseClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    cachedSupabaseSignature = sig;
  }
  return cachedSupabaseClient;
}

function normalizeServiceSlug(platform: string): string {
  const p = platform.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '');
  return p || 'whatsapp';
}

function roundUnitPrice(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (amount >= 1) return Math.round(amount * 100) / 100;
  if (amount >= 0.01) return Math.round(amount * 1000) / 1000;
  return Math.round(amount * 10000) / 10000;
}

interface ExchangeRates {
  NGN: number;
  RUB: number;
  EUR: number;
  GBP: number;
  expiresAt: number;
}

let cachedExchangeRates: ExchangeRates = {
  NGN: 1450,
  RUB: 85,
  EUR: 0.92,
  GBP: 0.78,
  expiresAt: 0,
};

async function getExchangeRates(): Promise<ExchangeRates> {
  const envOverride = Number(process.env.USD_TO_NGN_RATE);
  const hasValidOverride = Number.isFinite(envOverride) && envOverride >= 500 && envOverride <= 5000;
  if (cachedExchangeRates.expiresAt > Date.now()) {
    return {
      ...cachedExchangeRates,
      NGN: hasValidOverride ? Math.round(envOverride) : cachedExchangeRates.NGN,
    };
  }
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const data = (await res.json()) as { rates?: Record<string, number> };
      const ngn = Number(data.rates?.NGN);
      const rub = Number(data.rates?.RUB);
      const eur = Number(data.rates?.EUR);
      const gbp = Number(data.rates?.GBP);
      if (Number.isFinite(ngn) && ngn >= 500) {
        cachedExchangeRates = {
          NGN: Math.round(ngn),
          RUB: Number.isFinite(rub) && rub > 10 ? rub : cachedExchangeRates.RUB,
          EUR: Number.isFinite(eur) && eur > 0.2 ? eur : cachedExchangeRates.EUR,
          GBP: Number.isFinite(gbp) && gbp > 0.2 ? gbp : cachedExchangeRates.GBP,
          expiresAt: Date.now() + 6 * 60 * 60 * 1000,
        };
      }
    }
  } catch {
    // Fallback to cached rates
  }
  return {
    ...cachedExchangeRates,
    NGN: hasValidOverride ? Math.round(envOverride) : cachedExchangeRates.NGN,
  };
}

async function getUsdToNgnRate(): Promise<number> {
  const rates = await getExchangeRates();
  return rates.NGN;
}

function convertCurrencyAmountToUsd(
  amount: number,
  currency: string,
  rates: ExchangeRates
): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const code = (currency || 'USD').toUpperCase().trim();
  if (code === 'RUB' || code === 'RUR') {
    return roundUnitPrice(amount / rates.RUB);
  }
  if (code === 'EUR') {
    return roundUnitPrice(amount / rates.EUR);
  }
  if (code === 'GBP') {
    return roundUnitPrice(amount / rates.GBP);
  }
  if (code === 'NGN') {
    return roundUnitPrice(amount / rates.NGN);
  }
  return roundUnitPrice(amount);
}

function roundToNaira(costUsd: number, rate: number): number {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return 0;
  const raw = costUsd * rate;
  return Math.max(1, Math.round(raw));
}

async function detectFiveSimRatioCurrency(apiKey: string): Promise<'RUB' | 'USD'> {
  if (!apiKey) return 'USD';
  for (const product of ['whatsapp', 'tiktok']) {
    try {
      const [authRes, pubRes] = await Promise.all([
        fetch(`https://5sim.net/v1/guest/prices?product=${product}`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
            'User-Agent': USER_AGENT,
          },
          signal: AbortSignal.timeout(5000),
        }),
        fetch(`https://5sim.net/v1/guest/prices?product=${product}`, {
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(5000),
        }),
      ]);
      if (!authRes.ok || !pubRes.ok) continue;
      const authJson = (await authRes.json()) as Record<
        string,
        Record<string, Record<string, { cost?: number; count?: number }>>
      >;
      const pubJson = (await pubRes.json()) as Record<
        string,
        Record<string, Record<string, { cost?: number; count?: number }>>
      >;
      const authMap = authJson[product] || {};
      const pubMap = pubJson[product] || {};
      const ratios: number[] = [];
      for (const [slug, opMap] of Object.entries(authMap)) {
        for (const [opName, st] of Object.entries(opMap || {})) {
          const authCost = Number(st?.cost || 0);
          const pubCost = Number(pubMap[slug]?.[opName]?.cost || 0);
          if (authCost > 0 && pubCost > 0) {
            ratios.push(authCost / pubCost);
            if (ratios.length >= 12) break;
          }
        }
        if (ratios.length >= 12) break;
      }
      if (ratios.length > 0) {
        ratios.sort((a, b) => a - b);
        const median = ratios[Math.floor(ratios.length / 2)];
        if (median > 8) return 'RUB';
        return 'USD';
      }
    } catch {
      // Try next product or fall back
    }
  }
  return 'USD';
}

async function getFiveSimAccountCurrency(apiKey: string): Promise<string> {
  if (!apiKey) return 'USD';
  if (fiveSimCurrencyCache.expiresAt > Date.now()) {
    return fiveSimCurrencyCache.currency;
  }
  try {
    const profile = await callFiveSimUserApi('profile', apiKey);
    const rawCurrency = String(profile.currency || '').toUpperCase().trim();
    const resolved = rawCurrency || (await detectFiveSimRatioCurrency(apiKey));
    fiveSimCurrencyCache.currency = resolved;
    fiveSimCurrencyCache.expiresAt = Date.now() + 10 * 60 * 1000;
    return resolved;
  } catch {
    return fiveSimCurrencyCache.currency || 'USD';
  }
}

async function getUnauthUsdSamplePrice(
  sampleSlug: string,
  sampleOperator: string,
  product: string
): Promise<number> {
  if (!sampleSlug) return 0;
  try {
    const op = sampleOperator || 'any';
    const res = await fetch(
      `https://5sim.net/v1/guest/products/${encodeURIComponent(sampleSlug)}/${encodeURIComponent(op)}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
        },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return 0;
    const prods = (await res.json()) as Record<string, { Price?: number }>;
    const item = prods[product];
    return Number(item?.Price || 0);
  } catch {
    return 0;
  }
}

async function getFiveSimGuestCountries(): Promise<Record<string, FiveSimGuestCountryRaw>> {
  if (fiveSimCountriesCache.data && Date.now() < fiveSimCountriesCache.expiresAt) {
    return fiveSimCountriesCache.data;
  }
  const res = await fetch('https://5sim.net/v1/guest/countries', {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error(`Country directory unavailable (${res.status})`);
  const json = (await res.json()) as Record<string, FiveSimGuestCountryRaw>;
  fiveSimCountriesCache.data = json;
  fiveSimCountriesCache.expiresAt = Date.now() + 5 * 60 * 1000;
  return json;
}

async function getFiveSimCountriesForPlatform(
  platform: string,
  bypassCache = false
): Promise<FiveSimCountryOption[]> {
  const product = normalizeServiceSlug(platform);
  const apiKey = getFiveSimApiKey();
  const cached = fiveSimPricesCache.get(product);
  if (!bypassCache && cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const priceHeaders: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': USER_AGENT,
  };
  if (apiKey) {
    priceHeaders.Authorization = `Bearer ${apiKey}`;
  }

  const needCurrencyProbe = Boolean(apiKey) && fiveSimCurrencyCache.currency !== 'RUB';
  let usedAuthFeed = Boolean(apiKey);

  const fetchAuthPrices = async () => {
    const first = await fetch(
      `https://5sim.net/v1/guest/prices?product=${encodeURIComponent(product)}`,
      { headers: priceHeaders, signal: AbortSignal.timeout(8000) }
    );
    if ((first.status === 401 || first.status === 403) && priceHeaders.Authorization) {
      usedAuthFeed = false;
      return fetch(`https://5sim.net/v1/guest/prices?product=${encodeURIComponent(product)}`, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(8000),
      });
    }
    if (first.status === 429) {
      await new Promise((r) => setTimeout(r, 700));
      return fetch(`https://5sim.net/v1/guest/prices?product=${encodeURIComponent(product)}`, {
        headers: priceHeaders,
        signal: AbortSignal.timeout(8000),
      });
    }
    return first;
  };

  const [countryCatalog, pricesRes, publicPricesRes, accountCurrency, rates] = await Promise.all([
    getFiveSimGuestCountries(),
    fetchAuthPrices(),
    needCurrencyProbe
      ? fetch(`https://5sim.net/v1/guest/prices?product=${encodeURIComponent(product)}`, {
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(8000),
        }).catch(() => null)
      : Promise.resolve(null),
    getFiveSimAccountCurrency(apiKey),
    getExchangeRates(),
  ]);

  if (!pricesRes.ok) {
    if (cached && cached.data.length > 0) {
      return cached.data;
    }
    throw new Error(`Pricing feed unavailable (${pricesRes.status})`);
  }
  const pricesJson = (await pricesRes.json()) as Record<
    string,
    Record<string, Record<string, { cost?: number; count?: number; rate?: number }>>
  >;
  const productMap = pricesJson[product] || {};

  let publicProductMap: Record<
    string,
    Record<string, { cost?: number; count?: number; rate?: number }>
  > = {};
  if (publicPricesRes && publicPricesRes.ok) {
    try {
      const pubJson = (await publicPricesRes.json()) as Record<
        string,
        Record<string, Record<string, { cost?: number; count?: number; rate?: number }>>
      >;
      publicProductMap = pubJson[product] || {};
    } catch {
      publicProductMap = {};
    }
  }

  const rawOptions: Array<FiveSimCountryOption & { rawLowestCost: number }> = [];
  for (const [slug, opMap] of Object.entries(productMap)) {
    const meta = countryCatalog[slug];
    if (!meta || !opMap) continue;

    const isoKey = meta.iso ? Object.keys(meta.iso)[0] : '';
    const prefixKey = meta.prefix ? Object.keys(meta.prefix)[0] : '';
    const operators: FiveSimOperatorOption[] = [];
    const allPricedOperators: FiveSimOperatorOption[] = [];

    let totalStock = 0;
    let maxRate = 0;

    for (const [opName, stats] of Object.entries(opMap)) {
      const count = Number(stats?.count || 0);
      const cost = Number(stats?.cost || 0);
      const rate = Number(stats?.rate || 0);
      if (cost <= 0) continue;

      allPricedOperators.push({ operator: opName, cost, count, rate });
      if (count <= 0) continue;

      totalStock += count;
      if (rate > maxRate) maxRate = rate;
      operators.push({ operator: opName, cost, count, rate });
    }

    if (totalStock <= 0 || operators.length === 0) continue;

    // Grab the lowest real-time IN-STOCK amount across the country's operators
    allPricedOperators.sort((a, b) => a.cost - b.cost || b.count - a.count || b.rate - a.rate);
    operators.sort((a, b) => a.cost - b.cost || b.count - a.count || b.rate - a.rate);

    const lowestInStockOp = operators[0] || allPricedOperators[0];

    rawOptions.push({
      slug,
      country: meta.text_en || slug,
      countryCode: isoKey ? isoKey.toUpperCase() : '',
      dialCode: prefixKey || '',
      stockCount: totalStock,
      minPrice: lowestInStockOp.cost,
      inStockMinPrice: lowestInStockOp.cost,
      rawLowestCost: lowestInStockOp.cost,
      currency: usedAuthFeed ? accountCurrency : 'USD',
      bestOperator: lowestInStockOp.operator,
      maxRate,
      operators: operators.slice(0, 12),
      lowestOperators: operators.slice(0, 8).map((o) => o.operator),
    });
  }

  // Accurately detect if authenticated 5sim prices are in RUB (even if profile.currency is missing or unauth probe matched)
  let effectiveCurrency = usedAuthFeed ? accountCurrency : 'USD';
  if (usedAuthFeed && rawOptions.length > 0 && (effectiveCurrency === 'USD' || !effectiveCurrency)) {
    const ratios: number[] = [];
    for (const opt of rawOptions) {
      const pubCost = Number(publicProductMap[opt.slug]?.[opt.bestOperator]?.cost || 0);
      if (pubCost > 0 && opt.rawLowestCost > 0) {
        ratios.push(opt.rawLowestCost / pubCost);
        if (ratios.length >= 12) break;
      }
    }
    if (ratios.length > 0) {
      ratios.sort((a, b) => a - b);
      const medianRatio = ratios[Math.floor(ratios.length / 2)];
      if (medianRatio > 8) {
        effectiveCurrency = 'RUB';
        fiveSimCurrencyCache.currency = 'RUB';
        fiveSimCurrencyCache.expiresAt = Date.now() + 5 * 60 * 1000;
      }
    }

    if (effectiveCurrency === 'USD') {
      const sample =
        rawOptions.find((o) => o.slug === 'indonesia') ||
        rawOptions.find((o) => o.slug === 'nigeria') ||
        rawOptions.find((o) => o.slug === 'england') ||
        rawOptions[0];
      const publicUsd = await getUnauthUsdSamplePrice(sample.slug, sample.bestOperator, product);
      if (publicUsd > 0 && sample.rawLowestCost / publicUsd > 8) {
        effectiveCurrency = 'RUB';
        fiveSimCurrencyCache.currency = 'RUB';
        fiveSimCurrencyCache.expiresAt = Date.now() + 5 * 60 * 1000;
      } else {
        const sortedCosts = rawOptions.map((o) => o.rawLowestCost).sort((a, b) => a - b);
        const medianRaw = sortedCosts[Math.floor(sortedCosts.length / 2)] || 0;
        if (medianRaw > 10) {
          effectiveCurrency = 'RUB';
          fiveSimCurrencyCache.currency = 'RUB';
          fiveSimCurrencyCache.expiresAt = Date.now() + 5 * 60 * 1000;
        }
      }
    }
  }

  const options: FiveSimCountryOption[] = rawOptions.map(({ rawLowestCost, ...rest }) => {
    const usdMin = convertCurrencyAmountToUsd(rawLowestCost, effectiveCurrency, rates);
    const usdInStockMin = convertCurrencyAmountToUsd(rest.inStockMinPrice, effectiveCurrency, rates);
    return {
      ...rest,
      minPrice: usdInStockMin > 0 ? usdInStockMin : usdMin,
      inStockMinPrice: usdInStockMin > 0 ? usdInStockMin : usdMin,
      currency: 'USD',
      operators: rest.operators.map((op) => ({
        ...op,
        cost: convertCurrencyAmountToUsd(op.cost, effectiveCurrency, rates),
      })),
    };
  });

  // Sort ALL countries strictly alphabetically from A to Z
  options.sort((a, b) => a.country.localeCompare(b.country));

  fiveSimPricesCache.set(product, { data: options, expiresAt: Date.now() + 8_000 });
  return options;
}

async function callFiveSimUserApi(endpoint: string, apiKey: string): Promise<Record<string, unknown>> {
  const res = await fetch(`https://5sim.net/v1/user/${endpoint}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(9000),
  });
  const text = await res.text();
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const errMsg =
      (parsed && typeof parsed.error === 'string' && parsed.error) ||
      text.trim() ||
      `Number service error (${res.status})`;
    const err = new Error(errMsg) as Error & { statusCode?: number };
    err.statusCode = res.status;
    throw err;
  }

  if (!parsed) {
    throw new Error(text.trim() || 'Unexpected response from number service');
  }
  return parsed;
}

function normalizeFiveSimOrder(raw: Record<string, unknown>, countryCodeHint?: string) {
  const phoneRaw = String(raw.phone || '');
  const digits = phoneRaw.replace(/\D/g, '');
  const phone = phoneRaw.startsWith('+') ? phoneRaw : digits ? `+${digits}` : phoneRaw;
  const rawSms = Array.isArray(raw.sms) ? (raw.sms as Array<Record<string, unknown>>) : [];

  const sms: SmsMessageEntry[] = rawSms.map((m, idx) => {
    const text = String(m.text || '');
    const code = m.code ? String(m.code) : extractOtpCode(text);
    return {
      id: `${raw.id || 'ord'}-${idx}-${m.created_at || m.date || ''}`,
      sender: String(m.sender || raw.product || 'Verification'),
      receivedAt: String(m.created_at || m.date || new Date().toISOString()),
      text,
      otp: code,
    };
  });

  return {
    id: Number(raw.id || 0),
    phone,
    digits,
    country: String(raw.country || ''),
    countryCode: countryCodeHint,
    operator: String(raw.operator || 'any'),
    product: String(raw.product || ''),
    price: Number(raw.price || 0),
    status: String(raw.status || 'PENDING'),
    expires: String(raw.expires || raw.expires_at || ''),
    createdAt: String(raw.created_at || new Date().toISOString()),
    sms,
  };
}

interface CleanServiceOption {
  id: string;
  name: string;
  popular?: boolean;
}

const POPULAR_SERVICE_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  telegram: 'Telegram',
  google: 'Google / Gmail',
  openai: 'OpenAI / ChatGPT',
  snapchat: 'Snapchat',
  discord: 'Discord',
  twitter: 'X / Twitter',
  paypal: 'PayPal',
  amazon: 'Amazon',
  netflix: 'Netflix',
  uber: 'Uber',
  microsoft: 'Microsoft',
  apple: 'Apple',
  yahoo: 'Yahoo',
  viber: 'Viber',
  line: 'LINE',
  tinder: 'Tinder',
  spotify: 'Spotify',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  signal: 'Signal',
  wechat: 'WeChat',
  other: 'Other App',
};

const POPULAR_SERVICE_ORDER = Object.keys(POPULAR_SERVICE_LABELS);
const servicesListCache: { data: CleanServiceOption[] | null; expiresAt: number } = {
  data: null,
  expiresAt: 0,
};

function formatServiceDisplayName(slug: string): string {
  if (POPULAR_SERVICE_LABELS[slug]) return POPULAR_SERVICE_LABELS[slug];
  return slug
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

async function getAvailableNumberServices(): Promise<CleanServiceOption[]> {
  if (servicesListCache.data && Date.now() < servicesListCache.expiresAt) {
    return servicesListCache.data;
  }

  const res = await fetch('https://5sim.net/v1/guest/products/any/any', {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error('Could not load app catalog');
  const json = (await res.json()) as Record<string, unknown>;
  const keys = Object.keys(json).filter(Boolean);

  const popularSet = new Set(POPULAR_SERVICE_ORDER);
  const popularList: CleanServiceOption[] = [];
  const otherList: CleanServiceOption[] = [];

  for (const slug of POPULAR_SERVICE_ORDER) {
    if (keys.includes(slug)) {
      popularList.push({ id: slug, name: formatServiceDisplayName(slug), popular: true });
    }
  }

  for (const slug of keys) {
    if (!popularSet.has(slug)) {
      otherList.push({ id: slug, name: formatServiceDisplayName(slug) });
    }
  }

  otherList.sort((a, b) => a.name.localeCompare(b.name));
  const combined = [...popularList, ...otherList];
  servicesListCache.data = combined;
  servicesListCache.expiresAt = Date.now() + 5 * 60 * 1000;
  return combined;
}

function sanitizeNumberApiError(rawMsg: string): string {
  const lower = rawMsg.toLowerCase();
  if (lower.includes('not enough') || lower.includes('balance') || lower.includes('no_balance')) {
    return 'Number service quota reached on your backend account. Please check your account funding.';
  }
  if (lower.includes('no free phones') || lower.includes('out of stock') || lower.includes('no_numbers')) {
    return 'No numbers are currently available for this country and app. Try another provider or country.';
  }
  if (lower.includes('unauthorized') || lower.includes('token') || lower.includes('401') || lower.includes('bad_key') || lower.includes('no_key')) {
    return 'Backend number key could not authenticate. Verify your API key environment variable.';
  }
  if (lower.includes('bad country') || lower.includes('bad product') || lower.includes('bad_service') || lower.includes('bad_action')) {
    return 'This country or app selection is unavailable right now.';
  }
  return rawMsg.replace(/5sim(\.net)?|grizzly(sms)?(\.com)?/gi, 'number service');
}

function toPublicNumberOrder(
  raw: Record<string, unknown>,
  serviceNameHint?: string,
  countryCodeHint?: string,
  currencyHint = 'USD',
  rates?: ExchangeRates,
  expectedUsdHint?: number
) {
  const norm = normalizeFiveSimOrder(raw, countryCodeHint);
  const service = norm.product || 'other';
  const effectiveRates = rates || cachedExchangeRates;
  let effectiveCurrency = currencyHint;
  if (effectiveCurrency === 'USD' && fiveSimCurrencyCache.currency === 'RUB') {
    effectiveCurrency = 'RUB';
  } else if (
    effectiveCurrency === 'USD' &&
    norm.price > 8 &&
    typeof expectedUsdHint === 'number' &&
    expectedUsdHint > 0 &&
    expectedUsdHint < 5 &&
    norm.price / expectedUsdHint > 8
  ) {
    effectiveCurrency = 'RUB';
    fiveSimCurrencyCache.currency = 'RUB';
    fiveSimCurrencyCache.expiresAt = Date.now() + 5 * 60 * 1000;
  }
  const rawUsd =
    norm.price > 0
      ? convertCurrencyAmountToUsd(norm.price, effectiveCurrency, effectiveRates)
      : 0;
  const nairaPrice = rawUsd > 0 ? roundToNaira(rawUsd, effectiveRates.NGN) : 0;
  return {
    id: norm.id,
    provider: 'fivesim' as const,
    phone: norm.phone,
    digits: norm.digits,
    country: norm.country,
    countryCode: norm.countryCode,
    service,
    serviceName: serviceNameHint || formatServiceDisplayName(service),
    price: nairaPrice > 0 ? nairaPrice : undefined,
    rawPriceUsd: rawUsd > 0 ? rawUsd : undefined,
    currency: 'NGN',
    status: norm.status,
    expires: norm.expires,
    createdAt: norm.createdAt,
    sms: norm.sms,
  };
}

// ==========================================
// Grizzly SMS (api.grizzlysms.com) Integration — Strictly Isolated
// ==========================================
const GRIZZLY_API_URL = 'https://api.grizzlysms.com/stubs/handler_api.php';

const FIVESIM_TO_GRIZZLY_SERVICE: Record<string, string> = {
  whatsapp: 'wa',
  tiktok: 'lf',
  instagram: 'ig',
  facebook: 'fb',
  telegram: 'tg',
  google: 'go',
  youtube: 'go',
  openai: 'dr',
  snapchat: 'fu',
  discord: 'ds',
  twitter: 'tw',
  paypal: 'ts',
  amazon: 'am',
  netflix: 'nf',
  uber: 'ub',
  microsoft: 'mm',
  apple: 'wx',
  yahoo: 'mb',
  viber: 'vi',
  line: 'me',
  tinder: 'oi',
  spotify: 'alj',
  linkedin: 'tn',
  signal: 'bw',
  wechat: 'wb',
  other: 'ot',
};

interface GrizzlyCountryMeta {
  id: string;
  name: string;
  slug: string;
}

interface GrizzlyCountryPriceOption {
  countryId: string;
  country: string;
  countryCode: string;
  dialCode: string;
  canonicalKey: string;
  stockCount: number;
  minPriceUsd: number;
}

const grizzlyCountriesCache: { data: Map<string, GrizzlyCountryMeta> | null; expiresAt: number } = {
  data: null,
  expiresAt: 0,
};
const grizzlyServicesCache: { data: Map<string, string> | null; expiresAt: number } = {
  data: null,
  expiresAt: 0,
};
const grizzlyPricesCache = new Map<string, CachedEntry<GrizzlyCountryPriceOption[]>>();

function normalizeCountryMatchKey(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/\(virtual\)/g, 'virtual')
    .replace(/[^a-z0-9]/g, '');
  const aliases: Record<string, string> = {
    england: 'unitedkingdom',
    uk: 'unitedkingdom',
    greatbritain: 'unitedkingdom',
    englandunitedkingdom: 'unitedkingdom',
    unitedstates: 'usa',
    us: 'usa',
    unitedstatesvirt: 'usavirtual',
    russianfederation: 'russia',
    cotedivoire: 'ivorycoast',
    czech: 'czechrepublic',
    czechia: 'czechrepublic',
    czechrepublic: 'czechrepublic',
    turkiye: 'turkey',
    vietnam: 'vietnam',
    southkorea: 'korea',
    republicofkorea: 'korea',
    unitedarabemirates: 'uae',
    democraticrepublicofthecongo: 'drcongo',
    congodrc: 'drcongo',
    congo: 'drcongo',
  };
  return aliases[cleaned] || cleaned;
}

async function getGrizzlyServiceCode(serviceSlug: string): Promise<string | null> {
  const normalized = normalizeServiceSlug(serviceSlug);
  if (FIVESIM_TO_GRIZZLY_SERVICE[normalized]) {
    return FIVESIM_TO_GRIZZLY_SERVICE[normalized];
  }
  const apiKey = getGrizzlyApiKey();
  if (apiKey) {
    if (!grizzlyServicesCache.data || Date.now() >= grizzlyServicesCache.expiresAt) {
      try {
        const res = await fetch(
          `${GRIZZLY_API_URL}?action=getServicesList&api_key=${encodeURIComponent(apiKey)}`,
          { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(6000) }
        );
        if (res.ok) {
          const json = (await res.json()) as {
            services?: Array<{ code?: string; name?: string }>;
          };
          const map = new Map<string, string>();
          for (const item of json.services || []) {
            if (item.code && item.name) {
              map.set(item.name.toLowerCase().replace(/[^a-z0-9]/g, ''), item.code);
            }
          }
          if (map.size > 0) {
            grizzlyServicesCache.data = map;
            grizzlyServicesCache.expiresAt = Date.now() + 15 * 60 * 1000;
          }
        }
      } catch {
        // Non-blocking fallback
      }
    }
    const lookupKey = normalized.replace(/[^a-z0-9]/g, '');
    if (grizzlyServicesCache.data?.has(lookupKey)) {
      return grizzlyServicesCache.data.get(lookupKey) || null;
    }
  }
  return null;
}

async function getGrizzlyCountryDirectory(): Promise<Map<string, GrizzlyCountryMeta>> {
  if (grizzlyCountriesCache.data && Date.now() < grizzlyCountriesCache.expiresAt) {
    return grizzlyCountriesCache.data;
  }

  const result = new Map<string, GrizzlyCountryMeta>();
  const apiKey = getGrizzlyApiKey();

  if (apiKey) {
    try {
      const res = await fetch(
        `${GRIZZLY_API_URL}?action=getCountries&api_key=${encodeURIComponent(apiKey)}`,
        { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(7000) }
      );
      if (res.ok) {
        const txt = await res.text();
        if (txt.startsWith('{')) {
          const json = JSON.parse(txt) as Record<string, { id?: number; eng?: string }>;
          for (const [key, val] of Object.entries(json)) {
            const id = String(val?.id ?? key);
            const name = String(val?.eng || '').trim();
            if (id && name) {
              result.set(id, { id, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') });
            }
          }
        }
      }
    } catch {
      // Fall back to public directory
    }
  }

  if (result.size === 0) {
    try {
      const html = await fetch('https://grizzlysms.com/en', {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(8000),
      }).then((r) => r.text());
      const m = html.match(/window\.__NUXT__=([\s\S]*?)<\/script>/);
      if (m?.[1]) {
        const nuxt = vm.runInNewContext(m[1], {}, { timeout: 600 }) as {
          state?: {
            'languages-list'?: {
              languages?: Array<{
                country_external_id?: number;
                name?: string;
                country_slug?: string;
              }>;
            };
          };
        };
        const list = nuxt?.state?.['languages-list']?.languages || [];
        for (const item of list) {
          if (item.country_external_id !== undefined && item.name) {
            const id = String(item.country_external_id);
            result.set(id, {
              id,
              name: item.name,
              slug: item.country_slug || item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            });
          }
        }
      }
    } catch {
      // Fallback below if SSR changes
    }
  }

  if (result.size > 0) {
    grizzlyCountriesCache.data = result;
    grizzlyCountriesCache.expiresAt = Date.now() + 6 * 60 * 60 * 1000;
  }
  return result;
}

async function getGrizzlyCountriesForPlatform(
  platform: string,
  bypassCache = false
): Promise<GrizzlyCountryPriceOption[]> {
  const grizzlyService = await getGrizzlyServiceCode(platform);
  if (!grizzlyService) return [];

  const cached = grizzlyPricesCache.get(grizzlyService);
  if (!bypassCache && cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const apiKey = getGrizzlyApiKey();
  const pricesUrl = apiKey
    ? `${GRIZZLY_API_URL}?action=getPrices&api_key=${encodeURIComponent(apiKey)}&service=${encodeURIComponent(grizzlyService)}`
    : `${GRIZZLY_API_URL}?action=getPrices&service=${encodeURIComponent(grizzlyService)}`;

  const [countryDir, fiveSimDir, pricesRes] = await Promise.all([
    getGrizzlyCountryDirectory(),
    getFiveSimGuestCountries().catch(() => ({} as Record<string, FiveSimGuestCountryRaw>)),
    fetch(pricesUrl, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8000) }),
  ]);

  if (!pricesRes.ok) {
    if (cached && cached.data.length > 0) return cached.data;
    return [];
  }

  const rawText = await pricesRes.text();
  if (!rawText.trim().startsWith('{')) {
    if (cached && cached.data.length > 0) return cached.data;
    return [];
  }

  const pricesJson = JSON.parse(rawText) as Record<
    string,
    Record<string, { cost?: number | string; count?: number | string }>
  >;

  // Build quick ISO/dial lookup from 5sim directory + local definitions
  const fiveSimLookup = new Map<string, { iso: string; dial: string }>();
  for (const [slug, meta] of Object.entries(fiveSimDir)) {
    const key = normalizeCountryMatchKey(meta.text_en || slug);
    const iso = meta.iso ? Object.keys(meta.iso)[0]?.toUpperCase() || '' : '';
    const dial = meta.prefix ? Object.keys(meta.prefix)[0] || '' : '';
    if (key) fiveSimLookup.set(key, { iso, dial });
  }
  for (const def of COUNTRY_DEFINITIONS) {
    const key = normalizeCountryMatchKey(def.country);
    if (!fiveSimLookup.has(key)) {
      fiveSimLookup.set(key, { iso: def.countryCode, dial: def.dialCode });
    }
  }

  const list: GrizzlyCountryPriceOption[] = [];
  for (const [countryId, svcMap] of Object.entries(pricesJson)) {
    const stats = svcMap?.[grizzlyService];
    const count = Number(stats?.count || 0);
    const costUsd = Number(stats?.cost || 0);
    if (count <= 0 || costUsd <= 0) continue;

    const meta = countryDir.get(countryId);
    if (!meta?.name) continue;

    const canonicalKey = normalizeCountryMatchKey(meta.name);
    const geo = fiveSimLookup.get(canonicalKey) ||
      (canonicalKey === 'usavirtual' || canonicalKey === 'usa2'
        ? { iso: 'US', dial: '+1' }
        : { iso: '', dial: '' });

    list.push({
      countryId,
      country: meta.name,
      countryCode: geo.iso,
      dialCode: geo.dial,
      canonicalKey,
      stockCount: count,
      minPriceUsd: roundUnitPrice(costUsd),
    });
  }

  list.sort((a, b) => a.country.localeCompare(b.country));
  grizzlyPricesCache.set(grizzlyService, { data: list, expiresAt: Date.now() + 10_000 });
  return list;
}

async function callGrizzlyApi(params: Record<string, string>, apiKey: string): Promise<string> {
  const qs = new URLSearchParams({ ...params, api_key: apiKey });
  const res = await fetch(`${GRIZZLY_API_URL}?${qs.toString()}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(9000),
  });
  const text = (await res.text()).trim();
  if (!res.ok) {
    throw new Error(text || `Grizzly SMS error (${res.status})`);
  }
  return text;
}

function parseGrizzlyStatus(
  statusText: string,
  orderId: number,
  serviceId: string,
  serviceName?: string
) {
  let status = 'PENDING';
  const sms: SmsMessageEntry[] = [];

  if (statusText.startsWith('STATUS_OK:')) {
    status = 'RECEIVED';
    const payload = statusText.slice('STATUS_OK:'.length).trim();
    const otp = extractOtpCode(payload) || payload;
    sms.push({
      id: `grz-${orderId}-1`,
      sender: serviceName || formatServiceDisplayName(serviceId),
      receivedAt: new Date().toISOString(),
      text: payload === otp ? `Verification code: ${otp}` : payload,
      otp,
    });
  } else if (statusText.startsWith('STATUS_CANCEL')) {
    status = 'CANCELED';
  } else if (statusText.startsWith('STATUS_WAIT_RETRY')) {
    status = 'PENDING';
  }

  return { status, sms };
}

interface UnifiedProviderQuote {
  provider: 'fivesim' | 'grizzly';
  name: string;
  configured: boolean;
  countryId: string;
  minPrice: number;
  rawPriceUsd: number;
  inStockMinPrice: number;
  inStockPriceUsd: number;
  stockCount: number;
}

interface UnifiedCountryRow {
  slug: string;
  country: string;
  countryCode: string;
  dialCode: string;
  minPrice: number;
  rawPriceUsd: number;
  inStockMinPrice: number;
  inStockPriceUsd: number;
  currency: string;
  stockCount: number;
  providers: UnifiedProviderQuote[];
}

async function getUnifiedCountriesForPlatform(
  service: string,
  refresh = false,
  ratesOverride?: ExchangeRates
): Promise<{ countries: UnifiedCountryRow[]; exchangeRate: number }> {
  const fiveSimConfigured = Boolean(getFiveSimApiKey());
  const grizzlyConfigured = Boolean(getGrizzlyApiKey());
  const [fiveSimRes, grizzlyRes, rates] = await Promise.all([
    getFiveSimCountriesForPlatform(service, refresh).catch(() => []),
    getGrizzlyCountriesForPlatform(service, refresh).catch(() => []),
    ratesOverride ? Promise.resolve(ratesOverride) : getExchangeRates(),
  ]);

  const merged = new Map<string, UnifiedCountryRow>();

  for (const c of fiveSimRes) {
    const canonicalKey = normalizeCountryMatchKey(c.country || c.slug);
    const minNgn = roundToNaira(c.minPrice, rates.NGN);
    const inStockUsd = c.inStockMinPrice || c.minPrice;
    const inStockNgn = roundToNaira(inStockUsd, rates.NGN);

    const quote: UnifiedProviderQuote = {
      provider: 'fivesim',
      name: '5sim',
      configured: fiveSimConfigured,
      countryId: c.slug,
      minPrice: minNgn,
      rawPriceUsd: c.minPrice,
      inStockMinPrice: inStockNgn,
      inStockPriceUsd: inStockUsd,
      stockCount: c.stockCount,
    };

    const existing = merged.get(canonicalKey);
    if (!existing) {
      merged.set(canonicalKey, {
        slug: c.slug,
        country: c.country === 'England' ? 'United Kingdom (England)' : c.country,
        countryCode: c.countryCode,
        dialCode: c.dialCode,
        minPrice: minNgn,
        rawPriceUsd: c.minPrice,
        inStockMinPrice: inStockNgn,
        inStockPriceUsd: inStockUsd,
        currency: 'NGN',
        stockCount: c.stockCount,
        providers: [quote],
      });
    } else {
      existing.providers.push(quote);
      existing.stockCount += c.stockCount;
      if (inStockNgnMore(existing.minPrice, minNgn)) {
        existing.minPrice = minNgn;
        existing.rawPriceUsd = c.minPrice;
      }
      if (inStockNgnMore(existing.inStockMinPrice, inStockNgn)) {
        existing.inStockMinPrice = inStockNgn;
        existing.inStockPriceUsd = inStockUsd;
      }
    }
  }

  for (const g of grizzlyRes) {
    const minNgn = roundToNaira(g.minPriceUsd, rates.NGN);
    const quote: UnifiedProviderQuote = {
      provider: 'grizzly',
      name: 'Grizzly SMS',
      configured: grizzlyConfigured,
      countryId: g.countryId,
      minPrice: minNgn,
      rawPriceUsd: g.minPriceUsd,
      inStockMinPrice: minNgn,
      inStockPriceUsd: g.minPriceUsd,
      stockCount: g.stockCount,
    };

    const existing = merged.get(g.canonicalKey);
    if (!existing) {
      merged.set(g.canonicalKey, {
        slug: g.canonicalKey,
        country: g.country,
        countryCode: g.countryCode,
        dialCode: g.dialCode,
        minPrice: minNgn,
        rawPriceUsd: g.minPriceUsd,
        inStockMinPrice: minNgn,
        inStockPriceUsd: g.minPriceUsd,
        currency: 'NGN',
        stockCount: g.stockCount,
        providers: [quote],
      });
    } else {
      const alreadyHasGrizzly = existing.providers.some((p) => p.provider === 'grizzly');
      if (!alreadyHasGrizzly) {
        existing.providers.push(quote);
        existing.stockCount += g.stockCount;
        if (inStockNgnMore(existing.minPrice, minNgn)) {
          existing.minPrice = minNgn;
          existing.rawPriceUsd = g.minPriceUsd;
        }
        if (inStockNgnMore(existing.inStockMinPrice, minNgn)) {
          existing.inStockMinPrice = minNgn;
          existing.inStockPriceUsd = g.minPriceUsd;
        }
      }
    }
  }

  const usedSlugs = new Set<string>();
  const countries = Array.from(merged.values()).map((row, idx) => {
    let uniqueSlug = row.slug || `country-${idx}`;
    if (usedSlugs.has(uniqueSlug)) {
      uniqueSlug = `${uniqueSlug}-${idx}`;
    }
    usedSlugs.add(uniqueSlug);
    return {
      ...row,
      slug: uniqueSlug,
      providers: [...row.providers].sort((a, b) => a.minPrice - b.minPrice),
    };
  });

  // Sort ALL countries strictly alphabetically A to Z
  countries.sort((a, b) => a.country.localeCompare(b.country));

  return { countries, exchangeRate: rates.NGN };
}

function inStockNgnMore(existing: number, candidate: number): boolean {
  return candidate > 0 && (existing <= 0 || candidate < existing);
}

export function createApiApp() {
  const app = express();

  const OWNER_ADMIN_EMAIL = 'preciousddkid@gmail.com';
  const INBOUND_AUDIT_ADDRESS = '__inbound_audit__@system.veribox';

  interface InboundAttemptLog {
    id: string;
    timestamp: string;
    status: 'stored' | 'rejected_secret' | 'unmatched_recipient' | 'db_error' | 'invalid_payload';
    httpStatus: number;
    recipients: string[];
    rawToPreview: string;
    fromAddress: string;
    subject: string;
    otpDetected: string | null;
    supabaseStored: boolean;
    error: string | null;
    totalMs?: number | null;
    dbInsertMs?: number | null;
    parseMs?: number | null;
    matchedMailbox?: boolean | null;
    matchedMailboxId?: string | null;
    receivedAt?: string | null;
    storedAt?: string | null;
    deliveryGapMs?: number | null;
  }

  const inboundAttemptLogs: InboundAttemptLog[] = [];
  let mailboxIdColumnAvailable = true;

  interface AppErrorLogItem {
    id: string;
    timestamp: string;
    source: 'supabase' | 'webhook' | 'wallet' | 'routing' | 'app';
    severity: 'error' | 'warning';
    code: string | null;
    message: string;
    detail: string | null;
  }

  const appErrorLogs: AppErrorLogItem[] = [];

  function recordAppError(params: {
    source: AppErrorLogItem['source'];
    severity?: AppErrorLogItem['severity'];
    code?: string | null;
    message: string;
    detail?: string | null;
  }) {
    const entry: AppErrorLogItem = {
      id: `err_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
      timestamp: new Date().toISOString(),
      source: params.source,
      severity: params.severity || 'error',
      code: params.code ?? null,
      message: (params.message || 'Unknown error').slice(0, 400),
      detail: params.detail ? params.detail.slice(0, 500) : null,
    };
    appErrorLogs.unshift(entry);
    if (appErrorLogs.length > 60) {
      appErrorLogs.length = 60;
    }

    const sb = getSupabaseServerClient();
    if (sb) {
      void sb
        .from('app_error_logs')
        .insert({
          source: entry.source,
          severity: entry.severity,
          code: entry.code,
          message: entry.message,
          detail: entry.detail,
        })
        .then(() => undefined, () => undefined);
    }
  }

  const UUID_V4_OR_ANY_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  interface RecordInboundLogResult {
    logged: boolean;
    logId: string | null;
    logError: string | null;
  }

  async function recordInboundAttempt(entry: InboundAttemptLog): Promise<RecordInboundLogResult> {
    inboundAttemptLogs.unshift(entry);
    if (inboundAttemptLogs.length > 50) {
      inboundAttemptLogs.length = 50;
    }

    if (entry.httpStatus >= 400 || entry.status === 'db_error' || entry.error) {
      recordAppError({
        source: entry.status === 'db_error' ? 'supabase' : 'webhook',
        severity: entry.httpStatus >= 400 ? 'error' : 'warning',
        code: `HTTP ${entry.httpStatus}`,
        message: entry.error || `Inbound webhook ${entry.status}`,
        detail: `To: ${entry.recipients[0] || entry.rawToPreview || '(none)'} · From: ${entry.fromAddress || '(unknown)'}`,
      });
    }

    const sb = getSupabaseServerClient();
    if (!sb) {
      return {
        logged: false,
        logId: null,
        logError: 'Supabase client not configured on backend',
      };
    }

    const safeMailboxUuid =
      entry.matchedMailboxId && UUID_V4_OR_ANY_REGEX.test(entry.matchedMailboxId)
        ? entry.matchedMailboxId
        : null;
    const isOk =
      entry.httpStatus >= 200 && entry.httpStatus < 300 && Boolean(entry.supabaseStored);

    try {
      const { data, error: logError } = await sb
        .from('inbound_webhook_logs')
        .insert({
          received_at: entry.receivedAt || entry.timestamp || new Date().toISOString(),
          from_address: (entry.fromAddress || '').slice(0, 240),
          to_address: (entry.recipients[0] || entry.rawToPreview || '').slice(0, 240),
          subject: (entry.subject || '').slice(0, 300),
          otp_code: entry.otpDetected || null,
          matched_mailbox_id: safeMailboxUuid,
          http_status: entry.httpStatus,
          status: entry.status,
          ok: isOk,
          error_reason: entry.error || null,
          raw_meta: {
            attemptId: entry.id,
            recipients: entry.recipients,
            rawToPreview: entry.rawToPreview,
            matchedMailbox: Boolean(entry.matchedMailbox),
            matchedMailboxIdRaw: entry.matchedMailboxId ?? null,
            supabaseStored: entry.supabaseStored,
            totalMs: typeof entry.totalMs === 'number' ? entry.totalMs : null,
            dbInsertMs: typeof entry.dbInsertMs === 'number' ? entry.dbInsertMs : null,
            parseMs: typeof entry.parseMs === 'number' ? entry.parseMs : null,
            storedAt: entry.storedAt || null,
            deliveryGapMs: typeof entry.deliveryGapMs === 'number' ? entry.deliveryGapMs : null,
          },
        })
        .select('id')
        .single();

      if (logError) {
        console.warn('[VeriBox Inbound] inbound_webhook_logs insert error:', logError.message);
        recordAppError({
          source: 'supabase',
          code: logError.code || 'LOG_INSERT',
          message: `inbound_webhook_logs insert failed: ${logError.message}`,
        });
        return {
          logged: false,
          logId: null,
          logError: logError.message || 'Failed to insert into public.inbound_webhook_logs',
        };
      }

      return {
        logged: true,
        logId: data?.id ? String(data.id) : null,
        logError: null,
      };
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Exception inserting into public.inbound_webhook_logs';
      console.warn('[VeriBox Inbound] inbound_webhook_logs insert exception:', msg);
      recordAppError({
        source: 'supabase',
        code: 'EXCEPTION',
        message: msg,
      });
      return {
        logged: false,
        logId: null,
        logError: msg,
      };
    }
  }

  // Capture exact untouched raw body bytes for Resend (Svix) webhook signature verification
  app.use('/api/email/inbound', express.raw({ limit: '5mb', type: '*/*' }));

  app.use(
    express.json({
      limit: '5mb',
      type: ['application/json', 'application/*+json', 'text/plain'],
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));
  app.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (err && typeof err === 'object' && ('status' in err || err instanceof SyntaxError)) {
        const errObj = err as {
          status?: number;
          statusCode?: number;
          message?: string;
        };
        const code = errObj.status || errObj.statusCode || 400;
        if (req.path.startsWith('/api/email/inbound')) {
          const attemptId = `att_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
          const msg = `HTTP ${code}: ${errObj.message || 'Invalid webhook payload'}`;
          void recordInboundAttempt({
            id: attemptId,
            timestamp: new Date().toISOString(),
            status: 'invalid_payload',
            httpStatus: code,
            recipients: [],
            rawToPreview: '',
            fromAddress: '',
            subject: '(Payload parse error)',
            otpDetected: null,
            supabaseStored: false,
            error: msg,
          }).finally(() => {
            res.status(code).json({ ok: false, error: msg });
          });
          return;
        }
        res.status(code).json({ error: errObj.message || 'Malformed request body' });
        return;
      }
      next(err);
    }
  );

  app.get(['/security.txt', '/.well-known/security.txt'], (_req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(
      `Contact: mailto:security@${CUSTOM_EMAIL_DOMAIN}\nExpires: 2028-12-31T23:59:59.000Z\nPreferred-Languages: en\nCanonical: https://${CUSTOM_EMAIL_DOMAIN}/.well-known/security.txt\nPolicy: https://${CUSTOM_EMAIL_DOMAIN}\n`
    );
  });

  app.get('/robots.txt', (_req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send('User-agent: *\nAllow: /\nDisallow: /api/\n');
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      configured: Boolean(getFiveSimApiKey()),
    });
  });

  app.get('/api/sms/links', (_req, res) => {
    res.json({ links: FREE_SMS_DIRECTORY });
  });

  app.get('/api/sms/countries', async (req, res) => {
    const platform = String(req.query.platform || 'all').toLowerCase();
    const safePlatform = PLATFORM_PATH_MAP[platform] ? platform : 'all';
    const platformPath = PLATFORM_PATH_MAP[safePlatform] || '/';

    try {
      const platformNums = await fetchAnonymsmsNumbers(platformPath, safePlatform, true).catch(() => []);
      const platformCounts = new Map<string, number>();
      for (const n of platformNums) {
        platformCounts.set(n.countryCode, (platformCounts.get(n.countryCode) || 0) + 1);
      }

      const countries: CountryOption[] = COUNTRY_DEFINITIONS.map((c) => ({
        countryCode: c.countryCode,
        country: c.country,
        dialCode: c.dialCode,
        availableCount:
          (platformCounts.get(c.countryCode) || 0) +
          (c.mytempsmsPath ? 6 : 0) +
          (c.anonymsmsPath ? 6 : 0),
        platformVerifiedCount: platformCounts.get(c.countryCode) || 0,
      }));

      countries.sort(
        (a, b) => b.platformVerifiedCount - a.platformVerifiedCount || b.availableCount - a.availableCount
      );

      res.json({ platform: safePlatform, countries });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Failed to load countries',
        countries: [],
      });
    }
  });

  app.get('/api/sms/batch', async (req, res) => {
    const platform = String(req.query.platform || 'all').toLowerCase();
    const countryCode = String(req.query.country || 'GB').toUpperCase();
    const sessionId = String(req.query.sessionId || 'default').slice(0, 64);
    const refresh = req.query.refresh === '1';
    const replaceDigits = req.query.replaceDigits
      ? String(req.query.replaceDigits).replace(/\D/g, '')
      : '';

    const trackerKey = `${sessionId}::${platform}::${countryCode}`;

    try {
      const pool = await fetchCombinedPool(platform, countryCode === 'ALL' ? undefined : countryCode);
      if (pool.length === 0) {
        res.status(404).json({ error: 'No active numbers found for this country right now', numbers: [] });
        return;
      }

      let state = sessionTracker.get(trackerKey);
      if (!state) {
        state = {
          currentBatch: [],
          seenDigits: new Set<string>(),
          batchNumber: 0,
        };
        sessionTracker.set(trackerKey, state);
      }

      if (!refresh && !replaceDigits && state.currentBatch.length > 0) {
        const currentThree = state.currentBatch.slice(0, 3);
        const remainingFresh = pool.filter((n) => !state!.seenDigits.has(n.digits)).length;
        res.json({
          platform,
          countryCode,
          numbers: currentThree,
          tracker: {
            sessionId,
            platform,
            countryCode,
            batchNumber: state.batchNumber,
            totalServedCount: state.seenDigits.size,
            remainingFreshCount: remainingFresh,
            replacedDigits: [],
            newlyAssignedDigits: currentThree.map((n) => n.digits),
            poolReset: false,
            notice: `Showing your 3 assigned numbers (Batch #${state.batchNumber})`,
          },
        });
        return;
      }

      if (replaceDigits && state.currentBatch.length > 0) {
        state.seenDigits.add(replaceDigits);
        let freshCandidates = pool.filter(
          (n) => !state!.seenDigits.has(n.digits) && !state!.currentBatch.some((c) => c.digits === n.digits)
        );
        let poolReset = false;
        if (freshCandidates.length === 0) {
          const currentDigits = new Set(state.currentBatch.map((c) => c.digits));
          state.seenDigits = new Set(currentDigits);
          freshCandidates = pool.filter((n) => !currentDigits.has(n.digits));
          poolReset = true;
        }
        const replacement =
          freshCandidates[0] || state.currentBatch.find((c) => c.digits === replaceDigits)!;
        state.seenDigits.add(replacement.digits);
        state.currentBatch = state.currentBatch.map((c) =>
          c.digits === replaceDigits ? replacement : c
        );
        state.batchNumber += 1;

        const remainingFresh = pool.filter((n) => !state!.seenDigits.has(n.digits)).length;
        res.json({
          platform,
          countryCode,
          numbers: state.currentBatch.slice(0, 3),
          tracker: {
            sessionId,
            platform,
            countryCode,
            batchNumber: state.batchNumber,
            totalServedCount: state.seenDigits.size,
            remainingFreshCount: remainingFresh,
            replacedDigits: [replaceDigits],
            newlyAssignedDigits: [replacement.digits],
            poolReset,
            notice: `Swapped +${replaceDigits} for +${replacement.digits}`,
          },
        });
        return;
      }

      const previousBatchDigits = state.currentBatch.map((n) => n.digits);
      for (const prev of previousBatchDigits) {
        state.seenDigits.add(prev);
      }

      let unseen = pool.filter((n) => !state!.seenDigits.has(n.digits));
      let poolReset = false;

      if (unseen.length < 3) {
        const excludeCurrent = new Set(previousBatchDigits);
        state.seenDigits = new Set(previousBatchDigits);
        unseen = pool.filter((n) => !excludeCurrent.has(n.digits));
        if (unseen.length === 0) {
          unseen = pool;
        }
        poolReset = true;
      }

      const nextThree = unseen.slice(0, 3);
      for (const item of nextThree) {
        state.seenDigits.add(item.digits);
      }
      state.currentBatch = nextThree;
      state.batchNumber += 1;

      const remainingFresh = pool.filter((n) => !state!.seenDigits.has(n.digits)).length;

      res.json({
        platform,
        countryCode,
        numbers: nextThree,
        tracker: {
          sessionId,
          platform,
          countryCode,
          batchNumber: state.batchNumber,
          totalServedCount: state.seenDigits.size,
          remainingFreshCount: remainingFresh,
          replacedDigits: previousBatchDigits,
          newlyAssignedDigits: nextThree.map((n) => n.digits),
          poolReset,
          notice:
            state.batchNumber === 1
              ? `Assigned 3 fresh numbers · ${remainingFresh} more available`
              : `Refreshed to 3 new numbers (Batch #${state.batchNumber}) · ${state.seenDigits.size} tracked`,
        },
      });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Failed to assign numbers',
        numbers: [],
      });
    }
  });

  app.get('/api/sms/numbers', async (req, res) => {
    try {
      const platform = String(req.query.platform || 'all').toLowerCase();
      const countryCode = req.query.country ? String(req.query.country).toUpperCase() : undefined;
      const numbers = await fetchCombinedPool(platform, countryCode);
      res.json({
        platform,
        country: countryCode || 'ALL',
        numbers: numbers.slice(0, 36),
        links: FREE_SMS_DIRECTORY,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load numbers';
      res.status(502).json({ error: message, numbers: [], links: FREE_SMS_DIRECTORY });
    }
  });

  app.get('/api/sms/messages/:digits', async (req, res) => {
    const digits = req.params.digits.replace(/\D/g, '');
    const platform = String(req.query.platform || 'all').toLowerCase();
    const showAll = req.query.showAll === '1';
    const sourceUrl = typeof req.query.sourceUrl === 'string' ? req.query.sourceUrl : undefined;

    if (!/^\d{7,16}$/.test(digits)) {
      res.status(400).json({ error: 'Invalid phone number format' });
      return;
    }

    try {
      const allMessages = await fetchSmsMessagesForEntry(digits, sourceUrl);
      const filteredMessages =
        showAll || platform === 'all'
          ? allMessages
          : allMessages.filter((m) => matchesPlatform(m, platform));
      const blockedCount = Math.max(0, allMessages.length - filteredMessages.length);
      const { country, code, dialCode } = inferCountry(digits);

      res.json({
        number: `+${digits}`,
        digits,
        country,
        countryCode: code,
        dialCode,
        sourceUrl: sourceUrl || `https://anonymsms.com/number/${digits}/`,
        messages: filteredMessages,
        allMessagesCount: allMessages.length,
        blockedCount,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch SMS inbox';
      res.status(502).json({ error: message, messages: [], blockedCount: 0 });
    }
  });

  app.get('/api/sms/stream/:digits', async (req, res) => {
    const digits = req.params.digits.replace(/\D/g, '');
    const platform = String(req.query.platform || 'all').toLowerCase();
    const showAll = req.query.showAll === '1';
    const sourceUrl = typeof req.query.sourceUrl === 'string' ? req.query.sourceUrl : undefined;

    if (!/^\d{7,16}$/.test(digits)) {
      res.status(400).end();
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let closed = false;
    req.on('close', () => {
      closed = true;
    });

    const pushUpdate = async () => {
      if (closed) return;
      try {
        const allMessages = await fetchSmsMessagesForEntry(digits, sourceUrl);
        const filteredMessages =
          showAll || platform === 'all'
            ? allMessages
            : allMessages.filter((m) => matchesPlatform(m, platform));
        const blockedCount = Math.max(0, allMessages.length - filteredMessages.length);
        if (!closed) {
          res.write(
            `data: ${JSON.stringify({
              type: 'messages',
              messages: filteredMessages,
              blockedCount,
              allMessagesCount: allMessages.length,
              syncedAt: new Date().toISOString(),
            })}\n\n`
          );
        }
      } catch {
        // Keep stream alive
      }
    };

    await pushUpdate();
    const pollId = setInterval(() => {
      void pushUpdate();
    }, 5500);
    const keepAliveId = setInterval(() => {
      if (!closed) res.write(': ping\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(pollId);
      clearInterval(keepAliveId);
    });
  });

  // ==========================================
  // Custom Domain Email Engine, Number Holds, Anti-Duplicate Pool & Strict Ban Engine
  // ==========================================
  interface NumberOrderHoldRecord {
    orderId: number;
    userId?: string;
    email?: string | null;
    amountNgn: number;
    rawPriceUsd?: number;
    provider: 'fivesim' | 'grizzly';
    service: string;
    serviceName: string;
    phone: string;
    digits: string;
    country?: string;
    countryCode?: string;
    charged: boolean;
    settled: boolean;
    cancelled: boolean;
    refunded?: boolean;
    createdAt: number;
  }

  const numberOrderHoldMap = new Map<number, NumberOrderHoldRecord>();
  const walletAdjustmentRefs = new Map<string, { balance: number; delta: number }>();

  // Global cross-user issued phone number registry (never issue the same digits twice across users)
  const issuedPhoneNumbersSet = new Set<string>();
  const reservingPhoneDigitsSet = new Set<string>();
  let issuedNumbersHydratedAt = 0;

  function normalizePhoneDigits(raw: unknown): string {
    return String(raw || '').replace(/\D/g, '');
  }

  async function hydrateIssuedNumbersFromDb(force = false): Promise<void> {
    if (!force && Date.now() - issuedNumbersHydratedAt < 60_000) return;
    issuedNumbersHydratedAt = Date.now();
    const sb = getSupabaseServerClient();
    if (!sb) return;
    try {
      const [issuedRes, txRes] = await Promise.all([
        sb
          .from('issued_phone_numbers')
          .select('digits')
          .order('created_at', { ascending: false })
          .limit(2000),
        sb
          .from('wallet_transactions')
          .select('details')
          .eq('tx_type', 'debit')
          .order('created_at', { ascending: false })
          .limit(500),
      ]);
      if (!issuedRes.error && Array.isArray(issuedRes.data)) {
        for (const r of issuedRes.data) {
          const d = normalizePhoneDigits((r as { digits?: unknown }).digits);
          if (d.length >= 7) issuedPhoneNumbersSet.add(d);
        }
      }
      if (!txRes.error && Array.isArray(txRes.data)) {
        for (const row of txRes.data) {
          const details = String((row as { details?: unknown }).details || '');
          const m = details.match(/\+?(\d{7,16})/);
          if (m?.[1]) issuedPhoneNumbersSet.add(m[1]);
        }
      }
    } catch {
      // Non-blocking fallback to in-memory set
    }
  }

  async function isPhoneNumberAlreadyIssued(rawDigits: string): Promise<boolean> {
    const digits = normalizePhoneDigits(rawDigits);
    if (!digits || digits.length < 7) return true;
    if (reservingPhoneDigitsSet.has(digits) || issuedPhoneNumbersSet.has(digits)) {
      return true;
    }
    await hydrateIssuedNumbersFromDb(false);
    if (issuedPhoneNumbersSet.has(digits)) return true;

    const sb = getSupabaseServerClient();
    if (sb) {
      try {
        const { data, error } = await sb
          .from('issued_phone_numbers')
          .select('digits')
          .eq('digits', digits)
          .limit(1)
          .maybeSingle();
        if (!error && data && (data as { digits?: unknown }).digits) {
          issuedPhoneNumbersSet.add(digits);
          return true;
        }
      } catch {
        // Table may not exist yet; rely on in-memory + hydrated wallet_transactions
      }
    }
    return false;
  }

  async function markPhoneNumberIssued(params: {
    digits: string;
    phone: string;
    provider: string;
    service: string;
    country: string;
    userId?: string;
    orderId: number;
  }): Promise<void> {
    const digits = normalizePhoneDigits(params.digits);
    if (!digits) return;
    issuedPhoneNumbersSet.add(digits);
    reservingPhoneDigitsSet.delete(digits);
    const sb = getSupabaseServerClient();
    if (!sb) return;
    try {
      await sb.from('issued_phone_numbers').upsert(
        {
          digits,
          phone: params.phone,
          provider: params.provider,
          service: params.service,
          country: params.country,
          user_id: params.userId || null,
          order_id: params.orderId,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'digits' }
      );
    } catch {
      // Non-blocking if issued_phone_numbers table not created yet
    }
  }

  function getPendingHoldTotalForUser(userId?: string): number {
    if (!userId) return 0;
    const normId = normalizeWalletUserId(userId);
    const cutoff = Date.now() - 30 * 60 * 1000;
    let total = 0;
    for (const hold of numberOrderHoldMap.values()) {
      if (
        hold.userId === normId &&
        !hold.charged &&
        !hold.settled &&
        !hold.cancelled &&
        hold.createdAt >= cutoff &&
        hold.amountNgn > 0
      ) {
        total += hold.amountNgn;
      }
    }
    return Math.round(total);
  }

  // Strict Moderation & Visitor Ban Registry (supports User ID, Email & IP blocking)
  type ModerationStatusValue = 'active' | 'verified' | 'restricted' | 'suspended' | 'banned';
  interface StrictBanEntryRecord {
    id: string;
    targetType: 'user' | 'email' | 'ip';
    targetValue: string;
    reason: string | null;
    strict: boolean;
    bannedBy: string | null;
    createdAt: string;
  }

  const strictModerationUserMap = new Map<
    string,
    {
      status: ModerationStatusValue;
      reason: string | null;
      strict: boolean;
      email?: string | null;
      ip?: string | null;
      updatedAt: number;
    }
  >();
  const bannedEmailsSet = new Map<string, StrictBanEntryRecord>();
  const bannedIpsSet = new Map<string, StrictBanEntryRecord>();
  const lastKnownUserIpMap = new Map<string, string>();
  let moderationDbHydratedAt = 0;

  function getRequestClientIp(req: express.Request): string {
    const cfIp = typeof req.headers['cf-connecting-ip'] === 'string' ? req.headers['cf-connecting-ip'].trim() : '';
    const xff = typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'].split(',')[0].trim() : '';
    const realIp = typeof req.headers['x-real-ip'] === 'string' ? req.headers['x-real-ip'].trim() : '';
    const raw = (cfIp || xff || realIp || req.ip || req.socket?.remoteAddress || '').trim();
    return raw.replace(/^::ffff:/i, '').slice(0, 80);
  }

  function recordUserVisitIp(userId: string, ip: string): void {
    if (!userId || !ip || ip === '127.0.0.1' || ip === '::1') return;
    lastKnownUserIpMap.set(userId, ip);
  }

  async function hydrateModerationFromDb(force = false): Promise<void> {
    if (!force && Date.now() - moderationDbHydratedAt < 15_000) return;
    moderationDbHydratedAt = Date.now();
    const sb = getSupabaseServerClient();
    if (!sb) return;
    try {
      const { data, error } = await sb
        .from('user_moderation')
        .select('user_id, email, status, reason, updated_by, updated_at');
      if (error || !Array.isArray(data)) return;
      for (const row of data) {
        const r = row as {
          user_id?: string | null;
          email?: string | null;
          status?: string | null;
          reason?: string | null;
          updated_by?: string | null;
          updated_at?: string | null;
        };
        const uid = String(r.user_id || '').trim();
        const email = String(r.email || '').trim().toLowerCase();
        const status = String(r.status || 'active').toLowerCase() as ModerationStatusValue;
        const reason = r.reason ? String(r.reason) : null;
        if (email === OWNER_ADMIN_EMAIL) continue;

        if (uid.startsWith('ip:')) {
          const ipVal = uid.slice(3).trim();
          if (status === 'banned' && ipVal) {
            bannedIpsSet.set(ipVal, {
              id: uid,
              targetType: 'ip',
              targetValue: ipVal,
              reason,
              strict: true,
              bannedBy: r.updated_by || null,
              createdAt: r.updated_at || new Date().toISOString(),
            });
          } else if (ipVal) {
            bannedIpsSet.delete(ipVal);
          }
          continue;
        }

        if (uid.startsWith('email:')) {
          const emVal = (uid.slice(6) || email).trim().toLowerCase();
          if (status === 'banned' && emVal) {
            bannedEmailsSet.set(emVal, {
              id: uid,
              targetType: 'email',
              targetValue: emVal,
              reason,
              strict: true,
              bannedBy: r.updated_by || null,
              createdAt: r.updated_at || new Date().toISOString(),
            });
          } else if (emVal) {
            bannedEmailsSet.delete(emVal);
          }
          continue;
        }

        if (uid) {
          strictModerationUserMap.set(uid, {
            status,
            reason,
            strict: status === 'banned',
            email: email || null,
            updatedAt: Date.now(),
          });
          if (status === 'banned' && email) {
            bannedEmailsSet.set(email, {
              id: `email:${email}`,
              targetType: 'email',
              targetValue: email,
              reason,
              strict: true,
              bannedBy: r.updated_by || null,
              createdAt: r.updated_at || new Date().toISOString(),
            });
          }
        }
      }
    } catch {
      // Non-blocking fallback to in-memory map
    }
  }

  interface CustomMailboxRecord {
    id: string;
    address: string;
    username: string;
    domain: string;
    displayName?: string;
    accountMode?: string;
    ownerUserId?: string;
    provider: 'veribox';
    token: string;
    passwordHash: string;
    salt: string;
    isDeleted: boolean;
    createdAt: string;
  }

  interface CustomInboxMessageRecord {
    id: string;
    recipientAddress: string;
    fromName: string;
    fromAddress: string;
    subject: string;
    text: string;
    html: string;
    otp: string | null;
    seen: boolean;
    createdAt: string;
  }

  const mailboxRegistry = new Map<string, CustomMailboxRecord>();
  const markedCreatedAddresses = new Set<string>();
  const mailboxMessagesMap = new Map<string, CustomInboxMessageRecord[]>();
  const emailEvents = new EventEmitter();
  emailEvents.setMaxListeners(200);
  const runtimeMailboxSigningKey = crypto.randomBytes(32).toString('hex');

  function getMailboxSigningSecret(): string {
    return (
      (
        process.env.MAILBOX_TOKEN_SECRET ||
        process.env.RESEND_WEBHOOK_SECRET ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SECRET_KEY ||
        ''
      ).trim() || runtimeMailboxSigningKey
    );
  }

  function createOrderChargeToken(params: {
    orderId: number;
    userId: string;
    amountNgn: number;
    provider: string;
    phone: string;
    serviceName: string;
  }): string {
    const payload = Buffer.from(
      JSON.stringify({
        orderId: params.orderId,
        userId: params.userId,
        amountNgn: Math.round(params.amountNgn),
        provider: params.provider,
        phone: params.phone,
        serviceName: params.serviceName,
      }),
      'utf8'
    ).toString('base64url');
    const sig = crypto
      .createHmac('sha256', getMailboxSigningSecret())
      .update(`ord:${payload}`)
      .digest('hex')
      .slice(0, 32);
    return `${payload}.${sig}`;
  }

  function verifyOrderChargeToken(
    rawToken: unknown,
    expectedOrderId: number
  ): {
    orderId: number;
    userId: string;
    amountNgn: number;
    provider: 'fivesim' | 'grizzly';
    phone: string;
    serviceName: string;
  } | null {
    if (typeof rawToken !== 'string' || !rawToken.includes('.')) return null;
    const [payload, sig] = rawToken.split('.');
    if (!payload || !sig) return null;
    const expectedSig = crypto
      .createHmac('sha256', getMailboxSigningSecret())
      .update(`ord:${payload}`)
      .digest('hex')
      .slice(0, 32);
    if (!safeSecretsEqual(sig, expectedSig)) return null;
    try {
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        orderId?: number;
        userId?: string;
        amountNgn?: number;
        provider?: string;
        phone?: string;
        serviceName?: string;
      };
      if (Number(parsed.orderId) !== expectedOrderId || !parsed.userId) return null;
      return {
        orderId: expectedOrderId,
        userId: String(parsed.userId),
        amountNgn: Math.max(0, Math.round(Number(parsed.amountNgn) || 0)),
        provider: parsed.provider === 'grizzly' ? 'grizzly' : 'fivesim',
        phone: String(parsed.phone || ''),
        serviceName: String(parsed.serviceName || 'Verification'),
      };
    } catch {
      return null;
    }
  }

  function createSignedMailboxToken(rawAddress: unknown): string {
    const addr = normalizeRecipientString(rawAddress);
    const nonce = crypto.randomBytes(16).toString('hex');
    const sig = crypto
      .createHmac('sha256', getMailboxSigningSecret())
      .update(`${addr}|${nonce}`)
      .digest('hex')
      .slice(0, 32);
    return `vbx1.${nonce}.${sig}`;
  }

  function verifySignedMailboxToken(rawAddress: unknown, rawToken: string): boolean {
    const addr = normalizeRecipientString(rawAddress);
    const parts = (typeof rawToken === 'string' ? rawToken : String(rawToken || '')).trim().split('.');
    if (parts.length !== 3 || parts[0] !== 'vbx1') return false;
    const [, nonce, providedSig] = parts;
    if (!nonce || !providedSig) return false;
    const expectedSig = crypto
      .createHmac('sha256', getMailboxSigningSecret())
      .update(`${addr}|${nonce}`)
      .digest('hex')
      .slice(0, 32);
    return safeSecretsEqual(providedSig, expectedSig);
  }

  async function getVerifiedSupabaseBearerUser(
    req: express.Request
  ): Promise<{ id: string; email: string; accountStatus: string; bannedUntil: string | null } | null> {
    const rawHeader =
      (typeof req.headers['x-supabase-token'] === 'string'
        ? req.headers['x-supabase-token']
        : '') || (req.headers.authorization || '');
    const jwt = rawHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt || jwt.startsWith('vbx1.')) return null;

    const sb = getSupabaseServerClient();
    if (!sb) return null;
    try {
      const { data, error } = await sb.auth.getUser(jwt);
      if (error || !data?.user) return null;
      const appMeta = (data.user.app_metadata || {}) as Record<string, unknown>;
      const bannedUntil =
        typeof (data.user as { banned_until?: string | null }).banned_until === 'string'
          ? (data.user as { banned_until?: string | null }).banned_until || null
          : null;
      const uid = String(data.user.id);
      const email = String(data.user.email || '').trim().toLowerCase();
      recordUserVisitIp(uid, getRequestClientIp(req));
      return {
        id: uid,
        email,
        accountStatus: String(appMeta.account_status || 'active').toLowerCase(),
        bannedUntil,
      };
    } catch {
      return null;
    }
  }

  async function isVerifiedOwnerAdminCaller(req: express.Request): Promise<boolean> {
    const user = await getVerifiedSupabaseBearerUser(req);
    return Boolean(user && user.email === OWNER_ADMIN_EMAIL);
  }

  async function evaluateCallerModeration(req: express.Request): Promise<{
    ownerUnlimited: boolean;
    blocked: boolean;
    status: ModerationStatusValue;
    reason: string | null;
    strict: boolean;
    matchType: 'user' | 'email' | 'ip' | null;
    user: { id: string; email: string; accountStatus: string; bannedUntil: string | null } | null;
  }> {
    await hydrateModerationFromDb(false);
    const user = await getVerifiedSupabaseBearerUser(req);
    if (user && user.email === OWNER_ADMIN_EMAIL) {
      return {
        ownerUnlimited: true,
        blocked: false,
        status: 'verified',
        reason: null,
        strict: false,
        matchType: null,
        user,
      };
    }

    const clientIp = getRequestClientIp(req);
    if (clientIp && bannedIpsSet.has(clientIp)) {
      const ipBan = bannedIpsSet.get(clientIp)!;
      return {
        ownerUnlimited: false,
        blocked: true,
        status: 'banned',
        reason: ipBan.reason || 'Your network / device has been permanently banned by the administrator.',
        strict: true,
        matchType: 'ip',
        user,
      };
    }

    const bodyEmail =
      typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const checkEmail = user?.email || bodyEmail;
    if (checkEmail && checkEmail !== OWNER_ADMIN_EMAIL && bannedEmailsSet.has(checkEmail)) {
      const emBan = bannedEmailsSet.get(checkEmail)!;
      return {
        ownerUnlimited: false,
        blocked: true,
        status: 'banned',
        reason: emBan.reason || 'This email address has been banned by the administrator.',
        strict: true,
        matchType: 'email',
        user,
      };
    }

    const checkUserId =
      user?.id ||
      (typeof req.body?.userId === 'string' && req.body.userId.trim()
        ? req.body.userId.trim()
        : typeof req.query?.userId === 'string' && req.query.userId.trim()
          ? req.query.userId.trim()
          : '');

    if (checkUserId) {
      const cachedMod = strictModerationUserMap.get(checkUserId);
      if (cachedMod && ['banned', 'suspended', 'restricted'].includes(cachedMod.status)) {
        return {
          ownerUnlimited: false,
          blocked: true,
          status: cachedMod.status,
          reason:
            cachedMod.reason ||
            `Account is ${cachedMod.status}. Access to VeriBox services has been disabled.`,
          strict: cachedMod.strict,
          matchType: 'user',
          user,
        };
      }
    }

    if (user) {
      const isTimeBanned = user.bannedUntil ? Date.parse(user.bannedUntil) > Date.now() : false;
      const metaStatus = user.accountStatus as ModerationStatusValue;
      if (isTimeBanned || ['banned', 'suspended', 'restricted'].includes(metaStatus)) {
        const effStatus: ModerationStatusValue =
          metaStatus === 'banned' || metaStatus === 'suspended' || metaStatus === 'restricted'
            ? metaStatus
            : 'banned';
        return {
          ownerUnlimited: false,
          blocked: true,
          status: effStatus,
          reason: `Account is currently ${effStatus}. Contact the administrator for support.`,
          strict: effStatus === 'banned',
          matchType: 'user',
          user,
        };
      }
    }

    return {
      ownerUnlimited: false,
      blocked: false,
      status: user?.accountStatus === 'verified' ? 'verified' : 'active',
      reason: null,
      strict: false,
      matchType: null,
      user,
    };
  }

  async function assertCallerNotModerated(
    req: express.Request,
    res: express.Response
  ): Promise<{ ownerUnlimited: boolean; userId?: string; email?: string } | null> {
    const evalResult = await evaluateCallerModeration(req);
    if (evalResult.blocked) {
      res.status(403).json({
        code: 'ACCOUNT_MODERATED',
        error:
          evalResult.reason ||
          `Account is currently ${evalResult.status}. Access blocked.`,
        moderation: {
          blocked: true,
          status: evalResult.status,
          reason: evalResult.reason,
          strict: evalResult.strict,
          matchType: evalResult.matchType,
        },
      });
      return null;
    }
    return {
      ownerUnlimited: evalResult.ownerUnlimited,
      userId: evalResult.user?.id,
      email: evalResult.user?.email,
    };
  }

  function hashEmailPassword(password: string, salt?: string): { salt: string; hash: string } {
    const useSalt = salt || crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(password, useSalt, 32).toString('hex');
    return { salt: useSalt, hash: derived };
  }

  function verifyEmailPassword(password: string, record: CustomMailboxRecord): boolean {
    try {
      const { hash } = hashEmailPassword(password, record.salt);
      const a = Buffer.from(hash, 'hex');
      const b = Buffer.from(record.passwordHash, 'hex');
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  async function isEmailAddressClaimed(rawAddress: string): Promise<boolean> {
    const addr = rawAddress.trim().toLowerCase();
    if (!addr) return true;
    if (markedCreatedAddresses.has(addr) || mailboxRegistry.has(addr)) {
      markedCreatedAddresses.add(addr);
      return true;
    }

    const sb = getSupabaseServerClient();
    if (!sb) return false;

    try {
      const [regRes, mbRes, msgRes] = await Promise.all([
        sb
          .from('created_email_registry')
          .select('address')
          .ilike('address', addr)
          .limit(1)
          .maybeSingle(),
        sb.from('mailboxes').select('address').ilike('address', addr).limit(1).maybeSingle(),
        sb
          .from('mailbox_messages')
          .select('recipient_address')
          .ilike('recipient_address', addr)
          .limit(1)
          .maybeSingle(),
      ]);

      if (regRes.data?.address || mbRes.data?.address || msgRes.data?.recipient_address) {
        markedCreatedAddresses.add(addr);
        return true;
      }
    } catch {
      // Non-blocking fallback to in-memory set
    }

    return false;
  }

  async function markEmailAsClaimed(params: {
    address: string;
    username: string;
    domain: string;
    ownerUserId?: string;
    source: 'generate' | 'create';
    isDeleted?: boolean;
    createdAt?: string;
  }): Promise<void> {
    const addr = params.address.trim().toLowerCase();
    markedCreatedAddresses.add(addr);

    const sb = getSupabaseServerClient();
    if (!sb) return;
    try {
      await sb.from('created_email_registry').upsert(
        {
          address: addr,
          username: params.username.trim().toLowerCase(),
          domain: params.domain.trim().toLowerCase(),
          created_by_user_id: params.ownerUserId || null,
          source: params.source,
          is_deleted: Boolean(params.isDeleted),
          created_at: params.createdAt || new Date().toISOString(),
          deleted_at: params.isDeleted ? new Date().toISOString() : null,
        },
        { onConflict: 'address' }
      );
    } catch {
      // Non-blocking if migration SQL hasn't been run yet
    }
  }

  function escapeIlikePattern(val: string): string {
    return val.replace(/[\\%_]/g, (m) => `\\${m}`);
  }

  async function findMailboxRecord(rawAddress: unknown): Promise<CustomMailboxRecord | null> {
    const addr = normalizeRecipientString(rawAddress);
    if (!addr) return null;

    const sb = getSupabaseServerClient();
    if (sb) {
      try {
        const { data, error } = await sb
          .from('mailboxes')
          .select('*')
          .ilike('address', escapeIlikePattern(addr))
          .limit(1)
          .maybeSingle();
        if (error) {
          recordAppError({
            source: 'supabase',
            code: error.code || 'MAILBOX_LOOKUP',
            message: `mailboxes lookup failed: ${error.message}`,
            detail: addr,
          });
        } else if (data) {
          const normalizedAddr = String(data.address).trim().toLowerCase();
          const rec: CustomMailboxRecord = {
            id: String(data.id),
            address: normalizedAddr,
            username: String(data.username).trim().toLowerCase(),
            domain: String(data.domain || CUSTOM_EMAIL_DOMAIN),
            displayName: data.display_name ? String(data.display_name) : undefined,
            accountMode: data.account_mode ? String(data.account_mode) : 'personal',
            ownerUserId: data.owner_user_id ? String(data.owner_user_id) : undefined,
            provider: 'veribox',
            token: String(data.token),
            passwordHash: String(data.password_hash),
            salt: String(data.salt),
            isDeleted: Boolean(data.is_deleted),
            createdAt: String(data.created_at || new Date().toISOString()),
          };
          mailboxRegistry.set(normalizedAddr, rec);
          markedCreatedAddresses.add(normalizedAddr);
          return rec;
        }
      } catch (err) {
        recordAppError({
          source: 'supabase',
          code: 'MAILBOX_LOOKUP_EX',
          message: err instanceof Error ? err.message : 'mailboxes lookup threw exception',
          detail: addr,
        });
      }
    }

    const mem = mailboxRegistry.get(addr) || null;
    if (mem) markedCreatedAddresses.add(addr);
    return mem;
  }

  async function saveMailboxRecord(
    record: CustomMailboxRecord,
    opts?: { isNew?: boolean; source?: 'generate' | 'create' }
  ): Promise<void> {
    const addr = record.address.trim().toLowerCase();
    const isNew = Boolean(opts?.isNew);
    if (isNew && (mailboxRegistry.has(addr) || markedCreatedAddresses.has(addr))) {
      const dupErr = new Error(`${addr} is already registered. Pick or generate a different username.`);
      (dupErr as Error & { statusCode?: number }).statusCode = 409;
      throw dupErr;
    }

    const rowPayload = {
      address: addr,
      id: record.id,
      username: record.username.trim().toLowerCase(),
      domain: record.domain,
      display_name: record.displayName || null,
      account_mode: record.accountMode || 'personal',
      owner_user_id: record.ownerUserId || null,
      password_hash: record.passwordHash,
      salt: record.salt,
      token: record.token,
      is_deleted: record.isDeleted,
      created_at: record.createdAt,
    };

    const sb = getSupabaseServerClient();
    if (sb) {
      if (isNew) {
        const { error } = await sb.from('mailboxes').insert(rowPayload);
        if (error) {
          if (error.code === '23505') {
            markedCreatedAddresses.add(addr);
            const dupErr = new Error(`${addr} is already registered.`);
            (dupErr as Error & { statusCode?: number }).statusCode = 409;
            throw dupErr;
          }
          recordAppError({
            source: 'supabase',
            code: error.code || 'MAILBOX_INSERT',
            message: `Failed saving mailbox to Supabase (${error.code || 'DB'}): ${error.message}`,
            detail: addr,
          });
          const dbErr = new Error(
            `Supabase mailboxes save error (${error.code || 'DB'}): ${error.message}`
          );
          (dbErr as Error & { statusCode?: number }).statusCode = 502;
          throw dbErr;
        }
      } else {
        const { error } = await sb
          .from('mailboxes')
          .upsert(rowPayload, { onConflict: 'address' });
        if (error) {
          recordAppError({
            source: 'supabase',
            code: error.code || 'MAILBOX_UPSERT',
            message: `Failed updating mailbox in Supabase (${error.code || 'DB'}): ${error.message}`,
            detail: addr,
          });
        }
      }
    }

    mailboxRegistry.set(addr, { ...record, address: addr });
    markedCreatedAddresses.add(addr);

    await markEmailAsClaimed({
      address: addr,
      username: record.username,
      domain: record.domain,
      ownerUserId: record.ownerUserId,
      source: opts?.source || 'create',
      isDeleted: record.isDeleted,
      createdAt: record.createdAt,
    });
  }

  async function listMailboxesForOwner(ownerUserId: string): Promise<CustomMailboxRecord[]> {
    const cleanOwner = normalizeWalletUserId(ownerUserId);
    const sb = getSupabaseServerClient();
    if (sb && cleanOwner !== 'default-wallet') {
      try {
        const { data, error } = await sb
          .from('mailboxes')
          .select('*')
          .eq('owner_user_id', cleanOwner)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false })
          .limit(20);
        if (!error && Array.isArray(data)) {
          const list: CustomMailboxRecord[] = data.map((row) => ({
            id: String(row.id),
            address: String(row.address),
            username: String(row.username),
            domain: String(row.domain || CUSTOM_EMAIL_DOMAIN),
            displayName: row.display_name ? String(row.display_name) : undefined,
            accountMode: row.account_mode ? String(row.account_mode) : 'personal',
            ownerUserId: row.owner_user_id ? String(row.owner_user_id) : undefined,
            provider: 'veribox',
            token: String(row.token),
            passwordHash: String(row.password_hash),
            salt: String(row.salt),
            isDeleted: Boolean(row.is_deleted),
            createdAt: String(row.created_at || new Date().toISOString()),
          }));
          for (const rec of list) {
            mailboxRegistry.set(rec.address, rec);
          }
          return list;
        }
      } catch {
        // Fallback to memory
      }
    }

    return Array.from(mailboxRegistry.values())
      .filter((m) => m.ownerUserId === cleanOwner && !m.isDeleted)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 20);
  }

  interface InboxSaveResult {
    supabaseAttempted: boolean;
    supabaseStored: boolean;
    dbInsertMs: number;
    errorCode: string | null;
    errorMessage: string | null;
  }

  async function saveInboxMessage(
    msg: CustomInboxMessageRecord,
    opts?: { insertOnly?: boolean; mailboxId?: string | null }
  ): Promise<InboxSaveResult> {
    const cleanStr = (v: string) => v.replace(/\u0000/g, '');
    const sanitizedMsg: CustomInboxMessageRecord = {
      ...msg,
      fromName: cleanStr(msg.fromName),
      fromAddress: cleanStr(msg.fromAddress),
      subject: cleanStr(msg.subject),
      text: cleanStr(msg.text),
      html: cleanStr(msg.html),
    };
    const recipient = normalizeRecipientString(sanitizedMsg.recipientAddress);
    if (!recipient) {
      return {
        supabaseAttempted: false,
        supabaseStored: false,
        dbInsertMs: 0,
        errorCode: 'MISSING_RECIPIENT',
        errorMessage: 'Recipient email address is required.',
      };
    }
    const existing = mailboxMessagesMap.get(recipient) || [];
    const next = [sanitizedMsg, ...existing.filter((m) => m.id !== sanitizedMsg.id)].slice(0, 100);
    mailboxMessagesMap.set(recipient, next);

    let supabaseAttempted = false;
    let supabaseStored = false;
    let dbInsertMs = 0;
    let errorCode: string | null = null;
    let errorMessage: string | null = null;

    const sb = getSupabaseServerClient();
    if (sb) {
      supabaseAttempted = true;
      const dbStart = performance.now();
      try {
        const baseRow: Record<string, unknown> = {
          id: sanitizedMsg.id,
          recipient_address: recipient,
          from_name: sanitizedMsg.fromName,
          from_address: sanitizedMsg.fromAddress,
          subject: sanitizedMsg.subject,
          body_text: sanitizedMsg.text,
          body_html: sanitizedMsg.html,
          otp: sanitizedMsg.otp,
          seen: sanitizedMsg.seen,
          created_at: sanitizedMsg.createdAt,
        };
        if (mailboxIdColumnAvailable && opts && 'mailboxId' in opts) {
          baseRow.mailbox_id = opts.mailboxId ?? null;
        }
        let { error } = opts?.insertOnly
          ? await sb.from('mailbox_messages').insert(baseRow)
          : await sb.from('mailbox_messages').upsert(baseRow, { onConflict: 'id' });

        if (
          error &&
          error.code === 'PGRST204' &&
          'mailbox_id' in baseRow
        ) {
          mailboxIdColumnAvailable = false;
          delete baseRow.mailbox_id;
          const retry = opts?.insertOnly
            ? await sb.from('mailbox_messages').insert(baseRow)
            : await sb.from('mailbox_messages').upsert(baseRow, { onConflict: 'id' });
          error = retry.error;
        }

        if (error) {
          errorCode = error.code || null;
          errorMessage = error.message || 'Supabase mailbox_messages insert error';
          console.warn('[VeriBox Mail] Supabase mailbox_messages insert warning:', error.message);
        } else {
          supabaseStored = true;
        }
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : 'Supabase insert exception';
      } finally {
        dbInsertMs = Math.max(0, Math.round(performance.now() - dbStart));
      }
    } else {
      errorMessage = 'Supabase client not configured on backend';
    }

    emailEvents.emit(`inbound:${recipient}`, sanitizedMsg);
    return { supabaseAttempted, supabaseStored, dbInsertMs, errorCode, errorMessage };
  }

  interface InboxListResult {
    rows: CustomInboxMessageRecord[];
    supabaseError: string | null;
    supabaseCode: string | null;
    supabaseStatus: number | null;
  }

  async function listInboxMessagesWithStatus(
    recipientAddress: unknown,
    mailboxId?: string | null
  ): Promise<InboxListResult> {
    const recipient = normalizeRecipientString(recipientAddress);
    if (!recipient) {
      return {
        rows: [],
        supabaseError: 'Recipient email address is required.',
        supabaseCode: 'MISSING_RECIPIENT',
        supabaseStatus: 400,
      };
    }
    const sb = getSupabaseServerClient();
    if (sb) {
      try {
        let resolvedMailboxId = mailboxId || null;
        if (!resolvedMailboxId && mailboxIdColumnAvailable) {
          const rec = mailboxRegistry.get(recipient) || (await findMailboxRecord(recipient));
          resolvedMailboxId = rec?.id || null;
        }

        const escapedRecipient = escapeIlikePattern(recipient);
        let query = sb
          .from('mailbox_messages')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (resolvedMailboxId && mailboxIdColumnAvailable) {
          const safeMailboxId = resolvedMailboxId.replace(/[^a-zA-Z0-9_-]/g, '');
          query = query.or(
            `recipient_address.ilike."${escapedRecipient}",mailbox_id.eq."${safeMailboxId}"`
          );
        } else {
          query = query.ilike('recipient_address', escapedRecipient);
        }

        let { data, error, status } = await query;

        if (error && error.code === '42703' && mailboxIdColumnAvailable) {
          mailboxIdColumnAvailable = false;
          const retry = await sb
            .from('mailbox_messages')
            .select('*')
            .ilike('recipient_address', escapedRecipient)
            .order('created_at', { ascending: false })
            .limit(50);
          data = retry.data;
          error = retry.error;
          status = retry.status;
        }

        if (!error && Array.isArray(data)) {
          const rows: CustomInboxMessageRecord[] = data.map((row) => ({
            id: String(row.id),
            recipientAddress: String(row.recipient_address || recipient).trim().toLowerCase(),
            fromName: String(row.from_name || row.from_address || 'Unknown sender'),
            fromAddress: String(row.from_address || ''),
            subject: String(row.subject || '(No subject)'),
            text: String(row.body_text || ''),
            html: String(row.body_html || ''),
            otp: row.otp ? String(row.otp) : null,
            seen: Boolean(row.seen),
            createdAt: String(row.created_at || new Date().toISOString()),
          }));
          mailboxMessagesMap.set(recipient, rows);
          return { rows, supabaseError: null, supabaseCode: null, supabaseStatus: status || 200 };
        }
        if (error) {
          return {
            rows: mailboxMessagesMap.get(recipient) || [],
            supabaseError: error.message || 'Supabase query failed',
            supabaseCode: error.code || null,
            supabaseStatus: typeof status === 'number' && status >= 400 ? status : 502,
          };
        }
      } catch (err) {
        return {
          rows: mailboxMessagesMap.get(recipient) || [],
          supabaseError: err instanceof Error ? err.message : 'Supabase connection error',
          supabaseCode: 'NETWORK_ERROR',
          supabaseStatus: 502,
        };
      }
    }

    return {
      rows: mailboxMessagesMap.get(recipient) || [],
      supabaseError: null,
      supabaseCode: null,
      supabaseStatus: null,
    };
  }

  async function listInboxMessages(recipientAddress: unknown): Promise<CustomInboxMessageRecord[]> {
    const res = await listInboxMessagesWithStatus(recipientAddress);
    return res.rows;
  }

  async function findInboxMessage(
    recipientAddress: unknown,
    messageId: string
  ): Promise<CustomInboxMessageRecord | null> {
    const recipient = normalizeRecipientString(recipientAddress);
    if (!recipient) return null;
    const sb = getSupabaseServerClient();
    if (sb) {
      try {
        const { data, error } = await sb
          .from('mailbox_messages')
          .select('*')
          .eq('id', messageId)
          .ilike('recipient_address', recipient)
          .maybeSingle();
        if (!error && data) {
          await sb
            .from('mailbox_messages')
            .update({ seen: true })
            .eq('id', messageId)
            .ilike('recipient_address', recipient);

          return {
            id: String(data.id),
            recipientAddress: recipient,
            fromName: String(data.from_name || data.from_address || 'Unknown sender'),
            fromAddress: String(data.from_address || ''),
            subject: String(data.subject || '(No subject)'),
            text: String(data.body_text || ''),
            html: String(data.body_html || ''),
            otp: data.otp ? String(data.otp) : null,
            seen: true,
            createdAt: String(data.created_at || new Date().toISOString()),
          };
        }
      } catch {
        // Fallback to memory
      }
    }

    const memList = mailboxMessagesMap.get(recipient) || [];
    const found = memList.find((m) => m.id === messageId) || null;
    if (found) found.seen = true;
    return found;
  }

  async function deleteInboxMessageById(recipientAddress: unknown, messageId: string): Promise<boolean> {
    const recipient = normalizeRecipientString(recipientAddress);
    if (!recipient) return false;
    const memList = mailboxMessagesMap.get(recipient) || [];
    mailboxMessagesMap.set(
      recipient,
      memList.filter((m) => m.id !== messageId)
    );

    const sb = getSupabaseServerClient();
    if (sb) {
      try {
        await sb
          .from('mailbox_messages')
          .delete()
          .eq('id', messageId)
          .ilike('recipient_address', recipient);
      } catch {
        // Ignore if table not applied
      }
    }
    return true;
  }

  app.get('/api/email/domains', (_req, res) => {
    res.json({
      domain: CUSTOM_EMAIL_DOMAIN,
      domains: [CUSTOM_EMAIL_DOMAIN],
      providers: [
        { id: 'veribox', name: `VeriBox Custom Domain (@${CUSTOM_EMAIL_DOMAIN})` },
      ],
    });
  });

  app.get('/api/email/suggestions', async (req, res) => {
    const first = String(req.query.firstName || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 14);
    const second = String(req.query.lastName || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 14);

    const realisticFirsts = [
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
    ];
    const realisticLasts = [
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
    ];

    let firstFinal = first;
    let secondFinal = second;
    if (!firstFinal || firstFinal === 'user' || firstFinal === 'veribox' || firstFinal.length < 2) {
      firstFinal = realisticFirsts[Math.floor(Math.random() * realisticFirsts.length)];
      if (!secondFinal || secondFinal === 'mail') {
        secondFinal = realisticLasts[Math.floor(Math.random() * realisticLasts.length)];
      }
    }
    if (!secondFinal || secondFinal === 'mail') {
      secondFinal = realisticLasts[Math.floor(Math.random() * realisticLasts.length)];
    }

    const yr = String(Math.floor(88 + Math.random() * 14));
    const seedCandidates = [
      `${firstFinal}.${secondFinal}`,
      `${firstFinal}${secondFinal}`,
      `${firstFinal}.${secondFinal}${yr}`,
      `${firstFinal.slice(0, 1)}.${secondFinal}`,
      `${firstFinal}${secondFinal}${yr}`,
      `${firstFinal.slice(0, 1)}${secondFinal}${Math.floor(12 + Math.random() * 87)}`,
      `${secondFinal}.${firstFinal}`,
    ];

    const available: Array<{
      id: string;
      address: string;
      username: string;
      domain: string;
      provider: 'veribox';
      providerLabel: string;
    }> = [];
    const seen = new Set<string>();

    for (const rawCand of seedCandidates) {
      let username = normalizeCustomEmailUsername(rawCand);
      if (!isValidCustomEmailUsername(username) || seen.has(username)) continue;

      if (await isEmailAddressClaimed(`${username}@${CUSTOM_EMAIL_DOMAIN}`)) {
        let allocated: string | null = null;
        for (let step = 0; step < 5; step++) {
          const suffix =
            step === 0
              ? String(Math.floor(10 + Math.random() * 89))
              : String(Math.floor(100 + Math.random() * 8999));
          const numbered = normalizeCustomEmailUsername(`${username.slice(0, 24)}${suffix}`);
          if (
            isValidCustomEmailUsername(numbered) &&
            !seen.has(numbered) &&
            !(await isEmailAddressClaimed(`${numbered}@${CUSTOM_EMAIL_DOMAIN}`))
          ) {
            allocated = numbered;
            break;
          }
        }
        if (!allocated) continue;
        username = allocated;
      }

      seen.add(username);
      available.push({
        id: `opt-${available.length + 1}`,
        address: `${username}@${CUSTOM_EMAIL_DOMAIN}`,
        username,
        domain: CUSTOM_EMAIL_DOMAIN,
        provider: 'veribox',
        providerLabel: `@${CUSTOM_EMAIL_DOMAIN}`,
      });
      if (available.length >= 4) break;
    }

    res.json({ domain: CUSTOM_EMAIL_DOMAIN, options: available });
  });

  app.post('/api/email/check-availability', async (req, res) => {
    const rawInput = typeof req.body?.username === 'string'
      ? req.body.username
      : typeof req.body?.address === 'string'
        ? req.body.address
        : '';
    const username = normalizeCustomEmailUsername(rawInput);

    if (!isValidCustomEmailUsername(username)) {
      res.status(400).json({
        available: false,
        username,
        address: username ? `${username}@${CUSTOM_EMAIL_DOMAIN}` : '',
        error: 'Username must be 3–30 characters using letters, numbers, dots, underscores, or hyphens.',
      });
      return;
    }

    const address = `${username}@${CUSTOM_EMAIL_DOMAIN}`;
    const claimed = await isEmailAddressClaimed(address);
    let suggestedAlternative: string | undefined;
    if (claimed) {
      const altUser = await allocateUniqueCustomUsername(username);
      suggestedAlternative = `${altUser}@${CUSTOM_EMAIL_DOMAIN}`;
    }

    res.json({
      available: !claimed,
      alreadyCreated: claimed,
      suggestedAlternative,
      username,
      address,
      domain: CUSTOM_EMAIL_DOMAIN,
      error: claimed
        ? `${address} was already created and cannot be reused. Try ${suggestedAlternative} or pick another username.`
        : undefined,
    });
  });

  async function createCustomDomainMailbox(params: {
    usernameInput?: string;
    addressInput?: string;
    password?: string;
    displayName?: string;
    accountMode?: string;
    ownerUserId?: string;
    source?: 'generate' | 'create';
  }) {
    const rawUser = params.usernameInput || params.addressInput || '';
    const username = normalizeCustomEmailUsername(rawUser);
    if (!isValidCustomEmailUsername(username)) {
      throw new Error(
        `Invalid username. Use 3–30 characters (letters, numbers, dots, underscores, or hyphens) for @${CUSTOM_EMAIL_DOMAIN}.`
      );
    }

    const cleanPassword = (params.password || '').trim();
    if (cleanPassword.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    const address = `${username}@${CUSTOM_EMAIL_DOMAIN}`;
    const alreadyClaimed = await isEmailAddressClaimed(address);
    if (alreadyClaimed) {
      const err = new Error(
        `${address} has already been created before (active or deleted) and cannot be reused.`
      );
      (err as Error & { statusCode?: number }).statusCode = 409;
      throw err;
    }

    const { salt, hash } = hashEmailPassword(cleanPassword);
    const token = createSignedMailboxToken(address);
    const id = `vbox_${crypto.randomBytes(8).toString('hex')}`;
    const createdAt = new Date().toISOString();

    const record: CustomMailboxRecord = {
      id,
      address,
      username,
      domain: CUSTOM_EMAIL_DOMAIN,
      displayName: params.displayName?.trim() || undefined,
      accountMode: params.accountMode || 'personal',
      ownerUserId: params.ownerUserId ? normalizeWalletUserId(params.ownerUserId) : undefined,
      provider: 'veribox',
      token,
      passwordHash: hash,
      salt,
      isDeleted: false,
      createdAt,
    };

    await saveMailboxRecord(record, { isNew: true, source: params.source || 'create' });

    return {
      id: record.id,
      address: record.address,
      password: cleanPassword,
      token: record.token,
      provider: 'veribox' as const,
      domain: record.domain,
      createdAt: record.createdAt,
      accountMode: record.accountMode,
      displayName: record.displayName,
    };
  }

  async function allocateUniqueCustomUsername(baseRaw?: string): Promise<string> {
    const firstNames = [
      'daniel', 'samuel', 'david', 'chinedu', 'tunde', 'michael', 'joseph', 'victor',
      'emeka', 'ibrahim', 'joshua', 'caleb', 'peter', 'isaac', 'nathan', 'kevin',
      'amara', 'grace', 'sarah', 'zainab', 'chiamaka', 'faith', 'esther', 'rachel',
      'hannah', 'naomi', 'amina', 'blessing', 'rebecca', 'olivia', 'claire', 'deborah',
    ];
    const lastNames = [
      'okafor', 'adeyemi', 'bello', 'mensah', 'nwosu', 'balogun', 'eze', 'cole',
      'adams', 'johnson', 'okoro', 'suleiman', 'lawal', 'williams', 'brooks', 'morgan',
      'carter', 'hassan', 'akintola', 'olamide', 'bennett', 'reid', 'foster', 'wright',
    ];

    if (baseRaw && baseRaw.trim()) {
      const base = normalizeCustomEmailUsername(baseRaw).slice(0, 24);
      if (isValidCustomEmailUsername(base)) {
        if (!(await isEmailAddressClaimed(`${base}@${CUSTOM_EMAIL_DOMAIN}`))) {
          return base;
        }
        // Automatically append numbers if base already exists (even if deleted)
        for (let attempt = 0; attempt < 16; attempt++) {
          const num =
            attempt < 4
              ? Math.floor(10 + Math.random() * 89)
              : attempt < 10
                ? Math.floor(100 + Math.random() * 8999)
                : Math.floor(10000 + Math.random() * 89999);
          const candidate = normalizeCustomEmailUsername(`${base.slice(0, 23)}${num}`);
          if (
            isValidCustomEmailUsername(candidate) &&
            !(await isEmailAddressClaimed(`${candidate}@${CUSTOM_EMAIL_DOMAIN}`))
          ) {
            return candidate;
          }
        }
      }
    }

    for (let attempt = 0; attempt < 18; attempt++) {
      const first = firstNames[Math.floor(Math.random() * firstNames.length)];
      const last = lastNames[Math.floor(Math.random() * lastNames.length)];
      const num =
        attempt < 10
          ? Math.floor(12 + Math.random() * 987)
          : Math.floor(1000 + Math.random() * 89999);
      const sep = attempt % 3 === 0 ? '.' : attempt % 3 === 1 ? '' : '_';
      const candidate = normalizeCustomEmailUsername(`${first}${sep}${last}${num}`);
      if (!isValidCustomEmailUsername(candidate)) continue;
      if (!(await isEmailAddressClaimed(`${candidate}@${CUSTOM_EMAIL_DOMAIN}`))) {
        return candidate;
      }
    }

    const fallbackFirst = firstNames[Math.floor(Math.random() * firstNames.length)];
    const fallbackLast = lastNames[Math.floor(Math.random() * lastNames.length)];
    const uniqSuffix = `${Date.now().toString(36).slice(-3)}${crypto.randomBytes(2).toString('hex')}`;
    return normalizeCustomEmailUsername(`${fallbackFirst}.${fallbackLast}${uniqSuffix}`);
  }

  app.post('/api/email/create-selected', async (req, res) => {
    try {
      const caller = await assertCallerNotModerated(req, res);
      if (!caller) return;
      const acct = await createCustomDomainMailbox({
        usernameInput: typeof req.body?.username === 'string' ? req.body.username : undefined,
        addressInput: typeof req.body?.address === 'string' ? req.body.address : undefined,
        password: typeof req.body?.password === 'string' ? req.body.password : undefined,
        displayName: typeof req.body?.displayName === 'string' ? req.body.displayName : undefined,
        accountMode: typeof req.body?.accountMode === 'string' ? req.body.accountMode : 'personal',
        ownerUserId: typeof req.body?.userId === 'string' ? req.body.userId : undefined,
        source: 'create',
      });
      res.json({ ...acct, ownerUnlimited: caller.ownerUnlimited });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 400;
      res.status(status).json({
        error: err instanceof Error ? err.message : `Could not create @${CUSTOM_EMAIL_DOMAIN} mailbox`,
      });
    }
  });

  app.post('/api/email/generate', async (req, res) => {
    try {
      const caller = await assertCallerNotModerated(req, res);
      if (!caller) return;
      const requestedUsername =
        typeof req.body?.username === 'string' && req.body.username.trim()
          ? req.body.username
          : undefined;
      const generatedPassword =
        typeof req.body?.password === 'string' && req.body.password.trim().length >= 6
          ? req.body.password.trim()
          : `VB#${crypto.randomBytes(5).toString('hex')}`;

      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 6; attempt++) {
        const candidateUsername = await allocateUniqueCustomUsername(
          attempt === 0 ? requestedUsername : requestedUsername || undefined
        );
        try {
          const acct = await createCustomDomainMailbox({
            usernameInput: candidateUsername,
            password: generatedPassword,
            displayName: typeof req.body?.displayName === 'string' ? req.body.displayName : undefined,
            accountMode: typeof req.body?.accountMode === 'string' ? req.body.accountMode : 'personal',
            ownerUserId: typeof req.body?.userId === 'string' ? req.body.userId : undefined,
            source: 'generate',
          });
          res.json({ ...acct, ownerUnlimited: caller.ownerUnlimited });
          return;
        } catch (err) {
          lastErr = err;
          if ((err as { statusCode?: number }).statusCode !== 409) {
            throw err;
          }
        }
      }

      throw lastErr || new Error(`Could not allocate unique @${CUSTOM_EMAIL_DOMAIN} address`);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 400;
      res.status(status).json({
        error: err instanceof Error ? err.message : `Could not generate @${CUSTOM_EMAIL_DOMAIN} email`,
      });
    }
  });

  app.post('/api/email/create', async (req, res) => {
    try {
      const caller = await assertCallerNotModerated(req, res);
      if (!caller) return;
      const ownerUnlimited = caller.ownerUnlimited;
      const hasCustomInput =
        (typeof req.body?.username === 'string' && req.body.username.trim().length > 0) ||
        (typeof req.body?.address === 'string' && req.body.address.trim().length > 0);
      const usernameInput = hasCustomInput
        ? typeof req.body?.username === 'string'
          ? req.body.username
          : undefined
        : await allocateUniqueCustomUsername();
      const addressInput =
        typeof req.body?.address === 'string' && req.body.address.trim()
          ? req.body.address
          : undefined;
      const password =
        typeof req.body?.password === 'string' && req.body.password.trim().length >= 6
          ? req.body.password.trim()
          : !hasCustomInput
            ? `VB#${crypto.randomBytes(5).toString('hex')}`
            : undefined;

      const acct = await createCustomDomainMailbox({
        usernameInput,
        addressInput,
        password,
        displayName: typeof req.body?.displayName === 'string' ? req.body.displayName : undefined,
        accountMode: typeof req.body?.accountMode === 'string' ? req.body.accountMode : 'personal',
        ownerUserId: typeof req.body?.userId === 'string' ? req.body.userId : undefined,
        source: hasCustomInput ? 'create' : 'generate',
      });
      res.json({ ...acct, ownerUnlimited });
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode || 400;
      res.status(status).json({
        error: err instanceof Error ? err.message : `Could not create @${CUSTOM_EMAIL_DOMAIN} mailbox`,
      });
    }
  });

  app.post('/api/email/check-exists', async (req, res) => {
    const rawAddress = typeof req.body?.address === 'string' ? req.body.address.trim().toLowerCase() : '';
    if (!rawAddress || !rawAddress.includes('@')) {
      res.status(400).json({ exists: false, error: `Enter a valid @${CUSTOM_EMAIL_DOMAIN} address` });
      return;
    }

    const domainPart = rawAddress.split('@')[1] || '';
    if (domainPart !== CUSTOM_EMAIL_DOMAIN) {
      res.json({
        exists: false,
        error: `Only @${CUSTOM_EMAIL_DOMAIN} addresses are managed here.`,
      });
      return;
    }

    const reg = await findMailboxRecord(rawAddress);
    if (reg) {
      res.json({ exists: true, provider: 'veribox', domain: CUSTOM_EMAIL_DOMAIN });
      return;
    }

    res.json({ exists: false });
  });

  app.post('/api/email/login', async (req, res) => {
    try {
      const address = typeof req.body?.address === 'string' ? req.body.address.trim().toLowerCase() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
      if (!address || !password) {
        res.status(400).json({ error: 'Email address and password are required' });
        return;
      }

      const reg = await findMailboxRecord(address);
      if (!reg) {
        res.status(404).json({ error: `No @${CUSTOM_EMAIL_DOMAIN} mailbox found for this address` });
        return;
      }

      if (!verifyEmailPassword(password, reg)) {
        res.status(401).json({ error: 'Incorrect password for this email address' });
        return;
      }

      const callerUserId =
        typeof req.body?.userId === 'string' && req.body.userId.trim()
          ? normalizeWalletUserId(req.body.userId)
          : undefined;
      if (reg.isDeleted || (callerUserId && callerUserId !== 'default-wallet' && !reg.ownerUserId)) {
        reg.isDeleted = false;
        if (callerUserId && callerUserId !== 'default-wallet' && !reg.ownerUserId) {
          reg.ownerUserId = callerUserId;
        }
        await saveMailboxRecord(reg);
      }

      res.json({
        token: reg.token,
        id: reg.id,
        address: reg.address,
        provider: 'veribox',
        domain: reg.domain,
        createdAt: reg.createdAt,
        accountMode: reg.accountMode,
        displayName: reg.displayName,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Login failed' });
    }
  });

  app.get('/api/email/list', async (req, res) => {
    const modCheck = await assertCallerNotModerated(req, res);
    if (!modCheck) return;
    const requestedUserId = normalizeWalletUserId(req.query.userId);
    const verifiedUser = await getVerifiedSupabaseBearerUser(req);
    const effectiveUserId = verifiedUser ? verifiedUser.id : requestedUserId;
    if (verifiedUser && requestedUserId !== 'default-wallet' && verifiedUser.id !== requestedUserId) {
      res.status(403).json({ error: 'Forbidden: Cannot list another user mailbox collection' });
      return;
    }
    if (!effectiveUserId || effectiveUserId === 'default-wallet') {
      res.json({ accounts: [] });
      return;
    }
    const list = await listMailboxesForOwner(effectiveUserId);
    res.json({
      accounts: list.map((m) => ({
        id: m.id,
        address: m.address,
        password: '',
        token: m.token,
        provider: 'veribox' as const,
        domain: m.domain,
        createdAt: m.createdAt,
        accountMode: m.accountMode || 'personal',
        displayName: m.displayName,
      })),
    });
  });

  app.post('/api/email/manage/delete', async (req, res) => {
    const address = typeof req.body?.address === 'string' ? req.body.address.trim().toLowerCase() : '';
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!address) {
      res.status(400).json({ error: 'Missing email address' });
      return;
    }
    const rec = await findMailboxRecord(address);
    if (rec && (!token || safeSecretsEqual(token, rec.token))) {
      rec.isDeleted = true;
      await saveMailboxRecord(rec);
    } else if (address.endsWith(`@${CUSTOM_EMAIL_DOMAIN}`)) {
      await markEmailAsClaimed({
        address,
        username: address.split('@')[0],
        domain: CUSTOM_EMAIL_DOMAIN,
        source: 'create',
        isDeleted: true,
      });
    }
    res.json({ deleted: true, recoverable: true, permanentlyMarked: true });
  });

  function safeSecretsEqual(provided: string, expected: string): boolean {
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  async function handleInboundEmailWebhook(req: express.Request, res: express.Response) {
    const reqPerfStart = performance.now();
    const attemptId = `att_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
    const receivedAtIso = new Date().toISOString();

    const firstHeader = (val: string | string[] | undefined): string =>
      Array.isArray(val) ? String(val[0] || '') : String(val || '');

    const isReadinessProbe = firstHeader(req.headers['x-veribox-readiness-probe']) === '1';

    // 1. Read untouched raw body and Svix headers for Resend webhook verification
    const rawBuf = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.isBuffer((req as express.Request & { rawBody?: Buffer }).rawBody)
        ? (req as express.Request & { rawBody?: Buffer }).rawBody!
        : null;
    const rawPayload = rawBuf
      ? rawBuf.toString('utf8')
      : typeof req.body === 'string'
        ? req.body
        : req.body && typeof req.body === 'object'
          ? JSON.stringify(req.body)
          : '';

    const svixId = firstHeader(req.headers['svix-id']).trim();
    const svixTimestamp = firstHeader(req.headers['svix-timestamp']).trim();
    const svixSignature = firstHeader(req.headers['svix-signature']).trim();
    const resendWebhookSecret = getResendWebhookSecret();

    if (!resendWebhookSecret || !svixId || !svixTimestamp || !svixSignature || !rawPayload) {
      const totalMs = Math.max(0, Math.round(performance.now() - reqPerfStart));
      const detail = !resendWebhookSecret
        ? 'HTTP 400: RESEND_WEBHOOK_SECRET is not configured on backend server'
        : !svixId || !svixTimestamp || !svixSignature
          ? 'HTTP 400: Missing required Resend Svix headers (svix-id, svix-timestamp, svix-signature)'
          : 'HTTP 400: Empty webhook payload body';

      if (isReadinessProbe) {
        res.status(400).json({ ok: false, error: detail, readinessProbeRejectedUnsigned: true });
        return;
      }

      const logRes = await Promise.race([
        recordInboundAttempt({
          id: attemptId,
          timestamp: receivedAtIso,
          status: 'rejected_secret',
          httpStatus: 400,
          recipients: [],
          rawToPreview: '',
          fromAddress: '',
          subject: '(Missing Resend signature headers)',
          otpDetected: null,
          supabaseStored: false,
          error: detail,
          totalMs,
          dbInsertMs: 0,
          parseMs: totalMs,
          matchedMailbox: false,
          matchedMailboxId: null,
          receivedAt: receivedAtIso,
          storedAt: null,
          deliveryGapMs: null,
        }),
        new Promise<RecordInboundLogResult>((r) =>
          setTimeout(
            () =>
              r({
                logged: false,
                logId: null,
                logError: 'Webhook log insert timed out after 1500ms',
              }),
            1500
          )
        ),
      ]);
      res.status(400).json({
        ok: false,
        error: detail,
        webhookLogged: logRes.logged,
        webhookLogId: logRes.logId,
        webhookLogError: logRes.logError,
      });
      return;
    }

    const resendApiKey = getResendApiKey();
    const resend = new Resend(resendApiKey || undefined);

    let verifiedEvent: ReturnType<Resend['webhooks']['verify']>;
    try {
      verifiedEvent = resend.webhooks.verify({
        payload: rawPayload,
        headers: {
          id: svixId,
          timestamp: svixTimestamp,
          signature: svixSignature,
        },
        webhookSecret: resendWebhookSecret,
      });
    } catch (err) {
      const totalMs = Math.max(0, Math.round(performance.now() - reqPerfStart));
      const errMsg = `HTTP 400: Invalid Resend webhook signature (${err instanceof Error ? err.message : 'verification failed'})`;
      console.warn(`[VeriBox Inbound] Invalid Resend signature totalMs=${totalMs}:`, errMsg);
      const logRes = await Promise.race([
        recordInboundAttempt({
          id: attemptId,
          timestamp: receivedAtIso,
          status: 'rejected_secret',
          httpStatus: 400,
          recipients: [],
          rawToPreview: '',
          fromAddress: '',
          subject: '(Invalid Resend webhook signature)',
          otpDetected: null,
          supabaseStored: false,
          error: errMsg,
          totalMs,
          dbInsertMs: 0,
          parseMs: totalMs,
          matchedMailbox: false,
          matchedMailboxId: null,
          receivedAt: receivedAtIso,
          storedAt: null,
          deliveryGapMs: null,
        }),
        new Promise<RecordInboundLogResult>((r) =>
          setTimeout(
            () =>
              r({
                logged: false,
                logId: null,
                logError: 'Webhook log insert timed out after 1500ms',
              }),
            1500
          )
        ),
      ]);
      res.status(400).json({
        ok: false,
        error: errMsg,
        webhookLogged: logRes.logged,
        webhookLogId: logRes.logId,
        webhookLogError: logRes.logError,
      });
      return;
    }

    // Acknowledge non-inbound Resend webhook events cleanly with HTTP 200
    if (verifiedEvent.type !== 'email.received') {
      res.status(200).json({
        ok: true,
        ignored: true,
        eventType: verifiedEvent.type,
      });
      return;
    }

    const eventData = verifiedEvent.data;
    const eventRecipientsPreview = extractTargetRecipients([
      eventData.to,
      eventData.received_for,
      eventData.bcc,
      eventData.cc,
    ])
      .slice(0, 3)
      .join(', ');

    if (!resendApiKey) {
      const totalMs = Math.max(0, Math.round(performance.now() - reqPerfStart));
      const errMsg = 'HTTP 500: RESEND_API_KEY is missing on backend server (required for resend.emails.receiving.get)';
      const logRes = await recordInboundAttempt({
        id: attemptId,
        timestamp: receivedAtIso,
        status: 'db_error',
        httpStatus: 500,
        recipients: eventRecipientsPreview ? [eventRecipientsPreview] : [],
        rawToPreview: eventRecipientsPreview,
        fromAddress: String(eventData.from || '').slice(0, 120),
        subject: String(eventData.subject || '(No subject)').slice(0, 150),
        otpDetected: null,
        supabaseStored: false,
        error: errMsg,
        totalMs,
        dbInsertMs: 0,
        parseMs: totalMs,
        matchedMailbox: false,
        matchedMailboxId: null,
        receivedAt: eventData.created_at || receivedAtIso,
        storedAt: null,
        deliveryGapMs: null,
      });
      res.status(500).json({
        ok: false,
        error: errMsg,
        webhookLogged: logRes.logged,
        webhookLogId: logRes.logId,
        webhookLogError: logRes.logError,
      });
      return;
    }

    // 2. Fetch full email body (HTML + plain text) from Resend Receiving API using event.data.email_id
    const { data: receivedEmail, error: resendFetchError } = await resend.emails.receiving.get(
      eventData.email_id
    );

    if (resendFetchError || !receivedEmail) {
      const totalMs = Math.max(0, Math.round(performance.now() - reqPerfStart));
      const errMsg = `Resend emails.receiving.get(${eventData.email_id}) failed: ${resendFetchError?.message || 'Empty response'}`;
      const logRes = await recordInboundAttempt({
        id: attemptId,
        timestamp: receivedAtIso,
        status: 'invalid_payload',
        httpStatus: 502,
        recipients: eventRecipientsPreview ? [eventRecipientsPreview] : [],
        rawToPreview: eventRecipientsPreview,
        fromAddress: String(eventData.from || '').slice(0, 120),
        subject: String(eventData.subject || '(No subject)').slice(0, 150),
        otpDetected: null,
        supabaseStored: false,
        error: errMsg,
        totalMs,
        dbInsertMs: 0,
        parseMs: totalMs,
        matchedMailbox: false,
        matchedMailboxId: null,
        receivedAt: eventData.created_at || receivedAtIso,
        storedAt: null,
        deliveryGapMs: null,
      });
      res.status(502).json({
        ok: false,
        error: errMsg,
        webhookLogged: logRes.logged,
        webhookLogId: logRes.logId,
        webhookLogError: logRes.logError,
      });
      return;
    }

    // 3. Extract recipient @veribox.name.ng address(es), sender, subject, HTML/text body, and OTP
    const headersObj =
      receivedEmail.headers && typeof receivedEmail.headers === 'object'
        ? receivedEmail.headers
        : undefined;
    const candidateRecipients = [
      receivedEmail.to,
      receivedEmail.received_for,
      eventData.to,
      eventData.received_for,
      receivedEmail.bcc,
      receivedEmail.cc,
      eventData.bcc,
      eventData.cc,
      headersObj?.['delivered-to'],
      headersObj?.['x-original-to'],
      headersObj?.to,
    ];

    const allExtractedTos = extractTargetRecipients(candidateRecipients).map((addr) =>
      addr.trim().toLowerCase()
    );
    const rawToPreview = allExtractedTos.slice(0, 3).join(', ') || eventRecipientsPreview;
    const rawRecipients = allExtractedTos.filter((addr) =>
      addr.endsWith(`@${CUSTOM_EMAIL_DOMAIN}`)
    );

    if (rawRecipients.length === 0) {
      const totalMs = Math.max(0, Math.round(performance.now() - reqPerfStart));
      const msg = `No recipient matching @${CUSTOM_EMAIL_DOMAIN} found in Resend payload (received to: ${rawToPreview || 'empty'})`;
      console.warn(`[VeriBox Inbound] Dropped Resend email totalMs=${totalMs}:`, msg);
      const logRes = await recordInboundAttempt({
        id: attemptId,
        timestamp: receivedAtIso,
        status: 'unmatched_recipient',
        httpStatus: 400,
        recipients: [],
        rawToPreview,
        fromAddress: String(receivedEmail.from || eventData.from || '').slice(0, 120),
        subject: String(receivedEmail.subject || eventData.subject || '(No subject)').slice(0, 150),
        otpDetected: null,
        supabaseStored: false,
        error: `HTTP 400: ${msg}`,
        totalMs,
        dbInsertMs: 0,
        parseMs: totalMs,
        matchedMailbox: false,
        matchedMailboxId: null,
        receivedAt: receivedEmail.created_at || eventData.created_at || receivedAtIso,
        storedAt: null,
        deliveryGapMs: null,
      });
      res.status(400).json({
        ok: false,
        error: msg,
        totalMs,
        webhookLogged: logRes.logged,
        webhookLogId: logRes.logId,
        webhookLogError: logRes.logError,
      });
      return;
    }

    // Resolve +tag subaddresses (e.g. user+site@veribox.name.ng -> user@veribox.name.ng)
    const recipients: string[] = [];
    const seenRec = new Set<string>();
    for (const addr of rawRecipients) {
      let target = addr.trim().toLowerCase();
      const plusIdx = target.indexOf('+');
      if (plusIdx > 0) {
        const exactInMem = mailboxRegistry.has(target);
        if (!exactInMem) {
          const exact = await findMailboxRecord(target);
          if (!exact) {
            const base = `${target.slice(0, plusIdx)}@${CUSTOM_EMAIL_DOMAIN}`;
            const baseRec = mailboxRegistry.get(base) || (await findMailboxRecord(base));
            if (baseRec) target = baseRec.address;
          }
        }
      }
      if (!seenRec.has(target)) {
        seenRec.add(target);
        recipients.push(target);
      }
    }

    const sb = getSupabaseServerClient();
    const primaryRecipient = recipients[0];
    let matchedMailboxId: string | null = null;
    const lookupMatchedMailbox = async (): Promise<string | null> => {
      for (const rec of recipients) {
        const mem = mailboxRegistry.get(rec);
        if (mem) return mem.id;
      }
      if (!sb) return null;
      try {
        const { data } = await sb
          .from('mailboxes')
          .select('id')
          .ilike('address', escapeIlikePattern(primaryRecipient))
          .limit(1)
          .maybeSingle();
        return data?.id ? String(data.id) : null;
      } catch {
        return null;
      }
    };

    matchedMailboxId = await lookupMatchedMailbox();
    const matchedMailbox = Boolean(matchedMailboxId);

    const rawFrom = decodeMimeWord(String(receivedEmail.from || eventData.from || `sender@${CUSTOM_EMAIL_DOMAIN}`));
    const parsedFrom = extractAddressFromHeader(rawFrom);
    const fromName = parsedFrom.name;
    const subject = decodeMimeWord(
      String(receivedEmail.subject || eventData.subject || '(No subject)')
    ).slice(0, 300);

    const html = String(receivedEmail.html || '').trim().slice(0, 140000);
    const plainTextRaw = String(receivedEmail.text || '').trim();
    const plainText = (plainTextRaw || (html ? stripTags(html) : '')).trim().slice(0, 40000);

    // Extract OTP from subject + plain text first; fallback to stripped HTML
    let otp = extractOtpCode(`${subject}\n${plainText.slice(0, 16000)}`);
    if (!otp && html) {
      otp = extractOtpCode(stripTags(html));
    }

    const upstreamRawTime = String(receivedEmail.created_at || eventData.created_at || '');
    const upstreamMs = upstreamRawTime ? Date.parse(upstreamRawTime) : NaN;
    const effectiveReceivedAt =
      Number.isFinite(upstreamMs) && upstreamMs <= Date.now() + 60000
        ? new Date(upstreamMs).toISOString()
        : receivedAtIso;

    const parseMs = Math.max(0, Math.round(performance.now() - reqPerfStart));
    const createdAt = new Date().toISOString();

    const insertResults = await Promise.all(
      recipients.map((recipient) => {
        const msgId = `in_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
        return saveInboxMessage(
          {
            id: msgId,
            recipientAddress: recipient,
            fromName,
            fromAddress: parsedFrom.address,
            subject,
            text: plainText,
            html,
            otp,
            seen: false,
            createdAt,
          },
          { insertOnly: true, mailboxId: matchedMailboxId }
        ).then((saveRes) => ({ msgId, recipient, saveRes }));
      })
    );

    const storedAtIso = new Date().toISOString();
    const storedIds: string[] = [];
    let allSupabaseStored = true;
    let firstDbError: string | null = null;
    let dbInsertMs = 0;

    for (const item of insertResults) {
      storedIds.push(item.msgId);
      dbInsertMs = Math.max(dbInsertMs, item.saveRes.dbInsertMs);
      if (item.saveRes.supabaseAttempted && !item.saveRes.supabaseStored) {
        allSupabaseStored = false;
        if (!firstDbError) {
          firstDbError = item.saveRes.errorCode
            ? `Supabase insert error (${item.saveRes.errorCode}): ${item.saveRes.errorMessage || 'Insert error'}`
            : `Supabase insert error: ${item.saveRes.errorMessage}`;
        }
      }
    }

    const totalMs = Math.max(0, Math.round(performance.now() - reqPerfStart));
    const deliveryGapMs = Math.max(
      0,
      Date.parse(storedAtIso) - Date.parse(effectiveReceivedAt)
    );

    const logNote = firstDbError
      ? firstDbError
      : !matchedMailboxId
        ? `No matching row in mailboxes for ${primaryRecipient} (saved to inbox & webhook logs)`
        : null;

    const logRes = await Promise.race([
      recordInboundAttempt({
        id: attemptId,
        timestamp: storedAtIso,
        status: firstDbError ? 'db_error' : 'stored',
        httpStatus: firstDbError ? 500 : 200,
        recipients,
        rawToPreview,
        fromAddress: parsedFrom.address,
        subject,
        otpDetected: otp,
        supabaseStored: allSupabaseStored && !firstDbError,
        error: logNote,
        totalMs,
        dbInsertMs,
        parseMs,
        matchedMailbox,
        matchedMailboxId,
        receivedAt: effectiveReceivedAt,
        storedAt: storedAtIso,
        deliveryGapMs,
      }),
      new Promise<RecordInboundLogResult>((r) =>
        setTimeout(
          () =>
            r({
              logged: false,
              logId: null,
              logError: 'Webhook log insert timed out after 2500ms',
            }),
          2500
        )
      ),
    ]);

    if (firstDbError) {
      res.status(500).json({
        ok: false,
        error: firstDbError,
        savedMessageId: storedIds[0] || null,
        matchedMailboxId,
        recipient: primaryRecipient,
        otp,
        webhookLogged: logRes.logged,
        webhookLogId: logRes.logId,
        webhookLogError: logRes.logError,
      });
      return;
    }

    res.status(200).json({
      ok: true,
      received: true,
      emailId: eventData.email_id,
      savedMessageId: storedIds[0] || null,
      matchedMailboxId,
      recipient: primaryRecipient,
      otp,
      webhookLogged: logRes.logged,
      webhookLogId: logRes.logId,
      webhookLogError: logRes.logError,
      domain: CUSTOM_EMAIL_DOMAIN,
      recipients,
      messageIds: storedIds,
      otpDetected: otp,
      matchedMailbox,
      totalMs,
      dbInsertMs,
      parseMs,
      receivedAt: effectiveReceivedAt,
      storedAt: storedAtIso,
      deliveryGapMs,
      supabaseStored: allSupabaseStored,
      supabaseError: null,
    });
  }

  app.post('/api/email/inbound', (req, res) => {
    void handleInboundEmailWebhook(req, res);
  });

  async function verifyMailboxRequest(
    req: express.Request
  ): Promise<{ address: string; mailboxId: string | null } | null> {
    const auth = req.headers.authorization || '';
    const token = (
      auth.replace(/^Bearer\s+/i, '').trim() ||
      (typeof req.query.token === 'string' ? req.query.token.trim() : '')
    );
    const emailAddress = normalizeRecipientString(
      req.headers['x-email-address'] ?? req.query.address
    );

    if (!emailAddress || !emailAddress.endsWith(`@${CUSTOM_EMAIL_DOMAIN}`)) {
      return null;
    }

    const [reg, verifiedUser] = await Promise.all([
      findMailboxRecord(emailAddress),
      getVerifiedSupabaseBearerUser(req),
    ]);

    if (reg) {
      const tokenMatches = Boolean(
        token && (safeSecretsEqual(token, reg.token) || verifySignedMailboxToken(emailAddress, token))
      );
      const ownerMatches = Boolean(
        verifiedUser &&
          ((reg.ownerUserId && verifiedUser.id === reg.ownerUserId) ||
            verifiedUser.email === OWNER_ADMIN_EMAIL)
      );
      if (!tokenMatches && !ownerMatches) {
        return null;
      }
      return { address: reg.address, mailboxId: reg.id };
    }

    if (verifiedUser && verifiedUser.email === OWNER_ADMIN_EMAIL) {
      return { address: emailAddress, mailboxId: null };
    }

    if (!token) return null;
    return verifySignedMailboxToken(emailAddress, token)
      ? { address: emailAddress, mailboxId: null }
      : null;
  }

  app.get('/api/email/stream', async (req, res) => {
    const verified = await verifyMailboxRequest(req);
    if (!verified) {
      res.status(401).json({ error: 'Unauthorized mailbox stream' });
      return;
    }
    const verifiedAddress = verified.address;

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let closed = false;
    req.on('close', () => {
      closed = true;
    });

    const formatRows = (rows: CustomInboxMessageRecord[]) =>
      rows.map((m) => ({
        id: m.id,
        fromName: m.fromName,
        fromAddress: m.fromAddress,
        subject: m.subject,
        intro: m.text.slice(0, 180),
        seen: m.seen,
        createdAt: m.createdAt,
        otp: m.otp,
      }));

    try {
      const initial = await listInboxMessages(verifiedAddress);
      if (!closed) {
        res.write(`data: ${JSON.stringify({ type: 'snapshot', messages: formatRows(initial) })}\n\n`);
      }
    } catch {
      // Non-blocking initial snapshot
    }

    const onInbound = (msg: CustomInboxMessageRecord) => {
      if (closed) return;
      void (async () => {
        try {
          const rows = await listInboxMessages(verifiedAddress);
          if (!closed) {
            res.write(
              `data: ${JSON.stringify({
                type: 'new_email',
                messageId: msg.id,
                otp: msg.otp,
                messages: formatRows(rows),
              })}\n\n`
            );
          }
        } catch {
          // Ignore write errors on closed stream
        }
      })();
    };

    const eventKey = `inbound:${verifiedAddress}`;
    emailEvents.on(eventKey, onInbound);

    const keepAliveId = setInterval(() => {
      if (!closed) res.write(': ping\n\n');
    }, 15000);

    req.on('close', () => {
      emailEvents.off(eventKey, onInbound);
      clearInterval(keepAliveId);
    });
  });

  app.get('/api/email/messages', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const modCheck = await assertCallerNotModerated(req, res);
    if (!modCheck) return;

    const requestedEmail = normalizeRecipientString(
      req.headers['x-email-address'] ?? req.query.address
    );
    if (!requestedEmail) {
      res.status(400).json({
        error: `Recipient email address is required (e.g. yourname@${CUSTOM_EMAIL_DOMAIN}).`,
        code: 'MISSING_RECIPIENT',
        messages: [],
      });
      return;
    }

    const verified = await verifyMailboxRequest(req);
    if (!verified) {
      res.status(401).json({ error: `Sign in or create an @${CUSTOM_EMAIL_DOMAIN} mailbox to read emails.` });
      return;
    }

    try {
      const { rows, supabaseError, supabaseCode, supabaseStatus } =
        await listInboxMessagesWithStatus(verified.address, verified.mailboxId);
      if (supabaseError && rows.length === 0) {
        const httpStatus =
          supabaseCode === '42501'
            ? 403
            : supabaseCode === 'PGRST205'
              ? 503
              : supabaseStatus || 502;
        res.status(httpStatus).json({
          error: `Inbox query error (${supabaseCode || `HTTP ${httpStatus}`}): ${supabaseError}`,
          code: supabaseCode,
          messages: [],
        });
        return;
      }
      const messages = rows.map((m) => ({
        id: m.id,
        fromName: m.fromName,
        fromAddress: m.fromAddress,
        subject: m.subject,
        intro: m.text.slice(0, 180),
        seen: m.seen,
        createdAt: m.createdAt,
        otp: m.otp,
      }));
      res.json({
        messages,
        warning: supabaseError ? `${supabaseCode || 'DB_WARN'}: ${supabaseError}` : undefined,
      });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Failed to fetch emails',
        messages: [],
      });
    }
  });

  // Outbound email rate limiter (protects @veribox.name.ng domain reputation from spam abuse)
  const outboundRateBuckets = new Map<string, number[]>();
  function checkOutboundRateLimit(key: string, maxPerHour: number): { allowed: boolean; retryAfterSec: number } {
    const now = Date.now();
    const windowMs = 60 * 60 * 1000;
    const prev = outboundRateBuckets.get(key) || [];
    const recent = prev.filter((ts) => now - ts < windowMs);
    if (recent.length >= maxPerHour) {
      const oldest = recent[0] || now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      outboundRateBuckets.set(key, recent);
      return { allowed: false, retryAfterSec };
    }
    recent.push(now);
    outboundRateBuckets.set(key, recent);
    return { allowed: true, retryAfterSec: 0 };
  }

  function formatSenderDisplayName(address: string, explicitName?: string): string {
    const raw = (explicitName || '').replace(/[\r\n<>"]/g, ' ').replace(/\s+/g, ' ').trim();
    if (raw.length >= 2) return raw.slice(0, 60);
    const localPart = address.split('@')[0] || 'VeriBox';
    const tokens = localPart
      .replace(/[0-9]+$/g, '')
      .split(/[._-]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2);
    if (tokens.length === 0) return 'VeriBox Mail';
    return tokens
      .slice(0, 3)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ')
      .slice(0, 60);
  }

  app.post('/api/email/send', async (req, res) => {
    const callerMod = await assertCallerNotModerated(req, res);
    if (!callerMod) return;

    const rawFromInput = normalizeRecipientString(
      req.headers['x-email-address'] ?? req.body?.fromAddress
    );
    if (!rawFromInput || !rawFromInput.endsWith(`@${CUSTOM_EMAIL_DOMAIN}`)) {
      res.status(400).json({
        error: `Sender address must be a valid @${CUSTOM_EMAIL_DOMAIN} mailbox.`,
      });
      return;
    }

    // Ensure verifyMailboxRequest checks against the resolved fromAddress
    if (!req.headers['x-email-address']) {
      req.headers['x-email-address'] = rawFromInput;
    }

    const verifiedMailbox = await verifyMailboxRequest(req);
    const verifiedSupabaseUser = await getVerifiedSupabaseBearerUser(req);
    const isOwner = Boolean(
      callerMod.ownerUnlimited ||
        (verifiedSupabaseUser && verifiedSupabaseUser.email === OWNER_ADMIN_EMAIL)
    );

    if (!verifiedMailbox && !isOwner) {
      res.status(401).json({
        error: `Sign in or select an active @${CUSTOM_EMAIL_DOMAIN} mailbox to send emails.`,
      });
      return;
    }

    const fromAddress = verifiedMailbox?.address || rawFromInput;
    if (!fromAddress.endsWith(`@${CUSTOM_EMAIL_DOMAIN}`)) {
      res.status(403).json({
        error: `Outbound sending is restricted to @${CUSTOM_EMAIL_DOMAIN} addresses.`,
      });
      return;
    }

    const toAddress = String(req.body?.toAddress || '')
      .replace(/[\r\n<>]/g, '')
      .trim()
      .toLowerCase();
    const emailPattern = /^[^\s@<>,"']+@[^\s@<>,"']+\.[^\s@<>,"']{2,}$/;
    if (!toAddress || toAddress.length > 160 || !emailPattern.test(toAddress)) {
      res.status(400).json({
        error: 'Enter a valid recipient email address (e.g. name@gmail.com).',
      });
      return;
    }
    if (toAddress === INBOUND_AUDIT_ADDRESS) {
      res.status(400).json({ error: 'Cannot send email to internal system audit address.' });
      return;
    }

    const subject = String(req.body?.subject || '')
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .slice(0, 160);
    if (!subject) {
      res.status(400).json({ error: 'Email subject is required.' });
      return;
    }

    const textBody = String(req.body?.text || '')
      .replace(/\r\n/g, '\n')
      .trim()
      .slice(0, 8000);
    if (!textBody) {
      res.status(400).json({ error: 'Email message body cannot be empty.' });
      return;
    }

    const forwardedFor =
      typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0].trim()
        : '';
    const callerIp = forwardedFor || req.ip || req.socket?.remoteAddress || 'unknown';
    const rateKey = isOwner
      ? `owner:${fromAddress}`
      : `user:${verifiedSupabaseUser?.id || callerIp}:${fromAddress}`;
    const rateResult = checkOutboundRateLimit(rateKey, isOwner ? 30 : 8);
    if (!rateResult.allowed) {
      res.status(429).json({
        error: `Hourly send limit reached to protect @${CUSTOM_EMAIL_DOMAIN} domain reputation. Try again in ${Math.ceil(rateResult.retryAfterSec / 60)} min.`,
      });
      return;
    }

    const resendApiKey = getResendApiKey();
    if (!resendApiKey) {
      res.status(503).json({
        error: 'RESEND_API_KEY is not configured on the backend server.',
      });
      return;
    }

    const mailboxRec = await findMailboxRecord(fromAddress);
    const senderName = formatSenderDisplayName(
      fromAddress,
      typeof req.body?.fromName === 'string'
        ? req.body.fromName
        : mailboxRec?.displayName
    );
    const formattedFrom = senderName ? `${senderName} <${fromAddress}>` : fromAddress;

    try {
      const resend = new Resend(resendApiKey);
      const sendResult = await resend.emails.send({
        from: formattedFrom,
        to: [toAddress],
        replyTo: fromAddress,
        subject,
        text: textBody,
      });

      if (sendResult.error || !sendResult.data?.id) {
        const errMsg = sendResult.error?.message || 'Resend rejected the outbound email request.';
        const errCode = sendResult.error?.name || 'RESEND_SEND_ERR';
        recordAppError({
          source: 'webhook',
          severity: 'error',
          code: errCode,
          message: `Outbound email failed (${fromAddress} -> ${toAddress}): ${errMsg}`,
          detail: sendResult.error?.statusCode ? `HTTP ${sendResult.error.statusCode}` : null,
        });
        const statusCode =
          typeof sendResult.error?.statusCode === 'number' && sendResult.error.statusCode >= 400
            ? sendResult.error.statusCode
            : 502;
        res.status(statusCode).json({
          ok: false,
          error: errMsg,
          code: errCode,
        });
        return;
      }

      res.json({
        ok: true,
        id: sendResult.data.id,
        from: fromAddress,
        fromName: senderName,
        to: toAddress,
        subject,
        sentAt: new Date().toISOString(),
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Failed to send email via Resend';
      recordAppError({
        source: 'webhook',
        severity: 'error',
        code: 'RESEND_SEND_EX',
        message: `Outbound email exception (${fromAddress} -> ${toAddress}): ${errMsg}`,
      });
      res.status(502).json({ ok: false, error: errMsg });
    }
  });

  // ==========================================
  // Owner-Only Admin Diagnostics (preciousddkid@gmail.com)
  // ==========================================
  async function verifyOwnerAdminRequest(
    req: express.Request,
    res: express.Response
  ): Promise<{ email: string; supabase: SupabaseClient } | null> {
    const authHeader = req.headers.authorization || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) {
      res.status(401).json({ error: 'Missing Supabase session token' });
      return null;
    }

    const sb = getSupabaseServerClient();
    if (!sb) {
      res.status(503).json({ error: 'Supabase is not configured on the backend server' });
      return null;
    }

    try {
      const { data, error } = await sb.auth.getUser(jwt);
      if (error || !data?.user) {
        res.status(401).json({ error: error?.message || 'Invalid or expired Supabase session token' });
        return null;
      }
      const userEmail = (data.user.email || '').trim().toLowerCase();
      if (userEmail !== OWNER_ADMIN_EMAIL) {
        res.status(403).json({ error: 'Forbidden: Owner admin access required' });
        return null;
      }
      return { email: userEmail, supabase: sb };
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to verify admin token' });
      return null;
    }
  }

  async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function checkDomainDns(domain: string) {
    const checkedAt = new Date().toISOString();
    const resolveDoh = async (name: string, type: string): Promise<string[]> => {
      const res = await fetch(
        `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`,
        { signal: AbortSignal.timeout(2500) }
      );
      if (!res.ok) {
        throw new Error(`DNS lookup HTTP ${res.status} for ${name} (${type})`);
      }
      const data = (await res.json()) as { Answer?: Array<{ data?: string }> };
      return Array.isArray(data.Answer)
        ? data.Answer.map((a) => String(a.data || '').replace(/^"|"$/g, '').trim()).filter(Boolean)
        : [];
    };

    const recommendedSpf = `v=spf1 include:send.${domain} ~all`;

    try {
      const nativeResult = await withTimeout(
        Promise.all([
          dns.resolveMx(domain).then((recs) =>
            recs
              .slice()
              .sort((a, b) => a.priority - b.priority)
              .map((r) => `${r.priority} ${r.exchange.replace(/\.$/, '')}`)
          ),
          dns.resolveTxt(domain).then((chunks) => chunks.map((c) => c.join(''))),
          dns
            .resolveTxt(`send.${domain}`)
            .then((chunks) => chunks.map((c) => c.join('')))
            .catch(() => [] as string[]),
          dns
            .resolveTxt(`_dmarc.${domain}`)
            .then((chunks) => chunks.map((c) => c.join('')))
            .catch(() => [] as string[]),
          dns
            .resolveTxt(`resend._domainkey.${domain}`)
            .then((chunks) => chunks.map((c) => c.join('')))
            .catch(() => [] as string[]),
          dns.resolve4(domain).catch(() => [] as string[]),
        ]),
        2500,
        'Native DNS lookup'
      ).catch(() => null);

      const [mxRecords, txtRecords, sendTxtRecords, dmarcRecords, dkimRecords, aRecords] =
        nativeResult && (nativeResult[0].length > 0 || nativeResult[1].length > 0)
          ? nativeResult
          : await Promise.all([
              resolveDoh(domain, 'MX'),
              resolveDoh(domain, 'TXT'),
              resolveDoh(`send.${domain}`, 'TXT').catch(() => [] as string[]),
              resolveDoh(`_dmarc.${domain}`, 'TXT').catch(() => [] as string[]),
              resolveDoh(`resend._domainkey.${domain}`, 'TXT').catch(() => [] as string[]),
              resolveDoh(domain, 'A').catch(() => [] as string[]),
            ]);

      const spfRecord = txtRecords.find((t) => /v=spf1/i.test(t)) || null;
      const sendSpfRecord = sendTxtRecords.find((t) => /v=spf1/i.test(t)) || null;
      const dmarcRecord = dmarcRecords.find((t) => /v=DMARC1/i.test(t)) || null;
      const dkimRecord =
        dkimRecords.find((t) => /p=[a-zA-Z0-9+/=]+/i.test(t) || /v=DKIM1/i.test(t)) ||
        dkimRecords[0] ||
        null;
      const mxOk =
        mxRecords.some((m) => /inbound-smtp|amazonaws\.com|resend|rmta\.net|forge/i.test(m)) ||
        mxRecords.length > 0;
      const spfOk = Boolean(spfRecord);
      const sendSpfOk = Boolean(sendSpfRecord);
      const dkimOk = Boolean(dkimRecord);
      const dmarcOk = Boolean(dmarcRecord);

      let trustScore = 0;
      if (mxOk) trustScore += 30;
      if (spfOk) trustScore += 35;
      else if (sendSpfOk) trustScore += 10;
      if (dkimOk) trustScore += 20;
      if (dmarcOk) trustScore += 15;

      const antiBanNotice = !spfOk
        ? `CRITICAL FOR FACEBOOK, INSTAGRAM & GMAIL: Root SPF TXT is missing on ${domain} (@). In Cloudflare Dashboard, do NOT open Email -> Email Routing (that requires Cloudflare MX and conflicts with Resend MX). Instead go to Cloudflare -> DNS -> Records -> Add record -> Type: TXT, Name: @, Content: "${recommendedSpf}".`
        : 'Domain DNS authentication is configured (MX, Root SPF, DKIM, DMARC). For best trust with Facebook & Gmail, ensure DMARC uses p=quarantine and maintain steady two-way email activity.';

      return {
        checkedAt,
        domain,
        mxOk,
        mxRecords,
        spfOk,
        spfRecord,
        sendSpfOk,
        sendSpfRecord,
        dmarcOk,
        dmarcRecord,
        dkimOk,
        dkimRecord,
        aRecords,
        error: null,
        recommendedSpfRecord: recommendedSpf,
        trustScore,
        antiBanNotice,
      };
    } catch (err) {
      return {
        checkedAt,
        domain,
        mxOk: false,
        mxRecords: [],
        spfOk: false,
        spfRecord: null,
        sendSpfOk: false,
        sendSpfRecord: null,
        dmarcOk: false,
        dmarcRecord: null,
        dkimOk: false,
        dkimRecord: null,
        aRecords: [],
        error: err instanceof Error ? err.message : 'DNS resolution check failed',
        recommendedSpfRecord: recommendedSpf,
        trustScore: 30,
        antiBanNotice: `Could not complete DNS check. Add TXT @ "${recommendedSpf}" inside Cloudflare -> DNS -> Records (not Email Routing).`,
      };
    }
  }

  async function checkLiveDomainConnection(domain: string) {
    const checkedAt = new Date().toISOString();
    const url = `https://${domain}/api/email/domains`;
    const startedAt = Date.now();
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(2500),
      });
      const latencyMs = Date.now() - startedAt;
      const payload = (await res.json().catch(() => null)) as { domain?: string; error?: string } | null;
      const domainMatched =
        typeof payload?.domain === 'string' &&
        payload.domain.trim().toLowerCase() === domain.toLowerCase();
      if (!res.ok) {
        return {
          checkedAt,
          url,
          ok: false,
          httpStatus: res.status,
          latencyMs,
          domainMatched,
          error: payload?.error
            ? `HTTP ${res.status}: ${payload.error}`
            : `Live domain ${domain} returned HTTP ${res.status}`,
        };
      }
      if (!domainMatched) {
        return {
          checkedAt,
          url,
          ok: false,
          httpStatus: res.status,
          latencyMs,
          domainMatched: false,
          error: `Domain mismatch on ${url}: expected "${domain}", got "${payload?.domain || 'none'}"`,
        };
      }
      return {
        checkedAt,
        url,
        ok: true,
        httpStatus: res.status,
        latencyMs,
        domainMatched: true,
        error: null,
      };
    } catch (err) {
      return {
        checkedAt,
        url,
        ok: false,
        httpStatus: null,
        latencyMs: Date.now() - startedAt,
        domainMatched: false,
        error:
          err instanceof Error
            ? err.name === 'TimeoutError' || err.name === 'AbortError'
              ? `Live connection to https://${domain} timed out after 2500ms`
              : `Connection to https://${domain} failed: ${err.message}`
            : `Connection to https://${domain} failed`,
      };
    }
  }

  let cachedDnsProbe: { expiresAt: number; value: Awaited<ReturnType<typeof checkDomainDns>> } | null =
    null;
  let cachedLiveDomainProbe: {
    expiresAt: number;
    value: Awaited<ReturnType<typeof checkLiveDomainConnection>>;
  } | null = null;

  app.get('/api/admin/diagnostics', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const verified = await verifyOwnerAdminRequest(req, res);
    if (!verified) return;
    const sb = verified.supabase;
    const forceProbe = req.query.force === '1' || req.query.force === 'true';

    const resendApiKeyConfigured = Boolean(getResendApiKey());
    const resendWebhookSecretConfigured = Boolean(getResendWebhookSecret());
    const inboundSecretConfigured = resendApiKeyConfigured && resendWebhookSecretConfigured;
    const sbConfig = getSupabaseServerConfig();
    const supabaseConfigured = Boolean(sbConfig.url);
    let supabaseProjectHost: string | null = null;
    if (sbConfig.url) {
      try {
        supabaseProjectHost = new URL(sbConfig.url).host;
      } catch {
        supabaseProjectHost = sbConfig.url.replace(/^https?:\/\//i, '').split('/')[0] || null;
      }
    }
    const serviceRoleConfigured = Boolean(
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim()
    );

    const probeTable = async (
      table:
        | 'mailboxes'
        | 'mailbox_messages'
        | 'inbound_webhook_logs'
        | 'wallets'
        | 'wallet_transactions'
        | 'app_error_logs'
        | 'created_email_registry'
        | 'user_moderation',
      columns: string,
      orderColumn: 'created_at' | 'received_at' | 'updated_at' = 'created_at'
    ) => {
      try {
        let query = sb
          .from(table)
          .select(columns, { count: 'exact' })
          .order(orderColumn, { ascending: false })
          .limit(30);
        if (table === 'mailbox_messages') {
          query = query.neq('recipient_address', INBOUND_AUDIT_ADDRESS);
        }
        const { data, error, status, count } = await query;
        return {
          ok: !error,
          httpStatus: typeof status === 'number' ? status : error ? 500 : 200,
          rowCount: typeof count === 'number' ? count : Array.isArray(data) ? data.length : null,
          errorCode: error?.code || null,
          errorMessage: error?.message || null,
          errorHint: error?.hint || null,
          rows: Array.isArray(data) ? data : [],
        };
      } catch (err) {
        return {
          ok: false,
          httpStatus: 500,
          rowCount: null,
          errorCode: 'EXCEPTION',
          errorMessage: err instanceof Error ? err.message : 'Table probe threw exception',
          errorHint: null,
          rows: [],
        };
      }
    };

    const fetchPersistedWebhookLogs = async (): Promise<InboundAttemptLog[]> => {
      const parsed: InboundAttemptLog[] = [];
      try {
        const { data, error } = await sb
          .from('inbound_webhook_logs')
          .select('*')
          .order('received_at', { ascending: false })
          .limit(30);
        if (!error && Array.isArray(data)) {
          for (const row of data) {
            const meta = (
              row.raw_meta && typeof row.raw_meta === 'object' ? row.raw_meta : {}
            ) as Record<string, unknown>;
            const toAddr = String(row.to_address || row.recipient || '');
            parsed.push({
              id: String(row.id),
              timestamp: String(row.received_at || row.created_at || new Date().toISOString()),
              status: String(row.status || 'stored') as InboundAttemptLog['status'],
              httpStatus: Number(row.http_status || 200),
              recipients: Array.isArray(meta.recipients)
                ? (meta.recipients as unknown[]).map((r) => String(r))
                : toAddr
                  ? [toAddr]
                  : [],
              rawToPreview: String(meta.rawToPreview || row.raw_to_preview || toAddr),
              fromAddress: String(row.from_address || ''),
              subject: String(row.subject || '(No subject)'),
              otpDetected: row.otp_code
                ? String(row.otp_code)
                : row.otp_detected
                  ? String(row.otp_detected)
                  : null,
              supabaseStored:
                typeof row.ok === 'boolean' ? row.ok : Boolean(row.supabase_stored),
              error: row.error_reason
                ? String(row.error_reason)
                : row.error_detail
                  ? String(row.error_detail)
                  : null,
              totalMs:
                typeof meta.totalMs === 'number'
                  ? meta.totalMs
                  : typeof row.total_ms === 'number'
                    ? row.total_ms
                    : null,
              dbInsertMs:
                typeof meta.dbInsertMs === 'number'
                  ? meta.dbInsertMs
                  : typeof row.db_insert_ms === 'number'
                    ? row.db_insert_ms
                    : null,
              parseMs:
                typeof meta.parseMs === 'number'
                  ? meta.parseMs
                  : typeof row.parse_ms === 'number'
                    ? row.parse_ms
                    : null,
              matchedMailbox:
                typeof meta.matchedMailbox === 'boolean'
                  ? meta.matchedMailbox
                  : Boolean(row.matched_mailbox_id || row.matched_mailbox),
              matchedMailboxId: row.matched_mailbox_id
                ? String(row.matched_mailbox_id)
                : typeof meta.matchedMailboxIdRaw === 'string'
                  ? meta.matchedMailboxIdRaw
                  : null,
              receivedAt: row.received_at ? String(row.received_at) : null,
              storedAt:
                typeof meta.storedAt === 'string'
                  ? meta.storedAt
                  : row.stored_at
                    ? String(row.stored_at)
                    : null,
              deliveryGapMs:
                typeof meta.deliveryGapMs === 'number'
                  ? meta.deliveryGapMs
                  : typeof row.delivery_gap_ms === 'number'
                    ? row.delivery_gap_ms
                    : null,
            });
          }
        }
      } catch {
        // Table may not exist yet
      }
      return parsed;
    };

    const fetchPersistedAppErrors = async (): Promise<AppErrorLogItem[]> => {
      try {
        const { data, error } = await sb
          .from('app_error_logs')
          .select('id, created_at, source, severity, code, message, detail')
          .order('created_at', { ascending: false })
          .limit(25);
        if (error || !Array.isArray(data)) return [];
        return data.map((row) => ({
          id: String(row.id),
          timestamp: String(row.created_at || new Date().toISOString()),
          source: (['supabase', 'webhook', 'wallet', 'routing', 'app'].includes(String(row.source))
            ? String(row.source)
            : 'app') as AppErrorLogItem['source'],
          severity: row.severity === 'warning' ? 'warning' : 'error',
          code: row.code ? String(row.code) : null,
          message: String(row.message || 'Unknown error'),
          detail: row.detail ? String(row.detail) : null,
        }));
      } catch {
        return [];
      }
    };

    const fetchLegacyAuditLogs = async (): Promise<InboundAttemptLog[]> => {
      try {
        const { data, error } = await sb
          .from('mailbox_messages')
          .select('id, body_text, created_at')
          .eq('recipient_address', INBOUND_AUDIT_ADDRESS)
          .order('created_at', { ascending: false })
          .limit(30);
        if (error || !Array.isArray(data)) return [];
        const parsed: InboundAttemptLog[] = [];
        for (const row of data) {
          try {
            const entry = JSON.parse(String(row.body_text || '{}')) as InboundAttemptLog;
            if (entry && entry.id && entry.status) parsed.push(entry);
          } catch {
            // Skip non-JSON row
          }
        }
        return parsed;
      } catch {
        return [];
      }
    };

    const nowMs = Date.now();
    const getDnsCheckCached = async () => {
      if (!forceProbe && cachedDnsProbe && cachedDnsProbe.expiresAt > nowMs) {
        return cachedDnsProbe.value;
      }
      const value = await checkDomainDns(CUSTOM_EMAIL_DOMAIN);
      cachedDnsProbe = { expiresAt: Date.now() + 25000, value };
      return value;
    };

    const getDomainConnectionCached = async () => {
      if (!forceProbe && cachedLiveDomainProbe && cachedLiveDomainProbe.expiresAt > nowMs) {
        return cachedLiveDomainProbe.value;
      }
      const value = await checkLiveDomainConnection(CUSTOM_EMAIL_DOMAIN);
      cachedLiveDomainProbe = { expiresAt: Date.now() + 25000, value };
      return value;
    };

    const [
      mailboxesProbe,
      messagesProbe,
      inboundLogsProbe,
      walletsProbe,
      walletTxProbe,
      appErrorLogsProbe,
      createdRegistryProbe,
      userModerationProbe,
      persistedWebhookLogs,
      persistedAppErrors,
      legacyAuditLogs,
      dnsCheck,
      domainConnection,
    ] = await Promise.all([
      probeTable('mailboxes', 'address, username, domain, account_mode, created_at, is_deleted'),
      probeTable(
        'mailbox_messages',
        'id, recipient_address, from_name, from_address, subject, otp, seen, created_at'
      ),
      probeTable(
        'inbound_webhook_logs',
        'id, received_at, http_status, status, ok',
        'received_at'
      ),
      probeTable('wallets', 'user_id, balance, updated_at', 'updated_at'),
      probeTable('wallet_transactions', 'reference, user_id, amount, status, created_at'),
      probeTable('app_error_logs', 'id, created_at, source, severity, code, message'),
      probeTable('created_email_registry', 'address, username, domain, is_deleted, created_at'),
      probeTable('user_moderation', 'user_id, email, status, updated_at', 'updated_at'),
      fetchPersistedWebhookLogs(),
      fetchPersistedAppErrors(),
      fetchLegacyAuditLogs(),
      getDnsCheckCached(),
      getDomainConnectionCached(),
    ]);

    const mergedAttemptsMap = new Map<string, InboundAttemptLog>();
    for (const item of [...persistedWebhookLogs, ...legacyAuditLogs, ...inboundAttemptLogs]) {
      if (item && item.id && !mergedAttemptsMap.has(item.id)) {
        mergedAttemptsMap.set(item.id, item);
      }
    }
    const mergedAttempts = Array.from(mergedAttemptsMap.values())
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
      .slice(0, 50);
    const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;
    const inboundTraffic24hCount = mergedAttempts.filter(
      (a) => Date.parse(a.timestamp) >= cutoff24h
    ).length;

    const connectionErrors: string[] = [];
    const recentErrors: AppErrorLogItem[] = [];
    const pushLiveError = (item: Omit<AppErrorLogItem, 'id' | 'timestamp'>) => {
      recentErrors.push({
        id: `live_${recentErrors.length}_${item.source}`,
        timestamp: new Date().toISOString(),
        ...item,
      });
    };

    if (!domainConnection.ok && domainConnection.error) {
      connectionErrors.push(domainConnection.error);
      pushLiveError({
        source: 'routing',
        severity: 'error',
        code: domainConnection.httpStatus ? `HTTP ${domainConnection.httpStatus}` : 'CONN_ERR',
        message: domainConnection.error,
        detail: domainConnection.url,
      });
    }
    if (dnsCheck.error) {
      const msg = `DNS lookup error (${CUSTOM_EMAIL_DOMAIN}): ${dnsCheck.error}`;
      connectionErrors.push(msg);
      pushLiveError({ source: 'routing', severity: 'error', code: 'DNS_ERR', message: msg, detail: null });
    } else {
      if (!dnsCheck.mxOk) {
        const msg = `Missing Resend Inbound MX records for ${CUSTOM_EMAIL_DOMAIN}`;
        connectionErrors.push(msg);
        pushLiveError({ source: 'routing', severity: 'warning', code: 'MX_MISSING', message: msg, detail: null });
      }
      if (!dnsCheck.spfOk) {
        const spfValue = `v=spf1 include:send.${CUSTOM_EMAIL_DOMAIN} ~all`;
        const msg = `Missing root SPF TXT record on ${CUSTOM_EMAIL_DOMAIN} (@). Meta & Gmail check root SPF. Do NOT enable Cloudflare Email Routing; go to Cloudflare -> DNS -> Records and add TXT @ "${spfValue}".`;
        connectionErrors.push(msg);
        pushLiveError({
          source: 'routing',
          severity: 'warning',
          code: 'SPF_MISSING',
          message: msg,
          detail: `Cloudflare -> DNS -> Records -> Add TXT record with Name: @, Content: "${spfValue}" (keep Resend MX active)`,
        });
      }
    }
    if (!resendApiKeyConfigured) {
      const msg = 'RESEND_API_KEY is not configured on backend server';
      connectionErrors.push(msg);
      pushLiveError({ source: 'app', severity: 'warning', code: 'ENV_MISSING', message: msg, detail: null });
    }
    if (!resendWebhookSecretConfigured) {
      const msg = 'RESEND_WEBHOOK_SECRET is not configured on backend server';
      connectionErrors.push(msg);
      pushLiveError({ source: 'app', severity: 'warning', code: 'ENV_MISSING', message: msg, detail: null });
    }
    if (!serviceRoleConfigured) {
      const msg = 'SUPABASE_SERVICE_ROLE_KEY is missing (backend may hit RLS blocks)';
      connectionErrors.push(msg);
      pushLiveError({ source: 'supabase', severity: 'error', code: 'RLS_KEY_MISSING', message: msg, detail: null });
    }
    for (const [label, probe] of [
      ['mailboxes', mailboxesProbe],
      ['mailbox_messages', messagesProbe],
      ['inbound_webhook_logs', inboundLogsProbe],
      ['wallets', walletsProbe],
      ['wallet_transactions', walletTxProbe],
      ['app_error_logs', appErrorLogsProbe],
      ['created_email_registry', createdRegistryProbe],
      ['user_moderation', userModerationProbe],
    ] as const) {
      if (!probe.ok) {
        const msg = `Supabase ${label} table error (${probe.errorCode || `HTTP ${probe.httpStatus}`}): ${probe.errorMessage || 'Query failed'}`;
        if (label === 'mailboxes' || label === 'mailbox_messages') {
          connectionErrors.push(msg);
        }
        pushLiveError({
          source: 'supabase',
          severity: 'error',
          code: probe.errorCode || `HTTP ${probe.httpStatus}`,
          message: msg,
          detail: probe.errorHint || null,
        });
      }
    }

    const recentFailedCutoff = Date.now() - 10 * 60 * 1000;
    const latestAttempt = mergedAttempts[0] || null;
    if (
      latestAttempt &&
      latestAttempt.status !== 'stored' &&
      Date.parse(latestAttempt.timestamp) >= recentFailedCutoff
    ) {
      connectionErrors.push(
        `Recent inbound webhook failure (${latestAttempt.status} · HTTP ${latestAttempt.httpStatus}): ${latestAttempt.error || latestAttempt.subject}`
      );
    }

    for (const att of mergedAttempts) {
      if (att.httpStatus >= 400 || att.status === 'db_error' || (!att.supabaseStored && att.error)) {
        recentErrors.push({
          id: `wh_${att.id}`,
          timestamp: att.timestamp,
          source: att.status === 'db_error' ? 'supabase' : 'webhook',
          severity: 'error',
          code: `HTTP ${att.httpStatus}`,
          message: att.error || `Inbound webhook ${att.status}`,
          detail: `To: ${att.recipients[0] || att.rawToPreview || '(none)'} · From: ${att.fromAddress || '(unknown)'}`,
        });
      }
    }

    const errorDedup = new Map<string, AppErrorLogItem>();
    for (const item of [...recentErrors, ...persistedAppErrors, ...appErrorLogs]) {
      const key = `${item.source}|${item.code || ''}|${item.message}|${item.timestamp.slice(0, 16)}`;
      if (!errorDedup.has(key)) {
        errorDedup.set(key, item);
      }
    }
    const unifiedRecentErrors = Array.from(errorDedup.values())
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
      .slice(0, 30);

    const latestMessagesFromDb = (
      messagesProbe.rows as unknown as Array<Record<string, unknown>>
    ).map((row) => ({
      id: String(row.id || ''),
      recipientAddress: String(row.recipient_address || ''),
      fromName: String(row.from_name || ''),
      fromAddress: String(row.from_address || ''),
      subject: String(row.subject || '(No subject)'),
      otp: row.otp ? String(row.otp) : null,
      seen: Boolean(row.seen),
      createdAt: String(row.created_at || ''),
    }));

    const memMessages = Array.from(mailboxMessagesMap.values())
      .flat()
      .filter((m) => m.recipientAddress !== INBOUND_AUDIT_ADDRESS)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 30)
      .map((m) => ({
        id: m.id,
        recipientAddress: m.recipientAddress,
        fromName: m.fromName,
        fromAddress: m.fromAddress,
        subject: m.subject,
        otp: m.otp,
        seen: m.seen,
        createdAt: m.createdAt,
      }));

    const latestMailboxesFromDb = (
      mailboxesProbe.rows as unknown as Array<Record<string, unknown>>
    ).map((row) => ({
      address: String(row.address || ''),
      username: String(row.username || ''),
      domain: String(row.domain || CUSTOM_EMAIL_DOMAIN),
      accountMode: String(row.account_mode || 'personal'),
      createdAt: String(row.created_at || ''),
      isDeleted: Boolean(row.is_deleted),
    }));

    const memMailboxes = Array.from(mailboxRegistry.values())
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 20)
      .map((m) => ({
        address: m.address,
        username: m.username,
        domain: m.domain,
        accountMode: m.accountMode || 'personal',
        createdAt: m.createdAt,
        isDeleted: m.isDeleted,
      }));

    const timedSamples = mergedAttempts.filter(
      (a) => typeof a.totalMs === 'number' && a.status === 'stored'
    );
    const latestTimed = timedSamples[0] || mergedAttempts.find((a) => typeof a.totalMs === 'number') || null;
    const avgTotalMs =
      timedSamples.length > 0
        ? Math.round(
            timedSamples.reduce((sum, a) => sum + (a.totalMs || 0), 0) / timedSamples.length
          )
        : null;
    const dbSamples = timedSamples.filter((a) => typeof a.dbInsertMs === 'number');
    const avgDbInsertMs =
      dbSamples.length > 0
        ? Math.round(
            dbSamples.reduce((sum, a) => sum + (a.dbInsertMs || 0), 0) / dbSamples.length
          )
        : null;

    res.json({
      checkedAt: new Date().toISOString(),
      ownerEmail: verified.email,
      publicWebhookUrl: `https://${CUSTOM_EMAIL_DOMAIN}/api/email/inbound`,
      supabaseProjectHost,
      environment: {
        emailDomain: CUSTOM_EMAIL_DOMAIN,
        inboundSecretConfigured,
        resendApiKeyConfigured,
        resendWebhookSecretConfigured,
        supabaseConfigured,
        supabaseServiceRoleConfigured: serviceRoleConfigured,
      },
      dnsCheck,
      domainConnection,
      connectionErrors,
      recentErrors: unifiedRecentErrors,
      inboundTraffic24hCount,
      timingSummary: {
        latestTotalMs: latestTimed?.totalMs ?? null,
        latestDbInsertMs: latestTimed?.dbInsertMs ?? null,
        latestParseMs: latestTimed?.parseMs ?? null,
        latestDeliveryGapMs: latestTimed?.deliveryGapMs ?? null,
        latestReceivedAt: latestTimed?.receivedAt ?? latestTimed?.timestamp ?? null,
        latestStoredAt: latestTimed?.storedAt ?? null,
        latestMatchedMailbox:
          typeof latestTimed?.matchedMailbox === 'boolean' ? latestTimed.matchedMailbox : null,
        avgTotalMs,
        avgDbInsertMs,
      },
      probes: {
        mailboxes: {
          ok: mailboxesProbe.ok,
          httpStatus: mailboxesProbe.httpStatus,
          rowCount: mailboxesProbe.rowCount,
          errorCode: mailboxesProbe.errorCode,
          errorMessage: mailboxesProbe.errorMessage,
          errorHint: mailboxesProbe.errorHint,
        },
        mailboxMessages: {
          ok: messagesProbe.ok,
          httpStatus: messagesProbe.httpStatus,
          rowCount: messagesProbe.rowCount,
          errorCode: messagesProbe.errorCode,
          errorMessage: messagesProbe.errorMessage,
          errorHint: messagesProbe.errorHint,
        },
        inboundWebhookLogs: {
          ok: inboundLogsProbe.ok,
          httpStatus: inboundLogsProbe.httpStatus,
          rowCount: inboundLogsProbe.rowCount,
          errorCode: inboundLogsProbe.errorCode,
          errorMessage: inboundLogsProbe.errorMessage,
          errorHint: inboundLogsProbe.errorHint,
        },
        wallets: {
          ok: walletsProbe.ok,
          httpStatus: walletsProbe.httpStatus,
          rowCount: walletsProbe.rowCount,
          errorCode: walletsProbe.errorCode,
          errorMessage: walletsProbe.errorMessage,
          errorHint: walletsProbe.errorHint,
        },
        walletTransactions: {
          ok: walletTxProbe.ok,
          httpStatus: walletTxProbe.httpStatus,
          rowCount: walletTxProbe.rowCount,
          errorCode: walletTxProbe.errorCode,
          errorMessage: walletTxProbe.errorMessage,
          errorHint: walletTxProbe.errorHint,
        },
        appErrorLogs: {
          ok: appErrorLogsProbe.ok,
          httpStatus: appErrorLogsProbe.httpStatus,
          rowCount: appErrorLogsProbe.rowCount,
          errorCode: appErrorLogsProbe.errorCode,
          errorMessage: appErrorLogsProbe.errorMessage,
          errorHint: appErrorLogsProbe.errorHint,
        },
        createdEmailRegistry: {
          ok: createdRegistryProbe.ok,
          httpStatus: createdRegistryProbe.httpStatus,
          rowCount: createdRegistryProbe.rowCount,
          errorCode: createdRegistryProbe.errorCode,
          errorMessage: createdRegistryProbe.errorMessage,
          errorHint: createdRegistryProbe.errorHint,
        },
        userModeration: {
          ok: userModerationProbe.ok,
          httpStatus: userModerationProbe.httpStatus,
          rowCount: userModerationProbe.rowCount,
          errorCode: userModerationProbe.errorCode,
          errorMessage: userModerationProbe.errorMessage,
          errorHint: userModerationProbe.errorHint,
        },
      },
      recentInboundAttempts: mergedAttempts,
      rawInboundLogs: mergedAttempts.slice(0, 20),
      latestMessages: latestMessagesFromDb.length > 0 ? latestMessagesFromDb : memMessages,
      latestMailboxes: latestMailboxesFromDb.length > 0 ? latestMailboxesFromDb : memMailboxes,
    });
  });

  app.post('/api/admin/diagnostics/clear-alerts', async (req, res) => {
    const verified = await verifyOwnerAdminRequest(req, res);
    if (!verified) return;

    inboundAttemptLogs.length = 0;
    appErrorLogs.length = 0;
    cachedDnsProbe = null;
    cachedLiveDomainProbe = null;
    try {
      await Promise.allSettled([
        verified.supabase
          .from('mailbox_messages')
          .delete()
          .eq('recipient_address', INBOUND_AUDIT_ADDRESS),
        verified.supabase
          .from('inbound_webhook_logs')
          .delete()
          .or('ok.eq.false,ok.is.null,http_status.gte.400'),
        verified.supabase
          .from('app_error_logs')
          .delete()
          .not('id', 'is', null),
      ]);
    } catch {
      // Non-blocking
    }
    res.json({ cleared: true });
  });

  app.get('/api/auth/moderation-status', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const evalResult = await evaluateCallerModeration(req);
    res.json({
      blocked: evalResult.blocked,
      status: evalResult.status,
      reason: evalResult.reason,
      strict: evalResult.strict,
      matchType: evalResult.matchType,
      ownerUnlimited: evalResult.ownerUnlimited,
    });
  });

  app.get('/api/admin/users', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const verified = await verifyOwnerAdminRequest(req, res);
    if (!verified) return;
    const sb = verified.supabase;

    try {
      await hydrateModerationFromDb(true);
      const [usersResult, walletsResult, mailboxesResult, moderationResult] = await Promise.all([
        sb.auth.admin.listUsers({ page: 1, perPage: 200 }),
        sb.from('wallets').select('user_id, balance'),
        sb.from('mailboxes').select('owner_user_id, is_deleted'),
        sb.from('user_moderation').select('user_id, email, status, reason, updated_by, updated_at'),
      ]);

      if (usersResult.error) {
        res.status(usersResult.error.status || 500).json({
          error: `Supabase auth.admin.listUsers failed: ${usersResult.error.message}`,
          users: [],
          strictBans: [],
        });
        return;
      }

      const walletMap = new Map<string, number>();
      if (Array.isArray(walletsResult.data)) {
        for (const w of walletsResult.data) {
          walletMap.set(String(w.user_id), Number(w.balance) || 0);
        }
      }

      const mailboxCounts = new Map<string, number>();
      if (Array.isArray(mailboxesResult.data)) {
        for (const m of mailboxesResult.data) {
          if (m.owner_user_id && !m.is_deleted) {
            const uid = String(m.owner_user_id);
            mailboxCounts.set(uid, (mailboxCounts.get(uid) || 0) + 1);
          }
        }
      }

      const modMap = new Map<string, { status: string; reason: string | null }>();
      if (!moderationResult.error && Array.isArray(moderationResult.data)) {
        for (const row of moderationResult.data) {
          modMap.set(String(row.user_id), {
            status: String(row.status || 'active'),
            reason: row.reason ? String(row.reason) : null,
          });
        }
      }

      const users = (usersResult.data?.users || []).map((u) => {
        const appMeta = (u.app_metadata || {}) as Record<string, unknown>;
        const userMeta = (u.user_metadata || {}) as Record<string, unknown>;
        const bannedUntil =
          typeof (u as { banned_until?: string | null }).banned_until === 'string'
            ? (u as { banned_until?: string | null }).banned_until || null
            : null;
        const emailLower = (u.email || '').trim().toLowerCase();
        const modRow = modMap.get(u.id);
        const memMod = strictModerationUserMap.get(u.id);
        let status: 'active' | 'verified' | 'restricted' | 'suspended' | 'banned' = 'active';
        const rawStatus = String(
          modRow?.status || memMod?.status || appMeta.account_status || ''
        ).toLowerCase();
        if (
          rawStatus === 'banned' ||
          rawStatus === 'suspended' ||
          rawStatus === 'restricted' ||
          rawStatus === 'verified'
        ) {
          status = rawStatus;
        } else if (bannedEmailsSet.has(emailLower)) {
          status = 'banned';
        } else if (bannedUntil && Date.parse(bannedUntil) > Date.now()) {
          status = 'suspended';
        } else if (u.email_confirmed_at) {
          status = 'verified';
        }

        const lastIp = lastKnownUserIpMap.get(u.id) || memMod?.ip || null;
        const strictBanned = Boolean(
          status === 'banned' &&
            (memMod?.strict ||
              bannedEmailsSet.has(emailLower) ||
              (lastIp && bannedIpsSet.has(lastIp)))
        );

        return {
          id: u.id,
          email: u.email || '',
          fullName:
            typeof userMeta.full_name === 'string'
              ? userMeta.full_name
              : typeof userMeta.name === 'string'
                ? userMeta.name
                : null,
          avatarUrl: typeof userMeta.avatar_url === 'string' ? userMeta.avatar_url : null,
          createdAt: u.created_at,
          lastSignInAt: u.last_sign_in_at || null,
          emailConfirmed: Boolean(u.email_confirmed_at),
          status,
          bannedUntil,
          walletBalance: walletMap.get(u.id) || 0,
          mailboxCount: mailboxCounts.get(u.id) || 0,
          moderationReason:
            modRow?.reason ||
            memMod?.reason ||
            bannedEmailsSet.get(emailLower)?.reason ||
            null,
          strictBanned,
          lastIp,
        };
      });

      const strictBans = [
        ...Array.from(bannedEmailsSet.values()),
        ...Array.from(bannedIpsSet.values()),
      ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

      res.json({ users, strictBans });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to list users',
        users: [],
        strictBans: [],
      });
    }
  });

  app.post('/api/admin/users/:userId/action', async (req, res) => {
    const verified = await verifyOwnerAdminRequest(req, res);
    if (!verified) return;
    const sb = verified.supabase;

    const userId = String(req.params.userId || '').trim();
    const action = String(req.body?.action || '').trim().toLowerCase();
    const reason =
      typeof req.body?.reason === 'string' && req.body.reason.trim()
        ? req.body.reason.trim().slice(0, 240)
        : null;
    const strict = req.body?.strict !== false;

    if (!userId || !['verify', 'restrict', 'suspend', 'ban', 'restore'].includes(action)) {
      res.status(400).json({ error: 'Invalid userId or moderation action' });
      return;
    }

    try {
      const { data: targetLookup, error: lookupErr } = await sb.auth.admin.getUserById(userId);
      if (lookupErr || !targetLookup?.user) {
        res.status(404).json({ error: lookupErr?.message || 'User not found' });
        return;
      }
      const targetEmail = (targetLookup.user.email || '').trim().toLowerCase();
      if (targetEmail === OWNER_ADMIN_EMAIL && ['restrict', 'suspend', 'ban'].includes(action)) {
        res.status(400).json({ error: 'Cannot restrict, suspend, or ban the owner account.' });
        return;
      }

      const nextStatus: ModerationStatusValue =
        action === 'verify'
          ? 'verified'
          : action === 'restrict'
            ? 'restricted'
            : action === 'suspend'
              ? 'suspended'
              : action === 'ban'
                ? 'banned'
                : 'active';

      const updatePayload: {
        email_confirm?: boolean;
        ban_duration?: string;
        app_metadata?: Record<string, unknown>;
      } = {
        app_metadata: {
          ...(targetLookup.user.app_metadata || {}),
          account_status: nextStatus,
        },
      };

      if (action === 'verify') {
        updatePayload.email_confirm = true;
        updatePayload.ban_duration = 'none';
      } else if (action === 'restrict') {
        updatePayload.ban_duration = 'none';
      } else if (action === 'suspend') {
        updatePayload.ban_duration = '168h';
      } else if (action === 'ban') {
        updatePayload.ban_duration = '876000h';
      } else if (action === 'restore') {
        updatePayload.ban_duration = 'none';
      }

      const { data: updated, error: updateErr } = await sb.auth.admin.updateUserById(
        userId,
        updatePayload
      );
      if (updateErr) {
        res.status(updateErr.status || 500).json({
          error: `Supabase auth.admin.updateUserById failed: ${updateErr.message}`,
        });
        return;
      }

      // Immediately revoke active JWT sessions so banned/suspended users are kicked out in real time
      if (['ban', 'suspend'].includes(action)) {
        await sb.auth.admin.signOut(userId, 'global').catch(() => undefined);
      }

      const knownIp =
        lastKnownUserIpMap.get(userId) || strictModerationUserMap.get(userId)?.ip || null;
      const nowIso = new Date().toISOString();

      if (['ban', 'suspend', 'restrict'].includes(action)) {
        strictModerationUserMap.set(userId, {
          status: nextStatus,
          reason,
          strict: action === 'ban' && strict,
          email: targetEmail || null,
          ip: knownIp,
          updatedAt: Date.now(),
        });

        if (action === 'ban' && strict) {
          if (targetEmail) {
            bannedEmailsSet.set(targetEmail, {
              id: `email:${targetEmail}`,
              targetType: 'email',
              targetValue: targetEmail,
              reason: reason || 'Strict ban by administrator',
              strict: true,
              bannedBy: verified.email,
              createdAt: nowIso,
            });
          }
          if (knownIp) {
            bannedIpsSet.set(knownIp, {
              id: `ip:${knownIp}`,
              targetType: 'ip',
              targetValue: knownIp,
              reason: reason || `Associated with banned user ${targetEmail || userId}`,
              strict: true,
              bannedBy: verified.email,
              createdAt: nowIso,
            });
          }
        }
      } else {
        strictModerationUserMap.delete(userId);
        if (targetEmail) bannedEmailsSet.delete(targetEmail);
        if (knownIp) bannedIpsSet.delete(knownIp);
      }

      try {
        await sb.from('user_moderation').upsert(
          {
            user_id: userId,
            email: targetEmail,
            status: nextStatus,
            reason,
            updated_by: verified.email,
            updated_at: nowIso,
          },
          { onConflict: 'user_id' }
        );
        if (action === 'ban' && strict) {
          if (targetEmail) {
            await sb.from('user_moderation').upsert(
              {
                user_id: `email:${targetEmail}`,
                email: targetEmail,
                status: 'banned',
                reason: reason || 'Strict ban by administrator',
                updated_by: verified.email,
                updated_at: nowIso,
              },
              { onConflict: 'user_id' }
            );
          }
          if (knownIp) {
            await sb.from('user_moderation').upsert(
              {
                user_id: `ip:${knownIp}`,
                email: targetEmail || null,
                status: 'banned',
                reason: reason || `Strict IP ban (${targetEmail || userId})`,
                updated_by: verified.email,
                updated_at: nowIso,
              },
              { onConflict: 'user_id' }
            );
          }
        } else if (action === 'restore' || action === 'verify') {
          if (targetEmail) {
            await sb.from('user_moderation').delete().eq('user_id', `email:${targetEmail}`);
          }
          if (knownIp) {
            await sb.from('user_moderation').delete().eq('user_id', `ip:${knownIp}`);
          }
        }
      } catch {
        // Non-blocking if user_moderation table hasn't been created yet
      }

      res.json({
        ok: true,
        userId,
        status: nextStatus,
        strictBanned: action === 'ban' && strict,
        reason,
        emailConfirmed: Boolean(updated?.user?.email_confirmed_at),
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to update user status',
      });
    }
  });

  app.get('/api/admin/bans', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const verified = await verifyOwnerAdminRequest(req, res);
    if (!verified) return;
    await hydrateModerationFromDb(true);
    const bans = [
      ...Array.from(bannedEmailsSet.values()),
      ...Array.from(bannedIpsSet.values()),
    ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    res.json({ bans });
  });

  app.post('/api/admin/bans', async (req, res) => {
    const verified = await verifyOwnerAdminRequest(req, res);
    if (!verified) return;
    const sb = verified.supabase;

    const targetType = String(req.body?.targetType || 'email').trim().toLowerCase();
    const rawValue = String(req.body?.targetValue || '').trim();
    const reason =
      typeof req.body?.reason === 'string' && req.body.reason.trim()
        ? req.body.reason.trim().slice(0, 240)
        : 'Banned by administrator';

    if (!['email', 'ip'].includes(targetType) || !rawValue) {
      res.status(400).json({ error: 'Provide a valid visitor email or IP address to ban.' });
      return;
    }

    const targetValue = targetType === 'email' ? rawValue.toLowerCase() : rawValue.replace(/^::ffff:/i, '');
    if (targetType === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetValue)) {
        res.status(400).json({ error: 'Enter a valid email address.' });
        return;
      }
      if (targetValue === OWNER_ADMIN_EMAIL) {
        res.status(400).json({ error: 'Cannot ban the owner account.' });
        return;
      }
    } else if (!/^[a-fA-F0-9:.]{3,64}$/.test(targetValue)) {
      res.status(400).json({ error: 'Enter a valid IPv4 or IPv6 address.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const banId = `${targetType}:${targetValue}`;
    const entry: StrictBanEntryRecord = {
      id: banId,
      targetType: targetType as 'email' | 'ip',
      targetValue,
      reason,
      strict: true,
      bannedBy: verified.email,
      createdAt: nowIso,
    };

    if (targetType === 'email') {
      bannedEmailsSet.set(targetValue, entry);
      try {
        const { data: usersRes } = await sb.auth.admin.listUsers({ page: 1, perPage: 300 });
        const matched = (usersRes?.users || []).find(
          (u) => (u.email || '').trim().toLowerCase() === targetValue
        );
        if (matched) {
          await sb.auth.admin.updateUserById(matched.id, {
            ban_duration: '876000h',
            app_metadata: { ...(matched.app_metadata || {}), account_status: 'banned' },
          });
          await sb.auth.admin.signOut(matched.id, 'global').catch(() => undefined);
          strictModerationUserMap.set(matched.id, {
            status: 'banned',
            reason,
            strict: true,
            email: targetValue,
            updatedAt: Date.now(),
          });
          await sb
            .from('user_moderation')
            .upsert(
              {
                user_id: matched.id,
                email: targetValue,
                status: 'banned',
                reason,
                updated_by: verified.email,
                updated_at: nowIso,
              },
              { onConflict: 'user_id' }
            );
        }
      } catch {
        // Non-blocking auth sync
      }
    } else {
      bannedIpsSet.set(targetValue, entry);
    }

    try {
      await sb.from('user_moderation').upsert(
        {
          user_id: banId,
          email: targetType === 'email' ? targetValue : null,
          status: 'banned',
          reason,
          updated_by: verified.email,
          updated_at: nowIso,
        },
        { onConflict: 'user_id' }
      );
    } catch {
      // Non-blocking if user_moderation table is absent
    }

    res.json({ ok: true, entry });
  });

  app.post('/api/admin/bans/remove', async (req, res) => {
    const verified = await verifyOwnerAdminRequest(req, res);
    if (!verified) return;
    const sb = verified.supabase;

    const rawId = String(req.body?.id || '').trim();
    const targetType = String(
      req.body?.targetType || (rawId.startsWith('ip:') ? 'ip' : 'email')
    )
      .trim()
      .toLowerCase();
    const rawVal = String(
      req.body?.targetValue ||
        (rawId.includes(':') ? rawId.slice(rawId.indexOf(':') + 1) : '')
    ).trim();

    if (!rawVal || !['email', 'ip'].includes(targetType)) {
      res.status(400).json({ error: 'Invalid ban identifier' });
      return;
    }

    const val = targetType === 'email' ? rawVal.toLowerCase() : rawVal;
    const banKey = `${targetType}:${val}`;

    if (targetType === 'email') {
      bannedEmailsSet.delete(val);
      try {
        const { data: usersRes } = await sb.auth.admin.listUsers({ page: 1, perPage: 300 });
        const matched = (usersRes?.users || []).find(
          (u) => (u.email || '').trim().toLowerCase() === val
        );
        if (matched) {
          strictModerationUserMap.delete(matched.id);
          await sb.auth.admin.updateUserById(matched.id, {
            ban_duration: 'none',
            app_metadata: { ...(matched.app_metadata || {}), account_status: 'active' },
          });
          await sb
            .from('user_moderation')
            .upsert(
              {
                user_id: matched.id,
                email: val,
                status: 'active',
                reason: null,
                updated_by: verified.email,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'user_id' }
            );
        }
      } catch {
        // Non-blocking
      }
    } else {
      bannedIpsSet.delete(val);
    }

    try {
      await sb.from('user_moderation').delete().eq('user_id', banKey);
    } catch {
      // Non-blocking
    }

    res.json({ ok: true, removed: banKey });
  });

  app.post('/api/admin/test-inbound', async (req, res) => {
    const verified = await verifyOwnerAdminRequest(req, res);
    if (!verified) return;

    const hasRecipientField = Boolean(
      req.body &&
        typeof req.body === 'object' &&
        ('recipientAddress' in req.body || 'targetAddress' in req.body)
    );
    const rawTarget = req.body?.recipientAddress ?? req.body?.targetAddress;
    const requestedAddr = normalizeRecipientString(rawTarget);

    if (hasRecipientField && rawTarget !== '' && !requestedAddr) {
      res.status(400).json({
        ok: false,
        error: `Recipient address must be a valid @${CUSTOM_EMAIL_DOMAIN} address.`,
      });
      return;
    }

    if (requestedAddr && !requestedAddr.endsWith(`@${CUSTOM_EMAIL_DOMAIN}`)) {
      res.status(422).json({
        ok: false,
        error: `Recipient address must belong to @${CUSTOM_EMAIL_DOMAIN} (got "${requestedAddr}").`,
      });
      return;
    }

    const targetAddress = requestedAddr || `readiness-check@${CUSTOM_EMAIL_DOMAIN}`;

    const reqHost = req.get('host') || `127.0.0.1:${process.env.PORT || 3000}`;
    const forwardedProto =
      typeof req.headers['x-forwarded-proto'] === 'string'
        ? req.headers['x-forwarded-proto'].split(',')[0].trim()
        : req.protocol || 'http';
    const isLocalHost =
      reqHost.startsWith('127.0.0.1') || reqHost.startsWith('localhost');
    const origin = isLocalHost
      ? `http://${reqHost}`
      : `${forwardedProto || 'https'}://${reqHost}`;
    const endpointUrl = `${origin}/api/email/inbound`;

    const startedAt = Date.now();
    const resendApiKey = getResendApiKey();
    const resendWebhookSecret = getResendWebhookSecret();
    const sbConfig = getSupabaseServerConfig();
    const serviceRoleConfigured = Boolean(
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim()
    );

    let httpStatus = 0;
    let responseBody: unknown = null;
    let fetchError: string | null = null;

    const dnsCheckPromise = checkDomainDns(CUSTOM_EMAIL_DOMAIN);
    const prodDomainUrl = `https://${CUSTOM_EMAIL_DOMAIN}`;
    const prodProbePromise = (async () => {
      try {
        const healthRes = await fetch(`${prodDomainUrl}/api/email/domains`, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(3000),
        });
        const payload = (await healthRes.json().catch(() => null)) as {
          domain?: string;
          error?: string;
        } | null;
        if (!healthRes.ok) {
          return {
            url: `${prodDomainUrl}/api/email/domains`,
            httpStatus: healthRes.status,
            reachable: false,
            detail: payload?.error
              ? `HTTP ${healthRes.status}: ${payload.error}`
              : `HTTP ${healthRes.status} from ${prodDomainUrl}/api/email/domains`,
          };
        }
        return {
          url: `${prodDomainUrl}/api/email/domains`,
          httpStatus: healthRes.status,
          reachable: true,
          detail: 'Live custom domain API & Resend webhook host reachable',
        };
      } catch (err) {
        return {
          url: `${prodDomainUrl}/api/email/domains`,
          httpStatus: null,
          reachable: false,
          detail: err instanceof Error ? err.message : `Connection to ${prodDomainUrl} failed`,
        };
      }
    })();

    // 1. Verify /api/email/inbound rejects unsigned requests with HTTP 400 (confirming Svix signature enforcement)
    let signatureEnforcementOk = false;
    try {
      const webhookRes = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-veribox-readiness-probe': '1',
        },
        body: JSON.stringify({ type: 'email.received', readinessCheck: true }),
        signal: AbortSignal.timeout(4000),
      });
      httpStatus = webhookRes.status;
      signatureEnforcementOk = webhookRes.status === 400;
      const rawRespText = await webhookRes.text();
      try {
        responseBody = JSON.parse(rawRespText);
      } catch {
        responseBody = { raw: rawRespText.slice(0, 500) };
      }
    } catch (err) {
      fetchError =
        err instanceof Error ? err.message : 'HTTP POST check to /api/email/inbound failed';
      responseBody = { error: fetchError };
    }

    // 2. Verify live Resend API key via resend.emails.receiving.list({ limit: 1 })
    let resendApiOk = false;
    let resendApiError: string | null = null;
    if (!resendApiKey) {
      resendApiError = 'RESEND_API_KEY is not configured on server';
    } else {
      try {
        const resendClient = new Resend(resendApiKey);
        const listRes = await resendClient.emails.receiving.list({ limit: 1 });
        if (listRes.error) {
          resendApiError = `Resend API error: ${listRes.error.message}`;
        } else {
          resendApiOk = true;
        }
      } catch (err) {
        resendApiError = err instanceof Error ? err.message : 'Resend API request failed';
      }
    }

    const webhookReadyOk = Boolean(resendWebhookSecret) && signatureEnforcementOk;
    const webhookError = !resendWebhookSecret
      ? 'RESEND_WEBHOOK_SECRET is not configured on server'
      : !signatureEnforcementOk
        ? fetchError || `Expected HTTP 400 rejecting unsigned webhook at ${endpointUrl}, got HTTP ${httpStatus || 'ERR'}`
        : null;

    // Verify Supabase tables & required columns directly (read-only schema verification — zero synthetic rows written)
    let mailboxesReady = false;
    let messagesReady = false;
    let inboundLogsReady = false;
    let supabaseError: string | null = null;
    let webhookLogError: string | null = null;

    try {
      const [mbCheck, msgCheck, logCheck] = await Promise.all([
        verified.supabase
          .from('mailboxes')
          .select('id, address, owner_user_id', { count: 'exact' })
          .limit(1),
        verified.supabase
          .from('mailbox_messages')
          .select('id, mailbox_id, recipient_address, otp, created_at', { count: 'exact' })
          .limit(1),
        verified.supabase
          .from('inbound_webhook_logs')
          .select('id, received_at, http_status, status, ok, error_reason', { count: 'exact' })
          .limit(1),
      ]);

      mailboxesReady = !mbCheck.error;
      messagesReady = !msgCheck.error;
      inboundLogsReady = !logCheck.error;

      if (mbCheck.error) {
        supabaseError = `public.mailboxes (${mbCheck.error.code || 'ERR'}): ${mbCheck.error.message}`;
      } else if (msgCheck.error) {
        supabaseError = `public.mailbox_messages (${msgCheck.error.code || 'ERR'}): ${msgCheck.error.message}`;
      }
      if (logCheck.error) {
        webhookLogError = `public.inbound_webhook_logs (${logCheck.error.code || 'ERR'}): ${logCheck.error.message}`;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Supabase schema readiness check failed';
      supabaseError = supabaseError || msg;
      webhookLogError = webhookLogError || msg;
    }

    // Verify /api/email/messages read path when a registered mailbox is targeted
    let inboxApiOk: boolean | null = null;
    let inboxMessageCount: number | null = null;
    let inboxError: string | null = null;

    const mailboxRec = await findMailboxRecord(targetAddress);
    if (mailboxRec && mailboxRec.token) {
      try {
        const inboxRes = await fetch(`${origin}/api/email/messages`, {
          headers: {
            Authorization: `Bearer ${mailboxRec.token}`,
            'x-email-address': targetAddress,
          },
          signal: AbortSignal.timeout(3000),
        });
        const inboxData = (await inboxRes.json().catch(() => ({}))) as {
          messages?: Array<{ id?: string }>;
          error?: string;
        };
        if (inboxRes.ok && Array.isArray(inboxData.messages)) {
          inboxApiOk = true;
          inboxMessageCount = inboxData.messages.length;
        } else {
          inboxApiOk = false;
          inboxError = `HTTP ${inboxRes.status}: ${inboxData.error || 'Inbox API check failed'}`;
        }
      } catch (err) {
        inboxApiOk = false;
        inboxError = err instanceof Error ? err.message : 'Inbox API HTTP fetch failed';
      }
    } else if (requestedAddr) {
      inboxError = `No mailbox row registered yet for ${targetAddress} in public.mailboxes (create or generate it first to verify inbox readback).`;
    }

    const [dnsCheck, productionProbe] = await Promise.all([dnsCheckPromise, prodProbePromise]);

    const checks = [
      {
        key: 'env_secret',
        label: 'Resend Keys & Supabase',
        ok: Boolean(resendApiKey) && Boolean(resendWebhookSecret) && Boolean(sbConfig.url) && serviceRoleConfigured,
        detail: !resendApiKey
          ? 'RESEND_API_KEY is not set on server'
          : !resendWebhookSecret
            ? 'RESEND_WEBHOOK_SECRET is not set on server'
            : !serviceRoleConfigured
              ? 'SUPABASE_SERVICE_ROLE_KEY is not set on server'
              : `RESEND_API_KEY, RESEND_WEBHOOK_SECRET & Supabase configured (@${CUSTOM_EMAIL_DOMAIN})`,
        error: !resendApiKey
          ? 'RESEND_API_KEY missing'
          : !resendWebhookSecret
            ? 'RESEND_WEBHOOK_SECRET missing'
            : !serviceRoleConfigured
              ? 'SUPABASE_SERVICE_ROLE_KEY missing'
              : null,
      },
      {
        key: 'resend_api',
        label: 'Resend Receiving API',
        ok: resendApiOk,
        detail: resendApiOk
          ? 'RESEND_API_KEY verified against resend.emails.receiving.list'
          : resendApiError || 'Resend API verification failed',
        error: resendApiError,
      },
      {
        key: 'webhook_readiness',
        label: 'Webhook Svix Verification',
        ok: webhookReadyOk,
        detail: webhookReadyOk
          ? `HTTP ${httpStatus} · Svix signature check active on /api/email/inbound`
          : webhookError || `HTTP ${httpStatus || 'ERR'}`,
        error: webhookError,
      },
      {
        key: 'supabase_schema',
        label: 'Supabase Tables & Schema',
        ok: mailboxesReady && messagesReady,
        detail:
          mailboxesReady && messagesReady
            ? 'public.mailboxes & public.mailbox_messages ready'
            : supabaseError || 'Supabase table check failed',
        error: supabaseError,
      },
      {
        key: 'webhook_logs',
        label: 'Webhook Logs Table',
        ok: inboundLogsReady,
        detail: inboundLogsReady
          ? 'public.inbound_webhook_logs ready'
          : webhookLogError || 'public.inbound_webhook_logs unavailable',
        error: webhookLogError,
      },
      {
        key: 'inbox_api',
        label: 'Inbox Read API',
        ok: inboxApiOk,
        detail:
          inboxApiOk === true
            ? `OK (${inboxMessageCount ?? 0} real messages)`
            : inboxApiOk === false
              ? inboxError || 'Inbox read failed'
              : inboxError || 'Enter an active mailbox address to check inbox readback',
        error: inboxApiOk === false ? inboxError : null,
      },
      {
        key: 'domain_dns',
        label: `Live Domain & DNS (${CUSTOM_EMAIL_DOMAIN})`,
        ok: Boolean(productionProbe?.reachable) && !dnsCheck.error && dnsCheck.mxOk,
        detail:
          productionProbe?.reachable && dnsCheck.mxOk
            ? `${productionProbe.detail} · MX ${dnsCheck.mxRecords[0] || 'OK'}`
            : !productionProbe?.reachable
              ? productionProbe?.detail || 'Live domain unreachable'
              : dnsCheck.error || 'MX records missing',
        error: !productionProbe?.reachable
          ? productionProbe?.detail || null
          : dnsCheck.error || (!dnsCheck.mxOk ? `Missing MX records on ${CUSTOM_EMAIL_DOMAIN}` : null),
      },
    ];

    const ready =
      Boolean(resendApiKey) &&
      Boolean(resendWebhookSecret) &&
      serviceRoleConfigured &&
      resendApiOk &&
      webhookReadyOk &&
      mailboxesReady &&
      messagesReady &&
      inboundLogsReady &&
      inboxApiOk !== false;

    res.json({
      mode: 'readiness',
      ready,
      testedAt: new Date().toISOString(),
      targetAddress,
      endpointUrl,
      httpStatus,
      latencyMs: Date.now() - startedAt,
      responseBody,
      checks,
      supabaseWriteOk: mailboxesReady && messagesReady && webhookReadyOk,
      supabaseReadbackOk: mailboxesReady && messagesReady,
      webhookLogged: inboundLogsReady,
      webhookLogError,
      webhookLogReadbackOk: inboundLogsReady,
      webhookLogId: null,
      inboxApiOk,
      inboxMessageCount,
      inboxError,
      supabaseError: supabaseError || webhookError,
      otpDetected: null,
      productionProbe,
      dnsCheck,
    });
  });

  app.get('/api/email/messages/:id', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const requestedEmail = normalizeRecipientString(
      req.headers['x-email-address'] ?? req.query.address
    );
    if (!requestedEmail) {
      res.status(400).json({ error: 'Recipient email address is required.' });
      return;
    }

    const verified = await verifyMailboxRequest(req);
    if (!verified) {
      res.status(401).json({ error: 'Unauthorized mailbox request' });
      return;
    }

    try {
      const found = await findInboxMessage(verified.address, req.params.id);
      if (!found) {
        res.status(404).json({ error: 'Email not found' });
        return;
      }
      res.json({
        id: found.id,
        fromName: found.fromName,
        fromAddress: found.fromAddress,
        subject: found.subject,
        text: found.text,
        html: found.html,
        createdAt: found.createdAt,
        otp: found.otp,
      });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Failed to load message',
      });
    }
  });

  app.delete('/api/email/messages/:id', async (req, res) => {
    const requestedEmail = normalizeRecipientString(
      req.headers['x-email-address'] ?? req.query.address
    );
    if (!requestedEmail) {
      res.status(400).json({ error: 'Recipient email address is required.' });
      return;
    }

    const verified = await verifyMailboxRequest(req);
    if (!verified) {
      res.status(401).json({ error: 'Unauthorized mailbox request' });
      return;
    }

    try {
      await deleteInboxMessageById(verified.address, req.params.id);
      res.json({ deleted: true });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Delete failed',
      });
    }
  });

  // ==========================================
  // Privacy-Safe Virtual Number & SMS Routes
  // ==========================================
  app.get('/api/numbers/services', async (_req, res) => {
    const fivesimConfigured = Boolean(getFiveSimApiKey());
    const grizzlyConfigured = Boolean(getGrizzlyApiKey());
    const configured = fivesimConfigured || grizzlyConfigured;
    try {
      const services = await getAvailableNumberServices();
      res.json({ configured, fivesimConfigured, grizzlyConfigured, services });
    } catch {
      const fallbackServices = POPULAR_SERVICE_ORDER.map((id) => ({
        id,
        name: formatServiceDisplayName(id),
        popular: true,
      }));
      res.json({ configured, fivesimConfigured, grizzlyConfigured, services: fallbackServices });
    }
  });

  app.get('/api/numbers/key-check', async (_req, res) => {
    const fiveSimKey = getFiveSimApiKey();
    const grizzlyKey = getGrizzlyApiKey();
    const rates = await getExchangeRates();

    const checkFiveSim = async () => {
      if (!fiveSimKey) {
        return { configured: false, authenticated: false, error: 'FIVESIM_API_KEY not configured' };
      }
      try {
        const profile = await callFiveSimUserApi('profile', fiveSimKey);
        const rawCurrency = String(profile.currency || '').toUpperCase().trim();
        const detectedCurrency = rawCurrency || (await detectFiveSimRatioCurrency(fiveSimKey));
        fiveSimCurrencyCache.currency = detectedCurrency;
        fiveSimCurrencyCache.expiresAt = Date.now() + 10 * 60 * 1000;
        const rawBalance = Number(profile.balance || 0);
        const balanceUsd = convertCurrencyAmountToUsd(rawBalance, detectedCurrency, rates);
        return {
          configured: true,
          authenticated: true,
          accountCurrency: detectedCurrency,
          rawBalance,
          balanceUsd,
          balanceNgn: roundToNaira(balanceUsd, rates.NGN),
        };
      } catch (err) {
        const statusCode =
          err && typeof err === 'object' && 'statusCode' in err
            ? Number((err as { statusCode?: number }).statusCode)
            : 502;
        return {
          configured: true,
          authenticated: false,
          upstreamStatus: statusCode || 502,
          error: sanitizeNumberApiError(err instanceof Error ? err.message : '5sim verification failed'),
        };
      }
    };

    const checkGrizzly = async () => {
      if (!grizzlyKey) {
        return { configured: false, authenticated: false, error: 'GRIZZLYSMS_API_KEY not configured' };
      }
      try {
        const text = await callGrizzlyApi({ action: 'getBalance' }, grizzlyKey);
        if (text.startsWith('ACCESS_BALANCE:')) {
          const rawBalance = Number(text.slice('ACCESS_BALANCE:'.length).trim() || 0);
          return {
            configured: true,
            authenticated: true,
            accountCurrency: 'USD',
            rawBalance,
            balanceUsd: rawBalance,
            balanceNgn: roundToNaira(rawBalance, rates.NGN),
          };
        }
        return {
          configured: true,
          authenticated: false,
          error: sanitizeNumberApiError(text),
        };
      } catch (err) {
        return {
          configured: true,
          authenticated: false,
          error: sanitizeNumberApiError(err instanceof Error ? err.message : 'Grizzly SMS verification failed'),
        };
      }
    };

    const [fivesim, grizzly] = await Promise.all([checkFiveSim(), checkGrizzly()]);
    res.json({
      configured: fivesim.configured || grizzly.configured,
      authenticated: fivesim.authenticated || grizzly.authenticated,
      exchangeRateNgn: rates.NGN,
      fivesim,
      grizzly,
    });
  });

  app.get('/api/numbers/countries', async (req, res) => {
    const service = normalizeServiceSlug(String(req.query.service || 'whatsapp'));
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    try {
      const { countries, exchangeRate } = await getUnifiedCountriesForPlatform(service, refresh);
      res.json({ service, currency: 'NGN', exchangeRate, countries });
    } catch (err) {
      res.status(502).json({
        error: sanitizeNumberApiError(err instanceof Error ? err.message : 'Failed to load countries'),
        countries: [],
      });
    }
  });

  let lowestDealsCache: {
    data: Array<{
      serviceId: string;
      serviceName: string;
      slug: string;
      country: string;
      countryCode: string;
      dialCode: string;
      minPrice: number;
      rawPriceUsd: number;
      currency: string;
      stockCount: number;
      provider: 'fivesim' | 'grizzly';
      providerName: string;
    }>;
    exchangeRate: number;
    expiresAt: number;
  } | null = null;

  app.get('/api/numbers/lowest', async (req, res) => {
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    if (!refresh && lowestDealsCache && Date.now() < lowestDealsCache.expiresAt) {
      res.json({
        currency: 'NGN',
        exchangeRate: lowestDealsCache.exchangeRate,
        deals: lowestDealsCache.data,
      });
      return;
    }

    const trackServices = ['tiktok', 'facebook', 'instagram', 'twitter', 'google', 'telegram', 'whatsapp', 'other'];
    try {
      const fiveSimKey = getFiveSimApiKey();
      const [rates] = await Promise.all([
        getExchangeRates(),
        fiveSimKey ? getFiveSimAccountCurrency(fiveSimKey) : Promise.resolve('USD'),
      ]);

      const fetchDeal = async (serviceId: string) => {
        const { countries } = await getUnifiedCountriesForPlatform(serviceId, refresh, rates);
        if (countries.length === 0) return null;
        const cheapest = [...countries].sort(
          (a, b) => a.minPrice - b.minPrice || b.stockCount - a.stockCount
        )[0];
        if (!cheapest) return null;
        const bestProv = cheapest.providers[0];
        return {
          serviceId,
          serviceName: formatServiceDisplayName(serviceId),
          slug: cheapest.slug,
          country: cheapest.country,
          countryCode: cheapest.countryCode,
          dialCode: cheapest.dialCode,
          minPrice: bestProv ? bestProv.minPrice : cheapest.minPrice,
          rawPriceUsd: bestProv ? bestProv.rawPriceUsd : cheapest.rawPriceUsd,
          currency: 'NGN',
          stockCount: cheapest.stockCount,
          provider: bestProv?.provider || ('fivesim' as const),
          providerName: bestProv?.name || '5sim',
        };
      };

      const batch1 = await Promise.allSettled(trackServices.slice(0, 4).map(fetchDeal));
      await new Promise((r) => setTimeout(r, 120));
      const batch2 = await Promise.allSettled(trackServices.slice(4).map(fetchDeal));
      const results = [...batch1, ...batch2];

      const deals = results
        .map((r) => (r.status === 'fulfilled' ? r.value : null))
        .filter((item): item is NonNullable<typeof item> => Boolean(item && item.minPrice > 0))
        .sort((a, b) => a.minPrice - b.minPrice || b.stockCount - a.stockCount);

      if (deals.length > 0) {
        lowestDealsCache = {
          data: deals,
          exchangeRate: rates.NGN,
          expiresAt: Date.now() + 25_000,
        };
      }

      res.json({ currency: 'NGN', exchangeRate: rates.NGN, deals });
    } catch (err) {
      if (lowestDealsCache) {
        res.json({
          currency: 'NGN',
          exchangeRate: lowestDealsCache.exchangeRate,
          deals: lowestDealsCache.data,
        });
        return;
      }
      res.status(502).json({
        error: sanitizeNumberApiError(err instanceof Error ? err.message : 'Failed to track lowest deals'),
        deals: [],
      });
    }
  });

  async function settleNumberOrderChargeIfSmsArrived(params: {
    orderId: number;
    smsCount: number;
    chargeToken?: unknown;
    fallbackUserId?: unknown;
    fallbackEmail?: string | null;
    provider?: 'fivesim' | 'grizzly';
    phone?: string;
    serviceName?: string;
    priceNgn?: number;
  }): Promise<{
    charged: boolean;
    chargedNow: boolean;
    chargedAmount: number;
    walletBalance: number | null;
    reservedBalance: number;
    availableBalance: number | null;
  }> {
    const heldRecord = numberOrderHoldMap.get(params.orderId);
    const verifiedToken = verifyOrderChargeToken(params.chargeToken, params.orderId);
    const targetUserId =
      heldRecord?.userId ||
      verifiedToken?.userId ||
      (params.fallbackUserId ? normalizeWalletUserId(params.fallbackUserId) : undefined);

    const amountNgn = Math.max(
      0,
      Math.round(
        heldRecord?.amountNgn || verifiedToken?.amountNgn || params.priceNgn || 0
      )
    );

    if (params.smsCount <= 0) {
      const reserved = targetUserId ? getPendingHoldTotalForUser(targetUserId) : 0;
      const bal = targetUserId ? (await getUserWalletBalance(targetUserId)).balance : null;
      return {
        charged: Boolean(heldRecord?.charged),
        chargedNow: false,
        chargedAmount: 0,
        walletBalance: bal,
        reservedBalance: reserved,
        availableBalance: bal !== null ? Math.max(0, bal - reserved) : null,
      };
    }

    if (!targetUserId || amountNgn <= 0) {
      return {
        charged: Boolean(heldRecord?.charged),
        chargedNow: false,
        chargedAmount: 0,
        walletBalance: null,
        reservedBalance: 0,
        availableBalance: null,
      };
    }

    if (heldRecord?.charged) {
      const reserved = getPendingHoldTotalForUser(targetUserId);
      const bal = (await getUserWalletBalance(targetUserId)).balance;
      return {
        charged: true,
        chargedNow: false,
        chargedAmount: 0,
        walletBalance: bal,
        reservedBalance: reserved,
        availableBalance: bal !== null ? Math.max(0, bal - reserved) : null,
      };
    }

    const phoneLabel = heldRecord?.phone || verifiedToken?.phone || params.phone || String(params.orderId);
    const svcLabel = heldRecord?.serviceName || verifiedToken?.serviceName || params.serviceName || 'Verification';
    const adj = await adjustUserWalletBalance({
      userId: targetUserId,
      email: heldRecord?.email || params.fallbackEmail || null,
      deltaNgn: -amountNgn,
      reference: `order-${params.orderId}`,
      details: `${svcLabel} private number (${phoneLabel}) — SMS arrived`,
    });

    if (heldRecord) {
      heldRecord.charged = true;
      heldRecord.settled = true;
    }

    const reserved = getPendingHoldTotalForUser(targetUserId);
    const bal = adj.balance ?? (await getUserWalletBalance(targetUserId)).balance;
    return {
      charged: true,
      chargedNow: !adj.alreadyProcessed && !adj.insufficient,
      chargedAmount: !adj.alreadyProcessed && !adj.insufficient ? amountNgn : 0,
      walletBalance: bal,
      reservedBalance: reserved,
      availableBalance: bal !== null ? Math.max(0, bal - reserved) : null,
    };
  }

  async function releaseNumberOrderHold(
    orderId: number,
    chargeToken?: unknown,
    fallbackUserId?: unknown
  ): Promise<{
    walletBalance: number | null;
    reservedBalance: number;
    availableBalance: number | null;
  }> {
    const heldRecord = numberOrderHoldMap.get(orderId);
    const verifiedToken = verifyOrderChargeToken(chargeToken, orderId);
    const targetUserId =
      heldRecord?.userId ||
      verifiedToken?.userId ||
      (fallbackUserId ? normalizeWalletUserId(fallbackUserId) : undefined);

    if (heldRecord && !heldRecord.charged) {
      heldRecord.cancelled = true;
      heldRecord.settled = true;
    }

    const reserved = targetUserId ? getPendingHoldTotalForUser(targetUserId) : 0;
    const bal = targetUserId ? (await getUserWalletBalance(targetUserId)).balance : null;
    return {
      walletBalance: bal,
      reservedBalance: reserved,
      availableBalance: bal !== null ? Math.max(0, bal - reserved) : null,
    };
  }

  app.post('/api/numbers/acquire', async (req, res) => {
    const caller = await assertCallerNotModerated(req, res);
    if (!caller) return;

    const requestedProvider = String(req.body?.provider || 'fivesim').toLowerCase();
    const provider: 'fivesim' | 'grizzly' =
      requestedProvider === 'grizzly' ? 'grizzly' : 'fivesim';

    const service = normalizeServiceSlug(String(req.body?.service || 'whatsapp'));
    const serviceName =
      typeof req.body?.serviceName === 'string'
        ? req.body.serviceName
        : formatServiceDisplayName(service);
    const countryNameHint =
      typeof req.body?.countryName === 'string' ? req.body.countryName : '';
    const countryCodeHint =
      typeof req.body?.countryCode === 'string' ? req.body.countryCode.toUpperCase() : undefined;
    const quantity = Math.min(10, Math.max(1, Number(req.body?.quantity || 1) || 1));
    const rawBodyUserId = req.body?.userId ? normalizeWalletUserId(req.body.userId) : undefined;
    const userId = caller.userId ? normalizeWalletUserId(caller.userId) : rawBodyUserId;
    const rawClientBalance = Number(req.body?.walletBalance);
    let clientWalletBalance = rawClientBalance;
    if (userId) {
      const serverBal = await getUserWalletBalance(userId);
      if (serverBal.supabasePersisted && typeof serverBal.balance === 'number') {
        clientWalletBalance = serverBal.balance;
      }
    }

    const pendingHoldNgn = userId ? getPendingHoldTotalForUser(userId) : 0;
    const availableBeforeBuy = Number.isFinite(clientWalletBalance)
      ? Math.max(0, clientWalletBalance - pendingHoldNgn)
      : Number.POSITIVE_INFINITY;

    await hydrateIssuedNumbersFromDb(false);

    // STRICTLY ISOLATED GRIZZLY SMS FLOW
    if (provider === 'grizzly') {
      const grizzlyKey = getGrizzlyApiKey();
      if (!grizzlyKey) {
        res.status(503).json({
          error: 'Grizzly SMS key (GRIZZLYSMS_API_KEY) is not configured yet.',
        });
        return;
      }

      const grizzlyCountryId = String(req.body?.countryId || req.body?.country || '').replace(
        /[^0-9]/g,
        ''
      );
      if (!grizzlyCountryId) {
        res.status(400).json({ error: 'Invalid Grizzly SMS country selection.' });
        return;
      }

      try {
        const grizzlyService = await getGrizzlyServiceCode(service);
        if (!grizzlyService) {
          res.status(400).json({
            error: `${serviceName} is not supported on Grizzly SMS right now.`,
          });
          return;
        }

        const [grizzlyCountries, rates] = await Promise.all([
          getGrizzlyCountriesForPlatform(service, true).catch(() => []),
          getExchangeRates(),
        ]);
        const countryMeta = grizzlyCountries.find((c) => c.countryId === grizzlyCountryId);
        const liveUnitUsd = countryMeta?.minPriceUsd || 0;
        const liveUnitNgn = liveUnitUsd > 0 ? roundToNaira(liveUnitUsd, rates.NGN) : 0;

        if (
          Number.isFinite(availableBeforeBuy) &&
          liveUnitNgn > 0 &&
          availableBeforeBuy < liveUnitNgn * quantity
        ) {
          res.status(402).json({
            error: `Insufficient available wallet balance (₦${(liveUnitNgn * quantity).toLocaleString()} needed, available ₦${availableBeforeBuy.toLocaleString()}${pendingHoldNgn > 0 ? `, ₦${pendingHoldNgn.toLocaleString()} held on waiting numbers` : ''}). Top up first — funds are only deducted once an SMS arrives.`,
          });
          return;
        }

        const orders = [];
        let reservedThisBatch = 0;
        let lastError = 'No numbers available on Grizzly SMS for this selection right now.';

        for (let i = 0; i < quantity; i++) {
          let acquiredOrder = null;
          for (let attempt = 0; attempt < 4; attempt++) {
            try {
              const grizzlyReqParams: Record<string, string> = {
                action: 'getNumberV2',
                service: grizzlyService,
                country: grizzlyCountryId,
              };
              if (liveUnitUsd > 0) {
                grizzlyReqParams.maxPrice = String(liveUnitUsd);
              }
              const v2Raw = await callGrizzlyApi(grizzlyReqParams, grizzlyKey);

              let candidateActId = 0;
              let candidatePhoneRaw = '';
              let candidateCostUsd = liveUnitUsd;
              let candidateExpires = '';

              if (v2Raw.startsWith('{')) {
                const parsed = JSON.parse(v2Raw) as {
                  activationId?: number | string;
                  phoneNumber?: string;
                  activationCost?: number | string;
                  activationEndTime?: string;
                };
                candidateActId = Number(parsed.activationId || 0);
                candidatePhoneRaw = String(parsed.phoneNumber || '');
                candidateCostUsd = Number(parsed.activationCost || liveUnitUsd || 0);
                candidateExpires = String(parsed.activationEndTime || '');
              } else if (v2Raw.startsWith('ACCESS_NUMBER:')) {
                const parts = v2Raw.split(':');
                candidateActId = Number(parts[1] || 0);
                candidatePhoneRaw = String(parts[2] || '');
              } else if (v2Raw === 'BAD_ACTION') {
                const v1Params: Record<string, string> = {
                  action: 'getNumber',
                  service: grizzlyService,
                  country: grizzlyCountryId,
                };
                if (liveUnitUsd > 0) {
                  v1Params.maxPrice = String(liveUnitUsd);
                }
                const v1Raw = await callGrizzlyApi(v1Params, grizzlyKey);
                if (v1Raw.startsWith('ACCESS_NUMBER:')) {
                  const parts = v1Raw.split(':');
                  candidateActId = Number(parts[1] || 0);
                  candidatePhoneRaw = String(parts[2] || '');
                } else {
                  lastError = sanitizeNumberApiError(v1Raw);
                }
              } else {
                lastError = sanitizeNumberApiError(v2Raw);
              }

              const digits = normalizePhoneDigits(candidatePhoneRaw);
              if (candidateActId > 0 && digits) {
                const phone = candidatePhoneRaw.startsWith('+') ? candidatePhoneRaw : `+${digits}`;
                const costNgn = candidateCostUsd > 0 ? roundToNaira(candidateCostUsd, rates.NGN) : liveUnitNgn;
                const remainingAvailable = Number.isFinite(availableBeforeBuy)
                  ? availableBeforeBuy - reservedThisBatch
                  : Number.POSITIVE_INFINITY;
                const exceedsCap =
                  liveUnitNgn > 0 && costNgn > Math.max(liveUnitNgn * 1.15, liveUnitNgn + 40);

                if (costNgn > remainingAvailable || exceedsCap) {
                  await callGrizzlyApi(
                    { action: 'setStatus', status: '8', id: String(candidateActId) },
                    grizzlyKey
                  ).catch(() => undefined);
                  lastError = `Lowest price (₦${liveUnitNgn.toLocaleString()}) changed upstream (₦${costNgn.toLocaleString()}). Try another country or provider.`;
                  break;
                }

                const dup = await isPhoneNumberAlreadyIssued(digits);
                if (dup) {
                  await callGrizzlyApi(
                    { action: 'setStatus', status: '8', id: String(candidateActId) },
                    grizzlyKey
                  ).catch(() => undefined);
                  lastError = 'Fresh unused number unavailable right now — please try another country or provider.';
                  continue;
                }

                reservingPhoneDigitsSet.add(digits);
                const resolvedCountry = countryMeta?.country || countryNameHint || 'Country';
                await markPhoneNumberIssued({
                  digits,
                  phone,
                  provider: 'grizzly',
                  service,
                  country: resolvedCountry,
                  userId,
                  orderId: candidateActId,
                });

                reservedThisBatch += costNgn || liveUnitNgn;
                acquiredOrder = {
                  id: candidateActId,
                  provider: 'grizzly' as const,
                  phone,
                  digits,
                  country: resolvedCountry,
                  countryCode: countryCodeHint || countryMeta?.countryCode,
                  service,
                  serviceName,
                  price: costNgn > 0 ? costNgn : undefined,
                  rawPriceUsd: candidateCostUsd > 0 ? roundUnitPrice(candidateCostUsd) : undefined,
                  currency: 'NGN',
                  status: 'PENDING',
                  expires: candidateExpires,
                  createdAt: new Date().toISOString(),
                  sms: [],
                  charged: false,
                  chargeOnCode: true,
                };
                break;
              }
            } catch (err) {
              lastError = sanitizeNumberApiError(
                err instanceof Error ? err.message : 'Grizzly SMS purchase failed'
              );
            }
          }

          if (!acquiredOrder) {
            if (orders.length > 0) break;
            throw new Error(lastError);
          }
          orders.push(acquiredOrder);
        }

        const ordersWithTokens = orders.map((ord) => {
          const chargeToken =
            userId && ord.id && typeof ord.price === 'number' && ord.price > 0
              ? createOrderChargeToken({
                  orderId: ord.id,
                  userId,
                  amountNgn: ord.price,
                  provider: 'grizzly',
                  phone: ord.phone,
                  serviceName: ord.serviceName,
                })
              : undefined;
          if (ord.id && typeof ord.price === 'number' && ord.price > 0) {
            numberOrderHoldMap.set(ord.id, {
              orderId: ord.id,
              userId,
              email: caller.email || null,
              amountNgn: ord.price,
              rawPriceUsd: ord.rawPriceUsd,
              provider: 'grizzly',
              service: ord.service,
              serviceName: ord.serviceName,
              phone: ord.phone,
              digits: ord.digits,
              country: ord.country,
              countryCode: ord.countryCode,
              charged: false,
              settled: false,
              cancelled: false,
              createdAt: Date.now(),
            });
          }
          return { ...ord, chargeToken };
        });

        const reservedBalance = userId ? getPendingHoldTotalForUser(userId) : 0;
        const walletBalance = Number.isFinite(clientWalletBalance) ? clientWalletBalance : null;
        res.json({
          orders: ordersWithTokens,
          chargeOnCode: true,
          walletBalance,
          reservedBalance,
          availableBalance:
            walletBalance !== null ? Math.max(0, walletBalance - reservedBalance) : null,
        });
        return;
      } catch (err) {
        const message = sanitizeNumberApiError(
          err instanceof Error ? err.message : 'Unable to assign number on Grizzly SMS'
        );
        res.status(400).json({ error: message });
        return;
      }
    }

    // STRICTLY ISOLATED 5SIM FLOW
    const apiKey = getFiveSimApiKey();
    if (!apiKey) {
      res.status(503).json({ error: '5sim API key (FIVESIM_API_KEY) is not configured yet.' });
      return;
    }

    const country = String(req.body?.countryId || req.body?.country || 'england')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

    try {
      const [countriesList, accountCurrency, rates] = await Promise.all([
        getFiveSimCountriesForPlatform(service, true).catch(() => []),
        getFiveSimAccountCurrency(apiKey),
        getExchangeRates(),
      ]);
      const resolvedCurrency = fiveSimCurrencyCache.currency || accountCurrency;
      const countryMeta = countriesList.find((c) => c.slug === country);
      const lowestOps = countryMeta?.lowestOperators || [];
      const sortedInStockOps = countryMeta?.operators.map((o) => o.operator) || [];
      const operatorCandidates = Array.from(new Set([...lowestOps, 'any', ...sortedInStockOps]));

      const liveUnitUsd = countryMeta?.minPrice || 0;
      const liveUnitNgn = liveUnitUsd > 0 ? roundToNaira(liveUnitUsd, rates.NGN) : 0;
      if (
        Number.isFinite(availableBeforeBuy) &&
        liveUnitNgn > 0 &&
        availableBeforeBuy < liveUnitNgn * quantity
      ) {
        res.status(402).json({
          error: `Insufficient available wallet balance (₦${(liveUnitNgn * quantity).toLocaleString()} needed, available ₦${availableBeforeBuy.toLocaleString()}${pendingHoldNgn > 0 ? `, ₦${pendingHoldNgn.toLocaleString()} held on waiting numbers` : ''}). Top up first — funds are only deducted once an SMS arrives.`,
        });
        return;
      }

      const orders = [];
      let reservedHoldNgn = 0;
      let lastError = 'No numbers available for this selection right now.';

      for (let i = 0; i < quantity; i++) {
        let acquired: ReturnType<typeof toPublicNumberOrder> | null = null;
        let dupRetries = 0;

        for (const op of operatorCandidates) {
          let retrySameOp = true;
          while (retrySameOp) {
            retrySameOp = false;
            try {
              const raw = await callFiveSimUserApi(
                `buy/activation/${encodeURIComponent(country)}/${encodeURIComponent(op)}/${encodeURIComponent(service)}`,
                apiKey
              );
              const candidate = toPublicNumberOrder(
                raw,
                serviceName,
                countryCodeHint,
                resolvedCurrency,
                rates,
                liveUnitUsd
              );
              const orderNgn = candidate.price || 0;
              const remainingAvailable = Number.isFinite(availableBeforeBuy)
                ? availableBeforeBuy - reservedHoldNgn
                : Number.POSITIVE_INFINITY;
              const exceedsListedMin =
                liveUnitNgn > 0 && orderNgn > Math.max(liveUnitNgn * 1.15, liveUnitNgn + 40);

              if ((orderNgn > remainingAvailable || exceedsListedMin) && candidate.id > 0) {
                await callFiveSimUserApi(`cancel/${candidate.id}`, apiKey).catch(() => undefined);
                lastError = `Lowest rate (₦${liveUnitNgn.toLocaleString()}) is temporarily out of stock right now (live operator fill was ₦${orderNgn.toLocaleString()}). Try the other provider or another country.`;
                break;
              }

              const dup = await isPhoneNumberAlreadyIssued(candidate.digits);
              if (dup) {
                if (candidate.id > 0) {
                  await callFiveSimUserApi(`cancel/${candidate.id}`, apiKey).catch(() => undefined);
                }
                dupRetries += 1;
                lastError = 'Previously assigned number skipped — requesting a fresh unique number.';
                if (dupRetries < 4) {
                  retrySameOp = true;
                  continue;
                }
                break;
              }

              reservingPhoneDigitsSet.add(normalizePhoneDigits(candidate.digits));
              await markPhoneNumberIssued({
                digits: candidate.digits,
                phone: candidate.phone,
                provider: 'fivesim',
                service,
                country: candidate.country || countryNameHint || country,
                userId,
                orderId: candidate.id,
              });

              acquired = candidate;
              reservedHoldNgn += orderNgn || liveUnitNgn;
              break;
            } catch (err) {
              const msg = err instanceof Error ? err.message : '';
              lastError = sanitizeNumberApiError(msg);
              if (
                msg.toLowerCase().includes('balance') ||
                msg.toLowerCase().includes('unauthorized')
              ) {
                throw new Error(lastError);
              }
            }
          }
          if (acquired || dupRetries >= 5) break;
        }
        if (!acquired) {
          if (orders.length > 0) break;
          throw new Error(lastError);
        }
        orders.push(acquired);
      }

      const ordersWithTokens = orders.map((ord) => {
        const chargeToken =
          userId && ord.id && typeof ord.price === 'number' && ord.price > 0
            ? createOrderChargeToken({
                orderId: ord.id,
                userId,
                amountNgn: ord.price,
                provider: 'fivesim',
                phone: ord.phone,
                serviceName: ord.serviceName,
              })
            : undefined;
        if (ord.id && typeof ord.price === 'number' && ord.price > 0) {
          numberOrderHoldMap.set(ord.id, {
            orderId: ord.id,
            userId,
            email: caller.email || null,
            amountNgn: ord.price,
            rawPriceUsd: ord.rawPriceUsd,
            provider: 'fivesim',
            service: ord.service,
            serviceName: ord.serviceName,
            phone: ord.phone,
            digits: ord.digits,
            country: ord.country,
            countryCode: ord.countryCode,
            charged: false,
            settled: false,
            cancelled: false,
            createdAt: Date.now(),
          });
        }
        return {
          ...ord,
          charged: false,
          chargeOnCode: true,
          chargeToken,
        };
      });

      const reservedBalance = userId ? getPendingHoldTotalForUser(userId) : 0;
      const walletBalance = Number.isFinite(clientWalletBalance) ? clientWalletBalance : null;
      res.json({
        orders: ordersWithTokens,
        chargeOnCode: true,
        walletBalance,
        reservedBalance,
        availableBalance:
          walletBalance !== null ? Math.max(0, walletBalance - reservedBalance) : null,
      });
    } catch (err) {
      const message = sanitizeNumberApiError(
        err instanceof Error ? err.message : 'Unable to assign number'
      );
      res.status(400).json({ error: message });
    }
  });

  app.get('/api/numbers/check/:orderId', async (req, res) => {
    const caller = await assertCallerNotModerated(req, res);
    if (!caller) return;

    const provider = String(req.query.provider || 'fivesim').toLowerCase();
    const orderId = req.params.orderId.replace(/[^0-9]/g, '');
    const numericOrderId = Number(orderId);
    const chargeToken = req.query.chargeToken;
    const reqUserId = caller.userId || (typeof req.query.userId === 'string' ? req.query.userId : undefined);
    const heldRecord = numberOrderHoldMap.get(numericOrderId);

    if (!orderId) {
      res.status(400).json({ error: 'Invalid number ID' });
      return;
    }

    if (provider === 'grizzly') {
      const grizzlyKey = getGrizzlyApiKey();
      if (!grizzlyKey) {
        res.status(503).json({ error: 'Grizzly SMS service unavailable' });
        return;
      }
      try {
        const statusText = await callGrizzlyApi({ action: 'getStatus', id: orderId }, grizzlyKey);
        const parsed = parseGrizzlyStatus(statusText, numericOrderId, 'other');

        let settlement = {
          charged: Boolean(heldRecord?.charged),
          chargedNow: false,
          chargedAmount: 0,
          walletBalance: null as number | null,
          reservedBalance: 0,
          availableBalance: null as number | null,
        };

        if (parsed.sms.length > 0) {
          settlement = await settleNumberOrderChargeIfSmsArrived({
            orderId: numericOrderId,
            smsCount: parsed.sms.length,
            chargeToken,
            fallbackUserId: reqUserId,
            fallbackEmail: caller.email || null,
            provider: 'grizzly',
          });
        } else if (['CANCELED', 'TIMEOUT', 'BANNED'].includes(parsed.status)) {
          const rel = await releaseNumberOrderHold(numericOrderId, chargeToken, reqUserId);
          settlement.walletBalance = rel.walletBalance;
          settlement.reservedBalance = rel.reservedBalance;
          settlement.availableBalance = rel.availableBalance;
        }

        res.json({
          order: {
            id: numericOrderId,
            provider: 'grizzly',
            status: parsed.status,
            sms: parsed.sms,
            charged: settlement.charged,
            chargeOnCode: true,
          },
          chargedNow: settlement.chargedNow,
          chargedAmount: settlement.chargedAmount,
          walletBalance: settlement.walletBalance,
          reservedBalance: settlement.reservedBalance,
          availableBalance: settlement.availableBalance,
        });
      } catch (err) {
        res.status(502).json({
          error: sanitizeNumberApiError(err instanceof Error ? err.message : 'Check failed'),
        });
      }
      return;
    }

    const apiKey = getFiveSimApiKey();
    if (!apiKey) {
      res.status(503).json({ error: 'Number service unavailable' });
      return;
    }

    try {
      const [raw, accountCurrency, rates] = await Promise.all([
        callFiveSimUserApi(`check/${orderId}`, apiKey),
        getFiveSimAccountCurrency(apiKey),
        getExchangeRates(),
      ]);
      const baseOrder = toPublicNumberOrder(
        raw,
        heldRecord?.serviceName,
        heldRecord?.countryCode,
        accountCurrency,
        rates,
        heldRecord?.rawPriceUsd
      );
      const order = {
        ...baseOrder,
        price: heldRecord?.amountNgn || baseOrder.price,
        rawPriceUsd: heldRecord?.rawPriceUsd || baseOrder.rawPriceUsd,
      };

      let settlement = {
        charged: Boolean(heldRecord?.charged),
        chargedNow: false,
        chargedAmount: 0,
        walletBalance: null as number | null,
        reservedBalance: 0,
        availableBalance: null as number | null,
      };

      if (order.sms.length > 0) {
        settlement = await settleNumberOrderChargeIfSmsArrived({
          orderId: numericOrderId,
          smsCount: order.sms.length,
          chargeToken,
          fallbackUserId: reqUserId,
          fallbackEmail: caller.email || null,
          provider: 'fivesim',
          phone: order.phone,
          serviceName: order.serviceName,
          priceNgn: order.price,
        });
      } else if (['CANCELED', 'TIMEOUT', 'BANNED'].includes(order.status)) {
        const rel = await releaseNumberOrderHold(numericOrderId, chargeToken, reqUserId);
        settlement.walletBalance = rel.walletBalance;
        settlement.reservedBalance = rel.reservedBalance;
        settlement.availableBalance = rel.availableBalance;
      }

      res.json({
        order: {
          ...order,
          charged: settlement.charged,
          chargeOnCode: true,
        },
        chargedNow: settlement.chargedNow,
        chargedAmount: settlement.chargedAmount,
        walletBalance: settlement.walletBalance,
        reservedBalance: settlement.reservedBalance,
        availableBalance: settlement.availableBalance,
      });
    } catch (err) {
      res.status(502).json({
        error: sanitizeNumberApiError(err instanceof Error ? err.message : 'Check failed'),
      });
    }
  });

  app.get('/api/numbers/stream/:orderId', async (req, res) => {
    const modEval = await evaluateCallerModeration(req);
    if (modEval.blocked) {
      res.status(403).json({
        code: 'ACCOUNT_MODERATED',
        error: modEval.reason || `Account is currently ${modEval.status}. Access blocked.`,
      });
      return;
    }

    const provider = String(req.query.provider || 'fivesim').toLowerCase();
    const orderId = req.params.orderId.replace(/[^0-9]/g, '');
    const numericOrderId = Number(orderId);
    const chargeToken = req.query.chargeToken;
    const reqUserId =
      modEval.user?.id || (typeof req.query.userId === 'string' ? req.query.userId : undefined);
    const heldRecord = numberOrderHoldMap.get(numericOrderId);
    const apiKey = provider === 'grizzly' ? getGrizzlyApiKey() : getFiveSimApiKey();
    if (!apiKey || !orderId) {
      res.status(400).end();
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let closed = false;
    req.on('close', () => {
      closed = true;
    });

    const [accountCurrency, rates] =
      provider === 'grizzly'
        ? ['USD', await getExchangeRates()]
        : await Promise.all([getFiveSimAccountCurrency(apiKey), getExchangeRates()]);

    const pushOrder = async () => {
      if (closed) return;
      try {
        if (provider === 'grizzly') {
          const statusText = await callGrizzlyApi({ action: 'getStatus', id: orderId }, apiKey);
          const parsed = parseGrizzlyStatus(statusText, numericOrderId, 'other');

          let settlement = {
            charged: Boolean(heldRecord?.charged),
            chargedNow: false,
            chargedAmount: 0,
            walletBalance: null as number | null,
            reservedBalance: 0,
            availableBalance: null as number | null,
          };

          if (parsed.sms.length > 0) {
            settlement = await settleNumberOrderChargeIfSmsArrived({
              orderId: numericOrderId,
              smsCount: parsed.sms.length,
              chargeToken,
              fallbackUserId: reqUserId,
              fallbackEmail: modEval.user?.email || null,
              provider: 'grizzly',
            });
          } else if (['CANCELED', 'TIMEOUT', 'BANNED'].includes(parsed.status)) {
            const rel = await releaseNumberOrderHold(numericOrderId, chargeToken, reqUserId);
            settlement.walletBalance = rel.walletBalance;
            settlement.reservedBalance = rel.reservedBalance;
            settlement.availableBalance = rel.availableBalance;
          }

          const order = {
            id: numericOrderId,
            provider: 'grizzly',
            status: parsed.status,
            sms: parsed.sms,
            charged: settlement.charged,
            chargeOnCode: true,
          };
          res.write(
            `data: ${JSON.stringify({
              type: 'order',
              order,
              chargedNow: settlement.chargedNow,
              chargedAmount: settlement.chargedAmount,
              walletBalance: settlement.walletBalance,
              reservedBalance: settlement.reservedBalance,
              availableBalance: settlement.availableBalance,
            })}\n\n`
          );
          if (['FINISHED', 'CANCELED', 'TIMEOUT', 'BANNED'].includes(order.status)) {
            closed = true;
            clearInterval(interval);
            res.end();
          }
          return;
        }

        const raw = await callFiveSimUserApi(`check/${orderId}`, apiKey);
        const baseOrder = toPublicNumberOrder(
          raw,
          heldRecord?.serviceName,
          heldRecord?.countryCode,
          accountCurrency,
          rates,
          heldRecord?.rawPriceUsd
        );
        const orderPrice = heldRecord?.amountNgn || baseOrder.price;

        let settlement = {
          charged: Boolean(heldRecord?.charged),
          chargedNow: false,
          chargedAmount: 0,
          walletBalance: null as number | null,
          reservedBalance: 0,
          availableBalance: null as number | null,
        };

        if (baseOrder.sms.length > 0) {
          settlement = await settleNumberOrderChargeIfSmsArrived({
            orderId: numericOrderId,
            smsCount: baseOrder.sms.length,
            chargeToken,
            fallbackUserId: reqUserId,
            fallbackEmail: modEval.user?.email || null,
            provider: 'fivesim',
            phone: baseOrder.phone,
            serviceName: baseOrder.serviceName,
            priceNgn: orderPrice,
          });
        } else if (['CANCELED', 'TIMEOUT', 'BANNED'].includes(baseOrder.status)) {
          const rel = await releaseNumberOrderHold(numericOrderId, chargeToken, reqUserId);
          settlement.walletBalance = rel.walletBalance;
          settlement.reservedBalance = rel.reservedBalance;
          settlement.availableBalance = rel.availableBalance;
        }

        const order = {
          ...baseOrder,
          price: orderPrice,
          rawPriceUsd: heldRecord?.rawPriceUsd || baseOrder.rawPriceUsd,
          charged: settlement.charged,
          chargeOnCode: true,
        };
        res.write(
          `data: ${JSON.stringify({
            type: 'order',
            order,
            chargedNow: settlement.chargedNow,
            chargedAmount: settlement.chargedAmount,
            walletBalance: settlement.walletBalance,
            reservedBalance: settlement.reservedBalance,
            availableBalance: settlement.availableBalance,
          })}\n\n`
        );
        if (['FINISHED', 'CANCELED', 'TIMEOUT', 'BANNED'].includes(order.status)) {
          closed = true;
          clearInterval(interval);
          res.end();
        }
      } catch (err) {
        res.write(
          `data: ${JSON.stringify({
            type: 'error',
            error: sanitizeNumberApiError(err instanceof Error ? err.message : 'Stream error'),
          })}\n\n`
        );
      }
    };

    await pushOrder();
    const interval = setInterval(() => {
      void pushOrder();
    }, 2500);

    req.on('close', () => clearInterval(interval));
  });

  app.post('/api/numbers/:action(cancel|finish|ban)/:orderId', async (req, res) => {
    const caller = await assertCallerNotModerated(req, res);
    if (!caller) return;

    const provider = String(req.query.provider || req.body?.provider || 'fivesim').toLowerCase();
    const action = req.params.action;
    const orderId = req.params.orderId.replace(/[^0-9]/g, '');
    const numericOrderId = Number(orderId);
    const chargeToken = req.body?.chargeToken || req.query.chargeToken;
    const reqUserId = caller.userId || req.body?.userId || req.query.userId;
    const reqRefundAmount = Number(req.body?.refundAmount || 0);
    const wasLegacyCharged = Boolean(req.body?.wasCharged);

    if (!orderId) {
      res.status(400).json({ error: 'Invalid number ID' });
      return;
    }

    const heldRecord = numberOrderHoldMap.get(numericOrderId);
    const verifiedToken = verifyOrderChargeToken(chargeToken, numericOrderId);
    const effectiveUserId = reqUserId
      ? normalizeWalletUserId(reqUserId)
      : heldRecord?.userId || verifiedToken?.userId;
    const refundAmountNgn = Math.round(
      heldRecord?.amountNgn ||
        verifiedToken?.amountNgn ||
        (Number.isFinite(reqRefundAmount) && reqRefundAmount > 0 ? reqRefundAmount : 0)
    );

    if (provider === 'grizzly') {
      const grizzlyKey = getGrizzlyApiKey();
      if (!grizzlyKey) {
        res.status(503).json({ error: 'Grizzly SMS service unavailable' });
        return;
      }

      if (action === 'cancel') {
        try {
          const liveStatusText = await callGrizzlyApi({ action: 'getStatus', id: orderId }, grizzlyKey);
          const parsedLive = parseGrizzlyStatus(liveStatusText, numericOrderId, 'other');
          if (parsedLive.sms.length > 0) {
            const settlement = await settleNumberOrderChargeIfSmsArrived({
              orderId: numericOrderId,
              smsCount: parsedLive.sms.length,
              chargeToken,
              fallbackUserId: effectiveUserId,
              fallbackEmail: caller.email || null,
              provider: 'grizzly',
              priceNgn: refundAmountNgn,
            });
            res.status(409).json({
              cancelled: false,
              alreadyHasSms: true,
              error: 'Verification code already arrived on this number — charge finalized.',
              order: {
                id: numericOrderId,
                provider: 'grizzly',
                status: parsedLive.status,
                sms: parsedLive.sms,
                charged: settlement.charged,
                chargeOnCode: true,
              },
              walletBalance: settlement.walletBalance,
              reservedBalance: settlement.reservedBalance,
              availableBalance: settlement.availableBalance,
            });
            return;
          }
        } catch {
          // Continue to setStatus cancel if status probe errored transiently
        }
      }

      const statusCode = action === 'finish' ? '6' : '8';
      try {
        await callGrizzlyApi({ action: 'setStatus', status: statusCode, id: orderId }, grizzlyKey);
        const released = await releaseNumberOrderHold(numericOrderId, chargeToken, effectiveUserId);

        let refunded = false;
        let walletBalance: number | null = released.walletBalance;
        const shouldRefundLegacy =
          action === 'cancel' &&
          (heldRecord?.charged === true || (wasLegacyCharged && !heldRecord)) &&
          effectiveUserId &&
          refundAmountNgn > 0 &&
          !heldRecord?.refunded;

        if (shouldRefundLegacy && effectiveUserId) {
          const adj = await adjustUserWalletBalance({
            userId: effectiveUserId,
            deltaNgn: refundAmountNgn,
            reference: `refund-${orderId}`,
          });
          if (heldRecord) heldRecord.refunded = true;
          refunded = !adj.alreadyProcessed;
          walletBalance = adj.balance;
        }

        res.json({
          cancelled: action === 'cancel',
          holdReleased: action === 'cancel' && !refunded,
          refunded,
          refundedAmount: refunded ? refundAmountNgn : 0,
          walletBalance,
          reservedBalance: released.reservedBalance,
          availableBalance:
            walletBalance !== null ? Math.max(0, walletBalance - released.reservedBalance) : null,
          order: {
            id: numericOrderId,
            provider: 'grizzly',
            status: action === 'finish' ? 'FINISHED' : 'CANCELED',
            charged: Boolean(heldRecord?.charged && !refunded),
          },
        });
      } catch (err) {
        res.status(502).json({
          error: sanitizeNumberApiError(err instanceof Error ? err.message : 'Action failed'),
        });
      }
      return;
    }

    const apiKey = getFiveSimApiKey();
    if (!apiKey) {
      res.status(503).json({ error: 'Number service unavailable' });
      return;
    }

    try {
      const [accountCurrency, rates] = await Promise.all([
        getFiveSimAccountCurrency(apiKey),
        getExchangeRates(),
      ]);

      if (action === 'cancel') {
        try {
          const liveRaw = await callFiveSimUserApi(`check/${orderId}`, apiKey);
          const liveBase = toPublicNumberOrder(
            liveRaw,
            heldRecord?.serviceName,
            heldRecord?.countryCode,
            accountCurrency,
            rates,
            heldRecord?.rawPriceUsd
          );
          const liveOrder = {
            ...liveBase,
            price: heldRecord?.amountNgn || liveBase.price,
          };
          if (liveOrder.sms.length > 0) {
            const settlement = await settleNumberOrderChargeIfSmsArrived({
              orderId: numericOrderId,
              smsCount: liveOrder.sms.length,
              chargeToken,
              fallbackUserId: effectiveUserId,
              fallbackEmail: caller.email || null,
              provider: 'fivesim',
              phone: liveOrder.phone,
              serviceName: liveOrder.serviceName,
              priceNgn: liveOrder.price,
            });
            res.status(409).json({
              cancelled: false,
              alreadyHasSms: true,
              error: 'Verification code already arrived on this number — charge finalized.',
              order: {
                ...liveOrder,
                charged: settlement.charged,
                chargeOnCode: true,
              },
              walletBalance: settlement.walletBalance,
              reservedBalance: settlement.reservedBalance,
              availableBalance: settlement.availableBalance,
            });
            return;
          }
        } catch {
          // Proceed to cancel call
        }
      }

      const raw = await callFiveSimUserApi(`${action}/${orderId}`, apiKey);
      const baseOrder = toPublicNumberOrder(
        raw,
        heldRecord?.serviceName,
        heldRecord?.countryCode,
        accountCurrency,
        rates,
        heldRecord?.rawPriceUsd
      );
      const order = {
        ...baseOrder,
        price: heldRecord?.amountNgn || baseOrder.price,
      };
      const released = await releaseNumberOrderHold(numericOrderId, chargeToken, effectiveUserId);

      let refunded = false;
      let walletBalance: number | null = released.walletBalance;
      const shouldRefundLegacy =
        action === 'cancel' &&
        order.sms.length === 0 &&
        (heldRecord?.charged === true || (wasLegacyCharged && !heldRecord)) &&
        effectiveUserId &&
        (order.price || refundAmountNgn) > 0 &&
        !heldRecord?.refunded;

      if (shouldRefundLegacy && effectiveUserId) {
        const effectiveRefund = Math.round(order.price || refundAmountNgn);
        const adj = await adjustUserWalletBalance({
          userId: effectiveUserId,
          deltaNgn: effectiveRefund,
          reference: `refund-${orderId}`,
        });
        if (heldRecord) heldRecord.refunded = true;
        refunded = !adj.alreadyProcessed;
        walletBalance = adj.balance;
      }

      res.json({
        cancelled: action === 'cancel',
        holdReleased: action === 'cancel' && !refunded,
        refunded,
        refundedAmount: refunded ? Math.round(order.price || refundAmountNgn) : 0,
        walletBalance,
        reservedBalance: released.reservedBalance,
        availableBalance:
          walletBalance !== null ? Math.max(0, walletBalance - released.reservedBalance) : null,
        order: {
          ...order,
          charged: Boolean(heldRecord?.charged && !refunded),
        },
      });
    } catch (err) {
      res.status(502).json({
        error: sanitizeNumberApiError(err instanceof Error ? err.message : 'Action failed'),
      });
    }
  });

  // ==========================================
  // Secure Naira Wallet, Paystack Webhook & Supabase Sync Endpoints
  // ==========================================
  type TransferKind = 'p2p_transfer' | 'deposit' | 'debit' | 'refund';

  interface WalletTxRecord {
    reference: string;
    userId: string;
    email?: string | null;
    amount: number;
    status: string;
    channel?: string | null;
    provider: string;
    txType: TransferKind;
    senderUserId?: string | null;
    senderEmail?: string | null;
    recipientUserId?: string | null;
    recipientEmail?: string | null;
    details?: string | null;
    createdAt: string;
  }

  const walletBalancesMap = new Map<string, number>();
  const walletTxMap = new Map<string, WalletTxRecord>();

  function normalizeWalletUserId(raw?: unknown): string {
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim().slice(0, 128);
    }
    return 'default-wallet';
  }

  function isMissingColumnError(err: { code?: string; message?: string } | null | undefined): boolean {
    if (!err) return false;
    return (
      err.code === '42703' ||
      err.code === 'PGRST204' ||
      /column .* does not exist/i.test(err.message || '') ||
      /could not find the .* column/i.test(err.message || '')
    );
  }

  async function insertWalletTransactionSafe(
    sb: SupabaseClient,
    row: {
      reference: string;
      user_id: string;
      email: string | null;
      amount: number;
      status: string;
      channel: string | null;
      provider: string;
      tx_type: TransferKind;
      sender_user_id: string | null;
      sender_email: string | null;
      recipient_user_id: string | null;
      recipient_email: string | null;
      details: string | null;
    }
  ): Promise<{ error: { code?: string; message?: string } | null }> {
    const first = await sb.from('wallet_transactions').insert(row);
    if (!first.error) return { error: null };
    if (isMissingColumnError(first.error)) {
      const encodedChannel =
        row.tx_type === 'p2p_transfer' && row.sender_email && row.recipient_email
          ? `p2p:${row.sender_email}->${row.recipient_email}`
          : row.channel;
      const fallback = await sb.from('wallet_transactions').insert({
        reference: row.reference,
        user_id: row.user_id,
        email: row.email,
        amount: row.amount,
        status: row.status,
        channel: encodedChannel,
        provider: row.provider,
      });
      return { error: fallback.error };
    }
    return { error: first.error };
  }

  async function lookupWalletEmail(sb: SupabaseClient | null, userId: string): Promise<string | null> {
    if (!sb || !userId || userId === 'default-wallet') return null;
    try {
      const { data } = await sb
        .from('wallets')
        .select('email')
        .eq('user_id', userId)
        .maybeSingle();
      if (data?.email) return String(data.email).trim().toLowerCase();
    } catch {
      // Non-blocking
    }
    return null;
  }

  async function getUserWalletBalance(userId: string): Promise<{
    balance: number | null;
    supabasePersisted: boolean;
  }> {
    const safeUserId = normalizeWalletUserId(userId);
    const sb = getSupabaseServerClient();
    if (sb) {
      try {
        const { data, error } = await sb
          .from('wallets')
          .select('balance')
          .eq('user_id', safeUserId)
          .maybeSingle();
        if (!error && data && typeof data.balance !== 'undefined') {
          const numeric = Math.max(0, Number(data.balance) || 0);
          walletBalancesMap.set(safeUserId, numeric);
          return { balance: numeric, supabasePersisted: true };
        }
        if (!error && !data) {
          const memBal = walletBalancesMap.get(safeUserId) ?? 0;
          return { balance: memBal, supabasePersisted: true };
        }
        if (error) {
          recordAppError({
            source: 'supabase',
            code: error.code || 'WALLET_READ',
            message: `wallets balance query failed: ${error.message}`,
          });
        }
      } catch (err) {
        recordAppError({
          source: 'supabase',
          code: 'WALLET_EX',
          message: err instanceof Error ? err.message : 'wallets balance query threw exception',
        });
      }
    }
    return {
      balance: walletBalancesMap.has(safeUserId) ? walletBalancesMap.get(safeUserId)! : null,
      supabasePersisted: false,
    };
  }

  async function creditUserWallet(params: {
    userId: string;
    email?: string;
    amountNgn: number;
    reference: string;
    channel?: string;
    details?: string;
    provider?: string;
  }): Promise<{
    alreadyProcessed: boolean;
    amount: number;
    balance: number;
    supabasePersisted: boolean;
  }> {
    const safeUserId = normalizeWalletUserId(params.userId);
    const amountNgn = Math.max(0, Math.round(params.amountNgn));
    const sb = getSupabaseServerClient();
    const resolvedEmail =
      (params.email ? params.email.trim().toLowerCase() : null) ||
      (await lookupWalletEmail(sb, safeUserId));
    const providerLabel = params.provider || (params.channel === 'test_credit' ? 'veribox_demo' : 'paystack');
    const detailsText =
      params.details ||
      (params.channel === 'test_credit'
        ? 'Test wallet top-up'
        : `Wallet deposit (${params.channel || 'Paystack'})`);

    if (sb) {
      try {
        const { data: existingTx, error: txLookupErr } = await sb
          .from('wallet_transactions')
          .select('reference, amount, user_id')
          .eq('reference', params.reference)
          .maybeSingle();

        if (!txLookupErr && existingTx) {
          const ownerId = existingTx.user_id || safeUserId;
          const { data: walletRow } = await sb
            .from('wallets')
            .select('balance')
            .eq('user_id', ownerId)
            .maybeSingle();
          const currentBalance = Math.max(0, Number(walletRow?.balance ?? 0));
          walletBalancesMap.set(ownerId, currentBalance);
          return {
            alreadyProcessed: true,
            amount: Math.round(Number(existingTx.amount) || amountNgn),
            balance: currentBalance,
            supabasePersisted: true,
          };
        }

        if (!txLookupErr) {
          const { error: insertTxErr } = await insertWalletTransactionSafe(sb, {
            reference: params.reference,
            user_id: safeUserId,
            email: resolvedEmail,
            amount: amountNgn,
            status: 'success',
            channel: params.channel || null,
            provider: providerLabel,
            tx_type: 'deposit',
            sender_user_id: null,
            sender_email: providerLabel === 'paystack' ? 'Paystack Checkout' : 'VeriBox Test Credit',
            recipient_user_id: safeUserId,
            recipient_email: resolvedEmail,
            details: detailsText,
          });

          if (insertTxErr) {
            recordAppError({
              source: 'wallet',
              code: insertTxErr.code || 'TX_INSERT',
              message: `wallet_transactions deposit insert failed: ${insertTxErr.message}`,
            });
          } else {
            const { data: walletRow } = await sb
              .from('wallets')
              .select('balance, email')
              .eq('user_id', safeUserId)
              .maybeSingle();

            const prevBal = Math.max(
              0,
              Number(walletRow?.balance ?? walletBalancesMap.get(safeUserId) ?? 0)
            );
            const newBal = prevBal + amountNgn;

            const { error: upsertErr } = await sb.from('wallets').upsert(
              {
                user_id: safeUserId,
                email: resolvedEmail || walletRow?.email || null,
                balance: newBal,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'user_id' }
            );

            if (!upsertErr) {
              walletBalancesMap.set(safeUserId, newBal);
              walletTxMap.set(params.reference, {
                reference: params.reference,
                userId: safeUserId,
                email: resolvedEmail,
                amount: amountNgn,
                status: 'success',
                channel: params.channel || null,
                provider: providerLabel,
                txType: 'deposit',
                senderUserId: null,
                senderEmail: providerLabel === 'paystack' ? 'Paystack Checkout' : 'VeriBox Test Credit',
                recipientUserId: safeUserId,
                recipientEmail: resolvedEmail,
                details: detailsText,
                createdAt: new Date().toISOString(),
              });
              return {
                alreadyProcessed: false,
                amount: amountNgn,
                balance: newBal,
                supabasePersisted: true,
              };
            }
            recordAppError({
              source: 'wallet',
              code: upsertErr.code || 'WALLET_UPSERT',
              message: `wallets credit upsert failed: ${upsertErr.message}`,
            });
          }
        }
      } catch (err) {
        recordAppError({
          source: 'wallet',
          code: 'CREDIT_EX',
          message: err instanceof Error ? err.message : 'creditUserWallet exception',
        });
      }
    }

    const existingMem = walletTxMap.get(params.reference);
    if (existingMem) {
      return {
        alreadyProcessed: true,
        amount: existingMem.amount,
        balance: walletBalancesMap.get(existingMem.userId) ?? existingMem.amount,
        supabasePersisted: false,
      };
    }

    const prevBal = walletBalancesMap.get(safeUserId) ?? 0;
    const newBal = prevBal + amountNgn;
    walletBalancesMap.set(safeUserId, newBal);
    walletTxMap.set(params.reference, {
      reference: params.reference,
      userId: safeUserId,
      email: resolvedEmail,
      amount: amountNgn,
      status: 'success',
      channel: params.channel || null,
      provider: providerLabel,
      txType: 'deposit',
      senderUserId: null,
      senderEmail: providerLabel === 'paystack' ? 'Paystack Checkout' : 'VeriBox Test Credit',
      recipientUserId: safeUserId,
      recipientEmail: resolvedEmail,
      details: detailsText,
      createdAt: new Date().toISOString(),
    });

    return {
      alreadyProcessed: false,
      amount: amountNgn,
      balance: newBal,
      supabasePersisted: false,
    };
  }

  async function adjustUserWalletBalance(params: {
    userId: string;
    email?: string | null;
    deltaNgn: number;
    reference: string;
    details?: string | null;
  }): Promise<{
    balance: number | null;
    supabasePersisted: boolean;
    alreadyProcessed?: boolean;
    insufficient?: boolean;
  }> {
    const safeUserId = normalizeWalletUserId(params.userId);
    const delta = Math.round(params.deltaNgn);
    const ref = (params.reference || '').trim() || `adj-${Date.now()}`;
    const txType: TransferKind = delta < 0 ? 'debit' : 'refund';
    const txStatus = delta < 0 ? 'debit' : 'refund';
    const detailsText =
      params.details ||
      (delta < 0
        ? ref.startsWith('order-')
          ? 'Private SMS number purchase'
          : ref.startsWith('email-')
            ? 'Custom @veribox.name.ng email creation'
            : 'VeriBox service charge'
        : 'Cancelled order wallet refund');

    const existingMem = walletAdjustmentRefs.get(ref);
    if (existingMem) {
      return {
        balance: walletBalancesMap.get(safeUserId) ?? existingMem.balance,
        supabasePersisted: false,
        alreadyProcessed: true,
      };
    }

    const sb = getSupabaseServerClient();
    const resolvedEmail =
      (params.email ? params.email.trim().toLowerCase() : null) ||
      (await lookupWalletEmail(sb, safeUserId));

    if (sb) {
      try {
        const { data: existingTx } = await sb
          .from('wallet_transactions')
          .select('reference')
          .eq('reference', ref)
          .maybeSingle();

        if (existingTx) {
          const { data: walletRow } = await sb
            .from('wallets')
            .select('balance')
            .eq('user_id', safeUserId)
            .maybeSingle();
          const curBal = Math.max(0, Number(walletRow?.balance ?? walletBalancesMap.get(safeUserId) ?? 0));
          walletBalancesMap.set(safeUserId, curBal);
          walletAdjustmentRefs.set(ref, { balance: curBal, delta });
          return { balance: curBal, supabasePersisted: true, alreadyProcessed: true };
        }

        const { data: walletRow, error: readErr } = await sb
          .from('wallets')
          .select('balance, email')
          .eq('user_id', safeUserId)
          .maybeSingle();

        if (!readErr) {
          const prevBal = Math.max(0, Number(walletRow?.balance ?? walletBalancesMap.get(safeUserId) ?? 0));
          if (delta < 0 && prevBal < Math.abs(delta)) {
            walletBalancesMap.set(safeUserId, prevBal);
            return { balance: prevBal, supabasePersisted: true, insufficient: true };
          }
          const newBal = Math.max(0, prevBal + delta);
          const ownerEmail = resolvedEmail || (walletRow?.email ? String(walletRow.email) : null);
          const { error: upsertErr } = await sb.from('wallets').upsert(
            {
              user_id: safeUserId,
              email: ownerEmail,
              balance: newBal,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          );
          if (!upsertErr) {
            await insertWalletTransactionSafe(sb, {
              reference: ref,
              user_id: safeUserId,
              email: ownerEmail,
              amount: Math.abs(delta),
              status: txStatus,
              channel: delta < 0 ? 'wallet_debit' : 'wallet_refund',
              provider: 'veribox',
              tx_type: txType,
              sender_user_id: delta < 0 ? safeUserId : null,
              sender_email: delta < 0 ? ownerEmail : 'VeriBox Refund',
              recipient_user_id: delta < 0 ? null : safeUserId,
              recipient_email: delta < 0 ? 'VeriBox Service' : ownerEmail,
              details: detailsText,
            }).catch(() => undefined);

            walletTxMap.set(ref, {
              reference: ref,
              userId: safeUserId,
              email: ownerEmail,
              amount: Math.abs(delta),
              status: txStatus,
              channel: delta < 0 ? 'wallet_debit' : 'wallet_refund',
              provider: 'veribox',
              txType,
              senderUserId: delta < 0 ? safeUserId : null,
              senderEmail: delta < 0 ? ownerEmail : 'VeriBox Refund',
              recipientUserId: delta < 0 ? null : safeUserId,
              recipientEmail: delta < 0 ? 'VeriBox Service' : ownerEmail,
              details: detailsText,
              createdAt: new Date().toISOString(),
            });

            walletBalancesMap.set(safeUserId, newBal);
            walletAdjustmentRefs.set(ref, { balance: newBal, delta });
            return { balance: newBal, supabasePersisted: true };
          }
        }
      } catch (err) {
        recordAppError({
          source: 'wallet',
          code: 'ADJ_EX',
          message: err instanceof Error ? err.message : 'adjustUserWalletBalance exception',
        });
      }
    }

    const prevBal = walletBalancesMap.get(safeUserId) ?? 0;
    if (delta < 0 && prevBal < Math.abs(delta)) {
      return { balance: prevBal, supabasePersisted: false, insufficient: true };
    }
    const newBal = Math.max(0, prevBal + delta);
    walletBalancesMap.set(safeUserId, newBal);
    walletAdjustmentRefs.set(ref, { balance: newBal, delta });
    walletTxMap.set(ref, {
      reference: ref,
      userId: safeUserId,
      email: resolvedEmail,
      amount: Math.abs(delta),
      status: txStatus,
      channel: delta < 0 ? 'wallet_debit' : 'wallet_refund',
      provider: 'veribox',
      txType,
      senderUserId: delta < 0 ? safeUserId : null,
      senderEmail: delta < 0 ? resolvedEmail : 'VeriBox Refund',
      recipientUserId: delta < 0 ? null : safeUserId,
      recipientEmail: delta < 0 ? 'VeriBox Service' : resolvedEmail,
      details: detailsText,
      createdAt: new Date().toISOString(),
    });
    return { balance: newBal, supabasePersisted: false };
  }

  app.get('/api/auth/public-config', (_req, res) => {
    const { url, anonKey } = getSupabasePublicConfig();
    res.json({
      configured: Boolean(url && anonKey),
      url: url || null,
      anonKey: anonKey || null,
    });
  });

  app.get('/api/wallet/status', (_req, res) => {
    const key = getPaystackSecretKey();
    const { url: sbUrl, key: sbKey } = getSupabaseServerConfig();
    res.json({
      configured: Boolean(key),
      paystackMode: key ? (key.startsWith('sk_test_') ? 'test' : 'live') : 'unconfigured',
      supabaseConfigured: Boolean(sbUrl && sbKey.length >= 10),
      currency: 'NGN',
    });
  });

  app.get('/api/wallet/balance', async (req, res) => {
    const userId = normalizeWalletUserId(req.query.userId);
    const { balance, supabasePersisted } = await getUserWalletBalance(userId);
    const reservedBalance = getPendingHoldTotalForUser(userId);
    const availableBalance =
      typeof balance === 'number' ? Math.max(0, balance - reservedBalance) : null;
    res.json({
      userId,
      balance,
      reservedBalance,
      availableBalance,
      supabasePersisted,
      currency: 'NGN',
    });
  });

  app.post('/api/wallet/initialize', async (req, res) => {
    const modCaller = await assertCallerNotModerated(req, res);
    if (!modCaller) return;
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount < 100) {
      res.status(400).json({ error: 'Minimum deposit is ₦100' });
      return;
    }

    const userId = normalizeWalletUserId(req.body?.userId);
    const email =
      typeof req.body?.email === 'string' && req.body.email.includes('@')
        ? req.body.email.trim()
        : 'customer@veribox.app';

    const secretKey = getPaystackSecretKey();

    if (!secretKey) {
      res.json({
        configured: false,
        demoMode: true,
        amount,
        userId,
        message: 'Payment gateway key is pending environment configuration.',
      });
      return;
    }

    try {
      const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https');
      const origin =
        (req.headers.origin as string) ||
        (req.headers.referer ? new URL(req.headers.referer as string).origin : '') ||
        `${proto}://${req.headers.host}`;

      const callbackUrl = `${origin}/?payment_verify=1`;

      const response = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
        },
        body: JSON.stringify({
          email,
          amount: Math.round(amount * 100),
          callback_url: callbackUrl,
          channels: ['card', 'bank', 'ussd', 'bank_transfer', 'mobile_money'],
          metadata: {
            walletDeposit: true,
            userId,
            amountNgn: Math.round(amount),
            timestamp: new Date().toISOString(),
          },
        }),
        signal: AbortSignal.timeout(9000),
      });

      const data = (await response.json()) as {
        status?: boolean;
        message?: string;
        data?: {
          authorization_url: string;
          access_code: string;
          reference: string;
        };
      };

      if (!response.ok || !data.status || !data.data?.authorization_url) {
        throw new Error(data.message || `Deposit initialization failed (${response.status})`);
      }

      res.json({
        configured: true,
        authorization_url: data.data.authorization_url,
        access_code: data.data.access_code,
        reference: data.data.reference,
        amount: Math.round(amount),
        userId,
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to initiate deposit right now',
      });
    }
  });

  app.post('/api/wallet/webhook', async (req, res) => {
    const secretKey = getPaystackSecretKey();
    if (!secretKey) {
      res.status(503).json({ error: 'Paystack secret key not configured' });
      return;
    }

    const signature = String(req.headers['x-paystack-signature'] || '').trim();
    const rawBody =
      (req as express.Request & { rawBody?: Buffer }).rawBody ||
      Buffer.from(JSON.stringify(req.body || {}));

    const expectedHash = crypto
      .createHmac('sha512', secretKey)
      .update(rawBody)
      .digest('hex');

    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expectedHash, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      res.status(401).json({ error: 'Invalid Paystack webhook signature' });
      return;
    }

    const eventPayload = req.body as {
      event?: string;
      data?: {
        reference?: string;
        status?: string;
        amount?: number;
        channel?: string;
        customer?: { email?: string };
        metadata?: { userId?: string };
      };
    };

    if (eventPayload?.event === 'charge.success' && eventPayload.data?.reference) {
      const d = eventPayload.data;
      if (d.status && d.status !== 'success') {
        res.status(200).json({ received: true, ignored: true });
        return;
      }
      const amountNgn = Math.round(Number(d.amount || 0) / 100);
      const userId = normalizeWalletUserId(d.metadata?.userId || d.customer?.email);
      if (amountNgn > 0 && d.reference) {
        const result = await creditUserWallet({
          userId,
          email: d.customer?.email,
          amountNgn,
          reference: d.reference,
          channel: d.channel,
        });
        res.status(200).json({
          received: true,
          credited: !result.alreadyProcessed,
          alreadyProcessed: result.alreadyProcessed,
          balance: result.balance,
          supabasePersisted: result.supabasePersisted,
        });
        return;
      }
    }

    res.status(200).json({ received: true });
  });

  app.get('/api/wallet/verify/:reference', async (req, res) => {
    const reference = String(req.params.reference || '').trim();
    const queryUserId = req.query.userId ? normalizeWalletUserId(req.query.userId) : null;
    if (!reference) {
      res.status(400).json({ error: 'Missing transaction reference' });
      return;
    }

    // Check Supabase or memory first in case Paystack webhook already credited this reference
    const sb = getSupabaseServerClient();
    if (sb) {
      try {
        const { data: existingTx } = await sb
          .from('wallet_transactions')
          .select('reference, amount, user_id, channel, email')
          .eq('reference', reference)
          .maybeSingle();

        if (existingTx) {
          const ownerId = existingTx.user_id || queryUserId || 'default-wallet';
          const { balance } = await getUserWalletBalance(ownerId);
          res.json({
            success: true,
            alreadyProcessed: true,
            reference,
            amount: Math.round(Number(existingTx.amount) || 0),
            balance,
            channel: existingTx.channel,
            customer: existingTx.email,
            supabasePersisted: true,
            message: 'Deposit confirmed and synced to your wallet.',
          });
          return;
        }
      } catch {
        // Proceed to Paystack verify
      }
    }

    const memTx = walletTxMap.get(reference);
    if (memTx) {
      res.json({
        success: true,
        alreadyProcessed: true,
        reference,
        amount: memTx.amount,
        balance: walletBalancesMap.get(memTx.userId) ?? memTx.amount,
        channel: memTx.channel,
        customer: memTx.email,
        supabasePersisted: false,
        message: 'This deposit has already been credited.',
      });
      return;
    }

    const secretKey = getPaystackSecretKey();
    if (!secretKey) {
      res.status(400).json({ error: 'Payment gateway is not configured yet' });
      return;
    }

    try {
      const response = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        {
          headers: {
            Authorization: `Bearer ${secretKey}`,
            Accept: 'application/json',
            'User-Agent': USER_AGENT,
          },
          signal: AbortSignal.timeout(9000),
        }
      );

      const data = (await response.json()) as {
        status?: boolean;
        message?: string;
        data?: {
          status: string;
          amount: number;
          reference: string;
          channel?: string;
          customer?: { email?: string };
          metadata?: { userId?: string };
        };
      };

      if (!response.ok || !data.status || !data.data) {
        throw new Error(data.message || 'Verification failed');
      }

      if (data.data.status !== 'success') {
        res.status(400).json({
          success: false,
          status: data.data.status,
          message: `Transaction status is ${data.data.status}`,
        });
        return;
      }

      const creditedNaira = Math.round(data.data.amount / 100);
      const userId = normalizeWalletUserId(
        queryUserId || data.data.metadata?.userId || data.data.customer?.email
      );

      const creditResult = await creditUserWallet({
        userId,
        email: data.data.customer?.email,
        amountNgn: creditedNaira,
        reference: data.data.reference || reference,
        channel: data.data.channel,
      });

      res.json({
        success: true,
        alreadyProcessed: creditResult.alreadyProcessed,
        amount: creditResult.amount,
        balance: creditResult.balance,
        supabasePersisted: creditResult.supabasePersisted,
        reference: data.data.reference,
        channel: data.data.channel,
        customer: data.data.customer?.email,
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Transaction verification failed',
      });
    }
  });

  app.post('/api/wallet/deduct', async (req, res) => {
    const modCaller = await assertCallerNotModerated(req, res);
    if (!modCaller) return;
    const amount = Math.round(Number(req.body?.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Invalid deduction amount' });
      return;
    }
    const caller = await getVerifiedSupabaseBearerUser(req);
    const userId = normalizeWalletUserId(caller?.id || req.body?.userId);
    const reference = String(req.body?.reference || `deduct-${Date.now()}`);
    const details = typeof req.body?.details === 'string' ? req.body.details.trim().slice(0, 140) : null;
    const result = await adjustUserWalletBalance({
      userId,
      email: caller?.email || (typeof req.body?.email === 'string' ? req.body.email : null),
      deltaNgn: -amount,
      reference,
      details,
    });
    if (result.insufficient) {
      res.status(402).json({
        success: false,
        insufficient: true,
        balance: result.balance ?? 0,
        required: amount,
        error: `Insufficient wallet balance (₦${(result.balance ?? 0).toLocaleString()}). Required: ₦${amount.toLocaleString()}. Please top up your wallet.`,
      });
      return;
    }
    res.json({ success: true, ...result });
  });

  app.post('/api/wallet/refund', async (req, res) => {
    const modCaller = await assertCallerNotModerated(req, res);
    if (!modCaller) return;
    const amount = Math.round(Number(req.body?.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Invalid refund amount' });
      return;
    }
    const caller = await getVerifiedSupabaseBearerUser(req);
    const userId = normalizeWalletUserId(caller?.id || req.body?.userId);
    const reference = String(req.body?.reference || `refund-${Date.now()}`);
    const details = typeof req.body?.details === 'string' ? req.body.details.trim().slice(0, 140) : null;
    const result = await adjustUserWalletBalance({
      userId,
      email: caller?.email || (typeof req.body?.email === 'string' ? req.body.email : null),
      deltaNgn: amount,
      reference,
      details,
    });
    res.json({ success: true, ...result });
  });

  app.post('/api/wallet/demo-credit', async (req, res) => {
    const modCaller = await assertCallerNotModerated(req, res);
    if (!modCaller) return;
    if (getPaystackSecretKey()) {
      res.status(403).json({
        error: 'Test credit is disabled when live Paystack checkout is configured.',
      });
      return;
    }
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount < 100 || amount > 500000) {
      res.status(400).json({ error: 'Invalid amount' });
      return;
    }
    const caller = await getVerifiedSupabaseBearerUser(req);
    const userId = normalizeWalletUserId(caller?.id || req.body?.userId);
    const rounded = Math.round(amount);
    const demoRef = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await creditUserWallet({
      userId,
      email: caller?.email || (typeof req.body?.email === 'string' ? req.body.email : undefined),
      amountNgn: rounded,
      reference: demoRef,
      channel: 'test_credit',
      details: 'Test wallet top-up',
      provider: 'veribox_demo',
    });
    res.json({
      success: true,
      amount: rounded,
      balance: result.balance,
      supabasePersisted: result.supabasePersisted,
      demo: true,
      message: `Credit of ₦${rounded.toLocaleString()} added`,
    });
  });

  function normalizeTransferRow(
    raw: Record<string, unknown>,
    userDirectory?: Map<string, { email: string; fullName: string | null }>
  ) {
    const reference = String(raw.reference || '');
    const userId = raw.user_id ? String(raw.user_id) : raw.userId ? String(raw.userId) : '';
    const rowEmail = raw.email ? String(raw.email).trim().toLowerCase() : null;
    const amount = Math.max(0, Number(raw.amount) || 0);
    const status = String(raw.status || 'success').toLowerCase();
    const channel = raw.channel ? String(raw.channel) : null;
    const provider = String(raw.provider || 'veribox');
    const createdAt = String(raw.created_at || raw.createdAt || new Date().toISOString());

    let txType: TransferKind = 'deposit';
    const explicitType = raw.tx_type ? String(raw.tx_type) : raw.txType ? String(raw.txType) : '';
    if (
      explicitType === 'p2p_transfer' ||
      explicitType === 'deposit' ||
      explicitType === 'debit' ||
      explicitType === 'refund'
    ) {
      txType = explicitType;
    } else if (channel?.startsWith('p2p:') || channel === 'p2p_transfer' || reference.startsWith('xfer-')) {
      txType = 'p2p_transfer';
    } else if (status === 'debit' || channel === 'wallet_debit') {
      txType = 'debit';
    } else if (status === 'refund' || channel === 'wallet_refund') {
      txType = 'refund';
    }

    let senderUserId =
      raw.sender_user_id ? String(raw.sender_user_id) : raw.senderUserId ? String(raw.senderUserId) : null;
    let senderEmail =
      raw.sender_email ? String(raw.sender_email).trim().toLowerCase() : raw.senderEmail ? String(raw.senderEmail).trim().toLowerCase() : null;
    let recipientUserId =
      raw.recipient_user_id ? String(raw.recipient_user_id) : raw.recipientUserId ? String(raw.recipientUserId) : null;
    let recipientEmail =
      raw.recipient_email ? String(raw.recipient_email).trim().toLowerCase() : raw.recipientEmail ? String(raw.recipientEmail).trim().toLowerCase() : null;

    if (txType === 'p2p_transfer' && channel && channel.startsWith('p2p:') && (!senderEmail || !recipientEmail)) {
      const [sPart, rPart] = channel.slice(4).split('->');
      if (sPart && !senderEmail) senderEmail = sPart.trim().toLowerCase();
      if (rPart && !recipientEmail) recipientEmail = rPart.trim().toLowerCase();
    }

    const ownerDir = userId ? userDirectory?.get(userId) : undefined;
    const resolvedOwnerEmail = rowEmail || ownerDir?.email || null;

    if (txType === 'p2p_transfer') {
      if (!senderUserId && userId) senderUserId = userId;
      if (!senderEmail && resolvedOwnerEmail) senderEmail = resolvedOwnerEmail;
    } else if (txType === 'deposit') {
      if (!recipientUserId && userId) recipientUserId = userId;
      if (!recipientEmail && resolvedOwnerEmail) recipientEmail = resolvedOwnerEmail;
      if (!senderEmail) {
        senderEmail = provider === 'paystack' ? 'Paystack Checkout' : 'VeriBox Top-up';
      }
    } else if (txType === 'debit') {
      if (!senderUserId && userId) senderUserId = userId;
      if (!senderEmail && resolvedOwnerEmail) senderEmail = resolvedOwnerEmail;
      if (!recipientEmail) recipientEmail = 'VeriBox Service';
    } else if (txType === 'refund') {
      if (!recipientUserId && userId) recipientUserId = userId;
      if (!recipientEmail && resolvedOwnerEmail) recipientEmail = resolvedOwnerEmail;
      if (!senderEmail) senderEmail = 'VeriBox Refund';
    }

    const senderDir = senderUserId ? userDirectory?.get(senderUserId) : undefined;
    const recipientDir = recipientUserId ? userDirectory?.get(recipientUserId) : undefined;
    const senderName = senderDir?.fullName || null;
    const recipientName = recipientDir?.fullName || null;

    const senderLabel =
      senderName && senderEmail && senderEmail.includes('@')
        ? `${senderName} (${senderEmail})`
        : senderEmail || senderUserId || 'External';
    const recipientLabel =
      recipientName && recipientEmail && recipientEmail.includes('@')
        ? `${recipientName} (${recipientEmail})`
        : recipientEmail || recipientUserId || 'VeriBox';

    const details =
      (typeof raw.details === 'string' && raw.details.trim()) ||
      (txType === 'p2p_transfer'
        ? 'Wallet-to-Wallet Transfer'
        : txType === 'deposit'
          ? `Deposit via ${channel || provider || 'Paystack'}`
          : txType === 'refund'
            ? 'Wallet Refund'
            : reference.startsWith('order-')
              ? 'Private SMS Number'
              : reference.startsWith('email-')
                ? 'Custom Email Address'
                : 'Wallet Spend');

    return {
      reference,
      userId,
      txType,
      amount,
      status,
      channel,
      provider,
      details,
      senderUserId,
      senderEmail,
      senderName,
      senderLabel,
      recipientUserId,
      recipientEmail,
      recipientName,
      recipientLabel,
      createdAt,
    };
  }

  app.get('/api/wallet/transfers', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const caller = await getVerifiedSupabaseBearerUser(req);
    if (!caller) {
      res.status(401).json({ error: 'Sign in required to view your transfer history', transfers: [] });
      return;
    }

    const callerId = caller.id;
    const callerEmail = caller.email;
    const sb = getSupabaseServerClient();
    const collected = new Map<string, ReturnType<typeof normalizeTransferRow>>();

    const safeFilterId = callerId.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeLikeEmail = callerEmail.replace(/[\\%_]/g, (m: string) => `\\${m}`);

    if (sb) {
      try {
        let rows: Array<Record<string, unknown>> = [];
        const queryExt = safeFilterId
          ? await sb
              .from('wallet_transactions')
              .select('*')
              .or(
                `user_id.eq.${safeFilterId},sender_user_id.eq.${safeFilterId},recipient_user_id.eq.${safeFilterId}`
              )
              .order('created_at', { ascending: false })
              .limit(120)
          : { data: [], error: null };

        if (!queryExt.error && Array.isArray(queryExt.data)) {
          rows = queryExt.data as Array<Record<string, unknown>>;
        } else if (isMissingColumnError(queryExt.error)) {
          const queryBase = await sb
            .from('wallet_transactions')
            .select('reference, user_id, email, amount, status, channel, provider, created_at')
            .order('created_at', { ascending: false })
            .limit(200);
          if (!queryBase.error && Array.isArray(queryBase.data)) {
            rows = queryBase.data as Array<Record<string, unknown>>;
          }
        } else if (queryExt.error) {
          recordAppError({
            source: 'supabase',
            code: queryExt.error.code || 'USER_TX_ERR',
            message: `User wallet_transactions query failed: ${queryExt.error.message}`,
          });
        }

        // Also include any rows matched strictly by caller email (for legacy Paystack credits)
        if (safeLikeEmail) {
          const emailMatch = await sb
            .from('wallet_transactions')
            .select('*')
            .ilike('email', safeLikeEmail)
            .order('created_at', { ascending: false })
            .limit(60);
          if (!emailMatch.error && Array.isArray(emailMatch.data)) {
            rows = [...rows, ...(emailMatch.data as Array<Record<string, unknown>>)];
          }
        }

        for (const r of rows) {
          const norm = normalizeTransferRow(r);
          if (norm.reference && !collected.has(norm.reference)) {
            collected.set(norm.reference, norm);
          }
        }
      } catch (err) {
        recordAppError({
          source: 'wallet',
          code: 'USER_TX_EX',
          message: err instanceof Error ? err.message : 'Failed to load user transfers',
        });
      }
    }

    for (const mem of walletTxMap.values()) {
      const norm = normalizeTransferRow(mem as unknown as Record<string, unknown>);
      if (norm.reference && !collected.has(norm.reference)) {
        collected.set(norm.reference, norm);
      }
    }

    // Strict defense-in-depth per-user isolation: ONLY include rows belonging to callerId / callerEmail
    const userTransfers = Array.from(collected.values())
      .filter((t) => {
        const matchId =
          t.userId === callerId ||
          t.senderUserId === callerId ||
          t.recipientUserId === callerId;
        const matchEmail =
          Boolean(callerEmail) &&
          (t.senderEmail === callerEmail || t.recipientEmail === callerEmail);
        return matchId || matchEmail;
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 100)
      .map((t) => {
        let direction: 'sent' | 'received' | 'deposit' | 'debit' | 'refund' = t.txType === 'p2p_transfer'
          ? t.recipientUserId === callerId || t.recipientEmail === callerEmail
            ? 'received'
            : 'sent'
          : t.txType;

        const counterpartyLabel =
          direction === 'sent'
            ? `To ${t.recipientEmail || t.recipientLabel}`
            : direction === 'received'
              ? `From ${t.senderEmail || t.senderLabel}`
              : direction === 'deposit'
                ? t.senderLabel
                : direction === 'refund'
                  ? 'VeriBox Refund'
                  : t.recipientLabel;

        return {
          reference: t.reference,
          txType: t.txType,
          direction,
          amount: t.amount,
          status: t.status,
          channel: t.channel,
          provider: t.provider,
          details: t.details,
          senderLabel: t.senderLabel,
          senderEmail: t.senderEmail,
          recipientLabel: t.recipientLabel,
          recipientEmail: t.recipientEmail,
          counterpartyLabel,
          createdAt: t.createdAt,
        };
      });

    res.json({ transfers: userTransfers });
  });

  app.post('/api/wallet/transfer', async (req, res) => {
    const caller = await getVerifiedSupabaseBearerUser(req);
    if (!caller) {
      res.status(401).json({ error: 'Please sign in to send a Naira transfer.' });
      return;
    }

    const modCheck = await assertCallerNotModerated(req, res);
    if (!modCheck) return;

    const sb = getSupabaseServerClient();
    if (!sb) {
      res.status(503).json({ error: 'Supabase database is not configured for wallet transfers.' });
      return;
    }

    const recipientEmail =
      typeof req.body?.recipientEmail === 'string'
        ? req.body.recipientEmail.trim().toLowerCase()
        : '';
    const amount = Math.round(Number(req.body?.amount));
    const note =
      typeof req.body?.note === 'string'
        ? req.body.note.trim().slice(0, 120)
        : typeof req.body?.details === 'string'
          ? req.body.details.trim().slice(0, 120)
          : '';

    if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      res.status(400).json({ error: 'Please enter a valid recipient email address.' });
      return;
    }
    if (recipientEmail === caller.email) {
      res.status(400).json({ error: 'You cannot transfer funds to your own account.' });
      return;
    }
    if (!Number.isFinite(amount) || amount < 50 || amount > 500000) {
      res.status(400).json({ error: 'Transfer amount must be between ₦50 and ₦500,000.' });
      return;
    }

    try {
      // Locate recipient registered user in Supabase Auth (or wallets table)
      let recipientUser: { id: string; email: string; fullName: string | null } | null = null;
      const { data: usersPage, error: listErr } = await sb.auth.admin.listUsers({
        page: 1,
        perPage: 500,
      });
      if (!listErr && Array.isArray(usersPage?.users)) {
        const matched = usersPage.users.find(
          (u) => (u.email || '').trim().toLowerCase() === recipientEmail
        );
        if (matched) {
          const meta = (matched.user_metadata || {}) as Record<string, unknown>;
          recipientUser = {
            id: matched.id,
            email: (matched.email || recipientEmail).trim().toLowerCase(),
            fullName:
              typeof meta.full_name === 'string'
                ? meta.full_name
                : typeof meta.name === 'string'
                  ? meta.name
                  : null,
          };
        }
      }

      if (!recipientUser) {
        const safeRecipientLike = recipientEmail.replace(/[\\%_]/g, (m: string) => `\\${m}`);
        const { data: walletMatch } = await sb
          .from('wallets')
          .select('user_id, email')
          .ilike('email', safeRecipientLike)
          .maybeSingle();
        if (walletMatch?.user_id) {
          recipientUser = {
            id: String(walletMatch.user_id),
            email: String(walletMatch.email || recipientEmail).trim().toLowerCase(),
            fullName: null,
          };
        }
      }

      if (!recipientUser) {
        res.status(404).json({
          error: `No registered VeriBox account found for ${recipientEmail}.`,
        });
        return;
      }

      // Check sender balance and perform atomic conditional debit
      const { data: senderWallet, error: senderReadErr } = await sb
        .from('wallets')
        .select('balance, user_id')
        .eq('user_id', caller.id)
        .maybeSingle();

      if (senderReadErr) {
        recordAppError({
          source: 'supabase',
          code: senderReadErr.code || 'TRANSFER_SENDER_READ',
          message: `Failed reading sender wallet: ${senderReadErr.message}`,
        });
        res.status(500).json({ error: `Could not verify wallet balance: ${senderReadErr.message}` });
        return;
      }

      const senderPrevBal = Math.max(0, Number(senderWallet?.balance ?? 0));

      if (!senderWallet || senderPrevBal < amount) {
        res.status(402).json({
          error: `Insufficient wallet balance (₦${senderPrevBal.toLocaleString()}). Needed: ₦${amount.toLocaleString()}.`,
          balance: senderPrevBal,
        });
        return;
      }

      const senderNewBal = senderPrevBal - amount;
      const { data: debitedRow, error: debitErr } = await sb
        .from('wallets')
        .update({
          balance: senderNewBal,
          email: caller.email,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', caller.id)
        .gte('balance', amount)
        .select('balance')
        .maybeSingle();

      if (debitErr) {
        recordAppError({
          source: 'wallet',
          code: debitErr.code || 'TRANSFER_DEBIT',
          message: `P2P transfer debit failed: ${debitErr.message}`,
        });
        res.status(500).json({ error: `Transfer failed: ${debitErr.message}` });
        return;
      }

      if (!debitedRow) {
        res.status(409).json({
          error: 'Wallet balance changed or is insufficient — please refresh and retry.',
        });
        return;
      }

      const { data: recWallet, error: recReadErr } = await sb
        .from('wallets')
        .select('balance')
        .eq('user_id', recipientUser.id)
        .maybeSingle();
      if (recReadErr) {
        try {
          await sb
            .from('wallets')
            .update({
              balance: Number(debitedRow.balance) + amount,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', caller.id);
        } catch {
          // Best-effort rollback
        }
        recordAppError({
          source: 'supabase',
          code: recReadErr.code || 'TRANSFER_REC_READ',
          message: `Failed reading recipient wallet (rolled back): ${recReadErr.message}`,
        });
        res.status(500).json({ error: `Could not read recipient wallet: ${recReadErr.message}` });
        return;
      }

      const recPrevBal = Math.max(
        0,
        Number(recWallet?.balance ?? walletBalancesMap.get(recipientUser.id) ?? 0)
      );
      const recNewBal = recPrevBal + amount;

      const { error: creditErr } = await sb.from('wallets').upsert(
        {
          user_id: recipientUser.id,
          email: recipientUser.email,
          balance: recNewBal,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      if (creditErr) {
        // Roll back sender debit on recipient credit failure
        try {
          await sb
            .from('wallets')
            .update({
              balance: Number(debitedRow.balance) + amount,
              email: caller.email,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', caller.id);
        } catch {
          // Best-effort rollback
        }
        recordAppError({
          source: 'wallet',
          code: creditErr.code || 'TRANSFER_CREDIT',
          message: `P2P transfer credit failed (rolled back): ${creditErr.message}`,
        });
        res.status(500).json({ error: `Transfer failed while crediting recipient: ${creditErr.message}` });
        return;
      }

      const reference = `xfer-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
      const detailsText = note || `Transfer to ${recipientUser.email}`;
      const createdAt = new Date().toISOString();

      await insertWalletTransactionSafe(sb, {
        reference,
        user_id: caller.id,
        email: caller.email,
        amount,
        status: 'success',
        channel: 'p2p_transfer',
        provider: 'veribox',
        tx_type: 'p2p_transfer',
        sender_user_id: caller.id,
        sender_email: caller.email,
        recipient_user_id: recipientUser.id,
        recipient_email: recipientUser.email,
        details: detailsText,
      });

      walletBalancesMap.set(caller.id, senderNewBal);
      walletBalancesMap.set(recipientUser.id, recNewBal);
      walletTxMap.set(reference, {
        reference,
        userId: caller.id,
        email: caller.email,
        amount,
        status: 'success',
        channel: 'p2p_transfer',
        provider: 'veribox',
        txType: 'p2p_transfer',
        senderUserId: caller.id,
        senderEmail: caller.email,
        recipientUserId: recipientUser.id,
        recipientEmail: recipientUser.email,
        details: detailsText,
        createdAt,
      });

      res.json({
        ok: true,
        reference,
        balance: senderNewBal,
        transfer: {
          reference,
          txType: 'p2p_transfer',
          direction: 'sent',
          amount,
          status: 'success',
          channel: 'p2p_transfer',
          provider: 'veribox',
          details: detailsText,
          senderLabel: caller.email,
          senderEmail: caller.email,
          recipientLabel: recipientUser.fullName
            ? `${recipientUser.fullName} (${recipientUser.email})`
            : recipientUser.email,
          recipientEmail: recipientUser.email,
          counterpartyLabel: `To ${recipientUser.email}`,
          createdAt,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transfer failed';
      recordAppError({ source: 'wallet', code: 'TRANSFER_EX', message: msg });
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/admin/transfers', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const verified = await verifyOwnerAdminRequest(req, res);
    if (!verified) return;
    const sb = verified.supabase;

    try {
      const [txRes, usersRes, walletsRes] = await Promise.all([
        sb
          .from('wallet_transactions')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200),
        sb.auth.admin.listUsers({ page: 1, perPage: 500 }),
        sb.from('wallets').select('user_id, email'),
      ]);

      if (txRes.error) {
        recordAppError({
          source: 'supabase',
          code: txRes.error.code || 'ADMIN_TX_ERR',
          message: `Admin wallet_transactions query failed: ${txRes.error.message}`,
        });
      }

      const userDir = new Map<string, { email: string; fullName: string | null }>();
      if (!usersRes.error && Array.isArray(usersRes.data?.users)) {
        for (const u of usersRes.data.users) {
          const meta = (u.user_metadata || {}) as Record<string, unknown>;
          userDir.set(u.id, {
            email: (u.email || '').trim().toLowerCase(),
            fullName:
              typeof meta.full_name === 'string'
                ? meta.full_name
                : typeof meta.name === 'string'
                  ? meta.name
                  : null,
          });
        }
      }
      if (!walletsRes.error && Array.isArray(walletsRes.data)) {
        for (const w of walletsRes.data) {
          const uid = String(w.user_id || '');
          const wEmail = w.email ? String(w.email).trim().toLowerCase() : '';
          if (uid && wEmail && !userDir.has(uid)) {
            userDir.set(uid, { email: wEmail, fullName: null });
          }
        }
      }

      const merged = new Map<string, ReturnType<typeof normalizeTransferRow>>();
      if (!txRes.error && Array.isArray(txRes.data)) {
        for (const row of txRes.data) {
          const norm = normalizeTransferRow(row as Record<string, unknown>, userDir);
          if (norm.reference && !merged.has(norm.reference)) {
            merged.set(norm.reference, norm);
          }
        }
      }
      for (const mem of walletTxMap.values()) {
        const norm = normalizeTransferRow(mem as unknown as Record<string, unknown>, userDir);
        if (norm.reference && !merged.has(norm.reference)) {
          merged.set(norm.reference, norm);
        }
      }

      const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
      const filter = typeof req.query.filter === 'string' ? req.query.filter.trim().toLowerCase() : 'all';

      const transfers = Array.from(merged.values())
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .filter((t) => {
          if (filter === 'p2p' && t.txType !== 'p2p_transfer') return false;
          if (filter === 'deposit' && t.txType !== 'deposit') return false;
          if (filter === 'debit' && t.txType !== 'debit') return false;
          if (filter === 'refund' && t.txType !== 'refund') return false;
          if (filter === 'issues' && !['pending', 'failed', 'error'].includes(t.status)) {
            return false;
          }
          if (!q) return true;
          return (
            t.reference.toLowerCase().includes(q) ||
            t.senderLabel.toLowerCase().includes(q) ||
            t.recipientLabel.toLowerCase().includes(q) ||
            (t.senderEmail || '').toLowerCase().includes(q) ||
            (t.recipientEmail || '').toLowerCase().includes(q) ||
            t.details.toLowerCase().includes(q) ||
            t.status.toLowerCase().includes(q)
          );
        })
        .slice(0, 150)
        .map(({ userId: _uid, ...rest }) => rest);

      res.json({
        transfers,
        probeError: txRes.error ? txRes.error.message : null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load transfer history';
      recordAppError({ source: 'wallet', code: 'ADMIN_TX_EX', message: msg });
      res.status(500).json({ error: msg, transfers: [] });
    }
  });

  // ==========================================
  // Free Image Generator Endpoints (Pollinations + AI Horde)
  // ==========================================
  const IMAGE_DIMENSIONS: Record<string, { width: number; height: number }> = {
    '1:1': { width: 512, height: 512 },
    '16:9': { width: 576, height: 320 },
    '9:16': { width: 320, height: 576 },
    '4:3': { width: 576, height: 448 },
    '3:4': { width: 448, height: 576 },
  };

  const STYLE_PROMPT_SUFFIX: Record<string, string> = {
    none: '',
    photorealistic: ', photorealistic, ultra sharp, natural lighting, 8k DSLR photograph',
    '3d': ', 3D octane render, cinema4d, soft studio lighting, polished materials',
    cyberpunk: ', cyberpunk neon city aesthetic, moody rain reflections, volumetric glow',
    anime: ', high quality modern anime illustration, crisp lineart, vibrant cel shading',
    logo: ', clean minimalist vector logo design, centered composition, sharp flat shapes',
  };

  async function downloadImageAsDataUrl(imageUrl: string): Promise<{
    dataUrl: string;
    mimeType: string;
  }> {
    const imgRes = await fetch(imageUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(6500),
    });
    if (!imgRes.ok) {
      throw new Error(`Image download failed (${imgRes.status})`);
    }
    const contentType = (imgRes.headers.get('content-type') || 'image/webp').split(';')[0].trim();
    if (!contentType.startsWith('image/')) {
      throw new Error('Upstream did not return a valid image');
    }
    const arrBuf = await imgRes.arrayBuffer();
    if (arrBuf.byteLength < 1024) {
      throw new Error('Generated image buffer was empty');
    }
    const base64 = Buffer.from(arrBuf).toString('base64');
    return {
      dataUrl: `data:${contentType};base64,${base64}`,
      mimeType: contentType,
    };
  }

  async function readUpstreamJson<T>(res: Response): Promise<T | null> {
    const txt = await res.text().catch(() => '');
    if (!txt || !txt.trim().startsWith('{')) return null;
    try {
      return JSON.parse(txt) as T;
    } catch {
      return null;
    }
  }

  app.post('/api/images/generate', async (req, res) => {
    const modCaller = await assertCallerNotModerated(req, res);
    if (!modCaller) return;
    const rawPrompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    if (!rawPrompt || rawPrompt.length < 3) {
      res.status(400).json({ error: 'Please enter a descriptive prompt (at least 3 characters).' });
      return;
    }

    const style = typeof req.body?.style === 'string' ? req.body.style.toLowerCase() : 'none';
    const aspectRatio =
      typeof req.body?.aspectRatio === 'string' && IMAGE_DIMENSIONS[req.body.aspectRatio]
        ? req.body.aspectRatio
        : '1:1';
    const dims = IMAGE_DIMENSIONS[aspectRatio];
    const seed =
      typeof req.body?.seed === 'number' && Number.isFinite(req.body.seed)
        ? Math.abs(Math.round(req.body.seed))
        : Math.floor(Math.random() * 9999999);

    const suffix = STYLE_PROMPT_SUFFIX[style] || '';
    const enhancedPrompt = `${rawPrompt.slice(0, 650)}${suffix}`;

    // 1. Fast path: try Pollinations free tier first (5.5s timeout so total route always stays < 9.5s on Vercel)
    try {
      const pollUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
        enhancedPrompt
      )}?width=${dims.width}&height=${dims.height}&seed=${seed}&nologo=true`;
      const pollRes = await fetch(pollUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(5500),
      });
      const contentType = (pollRes.headers.get('content-type') || '').split(';')[0].trim();
      if (pollRes.ok && contentType.startsWith('image/')) {
        const arrBuf = await pollRes.arrayBuffer();
        if (arrBuf.byteLength > 2048) {
          const base64 = Buffer.from(arrBuf).toString('base64');
          res.json({
            status: 'done',
            imageDataUrl: `data:${contentType};base64,${base64}`,
            mimeType: contentType,
            prompt: rawPrompt,
            enhancedPrompt,
            width: dims.width,
            height: dims.height,
            seed,
            provider: 'pollinations',
          });
          return;
        }
      }
    } catch {
      // Fall through cleanly to AI Horde async cluster
    }

    // 2. Reliable Free Distributed Cluster: submit AI Horde job immediately and let client poll /api/images/status/:jobId
    try {
      const hordeReq = await fetch('https://aihorde.net/api/v2/generate/async', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: '0000000000',
          'Client-Agent': 'VeriBox:1.0:veribox.app',
          'User-Agent': USER_AGENT,
        },
        body: JSON.stringify({
          prompt: enhancedPrompt,
          params: {
            sampler_name: 'k_euler_a',
            cfg_scale: 7,
            seed: String(seed),
            steps: 18,
            width: dims.width,
            height: dims.height,
            n: 1,
          },
          nsfw: false,
          censor_nsfw: true,
          trusted_workers: false,
          r2: true,
        }),
        signal: AbortSignal.timeout(3500),
      });

      const hordeData = await readUpstreamJson<{ id?: string; message?: string }>(hordeReq);
      if (!hordeReq.ok || !hordeData?.id) {
        throw new Error(hordeData?.message || `Image generator queue unavailable (${hordeReq.status})`);
      }

      res.status(202).json({
        status: 'pending',
        jobId: hordeData.id,
        provider: 'AI Horde',
        queuePosition: 0,
        waitTime: 12,
        width: dims.width,
        height: dims.height,
        seed,
        prompt: rawPrompt,
        enhancedPrompt,
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to generate image right now.',
      });
    }
  });

  app.get('/api/images/status/:jobId', async (req, res) => {
    const jobId = String(req.params.jobId || '').trim();
    if (!jobId) {
      res.status(400).json({ error: 'Missing image job ID' });
      return;
    }

    try {
      const checkRes = await fetch(
        `https://aihorde.net/api/v2/generate/check/${encodeURIComponent(jobId)}`,
        {
          headers: {
            'Client-Agent': 'VeriBox:1.0:veribox.app',
            'User-Agent': USER_AGENT,
          },
          signal: AbortSignal.timeout(5000),
        }
      );

      if (!checkRes.ok) {
        if (checkRes.status === 404) {
          res.status(404).json({ error: 'Image job expired or not found.' });
          return;
        }
        throw new Error(`Status check failed (${checkRes.status})`);
      }

      const checkData = await readUpstreamJson<{
        done?: boolean;
        faulted?: boolean;
        is_possible?: boolean;
        queue_position?: number;
        wait_time?: number;
        processing?: number;
        waiting?: number;
      }>(checkRes);

      if (!checkData) {
        res.json({
          status: 'pending',
          jobId,
          queuePosition: 0,
          waitTime: 10,
        });
        return;
      }

      if (checkData.faulted || checkData.is_possible === false) {
        res.status(502).json({ error: 'Generation failed in free worker queue. Please try again.' });
        return;
      }

      if (!checkData.done) {
        res.json({
          status: 'pending',
          jobId,
          queuePosition: checkData.queue_position ?? 0,
          waitTime: checkData.wait_time ?? 10,
          processing: checkData.processing ?? 0,
          waiting: checkData.waiting ?? 0,
        });
        return;
      }

      const statusRes = await fetch(
        `https://aihorde.net/api/v2/generate/status/${encodeURIComponent(jobId)}`,
        {
          headers: {
            'Client-Agent': 'VeriBox:1.0:veribox.app',
            'User-Agent': USER_AGENT,
          },
          signal: AbortSignal.timeout(5000),
        }
      );

      const statusData = await readUpstreamJson<{
        generations?: Array<{ img?: string; model?: string }>;
      }>(statusRes);
      const firstGen = statusData?.generations?.[0];
      if (!firstGen?.img) {
        throw new Error('Completed job did not return an image.');
      }

      const { dataUrl, mimeType } = await downloadImageAsDataUrl(firstGen.img);
      res.json({
        status: 'done',
        jobId,
        imageDataUrl: dataUrl,
        mimeType,
        provider: firstGen.model ? `AI Horde (${firstGen.model})` : 'AI Horde',
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to check image status',
      });
    }
  });

  // ==========================================
  // VeriBox AI Assistant Chat + Photo Vision + Image Intent Router
  // ==========================================
  const VERIBOX_AI_SYSTEM_PROMPT = `You are VeriBox AI, the friendly smart assistant inside the VeriBox web app.
You help users with both general questions/conversation, analyzing uploaded photos, AND knowing when they want to generate an image.

About the VeriBox app (answer accurately when asked):
- Home tab: Active custom @${CUSTOM_EMAIL_DOMAIN} inbox with live auto-refresh, 1-click verification code copy, switching between created addresses, and safe removal from Home (recoverable anytime with its password).
- Create tab: Create a custom password-protected @${CUSTOM_EMAIL_DOMAIN} email address (Personal use, Work/business, or High-privacy stealth) by entering First & Second Name, Birthday, choosing a suggested or custom username@${CUSTOM_EMAIL_DOMAIN} (₦50 fee from Naira wallet), setting a password, and confirming terms. Returning users can also sign in with an existing or deleted @${CUSTOM_EMAIL_DOMAIN} email + password for free.
- Numbers tab: Dedicated verification phone numbers powered by Grizzly SMS and 5sim across 200+ countries (A–Z and Lowest Price views) for WhatsApp, Telegram, TikTok, Instagram, Google, Facebook, X/Twitter, PayPal, and more. Receives OTPs in real time and automatically refunds the full Naira amount if cancelled or expired before an SMS arrives.
- VeriBox AI (Images tab): Normal AI chat assistant, uploaded photo analyzer, and unlimited 100% free AI image generator.
- Wallet & Profile: Real Naira wallet funded via Paystack, saved numbers, OTP clipboard history, and theme settings.

Classification & Output rules:
You MUST return strict JSON with keys: "intent", "reply", and "imagePrompt".
- Set "intent" to "generate_image" ONLY when the user is explicitly asking you to create, generate, draw, paint, design, render, or make an image/picture/logo/wallpaper/avatar/artwork (for example: "draw a lion", "generate a gold logo", "make an anime picture of Lagos"). In that case, put a rich descriptive English visual prompt in "imagePrompt" (incorporating visual details from any uploaded image if they asked to recreate/transform it) and write a brief friendly message in "reply" like "Creating that image for you now...".
- Set "intent" to "chat" for everything else: greetings, chatting normally, questions about VeriBox, analyzing/describing/answering questions about an uploaded photo, brainstorming, or writing. In that case, set "imagePrompt" to "" and write a clear, helpful, concise answer in "reply".`;

  function parseAiJsonReply(rawText: string): {
    intent: 'chat' | 'generate_image';
    reply: string;
    imagePrompt: string;
  } {
    const cleaned = rawText
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    try {
      const parsed = JSON.parse(cleaned) as {
        intent?: string;
        reply?: string;
        imagePrompt?: string;
      };
      const intent = parsed.intent === 'generate_image' ? 'generate_image' : 'chat';
      const reply = typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim() : cleaned;
      const imagePrompt = typeof parsed.imagePrompt === 'string' ? parsed.imagePrompt.trim() : '';
      return { intent, reply, imagePrompt };
    } catch {
      return {
        intent: 'chat',
        reply: rawText.trim() || 'How can I help you today?',
        imagePrompt: '',
      };
    }
  }

  function looksLikeImageRequest(text: string): boolean {
    const lower = text.toLowerCase();
    return /\b(generate|create|draw|paint|sketch|render|design|illustrate|make)\b.{0,40}\b(image|picture|photo|logo|art|artwork|wallpaper|avatar|portrait|illustration|banner|icon|poster)\b|\b(draw me|generate a|create a picture|image of)\b/i.test(
      lower
    );
  }

  app.post('/api/ai/chat', async (req, res) => {
    const modCaller = await assertCallerNotModerated(req, res);
    if (!modCaller) return;
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const mode = req.body?.mode === 'chat' || req.body?.mode === 'image' ? req.body.mode : 'auto';
    const imageDataUrl =
      typeof req.body?.imageDataUrl === 'string' && req.body.imageDataUrl.startsWith('data:image/')
        ? req.body.imageDataUrl
        : undefined;
    const rawHistory = Array.isArray(req.body?.history) ? req.body.history.slice(-8) : [];

    if (!message && !imageDataUrl) {
      res.status(400).json({ error: 'Please type a message or attach an image.' });
      return;
    }

    const userPromptText =
      message || 'Describe this uploaded image clearly and suggest what I can do with it.';

    // Parse base64 payload if user attached a photo
    let inlineImage: { mimeType: string; data: string } | null = null;
    if (imageDataUrl) {
      const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageDataUrl);
      if (match) {
        inlineImage = { mimeType: match[1], data: match[2] };
      }
    }

    const geminiKey = String(process.env.GEMINI_API_KEY || '').trim();

    if (geminiKey) {
      try {
        const ai = new GoogleGenAI({
          apiKey: geminiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const historyText = rawHistory
          .filter(
            (h: unknown): h is { role: string; text: string } =>
              Boolean(h && typeof h === 'object' && typeof (h as { text?: string }).text === 'string')
          )
          .map((h: { role: string; text: string }) => `${h.role === 'assistant' ? 'Assistant' : 'User'}: ${h.text.slice(0, 600)}`)
          .join('\n');

        const modeHint =
          mode === 'image'
            ? '\n[Mode override: User explicitly selected Generate Image mode. Return intent="generate_image" with a detailed visual imagePrompt.]'
            : mode === 'chat'
              ? '\n[Mode override: User explicitly selected Chat mode. Return intent="chat" and answer directly without triggering image generation.]'
              : '';

        const combinedText = `${historyText ? `Recent conversation:\n${historyText}\n\n` : ''}User: ${userPromptText}${modeHint}`;

        const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
        if (inlineImage) {
          parts.push({ inlineData: inlineImage });
        }
        parts.push({ text: combinedText });

        const response: GenerateContentResponse = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: { parts },
          config: {
            systemInstruction: VERIBOX_AI_SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                intent: {
                  type: Type.STRING,
                  description: 'Either "chat" or "generate_image".',
                },
                reply: {
                  type: Type.STRING,
                  description: 'Conversational reply to show to the user.',
                },
                imagePrompt: {
                  type: Type.STRING,
                  description: 'Rich image generation prompt when intent is generate_image, otherwise empty string.',
                },
              },
            },
          },
        });

        const parsed = parseAiJsonReply(response.text || '');
        const finalIntent =
          mode === 'image'
            ? 'generate_image'
            : mode === 'chat'
              ? 'chat'
              : parsed.intent;

        res.json({
          intent: finalIntent,
          reply: parsed.reply,
          imagePrompt:
            finalIntent === 'generate_image' ? parsed.imagePrompt || userPromptText : '',
          provider: 'Gemini AI',
        });
        return;
      } catch (err) {
        // If Pollinations text fallback fails too, surface clear error below
        console.warn('Gemini AI chat fallback check:', err instanceof Error ? err.message : err);
      }
    }

    // Fast-path direct image generation prompts when Gemini prompt-refiner is absent
    if (!geminiKey && (mode === 'image' || (mode === 'auto' && !imageDataUrl && looksLikeImageRequest(userPromptText)))) {
      res.json({
        intent: 'generate_image',
        reply: 'Creating that image for you now!',
        imagePrompt: userPromptText,
        provider: 'VeriBox AI',
      });
      return;
    }

    // Secondary free upstream LLM endpoint (works seamlessly even if GEMINI_API_KEY isn't configured yet)
    try {
      const modeDirective =
        mode === 'image'
          ? 'The user selected Generate Image mode. Set intent="generate_image" and craft a vivid imagePrompt.'
          : mode === 'chat'
            ? 'The user selected Chat mode. Set intent="chat" and answer naturally.'
            : 'Automatically decide whether intent is "chat" or "generate_image".';

      const upstreamMessages: Array<{
        role: 'system' | 'user' | 'assistant';
        content:
          | string
          | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
      }> = [
        {
          role: 'system',
          content: `${VERIBOX_AI_SYSTEM_PROMPT}\n${modeDirective}\nRespond ONLY with valid JSON: {"intent":"chat"|"generate_image","reply":"...","imagePrompt":"..."}`,
        },
      ];

      for (const item of rawHistory) {
        if (item && typeof item.text === 'string' && item.text.trim()) {
          upstreamMessages.push({
            role: item.role === 'assistant' ? 'assistant' : 'user',
            content: item.text.slice(0, 600),
          });
        }
      }

      if (imageDataUrl) {
        upstreamMessages.push({
          role: 'user',
          content: [
            { type: 'text', text: userPromptText },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        });
      } else {
        upstreamMessages.push({
          role: 'user',
          content: userPromptText,
        });
      }

      const callPollinationsText = async (modelName: string, withImage: boolean) => {
        const msgs = withImage
          ? upstreamMessages
          : upstreamMessages.map((m) =>
              Array.isArray(m.content)
                ? {
                    role: m.role,
                    content: `${userPromptText} (Note: user attached a photo for context)`,
                  }
                : m
            );

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 9000);
        try {
          const r = await fetch('https://text.pollinations.ai/openai', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': USER_AGENT,
            },
            body: JSON.stringify({
              model: modelName,
              messages: msgs,
              jsonMode: true,
            }),
            signal: controller.signal,
          });
          if (!r.ok) {
            return { ok: false as const, status: r.status, rawContent: '' };
          }
          const aiJson = (await r.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          return {
            ok: true as const,
            status: r.status,
            rawContent: aiJson.choices?.[0]?.message?.content || '',
          };
        } finally {
          clearTimeout(timer);
        }
      };

      // Try openai-fast first (highest reliability/no 402 burst limit), then openai fallback
      let result = await callPollinationsText('openai-fast', Boolean(imageDataUrl));
      if (!result.ok && imageDataUrl) {
        result = await callPollinationsText('openai-fast', false);
      }
      if (!result.ok) {
        result = await callPollinationsText('openai', false);
      }

      if (!result.ok) {
        throw new Error(`AI chat upstream unavailable (${result.status})`);
      }

      const parsed = parseAiJsonReply(result.rawContent);

      const fallbackIntent =
        mode === 'image'
          ? 'generate_image'
          : mode === 'chat'
            ? 'chat'
            : parsed.intent === 'generate_image' || (!imageDataUrl && looksLikeImageRequest(userPromptText))
              ? 'generate_image'
              : 'chat';

      res.json({
        intent: fallbackIntent,
        reply: parsed.reply,
        imagePrompt:
          fallbackIntent === 'generate_image' ? parsed.imagePrompt || userPromptText : '',
        provider: 'VeriBox AI',
      });
    } catch (err) {
      if (mode === 'image' || (mode === 'auto' && !imageDataUrl && looksLikeImageRequest(userPromptText))) {
        res.json({
          intent: 'generate_image',
          reply: 'Creating that image for you now!',
          imagePrompt: userPromptText,
          provider: 'VeriBox AI',
        });
        return;
      }
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to reach VeriBox AI right now.',
      });
    }
  });

  // Ensure unmatched /api/* routes and errors ALWAYS return JSON (never Express HTML)
  app.use('/api', (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.path}` });
  });

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      if (res.headersSent) return;
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Unexpected server error',
      });
    }
  );

  return app;
}
