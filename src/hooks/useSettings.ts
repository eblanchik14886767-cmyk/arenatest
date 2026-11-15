import { useCallback, useEffect, useRef, useState } from 'react';
import type { CustomPreset, Settings, SettingsUpdater, VisualPresetData } from '../types';
import { normalizeHex } from '../utils/color';
import { clamp } from '../utils/format';
import { decodeShare, loadJSON, removeKey, saveJSON } from '../utils/storage';

export const SETTINGS_KEY = 'equalizer:settings';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  primaryColor: '#a855f7',
  secondaryColor: '#22d3ee',
  colorMode: 'gradient',
  gradientDirection: 'vertical',
  neonGlow: 55,
  visualizerMode: 'bars',
  barCount: 64,
  barGap: 4,
  cornerRadius: 4,
  smoothing: 0.8,
  sensitivity: 1,
  reflection: true,
  centerText: '////////',
  centerTextVisible: true,
  centerTextSource: 'custom',
  centerTextFont: 'thin',
  centerTextSize: 72,
  centerTextOpacity: 0.9,
  centerTextGlow: 40,
  centerTextWaveAmplitude: 14,
  brandingText: 'эквалайзер',
  brandingVisible: true,
  brandingSize: 14,
  brandingOpacity: 0.55,
  bassBoost: 0,
  volume: 0.8,
  showLyrics: true,
  autoPalette: false,
  beatReaction: true,
  beatFlashIntensity: 0.5,
  partyMode: false,
  eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  eqPreset: 'flat',
  echoEnabled: false,
  echoTime: 0.3,
  echoFeedback: 0.35,
  echoMix: 0.4,
  reverbEnabled: false,
  reverbMix: 0.35,
  eightDEnabled: false,
  eightDIntensity: 0.8,
  playbackSpeed: 1,
  crossfadeDuration: 0,
  sleepTimerMinutes: 0,
  shuffle: false,
  repeatMode: 'off',
  hideTrackName: false,
  karaokeWordHighlight: false,
  translationLang: 'ru',
  translationDisplay: 'below',
  customPresets: [],
};

const ENUMS: Partial<Record<keyof Settings, readonly string[]>> = {
  theme: ['dark', 'light'],
  colorMode: ['gradient', 'solid', 'rgbflow', 'frequency'],
  gradientDirection: ['vertical', 'horizontal'],
  visualizerMode: ['bars', 'mirror', 'circle', 'wave', 'particles'],
  centerTextSource: ['custom', 'track', 'lyric'],
  centerTextFont: ['thin', 'bold', 'mono'],
  eqPreset: ['flat', 'bass', 'vocal', 'treble', 'party', 'custom'],
  repeatMode: ['off', 'all', 'one'],
  translationLang: ['ru', 'en'],
  translationDisplay: ['below', 'only', 'off'],
};

const RANGES: Partial<Record<keyof Settings, [number, number]>> = {
  neonGlow: [0, 100],
  barCount: [16, 256],
  barGap: [0, 20],
  cornerRadius: [0, 20],
  smoothing: [0, 0.95],
  sensitivity: [0.2, 3],
  centerTextSize: [16, 240],
  centerTextOpacity: [0, 1],
  centerTextGlow: [0, 100],
  centerTextWaveAmplitude: [0, 60],
  brandingSize: [10, 40],
  brandingOpacity: [0.1, 1],
  bassBoost: [-12, 12],
  volume: [0, 1],
  beatFlashIntensity: [0, 1],
  echoTime: [0.1, 0.8],
  echoFeedback: [0, 0.8],
  echoMix: [0, 1],
  reverbMix: [0, 1],
  eightDIntensity: [0, 1],
  playbackSpeed: [0.5, 2],
  crossfadeDuration: [0, 12],
};

