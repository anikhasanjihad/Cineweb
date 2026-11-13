import {useEffect, useRef, useState, type ReactNode} from 'react';
import {NavLink} from 'react-router-dom';
import type {Post, Provider} from '../provider/types';
import {IconHome, IconLibrary, IconLive, IconSearch, IconSettings} from './Icons';
import {useSettings} from '../lib/settings';
import {imgUrl} from '../lib/http';

export const Sidebar = () => {
  const st = useSettings();
  const items: Array<[string, string, ReactNode]> = [
    ['/', 'Home', <IconHome />],
    ['/search', 'Search', <IconSearch />],
    ['/live', 'Live TV', <IconLive />],
    ['/library', 'Library', <IconLibrary />],
  ];
  const cls = ({isActive}: {isActive: boolean}) => `navlink press${isActive ? ' active' : ''}${st.sidebarLabels ? '' : ' nolabel'}`;
  return (
    <nav className="sidebar">
      <img className="brand" src="/logo.png" alt="Cinebox" />
      {items.map(([to, label, icon]) => (
        <NavLink key={to} to={to} end={to === '/'} className={cls} title={label}>
          {icon}
          {label}
        </NavLink>
      ))}
      <div className="spacer" />
      <NavLink to="/settings" className={cls} title="Settings">
        <IconSettings />
        Settings
      </NavLink>
    </nav>
  );
};

export const PosterCard = ({post, onOpen}: {post: Post; onOpen: (p: Post) => void}) => (
  <button className="poster" onClick={() => onOpen(post)} title={post.title}>
    <div className="img">{post.image ? <img src={imgUrl(post.image)} alt="" loading="lazy" decoding="async" draggable={false} /> : null}</div>
    <div className="cap">{post.title}</div>
  </button>
);

export const PosterRow = ({title, posts, onOpen}: {title: string; posts: Post[] | null; onOpen: (p: Post) => void}) => (
  <section className="row">
    <div className="row-head"><h2 className="title-l">{title}</h2></div>
    <HScroll>
      {posts
        ? posts.map((p, i) => <PosterCard key={`${p.link}${i}`} post={p} onOpen={onOpen} />)
        : Array.from({length: 9}, (_, i) => (
            <div className="poster" key={i}><div className="img skel" /><div className="cap skel" style={{height: 14, borderRadius: 6, marginTop: 10}} /></div>
          ))}
    </HScroll>
  </section>
);

/** Horizontal scroller: the mouse wheel scrolls sideways, like a trackpad swipe. */
export const HScroll = ({children}: {children: ReactNode}) => {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      className="scroller"
      ref={ref}
      onWheel={e => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && ref.current) ref.current.scrollLeft += e.deltaY;
      }}>
      {children}
    </div>
  );
};

export const ServerRow = ({providers, active, onSelect}: {providers: Provider[]; active: Provider | null; onSelect: (p: Provider) => void}) => (
  <section className="row servers">
    <div className="row-head"><h2 className="title-l">Servers</h2></div>
    <HScroll>
      {providers.map(p => (
        <button key={p.key} className={`server press${active?.key === p.key ? ' on' : ''}`} onClick={() => onSelect(p)} title={p.name}>
          <div className="logo">
            {p.logo ? <img src={imgUrl(p.logo)} alt="" loading="lazy" decoding="async" draggable={false} /> : p.name.trim().charAt(0).toUpperCase()}
          </div>
          <div className="name">{p.name}</div>
        </button>
      ))}
    </HScroll>
  </section>
);

export const Message = ({title, text, action}: {title: string; text?: string; action?: ReactNode}) => (
  <div className="center">
    <h2 className="title-l">{title}</h2>
    {text && <p className="muted" style={{maxWidth: 460, margin: 0}}>{text}</p>}
    {action}
  </div>
);

/** true once the element comes within `margin` of the screen (then stays true) - used to load rows only when needed. */
export const useNearScreen = (margin = '400px') => {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setNear(true); io.disconnect(); } }, {rootMargin: `${margin} 0px`});
    io.observe(el);
    return () => io.disconnect();
  }, [near, margin]);
  return [ref, near] as const;
};
