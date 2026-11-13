export interface Cue { start: number; end: number; text: string }

const time = (s: string) => {
  const m = /(?:(\d+):)?(\d+):(\d+)[.,](\d+)/.exec(s.trim());
  if (!m) return NaN;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0').slice(0, 3)) / 1000;
};

/** Reads .srt and .vtt text into cues. Styling tags are stripped. */
export const parseSubtitles = (raw: string): Cue[] => {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r/g, '');
  const cues: Cue[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n');
    const i = lines.findIndex(l => l.includes('-->'));
    if (i < 0) continue;
    const [a, b] = lines[i].split('-->');
    const start = time(a), end = time(b.trim().split(/\s+/)[0]);
    if (!isFinite(start) || !isFinite(end)) continue;
    const body = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '').trim();
    if (body) cues.push({start, end, text: body});
  }
  return cues.sort((x, y) => x.start - y.start);
};

export const cueAt = (cues: Cue[], t: number): Cue | null => {
  let lo = 0, hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].end < t) lo = mid + 1;
    else if (cues[mid].start > t) hi = mid - 1;
    else return cues[mid];
  }
  return null;
};
