export type Theme = 'dark' | 'light';
export type ColorMode = 'gradient' | 'solid' | 'rgbflow' | 'frequency';
export type GradientDirection = 'vertical' | 'horizontal';
export type VisualizerMode = 'bars' | 'mirror' | 'circle' | 'wave' | 'particles';
export type CenterTextSource = 'custom' | 'track' | 'lyric';
export type CenterTextFont = 'thin' | 'bold' | 'mono';
export type RepeatMode = 'off' | 'all' | 'one';
export type TranslationLang = 'ru' | 'en';
export type TranslationDisplay = 'below' | 'only' | 'off';
export type EqPresetId = 'flat' | 'bass' | 'vocal' | 'treble' | 'party' | 'custom';
export type ToastKind = 'info' | 'error' | 'success';

/** Snapshot of everything that defines the look of the visualizer. */
export interface VisualPresetData {
  visualizerMode: VisualizerMode;
  barCount: number;
  barGap: number;
  cornerRadius: number;
  smoothing: number;
  sensitivity: number;
  reflection: boolean;
  primaryColor: string;
  secondaryColor: string;
  colorMode: ColorMode;
  gradientDirection: GradientDirection;
  neonGlow: number;
}

export interface CustomPreset {
  id: string;
  name: string;
  createdAt: number;
  data: VisualPresetData;
}

export interface Settings extends VisualPresetData {
  theme: Theme;
  centerText: string;
  centerTextVisible: boolean;
  centerTextSource: CenterTextSource;
  centerTextFont: CenterTextFont;
  centerTextSize: number;
  centerTextOpacity: number;
  centerTextGlow: number;
  centerTextWaveAmplitude: number;
  brandingText: string;
  brandingVisible: boolean;
  brandingSize: number;
  brandingOpacity: number;
  bassBoost: number;
  volume: number;
  showLyrics: boolean;
  autoPalette: boolean;
  beatReaction: boolean;
  beatFlashIntensity: number;
  partyMode: boolean;
  eqBands: number[];
  eqPreset: EqPresetId;
  echoEnabled: boolean;
  echoTime: number;
  echoFeedback: number;
  echoMix: number;
  reverbEnabled: boolean;
  reverbMix: number;
  eightDEnabled: boolean;
  eightDIntensity: number;
  playbackSpeed: number;
  crossfadeDuration: number;
  sleepTimerMinutes: number;
  shuffle: boolean;
  repeatMode: RepeatMode;
  hideTrackName: boolean;
  karaokeWordHighlight: boolean;
  translationLang: TranslationLang;
  translationDisplay: TranslationDisplay;
  customPresets: CustomPreset[];
}

export type SettingsUpdater = <K extends keyof Settings>(key: K, value: Settings[K]) => void;

export interface Track {
  /** Unique instance id (used as React key). */
  uid: string;
  /** Content hash used for favorites and history. */
  id: string;
  file: File;
  url: string;
  fileName: string;
  title: string;
  artist: string;
  album: string;
  coverUrl: string | null;
  thumbUrl: string | null;
  duration: number;
}

export interface HistoryEntry {
  trackId: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  playedAt: number;
  listenedSeconds: number;
}

export interface LyricWord {
  time: number;
  text: string;
}

export interface LyricLine {
  id: string;
  time: number | null;
  text: string;
  words: LyricWord[] | null;
}

export interface ParsedLyrics {
  lines: LyricLine[];
  synced: boolean;
}

export interface WordTiming {
  text: string;
  start: number;
  end: number;
}

export interface AudioLevels {
  bass: number;
  mids: number;
  highs: number;
  lastBeatAt: number;
  beatCount: number;
}

export interface CaptureState {
  canvas: HTMLCanvasElement | null;
  users: number;
}

export interface ColorPreset {
  id: string;
  name: string;
  primary: string;
  secondary: string;
}

export interface ToastMessage {
  id: number;
  text: string;
  kind: ToastKind;
}

export interface TrackInfoForSearch {
  title: string;
  artist: string;
  album: string;
  duration: number;
}