const COLOR_KEYS: Array<keyof Settings> = ['primaryColor', 'secondaryColor'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Merges untrusted data into a base settings object, keeping only valid values. */
function mergeValid(base: Settings, raw: unknown, allowed?: ReadonlyArray<keyof Settings>): Settings {
  if (!isRecord(raw)) return base;
  const result: Record<string, unknown> = { ...base };
  (Object.keys(base) as Array<keyof Settings>).forEach((key) => {
    if (allowed && !allowed.includes(key)) return;
    const incoming = raw[key];
    const fallback = base[key];
    if (incoming === undefined) return;
    if (key === 'eqBands') {
      if (Array.isArray(incoming) && incoming.length === 10 && incoming.every((v) => typeof v === 'number')) {
        result[key] = (incoming as number[]).map((v) => clamp(v, -12, 12));
      }
      return;
    }
    if (key === 'customPresets') {
      if (Array.isArray(incoming)) {
        result[key] = incoming
          .map((item) => sanitizePreset(item))
          .filter((item): item is CustomPreset => item !== null);
      }
      return;
    }
    if (COLOR_KEYS.includes(key)) {
      const hex = typeof incoming === 'string' ? normalizeHex(incoming) : null;
      if (hex) result[key] = hex;
      return;
    }
    if (typeof incoming !== typeof fallback) return;
    const enumValues = ENUMS[key];
    if (enumValues) {
      if (typeof incoming === 'string' && enumValues.includes(incoming)) result[key] = incoming;
      return;
    }
    const range = RANGES[key];
    if (range && typeof incoming === 'number' && Number.isFinite(incoming)) {
      result[key] = clamp(incoming, range[0], range[1]);
      return;
    }
    if (typeof incoming === 'number' && !Number.isFinite(incoming)) return;
    result[key] = incoming;
  });
  return result as unknown as Settings;
}

const VISUAL_KEYS: Array<keyof VisualPresetData> = [
  'visualizerMode',
  'barCount',
  'barGap',
  'cornerRadius',
  'smoothing',
  'sensitivity',
  'reflection',
  'primaryColor',
  'secondaryColor',
  'colorMode',
  'gradientDirection',
  'neonGlow',
];

export function extractVisualPreset(settings: Settings): VisualPresetData {
  return {
    visualizerMode: settings.visualizerMode,
    barCount: settings.barCount,
    barGap: settings.barGap,
    cornerRadius: settings.cornerRadius,
    smoothing: settings.smoothing,
    sensitivity: settings.sensitivity,
    reflection: settings.reflection,
    primaryColor: settings.primaryColor,
    secondaryColor: settings.secondaryColor,
    colorMode: settings.colorMode,
    gradientDirection: settings.gradientDirection,
    neonGlow: settings.neonGlow,
  };
}

/** Validates preset data from a link or file. Returns a complete preset or null. */
export function sanitizeVisualPreset(raw: unknown): VisualPresetData | null {
  if (!isRecord(raw)) return null;
  const source = isRecord(raw.preset) ? raw.preset : raw;
  const hasAnyKey = VISUAL_KEYS.some((key) => source[key] !== undefined);
  if (!hasAnyKey) return null;
  const merged = mergeValid(DEFAULT_SETTINGS, source, VISUAL_KEYS);
  return extractVisualPreset(merged);
}

function sanitizePreset(raw: unknown): CustomPreset | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  const data = sanitizeVisualPreset(raw.data);
  if (!data) return null;
  return {
    id: raw.id,
    name: raw.name,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    data,
  };
}

function readHashPreset(): VisualPresetData | null {
  const hash = window.location.hash;
  const match = /^#preset=(.+)$/.exec(hash);
  if (!match) return null;
  return sanitizeVisualPreset(decodeShare(match[1]));
}

function buildInitialSettings(): { settings: Settings; fromHash: boolean } {
  const stored = mergeValid(DEFAULT_SETTINGS, loadJSON<unknown>(SETTINGS_KEY, null));
  const base: Settings = { ...stored, sleepTimerMinutes: 0, partyMode: false };
  const hashPreset = readHashPreset();
  if (hashPreset) return { settings: { ...base, ...hashPreset }, fromHash: true };
  return { settings: base, fromHash: false };
}

export interface UseSettingsResult {
  settings: Settings;
  update: SettingsUpdater;
  patch: (partial: Partial<Settings>) => void;
  reset: () => void;
  applyPreset: (data: Partial<VisualPresetData>) => void;
  addCustomPreset: (name: string) => boolean;
  removeCustomPreset: (id: string) => void;
  hashApplied: boolean;
}

export function useSettings(): UseSettingsResult {
  const [initial] = useState(buildInitialSettings);
  const [settings, setSettings] = useState<Settings>(initial.settings);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveJSON(SETTINGS_KEY, settings);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [settings]);

  const update = useCallback<SettingsUpdater>((key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const patch = useCallback((partial: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  const reset = useCallback(() => {
    removeKey(SETTINGS_KEY);
    setSettings({ ...DEFAULT_SETTINGS, eqBands: [...DEFAULT_SETTINGS.eqBands], customPresets: [] });
  }, []);

  const applyPreset = useCallback((data: Partial<VisualPresetData>) => {
    setSettings((prev) => ({ ...prev, ...data }));
  }, []);

  const addCustomPreset = useCallback((name: string): boolean => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const preset: CustomPreset = {
      id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed.slice(0, 40),
      createdAt: Date.now(),
      data: extractVisualPreset(settingsRef.current),
    };
    setSettings((prev) => ({ ...prev, customPresets: [...prev.customPresets, preset] }));
    return true;
  }, []);

  const removeCustomPreset = useCallback((id: string) => {
    setSettings((prev) => ({ ...prev, customPresets: prev.customPresets.filter((p) => p.id !== id) }));
  }, []);

  return {
    settings,
    update,
    patch,
    reset,
    applyPreset,
    addCustomPreset,
    removeCustomPreset,
    hashApplied: initial.fromHash,
  };
}
