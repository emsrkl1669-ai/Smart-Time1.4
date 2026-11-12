import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  LogIn,
  Key,
  User as UserIcon,
  Eye,
  EyeOff,
  ShieldCheck,
  HeartHandshake,
  Briefcase,
  AlertCircle,
  WifiOff,
  Database,
  Smartphone,
  QrCode,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Search,
  ExternalLink,
  Shield,
  Building2,
  MapPin,
  Sparkles,
  Download,
  CheckCircle,
  RefreshCw,
} from 'lucide-react';
import { api, isOnline, getRememberedUsername, getPublicAppUrl } from '../services/api';
import { User } from '../types';

interface LoginModalProps {
  onLoginSuccess: (user: User) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [welcomeUserPrompt, setWelcomeUserPrompt] = useState<string | null>(null);
  const [localQrUrl, setLocalQrUrl] = useState<string>('');

  // Central Database Directory of users
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isUsersDropdownOpen, setIsUsersDropdownOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [dbStatus, setDbStatus] = useState<{
    connected: boolean;
    userCount: number;
    deptCount: number;
  }>({
    connected: true,
    userCount: 0,
    deptCount: 0,
  });

  // Check for auto-filled username from personal shared link (?u=... or ?username=...) or saved device memory
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlUser = params.get('u') || params.get('username');
      if (urlUser) {
        setUsername(urlUser.trim());
        setWelcomeUserPrompt(`ยินดีต้อนรับ @${urlUser.trim()} กรุณากรอกรหัสผ่านเพื่อเข้าใช้งาน`);
      } else {
        const remembered = getRememberedUsername();
        if (remembered) {
          setUsername(remembered);
        }
      }

