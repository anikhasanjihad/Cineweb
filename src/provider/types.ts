export interface Post { title: string; link: string; image: string; provider?: string }
export interface Catalog { title: string; filter: string }
export interface DirectLink { title: string; link: string; type?: 'movie' | 'series'; description?: string; image?: string }
export interface InfoLink { title: string; quality?: string; episodesLink?: string; directLinks?: DirectLink[] }
export interface Info {
  title: string; image: string; poster?: string; logo?: string; synopsis: string; type: string;
  tags?: string[]; cast?: string[]; rating?: string; linkList: InfoLink[];
}
export interface EpisodeLink { title: string; link: string; image?: string; description?: string }
export interface Stream {
  server: string; link: string; type: string; quality?: string;
  subtitles?: Array<{title: string; language: string; type: string; uri: string}>;
  headers?: Record<string, string>;
}
/** One selectable server on the Home row. */
export interface Provider {
  key: string;
  value: string;
  name: string;
  logo: string;
  sourceUrl: string;
  path?: string;
  version: string;
  scope: string;
}
