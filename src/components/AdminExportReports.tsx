import React, { useState } from 'react';
import { AttendanceRecord, Department } from '../types';
import { FileSpreadsheet, FileText, Printer, Download, Filter, Calendar, Users, Building2, CheckCircle2 } from 'lucide-react';
import { exportToExcel, exportToCSV, printAttendanceReport } from '../utils/export';

interface AdminExportReportsProps {
  records: AttendanceRecord[];
  departments: Department[];
}

export const AdminExportReports: React.FC<AdminExportReportsProps> = ({
  records,
  departments,
}) => {
  const [filterRole, setFilterRole] = useState('all');
  const [filterDept, setFilterDept] = useState('all');
  const [dateRangeMode, setDateRangeMode] = useState<'today' | '7days' | 'month' | 'custom' | 'all'>('7days');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Date calculation
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

  const filteredRecords = records.filter((r) => {
    // Role & Dept
    if (filterRole !== 'all' && r.userRole !== filterRole) return false;
    if (filterDept !== 'all' && r.departmentId !== filterDept) return false;

    // Date
    if (dateRangeMode === 'today') {
      return r.date === todayStr;
    } else if (dateRangeMode === '7days') {
      return r.date >= sevenDaysAgo;
    } else if (dateRangeMode === 'month') {
      return r.date >= firstDayOfMonth;
    } else if (dateRangeMode === 'custom') {
      if (startDate && r.date < startDate) return false;
      if (endDate && r.date > endDate) return false;
    }
    return true;
  });

  const checkInsCount = filteredRecords.filter((r) => r.type === 'check_in').length;
  const checkOutsCount = filteredRecords.filter((r) => r.type === 'check_out').length;
  const volunteersCount = filteredRecords.filter((r) => r.userRole === 'volunteer').length;

  const handleDownloadExcel = () => {
    const filename = `รายงานการลงเวลา_${new Date().toISOString().split('T')[0]}.xlsx`;
    exportToExcel(filteredRecords, filename);
  };

  const handleDownloadCSV = () => {
    const filename = `รายงานการลงเวลา_${new Date().toISOString().split('T')[0]}.csv`;
    exportToCSV(filteredRecords, filename);
  };

  const handlePrint = () => {
    printAttendanceReport(filteredRecords, 'รายงานการลงเวลาเข้า-ออกงานและภารกิจ');
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs p-5 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-emerald-600" /> ดึงรายงานการลงเวลา & ส่งออกไฟล์ (Export Reports)
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          กรองข้อมูลตามช่วงเวลา แผนก และสิทธิ์ พร้อมดาวน์โหลดเป็นไฟล์ Excel (.xlsx), CSV หรือพิมพ์รายงาน PDF
        </p>
      </div>

      {/* Filter Controls */}
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-slate-500" /> ช่วงเวลา:
          </span>
          <button
            type="button"
            onClick={() => setDateRangeMode('today')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${
              dateRangeMode === 'today' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            วันนี้
          </button>
          <button
            type="button"
            onClick={() => setDateRangeMode('7days')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${
              dateRangeMode === '7days' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            7 วันล่าสุด
          </button>
          <button
            type="button"
            onClick={() => setDateRangeMode('month')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${
              dateRangeMode === 'month' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            เดือนนี้
          </button>
          <button
            type="button"
            onClick={() => setDateRangeMode('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${
              dateRangeMode === 'all' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            ทั้งหมด
          </button>
          <button
            type="button"
            onClick={() => setDateRangeMode('custom')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${
              dateRangeMode === 'custom' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            กำหนดช่วงวันที่เอง
          </button>
        </div>

        {dateRangeMode === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-600">ตั้งแต่วันที่:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-600">ถึงวันที่:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg"
              />
            </div>
          </div>
        )}

        {/* Role & Dept filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              บทบาท / สิทธิ์
            </label>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="w-full text-xs p-2 bg-white rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">ทั้งหมด (พนักงาน, อาสาสมัคร, Admin)</option>
              <option value="employee">💼 เฉพาะพนักงาน</option>
              <option value="volunteer">🤝 เฉพาะอาสาสมัคร</option>
              <option value="admin">👑 เฉพาะผู้ดูแลระบบ</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              กลุ่ม / แผนก
            </label>
            <select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="w-full text-xs p-2 bg-white rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">ทุกแผนก / ทุกกลุ่ม</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-indigo-50/60 p-3.5 rounded-2xl border border-indigo-100 text-center">
          <p className="text-[11px] text-indigo-700 font-medium">รายการในรายงาน</p>
          <p className="text-xl sm:text-2xl font-bold text-indigo-900 mt-0.5">{filteredRecords.length}</p>
          <p className="text-[10px] text-indigo-600/80">รายการทั้งหมด</p>
        </div>

        <div className="bg-emerald-50/60 p-3.5 rounded-2xl border border-emerald-100 text-center">
          <p className="text-[11px] text-emerald-700 font-medium">บันทึกเข้างาน</p>
          <p className="text-xl sm:text-2xl font-bold text-emerald-900 mt-0.5">{checkInsCount}</p>
          <p className="text-[10px] text-emerald-600/80">ครั้ง (Check-In)</p>
        </div>

        <div className="bg-rose-50/60 p-3.5 rounded-2xl border border-rose-100 text-center">
          <p className="text-[11px] text-rose-700 font-medium">บันทึกออกงาน</p>
          <p className="text-xl sm:text-2xl font-bold text-rose-900 mt-0.5">{checkOutsCount}</p>
          <p className="text-[10px] text-rose-600/80">ครั้ง (Check-Out)</p>
        </div>

        <div className="bg-sky-50/60 p-3.5 rounded-2xl border border-sky-100 text-center">
          <p className="text-[11px] text-sky-700 font-medium">รายการจิตอาสา</p>
          <p className="text-xl sm:text-2xl font-bold text-sky-900 mt-0.5">{volunteersCount}</p>
          <p className="text-[10px] text-sky-600/80">ภารกิจชุมชน</p>
        </div>
      </div>

      {/* Action Download Buttons */}
      <div className="p-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="font-bold text-sm sm:text-base">ดาวน์โหลดรายงานที่เลือกเป็นไฟล์</h4>
          <p className="text-xs text-slate-300">
            สร้างไฟล์ Excel แท้ (.xlsx) หรือไฟล์ CSV ภาษาไทย ไม่เพี้ยน เปิดได้ในทุกอุปกรณ์
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {/* Excel Button */}
          <button
            type="button"
            disabled={filteredRecords.length === 0}
            onClick={handleDownloadExcel}
            className="flex-1 sm:flex-initial px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>ดาวน์โหลด Excel (.xlsx)</span>
          </button>

          {/* CSV Button */}
          <button
            type="button"
            disabled={filteredRecords.length === 0}
            onClick={handleDownloadCSV}
            className="flex-1 sm:flex-initial px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>ดาวน์โหลด CSV (.csv)</span>
          </button>

          {/* Print / PDF Button */}
          <button
            type="button"
            disabled={filteredRecords.length === 0}
            onClick={handlePrint}
            className="flex-1 sm:flex-initial px-4 py-2.5 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>พิมพ์รายงาน / PDF</span>
          </button>
        </div>
      </div>

      {/* Preview Table snippet */}
      <div>
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
          ตัวอย่างข้อมูลที่จะส่งออก (แสดง 5 รายการแรก)
        </h4>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                <th className="py-2.5 px-3">วัน - เวลา</th>
                <th className="py-2.5 px-3">ชื่อ - นามสกุล</th>
                <th className="py-2.5 px-3">บทบาท</th>
                <th className="py-2.5 px-3">แผนก</th>
                <th className="py-2.5 px-3">ประเภท</th>
                <th className="py-2.5 px-3">สถานที่</th>
                <th className="py-2.5 px-3">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.slice(0, 5).map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="py-2 px-3 font-mono text-[11px]">{r.date} {r.time}</td>
                  <td className="py-2 px-3 font-medium text-slate-800">{r.userName}</td>
                  <td className="py-2 px-3 text-slate-600">
                    {r.userRole === 'volunteer' ? 'อาสาสมัคร' : 'พนักงาน'}
                  </td>
                  <td className="py-2 px-3 text-slate-600">{r.departmentName}</td>
                  <td className="py-2 px-3">
                    <span className={r.type === 'check_in' ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
                      {r.type === 'check_in' ? 'เข้างาน' : 'ออกงาน'}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-slate-500 max-w-[180px] truncate">{r.locationName}</td>
                  <td className="py-2 px-3 text-slate-500 max-w-[140px] truncate">{r.note || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
