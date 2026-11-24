import 'dotenv/config';
import crypto from 'node:crypto';
import vm from 'node:vm';
import express from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

export function extractOtpCode(text: string): string | null {
  if (!text) return null;
  const prefixed = text.match(/\b(?:G-|FB-|IG-|WA-|TT-)?(\d{3}-\d{3})\b/i);
  if (prefixed) return prefixed[0].replace(/^[^0-9]+/, '');

  const contextual = text.match(
    /(?:code|otp|pin|verification|verify|passcode|token|confirmation|رمز|código|код)[^\d]{0,24}(\d{4,8})\b/i
  );
  if (contextual) return contextual[1];

  const standalone = text.match(/\b(\d{4,8})\b/);
  if (standalone) return standalone[1];

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
// Multi-Provider Disposable Email Helpers
// ==========================================
const mailTmDomainsCache: { data: string[]; expiresAt: number } = { data: [], expiresAt: 0 };
const tempMailIoDomainsCache: { data: string[]; expiresAt: number } = { data: [], expiresAt: 0 };

async function getMailTmDomains(): Promise<string[]> {
  if (mailTmDomainsCache.data.length > 0 && Date.now() < mailTmDomainsCache.expiresAt) {
    return mailTmDomainsCache.data;
  }
  const response = await fetch('https://api.mail.tm/domains?page=1', {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) {
    return mailTmDomainsCache.data;
  }
  const json = (await response.json()) as
    | { 'hydra:member'?: Array<{ domain: string; isActive: boolean }> }
    | Array<{ domain: string; isActive: boolean }>;
  const list = Array.isArray(json) ? json : json['hydra:member'] || [];
  const domains = list.filter((d) => d.isActive !== false && d.domain).map((d) => d.domain);
  if (domains.length > 0) {
    mailTmDomainsCache.data = domains;
    mailTmDomainsCache.expiresAt = Date.now() + 5 * 60 * 1000;
  }
  return domains;
}

function randomTokenString(len: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

async function createMailTmAccount(username?: string, requestedDomain?: string, customPassword?: string) {
  const domains = await getMailTmDomains();
  if (domains.length === 0) throw new Error('Mail.tm domains unavailable');

  const domain = requestedDomain && domains.includes(requestedDomain) ? requestedDomain : domains[0];
  const cleanPrefix = (username || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 24);
  const prefix = cleanPrefix.length >= 3 ? cleanPrefix : `vbox.${randomTokenString(6)}`;
  const password =
    customPassword && customPassword.trim().length >= 6
      ? customPassword.trim()
      : `Vb!${randomTokenString(12)}9`;

  let address = `${prefix}@${domain}`;
  let createRes = await fetch('https://api.mail.tm/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({ address, password }),
    signal: AbortSignal.timeout(4000),
  });

  if (createRes.status === 422) {
    address = `${prefix}.${randomTokenString(4)}@${domain}`;
    createRes = await fetch('https://api.mail.tm/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ address, password }),
      signal: AbortSignal.timeout(4000),
    });
  }

  if (!createRes.ok) {
    throw new Error(`Mail.tm error ${createRes.status}`);
  }

  const account = (await createRes.json()) as { id: string; address: string; createdAt?: string };
  const tokenRes = await fetch('https://api.mail.tm/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({ address: account.address, password }),
    signal: AbortSignal.timeout(4000),
  });
  if (!tokenRes.ok) throw new Error('Mail.tm login failed');
  const tokenJson = (await tokenRes.json()) as { token: string };

  return {
    id: account.id,
    address: account.address,
    password,
    token: tokenJson.token,
    provider: 'mailtm' as const,
    createdAt: account.createdAt || new Date().toISOString(),
  };
}

