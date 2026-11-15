import type { CSSProperties } from 'react';
import {
  Circle,
  EyeOff,
  Flag,
  FlagTriangleRight,
  ListMusic,
  Maximize,
  Mic,
  Minimize,
  Moon,
  Pause,
  PictureInPicture2,
  Play,
  Repeat,
  Repeat1,
  RotateCcw,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  Subtitles,
  Upload,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { RepeatMode, Track } from '../types';
import { formatCountdown, formatTime, maskText } from '../utils/format';

interface PlayerControlsProps {
  visible: boolean;
  track: Track | null;
  hideTrackName: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  micActive: boolean;
  shuffle: boolean;
  repeatMode: RepeatMode;
  loopA: number | null;
  loopB: number | null;
  sleepMinutes: number;
  sleepRemaining: number;
  isRecording: boolean;
  recordSeconds: number;
  pipActive: boolean;
  fullscreen: boolean;
  playlistOpen: boolean;
  lyricsEnabled: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (seconds: number) => void;
  onVolume: (value: number) => void;
  onToggleMute: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onSetLoopA: () => void;
  onSetLoopB: () => void;
  onClearLoop: () => void;
  onSleepChange: (minutes: number) => void;
  onToggleMic: () => void;
  onUpload: () => void;
  onToggleRecording: () => void;
  onTogglePip: () => void;
  onToggleNoUi: () => void;
  onToggleFullscreen: () => void;
  onTogglePlaylist: () => void;
  onToggleLyrics: () => void;
  onHoverChange: (hovered: boolean) => void;
}

const SLEEP_OPTIONS = [0, 15, 30, 45, 60, 90];
const REPEAT_LABELS: Record<RepeatMode, string> = { off: 'Повтор: выкл', all: 'Повтор: все', one: 'Повтор: один' };

export function PlayerControls(props: PlayerControlsProps) {
  const {
    visible,
    track,
    hideTrackName,
    isPlaying,
    currentTime,
    duration,
    volume,
    muted,
    micActive,
    shuffle,
    repeatMode,
    loopA,
    loopB,
    sleepMinutes,
    sleepRemaining,
    isRecording,
    recordSeconds,
    pipActive,
    fullscreen,
    playlistOpen,
    lyricsEnabled,
  } = props;

  const hasTrack = track !== null;
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const progress = safeDuration > 0 ? Math.min(100, (currentTime / safeDuration) * 100) : 0;
  const volumeValue = muted ? 0 : volume;
  const VolumeIcon = volumeValue === 0 ? VolumeX : volumeValue < 0.5 ? Volume1 : Volume2;
  const RepeatIcon = repeatMode === 'one' ? Repeat1 : Repeat;

  const title = micActive && !track ? 'Микрофон' : track ? maskText(track.title, hideTrackName) : 'Нет трека';
  const subtitle = micActive && !track ? 'Живой звук' : track ? (hideTrackName ? '' : track.artist) : '';
  const showCover = track?.thumbUrl && !hideTrackName;

  return (
    <div
      className={visible ? 'player' : 'player player-hidden'}
      onMouseEnter={() => props.onHoverChange(true)}
      onMouseLeave={() => props.onHoverChange(false)}
    >
      <div className="progress-row">
        <span className="time">{formatTime(currentTime)}</span>
        <input
          type="range"
          className="slider progress"
          min={0}
          max={safeDuration || 1}
          step={0.1}
          value={Math.min(currentTime, safeDuration || 1)}
          disabled={!hasTrack}
          style={{ '--fill': `${progress}%` } as CSSProperties}
          aria-label="Перемотка"
          onChange={(event) => props.onSeek(Number(event.target.value))}
        />
        <span className="time">{formatTime(safeDuration)}</span>
      </div>

      <div className="main-row">
        <div className="track-info">
          {showCover ? <img className="track-cover" src={track?.thumbUrl ?? ''} alt="" /> : null}
          <div className="track-text">
            <span className="track-title">{title}</span>
            {subtitle ? <span className="track-artist">{subtitle}</span> : null}
          </div>
        </div>

        <div className="transport">
          <button
            type="button"
            className={shuffle ? 'icon-btn active' : 'icon-btn'}
            onClick={props.onToggleShuffle}
            title={shuffle ? 'Перемешивание: вкл' : 'Перемешивание: выкл'}
            aria-label="Перемешать"
          >
            <Shuffle size={18} />
          </button>
          <button type="button" className="icon-btn" onClick={props.onPrevious} title="Предыдущий" aria-label="Предыдущий">
            <SkipBack size={20} />
          </button>
          <button
            type="button"
            className="icon-btn play-btn"
            onClick={props.onTogglePlay}
            title={isPlaying ? 'Пауза' : 'Воспроизвести'}
            aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
          >
            {isPlaying ? <Pause size={22} /> : <Play size={22} />}
          </button>
          <button type="button" className="icon-btn" onClick={props.onNext} title="Следующий" aria-label="Следующий">
            <SkipForward size={20} />
          </button>
          <button
            type="button"
            className={repeatMode !== 'off' ? 'icon-btn active' : 'icon-btn'}
            onClick={props.onCycleRepeat}
            title={REPEAT_LABELS[repeatMode]}
            aria-label={REPEAT_LABELS[repeatMode]}
          >
            <RepeatIcon size={18} />
          </button>
        </div>

        <div className="volume">
          <button
            type="button"
            className="icon-btn"
            onClick={props.onToggleMute}
            title={muted ? 'Включить звук' : 'Выключить звук'}
            aria-label="Звук"
          >
            <VolumeIcon size={18} />
          </button>
          <input
            type="range"
            className="slider volume-slider"
            min={0}
            max={1}
            step={0.01}
            value={volumeValue}
            style={{ '--fill': `${volumeValue * 100}%` } as CSSProperties}
            aria-label="Громкость"
            onChange={(event) => props.onVolume(Number(event.target.value))}
          />
        </div>
      </div>

      <div className="tools-row">
        <button type="button" className="pill" onClick={props.onUpload}>
          <Upload size={14} />
          Загрузить
        </button>
        <button type="button" className={micActive ? 'pill active' : 'pill'} onClick={props.onToggleMic}>
          <Mic size={14} />
          Микрофон
        </button>
        <button type="button" className={playlistOpen ? 'pill active' : 'pill'} onClick={props.onTogglePlaylist}>
          <ListMusic size={14} />
          Плейлист
        </button>
        <button type="button" className={lyricsEnabled ? 'pill active' : 'pill'} onClick={props.onToggleLyrics}>
          <Subtitles size={14} />
          Текст
        </button>

        <span className="tools-sep" aria-hidden="true" />

        <button type="button" className={loopA !== null ? 'pill active' : 'pill'} onClick={props.onSetLoopA} disabled={!hasTrack}>
          <Flag size={14} />
          Поставить A{loopA !== null ? ` (${formatTime(loopA)})` : ''}
        </button>
        <button type="button" className={loopB !== null ? 'pill active' : 'pill'} onClick={props.onSetLoopB} disabled={!hasTrack}>
          <FlagTriangleRight size={14} />
          Поставить B{loopB !== null ? ` (${formatTime(loopB)})` : ''}
        </button>
        <button type="button" className="pill" onClick={props.onClearLoop} disabled={loopA === null && loopB === null}>
          <RotateCcw size={14} />
          Сбросить цикл
        </button>

        <span className="tools-sep" aria-hidden="true" />

        <label className={sleepMinutes > 0 ? 'pill pill-select active' : 'pill pill-select'}>
          <Moon size={14} />
          <span>Сон:</span>
          <select
            value={sleepMinutes}
            aria-label="Таймер сна"
            onChange={(event) => props.onSleepChange(Number(event.target.value))}
          >
            {SLEEP_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes === 0 ? 'Выкл' : `${minutes} мин`}
              </option>
            ))}
          </select>
          {sleepMinutes > 0 && sleepRemaining > 0 ? <span className="pill-badge">{formatCountdown(sleepRemaining)}</span> : null}
        </label>

        <span className="tools-sep" aria-hidden="true" />

        <button type="button" className={isRecording ? 'pill recording' : 'pill'} onClick={props.onToggleRecording}>
          {isRecording ? <Square size={14} /> : <Circle size={14} />}
          {isRecording ? `Стоп ${formatTime(recordSeconds)}` : 'Записать видео'}
        </button>
        <button type="button" className={pipActive ? 'pill active' : 'pill'} onClick={props.onTogglePip}>
          <PictureInPicture2 size={14} />
          Мини-плеер
        </button>
        <button type="button" className="pill" onClick={props.onToggleNoUi}>
          <EyeOff size={14} />
          Режим без UI
        </button>
        <button
          type="button"
          className="pill"
          onClick={props.onToggleFullscreen}
          title={fullscreen ? 'Выйти из полноэкранного режима' : 'Во весь экран'}
        >
          {fullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
          {fullscreen ? 'Окно' : 'Во весь экран'}
        </button>
      </div>
    </div>
  );
}
