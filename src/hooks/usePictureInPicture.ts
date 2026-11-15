import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { CaptureState, ToastKind } from '../types';

export interface UsePictureInPictureResult {
  active: boolean;
  toggle: () => Promise<void>;
}

/** Floating mini-player: a hidden <video> fed by the composed canvas stream. */
export function usePictureInPicture(
  captureRef: RefObject<CaptureState>,
  notify: (text: string, kind?: ToastKind) => void,
): UsePictureInPictureResult {
  const [active, setActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const countedRef = useRef(false);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const cleanup = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
      video.remove();
    }
    if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    if (countedRef.current) {
      captureRef.current.users = Math.max(0, captureRef.current.users - 1);
      countedRef.current = false;
    }
    videoRef.current = null;
    streamRef.current = null;
    setActive(false);
  }, [captureRef]);

  const toggle = useCallback(async () => {
    if (videoRef.current && document.pictureInPictureElement === videoRef.current) {
      try {
        await document.exitPictureInPicture();
      } catch {
        cleanup();
      }
      return;
    }
    if (!document.pictureInPictureEnabled) {
      notifyRef.current('Мини-плеер не поддерживается в этом браузере', 'error');
      return;
    }
    const capture = captureRef.current;
    if (!capture.canvas || typeof capture.canvas.captureStream !== 'function') {
      notifyRef.current('Мини-плеер не поддерживается в этом браузере', 'error');
      return;
    }
    capture.users += 1;
    countedRef.current = true;
    try {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.style.cssText = 'position:fixed;width:2px;height:2px;opacity:0;pointer-events:none;left:0;top:0;';
      document.body.appendChild(video);
      const stream = capture.canvas.captureStream(30);
      video.srcObject = stream;
      videoRef.current = video;
      streamRef.current = stream;
      await video.play();
      await video.requestPictureInPicture();
      video.addEventListener('leavepictureinpicture', cleanup, { once: true });
      setActive(true);
    } catch {
      cleanup();
      notifyRef.current('Не удалось открыть мини-плеер', 'error');
    }
  }, [captureRef, cleanup]);

  useEffect(
    () => () => {
      if (videoRef.current && document.pictureInPictureElement === videoRef.current) {
        document.exitPictureInPicture().catch(() => undefined);
      }
      cleanup();
    },
    [cleanup],
  );

  return { active, toggle };
}
