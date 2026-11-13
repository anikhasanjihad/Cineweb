import {supabase} from './supabase';

// Admin switch (Admin Panel -> Video playback). OFF by default: video only ever plays straight from the
// provider's server, so no video data passes through our proxy (no Vercel bandwidth). Turn it ON to let streams
// that need Referer / User-Agent headers (browsers can not send those) play through the proxy as a fallback.
export const VIDEO_PROXY_KEY = 'video_proxy';
let cached: boolean | null = null;

export const videoProxyAllowed = async (force = false): Promise<boolean> => {
  if (cached !== null && !force) return cached;
  try {
    const {data, error} = await supabase.from('app_settings').select('value').eq('key', VIDEO_PROXY_KEY).maybeSingle();
    if (error) throw new Error(error.message);
    cached = String(data?.value ?? '').trim().toLowerCase() === 'on';
  } catch {
    cached = false;
  }
  return cached;
};

export const setVideoProxyAllowed = async (on: boolean): Promise<string> => {
  const {error} = await supabase.from('app_settings').upsert({key: VIDEO_PROXY_KEY, value: on ? 'on' : 'off'}, {onConflict: 'key'});
  if (!error) cached = on;
  return error?.message ?? '';
};
