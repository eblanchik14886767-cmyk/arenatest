import { useCallback, useEffect, useState } from 'react';
import type { HistoryEntry, Track } from '../types';
import { loadJSON, saveJSON } from '../utils/storage';

export const FAVORITES_KEY = 'equalizer:favorites';
export const HISTORY_KEY = 'equalizer:history';
const HISTORY_LIMIT = 100;

function loadFavorites(): string[] {
  const raw = loadJSON<unknown>(FAVORITES_KEY, []);
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : [];
}

function loadHistory(): HistoryEntry[] {
  const raw = loadJSON<unknown>(HISTORY_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is HistoryEntry =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as HistoryEntry).trackId === 'string' &&
        typeof (item as HistoryEntry).playedAt === 'number',
    )
    .slice(0, HISTORY_LIMIT);
}

export interface UseLibraryResult {
  favorites: string[];
  history: HistoryEntry[];
  toggleFavorite: (trackId: string) => void;
  addHistory: (track: Track, listenedSeconds: number) => void;
  clearHistory: () => void;
}

/** Favorites and listening history persisted separately from the settings. */
export function useLibrary(): UseLibraryResult {
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);

  useEffect(() => {
    saveJSON(FAVORITES_KEY, favorites);
  }, [favorites]);

  useEffect(() => {
    saveJSON(HISTORY_KEY, history);
  }, [history]);

  const toggleFavorite = useCallback((trackId: string) => {
    setFavorites((prev) => (prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [...prev, trackId]));
  }, []);

  const addHistory = useCallback((track: Track, listenedSeconds: number) => {
    const entry: HistoryEntry = {
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      coverUrl: track.thumbUrl,
      playedAt: Date.now(),
      listenedSeconds: Math.round(listenedSeconds),
    };
    setHistory((prev) => [entry, ...prev].slice(0, HISTORY_LIMIT));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  return { favorites, history, toggleFavorite, addHistory, clearHistory };
}
