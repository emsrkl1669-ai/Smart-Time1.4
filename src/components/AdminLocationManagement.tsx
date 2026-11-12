import React, { useState } from 'react';
import { WorkLocation, Department } from '../types';
import {
  MapPin,
  PlusCircle,
  Edit,
  Trash2,
  Navigation,
  ExternalLink,
  Search,
  CheckCircle2,
  Building2,
  AlertCircle,
  X,
  Compass,
  Radar,
  Crosshair,
  Map as MapIcon,
} from 'lucide-react';
import { api } from '../services/api';

interface AdminLocationManagementProps {
  locations: WorkLocation[];
  departments: Department[];
  onRefresh: () => void;
}

export const AdminLocationManagement: React.FC<AdminLocationManagementProps> = ({
  locations,
  departments,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<WorkLocation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGettingGps, setIsGettingGps] = useState(false);

  // Search Address State
  const [addressSearchQuery, setAddressSearchQuery] = useState('');
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address: '',
    latitude: 13.5781067,
    longitude: 100.594069,
    radiusMeters: 200,
    departmentId: 'all',
    isActive: true,
  });

  const filteredLocations = locations.filter((loc) => {
    const matchesSearch =
      loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      loc.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      loc.address.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = filterDepartment === 'all' || loc.departmentId === filterDepartment || loc.departmentId === 'all';
    return matchesSearch && matchesDept;
  });

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingLocation(null);
    setFormData({
      name: '',
      code: `LOC-${Math.floor(100 + Math.random() * 900)}`,
      address: '',
      latitude: 13.5781067,
      longitude: 100.594069,
      radiusMeters: 200,
      departmentId: 'all',
      isActive: true,
    });
    setSearchResults([]);
    setAddressSearchQuery('');
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (loc: WorkLocation) => {
    setEditingLocation(loc);
    setFormData({
      name: loc.name,
      code: loc.code,
      address: loc.address,
      latitude: loc.latitude,
      longitude: loc.longitude,
      radiusMeters: loc.radiusMeters || 200,
      departmentId: loc.departmentId || 'all',
      isActive: loc.isActive !== undefined ? loc.isActive : true,
    });
    setSearchResults([]);
    setAddressSearchQuery('');
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  // Get current device GPS coordinates
  const handleGetCurrentGps = () => {
    if (!navigator.geolocation) {
      alert('อุปกรณ์ของคุณไม่รองรับการดึงพิกัด GPS');
      return;
    }
    setIsGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData((prev) => ({
          ...prev,
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
        }));
        setIsGettingGps(false);
      },
      (err) => {
        console.warn('Geolocation error:', err);
        alert('ไม่สามารถรับสัญญาณ GPS ได้ในขณะนี้ กรุณากรอกพิกัดด้วยตนเอง');
        setIsGettingGps(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Search Address with OpenStreetMap Nominatim
  const handleSearchAddress = async () => {
    if (!addressSearchQuery.trim()) return;
    setIsSearchingAddress(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          addressSearchQuery
        )}&countrycodes=th&limit=5`
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch (e) {
      console.warn('Search failed:', e);
    } finally {
      setIsSearchingAddress(false);
    }
  };

  // Select Search Result
  const handleSelectSearchResult = (item: any) => {
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);
    setFormData((prev) => ({
      ...prev,
      name: prev.name || item.name || item.display_name.split(',')[0],
      address: item.display_name,
      latitude: lat,
      longitude: lon,
    }));
    setSearchResults([]);
  };

  // Save Location
  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setErrorMsg('กรุณากรอกชื่อจุดปฏิบัติงาน');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      await api.saveLocation({
        id: editingLocation ? editingLocation.id : undefined,
        ...formData,
      });
      setIsModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setIsLoading(false);
    }
  };

  // Delete Location
  const handleDeleteLocation = async (loc: WorkLocation) => {
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบจุดปฏิบัติงาน "${loc.name}"?`)) return;
    try {
      await api.deleteLocation(loc.id);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'ไม่สามารถลบจุดปฏิบัติงานได้');
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-800 flex items-center gap-2">
            <Compass className="w-5 h-5 text-indigo-600" />
            <span>กำหนดตำแหน่งและพิกัดปฏิบัติงาน (Admin Work Locations)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Admin สามารถกำหนดจุดปฏิบัติงาน พิกัด GPS และรัศมีอนุญาตลงเวลา (Geofence) ได้เองอย่างอิสระ
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs sm:text-sm rounded-xl flex items-center justify-center gap-2 transition shadow-sm active:scale-95 cursor-pointer shrink-0"
        >
          <PlusCircle className="w-4 h-4" />
          <span>เพิ่มตำแหน่งปฏิบัติงานใหม่</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="ค้นหาชื่อจุดปฏิบัติงาน, รหัส, ที่อยู่ หรือพิกัด..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <select
          value={filterDepartment}
          onChange={(e) => setFilterDepartment(e.target.value)}
          className="px-3 py-2 text-xs sm:text-sm bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700"
        >
          <option value="all">ทุกแผนกที่สังกัด</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {/* Locations Cards Grid */}
      {filteredLocations.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
          <MapPin className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm text-slate-500 font-medium">ยังไม่มีข้อมูลจุดปฏิบัติงานที่ตรงตามเงื่อนไข</p>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold text-xs rounded-xl inline-flex items-center gap-1.5 transition"
          >
            <PlusCircle className="w-4 h-4" /> เพิ่มจุดแรกเลย
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredLocations.map((loc) => {
            return (
              <div
                key={loc.id}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:border-slate-300 transition flex flex-col"
              >
                {/* Header with Title and Status */}
                <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-bold">
                        {loc.code}
                      </span>
                      <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-slate-400" />
                        {loc.departmentName || 'ทุกแผนก'}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                          loc.isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {loc.isActive ? 'เปิดใช้งาน' : 'ระงับชั่วคราว'}
                      </span>
                    </div>

                    <h3 className="text-sm sm:text-base font-bold text-slate-800 truncate" title={loc.name}>
                      {loc.name}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-1 mt-0.5" title={loc.address}>
                      {loc.address}
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(loc)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                      title="แก้ไขจุดปฏิบัติงาน"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteLocation(loc)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      title="ลบจุดปฏิบัติงาน"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Map Preview + Details */}
                <div className="p-4 bg-slate-50/60 flex-1 flex flex-col justify-between space-y-3">
                  <div className="h-36 rounded-xl overflow-hidden border border-slate-200 relative">
                    <iframe
                      title={`Map of ${loc.name}`}
                      width="100%"
                      height="100%"
                      frameBorder="0"
                      scrolling="no"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${loc.longitude - 0.005}%2C${loc.latitude - 0.004}%2C${loc.longitude + 0.005}%2C${loc.latitude + 0.004}&layer=mapnik&marker=${loc.latitude}%2C${loc.longitude}`}
                      className="w-full h-full filter saturate-125"
                    />
                    <div className="absolute top-2 right-2 bg-white/95 backdrop-blur-xs text-[10px] font-semibold text-slate-700 px-2 py-0.5 rounded-md shadow-xs border border-slate-200 flex items-center gap-1">
                      <Radar className="w-3 h-3 text-indigo-600" />
                      <span>รัศมี {loc.radiusMeters} ม.</span>
                    </div>
                  </div>

                  {/* Coordinates & Google Maps Link */}
                  <div className="flex items-center justify-between text-xs pt-1">
                    <div className="font-mono text-slate-600 flex items-center gap-1 text-[11px]">
                      <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      <span>{loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}</span>
                    </div>

                    <a
                      href={`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1 text-[11px] hover:underline"
                    >
                      <span>เปิดใน Google Maps</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: ADD / EDIT WORK LOCATION */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800 text-sm sm:text-base flex items-center gap-2">
                <MapPin className="w-4 h-4 text-indigo-600" />
                <span>{editingLocation ? 'แก้ไขตำแหน่งจุดปฏิบัติงาน' : 'กำหนดจุดปฏิบัติงานใหม่'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLocation} className="p-4 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Location Name & Code */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ชื่อจุดปฏิบัติงาน *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="เช่น ศูนย์สั่งการ 1669, จุดจอดรถพยาบาล 1"
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    รหัสจุด
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="LOC-01"
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none uppercase font-mono"
                  />
                </div>
              </div>

              {/* Department Assignment */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    แผนกที่รับผิดชอบ
                  </label>
                  <select
                    value={formData.departmentId}
                    onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="all">ทุกแผนก (ใช้ร่วมกัน)</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                    <span>รัศมีลงเวลา (Geofence)</span>
                    <span className="text-indigo-600 font-mono font-bold">{formData.radiusMeters} ม.</span>
                  </label>
                  <select
                    value={formData.radiusMeters}
                    onChange={(e) => setFormData({ ...formData, radiusMeters: Number(e.target.value) })}
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value={50}>50 เมตร (เข้มงวด)</option>
                    <option value={100}>100 เมตร (มาตรฐาน)</option>
                    <option value={200}>200 เมตร (แนะนำ)</option>
                    <option value={300}>300 เมตร</option>
                    <option value={500}>500 เมตร (บริเวณกว้าง)</option>
                    <option value={1000}>1,000 เมตร (1 กิโลเมตร)</option>
                    <option value={2000}>2,000 เมตร (2 กิโลเมตร)</option>
                  </select>
                </div>
              </div>

              {/* Address / Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ที่อยู่ / จุดสังเกต
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="เช่น แยกราชประสงค์ ถ.พระราม 1 หรือ หน้าตึกอำนวยการ"
                  className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Search Place or Location in Thailand */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-indigo-600" />
                    <span>ค้นหาพิกัดสถานที่ในประเทศไทย</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleGetCurrentGps}
                    disabled={isGettingGps}
                    className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1 transition cursor-pointer"
                  >
                    <Crosshair className={`w-3 h-3 ${isGettingGps ? 'animate-spin' : ''}`} />
                    <span>{isGettingGps ? 'กำลังค้นหา...' : 'ใช้พิกัด GPS ปัจจุบัน'}</span>
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={addressSearchQuery}
                    onChange={(e) => setAddressSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSearchAddress();
                      }
                    }}
                    placeholder="พิมพ์ชื่อสถานที่ เช่น อนุสาวรีย์ชัยสมรภูมิ, รพ.รามา..."
                    className="flex-1 text-xs p-2 bg-white rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSearchAddress}
                    disabled={isSearchingAddress}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition cursor-pointer"
                  >
                    {isSearchingAddress ? 'ค้น...' : 'ค้นหา'}
                  </button>
                </div>

                {searchResults.length > 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-36 overflow-y-auto">
                    {searchResults.map((item, idx) => (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => handleSelectSearchResult(item)}
                        className="w-full text-left p-2 hover:bg-indigo-50 transition text-xs flex items-center justify-between cursor-pointer"
                      >
                        <span className="truncate pr-2">{item.display_name}</span>
                        <span className="text-[10px] text-indigo-600 font-mono shrink-0">เลือก</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Coordinates Inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ละติจูด (Latitude) *
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={formData.latitude}
                    onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) || 0 })}
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ลองจิจูด (Longitude) *
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    value={formData.longitude}
                    onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) || 0 })}
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Map Preview of Coordinates */}
              <div className="h-36 rounded-2xl overflow-hidden border border-slate-200 relative bg-slate-100">
                <iframe
                  title="Preview Coordinates"
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  scrolling="no"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${formData.longitude - 0.006}%2C${formData.latitude - 0.005}%2C${formData.longitude + 0.006}%2C${formData.latitude + 0.005}&layer=mapnik&marker=${formData.latitude}%2C${formData.longitude}`}
                  className="w-full h-full filter saturate-125"
                />
                <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-xs px-2 py-0.5 rounded text-[10px] font-mono text-slate-600 border border-slate-200">
                  📍 {formData.latitude.toFixed(5)}, {formData.longitude.toFixed(5)}
                </div>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="loc_is_active"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                />
                <label htmlFor="loc_is_active" className="text-xs font-medium text-slate-700 cursor-pointer">
                  เปิดให้พนักงานและอาสาสมัครลงเวลา ณ จุดนี้
                </label>
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2 text-xs sm:text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-xs transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isLoading ? 'กำลังบันทึก...' : 'บันทึกตำแหน่ง'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
