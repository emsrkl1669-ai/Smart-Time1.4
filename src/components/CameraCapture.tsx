import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, CheckCircle2, AlertCircle, SwitchCamera, ShieldCheck, Lock, Radio } from 'lucide-react';
import { getThaiDateTime } from '../utils/thaiTime';

interface CameraCaptureProps {
  photo: string;
  onPhotoCaptured: (photoBase64: string) => void;
  onRetake: () => void;
}

export const CameraCapture: React.FC<CameraCaptureProps> = ({
  photo,
  onPhotoCaptured,
  onRetake,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isInitializing, setIsInitializing] = useState(false);
  const [flashEffect, setFlashEffect] = useState(false);
  const [isLiveReady, setIsLiveReady] = useState(false);

  // Stop camera stream safely
  const stopStream = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      setStream(null);
    }
  }, [stream]);

  // Start Live Camera stream
  const startCamera = useCallback(async () => {
    setIsInitializing(true);
    setCameraError(null);
    setIsLiveReady(false);

    // Stop existing stream if running
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
      setCameraError('อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับการเปิดกล้องเว็บแคมโดยตรง กรุณาใช้งานผ่าน Safari (iOS) หรือ Chrome (Android/PC)');
      setIsInitializing(false);
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
          setIsLiveReady(true);
          videoRef.current?.play().catch((err) => {
            console.warn('Video auto-play warning:', err);
          });
        };
      }
    } catch (err: any) {
      console.warn('Live camera access error:', err);
      let errorMsg = 'ไม่สามารถเปิดกล้องสดได้ กรุณาอนุญาตการเข้าถึงกล้องในการตั้งค่าเบราว์เซอร์';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'การเข้าถึงกล้องถูกปฏิเสธ กรุณากดอนุญาตให้ใช้งานกล้องถ่ายรูปในการตั้งค่าเบราว์เซอร์';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'ไม่พบอุปกรณ์กล้องถ่ายภาพบนอุปกรณ์นี้';
      }
      setCameraError(`${errorMsg} (ระบบไม่อนุญาตให้อัปโหลดภาพจากแกลเลอรีทุกกรณีเพื่อความโปร่งใส)`);
    } finally {
      setIsInitializing(false);
    }
  }, [facingMode, stream]);

  // Initial mount or mode change
  useEffect(() => {
    if (!photo) {
      startCamera();
    } else {
      stopStream();
    }

    return () => {
      stopStream();
    };
  }, [facingMode, photo]);

  // Switch between front and back camera
  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  // Capture Snapshot from Live Video
  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      alert('กำลังเชื่อมต่อสัญญาณกล้องสด กรุณารอสักครู่แล้วกดถ่ายใหม่อีกครั้ง');
      return;
    }

    setFlashEffect(true);
    setTimeout(() => setFlashEffect(false), 200);

    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Mirror image for front selfie camera
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Reset transform for watermark overlay
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Thai Real-Time watermark with security verification badge
    const thai = getThaiDateTime();
    const stamp = `${thai.formattedDateTime} (GMT+7)`;

    // Draw Dark Overlay Banner
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(8, canvas.height - 48, Math.min(380, canvas.width - 16), 40);

    // Watermark Texts
    ctx.fillStyle = '#10b981'; // emerald-500
    ctx.font = 'bold 11px Kanit, sans-serif';
    ctx.fillText('🔴 LIVE CAMERA VERIFIED • ถ่ายจากกล้องสด', 18, canvas.height - 30);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Kanit, sans-serif';
    ctx.fillText(`🕒 ${stamp}`, 18, canvas.height - 14);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);

    // Stop live stream after photo taken
    stopStream();

    onPhotoCaptured(dataUrl);
  };

  const handleRetake = () => {
    onRetake();
  };

  return (
    <div className="w-full select-none">
      <canvas ref={canvasRef} className="hidden" />

      {/* Security Rule Badge */}
      <div className="mb-2 px-3 py-1.5 bg-amber-50 border border-amber-200/80 rounded-xl flex items-center justify-between text-[11px] text-amber-900">
        <div className="flex items-center gap-1.5 font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>ระบบถ่ายภาพสด (LIVE CAMERA ONLY)</span>
        </div>
        <span className="text-[10px] bg-amber-200/70 text-amber-900 px-2 py-0.5 rounded-full font-semibold">
          ห้ามอัปโหลดจากแกลเลอรี
        </span>
      </div>

      {photo ? (
        // Preview Captured Photo
        <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-500 bg-slate-900 shadow-md">
          <img src={photo} alt="รูปถ่ายยืนยันตัวตนสด" className="w-full h-64 object-cover" />
          
          <div className="absolute top-3 left-3 bg-emerald-600/95 backdrop-blur-xs text-white text-xs px-3 py-1 rounded-full flex items-center gap-1.5 font-medium shadow-xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-white" /> ถ่ายจากกล้องสดเรียบร้อย
          </div>

          <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-xs text-white text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1">
            <Lock className="w-3 h-3 text-emerald-400" /> ตรวจสอบแล้ว: ไม่ใช่รูปจากคลังภาพ
          </div>

          <button
            type="button"
            onClick={handleRetake}
            className="absolute bottom-3 right-3 bg-white/95 hover:bg-white text-slate-800 text-xs px-3.5 py-2 rounded-xl font-semibold shadow-md flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> ถ่ายใหม่
          </button>
        </div>
      ) : (
        // Live Camera Viewfinder
        <div className="relative rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-inner h-64 sm:h-72 flex flex-col items-center justify-center">
          {/* Flash animation */}
          {flashEffect && <div className="absolute inset-0 bg-white z-30 animate-out fade-out duration-200" />}

          {/* Video Stream Element with Full iOS Safari & Android Attributes */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            // @ts-ignore
            webkit-playsinline="true"
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
              <span className="font-semibold tracking-wide">LIVE สด</span>
            </div>
          </div>

          {/* Oval Face Guide */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-40 h-52 sm:w-44 sm:h-56 rounded-full border-2 border-dashed border-emerald-400/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.40)] flex items-center justify-center">
              <span className="text-[11px] text-white/90 font-medium tracking-wide bg-black/60 px-3 py-1 rounded-full backdrop-blur-xs border border-white/15">
                จัดใบหน้าให้อยู่ในกรอบ
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

          {/* Bottom Live Shutter Control */}
          <div className="absolute bottom-3 inset-x-0 flex items-center justify-center z-20 pointer-events-auto">
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={handleCapture}
                disabled={isInitializing || !!cameraError || !isLiveReady}
                className="w-16 h-16 rounded-full bg-white hover:bg-slate-100 p-1 flex items-center justify-center shadow-xl active:scale-90 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="กดเพื่อถ่ายรูปจากกล้องสด"
              >
                <div className="w-full h-full rounded-full border-4 border-slate-900 flex items-center justify-center bg-white hover:bg-slate-50 transition">
                  <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shadow-inner">
                    <Camera className="w-5 h-5 text-white" />
                  </div>
                </div>
              </button>
              <span className="text-[11px] font-medium text-white/90 drop-shadow-md">
                กดปุ่มเพื่อถ่ายภาพสด
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
