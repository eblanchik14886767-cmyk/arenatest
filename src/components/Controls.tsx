import type { CSSProperties, ReactNode } from 'react';

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  disabled?: boolean;
}

export function SliderRow({ label, value, min, max, step, onChange, format, disabled }: SliderRowProps) {
  return (
    <label className="ctl-row">
      <span className="ctl-label">
        <span>{label}</span>
        <span className="ctl-value">{format ? format(value) : value}</span>
      </span>
      <input
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ '--fill': `${max === min ? 0 : ((value - min) / (max - min)) * 100}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}

export function ToggleRow({ label, checked, onChange, hint }: ToggleRowProps) {
  return (
    <label className="ctl-toggle">
      <span className="ctl-toggle-text">
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </span>
      <input type="checkbox" className="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  label?: string;
  value: T;
  options: Array<SegmentOption<T>>;
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="ctl-row">
      {label ? <span className="ctl-label">{label}</span> : null}
      <div className="segmented" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={option.value === value ? 'seg active' : 'seg'}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface TextRowProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
}

export function TextRow({ label, value, onChange, placeholder, maxLength }: TextRowProps) {
  return (
    <label className="ctl-row">
      <span className="ctl-label">{label}</span>
      <input
        type="text"
        className="text-input"
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

interface SelectRowProps<T extends string | number> {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

export function SelectRow<T extends string | number>({ label, value, options, onChange }: SelectRowProps<T>) {
  return (
    <label className="ctl-row">
      <span className="ctl-label">{label}</span>
      <select
        className="select"
        value={String(value)}
        onChange={(event) => {
          const picked = options.find((option) => String(option.value) === event.target.value);
          if (picked) onChange(picked.value);
        }}
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface ButtonProps {
  children: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
  title?: string;
}

export function ActionButton({ children, onClick, variant = 'default', disabled, title }: ButtonProps) {
  return (
    <button type="button" className={`btn btn-${variant}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}
