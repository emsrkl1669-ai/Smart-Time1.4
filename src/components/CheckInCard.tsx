import React, { useState, useEffect } from 'react';
import { LogIn, LogOut, Clock, Calendar, CheckCircle, ShieldAlert, Sparkles, Building2, Bell, MapPin, Smartphone } from 'lucide-react';
import { User, AttendanceType, WorkLocation } from '../types';
import { CameraCapture } from './CameraCapture';
import { LocationPicker } from './LocationPicker';
import { api, isOnline } from '../services/api';
import { getThaiDateTime } from '../utils/thaiTime';

interface CheckInCardProps {
  currentUser: User;
  workLocations?: WorkLocation[];
  onAttendanceSuccess: () => void;
}

export const CheckInCard: React.FC<CheckInCardProps> = ({
  currentUser,
  workLocations = [],
  onAttendanceSuccess,
}) => {
  // Current Time State
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  
  // Check-In Form State
  const [photo, setPhoto] = useState<string>('');
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy?: number;
    locationName: string;
    selectedWorkLocationId?: string;
    selectedWorkLocationName?: string;
    isWithinGeofence?: boolean;
    distanceMeters?: number;
  } | null>(null);
  const [isLocLoading, setIsLocLoading] = useState(false);
  const [note, setNote] = useState('');
  
  // Submission Status
  const [submittingType, setSubmittingType] = useState<AttendanceType | null>(null);
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'success' | 'error';
    title: string;
    message: string;
    isOffline?: boolean;
    lineStatus?: string;
  } | null>(null);

  // Digital clock interval & Thai time sync
  useEffect(() => {
    // Sync with server atomic clock on mount
    api.syncServerTime().catch(() => {});

    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format Thai Real-Time strictly with Asia/Bangkok
  const thai = getThaiDateTime(currentTime);
  const [hours, minutes, seconds] = thai.timeStr.split(':');

  const handleSubmit = async (type: AttendanceType) => {
    if (!photo) {
      alert('กรุณาถ่ายรูปเซลฟี่เพื่อยืนยันตัวตนก่อนบันทึกเวลา');
      return;
    }

    if (!location) {
      alert('กำลังค้นหาพิกัด GPS กรุณารอสักครู่แล้วลองใหม่อีกครั้ง');
      return;
    }

    setSubmittingType(type);
    setStatusFeedback(null);

    try {
      const res = await api.recordAttendance({
        userId: currentUser.id,
        type,
        photo,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        locationName: location.locationName,
        workLocationId: location.selectedWorkLocationId,
        note: note.trim(),
      });

      setStatusFeedback({
        type: 'success',
        title: type === 'check_in' ? '🟢 บันทึกเข้างานสำเร็จ!' : '🔴 บันทึกออกงานสำเร็จ!',
        message: res.message,
        isOffline: res.offline,
        lineStatus: res.record.lineNotificationStatus,
      });

      // Clear note & photo after success
      setPhoto('');
      setNote('');

      // Refresh list
      onAttendanceSuccess();
    } catch (err: any) {
      console.error('Error submitting attendance:', err);
      setStatusFeedback({
        type: 'error',
        title: 'เกิดข้อผิดพลาดในการลงเวลา',
        message: err.message || 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง',
      });
    } finally {
      setSubmittingType(null);
    }
  };

  const isVolunteer = currentUser.role === 'volunteer';

  return (
    <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
      {/* Top Banner with Thai Standard Time */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 sm:p-7 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                isVolunteer ? 'bg-emerald-500 text-white' : (currentUser.role === 'admin' ? 'bg-amber-500 text-white' : 'bg-indigo-500 text-white')
              }`}>
                {isVolunteer ? '🤝 อาสาสมัคร' : (currentUser.role === 'admin' ? '👑 ผู้ดูแลระบบ' : '💼 พนักงาน')}
              </span>
              <span className="text-xs bg-white/10 px-2.5 py-0.5 rounded-full text-slate-200 flex items-center gap-1">
                <Building2 className="w-3 h-3 text-sky-400" /> {currentUser.departmentName}
              </span>
              {currentUser.assignedLocationName && (
                <span className="text-xs bg-white/10 px-2.5 py-0.5 rounded-full text-emerald-300 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-emerald-400" /> {currentUser.assignedLocationName}
                </span>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
              {currentUser.fullName}
            </h2>
            <p className="text-xs text-slate-300 font-light mt-0.5">
              รหัส: {currentUser.employeeCode} {currentUser.position ? `• ตำแหน่ง: ${currentUser.position}` : ''}
            </p>
          </div>

          {/* Targeted LINE Notification Notification Info */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/15 max-w-xs text-xs">
            <div className="flex items-center gap-1.5 text-emerald-300 font-semibold mb-1">
              <Bell className="w-3.5 h-3.5 animate-bounce" />
              <span>การแจ้งเตือนแบบเจาะจงกลุ่ม</span>
            </div>
            <p className="text-slate-200 text-[11px] leading-relaxed">
              เมื่อลงเวลา ระบบจะส่งแจ้งเตือนเข้ากลุ่ม LINE ของ <strong className="text-white font-medium">{currentUser.departmentName}</strong> อัตโนมัติ
            </p>
          </div>
        </div>

        {/* Live Digital Clock Section with Thai Standard Time (Asia/Bangkok GMT+7) */}
        <div className="mt-5 pt-4 border-t border-white/15 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-300 text-xs sm:text-sm">
            <Calendar className="w-4 h-4 text-sky-400" />
            <span className="font-medium">{thai.fullThaiDate}</span>
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-400/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              เวลาจริงประเทศไทย GMT+7
            </span>
          </div>

          <div className="flex items-baseline gap-1 bg-black/40 px-3.5 py-1.5 rounded-xl border border-white/10 font-mono text-emerald-400">
            <Clock className="w-4 h-4 text-emerald-400 self-center mr-1" />
            <span className="text-xl sm:text-2xl font-bold">{hours}</span>
            <span className="animate-pulse text-lg font-bold">:</span>
            <span className="text-xl sm:text-2xl font-bold">{minutes}</span>
            <span className="animate-pulse text-lg font-bold">:</span>
            <span className="text-sm font-semibold text-emerald-300">{seconds}</span>
          </div>
        </div>
      </div>

      {/* Main Content Form */}
      <div className="p-5 sm:p-6 space-y-5">
        {/* Feedback Alert */}
        {statusFeedback && (
          <div
            className={`p-4 rounded-2xl border transition-all ${
              statusFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-850'
                : 'bg-rose-50 border-rose-200 text-rose-850'
            }`}
          >
            <div className="flex items-start gap-3">
              {statusFeedback.type === 'success' ? (
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 text-xs sm:text-sm">
                <p className="font-bold">{statusFeedback.title}</p>
                <p className="mt-0.5 opacity-90">{statusFeedback.message}</p>
                {statusFeedback.isOffline && (
                  <p className="mt-1 text-xs text-amber-700 bg-amber-100/70 p-1.5 rounded-lg inline-block">
                    ⚡ ข้อมูลถูกบันทึกในอุปกรณ์แล้ว และจะส่งแจ้งเตือนเข้า LINE เมื่อเชื่อมต่ออินเทอร์เน็ต
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Step 1: Selfie Camera (Optimized for iOS & Android) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>1. ถ่ายรูปเซลฟี่จากกล้องสดเท่านั้น *</span>
              {photo ? (
                <span className="text-emerald-700 text-xs font-semibold">✓ บันทึกภาพสดแล้ว</span>
              ) : (
                <span className="text-amber-700 text-[11px] font-normal">ห้ามใช้รูปจากคลังภาพ</span>
              )}
            </label>
            <CameraCapture
              photo={photo}
              onPhotoCaptured={(data) => setPhoto(data)}
              onRetake={() => setPhoto('')}
            />
          </div>

          {/* Step 2: Location & Notes */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                2. ตรวจสอบพิกัดสถานที่ปฏิบัติงาน *
              </label>
              <LocationPicker
                location={location}
                workLocations={workLocations}
                userAssignedLocationId={currentUser.assignedLocationId}
                userAssignedLocationName={currentUser.assignedLocationName}
                onLocationUpdate={(loc) => setLocation(loc)}
                isLoading={isLocLoading}
                setIsLoading={setIsLocLoading}
              />
            </div>

            {/* Step 3: Note or Volunteer Mission */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>
                  {isVolunteer ? '3. ภารกิจจิตอาสา / กิจกรรมสาธารณะ' : '3. หมายเหตุ / งานที่ปฏิบัติ (ถ้ามี)'}
                </span>
                {isVolunteer && (
                  <span className="text-[11px] text-emerald-700 font-normal">ระบุภารกิจหรือรหัสแจ้งเหตุ</span>
                )}
              </label>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  isVolunteer
                    ? 'เช่น ออกเหตุ ว.40 อุบัติเหตุ จยย. แยกอโศก, แจกจ่ายอาหารชุมชน...'
                    : 'เช่น เข้าเวรกู้ชีพกะเช้า, ประจำจุดตรวจการณ์, ส่งต่อผู้ป่วย...'
                }
                className="w-full text-xs sm:text-sm p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-slate-50/50 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons: Check-In & Check-Out */}
        <div className="pt-2">
          {!isOnline() && (
            <div className="mb-3 p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-ping" />
              <span>
                <strong>โหมดออฟไลน์:</strong> บันทึกเวลาได้ทันทีโดยไม่ต้องใช้อินเทอร์เน็ต ข้อมูลจะซิงค์อัตโนมัติเมื่อเชื่อมต่อ
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {/* Check-In Button */}
            <button
              type="button"
              disabled={submittingType !== null}
              onClick={() => handleSubmit('check_in')}
              className="py-4 px-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-base sm:text-lg flex items-center justify-center gap-2.5 shadow-md shadow-emerald-600/20 active:scale-[0.98] transition cursor-pointer disabled:opacity-50"
            >
              <LogIn className="w-5 h-5 sm:w-6 sm:h-6" />
              <span>{submittingType === 'check_in' ? 'กำลังบันทึกเวลา...' : 'ลงเวลาเข้างาน (Check-In)'}</span>
            </button>

            {/* Check-Out Button */}
            <button
              type="button"
              disabled={submittingType !== null}
              onClick={() => handleSubmit('check_out')}
              className="py-4 px-5 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-bold text-base sm:text-lg flex items-center justify-center gap-2.5 shadow-md shadow-rose-600/20 active:scale-[0.98] transition cursor-pointer disabled:opacity-50"
            >
              <LogOut className="w-5 h-5 sm:w-6 sm:h-6" />
              <span>{submittingType === 'check_out' ? 'กำลังบันทึกเวลา...' : 'ลงเวลาออกงาน (Check-Out)'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
