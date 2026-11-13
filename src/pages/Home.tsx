import {useCallback, useEffect, useRef, useState} from 'react';
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


/**
 * Auto-sliding top banner. Data-friendly by design:
 *  - it only reuses posters of the first row (the same image URLs the row already shows, so the browser cache serves them),
 *  - the next picture is fetched only right before it is shown, and at most 2 pictures are in the page at once,
 *  - it pauses when the tab/app is hidden, when the banner is scrolled out of view, with Data Saver on and with reduced motion.
 */
const SLIDE_MS = 5500;
const HeroSlider = ({slides, serverName, onOpen}: {slides: Post[]; serverName?: string; onOpen: (p: Post) => void}) => {
  const [idx, setIdx] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [inView, setInView] = useState(true);
  const [pageOn, setPageOn] = useState(() => !document.hidden);
  const idxRef = useRef(0);
  const loaded = useRef(new Set<number>([0]));
  const box = useRef<HTMLElement>(null);
  const touchX = useRef<number | null>(null);
  const n = slides.length;
  const list = useRef(slides);
  list.current = slides;

  const go = useCallback((to: number) => {
    if (n < 2) return;
    const t = ((to % n) + n) % n;
    if (t === idxRef.current) return;
    const show = () => { setPrev(idxRef.current); idxRef.current = t; setIdx(t); };
    if (loaded.current.has(t)) { show(); return; }
    const im = new Image();
    im.onload = () => { loaded.current.add(t); show(); };
    im.onerror = () => { /* broken picture: stay on the current slide */ };
    im.src = imgUrl(list.current[t].image);
  }, [n]);

  useEffect(() => {
    if (prev === null) return;
    const t = setTimeout(() => setPrev(null), 800);
    return () => clearTimeout(t);
  }, [prev]);

  useEffect(() => {
    const on = () => setPageOn(!document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(es => setInView(es.some(e => e.isIntersecting)), {threshold: 0.3});
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const saveData = Boolean((navigator as any).connection?.saveData);
  const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const playing = n > 1 && inView && pageOn && !saveData && !calm;

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => go(idxRef.current + 1), SLIDE_MS);
    return () => clearInterval(t);
  }, [playing, go, idx]);

  const cur = slides[idx];
  const layer = (i: number, cls: string) => (
    <div key={i} className={`hero-slide ${cls}`}>
      <img className="hero-bg" src={imgUrl(slides[i].image)} alt="" decoding="async" draggable={false}
        {...(i === 0 ? {fetchPriority: 'high' as const} : {})} />
    </div>
  );

  return (
    <header className="hero" ref={box}
      onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        const x0 = touchX.current; touchX.current = null;
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 50) go(idxRef.current + (dx < 0 ? 1 : -1));
      }}>
      {prev !== null && layer(prev, 'out')}
      {layer(idx, prev === null && idx === 0 ? 'init' : 'in')}
      <div className="hero-body" key={idx}>
        <div className="muted" style={{fontWeight: 600, marginBottom: 8}}>{serverName}</div>
        <h1 className="title-xl">{cur.title}</h1>
        <div style={{display: 'flex', gap: 12, marginTop: 22}}>
          <button className="btn primary press" onClick={() => onOpen(cur)}><IconPlay /> Play</button>
          <button className="btn glass press" onClick={() => onOpen(cur)}>More info</button>
        </div>
      </div>
      {n > 1 && (
        <div className="hero-dots" aria-hidden="true">
          {slides.map((_, i) => <i key={i} className={i === idx ? 'on' : ''} />)}
        </div>
      )}
    </header>
  );
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
  const slides = Array.isArray(first) ? first.filter(p => p.image).slice(0, 6) : [];

  return (
    <div className="page">
      <div className="m-bar"><img src="/logo.png" alt="" width={30} height={30} /><span>Cinebox</span></div>
      {slides.length ? (
        <HeroSlider key={active?.key} slides={slides} serverName={active?.name} onOpen={open} />
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
