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

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  locationName: string;
  selectedWorkLocationId?: string;
  selectedWorkLocationName?: string;
  isWithinGeofence?: boolean;
  distanceMeters?: number;
  deviceLatitude?: number;
  deviceLongitude?: number;
  detailedAddress?: string;
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

function formatThaiNominatimAddress(address: any, displayName?: string): string {
  if (!address || typeof address !== 'object') {
    return displayName || '';
  }

  const parts: string[] = [];
  const houseRoad = [
    address.house_number ? `เลขที่ ${address.house_number}` : '',
    address.road || address.pedestrian || address.footway || '',
  ]
    .filter(Boolean)
    .join(' ');
  if (houseRoad) parts.push(houseRoad);

  const subdistrict =
    address.suburb || address.quarter || address.village || address.neighbourhood || address.hamlet;
  if (subdistrict) {
    parts.push(subdistrict.startsWith('ต.') || subdistrict.startsWith('ตำบล') || subdistrict.startsWith('แขวง') ? subdistrict : `ต.${subdistrict}`);
  }

  const district = address.city_district || address.county || address.town || address.city;
  if (district && district !== subdistrict) {
    parts.push(district.startsWith('อ.') || district.startsWith('อำเภอ') || district.startsWith('เขต') ? district : `อ.${district}`);
  }

  const province = address.state || address.province;
  if (province && province !== district) {
    parts.push(province.startsWith('จ.') || province.startsWith('จังหวัด') || province.includes('กรุงเทพ') ? province : `จ.${province}`);
  }

  if (address.postcode) {
    parts.push(address.postcode);
  }

  const combined = parts.filter(Boolean).join(' ');
  return combined || displayName || '';
}

export const MANDATORY_CHECKIN_LOCATION: WorkLocation = {
  id: 'loc_bualuang_hq',
  name: 'มูลนิธิร่วมกุศล สมุทรปราการ (ศูนย์วิทยุบัวหลวง กู้ชีพกู้ภัย)',
  code: 'LOC-BUALUANG-HQ',
  address: '57/1 ซอยท้ายบ้าน 17, ตำบลปากน้ำ, เทศบาลนครสมุทรปราการ, อำเภอเมืองสมุทรปราการ, จังหวัดสมุทรปราการ 10290',
  latitude: 13.5781067,
  longitude: 100.594069,
  radiusMeters: 200,
  departmentId: 'all',
  departmentName: 'ทุกแผนก (ใช้ร่วมกัน)',
  isActive: true,
  createdAt: '2026-01-01T08:00:00.000Z',
};

function resolveMandatoryLocation(workLocations: WorkLocation[]): WorkLocation {
  const fromDb = workLocations.find(
    (w) => w.id === MANDATORY_CHECKIN_LOCATION.id || w.code === MANDATORY_CHECKIN_LOCATION.code
  );
  if (!fromDb) return MANDATORY_CHECKIN_LOCATION;
  return {
    ...MANDATORY_CHECKIN_LOCATION,
    ...fromDb,
    name: fromDb.name || MANDATORY_CHECKIN_LOCATION.name,
    code: fromDb.code || MANDATORY_CHECKIN_LOCATION.code,
    address: MANDATORY_CHECKIN_LOCATION.address,
    latitude: Number.isFinite(Number(fromDb.latitude)) ? Number(fromDb.latitude) : MANDATORY_CHECKIN_LOCATION.latitude,
    longitude: Number.isFinite(Number(fromDb.longitude)) ? Number(fromDb.longitude) : MANDATORY_CHECKIN_LOCATION.longitude,
    radiusMeters: Number(fromDb.radiusMeters) > 0 ? Number(fromDb.radiusMeters) : MANDATORY_CHECKIN_LOCATION.radiusMeters,
    departmentId: 'all',
    departmentName: 'ทุกแผนก (ใช้ร่วมกัน)',
  };
}

