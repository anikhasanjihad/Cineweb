import {useCallback, useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {Navigate, useLocation, useNavigate} from 'react-router-dom';
import Hls from 'hls.js';
import {useServers} from '../store/servers';
import {providerApi} from '../provider/manager';
import type {Stream} from '../provider/types';
import {appFetch, proxyUrl} from '../lib/http';
import {load, save} from '../lib/storage';
import {getSettings, updateSettings, useSettings} from '../lib/settings';
import {makeNativeLoader} from '../player/hlsLoader';
import {cueAt, parseSubtitles, type Cue} from '../player/subtitles';
import {IconBack, IconBack10, IconFull, IconFwd10, IconPause, IconPlay} from '../components/Icons';

interface QueueItem { title: string; link: string; type: string }
interface State {
  providerKey?: string; link?: string; type?: string; title: string; back: string; image?: string; infoLink?: string;
  queue?: QueueItem[]; index?: number;
  direct?: {url: string; headers?: Record<string, string>; live?: boolean};
  local?: {url: string};
}
type MenuId = 'audio' | 'subtitle' | 'speed' | 'quality' | 'server' | 'resize' | 'sleep' | 'volume' | null;

// Same rule as the phone app: the first 5 seconds of every video (not Live TV) play without sound.
// It follows the playback position, so seeking back to the start mutes again, and the viewer cannot override it.
const INTRO_MUTE_SECONDS = 5;

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) return '0:00';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return `${h ? h + ':' + String(m).padStart(2, '0') : m}:${String(x).padStart(2, '0')}`;
};

const Svg = ({children}: {children: ReactNode}) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{children}</svg>);
const ICON: Record<string, ReactNode> = {
  audio: <Svg><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M16 9a4 4 0 0 1 0 6" /></Svg>,
  subtitle: <Svg><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M7 12h3M13 12h4M7 15h5M15 15h2" /></Svg>,
  speed: <Svg><path d="M12 14l4-4" /><path d="M3.5 17a9 9 0 1 1 17 0" /></Svg>,
  quality: <Svg><path d="M4 7h16M4 12h16M4 17h16" /><circle cx="9" cy="7" r="1.6" fill="currentColor" /><circle cx="15" cy="12" r="1.6" fill="currentColor" /><circle cx="8" cy="17" r="1.6" fill="currentColor" /></Svg>,
  server: <Svg><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></Svg>,
  resize: <Svg><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /><rect x="8" y="8" width="8" height="8" rx="1" /></Svg>,
  sleep: <Svg><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></Svg>,
  lock: <Svg><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>,
  unlock: <Svg><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></Svg>,
  pip: <Svg><rect x="3" y="5" width="18" height="14" rx="3" /><rect x="12" y="12" width="7" height="5" rx="1.4" fill="currentColor" /></Svg>,
  episodes: <Svg><path d="M4 6h16M4 12h16M4 18h10" /></Svg>,
  next: <Svg><path d="M6 5l9 7-9 7z" fill="currentColor" /><path d="M18 5v14" /></Svg>,
  download: <Svg><path d="M12 4v11m0 0 4-4m-4 4-4-4M5 20h14" /></Svg>,
  volume: <Svg><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" /></Svg>,
  mute: <Svg><path d="M11 5 6 9H3v6h3l5 4z" /><path d="m16 9 5 6M21 9l-5 6" /></Svg>,
};
export const PLAYER_CONTROLS: Array<[string, string]> = [
  ['sleep', 'Sleep timer'], ['lock', 'Lock controls'], ['audio', 'Audio track'], ['subtitle', 'Subtitles'], ['speed', 'Playback speed'],
  ['quality', 'Quality'], ['pip', 'Picture in picture'], ['server', 'Server'], ['resize', 'Resize'], ['episodes', 'Episodes'], ['next', 'Next episode'],
];

const Menu = ({title, children}: {title: string; children: ReactNode}) => (
  <div className="menu" onClick={e => e.stopPropagation()}>
    <div className="menu-title">{title}</div>
    <div className="menu-list">{children}</div>
  </div>
);
const Opt = ({on, onClick, children}: {on?: boolean; onClick: () => void; children: ReactNode}) => (
  <button className={`opt${on ? ' on' : ''}`} onClick={onClick}><span>{children}</span>{on && <b>✓</b>}</button>
);

