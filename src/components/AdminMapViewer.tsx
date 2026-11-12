import React, { useState } from 'react';
import { AttendanceRecord, WorkLocation } from '../types';
import {
  MapPin,
  Navigation,
  ExternalLink,
  Calendar,
  User,
  Eye,
  Building2,
  CheckCircle2,
  Radar,
  Compass,
} from 'lucide-react';

interface AdminMapViewerProps {
  records: AttendanceRecord[];
  locations?: WorkLocation[];
}

export const AdminMapViewer: React.FC<AdminMapViewerProps> = ({ records, locations = [] }) => {
  const [viewMode, setViewMode] = useState<'attendance' | 'locations'>('attendance');

  // Take latest records with coordinates
  const validRecords = records.filter((r) => r.latitude && r.longitude);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(
    validRecords[0] || null
  );

  const [selectedLocation, setSelectedLocation] = useState<WorkLocation | null>(
    locations[0] || null
  );

  // Active target for map iframe
  const activeLat =
    viewMode === 'attendance'
      ? selectedRecord?.latitude || 13.5781067
      : selectedLocation?.latitude || 13.5781067;

  const activeLon =
    viewMode === 'attendance'
      ? selectedRecord?.longitude || 100.594069
      : selectedLocation?.longitude || 100.594069;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs p-5 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-sky-600" /> แผนที่ปักหมุดพิกัดลงเวลา & จุดปฏิบัติงาน (Live Map)
          </h3>
          <p className="text-xs text-slate-500">
            ดูตำแหน่งจริงของพนักงานและอาสาสมัครที่ลงเวลา หรือตรวจสอบจุดปฏิบัติงานที่กำหนดโดย Admin
          </p>
        </div>

        {/* View Switcher & External Link */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="bg-slate-100 p-1 rounded-xl flex items-center text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('attendance')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                viewMode === 'attendance'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📍 พิกัดลงเวลา ({validRecords.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('locations')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                viewMode === 'locations'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🏢 จุดปฏิบัติงาน Admin ({locations.length})
            </button>
          </div>

          <a
            href={`https://www.google.com/maps?q=${activeLat},${activeLon}`}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition self-start sm:self-center"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Google Maps
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Map View Box (2 Cols) */}
        <div className="lg:col-span-2 rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 h-96 sm:h-[480px] relative shadow-inner">
          <iframe
            title="Full Map View"
            width="100%"
            height="100%"
            frameBorder="0"
            scrolling="no"
            marginHeight={0}
            marginWidth={0}
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${activeLon - 0.015}%2C${activeLat - 0.01}%2C${activeLon + 0.015}%2C${activeLat + 0.01}&layer=mapnik&marker=${activeLat}%2C${activeLon}`}
            className="w-full h-full filter saturate-125"
          />

          {/* Active Floating Pin Card on Map */}
          {viewMode === 'attendance' && selectedRecord && (
            <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:max-w-sm bg-white/95 backdrop-blur-md p-3.5 rounded-2xl border border-slate-200 shadow-xl text-xs space-y-1.5 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    selectedRecord.type === 'check_in'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {selectedRecord.type === 'check_in' ? '🟢 เข้างาน' : '🔴 ออกงาน'}
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  {selectedRecord.date} {selectedRecord.time} น.
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                {selectedRecord.photo && (
                  <img
                    src={selectedRecord.photo}
                    alt={selectedRecord.userName}
                    className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0"
                  />
                )}
                <div>
                  <h4 className="font-bold text-slate-800">{selectedRecord.userName}</h4>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Building2 className="w-3 h-3 text-slate-400" /> {selectedRecord.departmentName}
                  </p>
                </div>
              </div>

              <p className="text-slate-600 text-[11px] font-medium pt-1 border-t border-slate-100 line-clamp-2">
                📍 {selectedRecord.locationName}
              </p>
              {selectedRecord.note && (
                <p className="text-slate-500 text-[10px] bg-slate-50 p-1.5 rounded border border-slate-100">
                  📝 {selectedRecord.note}
                </p>
              )}
            </div>
          )}

          {viewMode === 'locations' && selectedLocation && (
            <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:max-w-sm bg-white/95 backdrop-blur-md p-3.5 rounded-2xl border border-slate-200 shadow-xl text-xs space-y-1.5 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center justify-between gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 font-mono">
                  {selectedLocation.code}
                </span>
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  รัศมี {selectedLocation.radiusMeters} ม.
                </span>
              </div>

              <div>
                <h4 className="font-bold text-slate-900">{selectedLocation.name}</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">{selectedLocation.address}</p>
              </div>

              <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600 font-mono">
                <span>{selectedLocation.latitude.toFixed(5)}, {selectedLocation.longitude.toFixed(5)}</span>
                <span className="text-indigo-600 font-sans font-medium">{selectedLocation.departmentName || 'ทุกแผนก'}</span>
              </div>
            </div>
          )}
        </div>

        {/* List of Pins (1 Col) */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3 h-96 sm:h-[480px] flex flex-col">
          <div className="px-2 py-1 mb-2 font-semibold text-xs text-slate-700 flex items-center justify-between">
            <span>
              {viewMode === 'attendance'
                ? `รายการปักหมุดลงเวลา (${validRecords.length})`
                : `จุดปฏิบัติงานที่กำหนด (${locations.length})`}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {viewMode === 'attendance' ? (
              validRecords.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">ยังไม่มีข้อมูลพิกัดลงเวลา</div>
              ) : (
                validRecords.map((r) => {
                  const isSelected = selectedRecord?.id === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedRecord(r)}
                      className={`w-full text-left p-3 rounded-xl border transition flex items-start gap-2.5 cursor-pointer ${
                        isSelected
                          ? 'bg-white border-sky-500 shadow-md ring-2 ring-sky-500/20'
                          : 'bg-white/80 border-slate-200 hover:bg-white hover:border-slate-300'
                      }`}
                    >
                      {r.photo ? (
                        <img
                          src={r.photo}
                          alt={r.userName}
                          className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center shrink-0 text-slate-400">
                          <User className="w-5 h-5" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="font-semibold text-slate-800 text-xs truncate">
                            {r.userName}
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-bold shrink-0 ${
                              r.type === 'check_in'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {r.type === 'check_in' ? 'เข้า' : 'ออก'}
                          </span>
                        </div>

                        <div className="text-[10px] text-slate-500 truncate">
                          {r.departmentName}
                        </div>
                        <div className="text-[10px] text-slate-600 truncate mt-0.5">
                          📍 {r.locationName}
                        </div>
                        <div className="text-[9px] text-slate-400 font-mono mt-0.5">
                          {r.date} {r.time}
                        </div>
                      </div>
                    </button>
                  );
                })
              )
            ) : locations.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">ยังไม่มีจุดปฏิบัติงานที่กำหนด</div>
            ) : (
              locations.map((loc) => {
                const isSelected = selectedLocation?.id === loc.id;
                return (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => setSelectedLocation(loc)}
                    className={`w-full text-left p-3 rounded-xl border transition flex items-start gap-2.5 cursor-pointer ${
                      isSelected
                        ? 'bg-white border-indigo-500 shadow-md ring-2 ring-indigo-500/20'
                        : 'bg-white/80 border-slate-200 hover:bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
                      <Radar className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className="font-semibold text-slate-900 text-xs truncate">
                          {loc.name}
                        </span>
                        <span className="font-mono text-[9px] bg-slate-100 text-slate-700 px-1 rounded font-bold">
                          {loc.code}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">{loc.address}</div>
                      <div className="text-[10px] text-indigo-600 font-medium mt-0.5">
                        รัศมี {loc.radiusMeters} ม. • {loc.departmentName || 'ทุกแผนก'}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
