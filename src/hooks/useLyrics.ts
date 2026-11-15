import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LyricLine, ToastKind, TrackInfoForSearch, TranslationLang } from '../types';
import { downloadBlob } from '../utils/audio';
import { getWordTimings, parseLyricsText, serializeLrc, sortLines } from '../utils/lrcParser';
import { LyricsApiError, searchLyrics, translateText } from '../utils/lyricsApi';

interface UseLyricsArgs {
  getTime: () => number;
  duration: number;
  trackKey: string | null;
  translationLang: TranslationLang;
  notify: (text: string, kind?: ToastKind) => void;
}

export interface UseLyricsResult {
  lines: LyricLine[];
  synced: boolean;
  sourceName: string;
  currentLineIndex: number;
  currentWordIndex: number;
  manualSync: boolean;
  selectedId: string | null;
  translations: Record<string, string>;
  translating: boolean;
  searching: boolean;
  loadFromText: (text: string, sourceName: string) => boolean;
  clear: () => void;
  setManualSync: (enabled: boolean) => void;
  selectLine: (id: string | null) => void;
  stampLine: (id: string) => void;
  shiftLine: (deltaSeconds: number) => void;
  exportLrc: (title: string) => void;
  translate: () => Promise<void>;
  clearTranslations: () => void;
  searchOnline: (info: TrackInfoForSearch | null) => Promise<void>;
}

