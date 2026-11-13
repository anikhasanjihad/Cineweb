import {hostFetch} from '../lib/http';

const commonHeaders = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

const kv = (scope: string) => {
  const key = (k: string) => `kv:${scope}:${k}`;
  return {
    get: (k: string) => {
      try {
        const v = localStorage.getItem(key(k));
        return v == null ? undefined : JSON.parse(v);
      } catch {
        return undefined;
      }
    },
    set: (k: string, v: unknown) => localStorage.setItem(key(k), JSON.stringify(v)),
    delete: (k: string) => {
      const had = localStorage.getItem(key(k)) != null;
      localStorage.removeItem(key(k));
      return had;
    },
    keys: () => Object.keys(localStorage).filter(k => k.startsWith(`kv:${scope}:`)).map(k => k.slice(`kv:${scope}:`.length)),
    clear: () => Object.keys(localStorage).filter(k => k.startsWith(`kv:${scope}:`)).forEach(k => localStorage.removeItem(k)),
  };
};

/** Runs a module export in a fresh worker; kills it after `timeoutMs`. */
export const invokeProvider = <T>(
  code: string,
  exportName: string | undefined,
  args: Record<string, unknown>,
  scope: string,
  timeoutMs = 45000,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), {type: 'module'});
    const store = kv(scope);
    const done = (fn: () => void) => {
      clearTimeout(timer);
      worker.terminate();
      fn();
    };
    const timer = setTimeout(() => done(() => reject(new Error('The server took too long to answer'))), timeoutMs);
    worker.onerror = e => done(() => reject(new Error(e.message || 'Provider crashed')));
    worker.onmessage = async (e: MessageEvent) => {
      const m = e.data;
      if (m.type === 'result') {
        done(() => (m.error ? reject(new Error(m.error)) : resolve(m.result as T)));
      } else if (m.type === 'rpc') {
        try {
          let result: unknown;
          switch (m.op) {
            case 'fetch': result = await hostFetch(m.args); break;
            case 'getBaseUrl': result = ''; break;
            case 'kvGet': result = store.get(m.args.key); break;
            case 'kvSet': store.set(m.args.key, m.args.value); break;
            case 'kvDelete': result = store.delete(m.args.key); break;
            case 'kvKeys': result = store.keys(); break;
            case 'kvClear': store.clear(); break;
            default: throw new Error(`Unsupported provider call: ${m.op}`);
          }
          worker.postMessage({type: 'rpc-result', id: m.id, result});
        } catch (err) {
          worker.postMessage({type: 'rpc-result', id: m.id, error: err instanceof Error ? err.message : String(err)});
        }
      }
    };
    worker.postMessage({type: 'invoke', code, exportName, args, commonHeaders});
  });
