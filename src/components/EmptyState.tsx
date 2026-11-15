import { Mic, Upload } from 'lucide-react';

interface EmptyStateProps {
  onUpload: () => void;
  onMic: () => void;
}

export function EmptyState({ onUpload, onMic }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <p className="empty-title">Перетащите аудиофайл сюда</p>
      <p className="empty-hint">mp3, wav, ogg, m4a, flac, webm</p>
      <div className="empty-actions">
        <button type="button" className="btn btn-primary" onClick={onUpload}>
          <Upload size={16} />
          Загрузить музыку
        </button>
        <button type="button" className="btn" onClick={onMic}>
          <Mic size={16} />
          Микрофон
        </button>
      </div>
    </div>
  );
}