export default function Player() {
  const st = useLocation().state as State | null;
  const nav = useNavigate();
  const {byKey} = useServers();
  const settings = useSettings();
  const provider = st?.providerKey ? byKey(st.providerKey) : undefined;
  const wrap = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const hls = useRef<Hls | null>(null);
  const audioCtx = useRef<{ctx: AudioContext; gain: GainNode} | null>(null);
  const idleTimer = useRef<number>();
  const sleepTimer = useRef<number>();
  const fileInput = useRef<HTMLInputElement>(null);

  const live = Boolean(st?.direct?.live);
  const progressId = st ? (st.link ? `${st.providerKey}|${st.link}` : st.direct?.url ?? st.local?.url ?? '') : '';

  const [streams, setStreams] = useState<Stream[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [buf, setBuf] = useState(0);
  const [vol, setVol] = useState(1);
  const [muted, setMuted] = useState(false);
  const [introMuted, setIntroMuted] = useState(true);
  const [idle, setIdle] = useState(false);
  const [menu, setMenu] = useState<MenuId>(null);
  const [locked, setLocked] = useState(false);
  const [panel, setPanel] = useState(false);
  const [full, setFull] = useState(false);
  const [toast, setToast] = useState('');
  const [hover, setHover] = useState<{x: number; t: number} | null>(null);
  const [speed, setSpeed] = useState(settings.playbackSpeed);
  const [levels, setLevels] = useState<number[]>([]);
  const [level, setLevel] = useState(-1);
  const [audioTracks, setAudioTracks] = useState<string[]>([]);
  const [audioIdx, setAudioIdx] = useState(0);
  const [subIdx, setSubIdx] = useState(-1);
  const [cues, setCues] = useState<Cue[]>([]);
  const [subDelay, setSubDelay] = useState(0);
  const [sleepLeft, setSleepLeft] = useState<number | 'end' | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [boostOk, setBoostOk] = useState(false);

  const q = st?.queue; const qi = st?.index ?? 0;
  const next = q && qi + 1 < q.length ? q[qi + 1] : undefined;
  const hidden = new Set(settings.hiddenControls);
  const show = (id: string) => !hidden.has(id);
  const say = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(t => (t === m ? '' : t)), 2200); }, []);

  const exitFull = useCallback(async () => {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    setFull(false);
  }, []);
  const toggleFull = useCallback(async () => {
    const want = !full;
    if (want) await wrap.current?.requestFullscreen().catch(() => {}); else await document.exitFullscreen().catch(() => {});
    setFull(want);
  }, [full]);

  const goBack = useCallback(() => { void exitFull(); nav(st?.back ?? '/', {replace: true}); }, [nav, st, exitFull]);
  const goTo = useCallback((i: number) => {
    if (!q?.[i] || !st) return;
    nav('/watch', {replace: true, state: {...st, link: q[i].link, type: q[i].type, title: q[i].title, index: i}});
    setPanel(false); setCountdown(null);
  }, [q, st, nav]);

  // ---- streams ----
  useEffect(() => {
    if (!st) return;
    let dead = false;
    setStreams(null); setError(''); setBusy(true); setIdx(0); setSubIdx(-1); setCues([]); setIntroMuted(true);
    if (st.direct) {
      setStreams([{server: live ? 'Live' : 'Video', link: st.direct.url, type: /\.mpd/i.test(st.direct.url) ? 'mpd' : /\.(mp4|mkv|webm)(\?|$)/i.test(st.direct.url) ? 'mp4' : 'm3u8', headers: st.direct.headers}]);
    } else if (st.local) {
      setStreams([{server: 'Downloaded', link: st.local.url, type: 'mp4'}]);
    } else if (provider && st.link) {
      providerApi.streams(provider, st.link, st.type ?? 'movie').then(list => {
        if (dead) return;
        const ok = list.filter(s => s?.link);
        if (!ok.length) throw new Error('No playable source was found for this title');
        setStreams(ok);
      }).catch(e => { if (!dead) { setError(e instanceof Error ? e.message : 'Could not get a stream'); setBusy(false); } });
    }
    return () => { dead = true; };
  }, [st?.link, st?.direct?.url, st?.local?.url, provider]); // eslint-disable-line react-hooks/exhaustive-deps

  const stream = streams?.[idx];

  // ---- attach source ----
  useEffect(() => {
    const el = video.current;
    if (!el || !stream) return;
    setBusy(true); setError(''); setLevels([]); setLevel(-1); setAudioTracks([]); setAudioIdx(0);
    hls.current?.destroy(); hls.current = null;
    const saved = settings.rememberPosition && !live ? load<Record<string, {t: number; d: number}>>('progress', {})[progressId] : undefined;
    const resume = () => { if (saved && saved.d - saved.t > 20 && saved.t > 5) el.currentTime = saved.t; el.playbackRate = speed; };
    const isHls = /m3u8/i.test(stream.type) || /\.m3u8(\?|$)/i.test(stream.link);
    if (isHls && Hls.isSupported()) {
      const h = new Hls({loader: makeNativeLoader(stream.headers as Record<string, string> | undefined) as never, lowLatencyMode: live, maxBufferLength: 40});
      hls.current = h;
      h.loadSource(stream.link);
      h.attachMedia(el);
      h.on(Hls.Events.MANIFEST_PARSED, (_e, d) => {
        setLevels(d.levels.map(l => l.height || 0)); resume(); el.play().catch(() => {});
      });
      h.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => setAudioTracks(h.audioTracks.map((t, i) => t.name || t.lang || `Track ${i + 1}`)));
      h.on(Hls.Events.ERROR, (_e, d) => {
        if (!d.fatal) return;
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR && live) { h.startLoad(); return; }
        setError('This source could not be played. Try another server from the menu.'); setBusy(false);
      });
      setBoostOk(true);
    } else {
      // Plain files go through the proxy too, so Referer/User-Agent and Range (seeking) work like in the app.
      el.src = st?.local ? stream.link : proxyUrl(stream.link, stream.headers as Record<string, string> | undefined, true);
      el.addEventListener('loadedmetadata', resume, {once: true});
      el.play().catch(() => {});
      setBoostOk(false);
    }
    return () => { hls.current?.destroy(); hls.current = null; };
  }, [stream]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- subtitles ----
  const loadSubs = useCallback(async (i: number) => {
    setSubIdx(i); setMenu(null);
    if (i < 0) { setCues([]); return; }
    const s = stream?.subtitles?.[i];
    if (!s) return;
    try {
      const r = await appFetch(s.uri);
      const c = parseSubtitles(await r.text());
      if (!c.length) throw new Error('empty');
      setCues(c);
    } catch { say('Could not load that subtitle'); setCues([]); }
  }, [stream, say]);
  const subFromFile = async (f: File) => {
    const c = parseSubtitles(await f.text());
    if (!c.length) { say('Could not read that subtitle file'); return; }
    setCues(c); setSubIdx(-2); setMenu(null);
  };
  const cue = cues.length ? cueAt(cues, time - subDelay) : null;

  // ---- controls ----
  const toggle = useCallback(() => { const v = video.current; if (v) v.paused ? v.play().catch(() => {}) : v.pause(); }, []);
  const seekBy = useCallback((d: number) => { const v = video.current; if (v && !live) v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + d)); }, [live]);
  const wake = useCallback(() => { setIdle(false); clearTimeout(idleTimer.current); idleTimer.current = window.setTimeout(() => setIdle(true), 3000); }, []);

  const applyVolume = useCallback((v: number) => {
    const el = video.current; if (!el) return;
    const n = Math.max(0, Math.min(boostOk && getSettings().volumeBoost ? 2 : 1, v));
    setVol(n);
    if (n > 1) {
      if (!audioCtx.current) {
        try {
          const ctx = new AudioContext(); const src = ctx.createMediaElementSource(el); const gain = ctx.createGain();
          src.connect(gain).connect(ctx.destination); audioCtx.current = {ctx, gain};
        } catch { setVol(1); return; }
      }
      el.volume = 1; audioCtx.current.gain.gain.value = n; void audioCtx.current.ctx.resume();
    } else {
      el.volume = n; if (audioCtx.current) audioCtx.current.gain.gain.value = 1;
    }
  }, [boostOk]);

  // The element is silent while the intro rule is active (or the viewer muted it); live streams ignore the intro rule.
  useEffect(() => { const el = video.current; if (el) el.muted = (introMuted && !live) || muted; }, [introMuted, live, muted, streams, idx, locked]);

  const setRate = (r: number) => { setSpeed(r); if (video.current) video.current.playbackRate = r; setMenu(null); };
  const setSleep = (m: number | 'end' | null) => {
    clearTimeout(sleepTimer.current); setMenu(null);
    if (m == null) { setSleepLeft(null); say('Sleep timer off'); return; }
    if (m === 'end') { setSleepLeft('end'); say('Will stop after this episode'); return; }
    setSleepLeft(m); say(`Sleep timer: ${m} min`);
    sleepTimer.current = window.setTimeout(() => { video.current?.pause(); setSleepLeft(null); say('Sleep timer ended'); }, m * 60000);
  };
  const pip = async () => { try { document.pictureInPictureElement ? await document.exitPictureInPicture() : await video.current?.requestPictureInPicture(); } catch { say('Picture in picture is not available'); } };

  useEffect(() => {
    wake();
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      wake();
      if (locked) return;
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'k') { e.preventDefault(); toggle(); }
      else if (k === 'arrowright') seekBy(getSettings().seekInterval);
      else if (k === 'arrowleft') seekBy(-getSettings().seekInterval);
      else if (k === 'arrowup') { e.preventDefault(); applyVolume(vol + 0.05); }
      else if (k === 'arrowdown') { e.preventDefault(); applyVolume(vol - 0.05); }
      else if (k === 'f') void toggleFull();
      else if (k === 'm') setMuted(m => !m);
      else if (k === 'n' && next) goTo(qi + 1);
      else if (k === 'escape') { if (menu || panel) { setMenu(null); setPanel(false); } else if (full) void exitFull(); else goBack(); }
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); clearTimeout(idleTimer.current); };
  }, [wake, toggle, seekBy, applyVolume, toggleFull, exitFull, goBack, goTo, vol, locked, menu, panel, full, next, qi]);

  // ---- progress + continue watching ----
  useEffect(() => {
    if (live || !st?.link) return;
    const t = setInterval(() => {
      const v = video.current;
      if (!v?.duration || v.paused) return;
      const all = load<Record<string, {t: number; d: number}>>('progress', {});
      all[progressId] = {t: v.currentTime, d: v.duration};
      save('progress', all);
      if (st.infoLink && st.providerKey) {
        let list = load<Array<{key: string; providerKey: string; link: string; title: string; image: string}>>('continue', []);
        list = list.filter(x => x.key !== progressId);
        if (v.currentTime / v.duration < 0.95) list.unshift({key: progressId, providerKey: st.providerKey, link: st.infoLink, title: st.title, image: st.image ?? ''});
        save('continue', list.slice(0, 20));
      }
    }, 5000);
    return () => clearInterval(t);
  }, [progressId, live, st]);

  // ---- ambient glow ----
  const [glow, setGlow] = useState('');
  useEffect(() => {
    if (!settings.ambient) { setGlow(''); return; }
    const c = document.createElement('canvas'); c.width = 8; c.height = 5;
    const g = c.getContext('2d', {willReadFrequently: true});
    const t = setInterval(() => {
      const v = video.current; if (!v || !g || v.paused || v.readyState < 2) return;
      try {
        g.drawImage(v, 0, 0, 8, 5);
        const d = g.getImageData(0, 0, 8, 5).data; let r = 0, gg = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
        const n = d.length / 4; setGlow(`${Math.round(r / n)}, ${Math.round(gg / n)}, ${Math.round(b / n)}`);
      } catch { clearInterval(t); } // cross-origin video: not readable
    }, 600);
    return () => clearInterval(t);
  }, [settings.ambient, stream]);

  // ---- next episode countdown ----
  useEffect(() => {
    if (countdown == null) return;
    if (countdown <= 0) { goTo(qi + 1); return; }
    const t = setTimeout(() => setCountdown(c => (c == null ? c : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, goTo, qi]);
  useEffect(() => () => { clearTimeout(sleepTimer.current); void audioCtx.current?.ctx.close().catch(() => {}); }, []);

  if (!st) return <Navigate to="/" replace />;

  const subs = stream?.subtitles ?? [];
  const objectFit = settings.resize === 'zoom' ? 'cover' : settings.resize;
  const bar = (id: string, label: string, on: boolean, click: () => void, icon = id) =>
    show(id) ? <button key={id} className={`pbtn press${on ? ' on' : ''}`} onClick={e => { e.stopPropagation(); click(); }} title={label} aria-label={label}>{ICON[icon]}</button> : null;
  const open = (m: MenuId) => setMenu(menu === m ? null : m);

  if (locked) {
    return (
      <div ref={wrap} className="player" onMouseMove={wake} style={{cursor: idle ? 'none' : undefined}}>
        <video ref={video} style={{objectFit, background: 'transparent'}} />
        <button className={`pbtn lock-fab press${idle ? ' hide' : ''}`} onClick={() => { setLocked(false); wake(); }} aria-label="Unlock">{ICON.unlock}</button>
      </div>
    );
  }

  return (
    <div ref={wrap} className={`player${idle && playing && !menu && !panel ? ' idle' : ''}`} onMouseMove={wake}
      style={glow ? {background: `radial-gradient(ellipse at center, rgba(${glow},.55), #000 72%)`} : undefined}
      onClick={() => { setMenu(null); }}
      onWheel={e => { applyVolume(vol + (e.deltaY < 0 ? 0.05 : -0.05)); wake(); }}
      onDoubleClick={e => {
        const r = e.currentTarget.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width;
        if (x < 0.33) seekBy(-settings.seekInterval); else if (x > 0.67) seekBy(settings.seekInterval); else void toggleFull();
      }}>
      <video
        ref={video}
        style={{objectFit, transform: settings.resize === 'zoom' ? 'scale(1.18)' : undefined, background: 'transparent'}}
        onClick={e => { e.stopPropagation(); setMenu(null); toggle(); }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onWaiting={() => setBusy(true)}
        onPlaying={() => setBusy(false)}
        onCanPlay={() => setBusy(false)}
        onTimeUpdate={e => { setTime(e.currentTarget.currentTime); setIntroMuted(e.currentTarget.currentTime < INTRO_MUTE_SECONDS); const b = e.currentTarget.buffered; if (b.length) setBuf(b.end(b.length - 1)); }}
        onSeeking={e => { if (e.currentTarget.currentTime < INTRO_MUTE_SECONDS) setIntroMuted(true); }}
        onDurationChange={e => setDur(e.currentTarget.duration)}
        onEnded={() => {
          if (sleepLeft === 'end') { setSleepLeft(null); say('Sleep timer ended'); return; }
          if (getSettings().autoPlayNext && next) setCountdown(5);
        }}
        onError={() => { if (stream && !/m3u8/i.test(stream.link) && !/m3u8/i.test(stream.type)) { setError('This source could not be played. Try another server from the menu.'); setBusy(false); } }}
      />

      {cue && <div className="subline" style={{bottom: 'var(--sub-bottom, 6%)'}}><span>{cue.text}</span></div>}
      {busy && !error && <div className="center-msg"><div className="spin" /></div>}
      {error && (
        <div className="center-msg" style={{pointerEvents: 'auto'}}>
          <div><h2 className="title-l">Can’t play this</h2><p className="muted" style={{maxWidth: 420}}>{error}</p>
            <div style={{display: 'flex', gap: 10, justifyContent: 'center'}}>
              {streams && idx + 1 < streams.length && <button className="btn accent press" onClick={() => setIdx(idx + 1)}>Try next server</button>}
              <button className="btn glass press" onClick={goBack}>Go back</button></div></div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
      {countdown != null && next && (
        <div className="upnext" onClick={e => e.stopPropagation()}>
          <div className="muted" style={{fontSize: 12}}>Next episode in {countdown}</div>
          <div style={{fontWeight: 650, margin: '2px 0 10px'}}>{next.title}</div>
          <div style={{display: 'flex', gap: 8}}>
            <button className="btn primary press" style={{height: 36}} onClick={() => goTo(qi + 1)}>Play now</button>
            <button className="btn glass press" style={{height: 36}} onClick={() => setCountdown(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="pl-top" onClick={e => e.stopPropagation()}>
        <button className="round press" onClick={goBack} aria-label="Back"><IconBack /></button>
        <div style={{flex: 1, minWidth: 0}}>
          <div style={{fontWeight: 650, fontSize: 17, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{st.title}</div>
          {live && <div className="live-badge"><i /> LIVE</div>}
        </div>
        {bar('sleep', sleepLeft ? `Sleep timer (${sleepLeft === 'end' ? 'end of episode' : sleepLeft + ' min'})` : 'Sleep timer', sleepLeft != null, () => open('sleep'))}
        {bar('lock', 'Lock controls', false, () => { setLocked(true); setMenu(null); wake(); })}
        {show('episodes') && q && q.length > 1 && bar('episodes', 'Episodes', panel, () => setPanel(p => !p))}
      </div>

      {menu === 'sleep' && <Menu title="Sleep timer">
        {[[null, 'Off'], [15, '15 minutes'], [30, '30 minutes'], [45, '45 minutes'], [60, '1 hour'], ['end', 'End of episode']].map(([v, l]) =>
          <Opt key={String(v)} on={sleepLeft === v} onClick={() => setSleep(v as number | 'end' | null)}>{l as string}</Opt>)}
      </Menu>}
      {menu === 'audio' && <Menu title="Audio track">
        {audioTracks.length ? audioTracks.map((t, i) => <Opt key={i} on={audioIdx === i} onClick={() => { if (hls.current) hls.current.audioTrack = i; setAudioIdx(i); setMenu(null); }}>{t}</Opt>)
          : <div className="menu-empty">This video has one audio track.</div>}
      </Menu>}
      {menu === 'subtitle' && <Menu title="Subtitles">
        <Opt on={subIdx === -1} onClick={() => void loadSubs(-1)}>Off</Opt>
        {subs.map((s, i) => <Opt key={i} on={subIdx === i} onClick={() => void loadSubs(i)}>{s.title}</Opt>)}
        <Opt on={subIdx === -2} onClick={() => fileInput.current?.click()}>Load from file…</Opt>
        <div className="delay"><span>Delay</span>
          <button className="round press" onClick={() => setSubDelay(d => Math.round((d - 0.1) * 10) / 10)}>−</button>
          <b>{subDelay > 0 ? '+' : ''}{subDelay.toFixed(1)}s</b>
          <button className="round press" onClick={() => setSubDelay(d => Math.round((d + 0.1) * 10) / 10)}>+</button></div>
      </Menu>}
      {menu === 'speed' && <Menu title="Playback speed">
        {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(r => <Opt key={r} on={speed === r} onClick={() => setRate(r)}>{r === 1 ? 'Normal' : `${r}×`}</Opt>)}
      </Menu>}
      {menu === 'quality' && <Menu title="Quality">
        <Opt on={level === -1} onClick={() => { if (hls.current) hls.current.currentLevel = -1; setLevel(-1); setMenu(null); }}>Auto</Opt>
        {levels.map((h, i) => <Opt key={i} on={level === i} onClick={() => { if (hls.current) hls.current.currentLevel = i; setLevel(i); setMenu(null); }}>{h ? `${h}p` : `Level ${i + 1}`}</Opt>).reverse()}
        {!levels.length && <div className="menu-empty">This source has a single quality.</div>}
      </Menu>}
      {menu === 'server' && <Menu title="Server">
        {streams?.map((s, i) => <Opt key={i} on={idx === i} onClick={() => { setIdx(i); setMenu(null); }}>{s.server}{s.quality ? ` · ${s.quality}p` : ''}</Opt>)}
      </Menu>}
      {menu === 'resize' && <Menu title="Resize">
        {([['contain', 'Fit'], ['cover', 'Fill'], ['fill', 'Stretch'], ['zoom', 'Zoom']] as const).map(([v, l]) => <Opt key={v} on={settings.resize === v} onClick={() => { updateSettings({resize: v}); setMenu(null); }}>{l}</Opt>)}
      </Menu>}
      {menu === 'volume' && <Menu title="Volume">
        <div className="delay" style={{padding: '8px 14px'}}>
          <input className="vol" style={{width: 180}} type="range" min={0} max={boostOk && settings.volumeBoost ? 2 : 1} step={0.02} value={vol} onChange={e => applyVolume(Number(e.target.value))} />
          <b>{Math.round(vol * 100)}%</b>
        </div>
        {!boostOk && <div className="menu-empty">Volume boost works with streamed sources.</div>}
      </Menu>}
      <input ref={fileInput} type="file" accept=".srt,.vtt,text/vtt" hidden onChange={e => e.target.files?.[0] && void subFromFile(e.target.files[0])} />

      {panel && q && (
        <aside className="ep-panel" onClick={e => e.stopPropagation()}>
          <div className="menu-title">Episodes</div>
          <div className="menu-list" style={{maxHeight: 'none'}}>
            {q.map((e, i) => <Opt key={e.link + i} on={i === qi} onClick={() => goTo(i)}>{i + 1}. {e.title}</Opt>)}
          </div>
        </aside>
      )}

      <div className="pl-bot" onClick={e => e.stopPropagation()}>
        {!live && (
          <div className="ctrl">
            <span className="time">{fmt(time)}</span>
            <div className="bar"
              onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); setHover({x: p * 100, t: p * dur}); }}
              onMouseLeave={() => setHover(null)}
              onClick={e => { const r = e.currentTarget.getBoundingClientRect(); if (video.current && dur) video.current.currentTime = ((e.clientX - r.left) / r.width) * dur; }}>
              <div className="buf" style={{width: `${dur ? (buf / dur) * 100 : 0}%`}} />
              <div className="fill" style={{width: `${dur ? (time / dur) * 100 : 0}%`}} />
              {hover && <div className="tip" style={{left: `${hover.x}%`}}>{fmt(hover.t)}</div>}
            </div>
            <span className="time" style={{textAlign: 'right'}}>{fmt(dur)}</span>
          </div>
        )}
        <div className="ctrl">
          {!live && <button className="round press" onClick={() => seekBy(-settings.seekInterval)} aria-label="Back"><IconBack10 /></button>}
          <button className="round big press" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <IconPause /> : <IconPlay />}</button>
          {!live && <button className="round press" onClick={() => seekBy(settings.seekInterval)} aria-label="Forward"><IconFwd10 /></button>}
          {next && show('next') && <button className="pbtn press" onClick={() => goTo(qi + 1)} title="Next episode" aria-label="Next episode">{ICON.next}</button>}
          <button className="pbtn press" onClick={() => open('volume')} title="Volume" aria-label="Volume" onContextMenu={e => { e.preventDefault(); setMuted(m => !m); }}>{muted || vol === 0 || (introMuted && !live) ? ICON.mute : ICON.volume}</button>
          <div style={{flex: 1}} />
          {show('audio') && bar('audio', 'Audio track', menu === 'audio', () => open('audio'))}
          {show('subtitle') && bar('subtitle', 'Subtitles', cues.length > 0, () => open('subtitle'))}
          {!live && show('speed') && bar('speed', 'Playback speed', speed !== 1, () => open('speed'))}
          {show('quality') && levels.length > 1 && bar('quality', 'Quality', level !== -1, () => open('quality'))}
          {show('server') && streams && streams.length > 1 && bar('server', 'Server', menu === 'server', () => open('server'))}
          {show('resize') && bar('resize', 'Resize', settings.resize !== 'contain', () => open('resize'))}
          {show('pip') && 'pictureInPictureEnabled' in document && bar('pip', 'Picture in picture', false, () => void pip())}
          <button className="round press" onClick={() => void toggleFull()} aria-label="Full screen"><IconFull /></button>
        </div>
      </div>
    </div>
  );
}
