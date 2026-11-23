import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApiApp } from '../server/app.js';

const app = createApiApp();

function normalizeVercelRequestUrl(req: IncomingMessage): void {
  const rawUrl = req.url || '/';
  try {
    const parsed = new URL(rawUrl, 'http://localhost');
    const overridePath = parsed.searchParams.get('__vercel_path');
    if (overridePath) {
      parsed.searchParams.delete('__vercel_path');
      const nextPath = overridePath.startsWith('/') ? overridePath : `/${overridePath}`;
      const qs = parsed.searchParams.toString();
      req.url = qs ? `${nextPath}?${qs}` : nextPath;
      return;
    }

    const originalHeader =
      (req.headers['x-vercel-original-url'] as string | undefined) ||
      (req.headers['x-invoke-path'] as string | undefined);
    if (
      originalHeader &&
      (parsed.pathname === '/api/index' || parsed.pathname === '/api/[...all]')
    ) {
      const qs = parsed.searchParams.toString();
      const cleanPath = originalHeader.startsWith('/') ? originalHeader : `/${originalHeader}`;
      req.url = qs && !cleanPath.includes('?') ? `${cleanPath}?${qs}` : cleanPath;
      return;
    }

    if (!parsed.pathname.startsWith('/api')) {
      const qs = parsed.searchParams.toString();
      const prefixed = `/api${parsed.pathname === '/' ? '' : parsed.pathname}`;
      req.url = qs ? `${prefixed}?${qs}` : prefixed;
    }
  } catch {
    // Keep original req.url if URL construction fails
  }
}

export default function vercelApiHandler(req: IncomingMessage, res: ServerResponse) {
  normalizeVercelRequestUrl(req);
  try {
    return app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
  } catch (err) {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: err instanceof Error ? err.message : 'Internal API error',
        })
      );
    }
    return undefined;
  }
}
