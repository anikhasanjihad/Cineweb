import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useServers} from '../store/servers';
import {providerApi} from '../provider/manager';
import type {Catalog, Post} from '../provider/types';
import {Message, PosterRow, ServerRow, useNearScreen} from '../components/Parts';
import {IconPlay} from '../components/Icons';
import {load} from '../lib/storage';
import {useSettings} from '../lib/settings';
import {imgUrl} from '../lib/http';

type Rows = Record<string, Post[] | 'error'>;

/** A catalog row that downloads its posters only when it is about to be scrolled into view (saves mobile data). */
const LazyRow = ({provider, cat, onOpen}: {provider: NonNullable<ReturnType<typeof useServers>['active']>; cat: Catalog; onOpen: (p: Post) => void}) => {
  const [ref, near] = useNearScreen();
  const [posts, setPosts] = useState<Post[] | 'error' | null>(null);
  useEffect(() => {
    if (!near) return;
    let dead = false;
    providerApi.posts(provider, cat.filter, 1).then(p => !dead && setPosts(p)).catch(() => !dead && setPosts('error'));
    return () => { dead = true; };
  }, [near, provider, cat.filter]);
  if (posts === 'error' || (Array.isArray(posts) && posts.length === 0)) return null;
  return <div ref={ref}><PosterRow title={cat.title} posts={posts} onOpen={onOpen} /></div>;
};

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
      // Only the first row (it feeds the top banner) loads now; the other rows load when you scroll near them.
      const c = list[0];
      if (c) providerApi.posts(active, c.filter, 1)
        .then(posts => !dead && setRows(r => ({...r, [c.title]: posts})))
        .catch(() => !dead && setRows(r => ({...r, [c.title]: 'error'})));
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
      <div className="m-bar"><img src="/logo.png" alt="" width={30} height={30} /><span>Cinebox</span><small className="build">{__BUILD__}</small></div>
      {hero ? (
        <header className="hero">
          <img className="hero-bg" src={imgUrl(hero.image)} alt="" decoding="async" fetchPriority="high" draggable={false} />
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
      {catalog?.map((c, i) => {
        if (i > 0) return <LazyRow key={c.title} provider={active!} cat={c} onOpen={open} />;
        const r = rows[c.title];
        if (r === 'error') return null;
        if (Array.isArray(r) && r.length === 0) return null;
        return <PosterRow key={c.title} title={c.title} posts={r ?? null} onOpen={open} />;
      })}
      <div style={{height: 60}} />
    </div>
  );
}
