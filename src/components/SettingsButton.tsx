import { Settings as SettingsIcon } from 'lucide-react';

interface SettingsButtonProps {
  open: boolean;
  onToggle: () => void;
}

export function SettingsButton({ open, onToggle }: SettingsButtonProps) {
  return (
    <button
      type="button"
      className={open ? 'settings-button open' : 'settings-button'}
      onClick={onToggle}
      aria-label={open ? 'Закрыть настройки' : 'Открыть настройки'}
      title="Настройки"
    >
      <SettingsIcon size={16} />
    </button>
  );
}
