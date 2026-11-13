import {describe, expect, it} from 'vitest';
import {executeProvider, type Rpc} from '../src/provider/execute';
import {createProviderSource, getProviderFilesUrl} from '../src/lib/sources';

const html = '<ul><li><a href="/m/1">First</a></li><li><a href="/m/2">Second</a></li></ul>';

const rpc: Rpc = async (op, args: any) => {
  if (op === 'fetch') {
    const body = args.url.endsWith('.json') ? JSON.stringify({ok: true}) : html;
    return {
      status: 200, statusText: 'OK', url: args.url,
      headers: [['content-type', 'text/html']],
      bodyBase64: btoa(body),
    } as never;
  }
  if (op === 'getBaseUrl') return 'https://site.test' as never;
  return undefined as never;
};

// Written the way the real provider bundles are: CommonJS exports + __awaiter.
const moduleCode = `
exports.getPosts = function (_a) {
  var providerContext = _a.providerContext;
  return __awaiter(this, void 0, void 0, function* () {
    var base = yield providerContext.getBaseUrl('x');
    var res = yield providerContext.axios.get(base + '/list', {headers: providerContext.commonHeaders});
    var $ = providerContext.cheerio.load(res.data);
    var out = [];
    $('li a').each(function (_, el) { out.push({title: $(el).text(), link: $(el).attr('href'), image: ''}); });
    return out;
  });
};
exports.catalog = [{title: 'Latest', filter: ''}];
`;

describe('executeProvider', () => {
  it('runs a provider export through axios + cheerio over rpc', async () => {
    const posts = (await executeProvider(moduleCode, 'getPosts', {}, {rpc})) as any[];
    expect(posts.map(p => p.title)).toEqual(['First', 'Second']);
  });
  it('resolves every export when no name is given (catalog)', async () => {
    const out = (await executeProvider(moduleCode, undefined, {}, {rpc})) as any;
    expect(out.catalog).toEqual([{title: 'Latest', filter: ''}]);
  });
  it('parses JSON responses', async () => {
    const code = `exports.get = async function(a){ const r = await a.providerContext.axios.get('https://x.test/a.json'); return r.data; }`;
    expect(await executeProvider(code, 'get', {}, {rpc})).toEqual({ok: true});
  });
  it('hides browser globals from provider code', async () => {
    const code = `exports.get = function(){ return [typeof globalThis, typeof XMLHttpRequest, typeof WebSocket]; }`;
    expect(await executeProvider(code, 'get', {}, {rpc})).toEqual(['undefined', 'undefined', 'undefined']);
  });
  it('rejects a missing export', async () => {
    await expect(executeProvider(moduleCode, 'nope', {}, {rpc})).rejects.toThrow(/does not export/);
  });
});

describe('sources', () => {
  it('turns a github repo into raw urls and provider folders', () => {
    const s = createProviderSource('https://github.com/acme/providers');
    expect(s.url).toBe('https://raw.githubusercontent.com/acme/providers/refs/heads/main');
    expect(getProviderFilesUrl(s.url, 'film')).toBe(`${s.url}/dist/film`);
    expect(getProviderFilesUrl(s.url, 'film', '/providers/film')).toBe(`${s.url}/providers/film`);
  });
});

import {cueAt, parseSubtitles} from '../src/player/subtitles';
describe('subtitles', () => {
  it('reads srt and vtt, strips tags, finds the cue at a time', () => {
    const srt = '1\n00:00:01,000 --> 00:00:03,500\n<i>Hello</i>\n\n2\n00:01:00,000 --> 00:01:02,000\nSecond\nline\n';
    const cues = parseSubtitles(srt);
    expect(cues).toHaveLength(2);
    expect(cueAt(cues, 2)?.text).toBe('Hello');
    expect(cueAt(cues, 30)).toBeNull();
    expect(cueAt(cues, 61)?.text).toBe('Second\nline');
    const vtt = 'WEBVTT\n\n00:05.000 --> 00:07.000 align:start\nHi there\n';
    expect(parseSubtitles(vtt)[0]).toEqual({start: 5, end: 7, text: 'Hi there'});
  });
});