export function useLyrics({ getTime, duration, trackKey, translationLang, notify }: UseLyricsArgs): UseLyricsResult {
  const [rawLines, setRawLines] = useState<LyricLine[]>([]);
  const [synced, setSynced] = useState(false);
  const [sourceName, setSourceName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manualSync, setManualSyncState] = useState(false);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState(false);
  const [searching, setSearching] = useState(false);

  const getTimeRef = useRef(getTime);
  getTimeRef.current = getTime;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const trackKeyRef = useRef(trackKey);
  trackKeyRef.current = trackKey;
  const langRef = useRef(translationLang);
  langRef.current = translationLang;
  const cacheRef = useRef(new Map<string, string>());
  const translateRunRef = useRef(0);
  const previousKeyRef = useRef<string | null>(trackKey);

  /** Lines with times; unsynced text gets evenly estimated times when duration is known. */
  const lines = useMemo<LyricLine[]>(() => {
    if (synced || rawLines.length === 0) return rawLines;
    if (duration <= 0) return rawLines;
    const step = duration / rawLines.length;
    return rawLines.map((line, index) => ({ ...line, time: index * step }));
  }, [rawLines, synced, duration]);

  const clearTranslations = useCallback(() => {
    translateRunRef.current += 1;
    setTranslations({});
    setTranslating(false);
  }, []);

  const clear = useCallback(() => {
    setRawLines([]);
    setSynced(false);
    setSourceName('');
    setSelectedId(null);
    setManualSyncState(false);
    setCurrentLineIndex(-1);
    setCurrentWordIndex(-1);
    clearTranslations();
  }, [clearTranslations]);

  // Lyrics are per-track: drop them when another track starts.
  useEffect(() => {
    const previous = previousKeyRef.current;
    previousKeyRef.current = trackKey;
    if (previous !== null && previous !== trackKey) clear();
  }, [trackKey, clear]);

  // Translations belong to one target language.
  useEffect(() => {
    clearTranslations();
  }, [translationLang, clearTranslations]);

  // Current line / word tracking loop.
  useEffect(() => {
    if (lines.length === 0) {
      setCurrentLineIndex(-1);
      setCurrentWordIndex(-1);
      return undefined;
    }
    let raf = 0;
    let timingsLine = -1;
    let timings: ReturnType<typeof getWordTimings> = [];

    const tick = () => {
      const t = getTimeRef.current();
      let lo = 0;
      let hi = lines.length - 1;
      let index = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const time = lines[mid].time;
        if (time !== null && time <= t) {
          index = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      let wordIndex = -1;
      if (index >= 0) {
        if (timingsLine !== index) {
          timingsLine = index;
          timings = getWordTimings(lines[index], lines[index + 1]?.time ?? null);
        }
        for (let i = 0; i < timings.length; i += 1) {
          if (timings[i].start <= t) wordIndex = i;
          else break;
        }
      }
      setCurrentLineIndex((prev) => (prev === index ? prev : index));
      setCurrentWordIndex((prev) => (prev === wordIndex ? prev : wordIndex));
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lines]);

  const loadFromText = useCallback(
    (text: string, name: string): boolean => {
      const parsed = parseLyricsText(text);
      if (parsed.lines.length === 0) {
        notifyRef.current('Файл с текстом песни пуст', 'error');
        return false;
      }
      clearTranslations();
      setRawLines(parsed.lines);
      setSynced(parsed.synced);
      setSourceName(name);
      setSelectedId(null);
      setManualSyncState(false);
      setCurrentLineIndex(-1);
      setCurrentWordIndex(-1);
      notifyRef.current(parsed.synced ? 'Текст песни загружен (с синхронизацией)' : 'Текст песни загружен', 'success');
      return true;
    },
    [clearTranslations],
  );

  /** Converts estimated times into real ones so lines can be stamped and exported. */
  const ensureTimed = useCallback((): LyricLine[] | null => {
    if (synced) return rawLines;
    if (duration <= 0) {
      notifyRef.current('Для синхронизации нужен воспроизводимый трек', 'error');
      return null;
    }
    setSynced(true);
    setRawLines(lines);
    return lines;
  }, [synced, rawLines, duration, lines]);

  const setManualSync = useCallback(
    (enabled: boolean) => {
      if (!enabled) {
        setManualSyncState(false);
        return;
      }
      if (rawLines.length === 0) return;
      if (ensureTimed()) setManualSyncState(true);
    },
    [rawLines.length, ensureTimed],
  );

  const selectLine = useCallback((id: string | null) => setSelectedId(id), []);

  const stampLine = useCallback(
    (id: string) => {
      const base = ensureTimed();
      if (!base) return;
      const time = Math.round(getTimeRef.current() * 100) / 100;
      setRawLines(sortLines(base.map((line) => (line.id === id ? { ...line, time, words: null } : line))));
      setSelectedId(id);
    },
    [ensureTimed],
  );

  const shiftLine = useCallback(
    (delta: number) => {
      const base = ensureTimed();
      if (!base) return;
      const targetId = selectedId ?? base[currentLineIndex]?.id ?? null;
      if (!targetId) {
        notifyRef.current('Выберите строку для сдвига', 'info');
        return;
      }
      setRawLines(
        sortLines(
          base.map((line) => {
            if (line.id !== targetId || line.time === null) return line;
            const next = Math.max(0, Math.round((line.time + delta) * 100) / 100);
            const applied = next - line.time;
            return {
              ...line,
              time: next,
              words: line.words ? line.words.map((word) => ({ ...word, time: Math.max(0, word.time + applied) })) : null,
            };
          }),
        ),
      );
      setSelectedId(targetId);
    },
    [ensureTimed, selectedId, currentLineIndex],
  );

  const exportLrc = useCallback(
    (title: string) => {
      const timed = lines.filter((line) => line.time !== null);
      if (timed.length === 0) {
        notifyRef.current('Нет строк с временными метками для экспорта', 'error');
        return;
      }
      const blob = new Blob([serializeLrc(timed, title)], { type: 'text/plain;charset=utf-8' });
      const safe = (title || 'lyrics').replace(/[\\/:*?"<>|]+/g, '_');
      downloadBlob(blob, `${safe}.lrc`);
      notifyRef.current('Файл .lrc сохранён', 'success');
    },
    [lines],
  );

  const translate = useCallback(async () => {
    if (rawLines.length === 0) return;
    translateRunRef.current += 1;
    const runId = translateRunRef.current;
    const lang = langRef.current;
    setTranslating(true);
    const queue = Array.from(new Set(rawLines.map((line) => line.text).filter((text) => text.trim().length > 0)));
    const result: Record<string, string> = {};
    let success = 0;
    let failed = 0;
    let aborted = false;

    const worker = async () => {
      while (queue.length > 0 && !aborted) {
        const text = queue.shift();
        if (text === undefined) return;
        if (translateRunRef.current !== runId) return;
        const key = `${lang}|${text}`;
        const cached = cacheRef.current.get(key);
        if (cached !== undefined) {
          result[text] = cached;
          success += 1;
          continue;
        }
        try {
          const translated = await translateText(text, lang);
          cacheRef.current.set(key, translated);
          result[text] = translated;
          success += 1;
          if (translateRunRef.current === runId) setTranslations({ ...result });
        } catch (error) {
          failed += 1;
          if (error instanceof LyricsApiError && error.fatal) aborted = true;
        }
      }
    };

    await Promise.all([worker(), worker(), worker()]);
    if (translateRunRef.current !== runId) return;
    setTranslations({ ...result });
    setTranslating(false);
    if (success === 0) notifyRef.current('Не удалось перевести текст. Попробуйте позже', 'error');
    else if (failed > 0 || aborted) notifyRef.current('Часть строк не удалось перевести', 'error');
    else notifyRef.current('Перевод готов', 'success');
  }, [rawLines]);

  const searchOnline = useCallback(
    async (info: TrackInfoForSearch | null) => {
      if (!info || !info.title.trim()) {
        notifyRef.current('Нет названия трека для поиска', 'error');
        return;
      }
      const startedFor = trackKeyRef.current;
      setSearching(true);
      try {
        const found = await searchLyrics(info);
        if (trackKeyRef.current !== startedFor) return;
        loadFromText(found.text, 'LRCLIB');
      } catch (error) {
        const message = error instanceof LyricsApiError ? error.message : 'Текст не найден';
        notifyRef.current(message, 'error');
      } finally {
        setSearching(false);
      }
    },
    [loadFromText],
  );

  return {
    lines,
    synced,
    sourceName,
    currentLineIndex,
    currentWordIndex,
    manualSync,
    selectedId,
    translations,
    translating,
    searching,
    loadFromText,
    clear,
    setManualSync,
    selectLine,
    stampLine,
    shiftLine,
    exportLrc,
    translate,
    clearTranslations,
    searchOnline,
  };
}
