/**
 * Runs one provider module. Provider modules are plain CommonJS-style scripts
 * (the same files the mobile app downloads). They get a `providerContext` with
 * axios, cheerio, Crypto, and a few host calls, and nothing else: no DOM, no
 * direct network. `rpc` is how they reach the outside world.
 */
import axios, {AxiosHeaders, type AxiosAdapter} from 'axios';
import * as cheerio from 'cheerio';

export type Rpc = <T = unknown>(op: string, args: unknown) => Promise<T>;

export interface SerializedResponse {
  status: number;
  statusText: string;
  url: string;
  headers: Array<[string, string]>;
  bodyBase64: string;
}

const toBase64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
};
const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

const headerEntries = (source: unknown): Array<[string, string]> => {
  const out: Array<[string, string]> = [];
  if (!source) return out;
  const h = source as {forEach?: (cb: (v: string, k: string) => void) => void};
  if (typeof h.forEach === 'function' && !Array.isArray(source)) {
    h.forEach((v, k) => out.push([k, String(v)]));
    return out;
  }
  if (Array.isArray(source)) {
    for (const p of source) if (Array.isArray(p) && p.length >= 2) out.push([String(p[0]), String(p[1])]);
    return out;
  }
  for (const [k, v] of Object.entries(source as Record<string, unknown>)) {
    if (v != null && typeof v !== 'object') out.push([k, String(v)]);
  }
  return out;
};

const serializeBody = async (body: unknown) => {
  if (body == null) return {kind: 'none'};
  if (typeof body === 'string') return {kind: 'text', value: body};
  if (body instanceof ArrayBuffer) return {kind: 'base64', value: toBase64(new Uint8Array(body))};
  if (body instanceof Uint8Array) return {kind: 'base64', value: toBase64(body)};
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return {kind: 'text', value: body.toString()};
  }
  try {
    return {kind: 'text', value: JSON.stringify(body) ?? ''};
  } catch {
    return {kind: 'text', value: String(body)};
  }
};

const makeFetch = (rpc: Rpc) => async (input: any, init: any = {}) => {
  const url = typeof input === 'string' ? input : String(input?.url ?? input);
  const r = await rpc<SerializedResponse>('fetch', {
    url,
    init: {
      method: init?.method ?? input?.method,
      headers: [...headerEntries(input?.headers), ...headerEntries(init?.headers)],
      body: await serializeBody(init?.body ?? input?.body),
      redirect: init?.redirect === 'manual' ? 'manual' : 'follow',
    },
  });
  const bytes = fromBase64(r.bodyBase64);
  const nullBody = r.status === 204 || r.status === 304;
  const res = new Response(nullBody ? null : (bytes.buffer as ArrayBuffer), {
    status: r.status,
    statusText: r.statusText,
    headers: r.headers,
  });
  Object.defineProperty(res, 'url', {value: r.url});
  return res;
};

