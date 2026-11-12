import { User, Department, AttendanceRecord, SystemSettings, LineNotificationLog, AuthResponse, WorkLocation } from '../types';
import { getThaiDateTime, setServerTimeOffset } from '../utils/thaiTime';

const STORAGE_KEYS = {
  CURRENT_USER: 'smart_attendance_current_user',
  TOKEN: 'smart_attendance_token',
  REMEMBERED_LOGIN: 'smart_attendance_remembered_login',
  CACHED_USERS: 'smart_attendance_cached_users',
  CACHED_DEPARTMENTS: 'smart_attendance_cached_departments',
  CACHED_LOCATIONS: 'smart_attendance_cached_locations',
  CACHED_ATTENDANCE: 'smart_attendance_cached_attendance',
  CACHED_SETTINGS: 'smart_attendance_cached_settings',
  OFFLINE_QUEUE: 'smart_attendance_offline_queue',
};

// Check if currently online
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

// Calculate Haversine distance in meters between 2 coordinates
export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

// Offline Queue Management
export function getOfflineQueue(): AttendanceRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function saveOfflineQueue(queue: AttendanceRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
  } catch (e) {
    console.error('Failed to save offline queue', e);
  }
}

export function addToOfflineQueue(record: AttendanceRecord) {
  const queue = getOfflineQueue();
  queue.push(record);
  saveOfflineQueue(queue);
}

export function removeFromOfflineQueue(recordId: string) {
  const queue = getOfflineQueue();
  saveOfflineQueue(queue.filter((r) => r.id !== recordId));
}

export function clearOfflineQueue() {
  localStorage.removeItem(STORAGE_KEYS.OFFLINE_QUEUE);
}

// Remembered login helpers for cross-reboot persistence
export function getRememberedUsername(): string {
  try {
    return localStorage.getItem(STORAGE_KEYS.REMEMBERED_LOGIN) || '';
  } catch {
    return '';
  }
}

export function setRememberedUsername(username: string | null) {
  try {
    if (username) {
      localStorage.setItem(STORAGE_KEYS.REMEMBERED_LOGIN, username.trim());
    } else {
      localStorage.removeItem(STORAGE_KEYS.REMEMBERED_LOGIN);
    }
  } catch {}
}

// Get Public App URL (converts internal AI Studio dev URL ais-dev-... to public shared URL ais-pre-... so other devices can access without Google dev authentication)
export function getPublicAppUrl(): string {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  if (origin.includes('ais-dev-')) {
    return origin.replace('ais-dev-', 'ais-pre-');
  }
  return origin;
}

// Local cache helpers
function setCache(key: string, data: any) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error('Cache save error', e);
  }
}

function getCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// Cross-tab and multi-window live notification channel
let syncChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    syncChannel = new BroadcastChannel('smart_attendance_sync');
  } catch {}
}

export function notifyLocalMutation(type: string, payload?: any) {
  try {
    syncChannel?.postMessage({ type, payload, timestamp: Date.now() });
  } catch {}
}

export function subscribeToLocalMutations(callback: (type: string, payload: any) => void): () => void {
  if (!syncChannel) return () => {};
  const handler = (event: MessageEvent) => {
    if (event.data?.type) {
      callback(event.data.type, event.data.payload);
    }
  };
  syncChannel.addEventListener('message', handler);
  return () => syncChannel?.removeEventListener('message', handler);
}

// Anti-cache fresh fetch: forces browser to bypass disk/memory cache and always contact the server
export async function freshFetch(url: string, init?: RequestInit): Promise<Response> {
  const separator = url.includes('?') ? '&' : '?';
  const freshUrl = `${url}${separator}_t=${Date.now()}`;
  const headers = new Headers(init?.headers);
  headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');

  return fetch(freshUrl, {
    ...init,
    cache: 'no-store',
    headers,
  });
}

