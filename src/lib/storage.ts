export const load = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
};
export const save = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage full or blocked */ }
};

export interface LibraryItem { title: string; link: string; image: string; providerKey: string }
export const getLibrary = () => load<LibraryItem[]>('library', []);
export const toggleLibrary = (item: LibraryItem) => {
  const list = getLibrary();
  const i = list.findIndex(x => x.link === item.link && x.providerKey === item.providerKey);
  if (i >= 0) list.splice(i, 1); else list.unshift(item);
  save('library', list);
  return i < 0;
};
export const inLibrary = (link: string, providerKey: string) =>
  getLibrary().some(x => x.link === link && x.providerKey === providerKey);

export type Progress = Record<string, {t: number; d: number}>;
export const getProgress = (id: string) => load<Progress>('progress', {})[id];
export const setProgress = (id: string, t: number, d: number) => {
  const all = load<Progress>('progress', {});
  all[id] = {t, d};
  save('progress', all);
};
