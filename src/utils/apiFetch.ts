export async function parseJsonResponse<T>(res: Response): Promise<T> {
  const raw = await res.text();
  if (!raw || !raw.trim()) {
    if (!res.ok) {
      throw new Error(`Request failed (${res.status})`);
    }
    return {} as T;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    const trimmed = raw.trim();
    const looksHtml = trimmed.startsWith('<') || trimmed.toLowerCase().includes('<!doctype');
    throw new Error(
      looksHtml
        ? `Server returned an unexpected response (${res.status}). Please refresh and retry.`
        : trimmed.slice(0, 140) || `Invalid server response (${res.status})`
    );
  }
}
