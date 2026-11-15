import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { AudioLevels } from '../types';

const HISTORY_SIZE = 43;
const COOLDOWN_MS = 200;
const THRESHOLD = 1.3;
const MIN_ENERGY = 0.3;

function bandAverage(data: Uint8Array, binHz: number, fromHz: number, toHz: number): number {
  const from = Math.max(0, Math.floor(fromHz / binHz));
  const to = Math.min(data.length - 1, Math.max(from, Math.ceil(toHz / binHz)));
  let sum = 0;
  for (let i = from; i <= to; i += 1) sum += data[i];
  return sum / (to - from + 1) / 255;
}

/**
 * Runs a lightweight analysis loop that publishes bass / mids / highs levels and
 * beat events through a mutable ref (no React re-renders per frame).
 */
export function useBeatDetection(
  analyserRef: RefObject<AnalyserNode | null>,
  enabled: boolean,
): RefObject<AudioLevels> {
  const levelsRef = useRef<AudioLevels>({ bass: 0, mids: 0, highs: 0, lastBeatAt: -10000, beatCount: 0 });
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    let raf = 0;
    let data: Uint8Array<ArrayBuffer> | null = null;
    const history: number[] = [];

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const levels = levelsRef.current;
      const analyser = analyserRef.current;
      if (!analyser) {
        levels.bass *= 0.9;
        levels.mids *= 0.9;
        levels.highs *= 0.9;
        return;
      }
      if (!data || data.length !== analyser.frequencyBinCount) {
        data = new Uint8Array(analyser.frequencyBinCount);
      }
      analyser.getByteFrequencyData(data);
      const binHz = analyser.context.sampleRate / 2 / data.length;
      const bass = bandAverage(data, binHz, 20, 150);
      const mids = bandAverage(data, binHz, 150, 2000);
      const highs = bandAverage(data, binHz, 2000, 12000);

      levels.bass += (bass - levels.bass) * (bass > levels.bass ? 0.6 : 0.12);
      levels.mids += (mids - levels.mids) * (mids > levels.mids ? 0.5 : 0.12);
      levels.highs += (highs - levels.highs) * (highs > levels.highs ? 0.5 : 0.15);

      history.push(bass);
      if (history.length > HISTORY_SIZE) history.shift();
      if (!enabledRef.current || history.length < 10) return;
      const average = history.reduce((sum, value) => sum + value, 0) / history.length;
      if (bass > average * THRESHOLD && bass > MIN_ENERGY && now - levels.lastBeatAt > COOLDOWN_MS) {
        levels.lastBeatAt = now;
        levels.beatCount += 1;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [analyserRef]);

  return levelsRef;
}
