import React, { useState, useEffect, useRef } from 'react';
import { WorkLocation } from '../types';
import { calculateDistanceMeters } from '../services/api';
import {
  MapPin,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Building2,
  Radar,
  Smartphone,
  Navigation,
  ShieldCheck,
} from 'lucide-react';

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  locationName: string;
  selectedWorkLocationId?: string;
  selectedWorkLocationName?: string;
  isWithinGeofence?: boolean;
  distanceMeters?: number;
}

interface LocationPickerProps {
  location: LocationData | null;
  workLocations?: WorkLocation[];
  userAssignedLocationId?: string;
  userAssignedLocationName?: string;
  onLocationUpdate: (loc: LocationData) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export const LocationPicker: React.FC<LocationPickerProps> = ({
  location,
  workLocations = [],
  userAssignedLocationId,
  userAssignedLocationName,
  onLocationUpdate,
  isLoading,
  setIsLoading,
}) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Device GPS state (used for distance calculation to the Admin-defined pin)
  const [deviceCoords, setDeviceCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy?: number;
  } | null>(null);

  // Determine initial selected Admin work location
  const getInitialLocationId = (): string => {
    if (userAssignedLocationId && workLocations.some((w) => w.id === userAssignedLocationId)) {
      return userAssignedLocationId;
    }
    const firstActive = workLocations.find((w) => w.isActive);
    return firstActive?.id || workLocations[0]?.id || '';
  };

  const [activeWorkLocationId, setActiveWorkLocationId] = useState<string>(getInitialLocationId);

  // Update activeWorkLocationId if workLocations load or change and current selection is empty
  useEffect(() => {
    if (workLocations.length > 0 && (!activeWorkLocationId || !workLocations.some((w) => w.id === activeWorkLocationId))) {
      setActiveWorkLocationId(getInitialLocationId());
    }
  }, [workLocations, userAssignedLocationId]);

  // Apply the selected Admin work location pin to the attendance form
  const applyAdminWorkLocationPin = (
    chosenLocId: string,
    currentDevice: { latitude: number; longitude: number; accuracy?: number } | null
  ) => {
    if (workLocations.length === 0) {
      // Fallback if no Admin work locations configured yet
      const fallbackLat = currentDevice?.latitude || 13.5781067;
      const fallbackLon = currentDevice?.longitude || 100.594069;
      onLocationUpdate({
        latitude: fallbackLat,
        longitude: fallbackLon,
        accuracy: currentDevice?.accuracy || 20,
        locationName: 'มูลนิธิร่วมกุศล สมุทรปราการ (ศูนย์วิทยุบัวหลวง กู้ชีพกู้ภัย)',
        isWithinGeofence: true,
      });
      return;
    }

    // Find the specific Admin work location
    const targetLoc =
      workLocations.find((w) => w.id === chosenLocId) ||
      workLocations.find((w) => w.id === userAssignedLocationId) ||
      workLocations.find((w) => w.isActive) ||
      workLocations[0];

    if (!targetLoc) return;

    let distanceMeters: number | undefined;
    let isWithinGeofence = true;

    if (currentDevice) {
      distanceMeters = Math.round(
        calculateDistanceMeters(
          currentDevice.latitude,
          currentDevice.longitude,
          targetLoc.latitude,
          targetLoc.longitude
        )
      );
      isWithinGeofence = distanceMeters <= (targetLoc.radiusMeters || 200);
    }

    // PIN THE LOCATION STRICTLY ACCORDING TO THE ADMIN'S WORK LOCATION PIN
    onLocationUpdate({
      latitude: targetLoc.latitude,
      longitude: targetLoc.longitude,
      accuracy: currentDevice?.accuracy || 5,
      locationName: `${targetLoc.name}${targetLoc.address ? ` • ${targetLoc.address}` : ''}`,
      selectedWorkLocationId: targetLoc.id,
      selectedWorkLocationName: targetLoc.name,
      isWithinGeofence,
      distanceMeters,
    });
  };

