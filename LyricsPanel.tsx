import { useEffect, useRef, useState } from 'react';
import { Download, Languages, Loader2, Search, Settings2, Upload, X } from 'lucide-react';
import type { Settings, SettingsUpdater, Track, TranslationDisplay, TranslationLang } from '../types';
import type { UseLyricsResult } from '../hooks/useLyrics';
import { formatTime, maskText } from '../utils/format';
import { getLineWords } from '../utils/lrcParser';

interface LyricsPanelProps {
  lyrics: UseLyricsResult;
  track: Track | null;
  settings: Settings;
  onChange: SettingsUpdater;
  controlsVisible: boolean;
  onSeek: (seconds: number) => void;
  onSearch: () => void;
  onUpload: () => void;
}

export function LyricsPanel({ lyrics, track, settings, onChange, controlsVisible, onSeek, onSearch, onUpload }: LyricsPanelProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const { lines, currentLineIndex, currentWordIndex, manualSync, selectedId, translations } = lyrics;

  // Keep the current line centered inside the list.
  useEffect(() => {
    const list = listRef.current;
    if (!list || currentLineIndex < 0) return;
    const element = list.querySelector<HTMLElement>(`[data-index="${currentLineIndex}"]`);
    if (!element) return;
    const top = element.offsetTop - list.clientHeight / 2 + element.clientHeight / 2;
    list.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [currentLineIndex, lines.length]);

  if (!settings.showLyrics) return null;

  const placement = controlsVisible ? 'lyrics-anchor' : 'lyrics-anchor low';

  if (lines.length === 0) {
    if (!track) return null;
    return (
      <div className={`${placement} lyrics-compact`}>
        <button type="button" className="pill pill-glass" onClick={onSearch} disabled={lyrics.searching}>
          {lyrics.searching ? <Loader2 size={14} className="spin" /> : <Search size={14} />}
          {lyrics.searching ? 'Ищем текст…' : 'Найти текст автоматически'}
        </button>
      </div>
    );
  }

  const handleLineClick = (index: number) => {
    const line = lines[index];
    if (manualSync) {
      lyrics.stampLine(line.id);
      return;
    }
    lyrics.selectLine(line.id);
    if (line.time !== null) onSeek(line.time);
  };

  const trackTitle = track ? maskText(track.title, settings.hideTrackName) : '';
  const display: TranslationDisplay = settings.translationDisplay;
  const hasTranslations = Object.keys(translations).length > 0;

  return (
    <section className={`${placement} lyrics-panel panel-glass`} aria-label="Текст песни">
      <header className="lyrics-header">
        <div className="lyrics-title">
          <strong>Текст песни</strong>
          {trackTitle ? <span>{trackTitle}</span> : null}
        </div>
        <div className="lyrics-header-actions">
          <button
            type="button"
            className={toolsOpen ? 'icon-btn small active' : 'icon-btn small'}
            onClick={() => setToolsOpen((value) => !value)}
            title="Инструменты текста"
            aria-label="Инструменты текста"
          >
            <Settings2 size={15} />
          </button>
          <button
            type="button"
            className="icon-btn small"
            onClick={() => onChange('showLyrics', false)}
            title="Скрыть текст"
            aria-label="Скрыть текст"
          >
            <X size={15} />
          </button>
        </div>
      </header>

      {toolsOpen ? (
        <div className="lyrics-tools">
          <div className="tools-line">
            <button type="button" className="pill" onClick={onSearch} disabled={lyrics.searching}>
              {lyrics.searching ? <Loader2 size={14} className="spin" /> : <Search size={14} />}
              {lyrics.searching ? 'Ищем текст…' : 'Найти текст автоматически'}
            </button>
            <button type="button" className="pill" onClick={onUpload}>
              <Upload size={14} />
              Загрузить текст песни
            </button>
            <button
              type="button"
              className={settings.karaokeWordHighlight ? 'pill active' : 'pill'}
              onClick={() => onChange('karaokeWordHighlight', !settings.karaokeWordHighlight)}
            >
              Караоке пословно
            </button>
          </div>

          <div className="tools-line">
            <button type="button" className="pill" onClick={() => void lyrics.translate()} disabled={lyrics.translating}>
              {lyrics.translating ? <Loader2 size={14} className="spin" /> : <Languages size={14} />}
              {lyrics.translating ? 'Переводим…' : 'Перевести'}
            </button>
            <label className="pill pill-select">
              <select
                value={settings.translationLang}
                aria-label="Язык перевода"
                onChange={(event) => onChange('translationLang', event.target.value as TranslationLang)}
              >
                <option value="ru">На русский</option>
                <option value="en">На английский</option>
              </select>
            </label>
            <label className="pill pill-select">
              <select
                value={display}
                aria-label="Отображение перевода"
                onChange={(event) => onChange('translationDisplay', event.target.value as TranslationDisplay)}
              >
                <option value="below">Под строкой</option>
                <option value="only">Только перевод</option>
                <option value="off">Выкл</option>
              </select>
            </label>
          </div>

          <div className="tools-line">
            <button type="button" className={manualSync ? 'pill active' : 'pill'} onClick={() => lyrics.setManualSync(!manualSync)}>
              Режим синхронизации
            </button>
            <button type="button" className="pill" onClick={() => lyrics.shiftLine(-0.5)}>
              -0.5 сек
            </button>
            <button type="button" className="pill" onClick={() => lyrics.shiftLine(0.5)}>
              +0.5 сек
            </button>
            <button type="button" className="pill" onClick={() => lyrics.exportLrc(track?.title ?? 'lyrics')}>
              <Download size={14} />
              Скачать .lrc
            </button>
          </div>
          {manualSync ? (
            <p className="lyrics-hint">Включите трек и нажимайте на строку в момент, когда она звучит. Время строки будет записано.</p>
          ) : null}
        </div>
      ) : null}

      <div className="lyrics-list" ref={listRef}>
        {lines.map((line, index) => {
          const isCurrent = index === currentLineIndex;
          const translated = translations[line.text];
          const showOriginal = !(display === 'only' && hasTranslations && translated);
          const classes = [
            'lyric-line',
            isCurrent ? 'current' : '',
            index < currentLineIndex ? 'passed' : '',
            manualSync && line.id === selectedId ? 'selected' : '',
            !manualSync && line.id === selectedId ? 'selected-soft' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const words = isCurrent && settings.karaokeWordHighlight ? getLineWords(line) : null;
          return (
            <div key={line.id} className={classes} data-index={index} onClick={() => handleLineClick(index)} role="button" tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleLineClick(index);
              }}
            >
              {manualSync && line.time !== null ? <span className="lyric-time">{formatTime(line.time)}</span> : null}
              <div className="lyric-main">
                {showOriginal ? (
                  words ? (
                    <span className="lyric-text">
                      {words.map((word, wordIndex) => (
                        <span
                          key={`${wordIndex}-${word}`}
                          className={
                            wordIndex < currentWordIndex ? 'word passed' : wordIndex === currentWordIndex ? 'word current' : 'word'
                          }
                        >
                          {word}{' '}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="lyric-text">{line.text || '♪'}</span>
                  )
                ) : (
                  <span className="lyric-text">{translated}</span>
                )}
                {display === 'below' && translated && translated !== line.text ? (
                  <span className="lyric-translation">{translated}</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
