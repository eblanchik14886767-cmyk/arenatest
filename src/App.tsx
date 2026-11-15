import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { Eye, Square } from 'lucide-react';
import type { CaptureState, ColorPreset, CustomPreset, EqPresetId, ToastKind, ToastMessage } from './types';
import { Branding } from './components/Branding';
import { CenterText } from './components/CenterText';
import { EmptyState } from './components/EmptyState';
import { LyricsPanel } from './components/LyricsPanel';
import { PlayerControls } from './components/PlayerControls';
import { Playlist } from './components/Playlist';
import { SettingsButton } from './components/SettingsButton';
import { SettingsPanel } from './components/SettingsPanel';
import { VisualizerCanvas } from './components/VisualizerCanvas';
import { useAudioEngine } from './hooks/useAudioEngine';
import { useBeatDetection } from './hooks/useBeatDetection';
import { useLibrary } from './hooks/useLibrary';
import { useLyrics } from './hooks/useLyrics';
import { usePictureInPicture } from './hooks/usePictureInPicture';
import { extractVisualPreset, sanitizeVisualPreset, useSettings } from './hooks/useSettings';
import { classifyFile, downloadBlob, hasVideoTrack } from './utils/audio';
import { randomPresetColors } from './utils/color';
import { formatTime, HIDDEN_TEXT } from './utils/format';
import { decodeLyricsBuffer } from './utils/lrcParser';
import { extractPalette } from './utils/palette';
import { copyToClipboard, encodeShare } from './utils/storage';

const AUDIO_ACCEPT = '.mp3,.wav,.ogg,.m4a,.flac,.webm,audio/*';
const LYRICS_ACCEPT = '.lrc,.txt';
const VIDEO_ACCEPT = '.mp4,.webm,video/mp4,video/webm';
const PRESET_ACCEPT = '.json,application/json';

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