  // Device GPS detection to verify proximity to the Admin work location pin
  const fetchDeviceGPS = (targetLocId = activeWorkLocationId) => {
    setIsLoading(true);
    setErrorMsg(null);

    if (!navigator.geolocation) {
      setErrorMsg('อุปกรณ์นี้ไม่รองรับระบบ GPS');
      setIsLoading(false);
      applyAdminWorkLocationPin(targetLocId, null);
      return;
    }

    const handleSuccess = (pos: GeolocationPosition) => {
      const dev = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy),
      };
      setDeviceCoords(dev);
      applyAdminWorkLocationPin(targetLocId, dev);
      setIsLoading(false);
    };

    const handleFallback = () => {
      // Use standard accuracy fallback
      navigator.geolocation.getCurrentPosition(
        handleSuccess,
        (fallbackErr) => {
          if (fallbackErr.code === fallbackErr.PERMISSION_DENIED) {
            setErrorMsg('เบราว์เซอร์ไม่ได้รับอนุญาตให้เข้าถึง GPS (ระบบจะใช้พิกัดหมุดที่ Admin กำหนดโดยตรง)');
          } else {
            setErrorMsg('สัญญาณ GPS จากเครื่องอ่อน ระบบใช้พิกัดหมุดจุดปฏิบัติงานของ Admin');
          }
          applyAdminWorkLocationPin(targetLocId, null);
          setIsLoading(false);
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
      );
    };

    navigator.geolocation.getCurrentPosition(handleSuccess, handleFallback, {
      enableHighAccuracy: true,
      timeout: 6000,
      maximumAge: 20000,
    });
  };

  // On mount or when activeWorkLocationId changes, update pin
  useEffect(() => {
    if (activeWorkLocationId && workLocations.length > 0) {
      applyAdminWorkLocationPin(activeWorkLocationId, deviceCoords);
    }
  }, [activeWorkLocationId, workLocations]);

  // Initial GPS fetch on mount
  useEffect(() => {
    fetchDeviceGPS(activeWorkLocationId);
  }, []);

  // When user switches work location in the selector or clicks a location pill
  const handleSelectWorkLocation = (newLocId: string) => {
    setActiveWorkLocationId(newLocId);
    applyAdminWorkLocationPin(newLocId, deviceCoords);
  };

  // Selected work location object
  const selectedLocationObj = workLocations.find((w) => w.id === activeWorkLocationId) || workLocations[0];

  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3.5">
      {/* Header with Title & Refresh button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs sm:text-sm font-bold text-slate-800 block leading-tight">
              พิกัดจุดปฏิบัติงาน (Admin Defined Location)
            </span>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
              <ShieldCheck className="w-3 h-3 text-emerald-600" />
              <span>ปักหมุดตามตำแหน่งที่ผู้ดูแลระบบกำหนดเท่านั้น</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => fetchDeviceGPS(activeWorkLocationId)}
          disabled={isLoading}
          className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-semibold bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-xl transition active:scale-95 disabled:opacity-50 cursor-pointer"
          title="อัปเดตและตรวจวัดระยะห่างกับหมุด Admin"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          {isLoading ? 'กำลังตรวจวัด...' : 'เช็คระยะ GPS'}
        </button>
      </div>

      {errorMsg && (
        <div className="text-xs bg-amber-50 text-amber-800 p-2.5 rounded-xl border border-amber-200 flex items-start gap-1.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Admin Work Locations Selector & Quick Chips */}
      {workLocations.length > 0 && (
        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
            <span className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-indigo-600" />
              <span>เลือกหมุดจุดปฏิบัติงานของ Admin:</span>
            </span>
            <span className="text-[10px] bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">
              {workLocations.length} จุดพิกัด
            </span>
          </div>

          {/* Main Dropdown */}
          <select
            value={activeWorkLocationId}
            onChange={(e) => handleSelectWorkLocation(e.target.value)}
            className="w-full text-xs p-2.5 bg-white rounded-xl border border-slate-200 font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
          >
            {workLocations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                📍 {loc.name} ({loc.code})
              </option>
            ))}
          </select>

          {/* Quick Select Location Pills */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {workLocations.map((loc) => {
              const isSelected = loc.id === activeWorkLocationId;
              return (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => handleSelectWorkLocation(loc.id)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition cursor-pointer flex items-center gap-1 ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs font-semibold'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <MapPin className={`w-3 h-3 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                  <span className="truncate max-w-[180px]">{loc.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Embedded Live Map Preview Anchored to the Admin Work Location Pin */}
      {selectedLocationObj && (
        <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-2xs relative bg-slate-100">
          <div className="relative w-full h-44 sm:h-52">
            <iframe
              key={`map-${selectedLocationObj.id}-${selectedLocationObj.latitude}-${selectedLocationObj.longitude}`}
              title={`พิกัดหมุด ${selectedLocationObj.name}`}
              width="100%"
              height="100%"
              frameBorder="0"
              scrolling="no"
              marginHeight={0}
              marginWidth={0}
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${selectedLocationObj.longitude - 0.005}%2C${selectedLocationObj.latitude - 0.003}%2C${selectedLocationObj.longitude + 0.005}%2C${selectedLocationObj.latitude + 0.003}&layer=mapnik&marker=${selectedLocationObj.latitude}%2C${selectedLocationObj.longitude}`}
              className="w-full h-full"
            />
            {/* Overlay badge on top of map */}
            <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1 pointer-events-none">
              <span className="text-[10px] bg-slate-900/85 backdrop-blur-md text-white font-semibold px-2 py-1 rounded-lg shadow-sm flex items-center gap-1 truncate max-w-[70%]">
                <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="truncate">หมุด: {selectedLocationObj.name}</span>
              </span>
              <span className="text-[10px] bg-emerald-600/90 text-white font-mono px-2 py-1 rounded-lg shadow-sm shrink-0">
                รัศมี {selectedLocationObj.radiusMeters} ม.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Active Pin Details & Distance Status */}
      {location && selectedLocationObj ? (
        <div className="space-y-2">
          {/* Geofence & Proximity Status Badge */}
          <div
            className={`p-2.5 rounded-xl text-xs flex items-center justify-between border ${
              location.isWithinGeofence
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Radar className={`w-4 h-4 shrink-0 ${location.isWithinGeofence ? 'text-emerald-600' : 'text-amber-600'}`} />
              <div className="truncate">
                <span className="font-bold">{selectedLocationObj.name}</span>
                <span className="text-[10px] text-slate-500 block truncate">
                  รหัส: {selectedLocationObj.code} • กำหนดโดยผู้ดูแลระบบ
                </span>
              </div>
            </div>
            <div className="font-mono text-[11px] shrink-0 font-semibold text-right">
              {location.distanceMeters !== undefined ? (
                location.isWithinGeofence ? (
                  <span className="text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-md">
                    ✓ ในรัศมีหมุด ({location.distanceMeters} ม.)
                  </span>
                ) : (
                  <span className="text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-md">
                    ⚠️ ห่างหมุด {location.distanceMeters} ม.
                  </span>
                )
              ) : (
                <span className="text-emerald-700">✓ พิกัดหมุดพร้อมบันทึก</span>
              )}
            </div>
          </div>

          {/* Pin Location Coordinates Details Box */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800 line-clamp-1">
                  📍 {selectedLocationObj.name}
                </p>
                {selectedLocationObj.address && (
                  <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                    {selectedLocationObj.address}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-600 font-mono">
                  <span className="font-semibold text-indigo-700">
                    Lat: {location.latitude.toFixed(5)}
                  </span>
                  <span className="font-semibold text-indigo-700">
                    Lon: {location.longitude.toFixed(5)}
                  </span>
                  <span className="text-emerald-600 font-sans font-medium">
                    ✓ หมุดแท้ Admin
                  </span>
                </div>
              </div>

              <a
                href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1 shrink-0 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition shadow-2xs"
              >
                <span>Google Maps</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
          <p className="text-xs text-slate-500">กำลังเชื่อมโยงหมุดจุดปฏิบัติงานของ Admin...</p>
        </div>
      )}
    </div>
  );
};