      // Generate public QR code so other phones and devices can open without developer credentials
      const publicOrigin = getPublicAppUrl();
      QRCode.toDataURL(publicOrigin, {
        width: 320,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
      }).then((url) => setLocalQrUrl(url)).catch(() => {});
    }
  }, []);

  // Load existing users from the central database on mount
  useEffect(() => {
    let isMounted = true;
    const fetchCentralUsers = async () => {
      try {
        const users = await api.getUsers();
        if (isMounted && users && users.length > 0) {
          setAllUsers(users);
          setDbStatus((prev) => ({
            ...prev,
            connected: true,
            userCount: users.length,
          }));
        }
        const depts = await api.getDepartments();
        if (isMounted && depts) {
          setDbStatus((prev) => ({
            ...prev,
            deptCount: depts.length,
          }));
        }
      } catch (e) {
        console.warn('Central database check:', e);
      }
    };

    fetchCentralUsers();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMsg('กรุณากรอก Username และ Password');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await api.login(username.trim(), password, rememberDevice);
      onLoginSuccess(res.user);
    } catch (err: any) {
      setErrorMsg(err.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    } finally {
      setIsLoading(false);
    }
  };

  // Quick 1-Click login helper
  const handleQuickLogin = async (user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await api.login(user, pass, true);
      onLoginSuccess(res.user);
    } catch (err: any) {
      setErrorMsg(err.message || 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setIsLoading(false);
    }
  };

  // Select user from directory
  const handleSelectUserFromDirectory = (user: User) => {
    setUsername(user.username);
    setIsUsersDropdownOpen(false);
    setErrorMsg(null);
    if (user.username === 'admin') {
      setPassword('admin123');
    } else {
      setPassword('123456');
    }
  };

  const copyAppUrl = () => {
    const appUrl = getPublicAppUrl();
    navigator.clipboard.writeText(appUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const filteredUsers = allUsers.filter((u) => {
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
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-3 sm:p-4 relative overflow-hidden">
      {/* Background decoration elements */}
      <div className="absolute top-0 -left-20 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 -right-20 w-96 h-96 bg-emerald-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-7 shadow-2xl relative z-10 border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
        {/* App Title & Central Database Status */}
        <div className="text-center mb-5">
          <div className="inline-flex p-3 bg-gradient-to-tr from-indigo-600 to-emerald-500 rounded-2xl text-white shadow-md shadow-indigo-600/30 mb-2.5">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Smart Time Attendance
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            ระบบลงเวลาปฏิบัติงาน & เช็คอิน GPS ถ่ายภาพ
          </p>

          {/* Centralized Database Unified Notice */}
          <div className="mt-3 p-2.5 bg-gradient-to-r from-emerald-50 to-indigo-50 border border-emerald-200/80 rounded-2xl text-left">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-[11px] font-bold text-slate-800">
                  ฐานข้อมูลกลางเดียวกันทุกเครื่อง (Centralized Cloud Database)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowQrModal(true)}
                className="text-[10px] text-indigo-700 bg-white hover:bg-indigo-100 px-2 py-1 rounded-lg border border-indigo-200 font-semibold flex items-center gap-1 transition cursor-pointer shrink-0"
                title="เปิดบนมือถือเครื่องอื่นด้วย QR Code"
              >
                <QrCode className="w-3 h-3 text-indigo-600" />
                <span>เปิดบนมือถือ</span>
              </button>
            </div>
            <p className="text-[10px] text-slate-600 mt-1">
              • สามารถลงชื่อเข้าใช้งานได้จากทุกเครื่องและอุปกรณ์ (มือถือ iPhone, Android, แท็บเล็ต, PC)
              <br />
              • เชื่อมต่อฐานข้อมูลเดียวกันกับที่ Admin สร้างให้แบบ Real-Time {dbStatus.userCount > 0 && `(พร้อมใช้งาน ${dbStatus.userCount} บัญชี)`}
            </p>
          </div>

          {!isOnline() && (
            <div className="mt-2.5 py-1.5 px-3 bg-amber-50 text-amber-800 text-[11px] rounded-xl border border-amber-200 inline-flex items-center gap-1.5 font-medium">
              <WifiOff className="w-3.5 h-3.5 text-amber-600" />
              <span>โหมดออฟไลน์: บัญชีที่เคยล็อกอินบนเครื่องนี้สามารถเข้าใช้งานได้</span>
            </div>
          )}
        </div>

        {welcomeUserPrompt && (
          <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs rounded-xl flex items-center justify-between gap-2 animate-in fade-in">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="font-medium">{welcomeUserPrompt}</span>
            </div>
            <button
              type="button"
              onClick={() => setWelcomeUserPrompt(null)}
              className="text-indigo-400 hover:text-indigo-600 text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-start gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">{errorMsg}</p>
              <p className="text-[10px] text-rose-600 mt-0.5">
                กรุณาตรวจสอบ Username และ Password ที่ได้รับจาก Admin หรือกดปุ่ม &quot;ดูรายชื่อผู้ใช้งานที่ Admin สร้างให้&quot; ด้านล่าง
              </p>
            </div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">
                ชื่อผู้ใช้งาน (Username)
              </label>
              {allUsers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsUsersDropdownOpen(!isUsersDropdownOpen)}
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-0.5 cursor-pointer"
                >
                  <span>เลือกจากรายชื่อที่ Admin สร้าง</span>
                  {isUsersDropdownOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}
            </div>

            <div className="relative">
              <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="กรอก Username ของคุณ เช่น admin, somchai..."
                className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              />
            </div>

            {/* Collapsible Organization Directory Dropdown */}
            {isUsersDropdownOpen && (
              <div className="mt-2 p-3 bg-slate-50 rounded-2xl border border-indigo-100 shadow-md animate-in fade-in">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                    <Database className="w-3 h-3 text-indigo-600" />
                    บัญชีในฐานข้อมูลกลาง ({allUsers.length})
                  </span>
                  <span className="text-[10px] text-slate-500">แตะเพื่อเลือก</span>
                </div>

                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="พิมพ์ค้นหาชื่อ, username หรือตำแหน่ง..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-2 py-1 text-xs bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100">
                  {filteredUsers.length === 0 ? (
                    <p className="text-[11px] text-slate-400 text-center py-3">ไม่พบบัญชีที่ค้นหา</p>
                  ) : (
                    filteredUsers.map((u) => {
                      const isAdm = u.role === 'admin';
                      const isVol = u.role === 'volunteer';
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => handleSelectUserFromDirectory(u)}
                          className="w-full text-left p-2 rounded-xl hover:bg-indigo-50/80 transition flex items-center justify-between gap-2 cursor-pointer pt-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-800 truncate flex items-center gap-1.5">
                              <span>{u.fullName}</span>
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded-md font-medium shrink-0 ${
                                  isAdm
                                    ? 'bg-amber-100 text-amber-800'
                                    : isVol
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-indigo-100 text-indigo-800'
                                }`}
                              >
                                {isAdm ? 'Admin' : isVol ? 'อาสา' : 'พนักงาน'}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 flex items-center gap-1 truncate mt-0.5">
                              <span className="font-mono text-indigo-600">@{u.username}</span>
                              <span>•</span>
                              <span>{u.departmentName}</span>
                              {u.position && <span>• {u.position}</span>}
                            </div>
                          </div>
                          <span className="text-[10px] text-indigo-600 font-semibold shrink-0 bg-white px-2 py-0.5 rounded border border-indigo-100">
                            เลือก
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              รหัสผ่าน (Password)
            </label>
            <div className="relative">
              <Key className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="กรอกรหัสผ่านของคุณ"
                className="w-full pl-10 pr-10 py-2.5 text-xs sm:text-sm bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="p-1 text-slate-400 hover:text-slate-600 absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Remember this Device (Cross-Reboot Persistence) */}
          <div className="flex items-center justify-between py-1 px-1 bg-slate-50/70 rounded-xl border border-slate-100">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer accent-indigo-600"
              />
              <span className="text-[11px] font-medium text-slate-700">
                จดจำบัญชีบนอุปกรณ์นี้
              </span>
            </label>
            <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/80 font-medium flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-emerald-600" />
              <span>เปิด-ปิดเครื่อง ข้อมูลไม่หาย</span>
            </span>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm rounded-xl transition shadow-md shadow-indigo-600/20 active:scale-[0.98] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 mt-2"
          >
            <LogIn className="w-4 h-4" />
            <span>{isLoading ? 'กำลังตรวจสอบและเข้าสู่ระบบ...' : 'เข้าสู่ระบบ (Sign In)'}</span>
          </button>
        </form>

        {/* Quick Access Helper for Instant Testing */}
        <div className="mt-5 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              ⚡ สิทธิ์เข้าใช้งานด่วน (1-Click Test Access)
            </p>
            <span className="text-[9px] text-slate-400">คลิกเข้าสู่ระบบทันที</span>
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            {/* Admin */}
            {(() => {
              const adminUser = allUsers.find((u) => u.username === 'admin' || u.id === 'usr_admin');
              const adminName = adminUser?.fullName || 'นายกริชพิพัฒน์  สลับทอง (Admin)';
              const adminPos = adminUser?.position || adminUser?.departmentName || 'ผู้ดูแลระบบ';
              return (
                <button
                  type="button"
                  onClick={() => handleQuickLogin('admin', 'admin123')}
                  className="p-2 bg-amber-50/70 hover:bg-amber-100 text-amber-900 border border-amber-200/80 rounded-xl text-left transition flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                    <div className="truncate">
                      <span className="text-xs font-bold">1. ผู้ดูแลระบบ (Admin)</span>
                      <span className="text-[10px] text-amber-700 block truncate">
                        {adminName} • {adminPos}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] text-amber-800 font-mono font-semibold bg-white px-2 py-0.5 rounded border border-amber-200 shrink-0">
                    admin
                  </span>
                </button>
              );
            })()}

            {/* Employee */}
            {(() => {
              const empUser = allUsers.find((u) => u.role === 'employee' && u.username !== 'admin') || allUsers[1];
              if (!empUser) return null;
              const empUsername = empUser.username;
              const empName = empUser.fullName;
              const empPos = empUser.position || empUser.departmentName || 'พนักงาน';
              return (
                <button
                  type="button"
                  onClick={() => handleQuickLogin(empUsername, '123456')}
                  className="p-2 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-900 border border-indigo-200/80 rounded-xl text-left transition flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Briefcase className="w-4 h-4 text-indigo-600 shrink-0" />
                    <div className="truncate">
                      <span className="text-xs font-bold">2. พนักงาน ({empName.split(' ')[0]} - {empUser.departmentName || 'ฝ่าย'})</span>
                      <span className="text-[10px] text-indigo-700 block truncate">
                        {empName} • {empPos}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] text-indigo-800 font-mono font-semibold bg-white px-2 py-0.5 rounded border border-indigo-200 shrink-0">
                    {empUsername}
                  </span>
                </button>
              );
            })()}

            {/* Volunteer or Second Staff */}
            {(() => {
              const volUser = allUsers.find((u) => u.role === 'volunteer') || allUsers.filter((u) => u.role === 'employee' && u.username !== 'admin')[1];
              if (!volUser) return null;
              const isVol = volUser.role === 'volunteer';
              const volUsername = volUser.username;
              const volName = volUser.fullName;
              const volPos = volUser.position || volUser.departmentName || (isVol ? 'อาสาสมัคร' : 'เจ้าหน้าที่');
              return (
                <button
                  type="button"
                  onClick={() => handleQuickLogin(volUsername, '123456')}
                  className="p-2 bg-emerald-50/70 hover:bg-emerald-100 text-emerald-900 border border-emerald-200/80 rounded-xl text-left transition flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <HeartHandshake className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="truncate">
                      <span className="text-xs font-bold">3. {isVol ? 'อาสาสมัคร' : 'เจ้าหน้าที่'} ({volName.split(' ')[0]} - {volUser.departmentName || 'หน่วยงาน'})</span>
                      <span className="text-[10px] text-emerald-700 block truncate">
                        {volName} • {volPos}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] text-emerald-800 font-mono font-semibold bg-white px-2 py-0.5 rounded border border-emerald-200 shrink-0">
                    {volUsername}
                  </span>
                </button>
              );
            })()}
          </div>
        </div>

        {/* Footer info & device sync */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
          <span>รองรับ iOS • Android • แท็บเล็ต • คอมพิวเตอร์</span>
          <button
            type="button"
            onClick={copyAppUrl}
            className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium cursor-pointer"
          >
            {copiedLink ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            <span>{copiedLink ? 'คัดลอกลิงก์แล้ว' : 'คัดลอกลิงก์แอป'}</span>
          </button>
        </div>
      </div>

      {/* QR Code Modal for Accessing from Mobile Phones */}
      {showQrModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 text-center shadow-2xl border border-slate-100">
            <div className="inline-flex p-3 bg-indigo-50 text-indigo-600 rounded-2xl mb-3">
              <Smartphone className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              ลงชื่อเข้าใช้ได้จากทุกเครื่องและมือถือ
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              สแกน QR Code ด้วยกล้องโทรศัพท์มือถือ iPhone หรือ Android หรือเปิดจากคอมพิวเตอร์เครื่องอื่น
            </p>

            <div className="my-3 p-3 bg-slate-50 rounded-2xl border border-slate-200 inline-block shadow-inner">
              {localQrUrl ? (
                <img
                  src={localQrUrl}
                  alt="App QR Code"
                  className="w-44 h-44 rounded-xl mx-auto block"
                />
              ) : (
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                    getPublicAppUrl()
                  )}`}
                  alt="App QR Code"
                  className="w-44 h-44 rounded-xl mx-auto block"
                />
              )}
            </div>

            {/* Display exact public link */}
            <div className="mb-3 p-2 bg-slate-50 rounded-xl border border-slate-200 text-left">
              <span className="text-[10px] text-slate-500 font-medium block mb-0.5">ลิงก์เข้าใช้งานระบบ (สำหรับทุกเครื่อง):</span>
              <p className="text-[11px] font-mono text-indigo-700 font-semibold break-all select-all">
                {getPublicAppUrl()}
              </p>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={copyAppUrl}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md shadow-indigo-600/20"
              >
                {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? 'คัดลอกลิงก์เรียบร้อยแล้ว!' : 'คัดลอกลิงก์สำหรับส่งต่อในกลุ่ม LINE'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="w-full py-2 text-xs text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
