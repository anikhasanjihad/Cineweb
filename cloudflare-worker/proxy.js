// Cloudflare Worker version of api/proxy.ts - same job, but video bandwidth is not billed by Cloudflare.
// Deploy: Cloudflare dashboard -> Workers & Pages -> Create -> Hello World -> Edit code -> paste this file -> Deploy.
// Then Settings -> Variables: ALLOWED_ORIGINS = your-site.vercel.app (comma separated hosts, no https://).
// Finally set VITE_PROXY_URL=https://<your-worker>.workers.dev in the Vercel project and redeploy.
const HOP = new Set([
  'content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive', 'set-cookie',
  'content-security-policy', 'content-security-policy-report-only', 'x-frame-options', 'strict-transport-security',
  'access-control-allow-origin', 'access-control-allow-credentials', 'access-control-allow-headers',
  'access-control-allow-methods', 'access-control-expose-headers', 'cross-origin-resource-policy',
  'cross-origin-opener-policy', 'cross-origin-embedder-policy', 'report-to', 'nel', 'alt-svc',
]);
const DROP_REQ = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip']);
const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const privateHost = host => {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h.includes(':')) return h === '::1' || h === '::' || /^f[cd]/.test(h) || h.startsWith('fe80') || h.startsWith('::ffff:');
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]), b = Number(m[2]);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
};
const fromB64url = s => {
  const p = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return new TextDecoder().decode(Uint8Array.from(atob(p), c => c.charCodeAt(0)));
};
const hostOf = v => { try { return v ? new URL(v).host : ''; } catch { return ''; } };
const fail = (status, message, extra = {}) =>
  new Response(JSON.stringify({error: message}), {status, headers: {'content-type': 'application/json', 'cache-control': 'no-store', ...extra}});

export default {
  async fetch(req, env) {
    const self = new URL(req.url).host;
    const hosts = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const origin = req.headers.get('origin');
    const from = hostOf(origin) || hostOf(req.headers.get('referer'));
    const ok = Boolean(from) && hosts.includes(from); // only your own site may use it: not an open proxy
    const cors = ok && origin ? {'access-control-allow-origin': origin, 'access-control-expose-headers': '*', vary: 'origin'} : {};

    if (req.method === 'OPTIONS') {
      return new Response(null, {status: ok ? 204 : 403, headers: {...cors, 'access-control-allow-methods': 'GET, HEAD, POST', 'access-control-allow-headers': req.headers.get('access-control-request-headers') || '*', 'access-control-max-age': '86400'}});
    }
    if (!ok) return fail(403, 'Not allowed');

    const q = new URL(req.url).searchParams;
    let target;
    try { target = new URL(q.get('u') || ''); } catch { return fail(400, 'Bad url', cors); }
    if (!/^https?:$/.test(target.protocol) || privateHost(target.hostname) || target.host === self) return fail(400, 'Blocked url', cors);

    const headers = new Headers();
    try {
      const extra = q.get('h') ? JSON.parse(fromB64url(q.get('h'))) : {};
      for (const [k, v] of Object.entries(extra)) {
        if (!DROP_REQ.has(k.toLowerCase())) { try { headers.set(k, String(v)); } catch { /* invalid header */ } }
      }
    } catch { return fail(400, 'Bad headers', cors); }
    if (!headers.has('user-agent')) headers.set('user-agent', DEFAULT_UA);
    const range = req.headers.get('range');
    if (range && !headers.has('range')) headers.set('range', range);

    const raw = q.get('raw') === '1';
    const method = req.method === 'HEAD' ? 'HEAD' : req.method;
    const body = method === 'GET' || method === 'HEAD' ? undefined : await req.arrayBuffer();

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 24000);
    let up;
    try {
      up = await fetch(target.href, {method, headers, body, redirect: q.get('r') === 'manual' ? 'manual' : 'follow', signal: ctl.signal});
    } catch (e) {
      return fail(502, e && e.name === 'AbortError' ? 'Upstream timed out' : 'Upstream request failed', cors);
    } finally {
      clearTimeout(timer);
    }

    const out = new Headers();
    up.headers.forEach((v, k) => { if (!HOP.has(k.toLowerCase())) out.set(k, v); });
    for (const [k, v] of Object.entries(cors)) out.set(k, v);
    out.set('cache-control', raw && up.ok ? 'private, max-age=300' : 'no-store');
    out.set('x-content-type-options', 'nosniff');
    if (raw) return new Response(method === 'HEAD' ? null : up.body, {status: up.status, statusText: up.statusText, headers: out});
    out.set('x-up-status', String(up.status));
    out.set('x-up-text', up.statusText);
    out.set('x-up-url', up.url || target.href);
    return new Response(method === 'HEAD' ? null : up.body, {status: 200, headers: out});
  },
};