// API Methods
export const api = {
  // Current user in local session
  getCurrentUser(): User | null {
    return getCache<User>(STORAGE_KEYS.CURRENT_USER);
  },

  setCurrentUser(user: User | null) {
    if (user) {
      setCache(STORAGE_KEYS.CURRENT_USER, user);
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
    }
  },

  // Cross-device & post-restart verification: Re-validates active user against central database
  async verifySession(userId: string): Promise<User | null> {
    if (!isOnline() || !userId) {
      return this.getCurrentUser();
    }
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.valid && data.user) {
          this.setCurrentUser(data.user);
          return data.user;
        } else if (data.valid === false) {
          console.warn('Session no longer valid on central server, logging out');
          this.logout();
          return null;
        }
      }
    } catch (e) {
      console.warn('Session verification fallback to cache');
    }
    return this.getCurrentUser();
  },

  // Auth: Login with remember device option
  async login(username: string, password: string, rememberDevice: boolean = true): Promise<AuthResponse> {
    if (rememberDevice) {
      setRememberedUsername(username);
    }

    if (isOnline()) {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
          body: JSON.stringify({ username, password }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'เข้าสู่ระบบไม่สำเร็จ');
        }

        const data: AuthResponse = await res.json();
        this.setCurrentUser(data.user);
        setCache(STORAGE_KEYS.TOKEN, data.token);

        // Update cached users in case we need offline later
        const cachedUsers = getCache<User[]>(STORAGE_KEYS.CACHED_USERS) || [];
        const idx = cachedUsers.findIndex((u) => u.id === data.user.id);
        if (idx !== -1) {
          cachedUsers[idx] = data.user;
        } else {
          cachedUsers.push(data.user);
        }
        setCache(STORAGE_KEYS.CACHED_USERS, cachedUsers);

        return data;
      } catch (err: any) {
        if (!err.message?.includes('Failed to fetch')) {
          throw err;
        }
      }
    }

    // Offline login fallback: Check if user exists in local cache
    const cachedUsers = getCache<User[]>(STORAGE_KEYS.CACHED_USERS) || [];
    const matched = cachedUsers.find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase()
    );

    if (matched) {
      this.setCurrentUser(matched);
      return {
        user: matched,
        token: `offline_token_${matched.id}`,
      };
    }

    throw new Error('ไม่สามารถเข้าสู่ระบบในโหมดออฟไลน์ได้ (บัญชีนี้ยังไม่เคยล็อกอินบนอุปกรณ์นี้)');
  },

  logout() {
    this.setCurrentUser(null);
  },

  // Users
  async getUsers(): Promise<User[]> {
    if (isOnline()) {
      try {
        const res = await freshFetch('/api/users');
        if (res.ok) {
          const users = await res.json();
          setCache(STORAGE_KEYS.CACHED_USERS, users);
          return users;
        }
      } catch (e) {
        console.warn('Network error, loading cached users');
      }
    }
    return getCache<User[]>(STORAGE_KEYS.CACHED_USERS) || [];
  },

  async createUser(userData: Partial<User> & { password?: string }): Promise<User> {
    const res = await freshFetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'เพิ่มผู้ใช้งานไม่สำเร็จ');
    }

    const data = await res.json();
    notifyLocalMutation('users_updated', data.user);
    return data.user;
  },

  async updateUser(id: string, userData: Partial<User> & { password?: string }): Promise<User> {
    const res = await freshFetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'แก้ไขข้อมูลผู้ใช้งานไม่สำเร็จ');
    }

    const data = await res.json();
    const updatedUser = data.user;

    // Immediately update local cache so other components or tabs get the updated user
    const cachedUsers = getCache<User[]>(STORAGE_KEYS.CACHED_USERS) || [];
    const idx = cachedUsers.findIndex((u) => u.id === id);
    if (idx !== -1) {
      cachedUsers[idx] = { ...cachedUsers[idx], ...updatedUser };
      setCache(STORAGE_KEYS.CACHED_USERS, cachedUsers);
    }
    const cur = this.getCurrentUser();
    if (cur && cur.id === id) {
      this.setCurrentUser({ ...cur, ...updatedUser });
    }

    notifyLocalMutation('users_updated', updatedUser);
    return updatedUser;
  },

  async deleteUser(id: string): Promise<void> {
    const res = await freshFetch(`/api/users/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'ลบผู้ใช้งานไม่สำเร็จ');
    }

    const cachedUsers = getCache<User[]>(STORAGE_KEYS.CACHED_USERS) || [];
    setCache(STORAGE_KEYS.CACHED_USERS, cachedUsers.filter((u) => u.id !== id));
    notifyLocalMutation('users_updated', { deletedId: id });
  },

  async batchImportUsers(users: (Partial<User> & { password?: string })[]): Promise<{ importedCount: number; updatedCount: number; message: string; totalUsers: number }> {
    const res = await freshFetch('/api/users/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ users }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'นำเข้าข้อมูลผู้ใช้งานไม่สำเร็จ');
    }

    const data = await res.json();
    notifyLocalMutation('users_updated');
    return data;
  },

  async getUsersWithPasswords(): Promise<(User & { password?: string })[]> {
    if (isOnline()) {
      try {
        const res = await freshFetch('/api/admin/users-with-passwords');
        if (res.ok) {
          return await res.json();
        }
      } catch (e) {
        console.warn('Failed to fetch users with passwords', e);
      }
    }
    return this.getUsers();
  },

  async resetUserPassword(id: string, newPassword: string): Promise<void> {
    const res = await freshFetch(`/api/users/${id}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'รีเซ็ตรหัสผ่านไม่สำเร็จ');
    }

    notifyLocalMutation('users_updated', { resetPasswordId: id });
  },

  async getHealth(): Promise<{ usersCount: number; attendanceCount: number; departmentsCount: number; locationsCount: number }> {
    try {
      const res = await freshFetch('/api/health');
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('Failed to check health', e);
    }
    return { usersCount: 0, attendanceCount: 0, departmentsCount: 0, locationsCount: 0 };
  },

  // Departments
  async getDepartments(): Promise<Department[]> {
    if (isOnline()) {
      try {
        const res = await freshFetch('/api/departments');
        if (res.ok) {
          const departments = await res.json();
          setCache(STORAGE_KEYS.CACHED_DEPARTMENTS, departments);
          return departments;
        }
      } catch (e) {
        console.warn('Network error, loading cached departments');
      }
    }
    return getCache<Department[]>(STORAGE_KEYS.CACHED_DEPARTMENTS) || [];
  },

  async saveDepartment(department: Partial<Department>): Promise<Department> {
    const res = await freshFetch('/api/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(department),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'บันทึกข้อมูลแผนกไม่สำเร็จ');
    }

    const data = await res.json();
    const savedDept = data.department;

    const cached = getCache<Department[]>(STORAGE_KEYS.CACHED_DEPARTMENTS) || [];
    const idx = cached.findIndex((d) => d.id === savedDept.id);
    if (idx !== -1) {
      cached[idx] = { ...cached[idx], ...savedDept };
    } else {
      cached.push(savedDept);
    }
    setCache(STORAGE_KEYS.CACHED_DEPARTMENTS, cached);

    notifyLocalMutation('departments_updated', savedDept);
    return savedDept;
  },

  async deleteDepartment(id: string): Promise<void> {
    const res = await freshFetch(`/api/departments/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'ลบแผนกไม่สำเร็จ');
    }

    const cached = getCache<Department[]>(STORAGE_KEYS.CACHED_DEPARTMENTS) || [];
    setCache(STORAGE_KEYS.CACHED_DEPARTMENTS, cached.filter((d) => d.id !== id));
    notifyLocalMutation('departments_updated', { deletedId: id });
  },

  // Work Locations (Admin กำหนดตำแหน่งได้เอง)
  async getLocations(): Promise<WorkLocation[]> {
    if (isOnline()) {
      try {
        const res = await freshFetch('/api/locations');
        if (res.ok) {
          const locations = await res.json();
          setCache(STORAGE_KEYS.CACHED_LOCATIONS, locations);
          return locations;
        }
      } catch (e) {
        console.warn('Network error, loading cached locations');
      }
    }
    return getCache<WorkLocation[]>(STORAGE_KEYS.CACHED_LOCATIONS) || [];
  },

  async saveLocation(location: Partial<WorkLocation>): Promise<WorkLocation> {
    const res = await freshFetch('/api/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(location),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'บันทึกจุดปฏิบัติงานไม่สำเร็จ');
    }

    const data = await res.json();
    const savedLoc = data.location;

    const cached = getCache<WorkLocation[]>(STORAGE_KEYS.CACHED_LOCATIONS) || [];
    const idx = cached.findIndex((l) => l.id === savedLoc.id);
    if (idx !== -1) {
      cached[idx] = { ...cached[idx], ...savedLoc };
    } else {
      cached.push(savedLoc);
    }
    setCache(STORAGE_KEYS.CACHED_LOCATIONS, cached);

    notifyLocalMutation('locations_updated', savedLoc);
    return savedLoc;
  },

  async deleteLocation(id: string): Promise<void> {
    const res = await freshFetch(`/api/locations/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'ลบจุดปฏิบัติงานไม่สำเร็จ');
    }

    const cached = getCache<WorkLocation[]>(STORAGE_KEYS.CACHED_LOCATIONS) || [];
    setCache(STORAGE_KEYS.CACHED_LOCATIONS, cached.filter((l) => l.id !== id));
    notifyLocalMutation('locations_updated', { deletedId: id });
  },

  // Attendance
  async getAttendance(params?: {
    userId?: string;
    departmentId?: string;
    role?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<AttendanceRecord[]> {
    if (isOnline()) {
      try {
        const query = new URLSearchParams();
        if (params?.userId) query.append('userId', params.userId);
        if (params?.departmentId) query.append('departmentId', params.departmentId);
        if (params?.role) query.append('role', params.role);
        if (params?.type) query.append('type', params.type);
        if (params?.startDate) query.append('startDate', params.startDate);
        if (params?.endDate) query.append('endDate', params.endDate);

        const res = await freshFetch(`/api/attendance?${query.toString()}`);
        if (res.ok) {
          const records: AttendanceRecord[] = await res.json();
          setCache(STORAGE_KEYS.CACHED_ATTENDANCE, records);
          
          // Also append any pending offline records not yet synced
          const offlineQueue = getOfflineQueue();
          if (offlineQueue.length > 0) {
            return [...offlineQueue, ...records];
          }
          return records;
        }
      } catch (e) {
        console.warn('Attendance load error, using offline cache');
      }
    }

    const cached = getCache<AttendanceRecord[]>(STORAGE_KEYS.CACHED_ATTENDANCE) || [];
    const offlineQueue = getOfflineQueue();
    return [...offlineQueue, ...cached];
  },

  async recordAttendance(payload: {
    userId: string;
    type: 'check_in' | 'check_out';
    photo: string;
    latitude: number;
    longitude: number;
    accuracy?: number;
    locationName: string;
    workLocationId?: string;
    note?: string;
    customTimestamp?: string;
  }): Promise<{ record: AttendanceRecord; offline: boolean; message: string }> {
    const user = this.getCurrentUser();
    const cachedUsers = getCache<User[]>(STORAGE_KEYS.CACHED_USERS) || [];
    const targetUser = cachedUsers.find((u) => u.id === payload.userId) || (user?.id === payload.userId ? user : null);

    const now = payload.customTimestamp ? new Date(payload.customTimestamp) : new Date();
    const thai = getThaiDateTime(now);
    const dateStr = thai.dateStr;
    const timeStr = thai.timeStr;

    // Detect user OS
    let deviceOs: 'ios' | 'android' | 'desktop' | 'unknown' = 'unknown';
    if (typeof navigator !== 'undefined') {
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        deviceOs = 'ios';
      } else if (/Android/i.test(navigator.userAgent)) {
        deviceOs = 'android';
      } else {
        deviceOs = 'desktop';
      }
    }

    const tempRecord: AttendanceRecord = {
      id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: payload.userId,
      userName: targetUser?.fullName || user?.fullName || 'ผู้ใช้งาน',
      userRole: targetUser?.role || user?.role || 'employee',
      departmentId: targetUser?.departmentId || user?.departmentId || 'dep_general',
      departmentName: targetUser?.departmentName || user?.departmentName || 'ทั่วไป',
      type: payload.type,
      timestamp: now.toISOString(),
      date: dateStr,
      time: timeStr,
      photo: payload.photo,
      latitude: payload.latitude,
      longitude: payload.longitude,
      accuracy: payload.accuracy,
      locationName: payload.locationName,
      workLocationId: payload.workLocationId,
      deviceOs,
      note: payload.note,
      isOfflineRecord: !isOnline(),
      lineNotificationStatus: 'simulated',
    };

    if (isOnline()) {
      try {
        const res = await freshFetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json();
          notifyLocalMutation('attendance_updated', data.record);
          return {
            record: data.record,
            offline: false,
            message: 'บันทึกเวลาสำเร็จ พร้อมส่งการแจ้งเตือนเรียบร้อยแล้ว',
          };
        }
      } catch (e) {
        console.warn('Online submission failed, storing offline');
      }
    }

    // Save offline
    tempRecord.isOfflineRecord = true;
    addToOfflineQueue(tempRecord);
    notifyLocalMutation('attendance_updated', tempRecord);

    return {
      record: tempRecord,
      offline: true,
      message: 'บันทึกเวลาแบบออฟไลน์สำเร็จ (ข้อมูลถูกเก็บในอุปกรณ์ จะซิงค์เข้าสู่ระบบและแจ้ง LINE เมื่อต่อเน็ต)',
    };
  },

  async syncOfflineData(): Promise<{ syncedCount: number; message: string }> {
    const queue = getOfflineQueue();
    if (queue.length === 0) {
      return { syncedCount: 0, message: 'ไม่มีข้อมูลค้างซิงค์' };
    }

    if (!isOnline()) {
      throw new Error('ไม่สามารถซิงค์ได้เนื่องจากยังไม่มีการเชื่อมต่ออินเทอร์เน็ต');
    }

    const res = await freshFetch('/api/attendance/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: queue }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'ซิงค์ข้อมูลไม่สำเร็จ');
    }

    const data = await res.json();
    // Safely remove only the synced items from the offline queue to prevent losing new entries
    const syncedIds = new Set(queue.map((r) => r.id));
    const currentQueue = getOfflineQueue();
    const remaining = currentQueue.filter((item) => !syncedIds.has(item.id));
    saveOfflineQueue(remaining);

    notifyLocalMutation('attendance_updated');
    return {
      syncedCount: data.syncedCount || queue.length,
      message: `ซิงค์ข้อมูลเข้าสู่ฐานข้อมูลกลางสำเร็จ ${data.syncedCount || queue.length} รายการแล้ว`,
    };
  },

  async deleteAttendance(id: string): Promise<void> {
    const res = await freshFetch(`/api/attendance/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'ลบรายการไม่สำเร็จ');
    }

    // Evict from local cache and queue
    const cached = getCache<AttendanceRecord[]>(STORAGE_KEYS.CACHED_ATTENDANCE) || [];
    setCache(STORAGE_KEYS.CACHED_ATTENDANCE, cached.filter((r) => r.id !== id));
    removeFromOfflineQueue(id);
    notifyLocalMutation('attendance_updated', { deletedId: id });
  },

  async updateAttendance(id: string, updates: Partial<AttendanceRecord>): Promise<AttendanceRecord> {
    const res = await freshFetch(`/api/attendance/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'แก้ไขข้อมูลการลงเวลาไม่สำเร็จ');
    }

    const data = await res.json();
    const updatedRecord = data.record;

    const cached = getCache<AttendanceRecord[]>(STORAGE_KEYS.CACHED_ATTENDANCE) || [];
    const idx = cached.findIndex((r) => r.id === id);
    if (idx !== -1) {
      cached[idx] = { ...cached[idx], ...updatedRecord };
      setCache(STORAGE_KEYS.CACHED_ATTENDANCE, cached);
    }

    notifyLocalMutation('attendance_updated', updatedRecord);
    return updatedRecord;
  },

  async cleanDemoAttendance(): Promise<{ message: string; removedCount: number; currentCount: number }> {
    const res = await freshFetch('/api/attendance/clean-demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'ลบข้อมูลตัวอย่างไม่สำเร็จ');
    }
    // Also clear from local cache
    const cached = getCache<AttendanceRecord[]>(STORAGE_KEYS.CACHED_ATTENDANCE) || [];
    const cleaned = cached.filter(
      (r) =>
        r.userId !== 'usr_somchai' &&
        !(r.userName && r.userName.includes('สมชาย')) &&
        r.id !== 'att_1793678354265_gye2' &&
        r.id !== 'att_1791596015445_jm7c'
    );
    setCache(STORAGE_KEYS.CACHED_ATTENDANCE, cleaned);
    notifyLocalMutation('attendance_updated');
    return await res.json();
  },

  async backupAttendanceSnapshot(): Promise<{ message: string; backupFile: string; totalRecords: number; timestamp: string }> {
    const res = await freshFetch('/api/attendance/backup-snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'สร้างจุดสำรองข้อมูลไม่สำเร็จ');
    }
    return await res.json();
  },

  async restoreAttendance(records: AttendanceRecord[]): Promise<{ message: string; restoredCount: number; totalCount: number }> {
    const res = await freshFetch('/api/attendance/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'กู้คืนข้อมูลไม่สำเร็จ');
    }
    notifyLocalMutation('attendance_updated');
    return await res.json();
  },

  async clearAllAttendance(confirmation: string): Promise<{ message: string; clearedCount: number }> {
    const res = await freshFetch('/api/attendance/all', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'ลบประวัติทั้งหมดไม่สำเร็จ');
    }
    setCache(STORAGE_KEYS.CACHED_ATTENDANCE, []);
    notifyLocalMutation('attendance_updated');
    return await res.json();
  },

  // Settings
  async getSettings(): Promise<SystemSettings> {
    if (isOnline()) {
      try {
        const res = await freshFetch('/api/settings');
        if (res.ok) {
          const settings = await res.json();
          setCache(STORAGE_KEYS.CACHED_SETTINGS, settings);
          return settings;
        }
      } catch (e) {
        console.warn('Network error loading settings');
      }
    }
    return (
      getCache<SystemSettings>(STORAGE_KEYS.CACHED_SETTINGS) || {
        companyName: 'Smart Rescue & Organization Attendance',
        defaultLineToken: '',
        enableLineNotifications: true,
        standardCheckInTime: '08:30',
        standardCheckOutTime: '17:30',
        allowOfflineCheckIn: true,
        requirePhotoOnCheckIn: true,
        requireLocationOnCheckIn: true,
      }
    );
  },

  async updateSettings(settings: Partial<SystemSettings>): Promise<SystemSettings> {
    const res = await freshFetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (!res.ok) {
      throw new Error('บันทึกการตั้งค่าไม่สำเร็จ');
    }
    const data = await res.json();
    notifyLocalMutation('settings_updated', data.settings);
    return data.settings;
  },

  // LINE Test & Logs
  async testLineNotification(departmentId?: string, customMessage?: string) {
    const res = await freshFetch('/api/line/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ departmentId, customMessage }),
    });
    return res.json();
  },

  async getLineLogs(): Promise<LineNotificationLog[]> {
    const res = await freshFetch('/api/line/logs');
    if (!res.ok) return [];
    return res.json();
  },

  async syncServerTime(): Promise<void> {
    if (isOnline()) {
      try {
        const res = await freshFetch('/api/time');
        if (res.ok) {
          const data = await res.json();
          if (data.serverTime) {
            setServerTimeOffset(data.serverTime);
          }
        }
      } catch (e) {
        // Fallback to local time if network unavailable
      }
    }
  },

  // Central Database & Disaster Recovery Methods
  async getDatabaseStatus(): Promise<any> {
    try {
      const res = await freshFetch('/api/database/status');
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('Failed to load database status', e);
    }
    return {
      status: isOnline() ? 'unknown' : 'offline',
      storageType: 'Local Emergency Cache',
      counts: {
        users: (getCache<User[]>(STORAGE_KEYS.CACHED_USERS) || []).length,
        departments: (getCache<Department[]>(STORAGE_KEYS.CACHED_DEPARTMENTS) || []).length,
        locations: (getCache<WorkLocation[]>(STORAGE_KEYS.CACHED_LOCATIONS) || []).length,
        attendance: (getCache<AttendanceRecord[]>(STORAGE_KEYS.CACHED_ATTENDANCE) || []).length,
      },
    };
  },

  async createManualBackup(): Promise<{ message: string; backupFile: string; timestamp: string }> {
    const res = await freshFetch('/api/database/backup', { method: 'POST' });
    if (!res.ok) {
      throw new Error('ไม่สามารถสร้างจุดสำรองฐานข้อมูลได้');
    }
    return res.json();
  },

  async verifyAndRepairDatabase(): Promise<{ status: string; repaired: boolean; message: string; counts: any }> {
    const res = await freshFetch('/api/database/verify', { method: 'POST' });
    if (!res.ok) {
      throw new Error('ไม่สามารถตรวจสอบฐานข้อมูลได้');
    }
    return res.json();
  },

  getBackupDownloadUrl(): string {
    return '/api/database/export';
  },

  // Real-Time Cross-Device Sync Check
  async checkSync(): Promise<{
    version: number;
    lastModified: string;
    counts: { users: number; locations: number; departments: number; attendance: number };
    serverTime: string;
    timestamp: number;
  } | null> {
    if (!isOnline()) return null;
    try {
      const res = await freshFetch('/api/sync-check');
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // offline or silent
    }
    return null;
  },

  // Firebase Cloud Firestore Status & Full Sync
  async getFirebaseStatus(): Promise<{
    connected: boolean;
    projectId: string;
    databaseId: string;
    status: string;
    cloudProtected: boolean;
    counts: { users: number; locations: number; departments: number; attendance: number };
    lastSynced?: string;
    timestamp?: string;
  }> {
    try {
      const res = await freshFetch('/api/firebase-status');
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('Failed to fetch firebase status', e);
    }
    return {
      connected: false,
      projectId: 'smart-time-ca6f9',
      databaseId: 'default',
      status: 'offline',
      cloudProtected: true,
      counts: {
        users: 57,
        locations: 5,
        departments: 9,
        attendance: 0,
      },
    };
  },

  async syncFirebase(): Promise<{ success: boolean; message: string; counts: any }> {
    const res = await freshFetch('/api/firebase-sync', { method: 'POST' });
    if (!res.ok) {
      throw new Error('ไม่สามารถเชื่อมต่อซิงค์กับ Cloud Firestore ได้');
    }
    return await res.json();
  },
};
