import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, CheckCircle2, AlertCircle, SwitchCamera, ShieldCheck, MapPin, Smartphone } from 'lucide-react';
import { getThaiDateTime } from '../utils/thaiTime';

export interface CameraWatermarkInfo {
  latitude?: number;
  longitude?: number;
  workLocationName?: string;
  addressLine?: string;
  userName?: string;
}

interface CameraCaptureProps {
  photo: string;
  onPhotoCaptured: (photoBase64: string) => void;
  onRetake: () => void;
  watermarkInfo?: CameraWatermarkInfo;
}

const THAI_FONT_STACK = 'Kanit, "Noto Sans Thai", "Sarabun", "Thonburi", "Leelawadee UI", "Segoe UI", sans-serif';
const CAMERA_OPEN_TIMEOUT_MS = 8500;
const MAX_NATIVE_PRE_DOWNSCALE_DIM = 1600;

function runWithTimeout<T>(
  promiseFactory: () => Promise<T>,
  timeoutMs: number,
  onLateResolve?: (val: T) => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(Object.assign(new Error('Camera initialization timed out'), { name: 'TimeoutError' }));
      }
    }, timeoutMs);

    try {
      promiseFactory()
        .then((val) => {
          if (settled) {
            onLateResolve?.(val);
            return;
          }
          settled = true;
          clearTimeout(timer);
          resolve(val);
        })
        .catch((err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        });
    } catch (syncErr) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(syncErr);
      }
    }
  });
}

function stopMediaStreamSafely(stream: MediaStream | null | undefined) {
  if (!stream) return;
  try {
    stream.getTracks().forEach((track) => {
      try {
        track.onended = null;
        track.onmute = null;
        track.stop();
      } catch {
        // ignore individual track errors
      }
    });
  } catch {
    // ignore
  }
}

