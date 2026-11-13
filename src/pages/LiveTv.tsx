import {useEffect, useMemo, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {supabase} from '../lib/supabase';
import {groupCategories, loadLiveChannels, readCachedChannels, writeCachedChannels, type LiveChannel, type LiveSource} from '../lib/liveTv';
import {Message} from '../components/Parts';
import {imgUrl} from '../lib/http';

export const LIVE_KEY = 'live_tv_sources';

export const parseSources = (raw: string): LiveSource[] => {
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.map((x, i) => ({id: String(x?.id || `src${i}`), label: String(x?.label || '').trim(), url: String(x?.url || '').trim()})).filter(x => /^https?:\/\//i.test(x.url));
  } catch { return []; }
};

export const fetchLiveSources = async (): Promise<LiveSource[]> => {
  const {data, error} = await supabase.from('app_settings').select('value').eq('key', LIVE_KEY).maybeSingle();
  if (error) throw new Error(error.message);
  return parseSources(String(data?.value ?? ''));
};

export default function LiveTv() {
  const nav = useNavigate();
  const [channels, setChannels] = useState<LiveChannel[]>(readCachedChannels);
  const [loading, setLoading] = useState(channels.length === 0);
  const [error, setError] = useState('');
  const [noSources, setNoSources] = useState(false);
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');

  const load = () => {
    setError(''); setNoSources(false);
    fetchLiveSources()
      .then(async sources => {
        if (!sources.length) { setNoSources(true); setChannels([]); return; }
        const r = await loadLiveChannels(sources);
        if (r.channels.length) { setChannels(r.channels); writeCachedChannels(r.channels); }
        else if (!channels.length) setError('None of the channel lists could be loaded.');
      })
      .catch(e => !channels.length && setError(e instanceof Error ? e.message : 'Could not load channels'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cats = useMemo(() => groupCategories(channels), [channels]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return channels.filter(c => (cat === 'All' || c.category === cat) && (!t || c.name.toLowerCase().includes(t)));
  }, [channels, cat, q]);

  const play = (c: LiveChannel) => nav('/watch', {state: {direct: {url: c.url, headers: c.headers, live: true}, title: c.name, back: '/live'}});

  return (
    <div className="page">
      <div className="topbar" style={{flexWrap: 'wrap'}}>
        <h1 className="title-xl" style={{fontSize: 34, marginRight: 8}}>Live TV</h1>
        <input className="search" placeholder="Search channels" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {cats.length > 1 && (
        <div className="scroller" style={{paddingTop: 0, paddingBottom: 14}}>
          {[{name: 'All', count: channels.length}, ...cats].map(c => (
            <button key={c.name} className={`tab press${cat === c.name ? ' on' : ''}`} style={{whiteSpace: 'nowrap', background: cat === c.name ? 'var(--surface-2)' : 'var(--surface)'}} onClick={() => setCat(c.name)}>{c.name} · {c.count}</button>
          ))}
        </div>
      )}
      {loading && <div className="center"><div className="spin" /></div>}
      {!loading && noSources && <Message title="No channels yet" text="The admin has not added any Live TV links." />}
      {!loading && error && <Message title="Live TV is unavailable" text={error} action={<button className="btn glass press" onClick={load}>Try again</button>} />}
      {!loading && !error && !noSources && shown.length === 0 && <Message title="No channels found" />}
      <div className="grid live">
        {shown.map(c => (
          <button key={c.id} className="chan press" onClick={() => play(c)} title={c.name}>
            <div className="chan-logo" style={c.logo ? {backgroundImage: `url("${imgUrl(c.logo)}")`} : undefined}>{c.logo ? null : c.name.charAt(0).toUpperCase()}</div>
            <div className="chan-name">{c.name}</div>
            <div className="chan-live"><i /> LIVE</div>
          </button>
        ))}
      </div>
    </div>
  );
}
