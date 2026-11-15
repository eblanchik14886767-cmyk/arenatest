import { useEffect, useRef } from 'react';
import type { CSSProperties, RefObject } from 'react';
import type { AudioLevels, Settings } from '../types';
import { hexToCss } from '../utils/color';

interface CenterTextProps {
  text: string;
  settings: Settings;
  levelsRef: RefObject<AudioLevels>;
  active: boolean;
}

const FONT_STYLES: Record<Settings['centerTextFont'], CSSProperties> = {
  thin: { fontWeight: 200, fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" },
  bold: { fontWeight: 800, fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" },
  mono: { fontWeight: 400, fontFamily: "'JetBrains Mono', 'SFMono-Regular', Consolas, 'Courier New', monospace" },
};

/** Text in the screen center whose letters sway on a sine wave driven by bass. */
export function CenterText({ text, settings, levelsRef, active }: CenterTextProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const letterRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const activeRef = useRef(active);
  activeRef.current = active;
  const letters = Array.from(text);

  useEffect(() => {
    let raf = 0;
    let amplitude = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const s = settingsRef.current;
      const levels = levelsRef.current;
      const time = now / 1000;
      const bass = activeRef.current ? levels.bass : 0;
      const target = s.centerTextWaveAmplitude * (0.22 + bass * 1.9);
      amplitude += (target - amplitude) * 0.12;
      const speed = 2.2 + bass * 2.5;
      const count = letterRefs.current.length;
      for (let i = 0; i < count; i += 1) {
        const el = letterRefs.current[i];
        if (!el) continue;
        const phase = time * speed + i * 0.55;
        const y = Math.sin(phase) * amplitude;
        const rotation = Math.sin(phase * 0.8 + 1) * amplitude * 0.18;
        el.style.transform = `translateY(${y.toFixed(2)}px) rotate(${rotation.toFixed(2)}deg)`;
      }
      const container = containerRef.current;
      if (container) {
        let scale = 1;
        if (s.beatReaction) {
          const sinceBeat = now - levels.lastBeatAt;
          const decay = Math.max(0, 1 - sinceBeat / 260);
          scale = 1 + decay * 0.16 * Math.max(0.3, s.beatFlashIntensity * 1.6);
        }
        container.style.transform = `scale(${scale.toFixed(3)})`;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [levelsRef]);

  if (!settings.centerTextVisible || letters.length === 0) return null;

  const glow = settings.centerTextGlow;
  const shadow =
    glow > 0
      ? `0 0 ${glow * 0.25}px ${hexToCss(settings.primaryColor, 0.9)}, 0 0 ${glow * 0.6}px ${hexToCss(settings.secondaryColor, 0.55)}`
      : 'none';

  return (
    <div className="center-text-wrap" aria-hidden="true">
      <div
        ref={containerRef}
        className="center-text"
        style={{
          ...FONT_STYLES[settings.centerTextFont],
          fontSize: `${settings.centerTextSize}px`,
          opacity: settings.centerTextOpacity,
          textShadow: shadow,
        }}
      >
        {letters.map((letter, index) => (
          <span
            key={`${index}-${letter}`}
            className="center-letter"
            ref={(el) => {
              letterRefs.current[index] = el;
            }}
          >
            {letter === ' ' ? '\u00A0' : letter}
          </span>
        ))}
      </div>
    </div>
  );
}
