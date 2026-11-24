import type {
  EmailMessageDetail,
  EmailMessageSummary,
  EmailSuggestionOption,
  TempEmailAccount,
} from '../types';

const GUERRILLA_API = 'https://api.guerrillamail.com/ajax.php';

function stripHtmlTags(raw: string): string {
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
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

export function generateDirectEmailSuggestions(
  firstName: string,
  lastName: string
): EmailSuggestionOption[] {
  const cleanFirst =
    firstName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 12) || 'user';
  const cleanLast =
    lastName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 12) || 'box';

  const n1 = Math.floor(12 + Math.random() * 87);
  const n2 = Math.floor(101 + Math.random() * 890);
  const n3 = Math.floor(14 + Math.random() * 85);
  const n4 = Math.floor(201 + Math.random() * 789);

  const u1 = `${cleanFirst}${cleanLast}${n1}`;
  const u2 = `${cleanFirst}.${cleanLast}${n2}`;
  const u3 = `${cleanFirst.slice(0, 1)}${cleanLast}${n3}`;
  const u4 = `${cleanFirst}${n4}`;

  const domain = 'guerrillamailblock.com';

  return [
    {
      id: 'opt-1',
      address: `${u1}@${domain}`,
      username: u1,
      domain,
      provider: 'guerrilla',
      providerLabel: 'Instant Inbox',
    },
    {
      id: 'opt-2',
      address: `${u2}@${domain}`,
      username: u2,
      domain,
      provider: 'guerrilla',
      providerLabel: 'Instant Inbox',
    },
    {
      id: 'opt-3',
      address: `${u3}@${domain}`,
      username: u3,
      domain,
      provider: 'guerrilla',
      providerLabel: 'Protected Inbox',
    },
    {
      id: 'opt-4',
      address: `${u4}@${domain}`,
      username: u4,
      domain,
      provider: 'guerrilla',
      providerLabel: 'Fast Verify',
    },
  ];
}

export async function createDirectGuerrillaAccount(
  username?: string,
  password?: string
): Promise<TempEmailAccount> {
  const res = await fetch(`${GUERRILLA_API}?f=get_email_address`, {
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) {
    throw new Error(`Direct mail engine returned ${res.status}`);
  }
  const data = (await res.json()) as { email_addr?: string; sid_token?: string };
  if (!data.email_addr || !data.sid_token) {
    throw new Error('Could not initialize disposable mailbox');
  }

  let finalAddress = data.email_addr;
  const cleanPrefix = (username || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 20);

  if (cleanPrefix.length >= 3) {
    try {
      const setRes = await fetch(
        `${GUERRILLA_API}?f=set_email_user&email_user=${encodeURIComponent(
          cleanPrefix
        )}&sid_token=${encodeURIComponent(data.sid_token)}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (setRes.ok) {
        const setData = (await setRes.json()) as { email_addr?: string };
        if (setData.email_addr) {
          finalAddress = setData.email_addr;
        }
      }
    } catch {
      // Keep assigned email_addr if username customization times out
    }
  }

  return {
    id: data.sid_token,
    address: finalAddress,
    password: password || '',
    token: data.sid_token,
    provider: 'guerrilla',
    createdAt: new Date().toISOString(),
  };
}

export async function fetchDirectGuerrillaMessages(
  sidToken: string
): Promise<EmailMessageSummary[]> {
  const res = await fetch(
    `${GUERRILLA_API}?f=get_email_list&offset=0&sid_token=${encodeURIComponent(sidToken)}`,
    { signal: AbortSignal.timeout(7000) }
  );
  if (!res.ok) {
    throw new Error(`Inbox error (${res.status})`);
  }
  const json = (await res.json()) as {
    list?: Array<{
      mail_id: string | number;
      mail_from?: string;
      mail_subject?: string;
      mail_excerpt?: string;
      mail_timestamp?: string | number;
      mail_read?: string | number;
    }>;
  };

  return (json.list || []).map((msg) => {
    const subject = msg.mail_subject || '(No subject)';
    const intro = stripHtmlTags(msg.mail_excerpt || '');
    const tsNum = Number(msg.mail_timestamp);
    return {
      id: String(msg.mail_id),
      fromName: msg.mail_from || 'Unknown sender',
      fromAddress: msg.mail_from || '',
      subject,
      intro,
      seen: String(msg.mail_read) === '1',
      createdAt: tsNum ? new Date(tsNum * 1000).toISOString() : new Date().toISOString(),
      otp: extractOtpFromText(`${subject} ${intro}`),
    };
  });
}

export async function fetchDirectGuerrillaMessageDetail(
  sidToken: string,
  emailId: string
): Promise<EmailMessageDetail> {
  const res = await fetch(
    `${GUERRILLA_API}?f=fetch_email&email_id=${encodeURIComponent(
      emailId
    )}&sid_token=${encodeURIComponent(sidToken)}`,
    { signal: AbortSignal.timeout(7000) }
  );
  if (!res.ok) {
    throw new Error(`Could not load message (${res.status})`);
  }
  const msg = (await res.json()) as {
    mail_id?: string | number;
    mail_from?: string;
    mail_subject?: string;
    mail_body?: string;
    mail_timestamp?: string | number;
  };
  const html = msg.mail_body || '';
  const text = stripHtmlTags(html);
  const subject = msg.mail_subject || '(No subject)';
  const tsNum = Number(msg.mail_timestamp);

  return {
    id: String(msg.mail_id || emailId),
    fromName: msg.mail_from || 'Unknown sender',
    fromAddress: msg.mail_from || '',
    subject,
    text,
    html,
    createdAt: tsNum ? new Date(tsNum * 1000).toISOString() : new Date().toISOString(),
    otp: extractOtpFromText(`${subject} ${text}`),
  };
}

export async function deleteDirectGuerrillaMessage(
  sidToken: string,
  emailId: string
): Promise<void> {
  await fetch(
    `${GUERRILLA_API}?f=del_email&email_ids[]=${encodeURIComponent(
      emailId
    )}&sid_token=${encodeURIComponent(sidToken)}`,
    { signal: AbortSignal.timeout(5000) }
  ).catch(() => undefined);
}
