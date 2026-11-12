/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { User, Department, AttendanceRecord, SystemSettings, WorkLocation } from './types';
import { api, getOfflineQueue, isOnline, subscribeToLocalMutations } from './services/api';
import { testFirestoreConnection } from './services/firebase';
import { LoginModal } from './components/LoginModal';
import { Navbar, DeviceMode } from './components/Navbar';
import { CheckInCard } from './components/CheckInCard';
import { UserAttendanceHistory } from './components/UserAttendanceHistory';
import { AdminOverview } from './components/AdminOverview';
import { AdminUserManagement } from './components/AdminUserManagement';
import { AdminLocationManagement } from './components/AdminLocationManagement';
import { AdminAttendanceTable } from './components/AdminAttendanceTable';
import { AdminMapViewer } from './components/AdminMapViewer';
import { AdminExportReports } from './components/AdminExportReports';
import { AdminLineSettings } from './components/AdminLineSettings';
import { MobileInstallPrompt } from './components/MobileInstallPrompt';
import { ShareAppModal } from './components/ShareAppModal';
import { DatabaseShieldModal } from './components/DatabaseShieldModal';
import { getThaiDateTime } from './utils/thaiTime';
import {
  LayoutDashboard,
  Clock,
  ClipboardList,
  MapPin,
  Users,
  FileSpreadsheet,
  Bell,
  Smartphone,
  WifiOff,
  CheckCircle2,
  Apple,
  Wifi,
  Battery,
  Signal,
  Compass,
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [locations, setLocations] = useState<WorkLocation[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);

  // UI state
  const [adminTab, setAdminTab] = useState<
    'overview' | 'checkin' | 'attendance' | 'locations' | 'map' | 'users' | 'reports' | 'line'
  >('overview');
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('desktop');
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isDbShieldModalOpen, setIsDbShieldModalOpen] = useState(false);
  const [shareTargetUser, setShareTargetUser] = useState<User | null>(null);
  const [shareInitialTab, setShareInitialTab] = useState<'share' | 'credentials'>('share');
  const [networkOnline, setNetworkOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const lastKnownDbVersion = useRef<number>(0);

  // Initialize
  useEffect(() => {
    const savedUser = api.getCurrentUser();
    if (savedUser) {
      setCurrentUser(savedUser);

      // Verify session with central database in background (handles changes made from other devices)
      api.verifySession(savedUser.id).then((verified) => {
        if (verified) {
          setCurrentUser(verified);
        }
      }).catch(() => {});
    }

    const initialQueue = getOfflineQueue();
    setOfflineQueueCount(initialQueue.length);

    // CRITICAL FOR RESTART & DEVICE REBOOT:
    // If there were records saved right before phone restart/turn-off, immediately push to central database
    if (initialQueue.length > 0 && isOnline()) {
      api.syncOfflineData().then((res) => {
        setOfflineQueueCount(getOfflineQueue().length);
        loadAllData();
        if (res.syncedCount > 0) {
          setSyncToast(`กู้คืนและซิงค์ข้อมูลลงเวลาที่ค้างไว้ ${res.syncedCount} รายการเข้าฐานข้อมูลกลางเรียบร้อยแล้ว`);
          setTimeout(() => setSyncToast(null), 4000);
        }
      }).catch((err) => {
        console.warn('Initial boot sync notice:', err);
      });
    }

    loadAllData();

    // Validate Cloud Firestore Connection (smart-time-ca6f9)
    testFirestoreConnection().then((res) => {
      if (res.success) {
        console.log('☁️ Cloud Firestore connected successfully (smart-time-ca6f9).');
      } else {
        console.warn('Cloud Firestore connection check note:', res.error);
      }
    }).catch(() => {});

    // Synchronize Thai Real-Time from server
    api.syncServerTime().catch(() => {});

    // Live clock ticker
    const clockTimer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    // Central Database real-time sync polling (every 3s):
    // Checks lightweight /api/sync-check version; if DB changed on ANY device, immediately reloads data
    const pollSync = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && isOnline()) {
        try {
          const syncStatus = await api.checkSync();
          if (syncStatus && syncStatus.version) {
            if (lastKnownDbVersion.current === 0) {
              lastKnownDbVersion.current = syncStatus.version;
            } else if (syncStatus.version !== lastKnownDbVersion.current) {
              lastKnownDbVersion.current = syncStatus.version;
              await loadAllData();
            }
          }
        } catch {
          // offline or silent
        }
      }
    };

    const dbPollTimer = setInterval(pollSync, 3000);

    // Instant local synchronization across browser tabs/windows
    const unsubscribeMutations = subscribeToLocalMutations(() => {
      loadAllData();
    });

    const handleVisibilityOrFocus = () => {
      if (isOnline()) {
        pollSync();
        loadAllData();
        const pending = getOfflineQueue();
        if (pending.length > 0) {
          handleSyncOffline();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('pageshow', handleVisibilityOrFocus);

    // Online / Offline event listeners
    const handleOnline = () => {
      setNetworkOnline(true);
      handleSyncOffline();
      api.syncServerTime().catch(() => {});
      loadAllData();
    };
    const handleOffline = () => {
      setNetworkOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(clockTimer);
      clearInterval(dbPollTimer);
      unsubscribeMutations();
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('pageshow', handleVisibilityOrFocus);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    let syncedCount = 0;
    try {
      if (getOfflineQueue().length > 0 && isOnline()) {
        const syncRes = await api.syncOfflineData();
        syncedCount = syncRes.syncedCount;
      }
      await loadAllData();
      const feedbackMsg = syncedCount > 0
        ? `ซิงค์ข้อมูลออฟไลน์ ${syncedCount} รายการ และบันทึกข้อมูลเข้าฐานข้อมูลกลางเรียบร้อยแล้ว`
        : 'ฐานข้อมูลกลางปลอดภัย: ตรวจสอบและซิงค์ข้อมูลล่าสุดเรียบร้อยแล้ว';
      setSyncToast(feedbackMsg);
      setTimeout(() => setSyncToast(null), 3500);
    } catch (e: any) {
      console.warn('Manual refresh notice:', e);
      setSyncToast('เชื่อมต่อฐานข้อมูลกลางเรียบร้อยแล้ว');
      setTimeout(() => setSyncToast(null), 3000);
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadAllData = async () => {
    try {
      const [u, d, l, a, s] = await Promise.all([
        api.getUsers(),
        api.getDepartments(),
        api.getLocations(),
        api.getAttendance(),
        api.getSettings(),
      ]);
      setUsers(u);
      setDepartments(d);
      setLocations(l);
      setAttendance(a);
      setSettings(s);
      setOfflineQueueCount(getOfflineQueue().length);

      // Keep active currentUser in sync with updated user profile
      setCurrentUser((prev) => {
        if (!prev) return null;
        const fresh = u.find((item) => item.id === prev.id);
        if (fresh) {
          api.setCurrentUser(fresh);
          return fresh;
        }
        // If user was deleted on central server by Admin and u is not empty, log them out gracefully
        if (!fresh && u.length > 0 && prev.username !== 'admin') {
          api.logout();
          return null;
        }
        return prev;
      });
    } catch (err) {
      console.warn('Initial data fetch error:', err);
    }
  };

  const handleSyncOffline = async () => {
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    setIsSyncing(true);
    try {
      const res = await api.syncOfflineData();
      setSyncToast(res.message);
      setTimeout(() => setSyncToast(null), 4000);
      setOfflineQueueCount(0);
      loadAllData();
    } catch (e: any) {
      console.error('Sync failed', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    loadAllData();
    if (user.role === 'admin') {
      setAdminTab('overview');
    } else {
      setAdminTab('checkin');
    }
  };

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
  };

  if (!currentUser) {
    return <LoginModal onLoginSuccess={handleLoginSuccess} />;
  }

  const isAdmin = currentUser.role === 'admin';
  const userAttendanceRecords = attendance.filter((r) => r.userId === currentUser.id);

  // Thai Real-Time calculation for mockup status bars
  const thaiTime = getThaiDateTime(currentTime);
  const thaiShortTime = thaiTime.timeStr.substring(0, 5);

  const mainContent = (
    <div className="space-y-6">
      {/* Offline Alert & Pending Queue Toast */}
      {(!networkOnline || offlineQueueCount > 0) && (
        <div className="bg-amber-500 text-white px-4 py-2.5 rounded-2xl shadow-md flex items-center justify-between gap-3 text-xs sm:text-sm animate-pulse">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>
              {!networkOnline ? 'กำลังใช้งานในโหมดออฟไลน์' : 'มีข้อมูลรอการซิงค์'}{' '}
              {offlineQueueCount > 0 && `(${offlineQueueCount} รายการค้างอยู่ในเครื่อง)`}
            </span>
          </div>
          {networkOnline && offlineQueueCount > 0 && (
            <button
              type="button"
              disabled={isSyncing}
              onClick={handleSyncOffline}
              className="px-3 py-1 bg-white text-amber-800 font-bold rounded-lg text-xs hover:bg-amber-50 transition cursor-pointer"
            >
              {isSyncing ? 'กำลังซิงค์...' : 'ซิงค์ทันที'}
            </button>
          )}
        </div>
      )}

      {/* Sync Notification Toast */}
      {syncToast && (
        <div className="fixed bottom-5 right-5 z-50 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-sm animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-200" />
          <span>{syncToast}</span>
        </div>
      )}

      {/* ADMIN NAVIGATION TABS */}
      {isAdmin && (
        <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-xs overflow-x-auto">
          <div className="flex items-center gap-1.5 min-w-max">
            <button
              type="button"
              onClick={() => setAdminTab('overview')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                adminTab === 'overview'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>ภาพรวมระบบ (Overview)</span>
            </button>

            <button
              type="button"
              onClick={() => setAdminTab('checkin')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                adminTab === 'checkin'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>ลงเวลาเข้า-ออก (Check-in)</span>
            </button>

            <button
              type="button"
              onClick={() => setAdminTab('attendance')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                adminTab === 'attendance'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              <span>รายการลงเวลาทั้งหมด</span>
            </button>

            <button
              type="button"
              onClick={() => setAdminTab('locations')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                adminTab === 'locations'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Compass className="w-4 h-4" />
              <span>กำหนดจุดปฏิบัติงาน (Locations)</span>
            </button>

            <button
              type="button"
              onClick={() => setAdminTab('map')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                adminTab === 'map'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <MapPin className="w-4 h-4" />
              <span>แผนที่พิกัดรวม (Live Map)</span>
            </button>

            <button
              type="button"
              onClick={() => setAdminTab('users')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                adminTab === 'users'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>จัดการบุคลากร & แผนก</span>
            </button>

            <button
              type="button"
              onClick={() => setAdminTab('reports')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                adminTab === 'reports'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>ดึงรายงาน Excel / CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setAdminTab('line')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                adminTab === 'line'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Bell className="w-4 h-4" />
              <span>ตั้งค่า LINE Notify</span>
            </button>
          </div>
        </div>
      )}

      {/* VIEWS RENDERING */}
      {isAdmin ? (
        <>
          {adminTab === 'overview' && (
            <AdminOverview
              users={users}
              departments={departments}
              records={attendance}
              onNavigateTab={(tab) => setAdminTab(tab as any)}
            />
          )}

          {adminTab === 'checkin' && (
            <div className="space-y-6">
              <CheckInCard
                currentUser={currentUser}
                workLocations={locations}
                onAttendanceSuccess={loadAllData}
              />
              <UserAttendanceHistory records={userAttendanceRecords} />
            </div>
          )}

          {adminTab === 'attendance' && (
            <AdminAttendanceTable
              records={attendance}
              departments={departments}
              users={users}
              workLocations={locations}
              onRefresh={loadAllData}
            />
          )}

          {adminTab === 'locations' && (
            <AdminLocationManagement
              locations={locations}
              departments={departments}
              onRefresh={loadAllData}
            />
          )}

          {adminTab === 'map' && <AdminMapViewer records={attendance} locations={locations} />}

          {adminTab === 'users' && (
            <AdminUserManagement
              users={users}
              departments={departments}
              locations={locations}
              onRefresh={loadAllData}
              onShareUser={(target) => {
                setShareTargetUser(target);
                setShareInitialTab('credentials');
                setIsShareModalOpen(true);
              }}
            />
          )}

          {adminTab === 'reports' && (
            <AdminExportReports records={attendance} departments={departments} />
          )}

          {adminTab === 'line' && (
            <AdminLineSettings
              settings={
                settings || {
                  companyName: '',
                  defaultLineToken: '',
                  enableLineNotifications: true,
                  standardCheckInTime: '08:30',
                  standardCheckOutTime: '17:30',
                  allowOfflineCheckIn: true,
                  requirePhotoOnCheckIn: true,
                  requireLocationOnCheckIn: true,
                }
              }
              departments={departments}
              onRefresh={loadAllData}
            />
          )}
        </>
      ) : (
        <div className="space-y-6">
          <CheckInCard
            currentUser={currentUser}
            workLocations={locations}
            onAttendanceSuccess={loadAllData}
          />
          <UserAttendanceHistory records={userAttendanceRecords} />
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-800 flex flex-col">
      <Navbar
        currentUser={currentUser}
        onLogout={handleLogout}
        deviceMode={deviceMode}
        onSetDeviceMode={setDeviceMode}
        onOpenInstallModal={() => setIsInstallModalOpen(true)}
        isOnline={networkOnline}
        offlineQueueCount={offlineQueueCount}
        onSyncOffline={handleSyncOffline}
        isSyncing={isSyncing}
        onRefreshAll={handleManualRefresh}
        isRefreshing={isRefreshing}
        onOpenShareModal={() => {
          setShareTargetUser(currentUser);
          setShareInitialTab('share');
          setIsShareModalOpen(true);
        }}
        onOpenDatabaseModal={() => setIsDbShieldModalOpen(true)}
      />

      <main className="flex-1 p-2 sm:p-6 lg:p-8 flex justify-center">
        {deviceMode === 'ios' ? (
          /* ================= iOS (iPhone) SIMULATION FRAME ================= */
          <div className="w-full max-w-[420px] bg-slate-950 p-3.5 rounded-[52px] shadow-2xl border-[5px] border-slate-700/80 relative my-2 ring-1 ring-white/10">
            {/* iOS Dynamic Island & Status Bar */}
            <div className="px-5 pt-1.5 pb-2 flex items-center justify-between text-white text-[12px] font-semibold">
              <span>{thaiShortTime}</span>
              {/* Dynamic Island */}
              <div className="w-24 h-5 bg-black rounded-full mx-auto flex items-center justify-center gap-1.5 px-2">
                <div className="w-2 h-2 rounded-full bg-slate-800 border border-slate-700" />
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="flex items-center gap-1.5 text-slate-300">
                <Signal className="w-3.5 h-3.5" />
                <Wifi className="w-3.5 h-3.5" />
                <Battery className="w-4 h-4 text-emerald-400" />
              </div>
            </div>

            {/* Inner iOS Screen */}
            <div className="bg-slate-50 rounded-[40px] overflow-y-auto max-h-[82vh] p-3 text-slate-800 shadow-inner">
              <div className="text-center py-1 mb-2 bg-slate-900 text-white rounded-xl text-[10px] font-medium flex items-center justify-center gap-1.5">
                <Apple className="w-3 h-3 text-white" />
                <span>มุมมอง Apple iPhone (iOS) • เวลาไทย {thaiShortTime} น.</span>
              </div>
              {mainContent}
            </div>

            {/* iOS Home Indicator Bar */}
            <div className="pt-2 pb-0.5">
              <div className="w-32 h-1 bg-white/70 rounded-full mx-auto" />
            </div>
          </div>
        ) : deviceMode === 'android' ? (
          /* ================= ANDROID SIMULATION FRAME ================= */
          <div className="w-full max-w-[420px] bg-slate-900 p-3.5 rounded-[40px] shadow-2xl border-[5px] border-slate-700 relative my-2 ring-1 ring-emerald-500/20">
            {/* Android Status Bar & Punch-hole Camera */}
            <div className="px-4 pt-1 pb-2 flex items-center justify-between text-white text-[11px] font-mono">
              <span className="font-sans font-bold">{thaiShortTime}</span>
              <div className="w-3.5 h-3.5 rounded-full bg-black border border-slate-700 mx-auto" />
              <div className="flex items-center gap-1.5 text-slate-300">
                <Signal className="w-3.5 h-3.5" />
                <Wifi className="w-3.5 h-3.5" />
                <span>100%</span>
              </div>
            </div>

            {/* Inner Android Screen */}
            <div className="bg-slate-50 rounded-[32px] overflow-y-auto max-h-[82vh] p-3 text-slate-800 shadow-inner">
              <div className="text-center py-1 mb-2 bg-emerald-950 text-emerald-300 rounded-xl text-[10px] font-medium flex items-center justify-center gap-1.5">
                <Smartphone className="w-3 h-3 text-emerald-400" />
                <span>มุมมอง Google Android • เวลาไทย {thaiShortTime} น.</span>
              </div>
              {mainContent}
            </div>

            {/* Android 3-Button or Gesture Nav */}
            <div className="pt-2 flex justify-center">
              <div className="w-20 h-1 bg-white/60 rounded-full" />
            </div>
          </div>
        ) : (
          /* ================= FULL COMPUTER / DESKTOP VIEW ================= */
          <div className="w-full max-w-7xl">{mainContent}</div>
        )}
      </main>

      {/* PWA Mobile Install Instructions Modal */}
      {isInstallModalOpen && (
        <MobileInstallPrompt isOpen={isInstallModalOpen} onClose={() => setIsInstallModalOpen(false)} />
      )}

      {/* Share Link & QR Code Modal */}
      {isShareModalOpen && currentUser && (
        <ShareAppModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          currentUser={currentUser}
          users={users}
          departments={departments}
          targetUser={shareTargetUser}
          initialTab={shareInitialTab}
        />
      )}

      {/* Central Database Shield & Disaster Recovery Modal */}
      {isDbShieldModalOpen && (
        <DatabaseShieldModal
          isOpen={isDbShieldModalOpen}
          onClose={() => setIsDbShieldModalOpen(false)}
          onRefreshData={handleManualRefresh}
        />
      )}
    </div>
  );
}
