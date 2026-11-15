import { useState } from 'react';
import type { ReactNode } from 'react';
import { Circle, Download, Link2, Moon, Play, Shuffle, Sun, Trash2, Upload, X } from 'lucide-react';
import type {
  CenterTextFont,
  CenterTextSource,
  ColorMode,
  ColorPreset,
  CustomPreset,
  EqPresetId,
  GradientDirection,
  RepeatMode,
  Settings,
  SettingsUpdater,
  Theme,
  VisualizerMode,
} from '../types';
import { COLOR_PRESETS } from '../utils/color';
import { formatDb, formatNumber, formatPercent } from '../utils/format';
import { ColorControl } from './ColorControl';
import { ActionButton, Segmented, SelectRow, SliderRow, TextRow, ToggleRow } from './Controls';
import { EffectsPanel } from './EffectsPanel';
import { EqualizerPanel } from './EqualizerPanel';

interface SettingsPanelProps {
  open: boolean;
  settings: Settings;
  onChange: SettingsUpdater;
  onClose: () => void;
  onApplyColorPreset: (preset: ColorPreset) => void;
  onRandomPreset: () => void;
  onExportPreset: () => void;
  onImportPreset: () => void;
  onReset: () => void;
  onPartyChange: (enabled: boolean) => void;
  onToggleNoUi: () => void;
  hasVideo: boolean;
  onUploadVideo: () => void;
  onRemoveVideo: () => void;
  onUploadMusic: () => void;
  onUploadLyrics: () => void;
  onSearchLyrics: () => void;
  searchingLyrics: boolean;
  onClearPlaylist: () => void;
  onSavePreset: (name: string) => boolean;
  onApplyCustomPreset: (preset: CustomPreset) => void;
  onDeleteCustomPreset: (id: string) => void;
  onShareCustomPreset: (preset: CustomPreset) => void;
  isRecording: boolean;
  onToggleRecording: () => void;
  pipActive: boolean;
  onTogglePip: () => void;
  onEqChange: (bands: number[], preset: EqPresetId) => void;
}

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

function Section({ title, defaultOpen = false, children }: SectionProps) {
  return (
    <details className="settings-section" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="section-body">{children}</div>
    </details>
  );
}

const THEME_OPTIONS: Array<{ value: Theme; label: string }> = [
  { value: 'dark', label: 'Тёмная тема' },
  { value: 'light', label: 'Светлая тема' },
];

const COLOR_MODE_OPTIONS: Array<{ value: ColorMode; label: string }> = [
  { value: 'gradient', label: 'Градиент' },
  { value: 'solid', label: 'Сплошной' },
  { value: 'rgbflow', label: 'RGB-поток' },
  { value: 'frequency', label: 'По частотам' },
];

const DIRECTION_OPTIONS: Array<{ value: GradientDirection; label: string }> = [
  { value: 'vertical', label: 'Вертикально' },
  { value: 'horizontal', label: 'Горизонтально' },
];

const VISUALIZER_OPTIONS: Array<{ value: VisualizerMode; label: string }> = [
  { value: 'bars', label: 'Столбцы' },
  { value: 'mirror', label: 'Зеркало' },
  { value: 'circle', label: 'Круг' },
  { value: 'wave', label: 'Волна' },
  { value: 'particles', label: 'Частицы' },
];

const SOURCE_OPTIONS: Array<{ value: CenterTextSource; label: string }> = [
  { value: 'custom', label: 'Свой текст' },
  { value: 'track', label: 'Название трека' },
  { value: 'lyric', label: 'Текущая строка песни' },
];

const FONT_OPTIONS: Array<{ value: CenterTextFont; label: string }> = [
  { value: 'thin', label: 'Тонкий' },
  { value: 'bold', label: 'Жирный' },
  { value: 'mono', label: 'Моноширинный' },
];

const REPEAT_OPTIONS: Array<{ value: RepeatMode; label: string }> = [
  { value: 'off', label: 'Выкл' },
  { value: 'all', label: 'Все' },
  { value: 'one', label: 'Один' },
];

const SLEEP_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Выкл' },
  { value: 15, label: '15 мин' },
  { value: 30, label: '30 мин' },
  { value: 45, label: '45 мин' },
  { value: 60, label: '60 мин' },
  { value: 90, label: '90 мин' },
];

const TRANSLATION_LANG_OPTIONS = [
  { value: 'ru' as const, label: 'На русский' },
  { value: 'en' as const, label: 'На английский' },
];

const TRANSLATION_DISPLAY_OPTIONS = [
  { value: 'below' as const, label: 'Под строкой' },
  { value: 'only' as const, label: 'Только перевод' },
  { value: 'off' as const, label: 'Выкл' },
];

