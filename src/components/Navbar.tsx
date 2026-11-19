import React from 'react';
import { User } from '../types';
import {
  ShieldCheck,
  Building2,
  LogOut,
  Smartphone,
  Monitor,
  Wifi,
  WifiOff,
  RefreshCw,
  Bell,
  HeartHandshake,
  Briefcase,
  Apple,
  Download,
  Database,
  QrCode,
  Share2,
} from 'lucide-react';

export type DeviceMode = 'desktop' | 'ios' | 'android';

interface NavbarProps {
  currentUser: User;
  onLogout: () => void;
  deviceMode: DeviceMode;
  onSetDeviceMode: (mode: DeviceMode) => void;
  onOpenInstallModal: () => void;
  isOnline: boolean;
  offlineQueueCount: number;
  onSyncOffline: () => void;
  isSyncing: boolean;
  onRefreshAll?: () => void;
  isRefreshing?: boolean;
  onOpenShareModal: () => void;
  onOpenDatabaseModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  onLogout,
  deviceMode,
  onSetDeviceMode,
  onOpenInstallModal,
  isOnline,
  offlineQueueCount,
  onSyncOffline,
  isSyncing,
  onRefreshAll,
  isRefreshing,
  onOpenShareModal,
  onOpenDatabaseModal,
}) => {
  const isAdmin = currentUser.role === 'admin';
  const isVolunteer = currentUser.role === 'volunteer';

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-200 pt-safe">
      <div className="w-full px-2.5 sm:px-4 lg:px-6 min-h-14 sm:min-h-16 py-1.5 flex items-center justify-between gap-1.5 sm:gap-3">
        {/* Logo & App Title */}
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 shrink">
          <div className="p-1.5 sm:p-2 bg-gradient-to-tr from-indigo-600 to-emerald-500 rounded-xl text-white shadow-xs shrink-0">
            <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <h1 className="font-bold text-slate-900 text-xs sm:text-sm md:text-base leading-tight truncate">
                Smart Time Attendance
              </h1>
              <span className="hidden xl:inline-flex items-center text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200 font-medium shrink-0">
                🇹🇭 เวลาไทย GMT+7
              </span>
            </div>
            <p className="text-[10px] text-slate-500 hidden md:block truncate">
              Geo Check-in & LINE Notification (iOS • Android • Web)
            </p>
          </div>
        </div>

        {/* Right Action Tools */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Offline Sync Button */}
          {offlineQueueCount > 0 && (
            <button
              type="button"
              onClick={onSyncOffline}
              disabled={isSyncing || !isOnline}
              className="px-2 sm:px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[11px] sm:text-xs font-bold flex items-center gap-1 sm:gap-1.5 transition active:scale-95 animate-pulse shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
              title="กดเพื่อส่งข้อมูลที่บันทึกไว้ขณะออฟไลน์ขึ้นเซิร์ฟเวอร์"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden xl:inline">ซิงค์ออฟไลน์</span>
              <span>({offlineQueueCount})</span>
            </button>
          )}

          {/* Network status */}
          <div
            className={`px-1.5 sm:px-2 py-1.5 rounded-xl text-[11px] font-medium flex items-center gap-1 border shrink-0 ${
              isOnline
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
            title={isOnline ? 'เชื่อมต่ออินเทอร์เน็ตปกติ' : 'ออฟไลน์ (ไม่มีสัญญาณเน็ต)'}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                <span className="hidden 2xl:inline">ออนไลน์</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                <span className="hidden sm:inline">ออฟไลน์</span>
              </>
            )}
          </div>

          {/* Central DB Sync Status & Safety Center */}
          <div className="flex items-center bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl overflow-hidden shadow-2xs transition shrink-0">
            <button
              type="button"
              onClick={onOpenDatabaseModal || onRefreshAll}
              className="px-2 sm:px-2.5 py-1.5 text-slate-700 hover:text-indigo-700 text-[11px] font-semibold flex items-center gap-1 sm:gap-1.5 transition cursor-pointer"
              title="ตรวจสอบความปลอดภัยและสถานะฐานข้อมูลกลาง ป้องกันข้อมูลสูญหาย"
            >
              <Database className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="hidden xl:inline">ฐานข้อมูลกลาง</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="ออนไลน์และเชื่อมต่อฐานข้อมูลกลาง" />
            </button>

            {onRefreshAll && (
              <button
                type="button"
                onClick={onRefreshAll}
                disabled={isRefreshing}
                className="p-1.5 hover:bg-indigo-100 text-slate-400 hover:text-indigo-700 transition cursor-pointer border-l border-slate-200 disabled:opacity-50"
                title="ซิงค์และตรวจสอบข้อมูลล่าสุดเดี๋ยวนี้"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
              </button>
            )}
          </div>

          {/* Share Link & QR Code button */}
          <button
            type="button"
            onClick={onOpenShareModal}
            className="p-1.5 sm:px-2.5 sm:py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition border border-emerald-200 cursor-pointer shadow-2xs shrink-0"
            title="แชร์ลิงก์หรือคิวอาร์โค้ด และคัดลอกรหัสผู้ใช้งานเพื่อส่งต่ออย่างปลอดภัย"
          >
            <QrCode className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-emerald-600" />
            <span className="hidden xl:inline">แชร์ลิงก์ & QR Code</span>
          </button>

          {/* Install on Mobile (iOS / Android) button */}
          <button
            type="button"
            onClick={onOpenInstallModal}
            className="p-1.5 sm:px-2.5 sm:py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition border border-indigo-200/60 cursor-pointer shrink-0"
            title="วิธีติดตั้งแอปบนหน้าจอมือถือ iPhone / Android"
          >
            <Smartphone className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-indigo-600" />
            <span className="hidden xl:inline">ติดตั้งบนมือถือ</span>
          </button>

          {/* Device Simulator Switcher (iOS vs Android vs Desktop) for testing */}
          <div className="hidden lg:flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs shrink-0">
            <button
              type="button"
              onClick={() => onSetDeviceMode('desktop')}
              className={`px-2 py-1 rounded-lg font-medium transition flex items-center gap-1 cursor-pointer ${
                deviceMode === 'desktop'
                  ? 'bg-white text-slate-800 shadow-2xs font-semibold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="มุมมองจอคอมพิวเตอร์"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden 2xl:inline">จอคอม</span>
            </button>

            <button
              type="button"
              onClick={() => onSetDeviceMode('ios')}
              className={`px-2 py-1 rounded-lg font-medium transition flex items-center gap-1 cursor-pointer ${
                deviceMode === 'ios'
                  ? 'bg-white text-slate-800 shadow-2xs font-semibold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="จำลองมุมมอง iPhone (iOS)"
            >
              <Apple className="w-3.5 h-3.5" />
              <span>iPhone</span>
            </button>

            <button
              type="button"
              onClick={() => onSetDeviceMode('android')}
              className={`px-2 py-1 rounded-lg font-medium transition flex items-center gap-1 cursor-pointer ${
                deviceMode === 'android'
                  ? 'bg-white text-slate-800 shadow-2xs font-semibold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="จำลองมุมมอง Android"
            >
              <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
              <span>Android</span>
            </button>
          </div>

          {/* User profile capsule */}
          <div className="flex items-center gap-1.5 sm:gap-2 pl-1.5 sm:pl-2 border-l border-slate-200 min-w-0 shrink-0">
            <div className="text-right min-w-0">
              <div className="text-[11px] sm:text-xs font-bold text-slate-900 leading-tight truncate max-w-[82px] sm:max-w-[140px] md:max-w-[180px]">
                {currentUser.fullName}
              </div>
              <div className="text-[10px] text-slate-500 hidden sm:flex items-center justify-end gap-1">
                <span className="font-medium text-slate-600 truncate max-w-[120px]">{currentUser.departmentName}</span>
                {currentUser.position && (
                  <span className="text-slate-500 font-normal hidden xl:inline truncate max-w-[180px]" title={currentUser.position}>
                    • {currentUser.position}
                  </span>
                )}
              </div>
            </div>

            <span
              className={`p-1.5 rounded-xl text-white shrink-0 ${
                isAdmin
                  ? 'bg-amber-500'
                  : isVolunteer
                  ? 'bg-emerald-600'
                  : 'bg-indigo-600'
              }`}
              title={isAdmin ? 'ผู้ดูแลระบบ' : isVolunteer ? 'อาสาสมัคร' : 'พนักงาน'}
            >
              {isAdmin && <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
              {isVolunteer && <HeartHandshake className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
              {!isAdmin && !isVolunteer && <Briefcase className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
            </span>

            {/* Logout */}
            <button
              type="button"
              onClick={onLogout}
              className="p-1.5 sm:p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer shrink-0"
              title="ออกจากระบบ"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
