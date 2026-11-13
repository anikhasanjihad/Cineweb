// Vercel Edge Function: server-side HTTP proxy for the Cinebox website.
// It is what lets provider code (which was written for the app's native HTTP client) work in a browser:
// no CORS, custom User-Agent / Referer / Origin / Cookie, redirects, Range requests and streamed video.
export const config = {runtime: 'edge'};

const HOP = new Set([
  'content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive', 'set-cookie',
  'content-security-policy', 'content-security-policy-report-only', 'x-frame-options', 'strict-transport-security',
  'access-control-allow-origin', 'access-control-allow-credentials', 'access-control-allow-headers',
  'access-control-allow-methods', 'access-control-expose-headers', 'cross-origin-resource-policy',
  'cross-origin-opener-policy', 'cross-origin-embedder-policy', 'report-to', 'nel', 'alt-svc',
]);
const DROP_REQ = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip']);
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const privateHost = (host: string) => {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h.includes(':')) return h === '::1' || h === '::' || /^f[cd]/.test(h) || h.startsWith('fe80') || h.startsWith('::ffff:');
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
};

const fromB64url = (s: string) => {
  const p = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(p);
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
};

const hostOf = (v: string | null) => { try { return v ? new URL(v).host : ''; } catch { return ''; } };

// Only our own site (and anything listed in ALLOWED_ORIGINS, comma separated hosts) may use the proxy,
// so it can not be used as a free open proxy by other websites.
const allowed = (req: Request, self: string) => {
  const site = req.headers.get('sec-fetch-site');
  if (site === 'same-origin') return true;
  const extra = ((globalThis as any).process?.env?.ALLOWED_ORIGINS ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
  const from = hostOf(req.headers.get('origin')) || hostOf(req.headers.get('referer'));
  return Boolean(from) && (from === self || extra.includes(from));
};

const fail = (status: number, message: string) =>
  new Response(JSON.stringify({error: message}), {status, headers: {'content-type': 'application/json', 'cache-control': 'no-store'}});

export default async function handler(req: Request): Promise<Response> {
  const self = new URL(req.url).host;
  if (!allowed(req, self)) return fail(403, 'Not allowed');
  const q = new URL(req.url).searchParams;

  let target: URL;
  try { target = new URL(q.get('u') ?? ''); } catch { return fail(400, 'Bad url'); }
  if (!/^https?:$/.test(target.protocol) || privateHost(target.hostname) || target.host === self) return fail(400, 'Blocked url');

  const headers = new Headers();
  try {
    const extra = q.get('h') ? (JSON.parse(fromB64url(q.get('h')!)) as Record<string, string>) : {};
    for (const [k, v] of Object.entries(extra)) {
      if (!DROP_REQ.has(k.toLowerCase())) { try { headers.set(k, String(v)); } catch { /* invalid header */ } }
    }
  } catch { return fail(400, 'Bad headers'); }
  if (!headers.has('user-agent')) headers.set('user-agent', DEFAULT_UA);
  const range = req.headers.get('range');
  if (range && !headers.has('range')) headers.set('range', range);

  const raw = q.get('raw') === '1';
  const method = req.method === 'HEAD' ? 'HEAD' : req.method;
  const body = method === 'GET' || method === 'HEAD' ? undefined : await req.arrayBuffer();

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 24000); // the server must start answering within 25 s
  let up: Response;
  try {
    up = await fetch(target.href, {method, headers, body, redirect: q.get('r') === 'manual' ? 'manual' : 'follow', signal: ctl.signal});
  } catch (e) {
    return fail(502, e instanceof Error && e.name === 'AbortError' ? 'Upstream timed out' : 'Upstream request failed');
  } finally {
    clearTimeout(timer);
  }

  const out = new Headers();
  up.headers.forEach((v, k) => { if (!HOP.has(k.toLowerCase())) out.set(k, v); });
  out.set('cache-control', raw && up.ok ? 'private, max-age=300' : 'no-store');
  out.set('x-content-type-options', 'nosniff');

  if (raw) return new Response(method === 'HEAD' ? null : up.body, {status: up.status, statusText: up.statusText, headers: out});

  out.set('x-up-status', String(up.status));
  out.set('x-up-text', up.statusText);
  out.set('x-up-url', up.url || target.href);
  out.set('access-control-expose-headers', '*');
  return new Response(method === 'HEAD' ? null : up.body, {status: 200, headers: out});
}
