import { useEffect, useState } from 'react';
import { clamp255, hexToRgb, normalizeHex, rgbToHex } from '../utils/color';
import type { Rgb } from '../utils/color';

interface ColorControlProps {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}

const CHANNELS: Array<{ key: keyof Rgb; label: string }> = [
  { key: 'r', label: 'R' },
  { key: 'g', label: 'G' },
  { key: 'b', label: 'B' },
];

/** Color picker with a native wheel, HEX input and RGB sliders, all kept in sync. */
export function ColorControl({ label, value, onChange }: ColorControlProps) {
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const rgb = hexToRgb(value);

  useEffect(() => {
    setDraft(value);
    setInvalid(false);
  }, [value]);

  const handleHexChange = (raw: string) => {
    setDraft(raw);
    const compact = raw.trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{6}$/.test(compact)) {
      const hex = normalizeHex(compact);
      if (hex) {
        setInvalid(false);
        onChange(hex);
      }
    } else {
      setInvalid(compact.length > 0 && !/^[0-9a-fA-F]{0,6}$/.test(compact));
    }
  };

  const commitHexOnBlur = () => {
    const hex = normalizeHex(draft);
    if (hex) {
      setInvalid(false);
      setDraft(hex);
      if (hex !== value) onChange(hex);
    } else {
      setInvalid(false);
      setDraft(value);
    }
  };

  const handleChannel = (key: keyof Rgb, raw: string) => {
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    onChange(rgbToHex({ ...rgb, [key]: clamp255(parsed) }));
  };

  return (
    <div className="color-control">
      <div className="color-head">
        <span className="ctl-label">{label}</span>
        <span className="color-swatch" style={{ background: value }} aria-hidden="true" />
      </div>
      <div className="color-inputs">
        <input
          type="color"
          className="color-wheel"
          value={value}
          aria-label={`${label}: палитра`}
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          type="text"
          className={invalid ? 'text-input hex-input invalid' : 'text-input hex-input'}
          value={draft}
          maxLength={7}
          spellCheck={false}
          aria-label={`${label}: HEX`}
          placeholder="#a855f7"
          onChange={(event) => handleHexChange(event.target.value)}
          onBlur={commitHexOnBlur}
        />
      </div>
      <div className="rgb-rows">
        {CHANNELS.map((channel) => (
          <div className="rgb-row" key={channel.key}>
            <span className={`rgb-name rgb-${channel.key}`}>{channel.label}</span>
            <input
              type="range"
              className={`slider slider-${channel.key}`}
              min={0}
              max={255}
              step={1}
              value={rgb[channel.key]}
              aria-label={`${label}: ${channel.label}`}
              onChange={(event) => handleChannel(channel.key, event.target.value)}
            />
            <input
              type="number"
              className="text-input rgb-number"
              min={0}
              max={255}
              value={rgb[channel.key]}
              aria-label={`${label}: ${channel.label} число`}
              onChange={(event) => handleChannel(channel.key, event.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
