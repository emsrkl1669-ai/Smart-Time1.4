import React from 'react';
import { User, Department, AttendanceRecord } from '../types';
import {
  Users,
  Building2,
  Clock,
  HeartHandshake,
  CheckCircle2,
  MapPin,
  FileSpreadsheet,
  TrendingUp,
  AlertCircle,
  WifiOff,
  UserPlus,
} from 'lucide-react';

interface AdminOverviewProps {
  users: User[];
  departments: Department[];
  records: AttendanceRecord[];
  onNavigateTab: (tab: 'users' | 'attendance' | 'locations' | 'map' | 'reports' | 'line') => void;
}

export const AdminOverview: React.FC<AdminOverviewProps> = ({
  users,
  departments,
  records,
  onNavigateTab,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const todayRecords = records.filter((r) => r.date === todayStr);

  const todayCheckIns = todayRecords.filter((r) => r.type === 'check_in').length;
  const todayCheckOuts = todayRecords.filter((r) => r.type === 'check_out').length;
  const volunteerRecords = todayRecords.filter((r) => r.userRole === 'volunteer');
  const employeesCount = users.filter((u) => u.role === 'employee' && u.status === 'active').length;
  const volunteersCount = users.filter((u) => u.role === 'volunteer' && u.status === 'active').length;
  const offlineRecordsCount = records.filter((r) => r.isOfflineRecord).length;

  return (
    <div className="space-y-6">
      {/* Top Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-3xl shadow-sm relative overflow-hidden">
        <div className="relative z-10">
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 inline-block mb-2">
            ศูนย์ควบคุมระบบสารสนเทศส่วนกลาง (Admin Dashboard)
          </span>
          <h2 className="text-xl sm:text-2xl font-bold">
            ภาพรวมการลงเวลาและบุคลากรประจำวัน
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
            ตรวจสอบข้อมูลการลงเวลา เข้า-ออกงาน พิกัดสถานที่จริง และการกระจายตัวของพนักงานและอาสาสมัครในทุกแผนก
          </p>

          <div className="flex flex-wrap gap-2.5 mt-5">
            <button
              type="button"
              onClick={() => onNavigateTab('users')}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-xs"
            >
              <UserPlus className="w-3.5 h-3.5" /> เพิ่มพนักงาน/อาสาสมัคร
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('locations')}
              className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-xs"
            >
              <MapPin className="w-3.5 h-3.5" /> กำหนดจุดปฏิบัติงาน (Locations)
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('map')}
              className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-xs"
            >
              <MapPin className="w-3.5 h-3.5" /> ดูแผนที่พิกัดรวม
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('reports')}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> ดึงรายงาน Excel / CSV
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {/* Total Today Check-In */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">ลงเวลาเข้างานวันนี้</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{todayCheckIns}</p>
          <p className="text-[11px] text-emerald-600 font-medium mt-0.5">🟢 บันทึกเข้างานแล้ว</p>
        </div>

        {/* Total Today Check-Out */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">ลงเวลาออกงานวันนี้</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{todayCheckOuts}</p>
          <p className="text-[11px] text-rose-600 font-medium mt-0.5">🔴 บันทึกออกงานแล้ว</p>
        </div>

        {/* Volunteers on Mission */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">อาสาสมัครปฏิบัติภารกิจ</span>
            <div className="p-2 bg-sky-50 text-sky-600 rounded-xl">
              <HeartHandshake className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{volunteerRecords.length}</p>
          <p className="text-[11px] text-sky-600 font-medium mt-0.5">🤝 จากทั้งหมด {volunteersCount} คน</p>
        </div>

        {/* Total Staff */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">บุคลากรทั้งหมดในระบบ</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 mt-2">{users.length}</p>
          <p className="text-[11px] text-indigo-600 font-medium mt-0.5">
            {employeesCount} พนักงาน • {volunteersCount} อาสาสมัคร
          </p>
        </div>
      </div>

      {/* Department Status Cards */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800 text-sm sm:text-base flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-600" /> สถานะและการจัดกลุ่มตามแผนก (Departments)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              ระบบส่งแจ้งเตือนเจาะจงกลุ่ม LINE ตามการลงเวลาของแต่ละแผนก
            </p>
          </div>

          <button
            type="button"
            onClick={() => onNavigateTab('users')}
            className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer"
          >
            จัดการแผนก & Token &rarr;
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {departments.map((dept) => {
            const deptUsers = users.filter((u) => u.departmentId === dept.id);
            const deptTodayRecords = todayRecords.filter((r) => r.departmentId === dept.id);

            return (
              <div
                key={dept.id}
                className="p-4 rounded-2xl border border-slate-200/90 bg-slate-50/50 hover:bg-slate-50 transition flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: dept.color || '#4f46e5' }}
                      />
                      <h4 className="font-bold text-slate-800 text-xs sm:text-sm truncate">
                        {dept.name}
                      </h4>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-1 mt-1">
                    {dept.description || dept.code}
                  </p>
                </div>

                <div className="bg-white p-2.5 rounded-xl border border-slate-100 text-xs space-y-1">
                  <div className="flex justify-between items-center text-slate-600">
                    <span>สมาชิกในสังกัด:</span>
                    <span className="font-bold text-slate-800">{deptUsers.length} คน</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600">
                    <span>ลงเวลาวันนี้:</span>
                    <span className="font-bold text-emerald-600">{deptTodayRecords.length} ครั้ง</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                    <span>LINE Token:</span>
                    <span className="font-mono text-emerald-700 font-medium">
                      {dept.lineNotifyToken ? '✓ กำหนดแล้ว' : 'ส่วนกลาง'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Offline Status & Data Persistence Banner */}
      <div className="bg-amber-50/80 border border-amber-200 p-4 rounded-2xl flex items-start gap-3">
        <WifiOff className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 flex-1">
          <p className="font-bold">ระบบบันทึกข้อมูลถาวร & รองรับการทำงานออฟไลน์ (Persistent Storage & Offline Sync)</p>
          <p className="mt-0.5 text-amber-800/90 leading-relaxed">
            ข้อมูลพนักงาน อาสาสมัคร และบันทึกเวลาทั้งหมดถูกจัดเก็บบนเซิร์ฟเวอร์แบบถาวร ข้อมูลจะไม่สูญหายเมื่อปิด/เปิดเครื่องใหม่ หรือเปลี่ยนเครื่องใช้งาน และหากพนักงานใช้งานในจุดที่ไม่มีสัญญาณอินเทอร์เน็ต แอปจะบันทึกไว้ในอุปกรณ์และซิงค์อัตโนมัติเมื่อต่ออินเทอร์เน็ต
          </p>
        </div>
      </div>
    </div>
  );
};