const makeAdapter = (fetchFn: ReturnType<typeof makeFetch>): AxiosAdapter => async config => {
  let url = config.url ?? '';
  if (config.baseURL && !/^https?:/i.test(url)) {
    url = `${config.baseURL.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
  }
  if (config.params) {
    const q = new URLSearchParams(config.params as Record<string, string>).toString();
    if (q) url += `${url.includes('?') ? '&' : '?'}${q}`;
  }
  let body = config.data;
  const hdrs = headerEntries(config.headers);
  if (body && typeof body === 'object' && !(body instanceof URLSearchParams) && !(body instanceof ArrayBuffer)) {
    if (!hdrs.some(([k]) => k.toLowerCase() === 'content-type')) hdrs.push(['Content-Type', 'application/json']);
  }
  const res = await fetchFn(url, {
    method: config.method?.toUpperCase(),
    headers: hdrs,
    body,
    redirect: config.maxRedirects === 0 ? 'manual' : 'follow',
  });
  const responseHeaders = new AxiosHeaders();
  res.headers.forEach((v, k) => responseHeaders.set(k, v));
  let data: unknown;
  if (config.responseType === 'arraybuffer') {
    data = await res.arrayBuffer();
  } else {
    const text = await res.text();
    if (config.responseType === 'text') data = text;
    else {
      try {
        data = text ? JSON.parse(text) : '';
      } catch {
        data = text;
      }
    }
  }
  const result = {
    data,
    status: res.status,
    statusText: res.statusText,
    headers: responseHeaders,
    config,
    request: {responseURL: res.url, res: {responseUrl: res.url}},
  } as any;
  if (config.validateStatus && !config.validateStatus(res.status)) {
    const err: any = new Error(`Request failed with status code ${res.status}`);
    err.response = result;
    err.config = config;
    err.isAxiosError = true;
    throw err;
  }
  return result;
};

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

const makeCrypto = (rpc: Rpc) => ({
  CryptoDigestAlgorithm: {SHA1: 'SHA-1', SHA256: 'SHA-256', SHA384: 'SHA-384', SHA512: 'SHA-512', MD5: 'MD5'},
  CryptoEncoding: {HEX: 'hex', BASE64: 'base64'},
  digestStringAsync: async (algorithm: string, data: string, options?: {encoding?: string}) => {
    if (algorithm === 'MD5') throw new Error('MD5 is not supported on desktop');
    const digest = await crypto.subtle.digest(algorithm, new TextEncoder().encode(data));
    return options?.encoding === 'base64' ? toBase64(new Uint8Array(digest)) : hex(digest);
  },
  getRandomBytesAsync: async (n: number) => crypto.getRandomValues(new Uint8Array(n)),
  randomUUID: () => crypto.randomUUID(),
  _rpc: rpc,
});

/** TypeScript's helper for transpiled async functions, as modules expect it. */
const awaiter = () =>
  function __awaiter(thisArg: unknown, args: unknown, P: PromiseConstructor | undefined, gen: (...a: unknown[]) => Generator) {
    const Ctor = P ?? Promise;
    const adopt = (v: unknown) => (v instanceof Ctor ? v : new Ctor(r => r(v)));
    return new Ctor((resolve, reject) => {
      const fulfilled = (v: unknown) => { try { step(it.next(v)); } catch (e) { reject(e); } };
      const rejected = (v: unknown) => { try { step(it.throw(v)); } catch (e) { reject(e); } };
      const step = (r: IteratorResult<unknown>) => (r.done ? resolve(r.value) : adopt(r.value).then(fulfilled, rejected));
      const it = gen.apply(thisArg, (args as unknown[]) ?? []);
      step(it.next());
    });
  };

export interface ExecuteOptions {
  rpc: Rpc;
  commonHeaders?: Record<string, string>;
  log?: (level: string, message: string) => void;
}

export const executeProvider = async (
  moduleCode: string,
  exportName: string | undefined,
  args: Record<string, unknown>,
  {rpc, commonHeaders = {}, log}: ExecuteOptions,
) => {
  const fetchFn = makeFetch(rpc);
  const instance = axios.create();
  instance.defaults.adapter = makeAdapter(fetchFn);
  const providerContext = Object.freeze({
    axios: instance,
    cheerio,
    Crypto: makeCrypto(rpc),
    commonHeaders,
    getBaseUrl: (providerValue: string) => rpc<string>('getBaseUrl', {providerValue}),
    openWebView: () => Promise.reject(new Error('Web verification is not available on desktop yet')),
    getCookies: async () => ({}),
    kvStore: {
      get: (key: string) => rpc('kvGet', {key}),
      set: (key: string, value: unknown) => rpc('kvSet', {key, value}),
      delete: (key: string) => rpc('kvDelete', {key}),
      keys: () => rpc('kvKeys', {}),
      clear: () => rpc('kvClear', {}),
    },
  });
  const note = (level: string) => (...a: unknown[]) => log?.(level, a.map(String).join(' ').slice(0, 1000));
  const sandboxConsole = {log: note('log'), debug: note('log'), info: note('log'), warn: note('warn'), error: note('error')};

  const exports: Record<string, unknown> = {};
  const module = {exports};
  const blocked = ['globalThis', 'self', 'postMessage', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker', 'BroadcastChannel', 'indexedDB', 'caches', 'importScripts'];
  const run = new Function(
    'exports', 'module', 'require', 'console', 'Promise', 'setTimeout', 'clearTimeout', 'fetch', '__awaiter', 'providerGlobal',
    ...blocked,
    `"use strict";\n${moduleCode}`,
  );
  run(exports, module, () => ({}), sandboxConsole, Promise, setTimeout, clearTimeout, fetchFn, awaiter(), {}, ...blocked.map(() => undefined));

  const out = module.exports as Record<string, unknown>;
  const call = (fn: unknown) =>
    (fn as (a: unknown) => unknown)({...args, signal: new AbortController().signal, providerContext});
  if (!exportName) {
    const resolved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(out)) {
      if (typeof v === 'function') {
        try { resolved[k] = await call(v); } catch { resolved[k] = v; }
      } else resolved[k] = v;
    }
    return resolved;
  }
  if (typeof out[exportName] !== 'function') throw new Error(`Provider module does not export ${exportName}`);
  return call(out[exportName]);
};
