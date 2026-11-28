export type TabId = 'home' | 'create' | 'numbers' | 'images' | 'profile' | 'admin';

export type PlatformFilter =
  | 'all'
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'whatsapp'
  | 'telegram'
  | 'google';

export type AccountMode = 'personal' | 'business' | 'privacy';

export type EmailProviderId = 'veribox';

export interface EmailSuggestionOption {
  id: string;
  address: string;
  username: string;
  domain: string;
  provider: 'veribox';
  providerLabel: string;
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
  provider: 'veribox';
  domain?: string;
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
  charged?: boolean;
  chargeOnCode?: boolean;
  chargeToken?: string;
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

export interface AdminTableProbe {
  ok: boolean;
  httpStatus: number | null;
  rowCount: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  errorHint: string | null;
}

export interface AdminInboundAttempt {
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

export interface AdminTimingSummary {
  latestTotalMs: number | null;
  latestDbInsertMs: number | null;
  latestParseMs: number | null;
  latestDeliveryGapMs: number | null;
  latestReceivedAt: string | null;
  latestStoredAt: string | null;
  latestMatchedMailbox: boolean | null;
  avgTotalMs: number | null;
  avgDbInsertMs: number | null;
}

export interface AdminInboundMessageRow {
  id: string;
  recipientAddress: string;
  fromName: string;
  fromAddress: string;
  subject: string;
  otp: string | null;
  seen: boolean;
  createdAt: string;
}

export interface AdminMailboxRow {
  address: string;
  username: string;
  domain: string;
  accountMode: string;
  createdAt: string;
  isDeleted: boolean;
}

export interface AdminDnsCheck {
  checkedAt: string;
  domain: string;
  mxOk: boolean;
  mxRecords: string[];
  spfOk: boolean;
  spfRecord: string | null;
  sendSpfOk?: boolean;
  sendSpfRecord?: string | null;
  dmarcOk: boolean;
  dmarcRecord: string | null;
  dkimOk?: boolean;
  dkimRecord?: string | null;
  aRecords: string[];
  error: string | null;
  recommendedSpfRecord?: string;
  trustScore?: number;
  antiBanNotice?: string;
}

export interface AdminDomainConnectionCheck {
  checkedAt: string;
  url: string;
  ok: boolean;
  httpStatus: number | null;
  latencyMs: number;
  domainMatched: boolean;
  error: string | null;
}

export interface AppErrorLogEntry {
  id: string;
  timestamp: string;
  source: 'supabase' | 'webhook' | 'wallet' | 'routing' | 'app';
  severity: 'error' | 'warning';
  code: string | null;
  message: string;
  detail?: string | null;
}

export type TransferKind = 'p2p_transfer' | 'deposit' | 'debit' | 'refund';

export interface WalletTransferRecord {
  reference: string;
  txType: TransferKind;
  direction: 'sent' | 'received' | 'deposit' | 'debit' | 'refund';
  amount: number;
  status: string;
  channel: string | null;
  provider: string;
  details: string;
  senderLabel: string;
  senderEmail: string | null;
  recipientLabel: string;
  recipientEmail: string | null;
  counterpartyLabel: string;
  createdAt: string;
}

export interface AdminTransferRecord {
  reference: string;
  txType: TransferKind;
  amount: number;
  status: string;
  channel: string | null;
  provider: string;
  details: string;
  senderUserId: string | null;
  senderEmail: string | null;
  senderName: string | null;
  senderLabel: string;
  recipientUserId: string | null;
  recipientEmail: string | null;
  recipientName: string | null;
  recipientLabel: string;
  createdAt: string;
}

export interface AdminDiagnosticsResponse {
  checkedAt: string;
  ownerEmail: string;
  publicWebhookUrl?: string;
  supabaseProjectHost?: string | null;
  environment: {
    emailDomain: string;
    inboundSecretConfigured: boolean;
    resendApiKeyConfigured?: boolean;
    resendWebhookSecretConfigured?: boolean;
    supabaseConfigured: boolean;
    supabaseServiceRoleConfigured: boolean;
  };
  dnsCheck?: AdminDnsCheck;
  domainConnection?: AdminDomainConnectionCheck;
  connectionErrors?: string[];
  recentErrors?: AppErrorLogEntry[];
  timingSummary?: AdminTimingSummary;
  inboundTraffic24hCount?: number;
  probes: {
    mailboxes: AdminTableProbe;
    mailboxMessages: AdminTableProbe;
    inboundWebhookLogs?: AdminTableProbe;
    wallets?: AdminTableProbe;
    walletTransactions?: AdminTableProbe;
    appErrorLogs?: AdminTableProbe;
    createdEmailRegistry?: AdminTableProbe;
    userModeration?: AdminTableProbe;
  };
  recentInboundAttempts: AdminInboundAttempt[];
  rawInboundLogs?: AdminInboundAttempt[];
  latestMessages: AdminInboundMessageRow[];
  latestMailboxes: AdminMailboxRow[];
}

export type UserModerationStatus = 'active' | 'verified' | 'restricted' | 'suspended' | 'banned';
export type UserModerationAction = 'verify' | 'restrict' | 'suspend' | 'ban' | 'restore';

export type BanScriptCategory =
  | 'fake_deposit'
  | 'inactive_no_deposit_30d'
  | 'free_tier_abuse'
  | 'owner_trust_review'
  | 'multi_account_ip'
  | 'policy_violation';

export interface AiBanScript {
  caseId: string;
  headline: string;
  category: BanScriptCategory;
  summaryParagraph: string;
  paragraphs: string[];
  whatHappenedBullets: string[];
  whatYouCanDo: string;
  riskLevel: 'high' | 'medium' | 'low';
  generatedBy: string;
  generatedAt: string;
  lastLoginDayChecked: string | null;
  accountAgeDays: number | null;
}

export type BanAppealStatus =
  | 'none'
  | 'pending_email_link'
  | 'email_confirmed_waiting'
  | 'ai_verified_restored'
  | 'rejected';

export interface BanAppealRecord {
  appealId: string;
  userId: string | null;
  submittedEmail: string;
  registeredEmailMatched: boolean;
  registeredAuthProvider: string | null;
  appealDetails: string;
  fullName: string | null;
  status: BanAppealStatus;
  verificationLinkSentVia: 'resend' | 'supabase' | 'both' | null;
  submittedAt: string;
  emailConfirmedAt: string | null;
  reviewWaitHours: number;
  reviewEligibleAt: string | null;
  aiVerdictAt: string | null;
  aiVerdictNote: string | null;
  reviewedByOwner: string | null;
}

export interface AdminAiBrainFlag {
  userId: string;
  email: string;
  riskLevel: 'high' | 'medium' | 'low';
  flagType: string;
  lastLoginDay: string | null;
  accountAgeDays: number;
  insight: string;
  recommendedAction: 'ban' | 'restrict' | 'verify' | 'monitor';
}

export interface AdminAiBrainReport {
  analyzedAt: string;
  provider: string;
  summary: string;
  reviewWaitHours: number;
  flaggedUsers: AdminAiBrainFlag[];
}

export interface StrictBanEntry {
  id: string;
  targetType: 'user' | 'email' | 'ip';
  targetValue: string;
  reason: string | null;
  strict: boolean;
  bannedBy: string | null;
  createdAt: string;
}

export interface UserModerationLockoutState {
  blocked: boolean;
  status: UserModerationStatus;
  reason: string | null;
  strict: boolean;
  matchType?: 'user' | 'email' | 'ip' | null;
  userId?: string | null;
  email?: string | null;
  bannedAt?: string | null;
  lastSignInAt?: string | null;
  banScript?: AiBanScript | null;
  appeal?: BanAppealRecord | null;
}

export interface AdminManagedUser {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmed: boolean;
  authProvider?: string | null;
  status: UserModerationStatus;
  bannedUntil: string | null;
  walletBalance: number;
  mailboxCount: number;
  totalDepositedNgn?: number;
  failedDepositAttempts?: number;
  accountAgeDays?: number;
  moderationReason: string | null;
  strictBanned?: boolean;
  lastIp?: string | null;
  banScript?: AiBanScript | null;
  appeal?: BanAppealRecord | null;
}

export interface AdminReadinessCheckItem {
  key: string;
  label: string;
  ok: boolean | null;
  detail: string;
  error?: string | null;
}

export interface AdminInboundTestResult {
  testedAt: string;
  mode?: 'readiness';
  ready?: boolean;
  targetAddress: string;
  endpointUrl: string;
  httpStatus: number;
  latencyMs: number;
  responseBody: unknown;
  supabaseWriteOk: boolean;
  supabaseReadbackOk: boolean;
  webhookLogged?: boolean;
  webhookLogError?: string | null;
  webhookLogReadbackOk?: boolean;
  webhookLogId?: string | null;
  inboxApiOk: boolean | null;
  inboxMessageCount: number | null;
  inboxError: string | null;
  supabaseError: string | null;
  otpDetected: string | null;
  checks?: AdminReadinessCheckItem[];
  productionProbe?: {
    url: string;
    httpStatus: number | null;
    reachable: boolean;
    detail: string;
  } | null;
  dnsCheck?: AdminDnsCheck;
}
