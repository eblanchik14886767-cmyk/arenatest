import type { Settings, SettingsUpdater } from '../types';
import { formatNumber, formatPercent, formatSpeed } from '../utils/format';
import { SliderRow, ToggleRow } from './Controls';

interface EffectsPanelProps {
  settings: Settings;
  onChange: SettingsUpdater;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function EffectsPanel({ settings, onChange }: EffectsPanelProps) {
  return (
    <div className="effects-panel">
      <div className="fx-group">
        <ToggleRow label="Эхо" checked={settings.echoEnabled} onChange={(v) => onChange('echoEnabled', v)} />
        <SliderRow
          label="Время эха"
          value={settings.echoTime}
          min={0.1}
          max={0.8}
          step={0.01}
          disabled={!settings.echoEnabled}
          format={(v) => `${formatNumber(v, 2)} с`}
          onChange={(v) => onChange('echoTime', v)}
        />
        <SliderRow
          label="Повторы"
          value={settings.echoFeedback}
          min={0}
          max={0.8}
          step={0.01}
          disabled={!settings.echoEnabled}
          format={formatPercent}
          onChange={(v) => onChange('echoFeedback', v)}
        />
        <SliderRow
          label="Микс эха"
          value={settings.echoMix}
          min={0}
          max={1}
          step={0.01}
          disabled={!settings.echoEnabled}
          format={formatPercent}
          onChange={(v) => onChange('echoMix', v)}
        />
      </div>

      <div className="fx-group">
        <ToggleRow label="Реверберация" checked={settings.reverbEnabled} onChange={(v) => onChange('reverbEnabled', v)} />
        <SliderRow
          label="Микс реверберации"
          value={settings.reverbMix}
          min={0}
          max={1}
          step={0.01}
          disabled={!settings.reverbEnabled}
          format={formatPercent}
          onChange={(v) => onChange('reverbMix', v)}
        />
      </div>

      <div className="fx-group">
        <ToggleRow
          label="8D-звук"
          hint="Звук медленно кружит вокруг головы (лучше в наушниках)"
          checked={settings.eightDEnabled}
          onChange={(v) => onChange('eightDEnabled', v)}
        />
        <SliderRow
          label="Интенсивность 8D"
          value={settings.eightDIntensity}
          min={0}
          max={1}
          step={0.01}
          disabled={!settings.eightDEnabled}
          format={formatPercent}
          onChange={(v) => onChange('eightDIntensity', v)}
        />
      </div>

      <div className="fx-group">
        <span className="ctl-label">Скорость воспроизведения</span>
        <div className="chip-row">
          {SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              className={settings.playbackSpeed === speed ? 'chip active' : 'chip'}
              onClick={() => onChange('playbackSpeed', speed)}
            >
              {formatSpeed(speed)}
            </button>
          ))}
        </div>
        <SliderRow
          label="Точная скорость"
          value={settings.playbackSpeed}
          min={0.5}
          max={2}
          step={0.05}
          format={(v) => formatSpeed(Math.round(v * 100) / 100)}
          onChange={(v) => onChange('playbackSpeed', v)}
        />
      </div>
    </div>
  );
}