async function createTempMailLolAccount() {
  const res = await fetch('https://api.tempmail.lol/v2/inbox/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`TempMail.lol error ${res.status}`);
  const data = (await res.json()) as { address: string; token: string };
  if (!data.address || !data.token) throw new Error('TempMail.lol invalid response');
  return {
    id: data.token,
    address: data.address,
    password: '',
    token: data.token,
    provider: 'tempmail' as const,
    createdAt: new Date().toISOString(),
  };
}

async function createGuerrillaAccount(username?: string) {
  const res = await fetch('https://api.guerrillamail.com/ajax.php?f=get_email_address', {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`GuerrillaMail error ${res.status}`);
  const data = (await res.json()) as { email_addr: string; sid_token: string };
  if (!data.email_addr || !data.sid_token) throw new Error('GuerrillaMail invalid response');

  let finalAddress = data.email_addr;
  const cleanPrefix = (username || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 20);
  if (cleanPrefix.length >= 3) {
    const setRes = await fetch(
      `https://api.guerrillamail.com/ajax.php?f=set_email_user&email_user=${encodeURIComponent(cleanPrefix)}&sid_token=${encodeURIComponent(data.sid_token)}`,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(3500) }
    );
    if (setRes.ok) {
      const setJson = (await setRes.json()) as { email_addr?: string };
      if (setJson.email_addr) finalAddress = setJson.email_addr;
    }
  }

  return {
    id: data.sid_token,
    address: finalAddress,
    password: '',
    token: data.sid_token,
    provider: 'guerrilla' as const,
    createdAt: new Date().toISOString(),
  };
}

async function getTempMailIoDomains(): Promise<string[]> {
  if (tempMailIoDomainsCache.data.length > 0 && Date.now() < tempMailIoDomainsCache.expiresAt) {
    return tempMailIoDomainsCache.data;
  }
  const response = await fetch('https://api.internal.temp-mail.io/api/v3/domains', {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(3500),
  });
  if (!response.ok) {
    return tempMailIoDomainsCache.data;
  }
  const json = (await response.json()) as {
    domains?: Array<{ name: string; type?: string }>;
  };
  const domains = (json.domains || [])
    .map((d) => d.name)
    .filter((name) => Boolean(name) && name.length <= 18);
  if (domains.length > 0) {
    tempMailIoDomainsCache.data = domains;
    tempMailIoDomainsCache.expiresAt = Date.now() + 5 * 60 * 1000;
  }
  return domains;
}

async function createTempMailIoAccount(
  username?: string,
  requestedDomain?: string,
  customPassword?: string
) {
  const domains = await getTempMailIoDomains();
  if (domains.length === 0) throw new Error('TempMail.io domains unavailable');

  const domain = requestedDomain && domains.includes(requestedDomain) ? requestedDomain : domains[0];
  const cleanPrefix = (username || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 22);
  const name = cleanPrefix.length >= 3 ? cleanPrefix : `vb${randomTokenString(6)}`;

  const res = await fetch('https://api.internal.temp-mail.io/api/v3/email/new', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({ name, domain }),
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`TempMail.io error ${res.status}`);
  const data = (await res.json()) as { email?: string; token?: string };
  if (!data.email || !data.token) throw new Error('TempMail.io invalid response');

  return {
    id: data.token,
    address: data.email,
    password: customPassword || '',
    token: data.token,
    provider: 'tempmailio' as const,
    createdAt: new Date().toISOString(),
  };
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

function getSupabaseServerConfig(): { url: string; key: string } {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  )
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();
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
  try {
    const [authRes, pubRes] = await Promise.all([
      fetch('https://5sim.net/v1/guest/prices?product=tiktok', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
        },
        signal: AbortSignal.timeout(5000),
      }),
      fetch('https://5sim.net/v1/guest/prices?product=tiktok', {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(5000),
      }),
    ]);
    if (!authRes.ok || !pubRes.ok) return 'USD';
    const authJson = (await authRes.json()) as Record<
      string,
      Record<string, Record<string, { cost?: number; count?: number }>>
    >;
    const pubJson = (await pubRes.json()) as Record<
      string,
      Record<string, Record<string, { cost?: number; count?: number }>>
    >;
    const authMap = authJson.tiktok || {};
    const pubMap = pubJson.tiktok || {};
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
      if (median > 12) return 'RUB';
    }
  } catch {
    // Non-blocking fallback to USD
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

  const needCurrencyProbe = Boolean(apiKey) && fiveSimCurrencyCache.expiresAt <= Date.now();

  const fetchAuthPrices = async () => {
    const first = await fetch(
      `https://5sim.net/v1/guest/prices?product=${encodeURIComponent(product)}`,
      { headers: priceHeaders, signal: AbortSignal.timeout(8000) }
    );
    if ((first.status === 401 || first.status === 403) && priceHeaders.Authorization) {
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

    if (totalStock <= 0 || allPricedOperators.length === 0) continue;

    // Grab the lowest real-time amount across the country's operators (matching 5sim's Any operator price)
    allPricedOperators.sort((a, b) => a.cost - b.cost || b.count - a.count || b.rate - a.rate);
    operators.sort((a, b) => a.cost - b.cost || b.count - a.count || b.rate - a.rate);

    const lowestAnyOp = allPricedOperators[0];
    const lowestInStockOp = operators[0] || lowestAnyOp;

    rawOptions.push({
      slug,
      country: meta.text_en || slug,
      countryCode: isoKey ? isoKey.toUpperCase() : '',
      dialCode: prefixKey || '',
      stockCount: totalStock,
      minPrice: lowestAnyOp.cost,
      inStockMinPrice: lowestInStockOp.cost,
      rawLowestCost: lowestAnyOp.cost,
      currency: accountCurrency,
      bestOperator: lowestAnyOp.operator,
      maxRate,
      operators: operators.slice(0, 12),
    });
  }

  // Accurately detect if authenticated 5sim prices are in RUB (even if profile.currency is missing)
  let effectiveCurrency = accountCurrency;
  if (rawOptions.length > 0 && (effectiveCurrency === 'USD' || !effectiveCurrency)) {
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
      if (medianRatio > 12) {
        effectiveCurrency = 'RUB';
        fiveSimCurrencyCache.currency = 'RUB';
        fiveSimCurrencyCache.expiresAt = Date.now() + 5 * 60 * 1000;
      }
    } else {
      const sample = rawOptions.find((o) => o.slug === 'nigeria') || rawOptions[0];
      const publicUsd = await getUnauthUsdSamplePrice(sample.slug, sample.bestOperator, product);
      if (publicUsd > 0 && sample.rawLowestCost / publicUsd > 12) {
        effectiveCurrency = 'RUB';
        fiveSimCurrencyCache.currency = 'RUB';
        fiveSimCurrencyCache.expiresAt = Date.now() + 5 * 60 * 1000;
      }
    }
  }

  const options: FiveSimCountryOption[] = rawOptions.map(({ rawLowestCost, ...rest }) => {
    const usdMin = convertCurrencyAmountToUsd(rawLowestCost, effectiveCurrency, rates);
    const usdInStockMin = convertCurrencyAmountToUsd(rest.inStockMinPrice, effectiveCurrency, rates);
    return {
      ...rest,
      minPrice: usdMin,
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
  rates?: ExchangeRates
) {
  const norm = normalizeFiveSimOrder(raw, countryCodeHint);
  const service = norm.product || 'other';
  const effectiveRates = rates || cachedExchangeRates;
  const rawUsd =
    norm.price > 0
      ? convertCurrencyAmountToUsd(norm.price, currencyHint, effectiveRates)
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
    czechia: 'czechrepublic',
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
      (canonicalKey === 'usavirtual' ? { iso: 'US', dial: '+1' } : { iso: '', dial: '' });

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
        minPrice: inStockNgn,
        rawPriceUsd: inStockUsd,
        inStockMinPrice: inStockNgn,
        inStockPriceUsd: inStockUsd,
        currency: 'NGN',
        stockCount: c.stockCount,
        providers: [quote],
      });
    } else {
      existing.providers.push(quote);
      existing.stockCount += c.stockCount;
      if (inStockNgn > 0 && (existing.inStockMinPrice <= 0 || inStockNgn < existing.inStockMinPrice)) {
        existing.minPrice = inStockNgn;
        existing.rawPriceUsd = inStockUsd;
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
        if (inStockNgnMore(existing.inStockMinPrice, minNgn)) {
          existing.minPrice = minNgn;
          existing.rawPriceUsd = g.minPriceUsd;
          existing.inStockMinPrice = minNgn;
          existing.inStockPriceUsd = g.minPriceUsd;
        }
      }
    }
  }

  const countries = Array.from(merged.values()).map((row) => ({
    ...row,
    providers: [...row.providers].sort((a, b) => a.inStockMinPrice - b.inStockMinPrice),
  }));

  // Sort ALL countries strictly alphabetically A to Z
  countries.sort((a, b) => a.country.localeCompare(b.country));

  return { countries, exchangeRate: rates.NGN };
}