export default function App() {
  const { settings, update, patch, reset, applyPreset, addCustomPreset, removeCustomPreset, hashApplied } = useSettings();

  // ---- Toasts ----------------------------------------------------------------------
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const notify = useCallback((text: string, kind: ToastKind = 'info') => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), text, kind });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3800);
  }, []);
  useEffect(
    () => () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    },
    [],
  );

  // ---- Core hooks ------------------------------------------------------------------
  const library = useLibrary();
  const engine = useAudioEngine({ settings, patchSettings: patch, notify, onListened: library.addHistory });
  const levelsRef = useBeatDetection(engine.analyserRef, settings.beatReaction || settings.partyMode);
  const captureRef = useRef<CaptureState>({ canvas: null, users: 0 });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pip = usePictureInPicture(captureRef, notify);
  const currentTrack = engine.currentTrack;
  const lyrics = useLyrics({
    getTime: engine.getCurrentTime,
    duration: engine.duration,
    trackKey: currentTrack?.uid ?? null,
    translationLang: settings.translationLang,
    notify,
  });

  // ---- UI state --------------------------------------------------------------------
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [noUi, setNoUi] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [showRestore, setShowRestore] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const videoUrlRef = useRef<string | null>(null);
  const hoverRef = useRef(false);
  const hideTimerRef = useRef<number | null>(null);
  const restoreTimerRef = useRef<number | null>(null);
  const partyRef = useRef(settings.partyMode);
  partyRef.current = settings.partyMode;
  const partyFullscreenRef = useRef(false);

  const musicInputRef = useRef<HTMLInputElement | null>(null);
  const lyricsInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const presetInputRef = useRef<HTMLInputElement | null>(null);

  // ---- Auto-hide of the controls -----------------------------------------------------
  const wake = useCallback(() => {
    setUiVisible(true);
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      if (!hoverRef.current) setUiVisible(false);
    }, partyRef.current ? 1500 : 3000);
  }, []);

  const handleHoverChange = useCallback(
    (hovered: boolean) => {
      hoverRef.current = hovered;
      if (!hovered) wake();
    },
    [wake],
  );

  // ---- Video background ----------------------------------------------------------------
  const applyVideo = (file: File) => {
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    const url = URL.createObjectURL(file);
    videoUrlRef.current = url;
    setVideoUrl(url);
    notify('Видео-фон загружен', 'success');
  };

  const removeVideo = () => {
    if (!videoUrlRef.current) {
      notify('Видео-фон не загружен', 'info');
      return;
    }
    URL.revokeObjectURL(videoUrlRef.current);
    videoUrlRef.current = null;
    setVideoUrl(null);
    notify('Видео-фон убран', 'info');
  };

  useEffect(
    () => () => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = null;
    },
    [],
  );

  // ---- Presets ---------------------------------------------------------------------------
  const importPresetFile = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const data = sanitizeVisualPreset(parsed);
      if (!data) {
        notify('Файл не похож на пресет эквалайзера', 'error');
        return;
      }
      applyPreset(data);
      notify('Пресет импортирован', 'success');
    } catch {
      notify('Не удалось прочитать файл пресета', 'error');
    }
  };

  const exportPreset = () => {
    const payload = { app: 'equalizer', version: 1, preset: extractVisualPreset(settings) };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), 'equalizer-preset.json');
    notify('Пресет экспортирован', 'success');
  };

  const applyColorPreset = (preset: ColorPreset) => {
    applyPreset({ primaryColor: preset.primary, secondaryColor: preset.secondary, colorMode: 'gradient' });
  };

  const applyRandomPreset = () => {
    const colors = randomPresetColors();
    applyPreset({ primaryColor: colors.primary, secondaryColor: colors.secondary, colorMode: 'gradient' });
  };

  const savePreset = (name: string): boolean => {
    const saved = addCustomPreset(name);
    if (saved) notify('Пресет сохранён', 'success');
    else notify('Введите название пресета', 'error');
    return saved;
  };

  const applyCustomPreset = (preset: CustomPreset) => {
    applyPreset(preset.data);
    notify(`Пресет «${preset.name}» применён`, 'success');
  };

  const shareCustomPreset = async (preset: CustomPreset) => {
    const url = `${window.location.origin}${window.location.pathname}#preset=${encodeShare(preset.data)}`;
    const copied = await copyToClipboard(url);
    notify(copied ? 'Ссылка на пресет скопирована' : 'Не удалось скопировать ссылку', copied ? 'success' : 'error');
  };

  const resetAll = () => {
    reset();
    notify('Настройки сброшены', 'info');
  };

  useEffect(() => {
    if (!hashApplied) return;
    notify('Пресет применён', 'success');
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }, [hashApplied, notify]);

  // ---- Files -------------------------------------------------------------------------------
  const handleFiles = async (files: File[], forceAudio = false) => {
    const audioFiles: File[] = [];
    let videoFile: File | null = null;
    let lyricsFile: File | null = null;
    let presetFile: File | null = null;
    for (const file of files) {
      let kind = classifyFile(file);
      if (kind === 'video' && file.name.toLowerCase().endsWith('.webm')) {
        kind = forceAudio || !(await hasVideoTrack(file)) ? 'audio' : 'video';
      }
      if (kind === 'audio') audioFiles.push(file);
      else if (kind === 'video' && !videoFile) videoFile = file;
      else if (kind === 'lyrics' && !lyricsFile) lyricsFile = file;
      else if (kind === 'preset' && !presetFile) presetFile = file;
    }

    if (audioFiles.length === 0 && !videoFile && !lyricsFile && !presetFile) {
      notify(files.length ? 'Неподдерживаемый формат файла' : 'Файлы не выбраны', 'error');
      return;
    }
    if (audioFiles.length > 0) {
      if (audioFiles.length > 1) setPlaylistOpen(true);
      void engine.addFiles(audioFiles);
    }
    if (videoFile) applyVideo(videoFile);
    if (presetFile) await importPresetFile(presetFile);
    if (lyricsFile) {
      const picked: File = lyricsFile;
      try {
        const text = decodeLyricsBuffer(await picked.arrayBuffer());
        lyrics.loadFromText(text, picked.name);
      } catch {
        notify('Не удалось прочитать файл с текстом', 'error');
      }
    }
  };

  const onInputChange = (handler: (files: File[]) => void) => (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length > 0) handler(files);
  };

  // ---- Fullscreen, party, no-UI --------------------------------------------------------------
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      notify('Не удалось переключить полноэкранный режим', 'error');
    }
  };

  const handlePartyChange = (enabled: boolean) => {
    update('partyMode', enabled);
    if (enabled) {
      if (!document.fullscreenElement) {
        document.documentElement
          .requestFullscreen()
          .then(() => {
            partyFullscreenRef.current = true;
          })
          .catch(() => undefined);
      }
      wake();
    } else if (partyFullscreenRef.current && document.fullscreenElement) {
      partyFullscreenRef.current = false;
      document.exitFullscreen().catch(() => undefined);
    }
  };

  const toggleNoUi = () => {
    setNoUi((value) => {
      if (!value) notify('Режим без UI включён. Нажмите H, чтобы вернуть интерфейс', 'info');
      return !value;
    });
    setSettingsOpen(false);
    setShowRestore(false);
  };

  const toggleRecording = () => {
    if (engine.isRecording) engine.stopRecording();
    else engine.startRecording(captureRef.current);
  };

  const cycleRepeat = () => {
    const order = ['off', 'all', 'one'] as const;
    const next = order[(order.indexOf(settings.repeatMode) + 1) % order.length];
    update('repeatMode', next);
  };

  const changeEq = (bands: number[], preset: EqPresetId) => patch({ eqBands: bands, eqPreset: preset });

  const searchLyrics = () => {
    void lyrics.searchOnline(
      currentTrack
        ? {
            title: currentTrack.title,
            artist: currentTrack.artist,
            album: currentTrack.album,
            duration: currentTrack.duration || engine.duration,
          }
        : null,
    );
  };

  const playFromHistory = (trackId: string) => {
    if (!engine.playTrackById(trackId)) notify('Этого трека нет в плейлисте. Загрузите файл снова', 'info');
  };

  // ---- Global listeners (kept fresh through a ref) ----------------------------------------------
  const latest = useRef({ handleFiles, toggleFullscreen, toggleNoUi, wake });
  latest.current = { handleFiles, toggleFullscreen, toggleNoUi, wake };
  const engineRef = useRef(engine);
  engineRef.current = engine;

  useEffect(() => {
    wake();
    let dragDepth = 0;

    const onKeyDown = (event: KeyboardEvent) => {
      latest.current.wake();
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const api = engineRef.current;
      switch (event.code) {
        case 'Space':
          if (tag === 'BUTTON') return;
          event.preventDefault();
          api.togglePlay();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          api.seekBy(-5);
          break;
        case 'ArrowRight':
          event.preventDefault();
          api.seekBy(5);
          break;
        case 'ArrowUp':
          event.preventDefault();
          api.changeVolumeBy(0.05);
          break;
        case 'ArrowDown':
          event.preventDefault();
          api.changeVolumeBy(-0.05);
          break;
        case 'KeyF':
          void latest.current.toggleFullscreen();
          break;
        case 'KeyH':
          latest.current.toggleNoUi();
          break;
        case 'KeyM':
          api.toggleMute();
          break;
        default:
          break;
      }
    };

    const onMouseMove = (event: MouseEvent) => {
      latest.current.wake();
      if (event.clientY > window.innerHeight - 90) {
        setShowRestore(true);
        if (restoreTimerRef.current !== null) window.clearTimeout(restoreTimerRef.current);
        restoreTimerRef.current = window.setTimeout(() => setShowRestore(false), 2500);
      }
    };

    const onPointerActivity = () => latest.current.wake();

    // Release focus after mouse use so hotkeys keep working on the whole window.
    const onClick = (event: MouseEvent) => {
      if (event.detail === 0) return;
      const button = (event.target as HTMLElement | null)?.closest('button');
      if (button) button.blur();
    };
    const onPointerUp = () => {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement && active.type === 'range') active.blur();
    };
    const onChange = (event: Event) => {
      if (event.target instanceof HTMLSelectElement) event.target.blur();
    };

    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth += 1;
      setDragActive(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setDragActive(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth = 0;
      setDragActive(false);
      const files = Array.from(event.dataTransfer?.files ?? []);
      void latest.current.handleFiles(files);
    };
    const onFullscreenChange = () => {
      setFullscreen(Boolean(document.fullscreenElement));
      if (!document.fullscreenElement) partyFullscreenRef.current = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onPointerActivity);
    window.addEventListener('touchstart', onPointerActivity, { passive: true });
    window.addEventListener('click', onClick);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('change', onChange, true);
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onPointerActivity);
      window.removeEventListener('touchstart', onPointerActivity);
      window.removeEventListener('click', onClick);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('change', onChange, true);
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
      if (restoreTimerRef.current !== null) window.clearTimeout(restoreTimerRef.current);
    };
  }, [wake]);

  // ---- Side effects ---------------------------------------------------------------------------------
  useEffect(() => {
    if (!settings.autoPalette || !currentTrack?.coverUrl) return undefined;
    let cancelled = false;
    extractPalette(currentTrack.coverUrl).then((palette) => {
      if (!cancelled && palette) patch({ primaryColor: palette[0], secondaryColor: palette[1] });
    });
    return () => {
      cancelled = true;
    };
  }, [settings.autoPalette, currentTrack?.coverUrl, patch]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    const idle = !uiVisible && !settingsOpen;
    document.body.classList.toggle('idle-cursor', idle);
    return () => document.body.classList.remove('idle-cursor');
  }, [uiVisible, settingsOpen]);

  useEffect(() => {
    if (currentTrack) {
      const title = settings.hideTrackName ? HIDDEN_TEXT : currentTrack.title;
      document.title = `${title} — Эквалайзер`;
    } else {
      document.title = 'Эквалайзер';
    }
  }, [currentTrack, settings.hideTrackName]);

  // ---- Derived values ------------------------------------------------------------------------------
  const active = engine.isPlaying || engine.micActive;
  const coverBackground = settings.hideTrackName ? null : (currentTrack?.coverUrl ?? null);

  const centerDisplay = useMemo(() => {
    if (settings.centerTextSource === 'track' && currentTrack) {
      if (settings.hideTrackName) return HIDDEN_TEXT;
      return currentTrack.artist ? `${currentTrack.title} - ${currentTrack.artist}` : currentTrack.title;
    }
    if (settings.centerTextSource === 'lyric' && lyrics.lines.length > 0) {
      return lyrics.currentLineIndex >= 0 ? lyrics.lines[lyrics.currentLineIndex].text : '';
    }
    return settings.centerText;
  }, [
    settings.centerTextSource,
    settings.centerText,
    settings.hideTrackName,
    currentTrack,
    lyrics.lines,
    lyrics.currentLineIndex,
  ]);

  const hasMedia = engine.playlist.length > 0 || engine.micActive;
  const controlsVisible = uiVisible;
  const rootStyle = {
    '--primary': settings.primaryColor,
    '--secondary': settings.secondaryColor,
  } as CSSProperties;

  return (
    <div className="app" data-theme={settings.theme} style={rootStyle}>
      <div className="bg-layer" aria-hidden="true">
        {videoUrl ? (
          <video ref={videoRef} className="bg-video" src={videoUrl} autoPlay loop muted playsInline />
        ) : coverBackground ? (
          <div className="bg-cover" style={{ backgroundImage: `url("${coverBackground}")` }} />
        ) : (
          <div className="bg-gradient" />
        )}
      </div>

      <VisualizerCanvas
        settings={settings}
        analyserRef={engine.analyserRef}
        levelsRef={levelsRef}
        active={active}
        captureRef={captureRef}
        coverUrl={coverBackground}
        videoRef={videoRef}
      />
      <div className="vignette" aria-hidden="true" />

      <CenterText text={centerDisplay} settings={settings} levelsRef={levelsRef} active={active} />
      <Branding settings={settings} />

      {engine.isRecording ? (
        <div className="rec-indicator" role="status">
          <span className="rec-dot" />
          <span>Запись {formatTime(engine.recordSeconds)}</span>
          <button type="button" className="rec-stop" onClick={engine.stopRecording} aria-label="Остановить запись">
            <Square size={11} fill="currentColor" />
          </button>
        </div>
      ) : null}

      {!noUi ? (
        <>
          {!hasMedia ? (
            <EmptyState onUpload={() => musicInputRef.current?.click()} onMic={engine.toggleMic} />
          ) : null}

          {playlistOpen ? (
            <Playlist
              tracks={engine.playlist}
              currentIndex={engine.currentIndex}
              hideTrackName={settings.hideTrackName}
              favorites={library.favorites}
              history={library.history}
              onPlay={engine.playIndex}
              onToggleFavorite={library.toggleFavorite}
              onReorder={engine.reorder}
              onRemove={engine.removeTrack}
              onPlayHistory={playFromHistory}
              onClearHistory={library.clearHistory}
              onClose={() => setPlaylistOpen(false)}
            />
          ) : null}

          <LyricsPanel
            lyrics={lyrics}
            track={currentTrack}
            settings={settings}
            onChange={update}
            controlsVisible={controlsVisible && hasMedia}
            onSeek={engine.seek}
            onSearch={searchLyrics}
            onUpload={() => lyricsInputRef.current?.click()}
          />

          {hasMedia ? (
            <PlayerControls
              visible={controlsVisible}
              track={currentTrack}
              hideTrackName={settings.hideTrackName}
              isPlaying={engine.isPlaying}
              currentTime={engine.currentTime}
              duration={engine.duration}
              volume={settings.volume}
              muted={engine.muted}
              micActive={engine.micActive}
              shuffle={settings.shuffle}
              repeatMode={settings.repeatMode}
              loopA={engine.loopA}
              loopB={engine.loopB}
              sleepMinutes={settings.sleepTimerMinutes}
              sleepRemaining={engine.sleepRemaining}
              isRecording={engine.isRecording}
              recordSeconds={engine.recordSeconds}
              pipActive={pip.active}
              fullscreen={fullscreen}
              playlistOpen={playlistOpen}
              lyricsEnabled={settings.showLyrics}
              onTogglePlay={engine.togglePlay}
              onNext={engine.next}
              onPrevious={engine.previous}
              onSeek={engine.seek}
              onVolume={engine.setVolume}
              onToggleMute={engine.toggleMute}
              onToggleShuffle={() => update('shuffle', !settings.shuffle)}
              onCycleRepeat={cycleRepeat}
              onSetLoopA={engine.setLoopA}
              onSetLoopB={engine.setLoopB}
              onClearLoop={engine.clearLoop}
              onSleepChange={(minutes) => update('sleepTimerMinutes', minutes)}
              onToggleMic={engine.toggleMic}
              onUpload={() => musicInputRef.current?.click()}
              onToggleRecording={toggleRecording}
              onTogglePip={() => void pip.toggle()}
              onToggleNoUi={toggleNoUi}
              onToggleFullscreen={() => void toggleFullscreen()}
              onTogglePlaylist={() => setPlaylistOpen((value) => !value)}
              onToggleLyrics={() => update('showLyrics', !settings.showLyrics)}
              onHoverChange={handleHoverChange}
            />
          ) : null}

          <SettingsPanel
            open={settingsOpen}
            settings={settings}
            onChange={update}
            onClose={() => setSettingsOpen(false)}
            onApplyColorPreset={applyColorPreset}
            onRandomPreset={applyRandomPreset}
            onExportPreset={exportPreset}
            onImportPreset={() => presetInputRef.current?.click()}
            onReset={resetAll}
            onPartyChange={handlePartyChange}
            onToggleNoUi={toggleNoUi}
            hasVideo={videoUrl !== null}
            onUploadVideo={() => videoInputRef.current?.click()}
            onRemoveVideo={removeVideo}
            onUploadMusic={() => musicInputRef.current?.click()}
            onUploadLyrics={() => lyricsInputRef.current?.click()}
            onSearchLyrics={searchLyrics}
            searchingLyrics={lyrics.searching}
            onClearPlaylist={engine.clearPlaylist}
            onSavePreset={savePreset}
            onApplyCustomPreset={applyCustomPreset}
            onDeleteCustomPreset={removeCustomPreset}
            onShareCustomPreset={(preset) => void shareCustomPreset(preset)}
            isRecording={engine.isRecording}
            onToggleRecording={toggleRecording}
            pipActive={pip.active}
            onTogglePip={() => void pip.toggle()}
            onEqChange={changeEq}
          />
          <SettingsButton open={settingsOpen} onToggle={() => setSettingsOpen((value) => !value)} />
        </>
      ) : (
        <button
          type="button"
          className={showRestore ? 'restore-ui visible' : 'restore-ui'}
          onClick={toggleNoUi}
          aria-hidden={!showRestore}
          tabIndex={showRestore ? 0 : -1}
        >
          <Eye size={14} />
          Показать интерфейс
        </button>
      )}

      {dragActive ? (
        <div className="drop-overlay">
          <div className="drop-box">
            <strong>Отпустите файлы</strong>
            <span>Музыка, текст песни (.lrc / .txt) или видео-фон (.mp4 / .webm)</span>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div key={toast.id} className={`toast toast-${toast.kind}`} role="status">
          {toast.text}
        </div>
      ) : null}

      <input ref={musicInputRef} type="file" accept={AUDIO_ACCEPT} multiple hidden onChange={onInputChange((files) => void handleFiles(files, true))} />
      <input ref={lyricsInputRef} type="file" accept={LYRICS_ACCEPT} hidden onChange={onInputChange((files) => void handleFiles(files))} />
      <input ref={videoInputRef} type="file" accept={VIDEO_ACCEPT} hidden onChange={onInputChange((files) => void handleFiles(files))} />
      <input ref={presetInputRef} type="file" accept={PRESET_ACCEPT} hidden onChange={onInputChange((files) => void handleFiles(files))} />
    </div>
  );
}
