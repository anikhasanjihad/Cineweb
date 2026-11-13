import {useSyncExternalStore} from 'react';
import {load, save} from './storage';

export interface Settings {
  accent: string;
  reduceMotion: boolean;
  seekInterval: number;
  autoPlayNext: boolean;
  playbackSpeed: number;
  rememberPosition: boolean;
  subSize: number;      // % of default
  subColor: string;
  subBg: number;        // 0..1 background opacity
  subEdge: 'none' | 'shadow' | 'outline';
  subBottom: number;    // % from bottom
  showContinue: boolean;
  hideDownloads: boolean;
  sidebarLabels: boolean;
  resize: 'contain' | 'cover' | 'fill' | 'zoom';
  volumeBoost: boolean;
  ambient: boolean;
  hiddenControls: string[];
}

export const DEFAULTS: Settings = {
  accent: '#ff453a',
  reduceMotion: false,
  seekInterval: 10,
  autoPlayNext: true,
  playbackSpeed: 1,
  rememberPosition: true,
  subSize: 100,
  subColor: '#ffffff',
  subBg: 0.55,
  subEdge: 'shadow',
  subBottom: 6,
  showContinue: true,
  hideDownloads: false,
  sidebarLabels: true,
  resize: 'contain',
  volumeBoost: true,
  ambient: true,
  hiddenControls: [],
};

let state: Settings = {...DEFAULTS, ...load<Partial<Settings>>('settings', {})};
const listeners = new Set<() => void>();

export const applySettings = (s: Settings = state) => {
  const r = document.documentElement.style;
  r.setProperty('--accent', s.accent);
  r.setProperty('--sub-size', `${s.subSize / 100}`);
  r.setProperty('--sub-color', s.subColor);
  r.setProperty('--sub-bg', `rgba(0,0,0,${s.subBg})`);
  r.setProperty('--sub-bottom', `${s.subBottom}%`);
  r.setProperty('--sub-shadow', s.subEdge === 'shadow' ? '0 2px 6px rgba(0,0,0,.9)' : s.subEdge === 'outline' ? '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000' : 'none');
  document.body.classList.toggle('reduce-motion', s.reduceMotion);
};

export const getSettings = () => state;
export const updateSettings = (patch: Partial<Settings>) => {
  state = {...state, ...patch};
  save('settings', state);
  applySettings();
  listeners.forEach(l => l());
};
export const resetSettings = () => { state = {...DEFAULTS}; save('settings', state); applySettings(); listeners.forEach(l => l()); };
export const useSettings = () =>
  useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