export const LocationPicker: React.FC<LocationPickerProps> = ({
  location,
  workLocations = [],
  onLocationUpdate,
  isLoading,
  setIsLoading,
}) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Device GPS state (used for distance calculation & photo watermark coordinates)
  const [deviceCoords, setDeviceCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy?: number;
  } | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState<string>('');
  const lastGeocodedKeyRef = useRef<string>('');

  const mandatoryLoc = resolveMandatoryLocation(workLocations);

  // Reverse geocode coordinates in Thai (House no., Road, Subdistrict, District, Province)
  const reverseGeocodeThai = async (lat: number, lon: number, fallbackAddr?: string): Promise<string> => {
    const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    if (lastGeocodedKeyRef.current === cacheKey && resolvedAddress) {
      return resolvedAddress;
    }
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 3500) : null;
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&accept-language=th&addressdetails=1`;
      const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
      if (timeoutId) clearTimeout(timeoutId);
      if (res.ok) {
        const json = await res.json();
        const formatted = formatThaiNominatimAddress(json.address, json.display_name);
        if (formatted) {
          lastGeocodedKeyRef.current = cacheKey;
          setResolvedAddress(formatted);
          return formatted;
        }
      }
    } catch {
      // Fallback cleanly to mandatory work location address if offline/rate-limited
    }
    return fallbackAddr || '';
  };

  // Apply the exclusive mandatory check-in location pin (LOC-BUALUANG-HQ)
  const applyMandatoryWorkLocationPin = (
    currentDevice: { latitude: number; longitude: number; accuracy?: number } | null,
    overrideDetailedAddress?: string
  ) => {
    const targetLoc = resolveMandatoryLocation(workLocations);

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

    const bestAddress =
      overrideDetailedAddress || resolvedAddress || targetLoc.address || targetLoc.name;

    onLocationUpdate({
      latitude: targetLoc.latitude,
      longitude: targetLoc.longitude,
      accuracy: currentDevice?.accuracy || 5,
      locationName: `${targetLoc.name}${targetLoc.address ? ` • ${targetLoc.address}` : ''}`,
      selectedWorkLocationId: targetLoc.id,
      selectedWorkLocationName: targetLoc.name,
      isWithinGeofence,
      distanceMeters,
      deviceLatitude: currentDevice?.latitude ?? targetLoc.latitude,
      deviceLongitude: currentDevice?.longitude ?? targetLoc.longitude,
      detailedAddress: bestAddress,
    });
  };

  // Device GPS detection to verify proximity to the mandatory work location pin
  const fetchDeviceGPS = () => {
    setIsLoading(true);
    setErrorMsg(null);

    const targetLoc = resolveMandatoryLocation(workLocations);

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setErrorMsg('อุปกรณ์นี้ไม่รองรับระบบ GPS (ใช้พิกัดหมุดจุดเช็คอินหลัก)');
      setIsLoading(false);
      applyMandatoryWorkLocationPin(null);
      return;
    }

    const handleSuccess = async (pos: GeolocationPosition) => {
      const dev = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy),
      };
      setDeviceCoords(dev);
      applyMandatoryWorkLocationPin(dev);
      setIsLoading(false);

      // Enrich with detailed street/subdistrict Thai address asynchronously
      const addr = await reverseGeocodeThai(dev.latitude, dev.longitude, targetLoc.address);
      if (addr) {
        applyMandatoryWorkLocationPin(dev, addr);
      }
    };

    const handleFallback = () => {
      try {
        navigator.geolocation.getCurrentPosition(
          handleSuccess,
          (fallbackErr) => {
            if (fallbackErr && fallbackErr.code === fallbackErr.PERMISSION_DENIED) {
              setErrorMsg('เบราว์เซอร์ไม่ได้รับอนุญาตให้เข้าถึง GPS (ระบบใช้พิกัดหมุดจุดเช็คอินหลักโดยตรง)');
            } else {
              setErrorMsg('สัญญาณ GPS จากเครื่องอ่อน ระบบใช้พิกัดหมุดจุดเช็คอินหลัก');
            }
            applyMandatoryWorkLocationPin(null);
            setIsLoading(false);
          },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
        );
      } catch {
        applyMandatoryWorkLocationPin(null);
        setIsLoading(false);
      }
    };

    try {
      navigator.geolocation.getCurrentPosition(handleSuccess, handleFallback, {
        enableHighAccuracy: true,
        timeout: 6000,
        maximumAge: 20000,
      });
    } catch {
      handleFallback();
    }
  };

  // Update pin whenever workLocations change
  useEffect(() => {
    applyMandatoryWorkLocationPin(deviceCoords);
  }, [workLocations]);

  // Initial GPS fetch on mount
  useEffect(() => {
    fetchDeviceGPS();
  }, []);

  const selectedLocationObj = mandatoryLoc;

  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3.5">
      {/* Header with Title & Refresh button */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
            <MapPin className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-xs sm:text-sm font-bold text-slate-800 block leading-tight">
              จุดเช็คอินหลัก (พนักงานทุกคนเช็คอินที่นี่เท่านั้น)
            </span>
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 mt-0.5 font-medium">
              <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" />
              <span className="truncate">ล็อกหมุดจุดปฏิบัติงานเดียวของมูลนิธิฯ ({selectedLocationObj.code})</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => fetchDeviceGPS()}
          disabled={isLoading}
          className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-semibold bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-xl transition active:scale-95 disabled:opacity-50 cursor-pointer shrink-0"
          title="อัปเดตและตรวจวัดระยะห่างกับหมุดจุดเช็คอิน"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{isLoading ? 'กำลังตรวจวัด...' : 'เช็คระยะ GPS'}</span>
        </button>
      </div>

      {errorMsg && (
        <div className="text-xs bg-amber-50 text-amber-800 p-2.5 rounded-xl border border-amber-200 flex items-start gap-1.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Exclusive Locked Work Location Banner */}
      <div className="bg-indigo-50/70 p-3 rounded-2xl border border-indigo-200/80 space-y-1.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>{selectedLocationObj.name}</span>
          </span>
          <span className="text-[10px] bg-indigo-600 text-white font-mono font-bold px-2 py-0.5 rounded-full shrink-0">
            {selectedLocationObj.code}
          </span>
        </div>
        <p className="text-[11px] text-slate-600 leading-relaxed">
          {selectedLocationObj.address}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-600 pt-0.5">
          <span className="font-mono text-indigo-800 font-semibold">
            GPS: {selectedLocationObj.latitude.toFixed(7)}, {selectedLocationObj.longitude.toFixed(6)}
          </span>
          <span>• แผนกที่รับผิดชอบ: <strong>ทุกแผนก (ใช้ร่วมกัน)</strong></span>
          <span className="text-emerald-700 font-semibold">• รัศมี {selectedLocationObj.radiusMeters} ม.</span>
        </div>
      </div>

      {/* Embedded Live Map Preview Anchored to LOC-BUALUANG-HQ */}
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
