import {appFetch} from '../lib/http';

/**
 * hls.js loader that goes through the native HTTP client, so streams that need
 * Referer / User-Agent / Origin headers (and have no CORS) play like they do on mobile.
 */
export const makeNativeLoader = (headers?: Record<string, string>) =>
  class NativeLoader {
    context: any;
    config: any;
    stats: any;
    ctl?: AbortController;
    constructor(config: any) {
      this.config = config;
      this.stats = {aborted: false, loaded: 0, retry: 0, total: 0, chunkCount: 0, bwEstimate: 0,
        loading: {start: 0, first: 0, end: 0}, parsing: {start: 0, end: 0}, buffering: {start: 0, first: 0, end: 0}};
    }
    destroy() { this.abort(); }
    abort() { this.stats.aborted = true; this.ctl?.abort(); }
    getCacheAge() { return null; }
    getResponseHeader() { return null; }
    load(context: any, config: any, callbacks: any) {
      this.context = context;
      this.ctl = new AbortController();
      this.stats.loading.start = performance.now();
      const timer = setTimeout(() => { this.ctl?.abort(); callbacks.onTimeout(this.stats, context, null); }, config.timeout || 20000);
      const h: Record<string, string> = {...(headers ?? {})};
      if (context.rangeStart !== undefined) h.Range = `bytes=${context.rangeStart}-${context.rangeEnd - 1}`;
      appFetch(context.url, {headers: h, signal: this.ctl.signal})
        .then(async res => {
          clearTimeout(timer);
          if (!res.ok) { callbacks.onError({code: res.status, text: res.statusText}, context, res, this.stats); return; }
          const data = context.responseType === 'arraybuffer' ? await res.arrayBuffer() : await res.text();
          const now = performance.now();
          this.stats.loading.first = this.stats.loading.end = now;
          this.stats.loaded = this.stats.total = typeof data === 'string' ? data.length : data.byteLength;
          callbacks.onSuccess({url: res.url || context.url, data}, this.stats, context, res);
        })
        .catch(err => {
          clearTimeout(timer);
          if (!this.stats.aborted) callbacks.onError({code: 0, text: String(err)}, context, null, this.stats);
        });
    }
  };
