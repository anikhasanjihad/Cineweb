import {useEffect, useRef, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {supabase} from '../lib/supabase';
import {useAuth} from '../store/auth';
import {useServers} from '../store/servers';
import {DEFAULTS, resetSettings, updateSettings, useSettings} from '../lib/settings';
import {fetchLiveSources, LIVE_KEY} from './LiveTv';
import {Cell, Group, Page, Pick, Range, Toggle} from '../components/Controls';
import {PLAYER_CONTROLS} from './Player';
import {fetchManifest} from '../provider/manager';

const ACCENTS = ['#ff453a', '#ff9f0a', '#ffd60a', '#30d158', '#0a84ff', '#bf5af2', '#ff375f'];
const CHEVRON = <span className="muted" style={{fontSize: 20}}>›</span>;

interface Profile { display_name: string | null; role: string }
const useProfile = () => {
  const {session} = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const uid = session?.user.id;
  const reload = () => { if (uid) supabase.from('profiles').select('display_name, role').eq('id', uid).maybeSingle().then(({data}) => setProfile(data as Profile | null)); };
  useEffect(reload, [uid]); // eslint-disable-line react-hooks/exhaustive-deps
  return {profile, reload, uid};
};

export default function Settings() {
  const {section} = useParams();
  const nav = useNavigate();
  const {profile} = useProfile();
  if (section) {
    const back = () => nav('/settings');
    const P = {account: Account, appearance: Appearance, player: PlayerSettings, subtitles: Subtitles, preferences: Preferences, data: Data, about: About, admin: Admin}[section];
    return P ? <P back={back} /> : <Index />;
  }
  function Index() {
    const {session} = useAuth();
    const go = (s: string) => () => nav(`/settings/${s}`);
    return (
      <Page title="Settings">
        <Group title="Account">
          <Cell label={profile?.display_name || 'Profile'} hint={session?.user.email} onClick={go('account')}>{CHEVRON}</Cell>
          {profile?.role === 'admin' && <Cell label="Admin Panel" hint="Servers and Live TV links" onClick={go('admin')}>{CHEVRON}</Cell>}
        </Group>
        <Group title="Options">
          <Cell label="Appearance" onClick={go('appearance')}>{CHEVRON}</Cell>
          <Cell label="Player settings" onClick={go('player')}>{CHEVRON}</Cell>
          <Cell label="Subtitle style" onClick={go('subtitles')}>{CHEVRON}</Cell>
          <Cell label="Preferences" onClick={go('preferences')}>{CHEVRON}</Cell>
        </Group>
        <Group title="Data management"><Cell label="Cache, backup and reset" onClick={go('data')}>{CHEVRON}</Cell></Group>
        <Group title="About"><Cell label="About Cinebox" onClick={go('about')}>{CHEVRON}</Cell></Group>
      </Page>
    );
  }
  return <Index />;
}

const Account = ({back}: {back: () => void}) => {
  const {session} = useAuth();
  const {profile, reload, uid} = useProfile();
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => setName(profile?.display_name ?? ''), [profile]);
  const save = async () => {
    const {error} = await supabase.from('profiles').update({display_name: name.trim()}).eq('id', uid!);
    setMsg(error ? error.message : 'Saved'); reload();
  };
  return (
    <Page title="Account" back={back}>
      <Group>
        <Cell label="Email">{<span className="muted">{session?.user.email}</span>}</Cell>
        <Cell label="Display name"><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" /><button className="btn glass press" style={{height: 38, padding: '0 16px'}} onClick={save}>Save</button></Cell>
      </Group>
      {msg && <p className="muted">{msg}</p>}
      <Group><Cell label="Sign out" danger onClick={() => supabase.auth.signOut()} /></Group>
    </Page>
  );
};

