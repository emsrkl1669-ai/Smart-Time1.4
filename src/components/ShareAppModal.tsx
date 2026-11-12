import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  QrCode,
  Copy,
  Check,
  Share2,
  Download,
  Lock,
  Eye,
  EyeOff,
  User as UserIcon,
  Building2,
  ShieldCheck,
  X,
  Smartphone,
  ExternalLink,
  Search,
  Key,
  Shield,
  Send,
  Sparkles,
  Info,
} from 'lucide-react';
import { User, Department } from '../types';
import { api, getPublicAppUrl } from '../services/api';

interface ShareAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  users?: User[];
  departments?: Department[];
  targetUser?: User | null;
  initialTab?: 'share' | 'credentials';
}

export const ShareAppModal: React.FC<ShareAppModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  users = [],
  departments = [],
  targetUser,
  initialTab = 'share',
}) => {
  const [activeTab, setActiveTab] = useState<'share' | 'credentials'>(initialTab);
  const [appQrUrl, setAppQrUrl] = useState<string>('');
  const [userQrUrl, setUserQrUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCredentials, setCopiedCredentials] = useState(false);
  const [copiedUserOnly, setCopiedUserOnly] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // User selection for credentials distribution
  const isAdmin = currentUser.role === 'admin';
  const [selectedUserId, setSelectedUserId] = useState<string>(
    targetUser?.id || currentUser.id
  );
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [passwordsMap, setPasswordsMap] = useState<Record<string, string>>({});
  const [shareSuccessToast, setShareSuccessToast] = useState<string | null>(null);

  // Base URL (Uses Public Shared URL so external devices/phones can access without Google developer auth)
  const baseUrl = typeof window !== 'undefined' ? getPublicAppUrl() : '';

  // Load passwords when admin
  useEffect(() => {
    if (isAdmin && isOpen) {
      api.getUsersWithPasswords().then((list) => {
        const map: Record<string, string> = {};
        list.forEach((u) => {
          if (u.id && (u as any).password) {
            map[u.id] = (u as any).password;
          }
        });
        setPasswordsMap(map);
      }).catch(() => {});
    }
  }, [isAdmin, isOpen]);

  // Set target user when prop changes
  useEffect(() => {
    if (targetUser) {
      setSelectedUserId(targetUser.id);
      setActiveTab('credentials');
    }
  }, [targetUser]);

  // Selected User object
  const selectedUser = users.find((u) => u.id === selectedUserId) || currentUser;
  const userPassword =
    passwordsMap[selectedUser.id] ||
    (selectedUser.username === 'admin' ? 'admin123' : '123456');

  // Personal Direct Login URL with auto-fill username query
  const personalLoginUrl = `${baseUrl}?u=${encodeURIComponent(selectedUser.username)}`;

  // Generate App QR Code
  useEffect(() => {
    if (!baseUrl) return;
    QRCode.toDataURL(baseUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    })
      .then((url) => setAppQrUrl(url))
      .catch((err) => console.error('Failed to generate App QR', err));
  }, [baseUrl]);

  // Generate Personal Login QR Code
  useEffect(() => {
    if (!personalLoginUrl) return;
    QRCode.toDataURL(personalLoginUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: '#1e1b4b', // deep indigo
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    })
      .then((url) => setUserQrUrl(url))
      .catch((err) => console.error('Failed to generate Personal QR', err));
  }, [personalLoginUrl]);

  if (!isOpen) return null;

  // Copy standard app link
  const handleCopyAppLink = () => {
    navigator.clipboard.writeText(baseUrl);
    setCopiedLink(true);
    setShareSuccessToast('คัดลอกลิงก์ระบบเรียบร้อยแล้ว');
    setTimeout(() => {
      setCopiedLink(false);
      setShareSuccessToast(null);
    }, 2500);
  };

  // Copy personal credentials card text
  const handleCopyCredentials = () => {
    const formattedText = `🔐 ข้อมูลเข้าใช้งานระบบ Smart Time Attendance (ความลับเฉพาะบุคคล)\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 ชื่อ-นามสกุล: ${selectedUser.fullName}\n` +
      `🏢 ฝ่าย/สังกัด: ${selectedUser.departmentName}\n` +
      `💼 ตำแหน่ง: ${selectedUser.position || '-'}\n` +
      `🪪 รหัสพนักงาน: ${selectedUser.employeeCode}\n\n` +
      `🆔 ชื่อผู้ใช้งาน (Username): ${selectedUser.username}\n` +
      `🔑 รหัสผ่าน (Password): ${userPassword}\n\n` +
      `🌐 ลิงก์เข้าใช้งานระบบ: ${personalLoginUrl}\n` +
      `(คลิกลิงก์เพื่อเปิดหน้าลงเวลาและใส่ชื่อผู้ใช้ให้อัตโนมัติ สามารถใช้งานได้จากทุกเครื่องและอุปกรณ์ ทั้งมือถือและคอมพิวเตอร์)\n\n` +
      `⚠️ คำเตือนความปลอดภัย: ข้อมูลนี้เป็นความลับเฉพาะตัวบุคคล กรุณาอย่าส่งต่อให้ผู้อื่น เพื่อความโปร่งใสและถูกต้องของข้อมูลการลงเวลาทำงาน\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    navigator.clipboard.writeText(formattedText);
    setCopiedCredentials(true);
    setShareSuccessToast(`คัดลอกข้อมูลและรหัสผ่านของ "${selectedUser.fullName}" เรียบร้อยแล้ว`);
    setTimeout(() => {
      setCopiedCredentials(false);
      setShareSuccessToast(null);
    }, 3000);
  };

  // Copy personal link only
  const handleCopyPersonalLinkOnly = () => {
    navigator.clipboard.writeText(personalLoginUrl);
    setCopiedUserOnly(true);
    setShareSuccessToast('คัดลอกลิงก์ส่วนบุคคลพร้อมกรอกชื่อผู้ใช้อัตโนมัติแล้ว');
    setTimeout(() => {
      setCopiedUserOnly(false);
      setShareSuccessToast(null);
    }, 2500);
  };

  // Web Share API
  const handleWebShare = async (isPersonal = false) => {
    const title = 'ระบบลงเวลาทำงาน Smart Time Attendance';
    const text = isPersonal
      ? `ลิงก์เข้าสู่ระบบลงเวลาทำงานสำหรับ: ${selectedUser.fullName}`
      : 'ระบบลงเวลาทำงานและตรวจสอบพิกัด GPS ผ่านมือถือ';
    const url = isPersonal ? personalLoginUrl : baseUrl;

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch (err) {
        // Fallback to copy
        if (isPersonal) handleCopyCredentials();
        else handleCopyAppLink();
      }
    } else {
      if (isPersonal) handleCopyCredentials();
      else handleCopyAppLink();
    }
  };

  // Filter users for admin picker
  const filteredUserList = users.filter((u) => {
    if (!userSearchQuery.trim()) return true;
    const q = userSearchQuery.toLowerCase();
    return (
      u.fullName.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      (u.departmentName && u.departmentName.toLowerCase().includes(q)) ||
      (u.position && u.position.toLowerCase().includes(q)) ||
      (u.employeeCode && u.employeeCode.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-100 flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/30 rounded-xl border border-indigo-400/30">
              <QrCode className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                แชร์ลิงก์ & คิวอาร์โค้ดส่งต่อผู้ใช้งาน
              </h3>
              <p className="text-[11px] text-slate-300">
                เข้าสู่ระบบได้จากทุกเครื่อง ทุกอุปกรณ์อย่างปลอดภัยและเป็นความลับ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="p-2 bg-slate-100 border-b border-slate-200 flex items-center gap-1.5 shrink-0 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('share')}
            className={`flex-1 py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
              activeTab === 'share'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <QrCode className="w-4 h-4 text-indigo-600" />
            <span>1. คิวอาร์โค้ด & ลิงก์ระบบกลาง</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('credentials')}
            className={`flex-1 py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
              activeTab === 'credentials'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Lock className="w-4 h-4 text-emerald-600" />
            <span>2. ส่งรหัส & แนบลิงก์ (ความลับเฉพาะบุคคล)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Toast Notification */}
          {shareSuccessToast && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-850 rounded-2xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{shareSuccessToast}</span>
            </div>
          )}

          {activeTab === 'share' ? (
            /* ================= TAB 1: SYSTEM QR & LINK ================= */
            <div className="space-y-4 text-center">
              <div className="bg-gradient-to-b from-indigo-50/50 to-white p-4 rounded-2xl border border-indigo-100">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-900 bg-indigo-100/70 px-3 py-1 rounded-full mb-3">
                  <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                  สแกนด้วยโทรศัพท์มือถือ iPhone หรือ Android
                </span>

                {/* QR Code Canvas/Image */}
                <div className="p-3 bg-white rounded-2xl border border-slate-200 inline-block shadow-md">
                  {appQrUrl ? (
                    <img
                      src={appQrUrl}
                      alt="System App QR Code"
                      className="w-48 h-48 sm:w-56 sm:h-56 rounded-xl mx-auto block"
                    />
                  ) : (
                    <div className="w-48 h-48 flex items-center justify-center text-xs text-slate-400">
                      กำลังสร้าง QR Code...
                    </div>
                  )}
                </div>

                <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto leading-relaxed">
                  สแกนเพื่อเปิดใช้งานระบบลงเวลาทำงานได้ทันทีจากทุกเครื่องโดยไม่ต้องดาวน์โหลดจาก Store
                </p>
              </div>

              {/* URL Display Box */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-left">
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  🌐 ลิงก์เข้าใช้งานระบบลงเวลา (URL):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={baseUrl}
                    className="w-full bg-white px-3 py-2 rounded-xl text-xs font-mono text-slate-700 border border-slate-200 focus:outline-hidden select-all"
                  />
                  <button
                    type="button"
                    onClick={handleCopyAppLink}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shrink-0 cursor-pointer"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'คัดลอกแล้ว' : 'คัดลอก'}</span>
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2.5">
                {appQrUrl && (
                  <a
                    href={appQrUrl}
                    download="smart-time-attendance-qr.png"
                    className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-600" />
                    <span>บันทึกรูป QR Code</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => handleWebShare(false)}
                  className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>แชร์เข้าแอป LINE / อื่นๆ</span>
                </button>
              </div>
            </div>
          ) : (
            /* ================= TAB 2: CONFIDENTIAL USER CREDENTIALS ================= */
            <div className="space-y-4">
              {/* Admin User Selector */}
              {isAdmin && users.length > 0 && (
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <UserIcon className="w-3.5 h-3.5 text-indigo-600" />
                      เลือกผู้ใช้งานที่ต้องการส่งรหัสและลิงก์:
                    </span>
                    <span className="text-[11px] text-slate-500 font-normal">
                      ทั้งหมด {users.length} คน
                    </span>
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="พิมพ์ค้นหาชื่อ, รหัส หรือตำแหน่ง..."
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-white rounded-xl border border-slate-200 focus:outline-hidden focus:border-indigo-500"
                    />
                  </div>

                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-hidden focus:border-indigo-500 cursor-pointer"
                  >
                    {filteredUserList.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.departmentName} • {u.position || 'พนักงาน'}) [Username: {u.username}]
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Confidential Credentials Slip Card */}
              <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 sm:p-5 border border-slate-800 shadow-xl relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/30">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold tracking-tight text-white">
                        ข้อมูลเข้าใช้งานระบบ (เอกสารความลับเฉพาะบุคคล)
                      </p>
                      <p className="text-[10px] text-slate-300">
                        Smart Time Attendance • ความลับเฉพาะตัวบุคคล
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-semibold">
                    🔒 CONFIDENTIAL
                  </span>
                </div>

                {/* Profile Grid */}
                <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                  <div>
                    <span className="text-[10px] text-slate-400 block">ชื่อ-นามสกุล</span>
                    <span className="font-semibold text-white">{selectedUser.fullName}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">ฝ่าย / แผนก</span>
                    <span className="font-semibold text-emerald-300">{selectedUser.departmentName}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">ตำแหน่ง</span>
                    <span className="font-medium text-slate-200">{selectedUser.position || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">รหัสพนักงาน</span>
                    <span className="font-mono text-slate-200">{selectedUser.employeeCode}</span>
                  </div>
                </div>

                {/* Credential Box with Highlight */}
                <div className="bg-black/50 backdrop-blur-md rounded-xl p-3 border border-white/15 space-y-2 mb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Key className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-[11px] text-slate-300">ชื่อผู้ใช้งาน (Username):</span>
                    </div>
                    <span className="font-mono font-bold text-amber-300 text-xs sm:text-sm bg-amber-400/10 px-2 py-0.5 rounded-lg border border-amber-400/20">
                      {selectedUser.username}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-white/10">
                    <div className="flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-[11px] text-slate-300">รหัสผ่าน (Password):</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-emerald-300 text-xs sm:text-sm bg-emerald-400/10 px-2 py-0.5 rounded-lg border border-emerald-400/20">
                        {showPassword ? userPassword : '••••••••'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-slate-400 hover:text-white p-1 rounded-md transition"
                        title={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Personal Direct Link */}
                <div className="bg-white/5 p-2.5 rounded-xl border border-white/10 text-[11px] text-slate-300 mb-3 flex items-center justify-between gap-2">
                  <div className="truncate flex-1">
                    <span className="text-slate-400 block text-[10px]">ลิงก์เข้าสู่ระบบเฉพาะบุคคล:</span>
                    <span className="font-mono text-sky-300 truncate block">{personalLoginUrl}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyPersonalLinkOnly}
                    className="p-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg transition shrink-0 cursor-pointer"
                    title="คัดลอกเฉพาะลิงก์"
                  >
                    {copiedUserOnly ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Security Warning */}
                <div className="flex items-start gap-1.5 text-[10px] text-amber-200/90 leading-tight">
                  <Info className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    ข้อมูลนี้เป็นความลับเฉพาะตัวบุคคล กรุณาอย่าส่งต่อให้บุคคลอื่น เพื่อความถูกต้องของข้อมูลการลงเวลา
                  </span>
                </div>
              </div>

              {/* Personal Scannable QR Code */}
              <div className="bg-indigo-50/70 p-3.5 rounded-2xl border border-indigo-100 flex flex-col sm:flex-row items-center gap-4">
                <div className="p-2 bg-white rounded-xl border border-slate-200 shrink-0 shadow-xs">
                  {userQrUrl ? (
                    <img
                      src={userQrUrl}
                      alt={`QR Code for ${selectedUser.username}`}
                      className="w-28 h-28 rounded-lg block"
                    />
                  ) : (
                    <div className="w-28 h-28 flex items-center justify-center text-[10px] text-slate-400">
                      กำลังสร้าง QR...
                    </div>
                  )}
                </div>
                <div className="text-xs text-slate-600 text-center sm:text-left space-y-1">
                  <p className="font-bold text-slate-900">
                    📱 QR Code สำหรับเปิดหน้าระบบของผู้ใช้รายนี้
                  </p>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    เมื่อผู้ใช้งานสแกนด้วยกล้องมือถือ ระบบจะเปิดหน้าลงเวลาพร้อมกรอก Username <strong className="text-indigo-700">({selectedUser.username})</strong> ให้อัตโนมัติทันที
                  </p>
                </div>
              </div>

              {/* Action Buttons: Copy All with Formatted Message */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleCopyCredentials}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-2xl flex items-center justify-center gap-2 transition active:scale-95 shadow-md cursor-pointer"
                >
                  {copiedCredentials ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>
                    {copiedCredentials
                      ? 'คัดลอกข้อมูลพร้อมลิงก์เรียบร้อยแล้ว!'
                      : 'คัดลอกรหัสผู้ใช้งาน + ชื่อ + ลิงก์ เพื่อส่งต่อใน LINE'}
                  </span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleWebShare(true)}
                    className="py-2.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition border border-indigo-200 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 text-indigo-600" />
                    <span>ส่งต่อผ่านแอป (Share)</span>
                  </button>

                  {userQrUrl && (
                    <a
                      href={userQrUrl}
                      download={`login-qr-${selectedUser.username}.png`}
                      className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-600" />
                      <span>บันทึก QR เฉพาะบุคคล</span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            ระบบฐานข้อมูลกลาง ซิงค์อัตโนมัติทุกอุปกรณ์
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 font-medium rounded-lg border border-slate-200 text-xs transition cursor-pointer"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
};
