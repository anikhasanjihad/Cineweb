import {supabase, type ServerRow} from '../lib/supabase';
import {appFetch} from '../lib/http';
import {createProviderSource, getProviderFilesUrl} from '../lib/sources';
import {invokeProvider} from './runner';
import type {Catalog, EpisodeLink, Info, Post, Provider, Stream} from './types';

const labelFor = (label: string, i: number, total: number) => (total > 1 ? `${label} ${i + 1}` : label);

const getText = async (url: string, timeoutMs = 15000) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await appFetch(url, {signal: ctl.signal, headers: {'Cache-Control': 'no-cache'}});
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
};

/** Servers the admin set up, each expanded into the providers its source offers. */
export const loadProviders = async (): Promise<Provider[]> => {
  const {data, error} = await supabase
    .from('cinehub_servers')
    .select('*')
    .eq('enabled', true)
    .order('position', {ascending: true})
    .order('created_at', {ascending: true});
  if (error) throw new Error(error.message);
  const servers = (data ?? []) as ServerRow[];

  const groups = await Promise.all(
    servers.map(async (server): Promise<Provider[]> => {
      try {
        const source = createProviderSource(server.source_url);
        const manifestUrl = server.manifest_url?.trim() || source.manifestUrl || `${source.url}/manifest.json`;
        const manifest = JSON.parse(await getText(`${manifestUrl}${manifestUrl.includes('?') ? '&' : '?'}t=${Date.now()}`));
        if (!Array.isArray(manifest)) return [];
        let list = manifest.filter((p: any) => p && !p.disabled);
        if (server.provider_value?.trim()) list = list.filter((p: any) => p.value === server.provider_value!.trim());
        const hidden = new Set(server.hidden_providers ?? []);
        list = list.filter((p: any) => !hidden.has(p.value));
        return list.map((p: any, i: number): Provider => ({
          key: `${server.id}:${p.value}`,
          value: p.value,
          name: labelFor(server.label, i, list.length),
          logo: server.logo_url?.trim() || p.icon || '',
          sourceUrl: source.url,
          path: p.path,
          version: String(p.version ?? '1'),
          scope: `${server.id}:${p.value}`,
        }));
      } catch (e) {
        console.warn('Server failed to load:', server.label, e);
        return [];
      }
    }),
  );
  return groups.flat();
};

const FILES = ['catalog', 'posts', 'meta', 'stream', 'episodes'] as const;
type FileName = (typeof FILES)[number];
const moduleCache = new Map<string, Promise<string | null>>();

const getModule = (p: Provider, file: FileName): Promise<string | null> => {
  const key = `${p.key}:${p.version}:${file}`;
  if (!moduleCache.has(key)) {
    const base = getProviderFilesUrl(p.sourceUrl, p.value, p.path);
    moduleCache.set(
      key,
      getText(`${base}/${file}.js?v=${encodeURIComponent(p.version)}`).catch(() => null),
    );
  }
  return moduleCache.get(key)!;
};

const need = async (p: Provider, file: FileName) => {
  const code = await getModule(p, file);
  if (!code) throw new Error(`This server has no ${file} module`);
  return code;
};
const asArray = <T,>(v: unknown, what: string): T[] => {
  if (!Array.isArray(v)) throw new Error(`The server returned an invalid ${what} list`);
  return v as T[];
};

export const providerApi = {
  catalog: async (p: Provider): Promise<Catalog[]> => {
    const code = await getModule(p, 'catalog');
    if (!code) return [];
    const mod = (await invokeProvider<{catalog?: Catalog[]}>(code, undefined, {}, p.scope)) ?? {};
    return Array.isArray(mod.catalog) ? mod.catalog : [];
  },
  posts: async (p: Provider, filter: string, page = 1) =>
    asArray<Post>(await invokeProvider(await need(p, 'posts'), 'getPosts', {filter, page, providerValue: p.value}, p.scope), 'posts'),
  search: async (p: Provider, searchQuery: string, page = 1) =>
    asArray<Post>(await invokeProvider(await need(p, 'posts'), 'getSearchPosts', {searchQuery, page, providerValue: p.value}, p.scope), 'search'),
  meta: async (p: Provider, link: string) =>
    invokeProvider<Info>(await need(p, 'meta'), 'getMeta', {link, provider: p.value}, p.scope),
  episodes: async (p: Provider, url: string) =>
    asArray<EpisodeLink>(await invokeProvider(await need(p, 'episodes'), 'getEpisodes', {url}, p.scope), 'episode'),
  streams: async (p: Provider, link: string, type: string) =>
    asArray<Stream>(await invokeProvider(await need(p, 'stream'), 'getStream', {link, type, isDownload: false}, p.scope), 'stream'),
};
