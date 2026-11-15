import type { TrackInfoForSearch, TranslationLang } from '../types';

export class LyricsApiError extends Error {
  readonly fatal: boolean;

  constructor(message: string, fatal = false) {
    super(message);
    this.name = 'LyricsApiError';
    this.fatal = fatal;
  }
}

interface LrclibRecord {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
}

export interface FoundLyrics {
  text: string;
  synced: boolean;
}

const LRCLIB = 'https://lrclib.net/api';
const MYMEMORY = 'https://api.mymemory.translated.net/get';

function pickText(record: LrclibRecord): FoundLyrics | null {
  if (record.syncedLyrics && record.syncedLyrics.trim()) return { text: record.syncedLyrics, synced: true };
  if (record.plainLyrics && record.plainLyrics.trim()) return { text: record.plainLyrics, synced: false };
  return null;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new LyricsApiError('Не удалось подключиться к сервису текстов', true);
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new LyricsApiError('Сервис текстов временно недоступен', true);
  return (await response.json()) as T;
}

/** Exact match via /api/get, then fuzzy search via /api/search. */
export async function searchLyrics(info: TrackInfoForSearch): Promise<FoundLyrics> {
  const title = info.title.trim();
  const artist = info.artist.trim();

  if (artist) {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    if (info.album) params.set('album_name', info.album);
    if (info.duration > 0) params.set('duration', String(Math.round(info.duration)));
    const exact = await fetchJson<LrclibRecord>(`${LRCLIB}/get?${params.toString()}`);
    if (exact) {
      const picked = pickText(exact);
      if (picked) return picked;
    }
  }

  const searchParams = new URLSearchParams(artist ? { track_name: title, artist_name: artist } : { q: title });
  const results = await fetchJson<LrclibRecord[]>(`${LRCLIB}/search?${searchParams.toString()}`);
  if (results && results.length > 0) {
    const synced = results.find((record) => record.syncedLyrics && record.syncedLyrics.trim());
    if (synced) {
      const picked = pickText(synced);
      if (picked) return picked;
    }
    for (const record of results) {
      const picked = pickText(record);
      if (picked) return picked;
    }
  }
  throw new LyricsApiError('Текст не найден');
}

interface MyMemoryResponse {
  responseStatus: number | string;
  responseDetails?: string;
  responseData?: { translatedText?: string };
}

/** Translates one line via MyMemory. Returns the original text when no translation is needed. */
export async function translateText(text: string, lang: TranslationLang): Promise<string> {
  const trimmed = text.trim();
  if (!/\p{L}/u.test(trimmed)) return text;
  const hasCyrillic = /[\u0400-\u04FF]/.test(trimmed);
  if (hasCyrillic && lang === 'ru') return text;
  const source = hasCyrillic ? 'ru' : 'autodetect';
  const url = `${MYMEMORY}?q=${encodeURIComponent(trimmed.slice(0, 480))}&langpair=${source}|${lang}`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new LyricsApiError('Не удалось подключиться к сервису перевода', true);
  }
  if (!response.ok) throw new LyricsApiError('Сервис перевода временно недоступен', response.status === 429);
  const data = (await response.json()) as MyMemoryResponse;
  const status = Number(data.responseStatus);
  if (status === 429) throw new LyricsApiError('Превышен лимит переводов', true);
  if (status !== 200) {
    if (/DISTINCT/i.test(data.responseDetails ?? '')) return text;
    throw new LyricsApiError('Не удалось перевести строку');
  }
  const translated = data.responseData?.translatedText;
  if (!translated || /MYMEMORY WARNING/i.test(translated)) {
    throw new LyricsApiError('Превышен лимит переводов', true);
  }
  return translated;
}
