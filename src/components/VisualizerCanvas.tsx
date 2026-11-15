import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { AudioLevels, CaptureState, Settings } from '../types';
import { createPaint, flowColor, hexToCss, hslCss } from '../utils/color';
import { clamp } from '../utils/format';

interface VisualizerCanvasProps {
  settings: Settings;
  analyserRef: RefObject<AnalyserNode | null>;
  levelsRef: RefObject<AudioLevels>;
  active: boolean;
  captureRef: RefObject<CaptureState>;
  coverUrl: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  band: number;
}

const MAX_PARTICLES = 520;

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number): void {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (r < 0.5) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function setGlow(ctx: CanvasRenderingContext2D, glow: number, color: string): void {
  if (glow > 0) {
    ctx.shadowBlur = glow * 0.45;
    ctx.shadowColor = color;
  } else {
    ctx.shadowBlur = 0;
  }
}

function clearGlow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceW: number,
  sourceH: number,
  w: number,
  h: number,
): void {
  if (sourceW <= 0 || sourceH <= 0) return;
  const scale = Math.max(w / sourceW, h / sourceH);
  const dw = sourceW * scale;
  const dh = sourceH * scale;
  ctx.drawImage(source, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

export function VisualizerCanvas(props: VisualizerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const coverImageRef = useRef<HTMLImageElement | null>(null);
  const { coverUrl } = props;

  // Cover image used only when composing the recording / mini-player stream.
  useEffect(() => {
    coverImageRef.current = null;
    if (!coverUrl) return undefined;
    const image = new Image();
    image.onload = () => {
      coverImageRef.current = image;
    };
    image.src = coverUrl;
    return () => {
      image.onload = null;
    };
  }, [coverUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const capture = propsRef.current.captureRef.current;
    capture.canvas = document.createElement('canvas');
    capture.canvas.width = 1280;
    capture.canvas.height = 720;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let lastTime = performance.now();
    let values = new Float32Array(0);
    let data: Uint8Array<ArrayBuffer> | null = null;
    let binKey = '';
    let binStart: number[] = [];
    let binEnd: number[] = [];
    let binCenter: number[] = [];
    let particles: Particle[] = [];
    let spawnAccumulator = 0;
    let seenBeats = propsRef.current.levelsRef.current.beatCount;
    let captureSized = false;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
    };
    resize();
    window.addEventListener('resize', resize);

    const buildBinMap = (count: number, binCount: number, sampleRate: number) => {
      const key = `${count}|${binCount}|${sampleRate}`;
      if (key === binKey) return;
      binKey = key;
      const nyquist = sampleRate / 2;
      const binHz = nyquist / binCount;
      const low = 40;
      const high = Math.min(16000, nyquist);
      binStart = [];
      binEnd = [];
      binCenter = [];
      for (let i = 0; i < count; i += 1) {
        const f0 = low * Math.pow(high / low, i / count);
        const f1 = low * Math.pow(high / low, (i + 1) / count);
        const start = Math.min(binCount - 1, Math.floor(f0 / binHz));
        const end = Math.min(binCount - 1, Math.max(start + 1, Math.ceil(f1 / binHz)));
        binStart.push(start);
        binEnd.push(end);
        binCenter.push(Math.min(binCount - 1, ((f0 + f1) / 2) / binHz));
      }
    };

    // ---- Drawing modes -------------------------------------------------------------

    const drawBars = (s: Settings, time: number) => {
      const n = values.length;
      const margin = width * 0.05;
      const usable = width - margin * 2;
      const gap = s.barGap;
      const barWidth = Math.max(1, (usable - gap * (n - 1)) / n);
      const baseY = s.reflection ? height * 0.7 : height * 0.86;
      const maxH = height * (s.reflection ? 0.5 : 0.7);
      const paint = createPaint(
        ctx,
        s.colorMode,
        s.primaryColor,
        s.secondaryColor,
        s.gradientDirection,
        { left: margin, right: width - margin, top: baseY - maxH, bottom: baseY },
        time,
      );
      const perBar = s.colorMode === 'frequency';

      const paintBars = (heightScale: number) => {
        if (!perBar) {
          ctx.fillStyle = paint.fill(0.5);
          ctx.beginPath();
          for (let i = 0; i < n; i += 1) {
            const barH = Math.max(2, values[i] * maxH * heightScale);
            roundRectPath(ctx, margin + i * (barWidth + gap), baseY - barH, barWidth, barH, s.cornerRadius);
          }
          ctx.fill();
          return;
        }
        for (let i = 0; i < n; i += 1) {
          const t = i / Math.max(1, n - 1);
          const barH = Math.max(2, values[i] * maxH * heightScale);
          const color = paint.fill(t);
          ctx.fillStyle = color;
          if (s.neonGlow > 0) setGlow(ctx, s.neonGlow, paint.glow(t));
          ctx.beginPath();
          roundRectPath(ctx, margin + i * (barWidth + gap), baseY - barH, barWidth, barH, s.cornerRadius);
          ctx.fill();
        }
      };

      if (!perBar) setGlow(ctx, s.neonGlow, paint.glow(0.5));
      paintBars(1);
      clearGlow(ctx);

      if (s.reflection) {
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.translate(0, baseY * 2 + 3);
        ctx.scale(1, -1);
        paintBars(0.55);
        ctx.restore();
      }
    };

    const drawMirror = (s: Settings, time: number) => {
      const n = values.length;
      const margin = width * 0.05;
      const usable = width - margin * 2;
      const gap = s.barGap;
      const barWidth = Math.max(1, (usable - gap * (n - 1)) / n);
      const cy = height / 2;
      const maxHalf = height * 0.36;
      const paint = createPaint(
        ctx,
        s.colorMode,
        s.primaryColor,
        s.secondaryColor,
        s.gradientDirection,
        { left: margin, right: width - margin, top: cy - maxHalf, bottom: cy + maxHalf },
        time,
        true,
      );
      const perBar = s.colorMode === 'frequency';
      const center = (n - 1) / 2;
      const indexFor = (k: number) => Math.min(n - 1, Math.floor(Math.abs(k - center) * 2));

      if (!perBar) {
        setGlow(ctx, s.neonGlow, paint.glow(0.5));
        ctx.fillStyle = paint.fill(0.5);
        ctx.beginPath();
        for (let k = 0; k < n; k += 1) {
          const half = Math.max(2, values[indexFor(k)] * maxHalf);
          roundRectPath(ctx, margin + k * (barWidth + gap), cy - half, barWidth, half * 2, s.cornerRadius);
        }
        ctx.fill();
      } else {
        for (let k = 0; k < n; k += 1) {
          const j = indexFor(k);
          const t = j / Math.max(1, n - 1);
          const half = Math.max(2, values[j] * maxHalf);
          ctx.fillStyle = paint.fill(t);
          if (s.neonGlow > 0) setGlow(ctx, s.neonGlow, paint.glow(t));
          ctx.beginPath();
          roundRectPath(ctx, margin + k * (barWidth + gap), cy - half, barWidth, half * 2, s.cornerRadius);
          ctx.fill();
        }
      }
      clearGlow(ctx);
    };

    const drawCircle = (s: Settings, time: number, bass: number) => {
      const n = values.length;
      const cx = width / 2;
      const cy = height / 2;
      const minSide = Math.min(width, height);
      const radius = minSide * 0.17 * (1 + bass * 0.12);
      const maxLen = minSide * 0.27;
      const arc = (2 * Math.PI * radius) / n;
      const lineWidth = Math.max(1.2, arc - s.barGap * 0.6);
      const paint = createPaint(
        ctx,
        s.colorMode,
        s.primaryColor,
        s.secondaryColor,
        s.gradientDirection,
        { left: cx - radius - maxLen, right: cx + radius + maxLen, top: cy - radius - maxLen, bottom: cy + radius + maxLen },
        time,
        true,
      );
      const perBar = s.colorMode === 'frequency';
      ctx.lineCap = s.cornerRadius > 2 ? 'round' : 'butt';
      ctx.lineWidth = lineWidth;

      const valueFor = (i: number) => {
        const k = i < n / 2 ? i : n - 1 - i;
        return Math.min(n - 1, k * 2);
      };

      const strokeBars = (inward: boolean) => {
        const sign = inward ? -1 : 1;
        if (!perBar) {
          ctx.strokeStyle = paint.fill(0.5);
          ctx.beginPath();
          for (let i = 0; i < n; i += 1) {
            const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
            const len = (2 + values[valueFor(i)] * maxLen) * (inward ? 0.4 : 1);
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            ctx.moveTo(cx + cos * radius, cy + sin * radius);
            ctx.lineTo(cx + cos * (radius + sign * len), cy + sin * (radius + sign * len));
          }
          ctx.stroke();
          return;
        }
        for (let i = 0; i < n; i += 1) {
          const index = valueFor(i);
          const t = index / Math.max(1, n - 1);
          const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
          const len = (2 + values[index] * maxLen) * (inward ? 0.4 : 1);
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          ctx.strokeStyle = paint.fill(t);
          if (!inward && s.neonGlow > 0) setGlow(ctx, s.neonGlow, paint.glow(t));
          ctx.beginPath();
          ctx.moveTo(cx + cos * radius, cy + sin * radius);
          ctx.lineTo(cx + cos * (radius + sign * len), cy + sin * (radius + sign * len));
          ctx.stroke();
        }
      };

      if (!perBar) setGlow(ctx, s.neonGlow, paint.glow(0.5));
      strokeBars(false);
      clearGlow(ctx);
      if (s.reflection) {
        ctx.save();
        ctx.globalAlpha = 0.28;
        strokeBars(true);
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = paint.fill(0.5);
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.lineCap = 'butt';
    };

    const traceSmooth = (xs: number[], ys: number[], reverse: boolean, moveFirst: boolean) => {
      const count = xs.length;
      const at = (i: number) => (reverse ? count - 1 - i : i);
      if (moveFirst) ctx.moveTo(xs[at(0)], ys[at(0)]);
      else ctx.lineTo(xs[at(0)], ys[at(0)]);
      for (let i = 1; i < count - 1; i += 1) {
        const mx = (xs[at(i)] + xs[at(i + 1)]) / 2;
        const my = (ys[at(i)] + ys[at(i + 1)]) / 2;
        ctx.quadraticCurveTo(xs[at(i)], ys[at(i)], mx, my);
      }
      ctx.lineTo(xs[at(count - 1)], ys[at(count - 1)]);
    };

    const drawWave = (s: Settings, time: number) => {
      const n = values.length;
      const margin = width * 0.04;
      const cy = height * 0.5;
      const amp = height * 0.3;
      const xs: number[] = [];
      const topYs: number[] = [];
      const bottomYs: number[] = [];
      for (let i = 0; i < n; i += 1) {
        const prev = values[Math.max(0, i - 1)];
        const nextValue = values[Math.min(n - 1, i + 1)];
        const smooth = (prev + values[i] * 2 + nextValue) / 4;
        xs.push(margin + (i / Math.max(1, n - 1)) * (width - margin * 2));
        topYs.push(cy - 2 - smooth * amp);
        bottomYs.push(cy + 2 + smooth * amp);
      }
      const paint = createPaint(
        ctx,
        s.colorMode === 'frequency' ? 'gradient' : s.colorMode,
        s.primaryColor,
        s.secondaryColor,
        s.colorMode === 'frequency' ? 'horizontal' : s.gradientDirection,
        { left: margin, right: width - margin, top: cy - amp, bottom: cy + amp },
        time,
        true,
      );
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1.5, 3.5 - s.barGap * 0.05);

      if (s.reflection) {
        ctx.save();
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = paint.fill(0.5);
        ctx.beginPath();
        traceSmooth(xs, topYs, false, true);
        traceSmooth(xs, bottomYs, true, false);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      setGlow(ctx, s.neonGlow, paint.glow(0.5));
      ctx.strokeStyle = paint.fill(0.5);
      ctx.beginPath();
      traceSmooth(xs, topYs, false, true);
      ctx.stroke();
      if (s.reflection) {
        ctx.beginPath();
        traceSmooth(xs, bottomYs, false, true);
        ctx.stroke();
      }
      clearGlow(ctx);
    };

    const spawnParticle = (cx: number, cy: number, band: number, speedScale: number, minSide: number) => {
      if (particles.length >= MAX_PARTICLES) return;
      const angle = Math.random() * Math.PI * 2;
      const startRadius = minSide * (0.04 + Math.random() * 0.05);
      const speed = (30 + Math.random() * 90) * speedScale;
      particles.push({
        x: cx + Math.cos(angle) * startRadius,
        y: cy + Math.sin(angle) * startRadius,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 1.4 + Math.random() * 1.6,
        size: band < 0.25 ? 2.5 + Math.random() * 3.5 : band < 0.7 ? 1.8 + Math.random() * 2.2 : 1 + Math.random() * 1.6,
        band,
      });
    };

    const drawParticles = (
      s: Settings,
      time: number,
      dt: number,
      lv: { bass: number; mids: number; highs: number },
      live: boolean,
      beatFired: boolean,
    ) => {
      const cx = width / 2;
      const cy = height / 2;
      const minSide = Math.min(width, height);
      const idle = live ? 0 : 1;
      const rate = 14 + lv.bass * 150 + lv.mids * 90 + lv.highs * 70 + idle * 8;
      spawnAccumulator += dt * rate;
      while (spawnAccumulator >= 1) {
        spawnAccumulator -= 1;
        const pick = Math.random() * (lv.bass + lv.mids + lv.highs + 0.3);
        const band = pick < lv.bass ? 0 : pick < lv.bass + lv.mids ? 0.5 : pick < lv.bass + lv.mids + lv.highs ? 1 : Math.random();
        const level = band === 0 ? lv.bass : band === 0.5 ? lv.mids : band === 1 ? lv.highs : 0.1;
        spawnParticle(cx, cy, band, 0.6 + level * 3, minSide);
      }
      if (beatFired && s.beatReaction) {
        for (let i = 0; i < 70; i += 1) spawnParticle(cx, cy, Math.random() * 0.6, 3.2 + Math.random() * 2.2, minSide);
      }

      const paint = createPaint(
        ctx,
        s.colorMode,
        s.primaryColor,
        s.secondaryColor,
        s.gradientDirection,
        { left: 0, right: width, top: 0, bottom: height },
        time,
        true,
      );
      const perParticle = s.colorMode === 'frequency' || s.colorMode === 'rgbflow';
      const coreRadius = minSide * (0.045 + lv.bass * 0.05);
      setGlow(ctx, s.neonGlow, paint.glow(0.5));
      ctx.fillStyle = perParticle ? (s.colorMode === 'rgbflow' ? flowColor(0.5, time) : paint.fill(0.5)) : paint.fill(0.5);
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
      ctx.fill();

      const glowAmount = s.neonGlow * 0.22;
      ctx.shadowBlur = glowAmount;
      const alive: Particle[] = [];
      for (const p of particles) {
        p.life += dt;
        if (p.life >= p.maxLife) continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - dt * 0.35;
        p.vy *= 1 - dt * 0.35;
        if (p.x < -40 || p.x > width + 40 || p.y < -40 || p.y > height + 40) continue;
        alive.push(p);
        const fade = 1 - p.life / p.maxLife;
        ctx.globalAlpha = fade * 0.9;
        const color = perParticle
          ? s.colorMode === 'rgbflow'
            ? flowColor(p.band, time)
            : (paint.fill(p.band) as string)
          : s.colorMode === 'gradient'
            ? hexToCss(paint.glow(Math.min(1, Math.hypot(p.x - cx, p.y - cy) / (minSide * 0.6))))
            : s.primaryColor;
        ctx.fillStyle = color;
        if (glowAmount > 0) ctx.shadowColor = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.6 + fade * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      particles = alive;
      ctx.globalAlpha = 1;
      clearGlow(ctx);
    };

    // ---- Capture composition -------------------------------------------------------

    const composeCapture = (p: VisualizerCanvasProps, s: Settings) => {
      const state = p.captureRef.current;
      if (!state.canvas) return;
      if (state.users <= 0) {
        captureSized = false;
        return;
      }
      const target = state.canvas;
      if (!captureSized) {
        const cw = Math.min(1280, canvas.width);
        target.width = cw;
        target.height = Math.max(2, Math.round((cw * canvas.height) / Math.max(1, canvas.width)));
        captureSized = true;
      }
      const c = target.getContext('2d');
      if (!c) return;
      const cw = target.width;
      const ch = target.height;
      c.globalAlpha = 1;
      c.filter = 'none';
      c.fillStyle = s.theme === 'light' ? '#f4f5f8' : '#07070b';
      c.fillRect(0, 0, cw, ch);
      const cover = coverImageRef.current;
      const video = p.videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        drawCover(c, video, video.videoWidth, video.videoHeight, cw, ch);
      } else if (cover) {
        c.filter = 'blur(28px) brightness(0.45)';
        c.save();
        c.translate(cw / 2, ch / 2);
        c.scale(1.2, 1.2);
        c.translate(-cw / 2, -ch / 2);
        drawCover(c, cover, cover.naturalWidth, cover.naturalHeight, cw, ch);
        c.restore();
        c.filter = 'none';
      } else {
        const g = c.createLinearGradient(0, 0, cw, ch);
        g.addColorStop(0, hexToCss(s.primaryColor, 0.14));
        g.addColorStop(1, hexToCss(s.secondaryColor, 0.14));
        c.fillStyle = g;
        c.fillRect(0, 0, cw, ch);
      }
      c.drawImage(canvas, 0, 0, cw, ch);
      const vignette = c.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, s.theme === 'light' ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.5)');
      c.fillStyle = vignette;
      c.fillRect(0, 0, cw, ch);
    };

    // ---- Frame ----------------------------------------------------------------------

    const renderFrame = (now: number) => {
      const p = propsRef.current;
      const s = p.settings;
      const time = now / 1000;
      const dt = clamp((now - lastTime) / 1000, 0.001, 0.05);
      lastTime = now;
      const n = s.barCount;
      if (values.length !== n) values = new Float32Array(n);

      const analyser = p.analyserRef.current;
      const live = p.active && analyser !== null;
      const lv = p.levelsRef.current;

      if (live && analyser) {
        if (!data || data.length !== analyser.frequencyBinCount) data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        buildBinMap(n, data.length, analyser.context.sampleRate);
        const attack = 1 - Math.exp(-dt * 38);
        const release = 1 - Math.exp(-dt * 9);
        for (let i = 0; i < n; i += 1) {
          let raw: number;
          if (binEnd[i] - binStart[i] <= 1) {
            const pos = binCenter[i];
            const lo = Math.floor(pos);
            const hi = Math.min(data.length - 1, lo + 1);
            raw = data[lo] + (data[hi] - data[lo]) * (pos - lo);
          } else {
            raw = 0;
            for (let b = binStart[i]; b <= binEnd[i]; b += 1) if (data[b] > raw) raw = data[b];
          }
          const tilt = 0.85 + (i / n) * 0.75;
          const target = clamp(Math.pow(raw / 255, 1.35) * s.sensitivity * tilt, 0, 1);
          values[i] += (target - values[i]) * (target > values[i] ? attack : release);
        }
      } else {
        const attack = 1 - Math.exp(-dt * 4);
        for (let i = 0; i < n; i += 1) {
          const phase = (i / n) * 16;
          const target =
            0.11 + 0.07 * Math.sin(time * 1.1 + phase) + 0.05 * Math.sin(time * 0.6 - phase * 0.55) + 0.025 * Math.sin(time * 2.1 + phase * 1.7);
          values[i] += (Math.max(0.02, target) - values[i]) * attack;
        }
      }

      const bass = live ? lv.bass : 0.12 + 0.06 * Math.sin(time * 0.8);
      const levels = live
        ? { bass: lv.bass, mids: lv.mids, highs: lv.highs }
        : { bass: 0.06, mids: 0.04, highs: 0.03 };
      const beatFired = lv.beatCount !== seenBeats;
      seenBeats = lv.beatCount;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // Bass-driven glow behind everything.
      const accent = s.colorMode === 'rgbflow' ? flowColor(0, time) : s.primaryColor;
      const pulse = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.65);
      pulse.addColorStop(0, hexToCss(accent, 0.04 + bass * 0.2));
      pulse.addColorStop(1, hexToCss(accent, 0));
      ctx.fillStyle = pulse;
      ctx.fillRect(0, 0, width, height);

      switch (s.visualizerMode) {
        case 'mirror':
          drawMirror(s, time);
          break;
        case 'circle':
          drawCircle(s, time, bass);
          break;
        case 'wave':
          drawWave(s, time);
          break;
        case 'particles':
          drawParticles(s, time, dt, levels, live, beatFired);
          break;
        case 'bars':
        default:
          drawBars(s, time);
          break;
      }

      // Beat flash / party strobe.
      if (s.beatReaction || s.partyMode) {
        const flashSpan = s.partyMode ? 220 : 320;
        const decay = Math.max(0, 1 - (now - lv.lastBeatAt) / flashSpan);
        if (decay > 0) {
          const strength = decay * (s.partyMode ? 0.6 : 0.2) * s.beatFlashIntensity;
          let color: string;
          if (s.partyMode) {
            const choice = lv.beatCount % 3;
            color = choice === 0 ? '#ffffff' : choice === 1 ? s.primaryColor : s.secondaryColor;
          } else {
            color = s.theme === 'light' ? s.primaryColor : '#ffffff';
          }
          ctx.fillStyle = hexToCss(color, strength);
          ctx.fillRect(0, 0, width, height);
        }
      }

      if (s.partyMode && !live) {
        ctx.fillStyle = hslCss(time * 60, 1, 0.6, 0.03);
        ctx.fillRect(0, 0, width, height);
      }

      composeCapture(p, s);
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      renderFrame(now);
    };
    raf = requestAnimationFrame(loop);

    // Background tabs stop requestAnimationFrame; keep capture streams alive.
    const backgroundTimer = window.setInterval(() => {
      if (document.hidden && propsRef.current.captureRef.current.users > 0) renderFrame(performance.now());
    }, 33);

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(backgroundTimer);
      window.removeEventListener('resize', resize);
      capture.canvas = null;
    };
  }, []);

  return <canvas ref={canvasRef} className="visualizer-canvas" />;
}
