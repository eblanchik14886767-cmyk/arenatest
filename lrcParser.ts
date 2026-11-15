import type { LyricLine, LyricWord, ParsedLyrics, WordTiming } from '../types';

const LINE_TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TIME_TAG = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;
const LEADING_TAGS = /^(?:\s*\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\])+/;
const OFFSET_TAG = /^\s*\[offset:\s*([+-]?\d+)\s*\]/i;

let lineCounter = 0;

function nextId(): string {
  lineCounter += 1;
  return `ln${lineCounter}`;
}

function toSeconds(minutes: string, seconds: string, fraction?: string): number {
  const frac = fraction ? parseInt(fraction, 10) / Math.pow(10, fraction.length) : 0;
  return parseInt(minutes, 10) * 60 + parseInt(seconds, 10) + frac;
}

export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter((word) => word.length > 0);
}

export function getLineWords(line: LyricLine): string[] {
  if (line.words && line.words.length > 0) return line.words.map((word) => word.text);
  return splitWords(line.text);
}

function parseEnhancedWords(text: string, lineTime: number): { clean: string; words: LyricWord[] | null } {
  if (!/<\d{1,3}:\d{1,2}/.test(text)) return { clean: text.trim(), words: null };
  const words: LyricWord[] = [];
  let lastIndex = 0;
  let currentTime = lineTime;
  const pushSegment = (segment: string, time: number) => {
    const trimmed = segment.trim();
    if (trimmed) words.push({ time, text: trimmed });
  };
  const regex = new RegExp(WORD_TIME_TAG.source, 'g');
  let match = regex.exec(text);
  while (match) {
    pushSegment(text.slice(lastIndex, match.index), currentTime);
    currentTime = toSeconds(match[1], match[2], match[3]);
    lastIndex = match.index + match[0].length;
    match = regex.exec(text);
  }
  pushSegment(text.slice(lastIndex), currentTime);
  const clean = words.map((word) => word.text).join(' ');
  return { clean, words: words.length > 0 ? words : null };
}

export function sortLines(lines: LyricLine[]): LyricLine[] {
  return lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => {
      const ta = a.line.time ?? Number.MAX_SAFE_INTEGER;
      const tb = b.line.time ?? Number.MAX_SAFE_INTEGER;
      return ta - tb || a.index - b.index;
    })
    .map((entry) => entry.line);
}

/** Parses .lrc (including enhanced word timing) or plain text. */
export function parseLyricsText(raw: string): ParsedLyrics {
  const rows = raw.replace(/^\uFEFF/, '').split(/\r?\n/);
  const hasTimestamps = rows.some((row) => LEADING_TAGS.test(row));

  if (!hasTimestamps) {
    const lines: LyricLine[] = rows
      .map((row) => row.trim())
      .filter((row) => row.length > 0)
      .map((text) => ({ id: nextId(), time: null, text, words: null }));
    return { lines, synced: false };
  }

  let offsetSeconds = 0;
  const lines: LyricLine[] = [];
  rows.forEach((row) => {
    const offsetMatch = OFFSET_TAG.exec(row);
    if (offsetMatch) {
      offsetSeconds = parseInt(offsetMatch[1], 10) / 1000;
      return;
    }
    const leading = LEADING_TAGS.exec(row);
    if (!leading) return;
    const body = row.slice(leading[0].length);
    const times: number[] = [];
    const regex = new RegExp(LINE_TIME_TAG.source, 'g');
    let match = regex.exec(leading[0]);
    while (match) {
      times.push(toSeconds(match[1], match[2], match[3]));
      match = regex.exec(leading[0]);
    }
    times.forEach((time) => {
      const adjusted = Math.max(0, time - offsetSeconds);
      const { clean, words } = parseEnhancedWords(body, adjusted);
      lines.push({
        id: nextId(),
        time: adjusted,
        text: clean,
        words: words ? words.map((word) => ({ ...word, time: Math.max(0, word.time - offsetSeconds) })) : null,
      });
    });
  });
  return { lines: sortLines(lines), synced: true };
}

export function formatLrcTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = safe - m * 60;
  return `${m.toString().padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

/** Serializes lines with timestamps back to .lrc text. */
export function serializeLrc(lines: LyricLine[], title?: string): string {
  const header = title ? `[ti:${title}]\n` : '';
  const body = lines
    .filter((line) => line.time !== null)
    .map((line) => `[${formatLrcTime(line.time ?? 0)}]${line.text}`)
    .join('\n');
  return `${header}${body}\n`;
}

/** Word timings for a line: real (enhanced) or estimated by word length. */
export function getWordTimings(line: LyricLine, nextTime: number | null): WordTiming[] {
  if (line.time === null) return [];
  const start = line.time;
  const lineEnd = nextTime ?? start + 4;
  const duration = Math.min(12, Math.max(0.5, lineEnd - start));

  if (line.words && line.words.length > 0) {
    return line.words.map((word, index) => {
      const next = line.words?.[index + 1];
      return { text: word.text, start: word.time, end: next ? next.time : start + duration };
    });
  }

  const words = splitWords(line.text);
  if (words.length === 0) return [];
  const weights = words.map((word) => word.length + 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = start;
  return words.map((text, index) => {
    const span = (weights[index] / total) * duration * 0.96;
    const timing = { text, start: cursor, end: cursor + span };
    cursor += span;
    return timing;
  });
}

/** Decodes a lyrics file: UTF-8 first, then Windows-1251 for legacy Russian files. */
export function decodeLyricsBuffer(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1251').decode(buffer);
  }
}
