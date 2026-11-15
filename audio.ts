import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js';
import type { EqPresetId, Track } from '../types';

export const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export const EQ_FREQUENCY_LABELS = ['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'] as const;

export const EQ_PRESETS: Record<Exclude<EqPresetId, 'custom'>, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [7, 6, 5, 3, 1, 0, 0, 0, 0, 0],
  vocal: [-3, -2, -1, 1, 3, 4, 4, 2, 0, -1],
  treble: [0, 0, 0, 0, 0, 1, 3, 5, 6, 7],
  party: [6, 5, 3, 0, -2, -2, 0, 3, 5, 6],
};

export const EQ_PRESET_LABELS: Record<Exclude<EqPresetId, 'custom'>, string> = {
  flat: 'Плоский',
  bass: 'Бас',
  vocal: 'Вокал',
  treble: 'Высокие',
  party: 'Вечеринка',
};

const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'webm', 'oga', 'opus', 'aac'];
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'm4v', 'mov'];

export type FileKind = 'audio' | 'video' | 'lyrics' | 'preset' | 'unknown';

function getExtension(name: string): string {
  const index = name.lastIndexOf('.');
  return index < 0 ? '' : name.slice(index + 1).toLowerCase();
}

/** Decides what a dropped or picked file is by MIME type and extension. */
export function classifyFile(file: File): FileKind {
  const ext = getExtension(file.name);
  if (ext === 'lrc' || ext === 'txt') return 'lyrics';
  if (ext === 'json') return 'preset';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  return 'unknown';
}

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

export function getAudioContextCtor(): typeof AudioContext | null {
  const w = window as WebkitWindow;
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Generates a decaying noise impulse response for the convolver reverb. */
export function createImpulseResponse(ctx: BaseAudioContext, seconds = 2, decay = 2.5): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function hashString(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function buildTrackId(title: string, artist: string, duration: number, fileName: string, fileSize: number): string {
  return hashString(`${title}|${artist}|${Math.round(duration)}|${fileName}|${fileSize}`);
}

interface RawTags {
  title: string;
  artist: string;
  album: string;
  picture: { data: number[]; format: string } | null;
}

function readFileTags(file: File): Promise<RawTags> {
  return new Promise((resolve) => {
    const empty: RawTags = { title: '', artist: '', album: '', picture: null };
    const timer = window.setTimeout(() => resolve(empty), 4000);
    try {
      jsmediatags.read(file, {
        onSuccess: (result) => {
          window.clearTimeout(timer);
          const tags = result.tags;
          const picture = tags.picture ? { data: tags.picture.data as number[], format: tags.picture.format } : null;
          resolve({
            title: typeof tags.title === 'string' ? tags.title : '',
            artist: typeof tags.artist === 'string' ? tags.artist : '',
            album: typeof tags.album === 'string' ? tags.album : '',
            picture,
          });
        },
        onError: () => {
          window.clearTimeout(timer);
          resolve(empty);
        },
      });
    } catch {
      window.clearTimeout(timer);
      resolve(empty);
    }
  });
}

function readDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const probe = new Audio();
    probe.preload = 'metadata';
    const finish = (value: number) => {
      window.clearTimeout(timer);
      probe.removeAttribute('src');
      probe.load();
      resolve(Number.isFinite(value) ? value : 0);
    };
    const timer = window.setTimeout(() => finish(0), 5000);
    probe.onloadedmetadata = () => finish(probe.duration);
    probe.onerror = () => finish(0);
    probe.src = url;
  });
}

/** Creates a small data URL thumbnail from a cover image URL. */
export function createThumbnail(url: string, size = 64): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        const side = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

let uidCounter = 0;

function titleFromFileName(name: string): { title: string; artist: string } {
  const base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  const parts = base.split(' - ');
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  }
  return { artist: '', title: base || name };
}

/** Reads ID3 tags, cover and duration and builds a Track. Never throws. */
export async function readTrackMeta(file: File): Promise<Track> {
  const url = URL.createObjectURL(file);
  const [tags, duration] = await Promise.all([readFileTags(file), readDuration(url)]);
  const fallback = titleFromFileName(file.name);
  const title = tags.title.trim() || fallback.title;
  const artist = tags.artist.trim() || (tags.title.trim() ? '' : fallback.artist);
  let coverUrl: string | null = null;
  if (tags.picture && tags.picture.data.length > 0) {
    const blob = new Blob([new Uint8Array(tags.picture.data)], { type: tags.picture.format || 'image/jpeg' });
    coverUrl = URL.createObjectURL(blob);
  }
  const thumbUrl = coverUrl ? await createThumbnail(coverUrl) : null;
  uidCounter += 1;
  return {
    uid: `t${Date.now().toString(36)}-${uidCounter}`,
    id: buildTrackId(title, artist, duration, file.name, file.size),
    file,
    url,
    fileName: file.name,
    title,
    artist,
    album: tags.album.trim(),
    coverUrl,
    thumbUrl,
    duration,
  };
}

export function revokeTrackUrls(track: Track): void {
  URL.revokeObjectURL(track.url);
  if (track.coverUrl) URL.revokeObjectURL(track.coverUrl);
}

/** True for files the player may try to decode (webm may hold audio only). */
export function isAudioCandidate(file: File): boolean {
  return classifyFile(file) === 'audio' || getExtension(file.name) === 'webm';
}

/** Probes whether a media file actually contains a video track. */
export function hasVideoTrack(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.muted = true;
    const finish = (result: boolean) => {
      window.clearTimeout(timer);
      probe.removeAttribute('src');
      probe.load();
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timer = window.setTimeout(() => finish(false), 3000);
    probe.onloadedmetadata = () => finish(probe.videoWidth > 0);
    probe.onerror = () => finish(false);
    probe.src = url;
  });
}
