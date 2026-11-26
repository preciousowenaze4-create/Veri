import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function normalizeSupabaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/^["']|["']$/g, '').trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+(rest|auth|storage|functions)\/v\d+\/*$/i, '').replace(/\/+$/, '');
  }
}

const envUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL || '');
const envAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

function buildClient(url: string, anonKey: string): SupabaseClient {
  return createClient(normalizeSupabaseUrl(url), anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      heartbeatIntervalMs: 15000,
      timeout: 12000,
      params: {
        eventsPerSecond: 10,
      },
    },
  });
}

let activeClient: SupabaseClient | null =
  envUrl && envAnonKey.length > 5 && !envAnonKey.startsWith('MY_')
    ? buildClient(envUrl, envAnonKey)
    : null;

export const supabase = activeClient;

let initPromise: Promise<SupabaseClient | null> | null = null;

export async function ensureSupabaseClient(): Promise<SupabaseClient | null> {
  if (activeClient) return activeClient;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const res = await fetch('/api/auth/public-config', {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        configured?: boolean;
        url?: string | null;
        anonKey?: string | null;
      };
      if (data.configured && data.url && data.anonKey) {
        activeClient = buildClient(data.url, data.anonKey);
        return activeClient;
      }
    } catch {
      // Non-blocking fallback
    }
    return null;
  })();

  return initPromise;
}

export async function syncSupabaseRealtimeAuth(
  client: SupabaseClient | null
): Promise<string | null> {
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token ?? null;
    if (token) {
      await client.realtime.setAuth(token);
    }
    return token;
  } catch {
    return null;
  }
}

export function getActiveSupabaseClient(): SupabaseClient | null {
  return activeClient;
}
