import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Smartphone, Share, PlusSquare, Download, Check, X, Apple, CheckCircle2, ShieldCheck, QrCode, Copy } from 'lucide-react';

interface MobileInstallPromptProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileInstallPrompt: React.FC<MobileInstallPromptProps> = ({
  isOpen,
  onClose,
}) => {
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [qrUrl, setQrUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      QRCode.toDataURL(window.location.origin, {
        width: 260,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
      }).then((url) => setQrUrl(url)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    // Detect OS
    const ua = navigator.userAgent || '';
    const iosMatch = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const androidMatch = /Android/.test(ua);

    setIsIOS(iosMatch);
    setIsAndroid(androidMatch);

    // Detect if already installed (standalone mode)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;
    setIsInstalled(isStandalone);

    // Capture Android install prompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200 border border-slate-100">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/30 rounded-xl border border-indigo-400/30">
              <Smartphone className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">ติดตั้งแอปบนมือถือ</h3>
              <p className="text-xs text-slate-300">รองรับทั้ง iOS (iPhone) และ Android</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {isInstalled ? (
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <p className="font-bold text-emerald-900 text-sm">แอปพลิเคชันได้รับการติดตั้งแล้ว</p>
              <p className="text-xs text-emerald-700">
                คุณกำลังใช้งานในโหมดแอปพลิเคชันเต็มหน้าจอ (Standalone) ข้อมูลลงเวลาและเวลาไทยทำงานเต็มประสิทธิภาพ
              </p>
            </div>
          ) : (
            <>
              {/* QR Code Scannable Banner */}
              <div className="p-3.5 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center gap-3.5">
                <div className="p-1.5 bg-white rounded-xl border border-slate-200 shrink-0 shadow-xs">
                  {qrUrl ? (
                    <img src={qrUrl} alt="Scan QR" className="w-20 h-20 rounded-lg block" />
                  ) : (
                    <div className="w-20 h-20 flex items-center justify-center text-[10px] text-slate-400">QR</div>
                  )}
                </div>
                <div className="text-xs text-indigo-950 flex-1">
                  <p className="font-bold flex items-center gap-1">
                    <QrCode className="w-3.5 h-3.5 text-indigo-600" />
                    <span>สแกนเปิดบนโทรศัพท์มือถือ</span>
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                    เปิดกล้องมือถือสแกน QR Code นี้เพื่อเปิดระบบ แล้วทำตามขั้นตอนด้านล่างเพื่อเพิ่มลงหน้าจอโฮม
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.origin);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="mt-1.5 text-[10px] font-semibold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 cursor-pointer"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? 'คัดลอกลิงก์แล้ว' : 'คัดลอกลิงก์เพื่อส่งใน LINE'}</span>
                  </button>
                </div>
              </div>

              {/* iOS Guide */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
                    <Apple className="w-4 h-4 text-slate-800" />
                    <span>สำหรับ Apple iPhone / iPad (iOS)</span>
                  </div>
                  {isIOS && (
                    <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                      อุปกรณ์ของคุณ
                    </span>
                  )}
                </div>

                <ol className="space-y-2 text-xs text-slate-600">
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                      1
                    </span>
                    <span>
                      เปิดเว็บนี้ผ่าน <strong>Safari</strong> แล้วแตะปุ่ม <strong>แชร์ (Share)</strong>{' '}
                      <Share className="w-3.5 h-3.5 inline text-sky-600 -mt-0.5" /> ที่แถบเมนูด้านล่างของจอ
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                      2
                    </span>
                    <span>
                      เลื่อนลงมาแล้วเลือกเมนู <strong>"เพิ่มไปยังหน้าจอโฮม" (Add to Home Screen)</strong>{' '}
                      <PlusSquare className="w-3.5 h-3.5 inline text-slate-700 -mt-0.5" />
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                      3
                    </span>
                    <span>
                      แตะปุ่ม <strong>"เพิ่ม" (Add)</strong> มุมขวาบน จะมีไอคอนแอปปรากฏบนหน้าจอมือถือของคุณทันที
                    </span>
                  </li>
                </ol>
              </div>

              {/* Android Guide */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
                    <Smartphone className="w-4 h-4 text-emerald-600" />
                    <span>สำหรับ Android (Samsung, Xiaomi, OPPO ฯลฯ)</span>
                  </div>
                  {isAndroid && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                      อุปกรณ์ของคุณ
                    </span>
                  )}
                </div>

                {deferredPrompt ? (
                  <button
                    type="button"
                    onClick={handleInstallClick}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition active:scale-95 shadow-xs"
                  >
                    <Download className="w-4 h-4" />
                    <span>กดที่นี่เพื่อติดตั้งแอปบน Android ทันที</span>
                  </button>
                ) : (
                  <ol className="space-y-2 text-xs text-slate-600">
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                        1
                      </span>
                      <span>
                        เปิดผ่าน <strong>Google Chrome</strong> แล้วแตะเมนูจุดสามจุด <strong>(⋮)</strong> มุมขวาบน
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                        2
                      </span>
                      <span>
                        เลือก <strong>"ติดตั้งแอป" (Install app)</strong> หรือ <strong>"เพิ่มลงในหน้าจอหลัก"</strong>
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                        3
                      </span>
                      <span>กดปุ่ม <strong>"ติดตั้ง"</strong> เพื่อใช้งานเต็มหน้าจอโดยไม่ต้องเปิดเว็บเบราว์เซอร์</span>
                    </li>
                  </ol>
                )}
              </div>
            </>
          )}

          {/* Thai Time & Hardware feature note */}
          <div className="p-3 bg-indigo-50/70 rounded-xl border border-indigo-100 text-xs text-indigo-900 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-indigo-950">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              <span>ความแม่นยำของเวลาและพิกัด</span>
            </div>
            <p className="text-[11px] leading-relaxed text-indigo-800">
              ระบบเชื่อมต่อเวลามาตรฐานประเทศไทย (Asia/Bangkok GMT+7) อัตโนมัติ พร้อมตรวจจับสัญญาณ GPS และกล้องหน้าเซลฟี่ได้เต็มรูปแบบทั้งบน iOS และ Android
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
          >
            เข้าใจแล้ว / ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
};
