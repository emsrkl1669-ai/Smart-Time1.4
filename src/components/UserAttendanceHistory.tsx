import React, { useState } from 'react';
import { AttendanceRecord } from '../types';
import { Clock, MapPin, Calendar, ExternalLink, X, Image as ImageIcon, WifiOff, CheckCircle2 } from 'lucide-react';

interface UserAttendanceHistoryProps {
  records: AttendanceRecord[];
}

export const UserAttendanceHistory: React.FC<UserAttendanceHistoryProps> = ({ records }) => {
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<{
    lat: number;
    lng: number;
    name: string;
  } | null>(null);

  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 p-5 sm:p-6 shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-600" /> ประวัติการลงเวลาของฉัน
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            บันทึกการเข้าและออกงานล่าสุด ({records.length} รายการ)
          </p>
        </div>
      </div>

      {records.length === 0 ? (
        <div className="text-center py-12 text-slate-400 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
          <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-xs sm:text-sm font-medium text-slate-500">ยังไม่มีประวัติการลงเวลาในระบบ</p>
          <p className="text-xs text-slate-400 mt-1">กดลงเวลาเข้างานหรือออกงานด้านบนเพื่อเริ่มต้น</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((rec) => {
            const isCheckIn = rec.type === 'check_in';
            return (
              <div
                key={rec.id}
                className="p-3.5 sm:p-4 rounded-2xl border border-slate-100 hover:border-slate-200 bg-slate-50/40 hover:bg-white transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
              >
                <div className="flex items-start sm:items-center gap-3">
                  {/* Photo Thumbnail */}
                  {rec.photo ? (
                    <button
                      type="button"
                      onClick={() => setSelectedPhoto(rec.photo)}
                      className="relative w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-slate-200 group cursor-pointer shadow-xs"
                      title="ดูรูปภาพขนาดเต็ม"
                    >
                      <img src={rec.photo} alt={rec.userName} className="w-full h-full object-cover group-hover:scale-110 transition" />
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition" />
                    </button>
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-slate-200 flex items-center justify-center shrink-0 text-slate-400">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                  )}

                  {/* Details */}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-bold inline-flex items-center gap-1 ${
                          isCheckIn
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {isCheckIn ? '🟢 เข้างาน' : '🔴 ออกงาน'}
                      </span>

                      <span className="text-xs font-semibold text-slate-800">
                        {rec.date} • {rec.time} น.
                      </span>

                      {rec.isOfflineRecord && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md flex items-center gap-0.5">
                          <WifiOff className="w-2.5 h-2.5" /> ซิงค์ออฟไลน์
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 mt-1 flex items-center gap-1 line-clamp-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      {rec.locationName}
                    </p>

                    {rec.note && (
                      <p className="text-[11px] text-slate-500 mt-1 bg-white/80 px-2 py-0.5 rounded border border-slate-200/60 inline-block">
                        📝 {rec.note}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedLocation({
                        lat: rec.latitude,
                        lng: rec.longitude,
                        name: rec.locationName,
                      })
                    }
                    className="text-xs px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1 transition"
                  >
                    <MapPin className="w-3.5 h-3.5 text-sky-600" />
                    <span>แผนที่</span>
                  </button>

                  <a
                    href={`https://www.google.com/maps?q=${rec.latitude},${rec.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs p-1.5 rounded-xl text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition"
                    title="เปิดใน Google Maps"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full Photo Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 flex items-center justify-between border-b border-slate-100">
              <h4 className="text-sm font-bold text-slate-800">รูปถ่ายยืนยันตัวตน</h4>
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
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

      {/* Map Modal */}
      {selectedLocation && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 flex items-center justify-between border-b border-slate-100">
              <div>
                <h4 className="text-sm font-bold text-slate-800">พิกัดสถานที่ลงเวลา</h4>
                <p className="text-xs text-slate-500 line-clamp-1">{selectedLocation.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLocation(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
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
                <ExternalLink className="w-3.5 h-3.5" /> นำทางใน Google Maps
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
    </div>
  );
};
