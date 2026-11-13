import {useEffect, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useServers} from '../store/servers';
import {providerApi} from '../provider/manager';
import type {Post} from '../provider/types';
import {Message, PosterCard} from '../components/Parts';

export default function Search() {
  const {active} = useServers();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const term = q.trim();
    if (!active || term.length < 2) { setPosts(null); setError(''); return; }
    let dead = false;
    const t = setTimeout(() => {
      setBusy(true); setError('');
      providerApi.search(active, term)
        .then(r => !dead && setPosts(r))
        .catch(e => !dead && (setPosts([]), setError(e instanceof Error ? e.message : 'Search failed')))
        .finally(() => !dead && setBusy(false));
    }, 450);
    return () => { dead = true; clearTimeout(t); };
  }, [q, active]);

  return (
    <div className="page">
      <div className="topbar">
        <input className="search" autoFocus placeholder={`Search ${active?.name ?? ''}`} value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {busy && <Message title="Searching…" />}
      {!busy && error && <Message title="Search failed" text={error} />}
      {!busy && !error && posts?.length === 0 && <Message title="No results" text={`Nothing found for “${q.trim()}”.`} />}
      {!busy && !posts && <Message title="Search" text="Type a movie or show name." />}
      {!busy && posts && posts.length > 0 && (
        <div className="grid">
          {posts.map((p, i) => <PosterCard key={p.link + i} post={p} onOpen={x => nav(`/info?p=${encodeURIComponent(active!.key)}&link=${encodeURIComponent(x.link)}`)} />)}
        </div>
      )}
    </div>
  );
}
