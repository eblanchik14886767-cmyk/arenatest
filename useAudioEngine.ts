import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { CaptureState, Settings, ToastKind, Track } from '../types';
import {
  EQ_FREQUENCIES,
  isAudioCandidate,
  createImpulseResponse,
  downloadBlob,
  getAudioContextCtor,
  readTrackMeta,
  revokeTrackUrls,
} from '../utils/audio';
import { clamp, HIDDEN_TEXT } from '../utils/format';

interface AudioGraph {
  ctx: AudioContext;
  bass: BiquadFilterNode;
  eq: BiquadFilterNode[];
  echoDelay: DelayNode;
  echoFeedback: GainNode;
  echoWet: GainNode;
  reverbWet: GainNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  analyser: AnalyserNode;
  master: GainNode;
  recordDest: MediaStreamAudioDestinationNode;
  nodes: AudioNode[];
}

interface FadeIn {
  start: number;
  duration: number;
}

interface UseAudioEngineArgs {
  settings: Settings;
  patchSettings: (partial: Partial<Settings>) => void;
  notify: (text: string, kind?: ToastKind) => void;
  onListened: (track: Track, seconds: number) => void;
}

export interface UseAudioEngineResult {
  audioRef: RefObject<HTMLAudioElement | null>;
  analyserRef: RefObject<AnalyserNode | null>;
  playlist: Track[];
  currentIndex: number;
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  muted: boolean;
  micActive: boolean;
  loopA: number | null;
  loopB: number | null;
  sleepRemaining: number;
  isRecording: boolean;
  recordSeconds: number;
  getCurrentTime: () => number;
  addFiles: (files: File[]) => Promise<void>;
  playIndex: (index: number) => void;
  playTrackById: (trackId: string) => boolean;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  seekBy: (delta: number) => void;
  setVolume: (value: number) => void;
  changeVolumeBy: (delta: number) => void;
  toggleMute: () => void;
  toggleMic: () => void;
  setLoopA: () => void;
  setLoopB: () => void;
  clearLoop: () => void;
  reorder: (from: number, to: number) => void;
  removeTrack: (uid: string) => void;
  clearPlaylist: () => void;
  startRecording: (capture: CaptureState) => void;
  stopRecording: () => void;
}

