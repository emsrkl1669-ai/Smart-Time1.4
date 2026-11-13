import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, CheckCircle2, AlertCircle, SwitchCamera, ShieldCheck, MapPin } from 'lucide-react';
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
        // Put remainder on last line and truncate cleanly if needed
        break;
      }
    } else {
      currentLine = candidate;
    }
  }

  // Handle remaining characters if broke early or finished loop
  const consumedLen = lines.join('').length;
  const remaining = lines.length >= maxLines - 1 ? text.slice(text.indexOf(currentLine) >= 0 ? text.indexOf(currentLine) : consumedLen).trim() : currentLine.trim();
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
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef(true);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isInitializing, setIsInitializing] = useState(false);
  const [flashEffect, setFlashEffect] = useState(false);
  const [isLiveReady, setIsLiveReady] = useState(false);

  // Stop camera stream safely using ref (prevents Android NotReadableError on camera switch/retake)
  const stopStream = useCallback(() => {
    const activeStream = streamRef.current;
    if (activeStream) {
      activeStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch {
        // ignore
      }
    }
  }, []);

  // Polyfill-safe getUserMedia helper across iOS Safari (all versions), Android Chrome, Samsung Internet, and In-App Browsers
  const requestCameraStreamWithFallbacks = async (
    preferredFacing: 'user' | 'environment'
  ): Promise<MediaStream> => {
    const navAny = navigator as any;
    const getUserMediaFn =
      navigator?.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices) ||
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

    // Progressive vertical portrait constraints (prevents OverconstrainedError on older iOS/Android sensors)
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
    for (const constraints of attempts) {
      try {
        return await getUserMediaFn(constraints);
      } catch (err: any) {
        lastError = err;
        // Stop retrying only on explicit permission refusal
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          throw err;
        }
      }
    }
    throw lastError || new Error('Cannot acquire camera stream');
  };

  // Start Live Portrait Camera stream
  const startCamera = useCallback(async () => {
    setIsInitializing(true);
    setCameraError(null);
    setIsLiveReady(false);
    stopStream();

    if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      setCameraError('เบราว์เซอร์บนมือถือต้องเปิดผ่าน HTTPS จึงจะอนุญาตให้ใช้กล้องได้ กรุณาเปิดผ่านลิงก์ HTTPS ของระบบ');
      setIsInitializing(false);
      return;
    }

    try {
      const mediaStream = await requestCameraStreamWithFallbacks(facingMode);

      if (!isMountedRef.current) {
        mediaStream.getTracks().forEach((t) => {
          try { t.stop(); } catch {}
        });
        return;
      }

      streamRef.current = mediaStream;

      const video = videoRef.current;
      if (video) {
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.setAttribute('x5-playsinline', 'true');
        video.muted = true;
        video.srcObject = mediaStream;

        const markReadyAndPlay = () => {
          if (!isMountedRef.current) return;
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            setIsLiveReady(true);
          }
          const playPromise = video.play?.();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch((err) => {
              console.warn('Video auto-play notice:', err);
            });
          }
        };

        video.onloadedmetadata = markReadyAndPlay;
        video.oncanplay = markReadyAndPlay;
        video.onplaying = () => {
          if (isMountedRef.current) setIsLiveReady(true);
        };

        // Older Android WebViews sometimes skip loadedmetadata if stream starts hot
        setTimeout(() => {
          if (isMountedRef.current && video.videoWidth > 0) {
            setIsLiveReady(true);
          }
        }, 450);
      }
    } catch (err: any) {
      console.warn('Live camera access error:', err);
      let errorMsg = 'ไม่สามารถเปิดกล้องสดได้ กรุณาอนุญาตการเข้าถึงกล้องในการตั้งค่าเบราว์เซอร์';
      if (err?.name === 'UnsupportedBrowserError') {
        errorMsg = 'เบราว์เซอร์ในแอปนี้จำกัดการเปิดกล้อง กรุณากดเปิดลิงก์ใน Safari (iOS) หรือ Google Chrome (Android)';
      } else if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        errorMsg = 'การเข้าถึงกล้องถูกปฏิเสธ กรุณากด "อนุญาต (Allow)" กล้องในการตั้งค่าเบราว์เซอร์หรือโทรศัพท์';
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        errorMsg = 'ไม่พบอุปกรณ์กล้องถ่ายภาพบนเครื่องนี้';
      } else if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
        errorMsg = 'กล้องกำลังถูกใช้งานโดยแอปอื่น กรุณาปิดแอปอื่นแล้วกด "ลองเปิดกล้องอีกครั้ง"';
      }
      setCameraError(`${errorMsg} (ระบบไม่อนุญาตให้อัปโหลดภาพจากแกลเลอรีเพื่อความโปร่งใส)`);
    } finally {
      if (isMountedRef.current) {
        setIsInitializing(false);
      }
    }
  }, [facingMode, stopStream]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
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

  // Switch between front and back camera
  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  // Capture crisp 3:4 vertical portrait Snapshot & burn Smart Time bottom-left watermark
  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError('กำลังเชื่อมต่อสัญญาณกล้องสด กรุณารอสักครู่แล้วลองใหม่อีกครั้ง');
      return;
    }

    setFlashEffect(true);
    setTimeout(() => setFlashEffect(false), 200);

    const canvas = canvasRef.current;
    const rawW = video.videoWidth || 720;
    const rawH = video.videoHeight || 960;

    // Crop video center cleanly to vertical 3:4 portrait aspect ratio matching the live viewfinder
    const targetAspect = 3 / 4;
    const sourceAspect = rawW / rawH;
    let sx = 0;
    let sy = 0;
    let sw = rawW;
    let sh = rawH;

    if (sourceAspect > targetAspect) {
      // Sensor is wider than 3:4 (e.g. 16:9 or 4:3 landscape sensor) -> crop horizontally to centered 3:4
      sw = Math.round(rawH * targetAspect);
      sx = Math.round((rawW - sw) / 2);
    } else if (sourceAspect < targetAspect) {
      // Sensor is taller than 3:4 (e.g. 9:16 sensor) -> crop vertically to centered 3:4
      sh = Math.round(rawW / targetAspect);
      sy = Math.round((rawH - sh) / 2);
    }

    const targetWidth = Math.min(900, Math.max(600, sw));
    const targetHeight = Math.round(targetWidth / targetAspect);
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Mirror image horizontally for front selfie camera
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    // Reset transform so watermark text is readable (not mirrored)
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Build watermark strings (Smart Time, Coordinates, Lat/Lon, Time, Full Street Address)
    const thai = getThaiDateTime();
    const latText =
      watermarkInfo?.latitude !== undefined ? watermarkInfo.latitude.toFixed(6) : '13.578107';
    const lonText =
      watermarkInfo?.longitude !== undefined ? watermarkInfo.longitude.toFixed(6) : '100.594069';
    const pinName = watermarkInfo?.workLocationName || 'มูลนิธิร่วมกุศล สมุทรปราการ (ศูนย์วิทยุบัวหลวง กู้ชีพกู้ภัย)';
    const rawAddress = watermarkInfo?.addressLine || pinName;
    const cleanAddress = rawAddress.includes('•')
      ? rawAddress.split('•').slice(1).join('•').trim()
      : rawAddress;

    // Scale typography cleanly relative to portrait canvas width (~900px)
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

    ctx.font = `500 ${smallFontSize}px Kanit, "Noto Sans Thai", sans-serif`;
    const addressLines = wrapTextLines(ctx, `สถานที่: ${cleanAddress}`, contentW, 2);

    ctx.font = `600 ${lineFontSize}px Kanit, "Noto Sans Thai", sans-serif`;
    const coordLines = wrapTextLines(ctx, `พิกัดที่ถ่ายรูป: ${pinName}`, contentW, 2);

    // Total lines height calculation
    const headerH = Math.round(26 * uiScale);
    const timeAndLatLonRows = 2; // Row 1: Time, Row 2: Lat/Lon
    const boxH =
      padY * 2 +
      headerH +
      timeAndLatLonRows * lineGap +
      coordLines.length * lineGap +
      addressLines.length * smallGap +
      Math.round(4 * uiScale);

    const boxX = margin;
    const boxY = Math.max(margin, canvas.height - margin - boxH);

    // Subtle dark gradient backdrop at bottom-left + rounded glass card
    const grad = ctx.createLinearGradient(0, boxY - 36, 0, canvas.height);
    grad.addColorStop(0, 'rgba(2, 6, 23, 0)');
    grad.addColorStop(1, 'rgba(2, 6, 23, 0.58)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, boxY - 36, canvas.width, canvas.height - (boxY - 36));

    ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
    drawRoundedRect(ctx, boxX, boxY, maxBoxW, boxH, Math.round(12 * uiScale));
    ctx.fill();

    // Accent left emerald bar & border
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.65)';
    ctx.lineWidth = Math.max(1.5, 2 * uiScale);
    ctx.stroke();

    ctx.fillStyle = '#10b981';
    drawRoundedRect(ctx, boxX, boxY, Math.round(5 * uiScale), boxH, Math.round(3 * uiScale));
    ctx.fill();

    let curY = boxY + padY + brandFontSize * 0.85;
    const textX = boxX + padX + Math.round(4 * uiScale);

    // Line 1: Smart Time Brand + Verified Stamp
    ctx.fillStyle = '#34d399';
    ctx.font = `700 ${brandFontSize}px Kanit, "Noto Sans Thai", sans-serif`;
    ctx.fillText('Smart Time', textX, curY);

    const brandW = ctx.measureText('Smart Time').width;
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `500 ${Math.round(12 * uiScale)}px Kanit, "Noto Sans Thai", sans-serif`;
    ctx.fillText('  •  LIVE CAMERA VERIFIED', textX + brandW, curY - Math.round(1 * uiScale));

    curY += Math.round(24 * uiScale);

    // Line 2: Thai Standard Date & Time
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${lineFontSize}px Kanit, "Noto Sans Thai", sans-serif`;
    ctx.fillText(`เวลา: ${thai.fullThaiDate} ${thai.timeStr} น. (GMT+7)`, textX, curY);
    curY += lineGap;

    // Line 3: Capture Pin / Location Name
    ctx.fillStyle = '#bae6fd';
    ctx.font = `600 ${lineFontSize}px Kanit, "Noto Sans Thai", sans-serif`;
    for (const cLine of coordLines) {
      ctx.fillText(cLine, textX, curY);
      curY += lineGap;
    }

    // Line 4: Latitude - Longitude
    ctx.fillStyle = '#fde68a';
    ctx.font = `600 ${lineFontSize}px monospace`;
    ctx.fillText(`ละติจูด-ลองติจูด: ${latText}, ${lonText}`, textX, curY);
    curY += lineGap;

    // Line 5+: Detailed Street / Subdistrict Address
    ctx.fillStyle = '#f1f5f9';
    ctx.font = `400 ${smallFontSize}px Kanit, "Noto Sans Thai", sans-serif`;
    for (const aLine of addressLines) {
      ctx.fillText(aLine, textX, curY);
      curY += smallGap;
    }

    let dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    if (dataUrl.length > 650000) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.76);
    }
    if (dataUrl.length > 650000) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.65);
    }

    // Stop live stream after photo taken
    stopStream();

    onPhotoCaptured(dataUrl);
  };

  const handleRetake = () => {
    onRetake();
  };

  const thaiLive = getThaiDateTime();
  const previewLat =
    watermarkInfo?.latitude !== undefined ? watermarkInfo.latitude.toFixed(6) : '13.578107';
  const previewLon =
    watermarkInfo?.longitude !== undefined ? watermarkInfo.longitude.toFixed(6) : '100.594069';
  const previewPin = watermarkInfo?.workLocationName || 'มูลนิธิร่วมกุศล สมุทรปราการ (ศูนย์วิทยุบัวหลวง กู้ชีพกู้ภัย)';
  const previewAddr = watermarkInfo?.addressLine || previewPin;

  return (
    <div className="w-full select-none">
      <canvas ref={canvasRef} className="hidden" />

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
        // Live Vertical Portrait Camera Viewfinder (3:4 mobile selfie orientation)
        <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-inner aspect-[3/4] w-full max-w-[360px] sm:max-w-[390px] mx-auto min-h-[420px] flex flex-col items-center justify-center">
          {/* Flash animation */}
          {flashEffect && <div className="absolute inset-0 bg-white z-30 animate-out fade-out duration-200" />}

          {/* Video Stream Element with Full iOS Safari & Android WebView Attributes */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            // @ts-ignore
            webkit-playsinline="true"
            x5-playsinline="true"
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
          <div className="absolute top-3 right-3 z-20 pointer-events-auto flex items-center gap-2">
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

          {/* Error Message if camera blocked / permission denied */}
          {cameraError && (
            <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md p-5 flex flex-col items-center justify-center text-center z-25 text-white">
              <div className="w-12 h-12 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mb-3">
                <AlertCircle className="w-6 h-6 text-rose-400" />
              </div>
              <p className="text-sm font-semibold text-rose-300 mb-1">ไม่สามารถเข้าถึงกล้องสดได้</p>
              <p className="text-xs text-slate-300 max-w-xs leading-relaxed mb-4">{cameraError}</p>
              <button
                type="button"
                onClick={startCamera}
                disabled={isInitializing}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition active:scale-95 shadow-md cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isInitializing ? 'animate-spin' : ''}`} />
                {isInitializing ? 'กำลังเปิดกล้อง...' : 'ลองเปิดกล้องอีกครั้ง'}
              </button>
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
      )}
    </div>
  );
};