export function SettingsPanel(props: SettingsPanelProps) {
  const { open, settings, onChange } = props;
  const [presetName, setPresetName] = useState('');

  const savePreset = () => {
    if (props.onSavePreset(presetName)) setPresetName('');
  };

  return (
    <aside className={open ? 'settings-panel panel-glass open' : 'settings-panel panel-glass'} aria-hidden={!open} aria-label="Настройки">
      <header className="panel-header">
        <h2>Настройки</h2>
        <button type="button" className="btn btn-close" onClick={props.onClose}>
          <X size={14} />
          Закрыть
        </button>
      </header>

      <div className="settings-scroll">
        <Section title="Оформление" defaultOpen>
          <Segmented
            label="Тема"
            value={settings.theme}
            options={THEME_OPTIONS}
            onChange={(value) => onChange('theme', value)}
          />
          <div className="theme-hint">
            {settings.theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
            <span>{settings.theme === 'dark' ? 'Тёмная тема' : 'Светлая тема'}</span>
          </div>
          <ToggleRow
            label="Скрыть название трека"
            hint="Для стримов: название и исполнитель заменяются на ••••••"
            checked={settings.hideTrackName}
            onChange={(value) => onChange('hideTrackName', value)}
          />
          <div className="btn-row">
            <ActionButton onClick={props.onUploadVideo}>
              <Upload size={14} />
              Загрузить видео-фон
            </ActionButton>
            <ActionButton onClick={props.onRemoveVideo} disabled={!props.hasVideo}>
              Убрать видео-фон
            </ActionButton>
          </div>
          <div className="btn-row">
            <ActionButton onClick={props.onToggleNoUi}>Режим без UI</ActionButton>
          </div>
        </Section>

        <Section title="Цвета" defaultOpen>
          <Segmented
            label="Режим цвета"
            value={settings.colorMode}
            options={COLOR_MODE_OPTIONS}
            onChange={(value) => onChange('colorMode', value)}
          />
          {settings.colorMode === 'gradient' ? (
            <Segmented
              label="Направление градиента"
              value={settings.gradientDirection}
              options={DIRECTION_OPTIONS}
              onChange={(value) => onChange('gradientDirection', value)}
            />
          ) : null}
          {settings.colorMode === 'rgbflow' ? (
            <p className="hint">Цвета автоматически перетекают по всему спектру.</p>
          ) : null}
          <ColorControl label="Основной" value={settings.primaryColor} onChange={(value) => onChange('primaryColor', value)} />
          <ColorControl label="Вторичный" value={settings.secondaryColor} onChange={(value) => onChange('secondaryColor', value)} />
          <SliderRow
            label="Неоновое свечение"
            value={settings.neonGlow}
            min={0}
            max={100}
            step={1}
            format={(v) => `${v}`}
            onChange={(value) => onChange('neonGlow', value)}
          />
          <span className="ctl-label">Пресеты</span>
          <div className="preset-grid">
            {COLOR_PRESETS.map((preset) => (
              <button key={preset.id} type="button" className="preset-card" onClick={() => props.onApplyColorPreset(preset)}>
                <span
                  className="preset-dot"
                  style={{ background: `linear-gradient(135deg, ${preset.primary}, ${preset.secondary})` }}
                />
                {preset.name}
              </button>
            ))}
          </div>
          <div className="btn-row">
            <ActionButton onClick={props.onRandomPreset}>
              <Shuffle size={14} />
              Случайный пресет
            </ActionButton>
            <ActionButton onClick={props.onExportPreset}>
              <Download size={14} />
              Экспорт пресета
            </ActionButton>
            <ActionButton onClick={props.onImportPreset}>
              <Upload size={14} />
              Импорт пресета
            </ActionButton>
            <ActionButton onClick={props.onReset} variant="danger">
              Сбросить настройки
            </ActionButton>
          </div>
        </Section>

        <Section title="Автопалитра">
          <ToggleRow
            label="Автопалитра из обложки"
            hint="Основной и вторичный цвета берутся из обложки трека"
            checked={settings.autoPalette}
            onChange={(value) => onChange('autoPalette', value)}
          />
        </Section>

        <Section title="Эквалайзер">
          <SelectRow
            label="Режим визуализации"
            value={settings.visualizerMode}
            options={VISUALIZER_OPTIONS}
            onChange={(value) => onChange('visualizerMode', value)}
          />
          <SliderRow
            label="Количество полос"
            value={settings.barCount}
            min={16}
            max={256}
            step={1}
            onChange={(value) => onChange('barCount', value)}
          />
          <SliderRow
            label="Промежуток / толщина"
            value={settings.barGap}
            min={0}
            max={20}
            step={1}
            format={(v) => `${v} px`}
            onChange={(value) => onChange('barGap', value)}
          />
          <SliderRow
            label="Скругление"
            value={settings.cornerRadius}
            min={0}
            max={20}
            step={1}
            format={(v) => `${v} px`}
            onChange={(value) => onChange('cornerRadius', value)}
          />
          <SliderRow
            label="Сглаживание"
            value={settings.smoothing}
            min={0}
            max={0.95}
            step={0.01}
            format={(v) => formatNumber(v, 2)}
            onChange={(value) => onChange('smoothing', value)}
          />
          <SliderRow
            label="Чувствительность"
            value={settings.sensitivity}
            min={0.2}
            max={3}
            step={0.05}
            format={(v) => `${formatNumber(v, 2)}x`}
            onChange={(value) => onChange('sensitivity', value)}
          />
          <ToggleRow label="Отражение" checked={settings.reflection} onChange={(value) => onChange('reflection', value)} />
        </Section>

        <Section title="Свои пресеты">
          <div className="inline-form">
            <input
              type="text"
              className="text-input"
              value={presetName}
              placeholder="Название пресета"
              maxLength={40}
              onChange={(event) => setPresetName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') savePreset();
              }}
            />
            <ActionButton onClick={savePreset} variant="primary" disabled={presetName.trim().length === 0}>
              Сохранить пресет
            </ActionButton>
          </div>
          {settings.customPresets.length === 0 ? (
            <p className="hint">Сохранённых пресетов пока нет.</p>
          ) : (
            <ul className="custom-presets">
              {settings.customPresets.map((preset) => (
                <li key={preset.id}>
                  <span
                    className="preset-dot"
                    style={{ background: `linear-gradient(135deg, ${preset.data.primaryColor}, ${preset.data.secondaryColor})` }}
                  />
                  <span className="custom-name">{preset.name}</span>
                  <div className="custom-actions">
                    <button type="button" className="mini-btn" onClick={() => props.onApplyCustomPreset(preset)}>
                      Применить
                    </button>
                    <button type="button" className="mini-btn" onClick={() => props.onShareCustomPreset(preset)}>
                      <Link2 size={12} />
                      Поделиться
                    </button>
                    <button type="button" className="mini-btn danger" onClick={() => props.onDeleteCustomPreset(preset.id)}>
                      <Trash2 size={12} />
                      Удалить
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="10-полосный эквалайзер">
          <EqualizerPanel bands={settings.eqBands} preset={settings.eqPreset} onChange={props.onEqChange} />
        </Section>

        <Section title="Эффекты">
          <EffectsPanel settings={settings} onChange={onChange} />
        </Section>

        <Section title="Центральный текст">
          <ToggleRow
            label="Показывать центральный текст"
            checked={settings.centerTextVisible}
            onChange={(value) => onChange('centerTextVisible', value)}
          />
          <SelectRow
            label="Источник текста"
            value={settings.centerTextSource}
            options={SOURCE_OPTIONS}
            onChange={(value) => onChange('centerTextSource', value)}
          />
          <TextRow
            label="Текст в центре"
            value={settings.centerText}
            maxLength={80}
            onChange={(value) => onChange('centerText', value)}
          />
          <Segmented
            label="Шрифт"
            value={settings.centerTextFont}
            options={FONT_OPTIONS}
            onChange={(value) => onChange('centerTextFont', value)}
          />
          <SliderRow
            label="Размер"
            value={settings.centerTextSize}
            min={16}
            max={240}
            step={1}
            format={(v) => `${v} px`}
            onChange={(value) => onChange('centerTextSize', value)}
          />
          <SliderRow
            label="Прозрачность"
            value={settings.centerTextOpacity}
            min={0}
            max={1}
            step={0.01}
            format={formatPercent}
            onChange={(value) => onChange('centerTextOpacity', value)}
          />
          <SliderRow
            label="Свечение"
            value={settings.centerTextGlow}
            min={0}
            max={100}
            step={1}
            onChange={(value) => onChange('centerTextGlow', value)}
          />
          <SliderRow
            label="Амплитуда волны"
            value={settings.centerTextWaveAmplitude}
            min={0}
            max={60}
            step={1}
            format={(v) => `${v} px`}
            onChange={(value) => onChange('centerTextWaveAmplitude', value)}
          />
        </Section>

        <Section title="Надпись в углу">
          <ToggleRow
            label="Показывать надпись в углу"
            checked={settings.brandingVisible}
            onChange={(value) => onChange('brandingVisible', value)}
          />
          <TextRow
            label="Текст в углу"
            value={settings.brandingText}
            maxLength={30}
            onChange={(value) => onChange('brandingText', value)}
          />
          <SliderRow
            label="Размер"
            value={settings.brandingSize}
            min={10}
            max={40}
            step={1}
            format={(v) => `${v} px`}
            onChange={(value) => onChange('brandingSize', value)}
          />
          <SliderRow
            label="Прозрачность"
            value={settings.brandingOpacity}
            min={0.1}
            max={1}
            step={0.01}
            format={formatPercent}
            onChange={(value) => onChange('brandingOpacity', value)}
          />
        </Section>

        <Section title="Звук">
          <SliderRow
            label="Усиление баса"
            value={settings.bassBoost}
            min={-12}
            max={12}
            step={1}
            format={formatDb}
            onChange={(value) => onChange('bassBoost', value)}
          />
          <SliderRow
            label="Громкость"
            value={settings.volume}
            min={0}
            max={1}
            step={0.01}
            format={formatPercent}
            onChange={(value) => onChange('volume', value)}
          />
          <SliderRow
            label="Кроссфейд (сек)"
            value={settings.crossfadeDuration}
            min={0}
            max={12}
            step={1}
            format={(v) => (v === 0 ? 'Выкл' : `${v} с`)}
            onChange={(value) => onChange('crossfadeDuration', value)}
          />
          <SelectRow
            label="Таймер сна"
            value={settings.sleepTimerMinutes}
            options={SLEEP_OPTIONS}
            onChange={(value) => onChange('sleepTimerMinutes', value)}
          />
          <ToggleRow label="Перемешивание" checked={settings.shuffle} onChange={(value) => onChange('shuffle', value)} />
          <Segmented
            label="Повтор"
            value={settings.repeatMode}
            options={REPEAT_OPTIONS}
            onChange={(value) => onChange('repeatMode', value)}
          />
        </Section>

        <Section title="Вечеринка и бит">
          <ToggleRow
            label="Режим Вечеринка"
            hint="Стробоскоп в такт басу, полноэкранный режим, быстрое скрытие интерфейса"
            checked={settings.partyMode}
            onChange={props.onPartyChange}
          />
          <ToggleRow
            label="Реакция на бит"
            hint="Вспышка экрана, пульс текста, взрыв частиц"
            checked={settings.beatReaction}
            onChange={(value) => onChange('beatReaction', value)}
          />
          <SliderRow
            label="Интенсивность вспышки"
            value={settings.beatFlashIntensity}
            min={0}
            max={1}
            step={0.01}
            format={formatPercent}
            onChange={(value) => onChange('beatFlashIntensity', value)}
          />
        </Section>

        <Section title="Запись и мини-плеер">
          <div className="btn-row">
            <ActionButton onClick={props.onToggleRecording} variant={props.isRecording ? 'danger' : 'default'}>
              <Circle size={14} />
              {props.isRecording ? 'Остановить запись' : 'Записать видео'}
            </ActionButton>
            <ActionButton onClick={props.onTogglePip}>{props.pipActive ? 'Закрыть мини-плеер' : 'Мини-плеер'}</ActionButton>
          </div>
          <p className="hint">Запись сохраняется в файл equalizer.webm вместе со звуком.</p>
        </Section>

        <Section title="Текст песни">
          <ToggleRow label="Показывать текст песни" checked={settings.showLyrics} onChange={(value) => onChange('showLyrics', value)} />
          <ToggleRow
            label="Караоке пословно"
            checked={settings.karaokeWordHighlight}
            onChange={(value) => onChange('karaokeWordHighlight', value)}
          />
          <div className="btn-row">
            <ActionButton onClick={props.onUploadLyrics}>
              <Upload size={14} />
              Загрузить текст песни
            </ActionButton>
            <ActionButton onClick={props.onSearchLyrics} disabled={props.searchingLyrics}>
              {props.searchingLyrics ? 'Ищем текст…' : 'Найти текст автоматически'}
            </ActionButton>
          </div>
          <SelectRow
            label="Язык перевода"
            value={settings.translationLang}
            options={TRANSLATION_LANG_OPTIONS}
            onChange={(value) => onChange('translationLang', value)}
          />
          <SelectRow
            label="Отображение перевода"
            value={settings.translationDisplay}
            options={TRANSLATION_DISPLAY_OPTIONS}
            onChange={(value) => onChange('translationDisplay', value)}
          />
        </Section>

        <Section title="Плейлист">
          <div className="btn-row">
            <ActionButton onClick={props.onUploadMusic} variant="primary">
              <Play size={14} />
              Загрузить музыку
            </ActionButton>
            <ActionButton onClick={props.onClearPlaylist} variant="danger">
              <Trash2 size={14} />
              Очистить плейлист
            </ActionButton>
          </div>
        </Section>
        <div className="settings-footer-space" />
      </div>
    </aside>
  );
}