const Appearance = ({back}: {back: () => void}) => {
  const s = useSettings();
  return (
    <Page title="Appearance" back={back}>
      <Group title="Accent colour">
        <Cell label="Colour">{ACCENTS.map(c => <button key={c} aria-label={c} className={`swatch${s.accent === c ? ' on' : ''}`} style={{background: c}} onClick={() => updateSettings({accent: c})} />)}</Cell>
      </Group>
      <Group title="Motion"><Cell label="Reduce motion" hint="Turns off most animations"><Toggle value={s.reduceMotion} onChange={v => updateSettings({reduceMotion: v})} /></Cell></Group>
    </Page>
  );
};

const PlayerSettings = ({back}: {back: () => void}) => {
  const s = useSettings();
  return (
    <Page title="Player settings" back={back}>
      <Group title="Playback">
        <Cell label="Auto play next episode"><Toggle value={s.autoPlayNext} onChange={v => updateSettings({autoPlayNext: v})} /></Cell>
        <Cell label="Resume where you left off"><Toggle value={s.rememberPosition} onChange={v => updateSettings({rememberPosition: v})} /></Cell>
        <Cell label="Playback speed"><Pick value={s.playbackSpeed} onChange={v => updateSettings({playbackSpeed: v})} options={[[0.5, '0.5×'], [0.75, '0.75×'], [1, '1×'], [1.25, '1.25×'], [1.5, '1.5×'], [2, '2×']]} /></Cell>
        <Cell label="Seek interval"><Pick value={s.seekInterval} onChange={v => updateSettings({seekInterval: v})} options={[[5, '5 seconds'], [10, '10 seconds'], [15, '15 seconds'], [30, '30 seconds']]} /></Cell>
      </Group>
      <Group title="Picture and sound">
        <Cell label="Default resize mode"><Pick value={s.resize} onChange={v => updateSettings({resize: v})} options={[['contain', 'Fit'], ['cover', 'Fill'], ['fill', 'Stretch'], ['zoom', 'Zoom']]} /></Cell>
        <Cell label="Volume boost" hint="Up to 200% on streamed sources"><Toggle value={s.volumeBoost} onChange={v => updateSettings({volumeBoost: v})} /></Cell>
        <Cell label="Ambient lighting" hint="A soft glow from the video colours"><Toggle value={s.ambient} onChange={v => updateSettings({ambient: v})} /></Cell>
      </Group>
      <Group title="Customize player" footer="Choose which buttons the player shows.">
        {PLAYER_CONTROLS.map(([id, label]) => (
          <Cell key={id} label={label}><Toggle value={!s.hiddenControls.includes(id)} onChange={on => updateSettings({hiddenControls: on ? s.hiddenControls.filter(x => x !== id) : [...s.hiddenControls, id]})} /></Cell>
        ))}
      </Group>
      <p className="muted" style={{fontSize: 13}}>Shortcuts: Space play/pause · ← → seek · ↑ ↓ volume · F full screen · M mute · N next episode · double-click the sides to skip</p>
    </Page>
  );
};

const Subtitles = ({back}: {back: () => void}) => {
  const s = useSettings();
  return (
    <Page title="Subtitle style" back={back}>
      <div className="sub-preview"><span>Subtitles will look like this</span></div>
      <Group>
        <Cell label="Font size"><Range value={s.subSize} min={60} max={200} step={10} fmt={v => `${v}%`} onChange={v => updateSettings({subSize: v})} /></Cell>
        <Cell label="Text colour"><Pick value={s.subColor} onChange={v => updateSettings({subColor: v})} options={[['#ffffff', 'White'], ['#ffd60a', 'Yellow'], ['#30d158', 'Green'], ['#64d2ff', 'Cyan']]} /></Cell>
        <Cell label="Background opacity"><Range value={s.subBg} min={0} max={1} step={0.1} fmt={v => `${Math.round(v * 100)}%`} onChange={v => updateSettings({subBg: v})} /></Cell>
        <Cell label="Edge effect"><Pick value={s.subEdge} onChange={v => updateSettings({subEdge: v})} options={[['none', 'None'], ['shadow', 'Shadow'], ['outline', 'Outline']]} /></Cell>
        <Cell label="Placement from bottom"><Range value={s.subBottom} min={0} max={30} step={2} fmt={v => `${v}%`} onChange={v => updateSettings({subBottom: v})} /></Cell>
        <Cell label="Reset to defaults" onClick={() => updateSettings({subSize: DEFAULTS.subSize, subColor: DEFAULTS.subColor, subBg: DEFAULTS.subBg, subEdge: DEFAULTS.subEdge, subBottom: DEFAULTS.subBottom})} />
      </Group>
    </Page>
  );
};

