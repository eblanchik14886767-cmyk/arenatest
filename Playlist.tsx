import { useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { GripVertical, Heart, Music, Search, Trash2, X } from 'lucide-react';
import type { HistoryEntry, Track } from '../types';
import { formatTime, maskText } from '../utils/format';

type PlaylistTab = 'all' | 'favorites' | 'history';

interface PlaylistProps {
  tracks: Track[];
  currentIndex: number;
  hideTrackName: boolean;
  favorites: string[];
  history: HistoryEntry[];
  onPlay: (index: number) => void;
  onToggleFavorite: (trackId: string) => void;
  onReorder: (from: number, to: number) => void;
  onRemove: (uid: string) => void;
  onPlayHistory: (trackId: string) => void;
  onClearHistory: () => void;
  onClose: () => void;
}

const TABS: Array<{ id: PlaylistTab; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'favorites', label: 'Любимое' },
  { id: 'history', label: 'История' },
];

function formatPlayedAt(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function Playlist(props: PlaylistProps) {
  const { tracks, currentIndex, hideTrackName, favorites, history } = props;
  const [tab, setTab] = useState<PlaylistTab>('all');
  const [query, setQuery] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const sortable = tab === 'all' && normalizedQuery === '';

  const entries = useMemo(() => {
    return tracks
      .map((track, index) => ({ track, index }))
      .filter(({ track }) => {
        if (tab === 'favorites' && !favorites.includes(track.id)) return false;
        if (!normalizedQuery) return true;
        return `${track.title} ${track.artist}`.toLowerCase().includes(normalizedQuery);
      });
  }, [tracks, tab, favorites, normalizedQuery]);

  const historyEntries = useMemo(() => {
    return [...history]
      .sort((a, b) => b.playedAt - a.playedAt)
      .filter((entry) => !normalizedQuery || `${entry.title} ${entry.artist}`.toLowerCase().includes(normalizedQuery));
  }, [history, normalizedQuery]);

  const handleDragStart = (event: DragEvent<HTMLLIElement>, index: number) => {
    setDragIndex(index);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `track:${index}`);
  };

  const handleDragOver = (event: DragEvent<HTMLLIElement>, index: number) => {
    if (dragIndex === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (overIndex !== index) setOverIndex(index);
  };

  const handleDrop = (event: DragEvent<HTMLLIElement>, index: number) => {
    if (dragIndex === null) return;
    event.preventDefault();
    event.stopPropagation();
    props.onReorder(dragIndex, index);
    setDragIndex(null);
    setOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <aside className="playlist panel-glass" aria-label="Плейлист">
      <header className="panel-header">
        <h2>Плейлист</h2>
        <button type="button" className="icon-btn small" onClick={props.onClose} aria-label="Закрыть плейлист">
          <X size={16} />
        </button>
      </header>

      <div className="tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'tab active' : 'tab'}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <label className="search-box">
        <Search size={14} />
        <input
          type="text"
          value={query}
          placeholder="Поиск по плейлисту"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {tab === 'history' ? (
        <>
          {historyEntries.length === 0 ? (
            <p className="list-empty">{history.length === 0 ? 'История пока пуста' : 'Ничего не найдено'}</p>
          ) : (
            <ul className="track-list">
              {historyEntries.map((entry, index) => (
                <li key={`${entry.trackId}-${entry.playedAt}-${index}`}>
                  <button type="button" className="track-row" onClick={() => props.onPlayHistory(entry.trackId)}>
                    <span className="row-cover">
                      {entry.coverUrl && !hideTrackName ? <img src={entry.coverUrl} alt="" /> : <Music size={14} />}
                    </span>
                    <span className="row-text">
                      <span className="row-title">{maskText(entry.title, hideTrackName)}</span>
                      <span className="row-sub">
                        {hideTrackName ? '' : entry.artist ? `${entry.artist} · ` : ''}
                        {formatPlayedAt(entry.playedAt)} · {formatTime(entry.listenedSeconds)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn-danger" onClick={props.onClearHistory} disabled={history.length === 0}>
            <Trash2 size={14} />
            Очистить историю
          </button>
        </>
      ) : entries.length === 0 ? (
        <p className="list-empty">
          {tracks.length === 0
            ? 'Плейлист пуст. Загрузите музыку'
            : tab === 'favorites' && normalizedQuery === ''
              ? 'В любимом пока ничего нет. Нажмите на сердечко у трека'
              : 'Ничего не найдено'}
        </p>
      ) : (
        <ul className="track-list">
          {entries.map(({ track, index }) => {
            const isCurrent = index === currentIndex;
            const isFavorite = favorites.includes(track.id);
            const classes = [
              'track-item',
              isCurrent ? 'current' : '',
              dragIndex === index ? 'dragging' : '',
              overIndex === index && dragIndex !== null && dragIndex !== index ? 'drop-target' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <li
                key={track.uid}
                className={classes}
                draggable={sortable}
                onDragStart={sortable ? (event) => handleDragStart(event, index) : undefined}
                onDragOver={sortable ? (event) => handleDragOver(event, index) : undefined}
                onDrop={sortable ? (event) => handleDrop(event, index) : undefined}
                onDragEnd={sortable ? handleDragEnd : undefined}
              >
                {sortable ? (
                  <span className="drag-handle" title="Перетащите, чтобы изменить порядок">
                    <GripVertical size={14} />
                  </span>
                ) : null}
                <button type="button" className="track-row" onClick={() => props.onPlay(index)}>
                  <span className="row-cover">
                    {track.thumbUrl && !hideTrackName ? <img src={track.thumbUrl} alt="" /> : <Music size={14} />}
                  </span>
                  <span className="row-text">
                    <span className="row-title">{maskText(track.title, hideTrackName)}</span>
                    <span className="row-sub">
                      {hideTrackName ? '' : track.artist ? `${track.artist} · ` : ''}
                      {formatTime(track.duration)}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className={isFavorite ? 'icon-btn small fav active' : 'icon-btn small fav'}
                  onClick={() => props.onToggleFavorite(track.id)}
                  aria-label={isFavorite ? 'Убрать из любимого' : 'В любимое'}
                  title={isFavorite ? 'Убрать из любимого' : 'В любимое'}
                >
                  <Heart size={15} fill={isFavorite ? 'currentColor' : 'none'} />
                </button>
                <button
                  type="button"
                  className="icon-btn small"
                  onClick={() => props.onRemove(track.uid)}
                  aria-label="Удалить из плейлиста"
                  title="Удалить из плейлиста"
                >
                  <X size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
