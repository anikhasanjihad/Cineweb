/// <reference lib="webworker" />
// One worker per call: provider code never shares a realm with the app or with
// another provider, and the app can terminate a runaway one.
import {executeProvider} from './execute';

let nextId = 0;
const pending = new Map<number, {resolve: (v: unknown) => void; reject: (e: Error) => void}>();

const rpc = <T>(op: string, args: unknown) =>
  new Promise<T>((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, {resolve: resolve as (v: unknown) => void, reject});
    self.postMessage({type: 'rpc', id, op, args});
  });

self.addEventListener('message', async (e: MessageEvent) => {
  const m = e.data;
  if (m.type === 'rpc-result') {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    m.error ? p.reject(new Error(m.error)) : p.resolve(m.result);
    return;
  }
  if (m.type !== 'invoke') return;
  try {
    const result = await executeProvider(m.code, m.exportName, m.args ?? {}, {
      rpc,
      commonHeaders: m.commonHeaders,
      log: (level, message) => self.postMessage({type: 'log', level, message}),
    });
    self.postMessage({type: 'result', result: JSON.parse(JSON.stringify(result ?? null))});
  } catch (err) {
    self.postMessage({type: 'result', error: err instanceof Error ? err.message : String(err)});
  }
});