const Preferences = ({back}: {back: () => void}) => {
  const s = useSettings();
  return (
    <Page title="Preferences" back={back}>
      <Group title="Experience">
        <Cell label="Continue watching" hint="Show your unfinished titles on Home"><Toggle value={s.showContinue} onChange={v => updateSettings({showContinue: v})} /></Cell>
        <Cell label="Sidebar labels"><Toggle value={s.sidebarLabels} onChange={v => updateSettings({sidebarLabels: v})} /></Cell>
      </Group>
    </Page>
  );
};

const BACKUP_KEYS = ['library', 'progress', 'settings', 'active-provider'];
const Data = ({back}: {back: () => void}) => {
  const [msg, setMsg] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const clearCache = () => {
    Object.keys(localStorage).filter(k => k.startsWith('kv:') || k === 'providers-cache' || k.startsWith('live-tv')).forEach(k => localStorage.removeItem(k));
    setMsg('Cache cleared. Servers reload next time you open Home.');
  };
  const exportBackup = () => {
    const data: Record<string, unknown> = {};
    BACKUP_KEYS.forEach(k => { const v = localStorage.getItem(k); if (v != null) data[k] = JSON.parse(v); });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({app: 'cinebox-desktop', version: 1, data}, null, 2)], {type: 'application/json'}));
    a.download = `cinebox-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
    setMsg('Backup file downloaded.');
  };
  const importBackup = async (f: File) => {
    try {
      const j = JSON.parse(await f.text());
      if (j?.app !== 'cinebox-desktop' || typeof j.data !== 'object') throw new Error('This is not a Cinebox backup');
      BACKUP_KEYS.forEach(k => { if (k in j.data) localStorage.setItem(k, JSON.stringify(j.data[k])); });
      setMsg('Backup restored. Restarting…'); setTimeout(() => location.reload(), 700);
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not read that file'); }
  };
  return (
    <Page title="Data management" back={back}>
      <Group>
        <Cell label="Clear cache" hint="Server lists and provider data" onClick={clearCache} />
        <Cell label="Export backup" hint="Library, progress and settings" onClick={exportBackup} />
        <Cell label="Import backup" onClick={() => file.current?.click()} />
        <Cell label="Reset settings" onClick={() => { resetSettings(); setMsg('Settings reset.'); }} />
        <Cell label="Erase all local data" danger onClick={() => { if (confirm('Erase library, progress, and settings in this browser?')) { const t = localStorage.getItem('sb-session'); localStorage.clear(); if (t) localStorage.setItem('sb-session', t); location.reload(); } }} />
      </Group>
      <input ref={file} type="file" accept="application/json" hidden onChange={e => e.target.files?.[0] && importBackup(e.target.files[0])} />
      {msg && <p className="muted">{msg}</p>}
    </Page>
  );
};

const About = ({back}: {back: () => void}) => (
  <Page title="About" back={back}>
    <div style={{textAlign: 'center', padding: '10px 0 30px'}}>
      <img src="/logo.png" width={84} height={84} style={{borderRadius: 22, boxShadow: '0 12px 40px rgba(255,69,58,.35)'}} alt="" />
      <h2 className="title-l" style={{marginTop: 16}}>Cinebox Web</h2>
      <p className="muted">Version 1.0.0</p>
    </div>
    <Group>
      <Cell label="Platform">{<span className="muted">Web</span>}</Cell>
    </Group>
  </Page>
);

interface AdminServer { id: string; label: string; source_url: string; manifest_url: string | null; provider_value: string | null; logo_url: string | null; position: number; enabled: boolean; hidden_providers: string[] | null }
const blank = (): Partial<AdminServer> => ({label: '', source_url: '', manifest_url: '', provider_value: '', logo_url: '', enabled: true, hidden_providers: []});

const Admin = ({back}: {back: () => void}) => {
  const {profile} = useProfile();
  const {reload: reloadServers} = useServers();
  const [servers, setServers] = useState<AdminServer[]>([]);
  const [edit, setEdit] = useState<Partial<AdminServer> | null>(null);
  const [live, setLive] = useState<Array<{id: string; label: string; url: string}>>([]);
  const [msg, setMsg] = useState('');
  const [provs, setProvs] = useState<Array<{value: string; name: string; version: string}> | null>(null);
  const [provErr, setProvErr] = useState('');

  const load = () => {
    supabase.from('cinehub_servers').select('*').order('position', {ascending: true}).order('created_at', {ascending: true}).then(({data}) => setServers((data ?? []) as AdminServer[]));
    fetchLiveSources().then(setLive).catch(() => {});
  };
  useEffect(load, []);
  if (profile && profile.role !== 'admin') return <Page title="Admin Panel" back={back}><p className="muted">Only admins can open this.</p></Page>;

  const saveServer = async () => {
    if (!edit?.label?.trim() || !edit.source_url?.trim()) { setMsg('Name and source link are required'); return; }
    const row: Record<string, unknown> = {
      label: edit.label.trim(), source_url: edit.source_url.trim(), enabled: edit.enabled ?? true,
      manifest_url: edit.manifest_url?.trim() || null, provider_value: edit.provider_value?.trim() || null,
      hidden_providers: edit.hidden_providers ?? [],
    };
    if (edit.logo_url?.trim()) row.logo_url = edit.logo_url.trim(); else if (edit.id) row.logo_url = null;
    if (!edit.id) row.position = servers.length;
    const q = edit.id ? supabase.from('cinehub_servers').update(row).eq('id', edit.id) : supabase.from('cinehub_servers').insert(row);
    const {error} = await q;
    if (error) { setMsg(/logo_url|hidden_providers/.test(error.message) ? `${error.message}. Run supabase/RUN_THIS_ONCE.sql once.` : error.message); return; }
    setEdit(null); setMsg('Saved'); load(); reloadServers();
  };
  const delServer = async (s: AdminServer) => {
    if (!confirm(`Delete server “${s.label}”?`)) return;
    const {error} = await supabase.from('cinehub_servers').delete().eq('id', s.id);
    setMsg(error ? error.message : 'Deleted'); load(); reloadServers();
  };
  const saveLive = async () => {
    const clean = live.map(s => ({id: s.id, label: s.label.trim(), url: s.url.trim()})).filter(s => s.url);
    const {error} = await supabase.from('app_settings').upsert({key: LIVE_KEY, value: JSON.stringify(clean)}, {onConflict: 'key'});
    setMsg(error ? error.message : 'Live TV links saved');
  };

  const move = async (i: number, d: -1 | 1) => {
    const a = servers[i], b = servers[i + d]; if (!a || !b) return;
    const [r1, r2] = await Promise.all([
      supabase.from('cinehub_servers').update({position: i + d}).eq('id', a.id),
      supabase.from('cinehub_servers').update({position: i}).eq('id', b.id),
    ]);
    setMsg(r1.error?.message || r2.error?.message || ''); load(); reloadServers();
  };
  const openEdit = (s: Partial<AdminServer>) => {
    setEdit(s); setProvs(null); setProvErr('');
    if (s.source_url?.trim()) fetchManifest(s.source_url, s.manifest_url).then(setProvs).catch(e => setProvErr(e instanceof Error ? e.message : 'Could not read this source'));
  };
  const toggleHidden = (value: string, visible: boolean) => {
    const set = new Set(edit?.hidden_providers ?? []);
    if (visible) set.delete(value); else set.add(value);
    setEdit({...edit, hidden_providers: [...set]});
  };

  const f = (k: keyof AdminServer, ph: string) => (
    <input className="input" style={{flex: 1, width: 320}} placeholder={ph} value={String(edit?.[k] ?? '')} onChange={e => setEdit({...edit, [k]: e.target.value})} />
  );

  return (
    <Page title="Admin Panel" back={back}>
      {msg && <p className="ok">{msg}</p>}
      <Group title="Servers" footer="Each server is a provider source. The logo shows on the Home Servers row.">
        {servers.map((s, i) => (
          <Cell key={s.id} label={s.label} hint={s.enabled ? s.source_url : `Disabled · ${s.source_url}`}>
            <button className="btn glass press" style={{height: 36, padding: '0 12px', opacity: i === 0 ? .35 : 1}} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
            <button className="btn glass press" style={{height: 36, padding: '0 12px', opacity: i === servers.length - 1 ? .35 : 1}} disabled={i === servers.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            <button className="btn glass press" style={{height: 36, padding: '0 14px'}} onClick={() => openEdit(s)}>Edit</button>
            <button className="btn glass press" style={{height: 36, padding: '0 14px', color: 'var(--accent)'}} onClick={() => delServer(s)}>Delete</button>
          </Cell>
        ))}
        <Cell label="Add server" onClick={() => openEdit(blank())}><span className="muted" style={{fontSize: 20}}>+</span></Cell>
      </Group>
      {edit && (
        <Group title={edit.id ? 'Edit server' : 'New server'}>
          <Cell label="Name">{f('label', 'Server name')}</Cell>
          <Cell label="Source link">{f('source_url', 'https://github.com/…')}</Cell>
          <Cell label="Logo URL">{f('logo_url', 'https://…/logo.png')}</Cell>
          <Cell label="Manifest URL" hint="Optional">{f('manifest_url', '')}</Cell>
          <Cell label="Provider value" hint="Optional: use only this provider">{f('provider_value', '')}</Cell>
          <Cell label="Enabled"><Toggle value={edit.enabled ?? true} onChange={v => setEdit({...edit, enabled: v})} /></Cell>
          {provErr ? <Cell label="Providers" hint={provErr} /> : provs === null ? <Cell label="Providers" hint="Loading…" /> : provs.map(p => (
            <Cell key={p.value} label={p.name} hint={`${p.value} · v${p.version} · switch off to hide it from users`}>
              <Toggle value={!(edit.hidden_providers ?? []).includes(p.value)} onChange={v => toggleHidden(p.value, v)} />
            </Cell>
          ))}
          <Cell label=""><button className="btn glass press" style={{height: 38}} onClick={() => setEdit(null)}>Cancel</button><button className="btn accent press" style={{height: 38}} onClick={saveServer}>Save</button></Cell>
        </Group>
      )}
      <Group title="Live TV links" footer="JSON or M3U links. Every signed-in user sees these channels.">
        {live.map((s, i) => (
          <Cell key={s.id} label="">
            <input className="input" placeholder="Label" style={{width: 130}} value={s.label} onChange={e => setLive(live.map((x, j) => (j === i ? {...x, label: e.target.value} : x)))} />
            <input className="input" placeholder="https://…" style={{width: 280}} value={s.url} onChange={e => setLive(live.map((x, j) => (j === i ? {...x, url: e.target.value} : x)))} />
            <button className="btn glass press" style={{height: 36, padding: '0 12px'}} onClick={() => setLive(live.filter((_, j) => j !== i))}>✕</button>
          </Cell>
        ))}
        <Cell label="Add link" onClick={() => setLive([...live, {id: `src${Date.now()}`, label: '', url: ''}])}><span className="muted" style={{fontSize: 20}}>+</span></Cell>
        <Cell label=""><button className="btn accent press" style={{height: 38}} onClick={saveLive}>Save links</button></Cell>
      </Group>
    </Page>
  );
};
