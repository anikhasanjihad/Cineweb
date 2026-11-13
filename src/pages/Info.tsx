import {useEffect, useMemo, useState} from 'react';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {useServers} from '../store/servers';
import {providerApi} from '../provider/manager';
import type {EpisodeLink, Info as InfoT} from '../provider/types';
import {inLibrary, toggleLibrary} from '../lib/storage';
import {imgUrl} from '../lib/http';
import {Message} from '../components/Parts';
import {IconBack, IconBookmark, IconPlay} from '../components/Icons';

interface Item { title: string; link: string; type: string }

export default function Info() {
  const [sp] = useSearchParams();
  const providerKey = sp.get('p') ?? '';
  const link = sp.get('link') ?? '';
  const {byKey, providers} = useServers();
  const provider = byKey(providerKey);
  const nav = useNavigate();

  const [info, setInfo] = useState<InfoT | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(0);
  const [eps, setEps] = useState<EpisodeLink[] | null>(null);
  const [epError, setEpError] = useState('');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(() => inLibrary(link, providerKey));

  useEffect(() => {
    if (!provider) return;
    let dead = false;
    setInfo(null); setError(''); setTab(0);
    providerApi.meta(provider, link).then(i => !dead && setInfo(i)).catch(e => !dead && setError(e instanceof Error ? e.message : 'Could not load'));
    return () => { dead = true; };
  }, [provider, link]);

  const current = info?.linkList?.[tab];
  useEffect(() => {
    setEps(null); setEpError('');
    if (!provider || !current?.episodesLink) return;
    let dead = false;
    providerApi.episodes(provider, current.episodesLink).then(e => !dead && setEps(e)).catch(e => !dead && setEpError(e instanceof Error ? e.message : 'Could not load episodes'));
    return () => { dead = true; };
  }, [provider, current?.episodesLink]);

  const items: Item[] = useMemo(() => {
    if (!current) return [];
    if (current.directLinks?.length) return current.directLinks.map(d => ({title: d.title, link: d.link, type: d.type ?? info?.type ?? 'movie'}));
    return (eps ?? []).map(e => ({title: e.title, link: e.link, type: 'series'}));
  }, [current, eps, info?.type]);

  const img0 = info?.image || info?.poster || '';
  const play = (it: Item, index = items.indexOf(it)) =>
    nav('/watch', {state: {
      providerKey, link: it.link, type: it.type, image: img0, infoLink: link,
      title: `${info?.title ?? ''}${items.length > 1 ? ` — ${it.title}` : ''}`,
      queue: items.map(x => ({title: `${info?.title ?? ''} — ${x.title}`, link: x.link, type: x.type})), index,
      back: `/info?p=${encodeURIComponent(providerKey)}&link=${encodeURIComponent(link)}`,
    }});

  if (!provider) return <Message title={providers.length ? 'Server not found' : 'Loading…'} action={<button className="btn glass press" onClick={() => nav('/')}>Home</button>} />;
  if (error) return <Message title="Could not load this title" text={error} action={<button className="btn glass press" onClick={() => nav(-1)}>Back</button>} />;
  if (!info) return <div className="page center"><div className="spin" /></div>;

  const img = info.image || info.poster || '';
  const isSeries = Boolean(current?.episodesLink);

  return (
    <div className="page info">
      <div className="info-bg" />
      <div className="info-top">
        <button className="round press" onClick={() => nav(-1)} aria-label="Back"><IconBack /></button>
      </div>
      <div className="info-wrap">
        <div className="info-poster">{img ? <img src={imgUrl(img)} alt="" decoding="async" draggable={false} /> : null}</div>
        <div style={{flex: 1, minWidth: 0}}>
          <h1 className="title-xl">{info.title}</h1>
          <div className="chips">
            {info.rating && <span className="chip">★ {info.rating}</span>}
            {info.type && <span className="chip" style={{textTransform: 'capitalize'}}>{info.type}</span>}
            {info.tags?.slice(0, 6).map(t => <span key={t} className="chip">{t}</span>)}
          </div>
          <p className="muted" style={{lineHeight: 1.55, maxWidth: 720, fontSize: 15.5, userSelect: 'text'}}>{info.synopsis}</p>
          <div className="actions">
            <button className="btn primary press" disabled={!items.length} onClick={() => items[0] && play(items[0])}><IconPlay /> {isSeries ? 'Play first episode' : 'Play'}</button>
            <button className="btn glass press" onClick={() => setSaved(toggleLibrary({title: info.title, link, image: img, providerKey}))}>
              <IconBookmark on={saved} /> {saved ? 'Saved' : 'Save'}
            </button>
          </div>
          {info.linkList.length > 1 && (
            <div className="tabs">
              {info.linkList.map((l, i) => (
                <button key={i} className={`tab${i === tab ? ' on' : ''}`} onClick={() => setTab(i)}>{l.title}{l.quality ? ` · ${l.quality}` : ''}</button>
              ))}
            </div>
          )}
          {note && <p className="ok">{note}</p>}
          {isSeries && !eps && !epError && <div className="spin" style={{margin: '24px 0', width: 30, height: 30}} />}
          {epError && <p className="err">{epError}</p>}
          {(items.length > 1 || isSeries) && (
            <div className="eps">
              {items.map((it, i) => (
                <div key={it.link + i} style={{display: 'flex', gap: 8}}>
                  <button className="ep press" style={{flex: 1}} onClick={() => play(it, i)}>
                    <span className="n">{i + 1}</span><span className="t">{it.title}</span><IconPlay />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