function pickRecorderMime(): string {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function analyserFftSize(barCount: number): number {
  if (barCount <= 64) return 1024;
  if (barCount <= 128) return 2048;
  return 4096;
}

export function useAudioEngine({ settings, patchSettings, notify, onListened }: UseAudioEngineArgs): UseAudioEngineResult {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const graphRef = useRef<AudioGraph | null>(null);

  const [playlist, setPlaylistState] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndexState] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMutedState] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [loopA, setLoopAState] = useState<number | null>(null);
  const [loopB, setLoopBState] = useState<number | null>(null);
  const [sleepRemaining, setSleepRemaining] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const playlistRef = useRef<Track[]>([]);
  const indexRef = useRef(-1);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const patchRef = useRef(patchSettings);
  patchRef.current = patchSettings;
  const onListenedRef = useRef(onListened);
  onListenedRef.current = onListened;

  const mutedRef = useRef(false);
  const micActiveRef = useRef(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const loopARef = useRef<number | null>(null);
  const loopBRef = useRef<number | null>(null);
  const fadeInRef = useRef<FadeIn | null>(null);
  const fadeFactorRef = useRef(1);
  const sleepEndRef = useRef<number | null>(null);
  const listenedRef = useRef(0);
  const lastTimeRef = useRef(0);
  const shufflePlayedRef = useRef<Set<string>>(new Set());
  const playStackRef = useRef<string[]>([]);
  const autoAdvancedRef = useRef<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordTimerRef = useRef<number | null>(null);

  // ---- Playlist state helpers -------------------------------------------------

  const commitPlaylist = (list: Track[], index: number) => {
    playlistRef.current = list;
    indexRef.current = index;
    setPlaylistState(list);
    setCurrentIndexState(index);
  };

  // ---- Audio graph -------------------------------------------------------------

  const applyVolume = () => {
    const graph = graphRef.current;
    if (!graph) return;
    const base = micActiveRef.current || mutedRef.current ? 0 : settingsRef.current.volume;
    graph.master.gain.setTargetAtTime(base * fadeFactorRef.current, graph.ctx.currentTime, 0.03);
  };

  const applyGraphSettings = () => {
    const graph = graphRef.current;
    if (!graph) return;
    const s = settingsRef.current;
    const t = graph.ctx.currentTime;
    graph.bass.gain.setTargetAtTime(s.bassBoost, t, 0.02);
    graph.eq.forEach((filter, index) => {
      filter.gain.setTargetAtTime(s.eqBands[index] ?? 0, t, 0.02);
    });
    graph.echoDelay.delayTime.setTargetAtTime(s.echoTime, t, 0.02);
    graph.echoFeedback.gain.setTargetAtTime(s.echoEnabled ? s.echoFeedback : 0, t, 0.02);
    graph.echoWet.gain.setTargetAtTime(s.echoEnabled ? s.echoMix : 0, t, 0.02);
    graph.reverbWet.gain.setTargetAtTime(s.reverbEnabled ? s.reverbMix * 1.5 : 0, t, 0.02);
    graph.lfoGain.gain.setTargetAtTime(s.eightDEnabled ? s.eightDIntensity : 0, t, 0.05);
    graph.analyser.smoothingTimeConstant = s.smoothing;
    const fft = analyserFftSize(s.barCount);
    if (graph.analyser.fftSize !== fft) graph.analyser.fftSize = fft;
  };

  const ensureGraph = (): AudioGraph | null => {
    const existing = graphRef.current;
    if (existing) {
      if (existing.ctx.state === 'suspended') existing.ctx.resume().catch(() => undefined);
      return existing;
    }
    const audio = audioRef.current;
    const Ctor = getAudioContextCtor();
    if (!audio || !Ctor) {
      notifyRef.current('Web Audio API не поддерживается в этом браузере', 'error');
      return null;
    }
    try {
      const ctx = new Ctor();
      const nodes: AudioNode[] = [];
      const track = <T extends AudioNode>(node: T): T => {
        nodes.push(node);
        return node;
      };

      const source = track(ctx.createMediaElementSource(audio));
      const bass = track(ctx.createBiquadFilter());
      bass.type = 'lowshelf';
      bass.frequency.value = 120;

      const eq = EQ_FREQUENCIES.map((frequency, index) => {
        const filter = track(ctx.createBiquadFilter());
        filter.type = index === 0 ? 'lowshelf' : index === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking';
        filter.frequency.value = frequency;
        filter.Q.value = 1.1;
        return filter;
      });

      source.connect(bass);
      let previous: AudioNode = bass;
      eq.forEach((filter) => {
        previous.connect(filter);
        previous = filter;
      });

      const effectsIn = track(ctx.createGain());
      previous.connect(effectsIn);
      const mix = track(ctx.createGain());

      const dry = track(ctx.createGain());
      effectsIn.connect(dry);
      dry.connect(mix);

      const echoDelay = track(ctx.createDelay(1));
      const echoFeedback = track(ctx.createGain());
      const echoWet = track(ctx.createGain());
      echoFeedback.gain.value = 0;
      echoWet.gain.value = 0;
      effectsIn.connect(echoDelay);
      echoDelay.connect(echoWet);
      echoWet.connect(mix);
      echoDelay.connect(echoFeedback);
      echoFeedback.connect(echoDelay);

      const convolver = track(ctx.createConvolver());
      convolver.buffer = createImpulseResponse(ctx, 2, 2.5);
      const reverbWet = track(ctx.createGain());
      reverbWet.gain.value = 0;
      effectsIn.connect(convolver);
      convolver.connect(reverbWet);
      reverbWet.connect(mix);

      const panner = track(ctx.createStereoPanner());
      mix.connect(panner);
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.1;
      const lfoGain = track(ctx.createGain());
      lfoGain.gain.value = 0;
      lfo.connect(lfoGain);
      lfoGain.connect(panner.pan);
      lfo.start();

      const analyser = track(ctx.createAnalyser());
      analyser.minDecibels = -90;
      analyser.maxDecibels = -20;
      panner.connect(analyser);
      const master = track(ctx.createGain());
      analyser.connect(master);
      master.connect(ctx.destination);
      const recordDest = ctx.createMediaStreamDestination();
      analyser.connect(recordDest);

      const graph: AudioGraph = {
        ctx,
        bass,
        eq,
        echoDelay,
        echoFeedback,
        echoWet,
        reverbWet,
        lfo,
        lfoGain,
        analyser,
        master,
        recordDest,
        nodes,
      };
      graphRef.current = graph;
      analyserRef.current = analyser;
      applyGraphSettings();
      applyVolume();
      if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
      return graph;
    } catch {
      notifyRef.current('Не удалось запустить аудиодвижок', 'error');
      return null;
    }
  };

  // ---- Listening statistics ----------------------------------------------------

  const finalizeListened = () => {
    const track = playlistRef.current[indexRef.current];
    const seconds = listenedRef.current;
    listenedRef.current = 0;
    if (track && seconds > 10) onListenedRef.current(track, seconds);
  };

  // ---- Microphone --------------------------------------------------------------

  const stopMic = () => {
    if (micSourceRef.current) {
      micSourceRef.current.disconnect();
      micSourceRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (micActiveRef.current) {
      micActiveRef.current = false;
      setMicActive(false);
      applyVolume();
    }
  };

  const startMic = async () => {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      notifyRef.current('Микрофон не поддерживается в этом браузере', 'error');
      return;
    }
    const graph = ensureGraph();
    if (!graph) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      audioRef.current?.pause();
      stopMic();
      const source = graph.ctx.createMediaStreamSource(stream);
      source.connect(graph.analyser);
      micStreamRef.current = stream;
      micSourceRef.current = source;
      micActiveRef.current = true;
      setMicActive(true);
      applyVolume();
      notifyRef.current('Микрофон включён', 'info');
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        notifyRef.current('Доступ к микрофону запрещён. Разрешите его в настройках браузера', 'error');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        notifyRef.current('Микрофон не найден', 'error');
      } else {
        notifyRef.current('Не удалось включить микрофон', 'error');
      }
    }
  };

  const toggleMic = () => {
    if (micActiveRef.current) {
      stopMic();
      notifyRef.current('Микрофон выключен', 'info');
    } else {
      void startMic();
    }
  };

  // ---- Playback ----------------------------------------------------------------

  const resetLoop = () => {
    loopARef.current = null;
    loopBRef.current = null;
    setLoopAState(null);
    setLoopBState(null);
  };

  const playIndex = (index: number, options?: { fadeIn?: boolean; fromPrevious?: boolean }) => {
    const audio = audioRef.current;
    const list = playlistRef.current;
    const track = list[index];
    if (!audio || !track) return;
    finalizeListened();
    stopMic();

    const previousTrack = list[indexRef.current];
    if (previousTrack && !options?.fromPrevious && previousTrack.uid !== track.uid) {
      playStackRef.current.push(previousTrack.uid);
      if (playStackRef.current.length > 200) playStackRef.current.shift();
    }
    indexRef.current = index;
    setCurrentIndexState(index);
    resetLoop();
    shufflePlayedRef.current.add(track.id);
    autoAdvancedRef.current = null;
    const crossfade = settingsRef.current.crossfadeDuration;
    fadeInRef.current = options?.fadeIn && crossfade > 0 ? { start: performance.now(), duration: crossfade * 1000 } : null;
    fadeFactorRef.current = fadeInRef.current ? 0 : fadeFactorRef.current;
    lastTimeRef.current = 0;
    setCurrentTime(0);
    setDuration(track.duration);

    audio.src = track.url;
    audio.defaultPlaybackRate = settingsRef.current.playbackSpeed;
    audio.playbackRate = settingsRef.current.playbackSpeed;
    ensureGraph();
    applyVolume();
    audio.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      notifyRef.current('Не удалось воспроизвести файл', 'error');
    });
  };

  const pickNext = (auto: boolean): number | null => {
    const list = playlistRef.current;
    const current = indexRef.current;
    const s = settingsRef.current;
    if (list.length === 0) return null;
    if (auto && s.repeatMode === 'one') return current >= 0 ? current : 0;
    if (s.shuffle) {
      if (list.length === 1) return auto && s.repeatMode !== 'all' ? null : 0;
      const all = list.map((_, i) => i).filter((i) => i !== current);
      let candidates = all.filter((i) => !shufflePlayedRef.current.has(list[i].id));
      if (candidates.length === 0) {
        if (auto && s.repeatMode !== 'all') return null;
        shufflePlayedRef.current = new Set(current >= 0 ? [list[current].id] : []);
        candidates = all;
      }
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    const nextIndex = current + 1;
    if (nextIndex < list.length) return nextIndex;
    if (s.repeatMode === 'all' || !auto) return 0;
    return null;
  };

  const handleEnded = () => {
    finalizeListened();
    const index = pickNext(true);
    if (index === null) {
      setIsPlaying(false);
      return;
    }
    playIndex(index, { fadeIn: true });
  };

  const next = () => {
    if (playlistRef.current.length === 0) {
      notifyRef.current('Плейлист пуст. Загрузите музыку', 'info');
      return;
    }
    const index = pickNext(false);
    if (index !== null) playIndex(index);
  };

  const previous = () => {
    const audio = audioRef.current;
    const list = playlistRef.current;
    if (list.length === 0) {
      notifyRef.current('Плейлист пуст. Загрузите музыку', 'info');
      return;
    }
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    if (settingsRef.current.shuffle) {
      while (playStackRef.current.length > 0) {
        const uid = playStackRef.current.pop();
        const index = list.findIndex((track) => track.uid === uid);
        if (index >= 0) {
          playIndex(index, { fromPrevious: true });
          return;
        }
      }
    }
    const current = indexRef.current;
    const index = current - 1 >= 0 ? current - 1 : settingsRef.current.repeatMode === 'all' ? list.length - 1 : 0;
    playIndex(index, { fromPrevious: true });
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (micActiveRef.current) {
      stopMic();
      if (playlistRef.current.length > 0 && indexRef.current >= 0) {
        ensureGraph();
        audio.play().catch(() => undefined);
      }
      return;
    }
    if (indexRef.current < 0) {
      if (playlistRef.current.length > 0) playIndex(0);
      else notifyRef.current('Плейлист пуст. Загрузите музыку', 'info');
      return;
    }
    if (audio.paused) {
      ensureGraph();
      audio.play().catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        notifyRef.current('Не удалось воспроизвести файл', 'error');
      });
    } else {
      audio.pause();
    }
  };

  const seek = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio || indexRef.current < 0) return;
    const total = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    audio.currentTime = clamp(seconds, 0, total);
    lastTimeRef.current = audio.currentTime;
    setCurrentTime(audio.currentTime);
  };

  const seekBy = (delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    seek(audio.currentTime + delta);
  };

  const setVolume = (value: number) => {
    const volume = clamp(value, 0, 1);
    patchRef.current({ volume });
    if (volume > 0 && mutedRef.current) {
      mutedRef.current = false;
      setMutedState(false);
    }
  };

  const changeVolumeBy = (delta: number) => {
    setVolume(settingsRef.current.volume + delta);
  };

  const toggleMute = () => {
    mutedRef.current = !mutedRef.current;
    setMutedState(mutedRef.current);
    applyVolume();
  };

  // ---- AB loop -----------------------------------------------------------------

  const setLoopA = () => {
    const audio = audioRef.current;
    if (!audio || indexRef.current < 0) {
      notifyRef.current('Сначала включите трек', 'info');
      return;
    }
    const time = audio.currentTime;
    loopARef.current = time;
    setLoopAState(time);
    if (loopBRef.current !== null && loopBRef.current <= time) {
      loopBRef.current = null;
      setLoopBState(null);
    }
  };

  const setLoopB = () => {
    const audio = audioRef.current;
    if (!audio || indexRef.current < 0) {
      notifyRef.current('Сначала включите трек', 'info');
      return;
    }
    const time = audio.currentTime;
    const start = loopARef.current ?? 0;
    if (time - start < 0.5) {
      notifyRef.current('Точка B должна быть позже точки A', 'error');
      return;
    }
    if (loopARef.current === null) {
      loopARef.current = 0;
      setLoopAState(0);
    }
    loopBRef.current = time;
    setLoopBState(time);
  };

  const clearLoop = () => resetLoop();

  // ---- Playlist management -----------------------------------------------------

  const addFiles = async (files: File[]) => {
    const valid = files.filter((file) => isAudioCandidate(file));
    if (valid.length === 0) {
      notifyRef.current(files.length ? 'Выбранный файл не является аудиофайлом' : 'Файлы не выбраны', 'error');
      return;
    }
    const skipped = files.length - valid.length;
    const loaded = await Promise.all(valid.map((file) => readTrackMeta(file)));
    const previousLength = playlistRef.current.length;
    const wasEmpty = indexRef.current < 0;
    commitPlaylist([...playlistRef.current, ...loaded], indexRef.current);
    if (wasEmpty) playIndex(previousLength);
    if (skipped > 0) notifyRef.current(`Пропущено файлов неподдерживаемого формата: ${skipped}`, 'error');
    else if (!wasEmpty) notifyRef.current(`Добавлено в плейлист: ${loaded.length}`, 'success');
  };

  const playTrackById = (trackId: string): boolean => {
    const index = playlistRef.current.findIndex((track) => track.id === trackId);
    if (index < 0) return false;
    playIndex(index);
    return true;
  };

  const reorder = (from: number, to: number) => {
    const list = [...playlistRef.current];
    if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return;
    const currentUid = list[indexRef.current]?.uid;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    const newIndex = currentUid ? list.findIndex((track) => track.uid === currentUid) : -1;
    commitPlaylist(list, newIndex);
  };

  const unloadCurrent = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    listenedRef.current = 0;
    resetLoop();
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  };

  const removeTrack = (uid: string) => {
    const list = playlistRef.current;
    const index = list.findIndex((track) => track.uid === uid);
    if (index < 0) return;
    const removed = list[index];
    const isCurrent = index === indexRef.current;
    if (isCurrent) {
      finalizeListened();
      unloadCurrent();
    }
    const nextList = list.filter((track) => track.uid !== uid);
    let nextIndex = indexRef.current;
    if (isCurrent) nextIndex = -1;
    else if (index < indexRef.current) nextIndex -= 1;
    commitPlaylist(nextList, nextIndex);
    revokeTrackUrls(removed);
  };

  const clearPlaylist = () => {
    if (playlistRef.current.length === 0) {
      notifyRef.current('Плейлист уже пуст', 'info');
      return;
    }
    finalizeListened();
    unloadCurrent();
    const old = playlistRef.current;
    commitPlaylist([], -1);
    shufflePlayedRef.current = new Set();
    playStackRef.current = [];
    old.forEach(revokeTrackUrls);
    notifyRef.current('Плейлист очищен', 'info');
  };

  // ---- Recording ---------------------------------------------------------------

  const stopRecordTimer = () => {
    if (recordTimerRef.current !== null) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  };

  const startRecording = (capture: CaptureState) => {
    if (recorderRef.current) return;
    if (typeof MediaRecorder === 'undefined' || !capture.canvas || typeof capture.canvas.captureStream !== 'function') {
      notifyRef.current('Запись видео не поддерживается в этом браузере', 'error');
      return;
    }
    const graph = ensureGraph();
    if (!graph) return;
    let counted = false;
    try {
      capture.users += 1;
      counted = true;
      const videoStream = capture.canvas.captureStream(60);
      const stream = new MediaStream([...videoStream.getVideoTracks(), ...graph.recordDest.stream.getAudioTracks()]);
      const mimeType = pickRecorderMime();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType, videoBitsPerSecond: 8_000_000 } : { videoBitsPerSecond: 8_000_000 },
      );
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        notifyRef.current('Ошибка записи видео', 'error');
        if (recorder.state !== 'inactive') recorder.stop();
      };
      recorder.onstop = () => {
        stopRecordTimer();
        capture.users = Math.max(0, capture.users - 1);
        videoStream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        setIsRecording(false);
        if (chunks.length > 0) {
          downloadBlob(new Blob(chunks, { type: 'video/webm' }), 'equalizer.webm');
          notifyRef.current('Запись сохранена: equalizer.webm', 'success');
        }
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      setIsRecording(true);
      setRecordSeconds(0);
      stopRecordTimer();
      recordTimerRef.current = window.setInterval(() => setRecordSeconds((value) => value + 1), 1000);
    } catch {
      if (counted) capture.users = Math.max(0, capture.users - 1);
      notifyRef.current('Не удалось начать запись видео', 'error');
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  };

  // ---- Latest handlers for long-lived listeners --------------------------------

  const latest = useRef({
    handleEnded,
    applyVolume,
    next,
    previous,
    togglePlay,
    seek,
    seekBy,
    finalizeListened,
  });
  latest.current = { handleEnded, applyVolume, next, previous, togglePlay, seek, seekBy, finalizeListened };

  // ---- Effects -----------------------------------------------------------------

  // Audio element, its events and the 60ms logic ticker.
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audioRef.current = audio;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => latest.current.handleEnded();
    const onDuration = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onTimeUpdate = () => {
      const time = audio.currentTime;
      const delta = time - lastTimeRef.current;
      if (delta > 0 && delta < 1.5) listenedRef.current += delta;
      lastTimeRef.current = time;
      setCurrentTime(time);
      if ('mediaSession' in navigator && Number.isFinite(audio.duration) && audio.duration > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate,
            position: Math.min(time, audio.duration),
          });
        } catch {
          // Position state is optional.
        }
      }
    };
    const onError = () => {
      if (!audio.getAttribute('src')) return;
      setIsPlaying(false);
      notifyRef.current('Не удалось воспроизвести файл: формат не поддерживается или файл повреждён', 'error');
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('durationchange', onDuration);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('error', onError);

    const ticker = window.setInterval(() => {
      const s = settingsRef.current;
      const loopStart = loopARef.current;
      const loopEnd = loopBRef.current;
      if (loopEnd !== null && !audio.paused && audio.currentTime >= loopEnd) {
        audio.currentTime = loopStart ?? 0;
      }

      let factor = 1;
      const fade = fadeInRef.current;
      if (fade) {
        const progress = (performance.now() - fade.start) / fade.duration;
        if (progress >= 1) fadeInRef.current = null;
        else factor = Math.min(factor, Math.max(0, progress));
      }

      const total = audio.duration;
      const track = playlistRef.current[indexRef.current];
      if (s.crossfadeDuration > 0 && track && loopEnd === null && Number.isFinite(total) && !audio.paused) {
        const remaining = (total - audio.currentTime) / Math.max(0.25, audio.playbackRate);
        if (remaining < s.crossfadeDuration && total > s.crossfadeDuration) {
          factor = Math.min(factor, Math.max(0, remaining / s.crossfadeDuration));
          if (remaining < 0.12 && autoAdvancedRef.current !== track.uid) {
            autoAdvancedRef.current = track.uid;
            latest.current.handleEnded();
          }
        }
      }

      if (sleepEndRef.current !== null) {
        const remainingSleep = (sleepEndRef.current - Date.now()) / 1000;
        if (remainingSleep <= 0) {
          sleepEndRef.current = null;
          audio.pause();
          patchRef.current({ sleepTimerMinutes: 0 });
          setSleepRemaining(0);
          notifyRef.current('Таймер сна: воспроизведение остановлено', 'info');
        } else {
          if (remainingSleep < 30) factor = Math.min(factor, remainingSleep / 30);
          const whole = Math.ceil(remainingSleep);
          setSleepRemaining((prev) => (prev === whole ? prev : whole));
        }
      }

      if (Math.abs(factor - fadeFactorRef.current) > 0.004) {
        fadeFactorRef.current = factor;
        latest.current.applyVolume();
      }
    }, 60);

    return () => {
      window.clearInterval(ticker);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('durationchange', onDuration);
      audio.removeEventListener('loadedmetadata', onDuration);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('error', onError);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;

      const recorder = recorderRef.current;
      if (recorder) {
        recorder.onstop = null;
        if (recorder.state !== 'inactive') recorder.stop();
        recorderRef.current = null;
      }
      if (recordTimerRef.current !== null) window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;

      if (micSourceRef.current) micSourceRef.current.disconnect();
      if (micStreamRef.current) micStreamRef.current.getTracks().forEach((track) => track.stop());
      micSourceRef.current = null;
      micStreamRef.current = null;

      const graph = graphRef.current;
      if (graph) {
        try {
          graph.lfo.stop();
        } catch {
          // Oscillator may already be stopped.
        }
        graph.lfo.disconnect();
        graph.nodes.forEach((node) => node.disconnect());
        graph.recordDest.disconnect();
        graph.ctx.close().catch(() => undefined);
      }
      graphRef.current = null;
      analyserRef.current = null;

      playlistRef.current.forEach(revokeTrackUrls);
      playlistRef.current = [];
      indexRef.current = -1;
    };
  }, []);

  // Sound settings -> audio graph.
  useEffect(() => {
    applyGraphSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.bassBoost,
    settings.eqBands,
    settings.echoEnabled,
    settings.echoTime,
    settings.echoFeedback,
    settings.echoMix,
    settings.reverbEnabled,
    settings.reverbMix,
    settings.eightDEnabled,
    settings.eightDIntensity,
    settings.smoothing,
    settings.barCount,
  ]);

  useEffect(() => {
    applyVolume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.volume, muted, micActive]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.defaultPlaybackRate = settings.playbackSpeed;
    audio.playbackRate = settings.playbackSpeed;
  }, [settings.playbackSpeed]);

  // Sleep timer countdown start / cancel.
  useEffect(() => {
    if (settings.sleepTimerMinutes > 0) {
      sleepEndRef.current = Date.now() + settings.sleepTimerMinutes * 60000;
      setSleepRemaining(settings.sleepTimerMinutes * 60);
    } else {
      sleepEndRef.current = null;
      setSleepRemaining(0);
    }
  }, [settings.sleepTimerMinutes]);

  // Shuffle history resets when shuffle is toggled.
  useEffect(() => {
    const track = playlistRef.current[indexRef.current];
    shufflePlayedRef.current = new Set(track ? [track.id] : []);
  }, [settings.shuffle]);

  const currentTrack: Track | null = currentIndex >= 0 ? (playlist[currentIndex] ?? null) : null;

  // Media Session metadata.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!currentTrack) {
      navigator.mediaSession.metadata = null;
      return;
    }
    const hide = settings.hideTrackName;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: hide ? HIDDEN_TEXT : currentTrack.title,
        artist: hide ? '' : currentTrack.artist,
        album: hide ? '' : currentTrack.album,
        artwork: !hide && currentTrack.coverUrl ? [{ src: currentTrack.coverUrl, sizes: '512x512' }] : [],
      });
    } catch {
      navigator.mediaSession.metadata = null;
    }
  }, [currentTrack, settings.hideTrackName]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : currentTrack ? 'paused' : 'none';
  }, [isPlaying, currentTrack]);

  // Media Session action handlers.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return undefined;
    const session = navigator.mediaSession;
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Some browsers do not support every action.
      }
    };
    set('play', () => {
      const audio = audioRef.current;
      if (audio && audio.paused) latest.current.togglePlay();
    });
    set('pause', () => {
      const audio = audioRef.current;
      if (audio && !audio.paused) latest.current.togglePlay();
    });
    set('previoustrack', () => latest.current.previous());
    set('nexttrack', () => latest.current.next());
    set('seekto', (details) => {
      if (typeof details.seekTime === 'number') latest.current.seek(details.seekTime);
    });
    set('seekbackward', (details) => latest.current.seekBy(-(details.seekOffset ?? 10)));
    set('seekforward', (details) => latest.current.seekBy(details.seekOffset ?? 10));
    return () => {
      set('play', null);
      set('pause', null);
      set('previoustrack', null);
      set('nexttrack', null);
      set('seekto', null);
      set('seekbackward', null);
      set('seekforward', null);
    };
  }, []);

  return {
    audioRef,
    analyserRef,
    playlist,
    currentIndex,
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    muted,
    micActive,
    loopA,
    loopB,
    sleepRemaining,
    isRecording,
    recordSeconds,
    getCurrentTime: () => audioRef.current?.currentTime ?? 0,
    addFiles,
    playIndex: (index: number) => playIndex(index),
    playTrackById,
    togglePlay,
    next,
    previous,
    seek,
    seekBy,
    setVolume,
    changeVolumeBy,
    toggleMute,
    toggleMic,
    setLoopA,
    setLoopB,
    clearLoop,
    reorder,
    removeTrack,
    clearPlaylist,
    startRecording,
    stopRecording,
  };
}