function inStockNgnMore(existing: number, candidate: number): boolean {
  return candidate > 0 && (existing <= 0 || candidate < existing);
}

export function createApiApp() {
  const app = express();
  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );

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
  // Multi-provider Email Domains & Providers
  // ==========================================
  app.get('/api/email/domains', async (_req, res) => {
    const [ioDomains, tmDomains] = await Promise.all([
      getTempMailIoDomains().catch(() => []),
      getMailTmDomains().catch(() => []),
    ]);
    res.json({
      domains: [...ioDomains, ...tmDomains],
      providers: [
        { id: 'auto', name: 'Auto (Fastest Clean Domain)' },
        { id: 'tempmailio', name: 'VeriBox Instant Mail (.com)' },
        { id: 'mailtm', name: 'Mail.tm (Custom Password)' },
        { id: 'tempmail', name: 'TempMail.lol' },
      ],
    });
  });

  app.get('/api/email/suggestions', async (req, res) => {
    const first = String(req.query.firstName || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 12);
    const second = String(req.query.lastName || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 12);

    const firstFinal = first || 'user';
    const secondFinal = second || 'box';

    const base1 = `${firstFinal}${secondFinal}`;
    const base2 = `${firstFinal}.${secondFinal}`;
    const base3 = `${firstFinal.slice(0, 1)}${secondFinal}`;
    const base4 = firstFinal;
    const num1 = Math.floor(12 + Math.random() * 87);
    const num2 = Math.floor(101 + Math.random() * 890);
    const num3 = Math.floor(14 + Math.random() * 85);
    const num4 = Math.floor(201 + Math.random() * 789);

    try {
      const [ioDomains, mailTmDomains] = await Promise.all([
        getTempMailIoDomains().catch((): string[] => []),
        getMailTmDomains().catch((): string[] => []),
      ]);

      const d1 = ioDomains[0] || mailTmDomains[0] || 'lnovic.com';
      const d2 = ioDomains[1] || ioDomains[0] || mailTmDomains[0] || 'tanpony.com';
      const d3 = mailTmDomains[0] || ioDomains[2] || d1;
      const d4 = ioDomains[2] || ioDomains[0] || mailTmDomains[0] || 'bwmyga.com';

      const useIoFor1 = ioDomains.includes(d1);
      const useIoFor2 = ioDomains.includes(d2);
      const useMailTmFor3 = mailTmDomains.includes(d3);
      const useIoFor4 = ioDomains.includes(d4);

      const options: Array<{
        id: string;
        address: string;
        username: string;
        domain: string;
        provider: 'tempmailio' | 'mailtm';
        providerLabel: string;
      }> = [
        {
          id: 'opt-1',
          address: `${base1}${num1}@${d1}`,
          username: `${base1}${num1}`,
          domain: d1,
          provider: useIoFor1 ? 'tempmailio' : 'mailtm',
          providerLabel: 'Instant Inbox',
        },
        {
          id: 'opt-2',
          address: `${base2}${num2}@${d2}`,
          username: `${base2}${num2}`,
          domain: d2,
          provider: useIoFor2 ? 'tempmailio' : 'mailtm',
          providerLabel: 'Instant Inbox',
        },
        {
          id: 'opt-3',
          address: `${base3}${num3}@${d3}`,
          username: `${base3}${num3}`,
          domain: d3,
          provider: useMailTmFor3 ? 'mailtm' : 'tempmailio',
          providerLabel: 'Protected Inbox',
        },
        {
          id: 'opt-4',
          address: `${base4}${num4}@${d4}`,
          username: `${base4}${num4}`,
          domain: d4,
          provider: useIoFor4 ? 'tempmailio' : 'mailtm',
          providerLabel: 'Fast Verify',
        },
      ];

      res.json({ options });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Failed to generate email options',
      });
    }
  });

  app.post('/api/email/create-selected', async (req, res) => {
    const provider = String(req.body?.provider || 'tempmailio').toLowerCase();
    const username = typeof req.body?.username === 'string' ? req.body.username : undefined;
    const domain = typeof req.body?.domain === 'string' ? req.body.domain : undefined;
    const password = typeof req.body?.password === 'string' ? req.body.password : undefined;
    const address = typeof req.body?.address === 'string' ? req.body.address : undefined;
    const precreatedToken =
      typeof req.body?.precreatedToken === 'string' ? req.body.precreatedToken : undefined;

    try {
      if (provider === 'tempmailio') {
        const acct = await createTempMailIoAccount(username, domain, password);
        res.json(acct);
        return;
      }

      if (provider === 'mailtm') {
        const acct = await createMailTmAccount(username, domain, password);
        res.json(acct);
        return;
      }

      if (provider === 'tempmail' && precreatedToken && address) {
        res.json({
          id: precreatedToken,
          address,
          password: password || '',
          token: precreatedToken,
          provider: 'tempmail',
          createdAt: new Date().toISOString(),
        });
        return;
      }

      if (provider === 'guerrilla') {
        const acct = await createGuerrillaAccount(username);
        res.json({ ...acct, password: password || '' });
        return;
      }

      const acct = await createTempMailIoAccount(username, domain, password);
      res.json(acct);
    } catch (err) {
      const fallbacks: Array<'mailtm' | 'tempmailio' | 'tempmail' | 'guerrilla'> =
        provider === 'tempmailio'
          ? ['mailtm', 'tempmail', 'guerrilla']
          : ['mailtm', 'tempmailio', 'tempmail', 'guerrilla'];

      for (const fb of fallbacks) {
        if (fb === provider) continue;
        try {
          const fallback =
            fb === 'mailtm'
              ? await createMailTmAccount(username, undefined, password)
              : fb === 'tempmailio'
                ? await createTempMailIoAccount(username, undefined, password)
                : fb === 'tempmail'
                  ? await createTempMailLolAccount()
                  : await createGuerrillaAccount(username);
          res.json(fallback);
          return;
        } catch {
          // Try next fallback
        }
      }
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Could not create selected email',
      });
    }
  });

  app.post('/api/email/create', async (req, res) => {
    const provider = String(req.body?.provider || 'auto').toLowerCase();
    const username = typeof req.body?.username === 'string' ? req.body.username : undefined;
    const domain = typeof req.body?.domain === 'string' ? req.body.domain : undefined;
    const password = typeof req.body?.password === 'string' ? req.body.password : undefined;

    const order: Array<'mailtm' | 'tempmail' | 'tempmailio' | 'guerrilla'> =
      provider === 'mailtm'
        ? ['mailtm', 'tempmail', 'tempmailio', 'guerrilla']
        : provider === 'tempmail'
          ? ['tempmail', 'mailtm', 'tempmailio', 'guerrilla']
          : provider === 'guerrilla'
            ? ['guerrilla', 'mailtm', 'tempmail']
            : provider === 'tempmailio'
              ? ['tempmailio', 'mailtm', 'tempmail', 'guerrilla']
              : ['mailtm', 'tempmail', 'tempmailio', 'guerrilla'];

    let lastError = 'All email providers are busy';
    for (const candidate of order) {
      try {
        if (candidate === 'tempmailio') {
          const acct = await createTempMailIoAccount(username, domain, password);
          res.json(acct);
          return;
        }
        if (candidate === 'mailtm') {
          const acct = await createMailTmAccount(username, domain, password);
          res.json(acct);
          return;
        }
        if (candidate === 'tempmail') {
          const acct = await createTempMailLolAccount();
          res.json(acct);
          return;
        }
        if (candidate === 'guerrilla') {
          const acct = await createGuerrillaAccount(username);
          res.json(acct);
          return;
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : lastError;
      }
    }

    res.status(502).json({ error: lastError });
  });

  app.post('/api/email/login', async (req, res) => {
    try {
      const { address, password } = req.body || {};
      if (!address || !password) {
        res.status(400).json({ error: 'Address and password required' });
        return;
      }
      const tokenRes = await fetch('https://api.mail.tm/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ address, password }),
        signal: AbortSignal.timeout(5000),
      });
      if (!tokenRes.ok) {
        res.status(tokenRes.status).json({ error: 'Session expired for this email' });
        return;
      }
      const tokenJson = (await tokenRes.json()) as { token: string; id: string };
      res.json({ token: tokenJson.token, id: tokenJson.id });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Login failed' });
    }
  });

  app.get('/api/email/messages', async (req, res) => {
    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    const provider = String(req.headers['x-email-provider'] || 'mailtm').toLowerCase();
    const emailAddress = String(req.headers['x-email-address'] || '').trim();

    if (!token && !emailAddress) {
      res.status(401).json({ error: 'Missing email token' });
      return;
    }

    try {
      if (provider === 'tempmailio') {
        if (!emailAddress) throw new Error('Missing email address');
        const response = await fetch(
          `https://api.internal.temp-mail.io/api/v3/email/${encodeURIComponent(emailAddress)}/messages`,
          { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(5000) }
        );
        if (response.status === 400 || response.status === 404) {
          res.json({ messages: [] });
          return;
        }
        if (!response.ok) throw new Error(`Inbox error (${response.status})`);
        const rawList = (await response.json()) as Array<{
          id: string;
          from: string;
          to: string;
          subject: string;
          body_text?: string;
          body_html?: string;
          created_at?: string;
        }>;
        const list = (Array.isArray(rawList) ? rawList : []).map((msg) => {
          const subject = msg.subject || '(No subject)';
          const body = msg.body_text || stripTags(msg.body_html || '');
          return {
            id: String(msg.id),
            fromName: msg.from || 'Unknown sender',
            fromAddress: msg.from || '',
            subject,
            intro: body.slice(0, 180),
            seen: false,
            createdAt: msg.created_at || new Date().toISOString(),
            otp: extractOtpCode(`${subject} ${body}`),
          };
        });
        res.json({ messages: list });
        return;
      }

      if (provider === 'tempmail') {
        const response = await fetch(
          `https://api.tempmail.lol/v2/inbox?token=${encodeURIComponent(token)}`,
          { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(7000) }
        );
        if (!response.ok) throw new Error('TempMail inbox error');
        const json = (await response.json()) as {
          emails?: Array<{ from: string; to: string; subject: string; body: string; html?: string; date: number }>;
        };
        const list = (json.emails || []).map((msg, idx) => {
          const subject = msg.subject || '(No subject)';
          const body = msg.body || stripTags(msg.html || '');
          return {
            id: `tm-${idx}-${msg.date}`,
            fromName: msg.from || 'Unknown sender',
            fromAddress: msg.from || '',
            subject,
            intro: body.slice(0, 160),
            body,
            html: msg.html || '',
            seen: false,
            createdAt: msg.date ? new Date(msg.date).toISOString() : new Date().toISOString(),
            otp: extractOtpCode(`${subject} ${body}`),
          };
        });
        res.json({ messages: list });
        return;
      }

      if (provider === 'guerrilla') {
        const response = await fetch(
          `https://api.guerrillamail.com/ajax.php?f=get_email_list&offset=0&sid_token=${encodeURIComponent(token)}`,
          { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(7000) }
        );
        if (!response.ok) throw new Error('GuerrillaMail inbox error');
        const json = (await response.json()) as {
          list?: Array<{
            mail_id: string;
            mail_from: string;
            mail_subject: string;
            mail_excerpt: string;
            mail_timestamp: string;
            mail_read: string;
          }>;
        };
        const list = (json.list || []).map((msg) => {
          const subject = msg.mail_subject || '(No subject)';
          const intro = stripTags(msg.mail_excerpt || '');
          const ts = Number(msg.mail_timestamp)
            ? new Date(Number(msg.mail_timestamp) * 1000).toISOString()
            : new Date().toISOString();
          return {
            id: String(msg.mail_id),
            fromName: msg.mail_from || 'Unknown sender',
            fromAddress: msg.mail_from || '',
            subject,
            intro,
            seen: msg.mail_read === '1',
            createdAt: ts,
            otp: extractOtpCode(`${subject} ${intro}`),
          };
        });
        res.json({ messages: list });
        return;
      }

      const response = await fetch('https://api.mail.tm/messages?page=1', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) {
        res.status(response.status).json({ error: 'Could not read inbox' });
        return;
      }
      const json = (await response.json()) as
        | { 'hydra:member'?: Array<Record<string, unknown>> }
        | Array<Record<string, unknown>>;
      const rawList = Array.isArray(json) ? json : json['hydra:member'] || [];

      const messages = rawList.map((msg) => {
        const subject = String(msg.subject || '(No subject)');
        const intro = String(msg.intro || '');
        const fromObj = msg.from as { address?: string; name?: string } | undefined;
        return {
          id: String(msg.id || ''),
          fromName: fromObj?.name || fromObj?.address || 'Unknown sender',
          fromAddress: fromObj?.address || '',
          subject,
          intro,
          seen: Boolean(msg.seen),
          createdAt: String(msg.createdAt || new Date().toISOString()),
          otp: extractOtpCode(`${subject} ${intro}`),
        };
      });

      res.json({ messages });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Failed to fetch emails',
        messages: [],
      });
    }
  });

  app.get('/api/email/messages/:id', async (req, res) => {
    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    const provider = String(req.headers['x-email-provider'] || 'mailtm').toLowerCase();
    const emailAddress = String(req.headers['x-email-address'] || '').trim();

    if (!token && !emailAddress) {
      res.status(401).json({ error: 'Missing email token' });
      return;
    }

    try {
      if (provider === 'tempmailio') {
        if (!emailAddress) throw new Error('Missing email address');
        const response = await fetch(
          `https://api.internal.temp-mail.io/api/v3/email/${encodeURIComponent(emailAddress)}/messages`,
          { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(6000) }
        );
        if (!response.ok) throw new Error('Could not load message');
        const rawList = (await response.json()) as Array<{
          id: string;
          from: string;
          subject: string;
          body_text?: string;
          body_html?: string;
          created_at?: string;
        }>;
        const found = (Array.isArray(rawList) ? rawList : []).find(
          (m) => String(m.id) === req.params.id
        );
        if (!found) {
          res.status(404).json({ error: 'Email not found' });
          return;
        }
        const plain = found.body_text || stripTags(found.body_html || '');
        res.json({
          id: String(found.id),
          fromName: found.from || 'Unknown sender',
          fromAddress: found.from || '',
          subject: found.subject || '(No subject)',
          text: plain,
          html: found.body_html || '',
          createdAt: found.created_at || new Date().toISOString(),
          otp: extractOtpCode(`${found.subject || ''} ${plain}`),
        });
        return;
      }

      if (provider === 'guerrilla') {
        const response = await fetch(
          `https://api.guerrillamail.com/ajax.php?f=fetch_email&email_id=${encodeURIComponent(req.params.id)}&sid_token=${encodeURIComponent(token)}`,
          { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(7000) }
        );
        if (!response.ok) throw new Error('Could not load GuerrillaMail message');
        const msg = (await response.json()) as {
          mail_id: string;
          mail_from: string;
          mail_subject: string;
          mail_body: string;
          mail_timestamp: string;
        };
        const plain = stripTags(msg.mail_body || '');
        res.json({
          id: String(msg.mail_id),
          fromName: msg.mail_from || 'Unknown sender',
          fromAddress: msg.mail_from || '',
          subject: msg.mail_subject || '(No subject)',
          text: plain,
          html: msg.mail_body || '',
          createdAt: Number(msg.mail_timestamp)
            ? new Date(Number(msg.mail_timestamp) * 1000).toISOString()
            : new Date().toISOString(),
          otp: extractOtpCode(`${msg.mail_subject || ''} ${plain}`),
        });
        return;
      }

      if (provider === 'tempmail') {
        const response = await fetch(
          `https://api.tempmail.lol/v2/inbox?token=${encodeURIComponent(token)}`,
          { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(7000) }
        );
        const json = (await response.json()) as {
          emails?: Array<{ from: string; subject: string; body: string; html?: string; date: number }>;
        };
        const found = (json.emails || []).find((m, idx) => `tm-${idx}-${m.date}` === req.params.id);
        if (!found) {
          res.status(404).json({ error: 'Email not found' });
          return;
        }
        const plain = found.body || stripTags(found.html || '');
        res.json({
          id: req.params.id,
          fromName: found.from || 'Unknown sender',
          fromAddress: found.from || '',
          subject: found.subject || '(No subject)',
          text: plain,
          html: found.html || '',
          createdAt: found.date ? new Date(found.date).toISOString() : new Date().toISOString(),
          otp: extractOtpCode(`${found.subject || ''} ${plain}`),
        });
        return;
      }

      const response = await fetch(`https://api.mail.tm/messages/${encodeURIComponent(req.params.id)}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) {
        res.status(response.status).json({ error: 'Could not load message' });
        return;
      }
      const msg = (await response.json()) as Record<string, unknown>;
      const fromObj = msg.from as { address?: string; name?: string } | undefined;
      const text = String(msg.text || '');
      const htmlArr = Array.isArray(msg.html) ? msg.html : [];
      const htmlString = htmlArr.join('\n');
      const subject = String(msg.subject || '(No subject)');
      const plainFallback = text || stripTags(htmlString);

      res.json({
        id: String(msg.id || ''),
        fromName: fromObj?.name || fromObj?.address || 'Unknown sender',
        fromAddress: fromObj?.address || '',
        subject,
        text: plainFallback,
        html: htmlString,
        createdAt: String(msg.createdAt || new Date().toISOString()),
        otp: extractOtpCode(`${subject} ${plainFallback}`),
      });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : 'Failed to load message' });
    }
  });

  app.delete('/api/email/messages/:id', async (req, res) => {
    const auth = req.headers.authorization || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    const provider = String(req.headers['x-email-provider'] || 'mailtm').toLowerCase();
    const emailAddress = String(req.headers['x-email-address'] || '').trim();

    if (!token && !(provider === 'tempmailio' && emailAddress)) {
      res.status(401).json({ error: 'Missing email token' });
      return;
    }

    if (provider === 'tempmailio') {
      try {
        await fetch(
          `https://api.internal.temp-mail.io/api/v3/message/${encodeURIComponent(req.params.id)}`,
          { method: 'DELETE', headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(5000) }
        );
      } catch {
        // Ignore if already expired
      }
      res.json({ deleted: true });
      return;
    }

    if (provider !== 'mailtm') {
      res.json({ deleted: true });
      return;
    }

    try {
      const response = await fetch(`https://api.mail.tm/messages/${encodeURIComponent(req.params.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(7000),
      });
      res.status(response.ok ? 200 : response.status).json({ deleted: response.ok });
    } catch (error) {
      res.status(502).json({ error: error instanceof Error ? error.message : 'Delete failed' });
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
          (a, b) => a.inStockMinPrice - b.inStockMinPrice || b.stockCount - a.stockCount
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
          minPrice: bestProv ? bestProv.inStockMinPrice : cheapest.inStockMinPrice,
          rawPriceUsd: bestProv ? bestProv.inStockPriceUsd : cheapest.inStockPriceUsd,
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

  app.post('/api/numbers/acquire', async (req, res) => {
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
    const clientWalletBalance = Number(req.body?.walletBalance);

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
          Number.isFinite(clientWalletBalance) &&
          liveUnitNgn > 0 &&
          clientWalletBalance < liveUnitNgn * quantity
        ) {
          res.status(402).json({
            error: `Insufficient wallet balance for the current live Grizzly SMS price (₦${(liveUnitNgn * quantity).toLocaleString()} required, wallet has ₦${clientWalletBalance.toLocaleString()}). Please top up first.`,
          });
          return;
        }

        const orders = [];
        let lastError = 'No numbers available on Grizzly SMS for this selection right now.';

        for (let i = 0; i < quantity; i++) {
          let acquiredOrder = null;
          try {
            const v2Raw = await callGrizzlyApi(
              {
                action: 'getNumberV2',
                service: grizzlyService,
                country: grizzlyCountryId,
              },
              grizzlyKey
            );

            if (v2Raw.startsWith('{')) {
              const parsed = JSON.parse(v2Raw) as {
                activationId?: number | string;
                phoneNumber?: string;
                activationCost?: number | string;
                activationTime?: string;
                activationEndTime?: string;
              };
              const actId = Number(parsed.activationId || 0);
              const phoneRaw = String(parsed.phoneNumber || '');
              const digits = phoneRaw.replace(/\D/g, '');
              const phone = phoneRaw.startsWith('+') ? phoneRaw : digits ? `+${digits}` : phoneRaw;
              const costUsd = Number(parsed.activationCost || liveUnitUsd || 0);
              const costNgn = costUsd > 0 ? roundToNaira(costUsd, rates.NGN) : liveUnitNgn;

              if (actId > 0 && digits) {
                acquiredOrder = {
                  id: actId,
                  provider: 'grizzly' as const,
                  phone,
                  digits,
                  country: countryMeta?.country || countryNameHint || 'Country',
                  countryCode: countryCodeHint || countryMeta?.countryCode,
                  service,
                  serviceName,
                  price: costNgn > 0 ? costNgn : undefined,
                  rawPriceUsd: costUsd > 0 ? roundUnitPrice(costUsd) : undefined,
                  currency: 'NGN',
                  status: 'PENDING',
                  expires: String(parsed.activationEndTime || ''),
                  createdAt: new Date().toISOString(),
                  sms: [],
                };
              }
            } else if (v2Raw.startsWith('ACCESS_NUMBER:')) {
              const parts = v2Raw.split(':');
              const actId = Number(parts[1] || 0);
              const phoneRaw = String(parts[2] || '');
              const digits = phoneRaw.replace(/\D/g, '');
              const phone = phoneRaw.startsWith('+') ? phoneRaw : digits ? `+${digits}` : phoneRaw;
              if (actId > 0 && digits) {
                acquiredOrder = {
                  id: actId,
                  provider: 'grizzly' as const,
                  phone,
                  digits,
                  country: countryMeta?.country || countryNameHint || 'Country',
                  countryCode: countryCodeHint || countryMeta?.countryCode,
                  service,
                  serviceName,
                  price: liveUnitNgn > 0 ? liveUnitNgn : undefined,
                  rawPriceUsd: liveUnitUsd > 0 ? roundUnitPrice(liveUnitUsd) : undefined,
                  currency: 'NGN',
                  status: 'PENDING',
                  expires: '',
                  createdAt: new Date().toISOString(),
                  sms: [],
                };
              }
            } else if (v2Raw === 'BAD_ACTION') {
              const v1Raw = await callGrizzlyApi(
                {
                  action: 'getNumber',
                  service: grizzlyService,
                  country: grizzlyCountryId,
                },
                grizzlyKey
              );
              if (v1Raw.startsWith('ACCESS_NUMBER:')) {
                const parts = v1Raw.split(':');
                const actId = Number(parts[1] || 0);
                const phoneRaw = String(parts[2] || '');
                const digits = phoneRaw.replace(/\D/g, '');
                const phone = phoneRaw.startsWith('+') ? phoneRaw : digits ? `+${digits}` : phoneRaw;
                if (actId > 0 && digits) {
                  acquiredOrder = {
                    id: actId,
                    provider: 'grizzly' as const,
                    phone,
                    digits,
                    country: countryMeta?.country || countryNameHint || 'Country',
                    countryCode: countryCodeHint || countryMeta?.countryCode,
                    service,
                    serviceName,
                    price: liveUnitNgn > 0 ? liveUnitNgn : undefined,
                    rawPriceUsd: liveUnitUsd > 0 ? roundUnitPrice(liveUnitUsd) : undefined,
                    currency: 'NGN',
                    status: 'PENDING',
                    expires: '',
                    createdAt: new Date().toISOString(),
                    sms: [],
                  };
                }
              } else {
                lastError = sanitizeNumberApiError(v1Raw);
              }
            } else {
              lastError = sanitizeNumberApiError(v2Raw);
            }
          } catch (err) {
            lastError = sanitizeNumberApiError(
              err instanceof Error ? err.message : 'Grizzly SMS purchase failed'
            );
          }

          if (!acquiredOrder) {
            if (orders.length > 0) break;
            throw new Error(lastError);
          }
          orders.push(acquiredOrder);
        }

        res.json({ orders });
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
      const sortedOps = countryMeta?.operators.map((o) => o.operator) || [];
      // Strictly buy from the lowest in-stock operator first, falling back to next cheapest, then 'any'
      const operatorCandidates = Array.from(new Set([...sortedOps, 'any']));

      const liveUnitNgn = countryMeta?.inStockMinPrice
        ? roundToNaira(countryMeta.inStockMinPrice, rates.NGN)
        : 0;
      if (
        Number.isFinite(clientWalletBalance) &&
        liveUnitNgn > 0 &&
        clientWalletBalance < liveUnitNgn * quantity
      ) {
        res.status(402).json({
          error: `Insufficient wallet balance for the current live operator price (₦${(liveUnitNgn * quantity).toLocaleString()} required, wallet has ₦${clientWalletBalance.toLocaleString()}). Please top up first.`,
        });
        return;
      }

      const orders = [];
      let lastError = 'No numbers available for this selection right now.';

      for (let i = 0; i < quantity; i++) {
        let acquired: ReturnType<typeof toPublicNumberOrder> | null = null;
        for (const op of operatorCandidates) {
          try {
            const raw = await callFiveSimUserApi(
              `buy/activation/${encodeURIComponent(country)}/${encodeURIComponent(op)}/${encodeURIComponent(service)}`,
              apiKey
            );
            acquired = toPublicNumberOrder(raw, serviceName, countryCodeHint, resolvedCurrency, rates);
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
        if (!acquired) {
          if (orders.length > 0) break;
          throw new Error(lastError);
        }
        orders.push(acquired);
      }

      res.json({ orders });
    } catch (err) {
      const message = sanitizeNumberApiError(
        err instanceof Error ? err.message : 'Unable to assign number'
      );
      res.status(400).json({ error: message });
    }
  });

  app.get('/api/numbers/check/:orderId', async (req, res) => {
    const provider = String(req.query.provider || 'fivesim').toLowerCase();
    const orderId = req.params.orderId.replace(/[^0-9]/g, '');
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
        const parsed = parseGrizzlyStatus(statusText, Number(orderId), 'other');
        res.json({
          order: {
            id: Number(orderId),
            provider: 'grizzly',
            status: parsed.status,
            sms: parsed.sms,
          },
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
      res.json({ order: toPublicNumberOrder(raw, undefined, undefined, accountCurrency, rates) });
    } catch (err) {
      res.status(502).json({
        error: sanitizeNumberApiError(err instanceof Error ? err.message : 'Check failed'),
      });
    }
  });

  app.get('/api/numbers/stream/:orderId', async (req, res) => {
    const provider = String(req.query.provider || 'fivesim').toLowerCase();
    const orderId = req.params.orderId.replace(/[^0-9]/g, '');
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
          const parsed = parseGrizzlyStatus(statusText, Number(orderId), 'other');
          const order = {
            id: Number(orderId),
            provider: 'grizzly',
            status: parsed.status,
            sms: parsed.sms,
          };
          res.write(`data: ${JSON.stringify({ type: 'order', order })}\n\n`);
          if (['FINISHED', 'CANCELED', 'TIMEOUT', 'BANNED'].includes(order.status)) {
            closed = true;
            clearInterval(interval);
            res.end();
          }
          return;
        }

        const raw = await callFiveSimUserApi(`check/${orderId}`, apiKey);
        const order = toPublicNumberOrder(raw, undefined, undefined, accountCurrency, rates);
        res.write(`data: ${JSON.stringify({ type: 'order', order })}\n\n`);
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
    const provider = String(req.query.provider || req.body?.provider || 'fivesim').toLowerCase();
    const action = req.params.action;
    const orderId = req.params.orderId.replace(/[^0-9]/g, '');
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
      const statusCode = action === 'finish' ? '6' : '8';
      try {
        await callGrizzlyApi({ action: 'setStatus', status: statusCode, id: orderId }, grizzlyKey);
        res.json({
          order: {
            id: Number(orderId),
            provider: 'grizzly',
            status: action === 'finish' ? 'FINISHED' : 'CANCELED',
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
      const [raw, accountCurrency, rates] = await Promise.all([
        callFiveSimUserApi(`${action}/${orderId}`, apiKey),
        getFiveSimAccountCurrency(apiKey),
        getExchangeRates(),
      ]);
      res.json({ order: toPublicNumberOrder(raw, undefined, undefined, accountCurrency, rates) });
    } catch (err) {
      res.status(502).json({
        error: sanitizeNumberApiError(err instanceof Error ? err.message : 'Action failed'),
      });
    }
  });

  // ==========================================
  // Secure Naira Wallet, Paystack Webhook & Supabase Sync Endpoints
  // ==========================================
  interface WalletTxRecord {
    reference: string;
    userId: string;
    email?: string;
    amount: number;
    channel?: string;
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
      } catch {
        // Fall back to in-memory balance if schema not yet applied
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
  }): Promise<{
    alreadyProcessed: boolean;
    amount: number;
    balance: number;
    supabasePersisted: boolean;
  }> {
    const safeUserId = normalizeWalletUserId(params.userId);
    const amountNgn = Math.max(0, Math.round(params.amountNgn));
    const sb = getSupabaseServerClient();

    if (sb) {
      try {
        // Check if transaction reference already exists in Supabase
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
          const { error: insertTxErr } = await sb.from('wallet_transactions').insert({
            reference: params.reference,
            user_id: safeUserId,
            email: params.email || null,
            amount: amountNgn,
            status: 'success',
            channel: params.channel || null,
            provider: 'paystack',
          });

          if (!insertTxErr) {
            const { data: walletRow } = await sb
              .from('wallets')
              .select('balance')
              .eq('user_id', safeUserId)
              .maybeSingle();

            const prevBal = Math.max(0, Number(walletRow?.balance ?? walletBalancesMap.get(safeUserId) ?? 0));
            const newBal = prevBal + amountNgn;

            const { error: upsertErr } = await sb.from('wallets').upsert(
              {
                user_id: safeUserId,
                email: params.email || null,
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
                email: params.email,
                amount: amountNgn,
                channel: params.channel,
                createdAt: new Date().toISOString(),
              });
              return {
                alreadyProcessed: false,
                amount: amountNgn,
                balance: newBal,
                supabasePersisted: true,
              };
            }
          }
        }
      } catch {
        // Fall through to in-memory credit
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
      email: params.email,
      amount: amountNgn,
      channel: params.channel,
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
    deltaNgn: number;
    reference: string;
  }): Promise<{ balance: number | null; supabasePersisted: boolean }> {
    const safeUserId = normalizeWalletUserId(params.userId);
    const delta = Math.round(params.deltaNgn);
    const sb = getSupabaseServerClient();

    if (sb) {
      try {
        const { data: walletRow, error: readErr } = await sb
          .from('wallets')
          .select('balance')
          .eq('user_id', safeUserId)
          .maybeSingle();

        if (!readErr) {
          const prevBal = Math.max(0, Number(walletRow?.balance ?? walletBalancesMap.get(safeUserId) ?? 0));
          const newBal = Math.max(0, prevBal + delta);
          const { error: upsertErr } = await sb.from('wallets').upsert(
            {
              user_id: safeUserId,
              balance: newBal,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          );
          if (!upsertErr) {
            walletBalancesMap.set(safeUserId, newBal);
            return { balance: newBal, supabasePersisted: true };
          }
        }
      } catch {
        // Fallback to memory
      }
    }

    if (walletBalancesMap.has(safeUserId)) {
      const prevBal = walletBalancesMap.get(safeUserId)!;
      const newBal = Math.max(0, prevBal + delta);
      walletBalancesMap.set(safeUserId, newBal);
      return { balance: newBal, supabasePersisted: false };
    }

    return { balance: null, supabasePersisted: false };
  }

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
    res.json({
      userId,
      balance,
      supabasePersisted,
      currency: 'NGN',
    });
  });

  app.post('/api/wallet/initialize', async (req, res) => {
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
    const amount = Math.round(Number(req.body?.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Invalid deduction amount' });
      return;
    }
    const userId = normalizeWalletUserId(req.body?.userId);
    const reference = String(req.body?.reference || `deduct-${Date.now()}`);
    const result = await adjustUserWalletBalance({
      userId,
      deltaNgn: -amount,
      reference,
    });
    res.json({ success: true, ...result });
  });

  app.post('/api/wallet/refund', async (req, res) => {
    const amount = Math.round(Number(req.body?.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Invalid refund amount' });
      return;
    }
    const userId = normalizeWalletUserId(req.body?.userId);
    const reference = String(req.body?.reference || `refund-${Date.now()}`);
    const result = await adjustUserWalletBalance({
      userId,
      deltaNgn: amount,
      reference,
    });
    res.json({ success: true, ...result });
  });

  app.post('/api/wallet/demo-credit', async (req, res) => {
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount < 100 || amount > 500000) {
      res.status(400).json({ error: 'Invalid amount' });
      return;
    }
    const userId = normalizeWalletUserId(req.body?.userId);
    const rounded = Math.round(amount);
    const demoRef = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await creditUserWallet({
      userId,
      amountNgn: rounded,
      reference: demoRef,
      channel: 'test_credit',
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
