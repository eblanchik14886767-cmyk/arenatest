import type { EqPresetId } from '../types';
import { EQ_FREQUENCY_LABELS, EQ_PRESETS, EQ_PRESET_LABELS } from '../utils/audio';
import { formatDb } from '../utils/format';
import { ActionButton } from './Controls';

interface EqualizerPanelProps {
  bands: number[];
  preset: EqPresetId;
  onChange: (bands: number[], preset: EqPresetId) => void;
}

const PRESET_IDS = Object.keys(EQ_PRESETS) as Array<Exclude<EqPresetId, 'custom'>>;

export function EqualizerPanel({ bands, preset, onChange }: EqualizerPanelProps) {
  const setBand = (index: number, value: number) => {
    const next = bands.map((band, i) => (i === index ? value : band));
    onChange(next, 'custom');
  };

  return (
    <div className="eq-panel">
      <div className="chip-row">
        {PRESET_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={preset === id ? 'chip active' : 'chip'}
            onClick={() => onChange([...EQ_PRESETS[id]], id)}
          >
            {EQ_PRESET_LABELS[id]}
          </button>
        ))}
      </div>
      <div className="eq-bands">
        {bands.map((band, index) => (
          <div className="eq-band" key={EQ_FREQUENCY_LABELS[index]}>
            <span className="eq-value">{band > 0 ? `+${band}` : band}</span>
            <div className="eq-slider-wrap">
              <input
                type="range"
                className="slider eq-slider"
                min={-12}
                max={12}
                step={1}
                value={band}
                title={formatDb(band)}
                aria-label={`${EQ_FREQUENCY_LABELS[index]} Гц`}
                onChange={(event) => setBand(index, Number(event.target.value))}
              />
            </div>
            <span className="eq-freq">{EQ_FREQUENCY_LABELS[index]}</span>
          </div>
        ))}
      </div>
      <ActionButton onClick={() => onChange([...EQ_PRESETS.flat], 'flat')}>Сбросить полосы</ActionButton>
    </div>
  );
}
