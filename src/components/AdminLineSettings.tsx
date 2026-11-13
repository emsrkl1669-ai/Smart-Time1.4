import React, { useState, useEffect, useRef } from 'react';
import { Department, SystemSettings, LineNotificationLog } from '../types';
import {
  Bell,
  Send,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Key,
  Building2,
  HelpCircle,
  ExternalLink,
  ShieldCheck,
  History,
  Settings2,
  Clock,
} from 'lucide-react';
import { api } from '../services/api';

interface AdminLineSettingsProps {
  settings: SystemSettings;
  departments: Department[];
  onRefresh: () => void;
}

export const AdminLineSettings: React.FC<AdminLineSettingsProps> = ({
  settings,
  departments,
  onRefresh,
}) => {
  // General System Settings state
  const [companyName, setCompanyName] = useState(
    settings.companyName || 'มูลนิธิร่วมกุศล สมุทรปราการ'
  );
  const [standardCheckInTime, setStandardCheckInTime] = useState(
    settings.standardCheckInTime || '08:30'
  );
  const [standardCheckOutTime, setStandardCheckOutTime] = useState(
    settings.standardCheckOutTime || '17:30'
  );
  const [allowOfflineCheckIn, setAllowOfflineCheckIn] = useState(
    settings.allowOfflineCheckIn ?? true
  );
  const [requirePhotoOnCheckIn, setRequirePhotoOnCheckIn] = useState(
    settings.requirePhotoOnCheckIn ?? true
  );
  const [requireLocationOnCheckIn, setRequireLocationOnCheckIn] = useState(
    settings.requireLocationOnCheckIn ?? true
  );
  const [enforceLocationGeofence, setEnforceLocationGeofence] = useState(
    settings.enforceLocationGeofence ?? false
  );

  // LINE Notification state
  const [defaultToken, setDefaultToken] = useState(settings.defaultLineToken || '');
  const [enableLine, setEnableLine] = useState(settings.enableLineNotifications ?? true);
  const [departmentTokens, setDepartmentTokens] = useState<Record<string, string>>({});

  // Dirty flag prevents background 3s sync-polling from overwriting Admin edits while typing
  const isDirtyRef = useRef(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Test State
  const [selectedDeptForTest, setSelectedDeptForTest] = useState<string>('default');
  const [testResult, setTestResult] = useState<{
    success: boolean;
    simulated: boolean;
    details: string;
    departmentName: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Logs
  const [logs, setLogs] = useState<LineNotificationLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const syncFromProps = () => {
    setCompanyName(settings.companyName || 'มูลนิธิร่วมกุศล สมุทรปราการ');
    setStandardCheckInTime(settings.standardCheckInTime || '08:30');
    setStandardCheckOutTime(settings.standardCheckOutTime || '17:30');
    setAllowOfflineCheckIn(settings.allowOfflineCheckIn ?? true);
    setRequirePhotoOnCheckIn(settings.requirePhotoOnCheckIn ?? true);
    setRequireLocationOnCheckIn(settings.requireLocationOnCheckIn ?? true);
    setEnforceLocationGeofence(settings.enforceLocationGeofence ?? false);
    setDefaultToken(settings.defaultLineToken || '');
    setEnableLine(settings.enableLineNotifications ?? true);

    const initialDeptTokens: Record<string, string> = {};
    departments.forEach((d) => {
      initialDeptTokens[d.id] = d.lineNotifyToken || '';
    });
    setDepartmentTokens(initialDeptTokens);
  };

  useEffect(() => {
    if (!isDirtyRef.current) {
      syncFromProps();
    }
  }, [settings, departments]);

  useEffect(() => {
    loadLogs();
  }, []);

  const markDirty = () => {
    isDirtyRef.current = true;
    setHasUnsavedChanges(true);
    setSaveError(null);
  };

  const loadLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const data = await api.getLineLogs();
      setLogs(data);
    } catch (e) {
      console.warn('Failed loading logs', e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    setSaveError(null);

    try {
      // 1. Update Global system & LINE settings
      await api.updateSettings({
        companyName: companyName.trim() || 'มูลนิธิร่วมกุศล สมุทรปราการ',
        standardCheckInTime: standardCheckInTime || '08:30',
        standardCheckOutTime: standardCheckOutTime || '17:30',
        allowOfflineCheckIn,
        requirePhotoOnCheckIn,
        requireLocationOnCheckIn,
        enforceLocationGeofence,
        defaultLineToken: defaultToken.trim(),
        enableLineNotifications: enableLine,
      });

      // 2. Update each department token that changed
      for (const dept of departments) {
        const tokenForDept = (departmentTokens[dept.id] ?? dept.lineNotifyToken ?? '').trim();
        const currentToken = (dept.lineNotifyToken || '').trim();
        if (tokenForDept !== currentToken) {
          await api.saveDepartment({
            id: dept.id,
            lineNotifyToken: tokenForDept,
          });
        }
      }

      isDirtyRef.current = false;
      setHasUnsavedChanges(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
      onRefresh();
    } catch (err: any) {
      setSaveError(err?.message || 'บันทึกการตั้งค่าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestNotification = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const deptId = selectedDeptForTest === 'default' ? undefined : selectedDeptForTest;
      const res = await api.testLineNotification(deptId);
      setTestResult(res);
      loadLogs();
    } catch (e: any) {
      setTestResult({
        success: false,
        simulated: false,
        details: e.message || 'เกิดข้อผิดพลาดในการทดสอบ',
        departmentName: 'ทดสอบ',
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs p-5 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-emerald-600" /> ตั้งค่าระบบองค์กร & LINE Notify รายแผนก
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Admin สามารถแก้ไขข้อมูลองค์กร เวลามาตรฐาน กฎการลงเวลา และ LINE Token ของแต่ละกลุ่มได้ทั้งหมด
          </p>
        </div>

        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <button
              type="button"
              onClick={() => {
                isDirtyRef.current = false;
                setHasUnsavedChanges(false);
                syncFromProps();
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition cursor-pointer"
            >
              คืนค่าล่าสุด
            </button>
          )}
          <label className="flex items-center gap-2 cursor-pointer bg-slate-100 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={enableLine}
              onChange={(e) => {
                markDirty();
                setEnableLine(e.target.checked);
              }}
              className="rounded text-emerald-600 focus:ring-emerald-500"
            />
            <span>เปิดใช้งานระบบ LINE</span>
          </label>
        </div>
      </div>

      {saveError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{saveError}</span>
        </div>
      )}

      <form onSubmit={handleSaveAll} className="space-y-6">
        {/* General Organization & Attendance Settings */}
        <div className="bg-indigo-50/40 p-4 sm:p-5 rounded-2xl border border-indigo-100 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-indigo-600" />
              <span>ตั้งค่าองค์กร เวลามาตรฐาน และเงื่อนไขการลงเวลา</span>
            </h4>
            <span className="text-[11px] text-indigo-600 font-medium">มีผลทันทีทุกเครื่อง</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                ชื่อองค์กร / หน่วยงาน *
              </label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => {
                  markDirty();
                  setCompanyName(e.target.value);
                }}
                placeholder="มูลนิธิร่วมกุศล สมุทรปราการ"
                className="w-full text-xs sm:text-sm p-2.5 bg-white rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                เวลาเข้างานมาตรฐาน
              </label>
              <input
                type="time"
                value={standardCheckInTime}
                onChange={(e) => {
                  markDirty();
                  setStandardCheckInTime(e.target.value);
                }}
                className="w-full text-xs sm:text-sm p-2.5 bg-white rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                เวลาออกงานมาตรฐาน
              </label>
              <input
                type="time"
                value={standardCheckOutTime}
                onChange={(e) => {
                  markDirty();
                  setStandardCheckOutTime(e.target.value);
                }}
                className="w-full text-xs sm:text-sm p-2.5 bg-white rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
            <label className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-slate-200 cursor-pointer text-xs text-slate-700">
              <input
                type="checkbox"
                checked={allowOfflineCheckIn}
                onChange={(e) => {
                  markDirty();
                  setAllowOfflineCheckIn(e.target.checked);
                }}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span>อนุญาตลงเวลาออฟไลน์</span>
            </label>

            <label className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-slate-200 cursor-pointer text-xs text-slate-700">
              <input
                type="checkbox"
                checked={requirePhotoOnCheckIn}
                onChange={(e) => {
                  markDirty();
                  setRequirePhotoOnCheckIn(e.target.checked);
                }}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span>บังคับถ่ายรูปยืนยันตัวตน</span>
            </label>

            <label className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-slate-200 cursor-pointer text-xs text-slate-700">
              <input
                type="checkbox"
                checked={requireLocationOnCheckIn}
                onChange={(e) => {
                  markDirty();
                  setRequireLocationOnCheckIn(e.target.checked);
                }}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span>บังคับดึงพิกัด GPS</span>
            </label>

            <label className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-slate-200 cursor-pointer text-xs text-slate-700">
              <input
                type="checkbox"
                checked={enforceLocationGeofence}
                onChange={(e) => {
                  markDirty();
                  setEnforceLocationGeofence(e.target.checked);
                }}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span>จำกัดเฉพาะในรัศมีจุดปฏิบัติงาน</span>
            </label>
          </div>
        </div>

        {/* Main Fallback Token */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Key className="w-4 h-4 text-slate-500" />
              <span>LINE Notify Token ส่วนกลาง (Global Default Token)</span>
            </label>
            <span className="text-[11px] text-slate-500">สำรองกรณีแผนกไม่ได้ระบุ Token</span>
          </div>

          <input
            type="text"
            value={defaultToken}
            onChange={(e) => {
              markDirty();
              setDefaultToken(e.target.value);
            }}
            placeholder="วาง LINE Notify Token ของส่วนกลางที่นี่ (เช่น e8a9xxxxxxxxxxxxx)"
            className="w-full text-xs sm:text-sm p-3 bg-white rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
          />
          <p className="text-[11px] text-slate-500">
            * หากไม่ได้ใส่ Token ระบบจะทำงานใน <strong>โหมดจำลอง (Simulated Mode)</strong> และบันทึกประวัติให้ตรวจสอบได้
          </p>
        </div>

        {/* Department-Specific Tokens */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-indigo-600" />
                <span>กำหนด LINE Notify Token แยกตามแผนก / กลุ่มภารกิจ</span>
              </h4>
              <p className="text-[11px] text-slate-500">
                เมื่อพนักงานหรืออาสาสมัครในแผนกลงเวลา ข้อความจะถูกส่งไปยัง LINE กลุ่มของแผนกนั้นทันที
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {departments.map((dept) => {
              const val = departmentTokens[dept.id] ?? '';
              return (
                <div
                  key={dept.id}
                  className="p-3.5 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 transition space-y-2 shadow-2xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: dept.color || '#4f46e5' }}
                      />
                      <span className="text-xs font-bold text-slate-800">{dept.name}</span>
                    </div>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono font-semibold">
                      {dept.code}
                    </span>
                  </div>

                  <input
                    type="text"
                    value={val}
                    onChange={(e) => {
                      markDirty();
                      setDepartmentTokens({
                        ...departmentTokens,
                        [dept.id]: e.target.value,
                      });
                    }}
                    placeholder={`Token กลุ่ม LINE ของ ${dept.name}`}
                    className="w-full text-xs p-2.5 bg-slate-50 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                  <div className="flex justify-between items-center text-[10px] text-slate-400">
                    <span>{dept.memberCount || 0} คนในสังกัด</span>
                    <span>{val ? '🟢 มี Token เฉพาะแผนก' : '⚪ ใช้ Token ส่วนกลาง'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Save button & status */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold rounded-xl transition shadow-xs active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{isSaving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่าระบบและ LINE ทั้งหมด'}</span>
          </button>

          {saveSuccess && (
            <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> บันทึกการตั้งค่าสำเร็จแล้ว (อัปเดตฐานข้อมูลกลางเรียบร้อย)
            </span>
          )}
        </div>
      </form>

      {/* Test Notification Section */}
      <div className="bg-indigo-50/70 p-4 sm:p-5 rounded-2xl border border-indigo-100 space-y-3">
        <h4 className="text-xs sm:text-sm font-bold text-indigo-950 flex items-center gap-1.5">
          <Send className="w-4 h-4 text-indigo-600" />
          <span>ทดสอบการส่งแจ้งเตือนเข้าห้อง LINE (Test Notification)</span>
        </h4>
        <p className="text-xs text-indigo-800">
          ทดสอบความถูกต้องของ Token ก่อนนำไปใช้งานจริง สามารถเลือกทดสอบเฉพาะกลุ่มแผนกได้
        </p>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <select
            value={selectedDeptForTest}
            onChange={(e) => setSelectedDeptForTest(e.target.value)}
            className="px-3 py-2 bg-white text-xs rounded-xl border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 flex-1"
          >
            <option value="default">ทดสอบ Token ส่วนกลาง (Global Default)</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                ทดสอบกลุ่ม: {d.name} {departmentTokens[d.id] ? '(มี Token)' : '(ใช้ค่าเริ่มต้น)'}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={isTesting}
            onClick={handleTestNotification}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition shadow-xs active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isTesting ? 'กำลังส่งทดสอบ...' : 'ส่งข้อความทดสอบเดี๋ยวนี้'}</span>
          </button>
        </div>

        {/* Test Result Display */}
        {testResult && (
          <div
            className={`p-3 rounded-xl border text-xs ${
              testResult.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-850'
                : 'bg-rose-50 border-rose-200 text-rose-850'
            }`}
          >
            <div className="flex items-start gap-2">
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-bold">
                  {testResult.success
                    ? testResult.simulated
                      ? `จำลองการแจ้งเตือนสำเร็จ (กลุ่ม: ${testResult.departmentName})`
                      : `ส่งเข้า LINE สำเร็จ! (กลุ่ม: ${testResult.departmentName})`
                    : 'ส่งไม่สำเร็จ'}
                </p>
                <p className="text-[11px] mt-0.5 opacity-90">{testResult.details}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Notification Logs Table */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <History className="w-4 h-4 text-slate-500" />
            <span>ประวัติการส่งแจ้งเตือนล่าสุด ({logs.length} รายการ)</span>
          </h4>

          <button
            type="button"
            onClick={loadLogs}
            disabled={isLoadingLogs}
            className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLogs ? 'animate-spin' : ''}`} />
            <span>รีเฟรชประวัติ</span>
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                <th className="py-2.5 px-3">วัน - เวลา</th>
                <th className="py-2.5 px-3">กลุ่มปลายทาง</th>
                <th className="py-2.5 px-3">ผู้ลงเวลา</th>
                <th className="py-2.5 px-3">ข้อความ</th>
                <th className="py-2.5 px-3 text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    ยังไม่มีประวัติการส่งแจ้งเตือน
                  </td>
                </tr>
              ) : (
                logs.slice(0, 10).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                      {new Date(log.timestamp).toLocaleTimeString('th-TH')} น.
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-800">
                      {log.recipientDepartment}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">{log.userName}</td>
                    <td className="py-2.5 px-3 text-slate-600 max-w-[220px]">
                      <span className="line-clamp-1">{log.message.replace(/\n/g, ' ')}</span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          log.status === 'sent'
                            ? 'bg-emerald-100 text-emerald-800'
                            : log.status === 'simulated'
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {log.status === 'sent'
                          ? 'ส่งจริงสำเร็จ'
                          : log.status === 'simulated'
                          ? 'จำลองสำเร็จ'
                          : 'ขัดข้อง'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Guide to LINE Notify */}
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-2">
        <div className="flex items-center gap-1.5 font-bold text-slate-800">
          <HelpCircle className="w-4 h-4 text-emerald-600" />
          <span>วิธีขอ LINE Notify Token สำหรับแต่ละกลุ่มไลน์ (ฟรี ไม่มีค่าใช้จ่าย)</span>
        </div>
        <ol className="list-decimal list-inside space-y-1 text-slate-600 pl-1">
          <li>
            เข้าสู่ระบบที่เว็บไซต์{' '}
            <a
              href="https://notify-bot.line.me"
              target="_blank"
              rel="noreferrer"
              className="text-emerald-600 underline font-medium inline-flex items-center gap-0.5"
            >
              notify-bot.line.me <ExternalLink className="w-3 h-3" />
            </a>{' '}
            ด้วยบัญชี LINE ของคุณ
          </li>
          <li>ไปที่หน้า <strong>"My page (หน้าของฉัน)"</strong> แล้วเลื่อนลงมาที่ปุ่ม <strong>"Generate token (ออก Token)"</strong></li>
          <li>ตั้งชื่อแจ้งเตือน (เช่น "ระบบลงเวลาฝ่ายปฏิบัติการ") และเลือกกลุ่ม LINE ที่ต้องการให้ส่งแจ้งเตือนเข้า</li>
          <li>คัดลอกรหัส Token ที่ได้ นำมาวางลงในช่อง Token ของแผนกนั้นๆ ในหน้านี้แล้วกด <strong>บันทึก</strong></li>
          <li>อย่าลืมดึง <strong>LINE Notify</strong> เข้าเป็นสมาชิกในกลุ่ม LINE นั้นด้วย</li>
        </ol>
      </div>
    </div>
  );
};
