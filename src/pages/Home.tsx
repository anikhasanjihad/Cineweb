import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useServers} from '../store/servers';
import {providerApi} from '../provider/manager';
import type {Catalog, Post} from '../provider/types';
import {Message, PosterRow, ServerRow} from '../components/Parts';
import {IconPlay} from '../components/Icons';
import {load} from '../lib/storage';
import {useSettings} from '../lib/settings';
import {imgUrl} from '../lib/http';

type Rows = Record<string, Post[] | 'error'>;

export default function Home() {
  const {providers, active, select, loading, error, reload} = useServers();
  const nav = useNavigate();
  const settings = useSettings();
  const resume = load<Array<{key: string; providerKey: string; link: string; title: string; image: string}>>('continue', []);
  const [catalog, setCatalog] = useState<Catalog[] | null>(null);
  const [rows, setRows] = useState<Rows>({});
  const [fail, setFail] = useState('');

  const open = (p: Post) => nav(`/info?p=${encodeURIComponent(active!.key)}&link=${encodeURIComponent(p.link)}`);

  useEffect(() => {
    if (!active) return;
    let dead = false;
    setCatalog(null); setRows({}); setFail('');
    providerApi.catalog(active).then(async cat => {
      if (dead) return;
      const list = cat.slice(0, 8);
      setCatalog(list);
      // Rows fill in as they arrive, so the page never waits for the slowest one.
      list.forEach(c =>
        providerApi.posts(active, c.filter, 1)
          .then(posts => !dead && setRows(r => ({...r, [c.title]: posts})))
          .catch(() => !dead && setRows(r => ({...r, [c.title]: 'error'}))),
      );
    }).catch(e => !dead && setFail(e instanceof Error ? e.message : 'Could not load this server'));
    return () => { dead = true; };
  }, [active]);

  if (loading && providers.length === 0) return <Message title="Loading servers…" />;
  if (!providers.length) {
    return <Message title="No servers yet" text={error || 'Ask the admin to add a server in the Cinebox app.'} action={<button className="btn glass press" onClick={reload}>Try again</button>} />;
  }

  const first = catalog?.length ? rows[catalog[0].title] : undefined;
  const hero = Array.isArray(first) ? first.find(p => p.image) : undefined;

  return (
    <div className="page">
      {hero ? (
        <header className="hero">
          <div className="hero-bg" style={{backgroundImage: `url("${imgUrl(hero.image)}")`}} />
          <div className="hero-body">
            <div className="muted" style={{fontWeight: 600, marginBottom: 8}}>{active?.name}</div>
            <h1 className="title-xl">{hero.title}</h1>
            <div style={{display: 'flex', gap: 12, marginTop: 22}}>
              <button className="btn primary press" onClick={() => open(hero)}><IconPlay /> Play</button>
              <button className="btn glass press" onClick={() => open(hero)}>More info</button>
            </div>
          </div>
        </header>
      ) : (
        <div style={{height: 56}} />
      )}
      <ServerRow providers={providers} active={active} onSelect={select} />
      {settings.showContinue && resume.length > 0 && (
        <PosterRow title="Continue watching" posts={resume.map(r => ({title: r.title, image: r.image, link: `${r.providerKey}\u0001${r.link}`}))}
          onOpen={p => { const [k, l] = p.link.split('\u0001'); nav(`/info?p=${encodeURIComponent(k)}&link=${encodeURIComponent(l)}`); }} />
      )}
      {fail && <Message title="This server is not responding" text={fail} />}
      {!fail && !catalog && <PosterRow title="Loading" posts={null} onOpen={open} />}
      {catalog?.map(c => {
        const r = rows[c.title];
        if (r === 'error') return null;
        if (Array.isArray(r) && r.length === 0) return null;
        return <PosterRow key={c.title} title={c.title} posts={r ?? null} onOpen={open} />;
      })}
      <div style={{height: 60}} />
    </div>
  );
}