// Wrap Thai / English text smoothly by canvas pixel width (uses Intl.Segmenter for Thai word boundaries when supported)
function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3): string[] {
  if (!text) return [];
  let segments: string[] = [];
  try {
    if (typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
      const seg = new (Intl as any).Segmenter('th', { granularity: 'word' });
      segments = Array.from(seg.segment(text)).map((s: any) => s.segment);
    } else {
      segments = Array.from(text);
    }
  } catch {
    segments = Array.from(text);
  }

  const lines: string[] = [];
  let currentLine = '';

  for (const seg of segments) {
    const candidate = currentLine + seg;
    if (ctx.measureText(candidate).width > maxWidth && currentLine.length > 0) {
      lines.push(currentLine.trim());
      currentLine = seg.trimStart();
      if (lines.length >= maxLines - 1) {
        break;
      }
    } else {
      currentLine = candidate;
    }
  }

  const consumedLen = lines.join('').length;
  const remaining =
    lines.length >= maxLines - 1
      ? text.slice(text.indexOf(currentLine) >= 0 ? text.indexOf(currentLine) : consumedLen).trim()
      : currentLine.trim();
  if (remaining) {
    let finalLine = remaining;
    while (ctx.measureText(finalLine).width > maxWidth && finalLine.length > 6) {
      finalLine = finalLine.slice(0, -4) + '...';
    }
    lines.push(finalLine);
  }

  return lines.slice(0, maxLines);
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({
  photo,
  onPhotoCaptured,
  onRetake,
  watermarkInfo,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const readyPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);
  const startRequestIdRef = useRef(0);
  const photoRef = useRef(photo);
  photoRef.current = photo;

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isInitializing, setIsInitializing] = useState(false);
  const [isProcessingNativePhoto, setIsProcessingNativePhoto] = useState(false);
  const [flashEffect, setFlashEffect] = useState(false);
  const [isLiveReady, setIsLiveReady] = useState(false);
  const [needsTapToPlay, setNeedsTapToPlay] = useState(false);

  const clearReadyPoll = useCallback(() => {
    if (readyPollRef.current) {
      clearInterval(readyPollRef.current);
      readyPollRef.current = null;
    }
  }, []);

  // Stop camera stream safely using ref (prevents Android NotReadableError on camera switch/retake)
  const stopStream = useCallback(() => {
    clearReadyPoll();
    const activeStream = streamRef.current;
    if (activeStream) {
      stopMediaStreamSafely(activeStream);
      streamRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      try {
        video.onloadedmetadata = null;
        video.onloadeddata = null;
        video.oncanplay = null;
        video.onresize = null;
        video.onplaying = null;
        video.onerror = null;
        video.pause?.();
        video.srcObject = null;
        if (video.hasAttribute('src')) {
          video.removeAttribute('src');
        }
      } catch {
        // ignore
      }
    }
  }, [clearReadyPoll]);

  // Enumerate cameras as fallback when facingMode fails or picks black/ultra-wide sensor on Android/iOS
  const findPreferredDeviceId = async (preferredFacing: 'user' | 'environment'): Promise<string | null> => {
    try {
      if (!navigator?.mediaDevices?.enumerateDevices) return null;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput' && d.deviceId);
      if (videoInputs.length === 0) return null;

      const frontRegex = /front|user|selfie|facetime|หน้า/i;
      const backRegex = /back|rear|environment|wide|main|หลัง/i;
      const targetRegex = preferredFacing === 'user' ? frontRegex : backRegex;

      const exactMatch = videoInputs.find((d) => targetRegex.test(d.label || ''));
      if (exactMatch) return exactMatch.deviceId;

      // Heuristic if labels are hidden prior to full unlock: iOS/Android usually exposes back as 0 and front as 1 or vice-versa
      if (videoInputs.length >= 2) {
        return preferredFacing === 'environment'
          ? videoInputs[videoInputs.length - 1].deviceId
          : videoInputs[0].deviceId;
      }
      return videoInputs[0].deviceId;
    } catch {
      return null;
    }
  };

  // Universal getUserMedia across iOS 12–18+ Safari, Android Chrome, Samsung Internet, Firefox, Edge, and In-App WebViews
  const requestCameraStreamWithFallbacks = async (
    preferredFacing: 'user' | 'environment'
  ): Promise<MediaStream> => {
    const navAny = typeof navigator !== 'undefined' ? (navigator as any) : null;
    const getUserMediaFn: ((c: MediaStreamConstraints) => Promise<MediaStream>) | null =
      navAny?.mediaDevices?.getUserMedia?.bind(navAny.mediaDevices) ||
      (navAny?.getUserMedia
        ? (c: MediaStreamConstraints) =>
            new Promise<MediaStream>((resolve, reject) => navAny.getUserMedia(c, resolve, reject))
        : null) ||
      (navAny?.webkitGetUserMedia
        ? (c: MediaStreamConstraints) =>
            new Promise<MediaStream>((resolve, reject) => navAny.webkitGetUserMedia(c, resolve, reject))
        : null) ||
      (navAny?.mozGetUserMedia
        ? (c: MediaStreamConstraints) =>
            new Promise<MediaStream>((resolve, reject) => navAny.mozGetUserMedia(c, resolve, reject))
        : null);

    if (!getUserMediaFn) {
      throw Object.assign(new Error('No getUserMedia support'), { name: 'UnsupportedBrowserError' });
    }

    // Progressive constraints: ideal portrait -> medium portrait -> plain facingMode -> bare boolean
    const attempts: MediaStreamConstraints[] = [
      {
        video: {
          facingMode: { ideal: preferredFacing },
          width: { ideal: 1080 },
          height: { ideal: 1440 },
          aspectRatio: { ideal: 3 / 4 },
        },
        audio: false,
      },
      {
        video: {
          facingMode: { ideal: preferredFacing },
          width: { ideal: 720 },
          height: { ideal: 960 },
        },
        audio: false,
      },
      {
        video: {
          facingMode: preferredFacing,
        },
        audio: false,
      },
      {
        video: true,
        audio: false,
      },
    ];

    let lastError: any = null;
    let hardwareRetryDone = false;

    for (let i = 0; i < attempts.length; i++) {
      const constraints = attempts[i];
      try {
        return await runWithTimeout(
          () => getUserMediaFn(constraints),
          CAMERA_OPEN_TIMEOUT_MS,
          (lateStream) => stopMediaStreamSafely(lateStream)
        );
      } catch (err: any) {
        lastError = err;
        // Stop retrying only on explicit permission refusal
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          throw err;
        }
        // On Android HAL hardware busy error, wait 300ms for previous sensor release and retry once
        if (
          !hardwareRetryDone &&
          (err?.name === 'NotReadableError' || err?.name === 'TrackStartError' || err?.name === 'AbortError')
        ) {
          hardwareRetryDone = true;
          await new Promise((r) => setTimeout(r, 320));
          try {
            return await runWithTimeout(
              () => getUserMediaFn(constraints),
              CAMERA_OPEN_TIMEOUT_MS,
              (lateStream) => stopMediaStreamSafely(lateStream)
            );
          } catch (retryErr: any) {
            lastError = retryErr;
          }
        }
      }
    }

    // Final fallback tier: enumerate deviceId explicitly (helps multi-lens Android & legacy WebKit)
    const preferredDeviceId = await findPreferredDeviceId(preferredFacing);
    if (preferredDeviceId) {
      try {
        return await runWithTimeout(
          () =>
            getUserMediaFn({
              video: { deviceId: { exact: preferredDeviceId } },
              audio: false,
            }),
          CAMERA_OPEN_TIMEOUT_MS,
          (lateStream) => stopMediaStreamSafely(lateStream)
        );
      } catch (devErr: any) {
        lastError = devErr;
      }
    }

    throw lastError || new Error('Cannot acquire camera stream');
  };

  // Start Live Portrait Camera stream
  const startCamera = useCallback(async () => {
    const reqId = ++startRequestIdRef.current;
    const hadActiveStream = Boolean(streamRef.current);
    setIsInitializing(true);
    setCameraError(null);
    setIsLiveReady(false);
    setNeedsTapToPlay(false);
    stopStream();

    if (
      typeof window !== 'undefined' &&
      !window.isSecureContext &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      setCameraError(
        'เบราว์เซอร์บนมือถือจำกัดกล้องสดบนการเชื่อมต่อที่ไม่ใช่ HTTPS สามารถกดปุ่ม "ถ่ายภาพผ่านกล้องมือถือโดยตรง" ด้านล่างได้ทันที'
      );
      setIsInitializing(false);
      return;
    }

    // Brief pause when switching sensors so Android camera HAL releases hardware cleanly
    if (hadActiveStream) {
      await new Promise((r) => setTimeout(r, 200));
      if (!isMountedRef.current || reqId !== startRequestIdRef.current) return;
    }

    try {
      const mediaStream = await requestCameraStreamWithFallbacks(facingMode);

      if (!isMountedRef.current || reqId !== startRequestIdRef.current || photoRef.current) {
        stopMediaStreamSafely(mediaStream);
        return;
      }

      streamRef.current = mediaStream;

      // Auto-recover if iOS/Android terminates camera track in background or on hardware interrupt
      mediaStream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          if (isMountedRef.current && !photoRef.current && streamRef.current === mediaStream) {
            setIsLiveReady(false);
            if (typeof document === 'undefined' || document.visibilityState === 'visible') {
              startCamera();
            }
          }
        };
      });

      const video = videoRef.current;
      if (video) {
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.setAttribute('x5-playsinline', 'true');
        video.setAttribute('x5-video-player-type', 'h5');
        video.setAttribute('x5-video-player-fullscreen', 'false');
        video.muted = true;
        video.autoplay = true;
        video.srcObject = mediaStream;

        const checkDimensions = () => {
          if (!isMountedRef.current || reqId !== startRequestIdRef.current) return false;
          if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
            setIsLiveReady(true);
            setNeedsTapToPlay(false);
            clearReadyPoll();
            return true;
          }
          return false;
        };

        const markReadyAndPlay = () => {
          if (!isMountedRef.current || reqId !== startRequestIdRef.current) return;
          checkDimensions();
          try {
            const playPromise = video.play?.();
            if (playPromise && typeof playPromise.then === 'function') {
              playPromise
                .then(() => {
                  if (isMountedRef.current && reqId === startRequestIdRef.current) {
                    setNeedsTapToPlay(false);
                    checkDimensions();
                  }
                })
                .catch((err) => {
                  console.warn('Video auto-play notice:', err);
                  if (isMountedRef.current && reqId === startRequestIdRef.current) {
                    setNeedsTapToPlay(true);
                  }
                });
            }
          } catch {
            if (isMountedRef.current && reqId === startRequestIdRef.current) {
              setNeedsTapToPlay(true);
            }
          }
        };

        video.onloadedmetadata = markReadyAndPlay;
        video.onloadeddata = markReadyAndPlay;
        video.oncanplay = markReadyAndPlay;
        video.onresize = () => {
          checkDimensions();
        };
        video.onplaying = () => {
          if (!isMountedRef.current || reqId !== startRequestIdRef.current) return;
          setNeedsTapToPlay(false);
          if (!checkDimensions()) {
            setIsLiveReady(true);
          }
        };

        // Immediately attempt playback and poll up to 6s until video dimensions populate
        markReadyAndPlay();
        let ticks = 0;
        clearReadyPoll();
        readyPollRef.current = setInterval(() => {
          ticks++;
          if (!isMountedRef.current || !streamRef.current || reqId !== startRequestIdRef.current) {
            clearReadyPoll();
            return;
          }
          if (checkDimensions() || ticks >= 30) {
            if (ticks >= 30) {
              if (video.readyState >= 2 && video.videoWidth > 0) {
                setIsLiveReady(true);
              } else {
                // Stream opened without producing video frames (common in restricted WebViews)
                setCameraError(
                  'กล้องไม่ส่งภาพตัวอย่างในเบราว์เซอร์นี้ กรุณากดปุ่ม "เปิดกล้องมือถือโดยตรง" เพื่อถ่ายภาพยืนยันตัวตน'
                );
              }
            }
            clearReadyPoll();
          }
        }, 200);
      }
    } catch (err: any) {
      if (!isMountedRef.current || reqId !== startRequestIdRef.current) return;
      console.warn('Live camera access error:', err);
      let errorMsg =
        'ไม่สามารถเปิดกล้องสดในหน้าเว็บได้ กรุณาอนุญาตการใช้กล้อง หรือกดปุ่ม "เปิดกล้องมือถือโดยตรง" ด้านล่าง';
      if (err?.name === 'UnsupportedBrowserError') {
        errorMsg =
          'เบราว์เซอร์ในแอปนี้จำกัดกล้องสดบนหน้าเว็บ คุณสามารถกดปุ่ม "เปิดกล้องมือถือโดยตรง" ด้านล่างได้ทันที หรือเปิดลิงก์ใน Safari / Chrome';
      } else if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        errorMsg =
          'การเข้าถึงกล้องถูกปฏิเสธ กรุณากด "อนุญาต (Allow)" ในเบราว์เซอร์ หรือใช้ปุ่ม "เปิดกล้องมือถือโดยตรง" ด้านล่าง';
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        errorMsg =
          'ไม่พบกล้องบนอุปกรณ์นี้ หรือสามารถกดปุ่ม "เปิดกล้องมือถือโดยตรง" ด้านล่างเพื่อเปิดแอปกล้องโดยตรง';
      } else if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
        errorMsg =
          'กล้องกำลังถูกใช้งานโดยแอปอื่น หรือยังคืนสิทธิ์ไม่เสร็จ กรุณากด "ลองเปิดกล้องสดอีกครั้ง" หรือใช้ "เปิดกล้องมือถือโดยตรง"';
      } else if (err?.name === 'TimeoutError') {
        errorMsg =
          'การเชื่อมต่อกล้องสดใช้เวลานานเกินไป สามารถกด "ลองเปิดกล้องสดอีกครั้ง" หรือใช้ปุ่ม "เปิดกล้องมือถือโดยตรง" ได้ทันที';
      }
      setCameraError(errorMsg);
    } finally {
      if (isMountedRef.current && reqId === startRequestIdRef.current) {
        setIsInitializing(false);
      }
    }
  }, [facingMode, stopStream, clearReadyPoll]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      startRequestIdRef.current++;
      stopStream();
    };
  }, [stopStream]);

  // Initial mount or facing/retake change
  useEffect(() => {
    if (!photo) {
      startCamera();
    } else {
      stopStream();
    }
  }, [facingMode, photo, startCamera, stopStream]);

  // Recover black/frozen video feed when user unlocks screen or switches back from another app (iOS & Android)
  useEffect(() => {
    const handleResumeCamera = () => {
      if (!isMountedRef.current || photoRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      const activeStream = streamRef.current;
      const tracks = activeStream?.getVideoTracks() || [];
      const hasLiveTrack = tracks.some((t) => t.readyState === 'live' && !t.muted);
      const video = videoRef.current;
      const videoBroken = !video || video.readyState < 2 || video.videoWidth === 0;

      if (!activeStream || !hasLiveTrack || videoBroken) {
        startCamera();
      } else if (video.paused) {
        video.play?.().catch(() => {
          setNeedsTapToPlay(true);
        });
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleResumeCamera);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pageshow', handleResumeCamera);
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleResumeCamera);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('pageshow', handleResumeCamera);
      }
    };
  }, [startCamera]);

  // Switch between front and back camera
  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  // Render crisp 3:4 vertical portrait image + Smart Time bottom-left watermark
  const renderPortraitWatermarkedCanvas = (
    source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
    rawW: number,
    rawH: number,
    mirrorHorizontal: boolean
  ): string | null => {
    if (!canvasRef.current || rawW <= 0 || rawH <= 0) return null;
    const canvas = canvasRef.current;

    const targetAspect = 3 / 4;
    const sourceAspect = rawW / rawH;
    let sx = 0;
    let sy = 0;
    let sw = rawW;
    let sh = rawH;

    if (sourceAspect > targetAspect) {
      sw = Math.round(rawH * targetAspect);
      sx = Math.round((rawW - sw) / 2);
    } else if (sourceAspect < targetAspect) {
      sh = Math.round(rawW / targetAspect);
      sy = Math.round((rawH - sh) / 2);
    }

    const targetWidth = Math.min(900, Math.max(600, sw));
    const targetHeight = Math.round(targetWidth / targetAspect);
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    try {
      ctx.save();
      if (mirrorHorizontal) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    } catch (drawErr) {
      console.warn('Canvas draw error:', drawErr);
      return null;
    }

    // Reset transform so watermark text is readable (not mirrored)
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const thai = getThaiDateTime();
    const latNum = Number(watermarkInfo?.latitude);
    const lonNum = Number(watermarkInfo?.longitude);
    const latText = Number.isFinite(latNum) ? latNum.toFixed(6) : '13.578107';
    const lonText = Number.isFinite(lonNum) ? lonNum.toFixed(6) : '100.594069';
    const pinName =
      watermarkInfo?.workLocationName || 'มูลนิธิร่วมกุศล สมุทรปราการ (ศูนย์วิทยุบัวหลวง กู้ชีพกู้ภัย)';
    const rawAddress = watermarkInfo?.addressLine || pinName;
    const cleanAddress = rawAddress.includes('•')
      ? rawAddress.split('•').slice(1).join('•').trim()
      : rawAddress;

    const uiScale = Math.max(0.75, canvas.width / 900);
    const padX = Math.round(16 * uiScale);
    const padY = Math.round(12 * uiScale);
    const margin = Math.round(16 * uiScale);
    const maxBoxW = Math.round(canvas.width - margin * 2);
    const contentW = maxBoxW - padX * 2;

    const brandFontSize = Math.round(20 * uiScale);
    const lineFontSize = Math.round(14 * uiScale);
    const smallFontSize = Math.round(13 * uiScale);
    const lineGap = Math.round(21 * uiScale);
    const smallGap = Math.round(19 * uiScale);

    ctx.font = `500 ${smallFontSize}px ${THAI_FONT_STACK}`;
    const addressLines = wrapTextLines(ctx, `สถานที่: ${cleanAddress}`, contentW, 2);

    ctx.font = `600 ${lineFontSize}px ${THAI_FONT_STACK}`;
    const coordLines = wrapTextLines(ctx, `พิกัดที่ถ่ายรูป: ${pinName}`, contentW, 2);

    const headerH = Math.round(26 * uiScale);
    const timeAndLatLonRows = 2;
    const boxH =
      padY * 2 +
      headerH +
      timeAndLatLonRows * lineGap +
      coordLines.length * lineGap +
      addressLines.length * smallGap +
      Math.round(4 * uiScale);

    const boxX = margin;
    const boxY = Math.max(margin, canvas.height - margin - boxH);

    const grad = ctx.createLinearGradient(0, boxY - 36, 0, canvas.height);
    grad.addColorStop(0, 'rgba(2, 6, 23, 0)');
    grad.addColorStop(1, 'rgba(2, 6, 23, 0.58)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, boxY - 36, canvas.width, canvas.height - (boxY - 36));

    ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
    drawRoundedRect(ctx, boxX, boxY, maxBoxW, boxH, Math.round(12 * uiScale));
    ctx.fill();

    ctx.strokeStyle = 'rgba(16, 185, 129, 0.65)';
    ctx.lineWidth = Math.max(1.5, 2 * uiScale);
    ctx.stroke();

    ctx.fillStyle = '#10b981';
    drawRoundedRect(ctx, boxX, boxY, Math.round(5 * uiScale), boxH, Math.round(3 * uiScale));
    ctx.fill();

    let curY = boxY + padY + brandFontSize * 0.85;
    const textX = boxX + padX + Math.round(4 * uiScale);

    ctx.fillStyle = '#34d399';
    ctx.font = `700 ${brandFontSize}px ${THAI_FONT_STACK}`;
    ctx.fillText('Smart Time', textX, curY);

    const brandW = ctx.measureText('Smart Time').width;
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `500 ${Math.round(12 * uiScale)}px ${THAI_FONT_STACK}`;
    ctx.fillText('  •  LIVE CAMERA VERIFIED', textX + brandW, curY - Math.round(1 * uiScale));

    curY += Math.round(24 * uiScale);

    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${lineFontSize}px ${THAI_FONT_STACK}`;
    ctx.fillText(`เวลา: ${thai.fullThaiDate} ${thai.timeStr} น. (GMT+7)`, textX, curY);
    curY += lineGap;

    ctx.fillStyle = '#bae6fd';
    ctx.font = `600 ${lineFontSize}px ${THAI_FONT_STACK}`;
    for (const cLine of coordLines) {
      ctx.fillText(cLine, textX, curY);
      curY += lineGap;
    }

    ctx.fillStyle = '#fde68a';
    ctx.font = `600 ${lineFontSize}px monospace`;
    ctx.fillText(`ละติจูด-ลองติจูด: ${latText}, ${lonText}`, textX, curY);
    curY += lineGap;

    ctx.fillStyle = '#f1f5f9';
    ctx.font = `400 ${smallFontSize}px ${THAI_FONT_STACK}`;
    for (const aLine of addressLines) {
      ctx.fillText(aLine, textX, curY);
      curY += smallGap;
    }

    try {
      let dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      if (dataUrl.length > 650000) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.76);
      }
      if (dataUrl.length > 650000) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.65);
      }
      if (!dataUrl || dataUrl === 'data:,' || dataUrl.length < 100) {
        return null;
      }
      return dataUrl;
    } catch (exportErr) {
      console.warn('Canvas export error:', exportErr);
      return null;
    }
  };

  // Capture crisp 3:4 vertical portrait Snapshot & burn Smart Time bottom-left watermark
  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;

    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError('กำลังเชื่อมต่อสัญญาณกล้องสด กรุณารอสักครู่หรือกดปุ่ม "เปิดกล้องมือถือโดยตรง"');
      return;
    }

    setFlashEffect(true);
    setTimeout(() => setFlashEffect(false), 200);

    const rawW = video.videoWidth;
    const rawH = video.videoHeight;
    const dataUrl = renderPortraitWatermarkedCanvas(video, rawW, rawH, facingMode === 'user');
    if (!dataUrl) {
      setCameraError('ไม่สามารถบันทึกภาพจากกล้องสดในเบราว์เซอร์นี้ได้ กรุณากดปุ่ม "เปิดกล้องมือถือโดยตรง"');
      return;
    }

    stopStream();
    onPhotoCaptured(dataUrl);
  };

  // Pre-downscale high-megapixel iOS/Android camera files cleanly so low-RAM mobile browsers never crash on watermark canvas
  const processLoadedImage = (img: HTMLImageElement) => {
    const rawW = img.naturalWidth || img.width || 720;
    const rawH = img.naturalHeight || img.height || 960;

    let drawSource: HTMLImageElement | HTMLCanvasElement = img;
    let outW = rawW;
    let outH = rawH;

    if (rawW > MAX_NATIVE_PRE_DOWNSCALE_DIM || rawH > MAX_NATIVE_PRE_DOWNSCALE_DIM) {
      const ratio = Math.min(MAX_NATIVE_PRE_DOWNSCALE_DIM / rawW, MAX_NATIVE_PRE_DOWNSCALE_DIM / rawH);
      outW = Math.max(1, Math.round(rawW * ratio));
      outH = Math.max(1, Math.round(rawH * ratio));
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = outW;
      tempCanvas.height = outH;
      const tCtx = tempCanvas.getContext('2d');
      if (tCtx) {
        tCtx.imageSmoothingEnabled = true;
        tCtx.imageSmoothingQuality = 'high';
        tCtx.drawImage(img, 0, 0, outW, outH);
        drawSource = tempCanvas;
      }
    }

    const dataUrl = renderPortraitWatermarkedCanvas(drawSource, outW, outH, false);
    if (dataUrl) {
      stopStream();
      setCameraError(null);
      onPhotoCaptured(dataUrl);
    } else {
      setCameraError('ไม่สามารถประมวลผลภาพถ่ายได้ กรุณาลองถ่ายใหม่อีกครั้ง');
    }
  };

  // Handle Direct Native Camera Capture (Universal fallback for iOS/Android WebViews, older OS, or blocked WebRTC)
  const handleNativeCameraFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsProcessingNativePhoto(true);
    let settled = false;

    const loadViaFileReader = () => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        if (!result) {
          if (!settled) {
            settled = true;
            setIsProcessingNativePhoto(false);
            setCameraError('ไม่สามารถอ่านไฟล์ภาพถ่ายได้ กรุณาลองถ่ายใหม่อีกครั้ง');
          }
          return;
        }
        const fallbackImg = new Image();
        fallbackImg.onload = () => {
          if (settled) return;
          settled = true;
          try {
            processLoadedImage(fallbackImg);
          } finally {
            setIsProcessingNativePhoto(false);
          }
        };
        fallbackImg.onerror = () => {
          if (settled) return;
          settled = true;
          setIsProcessingNativePhoto(false);
          setCameraError('รูปแบบไฟล์ภาพไม่รองรับ (แนะนำตั้งค่ารูปแบบกล้องเป็น JPEG) กรุณาลองถ่ายใหม่');
        };
        fallbackImg.src = result;
      };
      reader.onerror = () => {
        if (!settled) {
          settled = true;
          setIsProcessingNativePhoto(false);
          setCameraError('ไม่สามารถเปิดไฟล์ภาพถ่ายได้ กรุณาลองถ่ายใหม่อีกครั้ง');
        }
      };
      reader.readAsDataURL(file);
    };

    try {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        if (settled) {
          try {
            URL.revokeObjectURL(objectUrl);
          } catch {}
          return;
        }
        settled = true;
        try {
          processLoadedImage(img);
        } finally {
          try {
            URL.revokeObjectURL(objectUrl);
          } catch {}
          setIsProcessingNativePhoto(false);
        }
      };
      img.onerror = () => {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {}
        loadViaFileReader();
      };
      img.src = objectUrl;
    } catch {
      loadViaFileReader();
    }
  };

  const handleTapToPlay = () => {
    const video = videoRef.current;
    if (!video) {
      startCamera();
      return;
    }
    try {
      const p = video.play?.();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          setNeedsTapToPlay(false);
          if (video.videoWidth > 0) setIsLiveReady(true);
        }).catch(() => {
          startCamera();
        });
      } else {
        startCamera();
      }
    } catch {
      startCamera();
    }
  };

  const handleRetake = () => {
    onRetake();
  };

  const thaiLive = getThaiDateTime();
  const previewLatNum = Number(watermarkInfo?.latitude);
  const previewLonNum = Number(watermarkInfo?.longitude);
  const previewLat = Number.isFinite(previewLatNum) ? previewLatNum.toFixed(6) : '13.578107';
  const previewLon = Number.isFinite(previewLonNum) ? previewLonNum.toFixed(6) : '100.594069';
  const previewPin =
    watermarkInfo?.workLocationName || 'มูลนิธิร่วมกุศล สมุทรปราการ (ศูนย์วิทยุบัวหลวง กู้ชีพกู้ภัย)';
  const previewAddr = watermarkInfo?.addressLine || previewPin;

  return (
    <div className="w-full select-none">
      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture={facingMode === 'user' ? 'user' : 'environment'}
        onChange={handleNativeCameraFile}
        className="hidden"
      />

      {/* Security Rule Badge */}
      <div className="mb-2.5 px-3 py-1.5 bg-amber-50 border border-amber-200/80 rounded-xl flex items-center justify-between text-[11px] text-amber-900">
        <div className="flex items-center gap-1.5 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>กล้องถ่ายภาพใบหน้าแนวตั้ง (LIVE CAMERA ONLY)</span>
        </div>
        <span className="text-[10px] bg-amber-200/70 text-amber-900 px-2 py-0.5 rounded-full font-semibold shrink-0">
          iOS & Android
        </span>
      </div>

      {photo ? (
        // Preview Captured Crisp Portrait Photo (bottom-left watermark unobstructed)
        <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-500 bg-slate-900 shadow-md aspect-[3/4] w-full max-w-[360px] sm:max-w-[390px] mx-auto">
          <img
            src={photo}
            alt="รูปถ่ายยืนยันตัวตนสดแนวตั้ง"
            className="w-full h-full object-cover"
          />

          <div className="absolute top-3 left-3 bg-emerald-600/95 backdrop-blur-xs text-white text-xs px-3 py-1 rounded-full flex items-center gap-1.5 font-medium shadow-xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-white" /> ถ่ายภาพแนวตั้ง & ประทับพิกัดแล้ว
          </div>

          <button
            type="button"
            onClick={handleRetake}
            className="absolute top-3 right-3 bg-white/95 hover:bg-white text-slate-800 text-xs px-3.5 py-2 rounded-xl font-semibold shadow-md flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> ถ่ายใหม่
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* Live Vertical Portrait Camera Viewfinder (3:4 mobile selfie orientation) */}
          <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-inner aspect-[3/4] w-full max-w-[360px] sm:max-w-[390px] mx-auto min-h-[360px] flex flex-col items-center justify-center">
            {/* Flash animation */}
            {flashEffect && <div className="absolute inset-0 bg-white z-30 animate-out fade-out duration-200" />}

            {/* Video Stream Element with Full iOS Safari & Android WebView Attributes */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              disablePictureInPicture
              controlsList="nodownload nofullscreen noremoteplayback"
              // @ts-ignore
              webkit-playsinline="true"
              x5-playsinline="true"
              x5-video-player-type="h5"
              x5-video-player-fullscreen="false"
              className={`w-full h-full object-cover transition-transform duration-300 ${
                facingMode === 'user' ? 'scale-x-[-1]' : ''
              }`}
            />

            {/* Live Stream Indicator Badge */}
            <div className="absolute top-3 left-3 z-20 pointer-events-none">
              <div className="bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] text-white flex items-center gap-1.5 border border-white/10 shadow-xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                <span className="font-semibold tracking-wide">LIVE แนวตั้ง</span>
              </div>
            </div>

            {/* Vertical Oval Face Guide (shifted up slightly so bottom watermark stays clear) */}
            <div className="absolute inset-0 pb-20 pointer-events-none flex items-center justify-center">
              <div className="w-44 h-56 sm:w-48 sm:h-64 rounded-full border-2 border-dashed border-emerald-400/75 shadow-[0_0_0_9999px_rgba(0,0,0,0.34)] flex items-end justify-center pb-3">
                <span className="text-[10px] sm:text-[11px] text-white/95 font-medium tracking-wide bg-black/60 px-2.5 py-0.5 rounded-full backdrop-blur-xs border border-white/15">
                  จัดใบหน้าให้อยู่ในกรอบแนวตั้ง
                </span>
              </div>
            </div>

            {/* Top Right Controls: Switch Camera */}
            <div className="absolute top-3 right-3 z-20 pointer-events-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleFacingMode}
                className="bg-black/60 hover:bg-black/80 text-white px-2.5 py-1.5 rounded-xl backdrop-blur-md transition active:scale-90 flex items-center gap-1.5 text-xs border border-white/10 cursor-pointer shadow-md"
                title="สลับกล้องหน้า/หลัง"
              >
                <SwitchCamera className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-[11px]">{facingMode === 'user' ? 'กล้องหน้า' : 'กล้องหลัง'}</span>
              </button>
            </div>

            {/* Initializing / Native Processing Loading Overlay */}
            {(isInitializing || isProcessingNativePhoto) && !cameraError && (
              <div className="absolute inset-0 bg-slate-950/65 backdrop-blur-xs p-5 flex flex-col items-center justify-center text-center z-23 text-white pointer-events-none">
                <RefreshCw className="w-7 h-7 text-emerald-400 animate-spin mb-2" />
                <p className="text-xs font-semibold text-slate-100">
                  {isProcessingNativePhoto ? 'กำลังประทับลายน้ำและพิกัด GPS...' : 'กำลังเชื่อมต่อกล้องแนวตั้ง...'}
                </p>
              </div>
            )}

            {/* Tap-to-play overlay when mobile Safari/Chrome requires a direct tap gesture to start video */}
            {needsTapToPlay && !cameraError && (
              <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-xs p-5 flex flex-col items-center justify-center text-center z-24 text-white gap-2.5">
                <button
                  type="button"
                  onClick={handleTapToPlay}
                  className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold rounded-2xl flex items-center gap-2 transition active:scale-95 shadow-lg cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>แตะเพื่อเปิดภาพจากกล้อง</span>
                </button>
                <button
                  type="button"
                  onClick={() => nativeCameraInputRef.current?.click()}
                  className="px-4 py-2 bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>หรือเปิดกล้องมือถือโดยตรง</span>
                </button>
              </div>
            )}

            {/* Error Message + Native Camera Fallback if WebRTC getUserMedia blocked or unsupported */}
            {cameraError && (
              <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md p-5 flex flex-col items-center justify-center text-center z-25 text-white">
                <div className="w-12 h-12 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mb-3">
                  <AlertCircle className="w-6 h-6 text-rose-400" />
                </div>
                <p className="text-sm font-semibold text-rose-300 mb-1">ไม่สามารถเปิดกล้องสดในเบราว์เซอร์นี้ได้</p>
                <p className="text-xs text-slate-300 max-w-xs leading-relaxed mb-4">{cameraError}</p>
                <div className="flex flex-col gap-2 w-full max-w-xs">
                  <button
                    type="button"
                    onClick={() => nativeCameraInputRef.current?.click()}
                    disabled={isProcessingNativePhoto}
                    className="w-full px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition active:scale-95 shadow-md cursor-pointer disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4" />
                    <span>เปิดกล้องมือถือโดยตรง</span>
                  </button>
                  <button
                    type="button"
                    onClick={startCamera}
                    disabled={isInitializing}
                    className="w-full px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition active:scale-95 shadow-md cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isInitializing ? 'animate-spin' : ''}`} />
                    {isInitializing ? 'กำลังเปิดกล้อง...' : 'ลองเปิดกล้องสดอีกครั้ง'}
                  </button>
                </div>
              </div>
            )}

            {/* Bottom Bar: Left Live Watermark Preview + Right Shutter Button (non-overlapping) */}
            <div className="absolute bottom-2.5 inset-x-2.5 z-20 flex items-end justify-between gap-2 pointer-events-none">
              <div className="bg-slate-950/82 backdrop-blur-md border border-emerald-400/40 border-l-4 border-l-emerald-400 rounded-xl px-2.5 py-1.5 text-white max-w-[70%] space-y-0.5 shadow-lg">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-300 leading-tight">
                  <span>Smart Time</span>
                  <span className="text-[9px] text-slate-300 font-normal">• {thaiLive.timeStr} น.</span>
                </div>
                <div className="text-[10px] text-sky-200 font-medium truncate flex items-center gap-1">
                  <MapPin className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                  <span className="truncate">{previewPin}</span>
                </div>
                <div className="text-[9px] font-mono text-amber-200 truncate">
                  Lat/Lon: {previewLat}, {previewLon}
                </div>
                <div className="text-[9px] text-slate-200 line-clamp-1">
                  {previewAddr}
                </div>
              </div>

              <div className="flex flex-col items-center gap-1 pointer-events-auto shrink-0">
                <button
                  type="button"
                  onClick={handleCapture}
                  disabled={isInitializing || !!cameraError || !isLiveReady}
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white hover:bg-slate-100 p-1 flex items-center justify-center shadow-xl active:scale-90 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="กดเพื่อถ่ายรูปใบหน้าแนวตั้ง"
                >
                  <div className="w-full h-full rounded-full border-4 border-slate-900 flex items-center justify-center bg-white hover:bg-slate-50 transition">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-emerald-500 flex items-center justify-center shadow-inner">
                      <Camera className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    </div>
                  </div>
                </button>
                <span className="text-[10px] font-medium text-white/95 drop-shadow-md">
                  กดถ่ายภาพ
                </span>
              </div>
            </div>
          </div>

          {/* Always-visible Universal Mobile Camera Fallback Bar (works across all Android/iOS versions & in-app browsers like LINE/Facebook) */}
          <div className="max-w-[360px] sm:max-w-[390px] mx-auto flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            <span className="text-[11px] text-slate-600 leading-tight">
              หากจอดำหรือเปิดจาก LINE / Safari รุ่นเก่า:
            </span>
            <button
              type="button"
              onClick={() => nativeCameraInputRef.current?.click()}
              disabled={isProcessingNativePhoto}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold rounded-lg flex items-center gap-1.5 transition active:scale-95 shrink-0 cursor-pointer disabled:opacity-50"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>{isProcessingNativePhoto ? 'กำลังประมวลผล...' : 'ใช้กล้องมือถือโดยตรง'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
