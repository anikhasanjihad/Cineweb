import type {SerializedResponse} from '../provider/execute';

const b64url = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach(b => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

// By default the proxy is the Vercel function on this site (/api/proxy). Set VITE_PROXY_URL to move it to your own
// Cloudflare Worker (see cloudflare-worker/proxy.js) so video bandwidth is not billed by Vercel.
const PROXY_BASE = ((import.meta as any).env?.VITE_PROXY_URL as string | undefined)?.trim().replace(/\/+$/, '') || '/api/proxy';

/**
 * URL of our own proxy (api/proxy.ts) for a remote resource.
 * `raw` keeps the real status / Range support, which <video> needs.
 */
export const proxyUrl = (url: string, headers?: Record<string, string>, raw = false, redirect: 'follow' | 'manual' = 'follow') => {
  let q = `u=${encodeURIComponent(url)}`;
  if (headers && Object.keys(headers).length) q += `&h=${b64url(JSON.stringify(headers))}`;
  if (raw) q += '&raw=1';
  if (redirect === 'manual') q += '&r=manual';
  return `${PROXY_BASE}?${q}`;
};

/** Images: only plain-http images need the proxy (an https page can not show them). */
export const imgUrl = (url?: string | null) => (url && /^http:\/\//i.test(url) ? proxyUrl(url, undefined, true) : url ?? '');

const NO_BODY = new Set([101, 204, 205, 304]);

/**
 * Network access for the website. Browsers block cross-site requests (CORS) and forbid headers such as
 * User-Agent / Referer / Origin, so every request to another site goes through /api/proxy, which makes
 * the real call from the server with the headers the provider asked for - same result as the app's native HTTP.
 */
export const appFetch = async (input: string, init?: RequestInit): Promise<Response> => {
  let target: URL;
  try { target = new URL(input, location.href); } catch { return fetch(input, init); }
  if (target.origin === location.origin || !/^https?:$/.test(target.protocol)) return fetch(input, init);

  const headers: Record<string, string> = {};
  new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
  const method = (init?.method ?? 'GET').toUpperCase();
  const res = await fetch(proxyUrl(target.href, headers, false, init?.redirect === 'manual' ? 'manual' : 'follow'), {
    method,
    body: method === 'GET' || method === 'HEAD' ? undefined : init?.body,
    signal: init?.signal,
    cache: 'no-store',
  });
  const upstream = res.headers.get('x-up-status');
  if (upstream === null) return res; // proxy itself answered (blocked / failed)
  const status = Number(upstream) || 200;
  const out = new Response(NO_BODY.has(status) || status < 200 ? null : res.body, {
    status: status < 200 ? 200 : status,
    statusText: res.headers.get('x-up-text') ?? '',
    headers: res.headers,
  });
  Object.defineProperty(out, 'url', {value: res.headers.get('x-up-url') || target.href});
  return out;
};

export const hostFetch = async (args: {
  url: string;
  init: {method?: string; headers: Array<[string, string]>; body: {kind: string; value?: string}; redirect: 'follow' | 'manual'};
}): Promise<SerializedResponse> => {
  const {url, init} = args;
  const headers = new Headers();
  for (const [k, v] of init.headers) {
    try { headers.set(k, v); } catch { /* skip invalid header */ }
  }
  let body: BodyInit | undefined;
  if (init.body.kind === 'text') body = init.body.value;
  else if (init.body.kind === 'base64') body = Uint8Array.from(atob(init.body.value ?? ''), c => c.charCodeAt(0));
  const res = await appFetch(url, {method: init.method ?? 'GET', headers, body, redirect: init.redirect});
  const buf = new Uint8Array(await res.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const out: Array<[string, string]> = [];
  res.headers.forEach((v, k) => out.push([k, v]));
  return {status: res.status, statusText: res.statusText, url: res.url || url, headers: out, bodyBase64: btoa(s)};
};
