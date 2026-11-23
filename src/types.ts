export type TabId = 'home' | 'create' | 'numbers' | 'images' | 'profile';

export type PlatformFilter =
  | 'all'
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'whatsapp'
  | 'telegram'
  | 'google';

export type AccountMode = 'personal' | 'business' | 'privacy';

export type EmailProviderId = 'auto' | 'tempmailio' | 'mailtm' | 'tempmail' | 'guerrilla';

export interface EmailSuggestionOption {
  id: string;
  address: string;
  username: string;
  domain: string;
  provider: 'tempmailio' | 'mailtm' | 'guerrilla' | 'tempmail';
  providerLabel: string;
  precreatedToken?: string;
}

export interface PhoneNumberEntry {
  number: string;
  digits: string;
  country: string;
  countryCode: string;
  dialCode: string;
  sourceUrl: string;
  provider?: 'anonymsms' | 'mytempsms';
  platform: string;
  verifiedForPlatform?: boolean;
}

export interface BatchTrackerInfo {
  sessionId: string;
  platform: string;
  countryCode: string;
  batchNumber: number;
  totalServedCount: number;
  remainingFreshCount: number;
  replacedDigits: string[];
  newlyAssignedDigits: string[];
  poolReset: boolean;
  notice: string;
}

export interface CountryOption {
  countryCode: string;
  country: string;
  dialCode: string;
  availableCount: number;
  platformVerifiedCount: number;
}

export interface SmsMessageEntry {
  id: string;
  sender: string;
  receivedAt: string;
  text: string;
  otp: string | null;
}

export interface FreeSmsLink {
  name: string;
  url: string;
  platforms: string[];
  region: string;
}

export interface TempEmailAccount {
  id: string;
  address: string;
  password: string;
  token: string;
  provider: 'tempmailio' | 'mailtm' | 'tempmail' | 'guerrilla';
  createdAt: string;
  accountMode?: AccountMode;
  displayName?: string;
}

export interface EmailMessageSummary {
  id: string;
  fromName: string;
  fromAddress: string;
  subject: string;
  intro: string;
  seen: boolean;
  createdAt: string;
  otp: string | null;
}

export interface EmailMessageDetail {
  id: string;
  fromName: string;
  fromAddress: string;
  subject: string;
  text: string;
  html: string;
  createdAt: string;
  otp: string | null;
}

export interface CopiedOtpRecord {
  id: string;
  code: string;
  source: string;
  channel: 'SMS' | 'Email';
  copiedAt: string;
}

export interface NumberServiceOption {
  id: string;
  name: string;
  popular?: boolean;
}

export type NumberProviderId = 'fivesim' | 'grizzly';

export interface NumberProviderQuote {
  provider: NumberProviderId;
  name: string;
  configured: boolean;
  countryId: string;
  minPrice: number;
  rawPriceUsd: number;
  inStockMinPrice: number;
  inStockPriceUsd: number;
  stockCount: number;
}

export interface NumberCountryOption {
  slug: string;
  country: string;
  countryCode: string;
  dialCode: string;
  minPrice?: number;
  rawPriceUsd?: number;
  inStockMinPrice?: number;
  inStockPriceUsd?: number;
  currency?: string;
  stockCount?: number;
  providers?: NumberProviderQuote[];
}

export interface LowestNumberDeal {
  serviceId: string;
  serviceName: string;
  slug: string;
  country: string;
  countryCode: string;
  dialCode: string;
  minPrice: number;
  rawPriceUsd?: number;
  currency: string;
  stockCount?: number;
  provider?: NumberProviderId;
  providerName?: string;
}

export interface PrivateNumberOrder {
  id: number;
  provider?: NumberProviderId;
  phone: string;
  digits: string;
  country: string;
  countryCode?: string;
  service: string;
  serviceName: string;
  price?: number;
  rawPriceUsd?: number;
  currency?: string;
  status: string;
  expires: string;
  createdAt: string;
  sms: SmsMessageEntry[];
}

export interface GeneratedImageItem {
  id: string;
  prompt: string;
  style: string;
  aspectRatio: string;
  imageDataUrl: string;
  provider: string;
  createdAt: string;
}



