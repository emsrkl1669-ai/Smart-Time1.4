import React, { useState } from 'react';
import { AttendanceRecord, Department, User, WorkLocation } from '../types';
import {
  Search,
  Filter,
  Calendar,
  MapPin,
  Trash2,
  ExternalLink,
  X,
  Image as ImageIcon,
  CheckCircle,
  WifiOff,
  Bell,
  Eye,
  Edit3,
  ShieldCheck,
  ShieldAlert,
  Download,
  Upload,
  RefreshCw,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Database,
  Sparkles,
  PlusCircle,
  Clock,
  UserCheck,
} from 'lucide-react';
import { api } from '../services/api';
import { exportToExcel, exportToCSV } from '../utils/export';

interface AdminAttendanceTableProps {
  records: AttendanceRecord[];
  departments: Department[];
  users?: User[];
  workLocations?: WorkLocation[];
  onRefresh: () => void;
}

export const AdminAttendanceTable: React.FC<AdminAttendanceTableProps> = ({
  records,
  departments,
  users = [],
  workLocations = [],
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterDept, setFilterDept] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [dateFilterMode, setDateFilterMode] = useState<'today' | '7days' | '30days' | 'custom' | 'all'>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Protection, Backup, Restore & Demo Cleanup States
  const [isCleaningDemo, setIsCleaningDemo] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreJsonInput, setRestoreJsonInput] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Modals
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<{
    lat: number;
    lng: number;
    name: string;
    userName: string;
    time: string;
  } | null>(null);

  // Edit attendance record
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [editForm, setEditForm] = useState({
    type: 'check_in' as 'check_in' | 'check_out',
    date: '',
    time: '',
    locationName: '',
    note: '',
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Manual Attendance Record Modal (Admin records for employee or volunteer)
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({
    userId: '',
    type: 'check_in' as 'check_in' | 'check_out',
    date: new Date().toISOString().split('T')[0],
    time: new Date().toTimeString().split(' ')[0],
    workLocationId: '',
    customLocationName: '',
    note: '',
  });
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);

  const handleOpenManualModal = (defaultType: 'check_in' | 'check_out' = 'check_in') => {
    const curNow = new Date();
    setManualForm({
      userId: users.length > 0 ? users[0].id : '',
      type: defaultType,
      date: curNow.toISOString().split('T')[0],
      time: curNow.toTimeString().split(' ')[0],
      workLocationId: workLocations.length > 0 ? workLocations[0].id : '',
      customLocationName: '',
      note: '',
    });
    setShowManualModal(true);
  };

  const handleManualAttendanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.userId) {
      alert('กรุณาเลือกบุคลากร (พนักงาน หรือ อาสาสมัคร)');
      return;
    }

    const targetUser = users.find((u) => u.id === manualForm.userId);
    if (!targetUser) {
      alert('ไม่พบข้อมูลบุคลากรที่เลือก');
      return;
    }

    const matchedLoc = workLocations.find((l) => l.id === manualForm.workLocationId);
    const locName = matchedLoc ? matchedLoc.name : (manualForm.customLocationName.trim() || 'จุดปฏิบัติงาน (Admin บันทึก)');
    const lat = matchedLoc ? matchedLoc.latitude : 13.5781067;
    const lng = matchedLoc ? matchedLoc.longitude : 100.594069;

    setIsSubmittingManual(true);
    try {
      const customIso = `${manualForm.date}T${manualForm.time}`;
      await api.recordAttendance({
        userId: targetUser.id,
        type: manualForm.type,
        photo: '',
        latitude: lat,
        longitude: lng,
        accuracy: 10,
        locationName: locName,
        workLocationId: matchedLoc?.id,
        note: manualForm.note.trim() ? `${manualForm.note.trim()} [Admin บันทึก]` : '[Admin บันทึกเข้างาน/ออกงาน]',
        customTimestamp: customIso,
      });

      setShowManualModal(false);
      setFeedbackToast({
        type: 'success',
        message: `บันทึกการลงเวลา (${manualForm.type === 'check_in' ? '🟢 เข้างาน' : '🔴 ออกงาน'}) ของ "${targetUser.fullName}" เรียบร้อยแล้ว`,
      });
      onRefresh();
      setTimeout(() => setFeedbackToast(null), 4000);
    } catch (err: any) {
      alert('เกิดข้อผิดพลาดในการบันทึกเวลา: ' + (err?.message || 'ไม่สำเร็จ'));
    } finally {
      setIsSubmittingManual(false);
    }
  };

  // Compute filtered records
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString().split('T')[0];

  const filteredRecords = records.filter((rec) => {
    // Search
    const matchesSearch =
      rec.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rec.departmentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rec.locationName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (rec.note && rec.note.toLowerCase().includes(searchQuery.toLowerCase()));

    // Role & Dept & Type
    const matchesRole =
      filterRole === 'all' ||
      (filterRole === 'employee' ? rec.userRole !== 'volunteer' : rec.userRole === 'volunteer');
    const matchesDept = filterDept === 'all' || rec.departmentId === filterDept;
    const matchesType = filterType === 'all' || rec.type === filterType;

    // Date
    let matchesDate = true;
    if (dateFilterMode === 'today') {
      matchesDate = rec.date === todayStr;
    } else if (dateFilterMode === '7days') {
      matchesDate = rec.date >= sevenDaysAgo;
    } else if (dateFilterMode === '30days') {
      matchesDate = rec.date >= thirtyDaysAgo;
    } else if (dateFilterMode === 'custom') {
      if (customStartDate && rec.date < customStartDate) matchesDate = false;
      if (customEndDate && rec.date > customEndDate) matchesDate = false;
    }

    return matchesSearch && matchesRole && matchesDept && matchesType && matchesDate;
  });

  const handleDelete = async (record: AttendanceRecord) => {
    const ok = window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบรายการลงเวลาของ "${record.userName}" วันที่ ${record.date} ${record.time}?`);
    if (!ok) return;

    try {
      await api.deleteAttendance(record.id);
      onRefresh();
    } catch (e: any) {
      alert(e.message || 'ลบไม่สำเร็จ');
    }
  };

  const handleOpenEdit = (rec: AttendanceRecord) => {
    setEditingRecord(rec);
    setEditForm({
      type: rec.type,
      date: rec.date,
      time: rec.time,
      locationName: rec.locationName,
      note: rec.note || '',
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    setIsSavingEdit(true);
    try {
      await api.updateAttendance(editingRecord.id, editForm);
      setEditingRecord(null);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'แก้ไขข้อมูลไม่สำเร็จ');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleCleanDemoData = async () => {
    const ok = window.confirm(
      'ยืนยันการลบข้อมูลตัวอย่าง/ทดสอบทั้งหมด (ระบบจะลบเฉพาะรายการทดสอบ เช่น "สมชาย ใจดี" หรือ mock log เก่า และคงข้อมูลจริงไว้ทั้งหมด)?'
    );
    if (!ok) return;

    setIsCleaningDemo(true);
    try {
      const res = await api.cleanDemoAttendance();
      setFeedbackToast({
        type: 'success',
        message: `${res.message} ระบบพร้อมบันทึกประวัติเวลาจริง`,
      });
      onRefresh();
      setTimeout(() => setFeedbackToast(null), 4500);
    } catch (err: any) {
      setFeedbackToast({
        type: 'error',
        message: err.message || 'ไม่สามารถลบข้อมูลตัวอย่างได้',
      });
    } finally {
      setIsCleaningDemo(false);
    }
  };

  const handleInstantBackup = async () => {
    setIsBackingUp(true);
    try {
      const res = await api.backupAttendanceSnapshot();
      // Also download full JSON to browser
      const dateTag = new Date().toISOString().slice(0, 10);
      const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-records-backup-${dateTag}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setFeedbackToast({
        type: 'success',
        message: `สร้างจุดสำรองประวัติการลงเวลาสำเร็จ (${res.totalRecords} รายการ) และดาวน์โหลดไฟล์ JSON เรียบร้อยแล้ว`,
      });
      setTimeout(() => setFeedbackToast(null), 4500);
    } catch (err: any) {
      setFeedbackToast({
        type: 'error',
        message: err.message || 'สร้างจุดสำรองข้อมูลไม่สำเร็จ',
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleExportExcelClick = () => {
    const filename = `รายงานการลงเวลา_${new Date().toISOString().split('T')[0]}.xlsx`;
    exportToExcel(filteredRecords.length > 0 ? filteredRecords : records, filename);
  };

  const handleExportCSVClick = () => {
    const filename = `รายงานการลงเวลา_${new Date().toISOString().split('T')[0]}.csv`;
    exportToCSV(filteredRecords.length > 0 ? filteredRecords : records, filename);
  };

  const handleRestoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreJsonInput.trim()) return;

    setIsRestoring(true);
    try {
      let parsed = JSON.parse(restoreJsonInput);
      if (!Array.isArray(parsed) && parsed.records && Array.isArray(parsed.records)) {
        parsed = parsed.records;
      }
      if (!Array.isArray(parsed)) {
        throw new Error('รูปแบบไฟล์ไม่ถูกต้อง ต้องเป็นไฟล์ JSON Array ของข้อมูลการลงเวลา');
      }

      const res = await api.restoreAttendance(parsed);
      setShowRestoreModal(false);
      setRestoreJsonInput('');
      setFeedbackToast({
        type: 'success',
        message: `${res.message} (ประวัติในระบบรวม ${res.totalCount} รายการ)`,
      });
      onRefresh();
      setTimeout(() => setFeedbackToast(null), 4500);
    } catch (err: any) {
      alert('เกิดข้อผิดพลาดในการกู้คืน: ' + err.message);
    } finally {
      setIsRestoring(false);
    }
  };

  // KPI calculations
  const totalCount = records.length;
  const checkInCount = records.filter((r) => r.type === 'check_in').length;
  const checkOutCount = records.filter((r) => r.type === 'check_out').length;
  const volCount = records.filter((r) => r.userRole === 'volunteer').length;
  const staffCount = records.filter((r) => r.userRole !== 'volunteer').length;
  const inGeofenceCount = records.filter((r) => r.isWithinGeofence).length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs space-y-4 p-4 sm:p-5">
      {/* Toast Feedback */}
      {feedbackToast && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 transition animate-fade-in ${
            feedbackToast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : feedbackToast.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-indigo-50 border-indigo-200 text-indigo-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackToast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedbackToast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackToast(null)}
            className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 🛡️ Data Loss Prevention & Safety Ribbon */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-emerald-50/90 via-sky-50/70 to-indigo-50/90 border border-emerald-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-600 text-white inline-flex items-center gap-1 shadow-2xs">
              <ShieldCheck className="w-3.5 h-3.5" /> ระบบป้องกันข้อมูลสูญหาย 4 ชั้น (Active)
            </span>
            <span className="text-xs font-bold text-slate-800">
              บันทึกเวลาเข้า-ออกถาวร ปลอดภัย 100%
            </span>
          </div>
          <p className="text-[11px] text-slate-600">
            ระบบเซฟลงฐานข้อมูลกลางแบบ Atomic Safe Write + สำรองอัตโนมัติก่อนเขียนทับ + Permanent Archive Journal + คิวออฟไลน์ซิงค์เมื่อต่อเน็ต
          </p>
        </div>

        {/* Protection Actions */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={() => handleOpenManualModal('check_in')}
            className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"
            title="บันทึกเวลาเข้า-ออกงานแทนพนักงานหรืออาสาสมัคร"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            บันทึกเวลาแทนบุคลากร
          </button>

          <button
            type="button"
            onClick={handleInstantBackup}
            disabled={isBackingUp}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-200 shadow-2xs transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="สร้างจุดสำรองฐานข้อมูลและดาวน์โหลด JSON"
          >
            <Download className="w-3.5 h-3.5 text-indigo-600" />
            {isBackingUp ? 'กำลังสำรอง...' : 'สำรองข้อมูล (JSON)'}
          </button>

          <button
            type="button"
            onClick={handleExportExcelClick}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-emerald-700 border border-emerald-200 shadow-2xs transition inline-flex items-center gap-1.5 cursor-pointer"
            title="ดาวน์โหลดตารางข้อมูลเป็น Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            ส่งออก Excel
          </button>

          <button
            type="button"
            onClick={() => setShowRestoreModal(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-sky-700 border border-sky-200 shadow-2xs transition inline-flex items-center gap-1.5 cursor-pointer"
            title="นำเข้าหรือกู้คืนประวัติการลงเวลาจากไฟล์สำรอง"
          >
            <Upload className="w-3.5 h-3.5 text-sky-600" />
            กู้คืนข้อมูล
          </button>

          <button
            type="button"
            onClick={handleCleanDemoData}
            disabled={isCleaningDemo}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 shadow-2xs transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="ลบเฉพาะรายการจำลอง เช่น สมชาย ใจดี หรือ mock data เก่า"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            {isCleaningDemo ? 'กำลังล้าง...' : 'ลบตัวอย่างออก'}
          </button>

          <button
            type="button"
            onClick={onRefresh}
            className="p-1.5 rounded-xl text-slate-600 hover:text-indigo-600 hover:bg-white border border-slate-200 transition cursor-pointer"
            title="รีเฟรชข้อมูลล่าสุด"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">บันทึกทั้งหมด</div>
          <div className="text-lg font-black text-slate-900 mt-0.5">{totalCount} <span className="text-xs font-normal text-slate-500">ครั้ง</span></div>
          <div className="text-[10px] text-slate-400 mt-0.5">ในฐานข้อมูลกลาง</div>
        </div>

        <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200">
          <div className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">🟢 เข้างาน (Check-In)</div>
          <div className="text-lg font-black text-emerald-900 mt-0.5">{checkInCount} <span className="text-xs font-normal text-emerald-600">ครั้ง</span></div>
          <div className="text-[10px] text-emerald-600 mt-0.5">บันทึกพร้อมภาพถ่าย</div>
        </div>

        <div className="p-3 rounded-xl bg-rose-50/60 border border-rose-200">
          <div className="text-[10px] font-semibold text-rose-700 uppercase tracking-wider">🔴 ออกงาน (Check-Out)</div>
          <div className="text-lg font-black text-rose-900 mt-0.5">{checkOutCount} <span className="text-xs font-normal text-rose-600">ครั้ง</span></div>
          <div className="text-[10px] text-rose-600 mt-0.5">สิ้นสุดเวร/ปฏิบัติงาน</div>
        </div>

        <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-200">
          <div className="text-[10px] font-semibold text-indigo-700 uppercase tracking-wider">สัดส่วนบุคลากร</div>
          <div className="text-sm font-bold text-indigo-900 mt-0.5">
            💼 {staffCount} <span className="text-slate-400">/</span> 🤝 {volCount}
          </div>
          <div className="text-[10px] text-indigo-600 mt-0.5">เจ้าหน้าที่ / อาสาสมัคร</div>
        </div>

        <div className="p-3 rounded-xl bg-sky-50/60 border border-sky-200 col-span-2 sm:col-span-1">
          <div className="text-[10px] font-semibold text-sky-700 uppercase tracking-wider">🎯 ในรัศมีจุดพิกัด (200ม.)</div>
          <div className="text-lg font-black text-sky-900 mt-0.5">{inGeofenceCount} <span className="text-xs font-normal text-sky-600">ครั้ง</span></div>
          <div className="text-[10px] text-sky-600 mt-0.5">5 จุดมูลนิธิร่วมกุศลฯ</div>
        </div>
      </div>

      {/* Header & Quick Date filter tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="space-y-1.5">
          <h3 className="text-base sm:text-lg font-bold text-slate-900">
            รายการลงเวลาทั้งหมด ({filteredRecords.length} / {records.length} รายการ)
          </h3>
          <p className="text-xs text-slate-500">ตรวจสอบเวลาเข้า-ออก พิกัด GPS รูปถ่าย และสถานะการแจ้งเตือน LINE</p>

          {/* Quick Role Filter Pills (All / Staff / Volunteers) */}
          <div className="flex items-center gap-1.5 pt-1 flex-wrap">
            <span className="text-[11px] text-slate-500 font-semibold mr-1">กลุ่มบุคลากร:</span>
            <button
              type="button"
              onClick={() => setFilterRole('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                filterRole === 'all'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>👥 ทั้งหมด</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${filterRole === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'}`}>{totalCount}</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterRole('employee')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                filterRole === 'employee'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200/60'
              }`}
            >
              <span>💼 พนักงาน (Staff)</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${filterRole === 'employee' ? 'bg-indigo-700 text-white' : 'bg-indigo-100 text-indigo-800'}`}>{staffCount}</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterRole('volunteer')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                filterRole === 'volunteer'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/60'
              }`}
            >
              <span>🤝 อาสาสมัคร (Volunteers)</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${filterRole === 'volunteer' ? 'bg-amber-700 text-white' : 'bg-amber-100 text-amber-800'}`}>{volCount}</span>
            </button>
          </div>
        </div>

        {/* Date Filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setDateFilterMode('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${
              dateFilterMode === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            ทั้งหมด
          </button>
          <button
            type="button"
            onClick={() => setDateFilterMode('today')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${
              dateFilterMode === 'today' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            วันนี้
          </button>
          <button
            type="button"
            onClick={() => setDateFilterMode('7days')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${
              dateFilterMode === '7days' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            7 วันล่าสุด
          </button>
          <button
            type="button"
            onClick={() => setDateFilterMode('30days')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${
              dateFilterMode === '30days' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            30 วันล่าสุด
          </button>
          <button
            type="button"
            onClick={() => setDateFilterMode('custom')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${
              dateFilterMode === 'custom' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            เลือกช่วงวันที่
          </button>
        </div>
      </div>

      {/* Custom Date Pickers */}
      {dateFilterMode === 'custom' && (
        <div className="flex items-center gap-3 p-3 bg-indigo-50/60 rounded-xl border border-indigo-100 text-xs">
          <Calendar className="w-4 h-4 text-indigo-600" />
          <div className="flex items-center gap-2">
            <span>ตั้งแต่วันที่:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-2.5 py-1 bg-white border border-indigo-200 rounded-lg text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span>ถึงวันที่:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-2.5 py-1 bg-white border border-indigo-200 rounded-lg text-xs"
            />
          </div>
        </div>
      )}

      {/* Search & Select Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="ค้นหาชื่อ, แผนก, สถานที่..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="px-3 py-2 text-xs bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700"
        >
          <option value="all">ทุกสิทธิ์ (พนักงาน/อาสาสมัคร/Admin)</option>
          <option value="employee">💼 พนักงาน</option>
          <option value="volunteer">🤝 อาสาสมัคร</option>
          <option value="admin">👑 ผู้ดูแลระบบ</option>
        </select>

        <select
          value={filterDept}
          onChange={(e) => setFilterDept(e.target.value)}
          className="px-3 py-2 text-xs bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700"
        >
          <option value="all">ทุกแผนก / ทุกกลุ่ม</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-2 text-xs bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700"
        >
          <option value="all">ทุกประเภท (เข้างาน / ออกงาน)</option>
          <option value="check_in">🟢 เข้างาน (Check-In)</option>
          <option value="check_out">🔴 ออกงาน (Check-Out)</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
              <th className="py-3 px-3 text-center">รูปถ่าย</th>
              <th className="py-3 px-3">ผู้ลงเวลา</th>
              <th className="py-3 px-3">แผนก / สังกัด</th>
              <th className="py-3 px-3">ประเภท</th>
              <th className="py-3 px-3">วัน - เวลา</th>
              <th className="py-3 px-3">สถานที่ / พิกัด</th>
              <th className="py-3 px-3">หมายเหตุ / ภารกิจ</th>
              <th className="py-3 px-3">แจ้งเตือน LINE</th>
              <th className="py-3 px-3 text-center">ลบ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 px-4 text-center">
                  <div className="max-w-md mx-auto space-y-3">
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-2xs">
                      <CheckCircle2 className="w-7 h-7" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">
                        ลบข้อมูลตัวอย่างออกเรียบร้อยแล้ว — ไม่มีข้อมูลทดสอบค้างในระบบ
                      </h4>
                      <p className="text-xs text-slate-500 mt-1">
                        ระบบพร้อมบันทึกเวลาจริงของบุคลากรทั้ง 57 ท่าน (เจ้าหน้าที่ 23 คน, อาสากู้ชีพ-กู้ภัย 34 นาย) แบบเรียลไทม์ พร้อมการป้องกันข้อมูลสูญหายอัตโนมัติ 4 ชั้น
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px]">
                      <span className="px-2.5 py-1 bg-slate-50 rounded-lg border border-slate-200 text-slate-700 font-medium inline-flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> บันทึกถาวร + ป้องกันสูญหาย
                      </span>
                      <span className="px-2.5 py-1 bg-slate-50 rounded-lg border border-slate-200 text-slate-700 font-medium inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-indigo-600" /> พิกัด 5 จุด (200 ม.)
                      </span>
                      <span className="px-2.5 py-1 bg-slate-50 rounded-lg border border-slate-200 text-slate-700 font-medium inline-flex items-center gap-1">
                        <Bell className="w-3.5 h-3.5 text-amber-600" /> แจ้งเตือน LINE อัตโนมัติ
                      </span>
                    </div>
                  </div>
                </td>
              </tr>
            ) : filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400">
                  ไม่พบรายการลงเวลาตามเงื่อนไขที่กำหนด
                </td>
              </tr>
            ) : (
              filteredRecords.map((r) => {
                const isCheckIn = r.type === 'check_in';
                const isVol = r.userRole === 'volunteer';
                return (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition">
                    {/* Photo */}
                    <td className="py-2.5 px-3 text-center">
                      {r.photo ? (
                        <button
                          type="button"
                          onClick={() => setSelectedPhoto(r.photo)}
                          className="relative w-10 h-10 rounded-lg overflow-hidden border border-slate-200 inline-block group cursor-pointer shadow-2xs"
                          title="คลิกเพื่อดูรูปขนาดใหญ่"
                        >
                          <img src={r.photo} alt={r.userName} className="w-full h-full object-cover group-hover:scale-110 transition" />
                          <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent" />
                        </button>
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-slate-200 inline-flex items-center justify-center text-slate-400">
                          <ImageIcon className="w-4 h-4" />
                        </div>
                      )}
                    </td>

                    {/* User */}
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">{r.userName}</div>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                          isVol
                            ? 'bg-emerald-100 text-emerald-800'
                            : r.userRole === 'admin'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}
                      >
                        {isVol ? '🤝 อาสาสมัคร' : r.userRole === 'admin' ? '👑 ผู้ดูแล' : '💼 พนักงาน'}
                      </span>
                    </td>

                    {/* Department */}
                    <td className="py-2.5 px-3 text-slate-700 font-medium">
                      {r.departmentName}
                    </td>

                    {/* Type */}
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1 ${
                          isCheckIn
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {isCheckIn ? '🟢 เข้างาน' : '🔴 ออกงาน'}
                      </span>
                    </td>

                    {/* Date - Time */}
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-800">{r.date}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{r.time} น.</div>
                      {r.isOfflineRecord && (
                        <span className="text-[9px] bg-amber-100 text-amber-800 px-1 rounded flex items-center gap-0.5 mt-0.5 w-max">
                          <WifiOff className="w-2.5 h-2.5" /> ออฟไลน์
                        </span>
                      )}
                    </td>

                    {/* Location */}
                    <td className="py-2.5 px-3 max-w-[200px]">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedLocation({
                            lat: r.latitude,
                            lng: r.longitude,
                            name: r.locationName,
                            userName: r.userName,
                            time: `${r.date} ${r.time}`,
                          })
                        }
                        className="text-left text-slate-600 hover:text-sky-600 transition flex items-start gap-1 group cursor-pointer"
                      >
                        <MapPin className="w-3.5 h-3.5 text-sky-500 shrink-0 mt-0.5 group-hover:scale-110" />
                        <span className="line-clamp-2">{r.locationName}</span>
                      </button>
                      {r.workLocationName && (
                        <div className="text-[10px] text-indigo-700 font-medium flex items-center gap-1 mt-0.5">
                          <span className="truncate max-w-[140px]">🎯 {r.workLocationName}</span>
                          {r.isWithinGeofence !== undefined && (
                            <span className={r.isWithinGeofence ? 'text-emerald-600 font-semibold' : 'text-amber-600'}>
                              ({r.isWithinGeofence ? '✓' : '⚠️'} {r.distanceFromLocationMeters ? `${r.distanceFromLocationMeters}ม.` : ''})
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Note */}
                    <td className="py-2.5 px-3 text-slate-600 max-w-[150px]">
                      {r.note ? (
                        <span className="line-clamp-2 text-[11px] bg-slate-50 px-2 py-1 rounded border border-slate-100">
                          {r.note}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>

                    {/* LINE Status */}
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          r.lineNotificationStatus === 'sent'
                            ? 'bg-emerald-100 text-emerald-800'
                            : r.lineNotificationStatus === 'simulated'
                            ? 'bg-sky-100 text-sky-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <Bell className="w-2.5 h-2.5" />
                        {r.lineNotificationStatus === 'sent'
                          ? 'ส่งแล้ว'
                          : r.lineNotificationStatus === 'simulated'
                          ? 'จำลอง'
                          : 'ไม่ได้ส่ง'}
                      </span>
                    </td>

                    {/* Actions: Edit & Delete */}
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(r)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                          title="แก้ไขรายการลงเวลานี้"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(r)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="ลบรายการนี้"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Full Photo */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl relative">
            <div className="p-4 flex items-center justify-between border-b border-slate-100">
              <h4 className="text-sm font-bold text-slate-800">รูปภาพเซลฟี่ที่ลงเวลา</h4>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 bg-slate-900">
              <img src={selectedPhoto} alt="ยืนยันตัวตน" className="w-full max-h-[70vh] object-contain rounded-xl" />
            </div>
            <div className="p-3 bg-slate-50 text-center">
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="px-4 py-1.5 bg-slate-800 text-white text-xs rounded-xl hover:bg-slate-900 transition"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Location Map */}
      {selectedLocation && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl relative">
            <div className="p-4 flex items-center justify-between border-b border-slate-100">
              <div>
                <h4 className="text-sm font-bold text-slate-800">
                  พิกัดลงเวลา: {selectedLocation.userName} ({selectedLocation.time})
                </h4>
                <p className="text-xs text-slate-500 line-clamp-1">{selectedLocation.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLocation(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="h-72 w-full bg-slate-100 relative">
              <iframe
                title="Location Map"
                width="100%"
                height="100%"
                frameBorder="0"
                scrolling="no"
                marginHeight={0}
                marginWidth={0}
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${selectedLocation.lng - 0.008}%2C${selectedLocation.lat - 0.005}%2C${selectedLocation.lng + 0.008}%2C${selectedLocation.lat + 0.005}&layer=mapnik&marker=${selectedLocation.lat}%2C${selectedLocation.lng}`}
                className="w-full h-full"
              />
            </div>
            <div className="p-4 bg-slate-50 flex items-center justify-between">
              <a
                href={`https://www.google.com/maps?q=${selectedLocation.lat},${selectedLocation.lng}`}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-1.5 bg-sky-600 text-white text-xs rounded-xl hover:bg-sky-700 transition flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" /> ดูใน Google Maps
              </a>
              <button
                type="button"
                onClick={() => setSelectedLocation(null)}
                className="px-3.5 py-1.5 bg-slate-200 text-slate-700 text-xs rounded-xl hover:bg-slate-300 transition"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Manual Attendance Record by Admin (บันทึกเวลาแทนบุคลากร/อาสาสมัคร) */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl relative my-6 border border-slate-200">
            {/* Header */}
            <div className="p-4 sm:p-5 flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm sm:text-base font-bold text-slate-900">
                    บันทึกเวลาเข้า-ออกงานแทนบุคลากร
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    บันทึกข้อมูลพนักงาน/อาสา พร้อมจัดเก็บถาวรเข้าฐานข้อมูลกลาง
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-white rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleManualAttendanceSubmit} className="p-5 sm:p-6 space-y-4">
              {/* Personnel Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  เลือกบุคลากร (พนักงาน หรือ อาสาสมัคร) <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={manualForm.userId}
                  onChange={(e) => setManualForm((prev) => ({ ...prev, userId: e.target.value }))}
                  className="w-full px-3 py-2.5 text-xs font-medium border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none bg-slate-50 hover:bg-white transition"
                >
                  <option value="" disabled>-- เลือกรายชื่อพนักงาน / อาสาสมัคร ({users.length} ท่าน) --</option>
                  <optgroup label="💼 เจ้าหน้าที่ / พนักงาน (Staff)">
                    {users
                      .filter((u) => u.role !== 'volunteer')
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.employeeCode ? `[${u.employeeCode}] ` : ''}{u.fullName} ({u.departmentName || 'พนักงาน'})
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="🤝 อาสาสมัครกู้ชีพ-กู้ภัย (Rescue Volunteers)">
                    {users
                      .filter((u) => u.role === 'volunteer')
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.employeeCode ? `[${u.employeeCode}] ` : ''}{u.fullName} (อาสาสมัครกู้ชีพ-กู้ภัย)
                        </option>
                      ))}
                  </optgroup>
                </select>
              </div>

              {/* Attendance Type Selector (Check-In / Check-Out) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  ประเภทการลงเวลา <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setManualForm((prev) => ({ ...prev, type: 'check_in' }))}
                    className={`py-3 px-4 rounded-2xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-2 ${
                      manualForm.type === 'check_in'
                        ? 'bg-emerald-500 text-white border-emerald-600 shadow-md shadow-emerald-500/20 ring-2 ring-emerald-500/30'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 ring-2 ring-white"></span>
                    🟢 บันทึกเข้างาน (Check-In)
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualForm((prev) => ({ ...prev, type: 'check_out' }))}
                    className={`py-3 px-4 rounded-2xl text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-2 ${
                      manualForm.type === 'check_out'
                        ? 'bg-rose-500 text-white border-rose-600 shadow-md shadow-rose-500/20 ring-2 ring-rose-500/30'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-300 ring-2 ring-white"></span>
                    🔴 บันทึกออกงาน (Check-Out)
                  </button>
                </div>
              </div>

              {/* Work Location Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  จุดปฏิบัติงานที่กำหนด / พิกัดลงเวลา <span className="text-rose-500">*</span>
                </label>
                <select
                  value={manualForm.workLocationId}
                  onChange={(e) => setManualForm((prev) => ({ ...prev, workLocationId: e.target.value }))}
                  className="w-full px-3 py-2.5 text-xs font-medium border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none bg-slate-50 hover:bg-white transition"
                >
                  <optgroup label="📍 จุดปฏิบัติงานที่ Admin กำหนด (มูลนิธิร่วมกุศล สมุทรปราการ)">
                    {workLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </optgroup>
                  <option value="">➕ ระบุจุดปฏิบัติงานอื่น / ออกเหตุนอกสถานที่</option>
                </select>

                {!manualForm.workLocationId && (
                  <div className="mt-2">
                    <input
                      type="text"
                      placeholder="ระบุชื่อสถานที่ / จุดเกิดเหตุ เช่น ถนนสุขุมวิท กม.30 หรือ โรงพยาบาล..."
                      value={manualForm.customLocationName}
                      onChange={(e) => setManualForm((prev) => ({ ...prev, customLocationName: e.target.value }))}
                      required={!manualForm.workLocationId}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Date & Time with "Right Now" button */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">วันและเวลาที่ลงบันทึก</span>
                  <button
                    type="button"
                    onClick={() => {
                      const cur = new Date();
                      setManualForm((prev) => ({
                        ...prev,
                        date: cur.toISOString().split('T')[0],
                        time: cur.toTimeString().split(' ')[0],
                      }));
                    }}
                    className="text-[11px] text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <Clock className="w-3 h-3" />
                    ⏰ ใช้วันเวลาปัจจุบัน
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">วันที่ (YYYY-MM-DD)</label>
                    <input
                      type="date"
                      required
                      value={manualForm.date}
                      onChange={(e) => setManualForm((prev) => ({ ...prev, date: e.target.value }))}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">เวลา (HH:MM:SS)</label>
                    <input
                      type="text"
                      required
                      placeholder="12:00:00"
                      value={manualForm.time}
                      onChange={(e) => setManualForm((prev) => ({ ...prev, time: e.target.value }))}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Note / Mission */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  หมายเหตุ / ภารกิจ (ถ้ามี)
                </label>
                <input
                  type="text"
                  placeholder="เช่น ประจำศูนย์วิทยุบัวหลวง, ออกเหตุช่วยเหลือผู้ประสบภัย, สแตนด์บาย..."
                  value={manualForm.note}
                  onChange={(e) => setManualForm((prev) => ({ ...prev, note: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                />
              </div>

              {/* Safety notice banner */}
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-[11px] text-emerald-800">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>ข้อมูลจะถูกบันทึกพร้อมเขียนลงไฟล์สำรองถาวร (JSONL + Safe Write) ทันที</span>
              </div>

              {/* Actions */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-4 py-2.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingManual}
                  className="px-5 py-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md shadow-emerald-600/20 transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  {isSubmittingManual ? 'กำลังบันทึก...' : 'บันทึกเวลาเข้าสู่ระบบ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Attendance Record (Admin) */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl relative">
            <div className="p-4 flex items-center justify-between border-b border-slate-100 bg-slate-50">
              <div>
                <h4 className="text-sm font-bold text-slate-800">
                  แก้ไขข้อมูลการลงเวลา: {editingRecord.userName}
                </h4>
                <p className="text-[11px] text-slate-500">
                  {editingRecord.departmentName} • ID: {editingRecord.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
              {/* Type */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ประเภทการลงเวลา
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditForm((prev) => ({ ...prev, type: 'check_in' }))}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      editForm.type === 'check_in'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700 ring-2 ring-emerald-500/20'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    🟢 เข้างาน (Check-In)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditForm((prev) => ({ ...prev, type: 'check_out' }))}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      editForm.type === 'check_out'
                        ? 'bg-rose-50 border-rose-500 text-rose-700 ring-2 ring-rose-500/20'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    🔴 ออกงาน (Check-Out)
                  </button>
                </div>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    วันที่ (YYYY-MM-DD)
                  </label>
                  <input
                    type="date"
                    required
                    value={editForm.date}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, date: e.target.value }))}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    เวลา (HH:MM:SS)
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.time}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, time: e.target.value }))}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                  />
                </div>
              </div>

              {/* Location Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  สถานที่ / จุดปฏิบัติงาน
                </label>
                <input
                  type="text"
                  required
                  value={editForm.locationName}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, locationName: e.target.value }))}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                />
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  หมายเหตุ / ภารกิจ
                </label>
                <textarea
                  rows={2}
                  value={editForm.note}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="ระบุหมายเหตุ หรือปล่อยว่างไว้..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none resize-none"
                />
              </div>

              {/* Footer action buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingRecord(null)}
                  className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-4 py-2 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-xs transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  {isSavingEdit ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Restore Backup Modal */}
      {showRestoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-sky-100 flex items-center justify-center text-sky-600">
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">กู้คืนประวัติการลงเวลาจากไฟล์สำรอง</h4>
                  <p className="text-[11px] text-slate-500">เลือกไฟล์ .json หรือวางข้อมูลเพื่อกู้คืนเข้าสู่ฐานข้อมูลกลาง</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowRestoreModal(false);
                  setRestoreJsonInput('');
                }}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRestoreSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  เลือกไฟล์ JSON จากเครื่อง
                </label>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                      const text = evt.target?.result as string;
                      if (text) setRestoreJsonInput(text);
                    };
                    reader.readAsText(file);
                  }}
                  className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100 file:cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  หรือวางข้อมูล JSON โดยตรง
                </label>
                <textarea
                  rows={5}
                  value={restoreJsonInput}
                  onChange={(e) => setRestoreJsonInput(e.target.value)}
                  placeholder='[{"id": "att_...", "userId": "...", "userName": "...", "type": "check_in", ...}]'
                  className="w-full font-mono text-[11px] p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 resize-none bg-slate-50"
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-800 space-y-1">
                <div className="font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" /> ข้อควรทราบ:
                </div>
                <p>ระบบจะนำเข้ารายการที่ยังไม่มีในระบบ และข้ามรายการที่ซ้ำกันโดยอัตโนมัติ ไม่มีการลบข้อมูลจริงเดิม</p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowRestoreModal(false);
                    setRestoreJsonInput('');
                  }}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isRestoring || !restoreJsonInput.trim()}
                  className="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-xl shadow-xs transition disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isRestoring ? 'กำลังกู้คืน...' : 'เริ่มกู้คืนข้อมูล'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
