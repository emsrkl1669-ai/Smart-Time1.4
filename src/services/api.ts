import { User, Department, AttendanceRecord, SystemSettings, LineNotificationLog, AuthResponse, WorkLocation } from '../types';
import { getThaiDateTime, setServerTimeOffset } from '../utils/thaiTime';
import {
  authenticateWithFirestore,
  verifyUserWithFirestore,
  getUsersFromFirestore,
  getUsersWithPasswordsFromFirestore,
  getDepartmentsFromFirestore,
  getLocationsFromFirestore,
  getAttendanceFromFirestore,
  getSettingsFromFirestore,
  saveUserToFirestore,
  deleteUserFromFirestore,
  resetUserPasswordInFirestore,
  batchImportUsersToFirestore,
  saveDepartmentToFirestore,
  deleteDepartmentFromFirestore,
  saveLocationToFirestore,
  deleteLocationFromFirestore,
  updateAttendanceInFirestore,
  deleteAttendanceFromFirestore,
  cleanDemoAttendanceInFirestore,
  updateSettingsInFirestore,
  ensureFirestoreSafePhoto,
  saveAttendanceRecordToFirestore,
  createAttendanceInFirestore,
  syncAttendanceBatchToFirestore,
  getSyncMetaFromFirestore,
} from './firebase';

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

// Local cache helpers (resilient against 5MB QuotaExceededError on iOS Safari / Android WebView)
function setCache(key: string, data: any) {
  try {
    const serialized = JSON.stringify(data);
    try {
      localStorage.setItem(key, serialized);
    } catch {
      // Evict heavy cached attendance photos first so auth/queue keys always persist
      if (key !== STORAGE_KEYS.CACHED_ATTENDANCE) {
        try {
          const existingAtt = localStorage.getItem(STORAGE_KEYS.CACHED_ATTENDANCE);
          if (existingAtt) {
            const parsed = JSON.parse(existingAtt);
            if (Array.isArray(parsed)) {
              const stripped = parsed.slice(0, 15).map((r: any) => ({ ...r, photo: '' }));
              localStorage.setItem(STORAGE_KEYS.CACHED_ATTENDANCE, JSON.stringify(stripped));
            } else {
              localStorage.removeItem(STORAGE_KEYS.CACHED_ATTENDANCE);
            }
          }
          localStorage.setItem(key, serialized);
          return;
        } catch {
          try {
            localStorage.removeItem(STORAGE_KEYS.CACHED_ATTENDANCE);
            localStorage.setItem(key, serialized);
            return;
          } catch {}
        }
      } else if (Array.isArray(data)) {
        // Store fewer / lightweight attendance items when quota is tight
        try {
          const slim = data.slice(0, 12).map((r: any) => ({ ...r, photo: '' }));
          localStorage.setItem(key, JSON.stringify(slim));
          return;
        } catch {}
      }
    }
  } catch (e) {
    console.warn('Cache save warning:', e);
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

class BackendValidationError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function callBackendJson<T>(url: string, init?: RequestInit, defaultErrorMsg = 'ดำเนินการไม่สำเร็จ'): Promise<T> {
  const res = await freshFetch(url, init);
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (res.ok && isJson) {
    return (await res.json()) as T;
  }

  if (isJson && res.status >= 400 && res.status < 500) {
    const err = await res.json().catch(() => ({}));
    throw new BackendValidationError(err.error || defaultErrorMsg, res.status);
  }

  throw new Error(`HTTP ${res.status}`);
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
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: JSON.stringify({ userId }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.valid && data.user) {
          this.setCurrentUser(data.user);
          return data.user;
        } else if (data.valid === false) {
          // Cross-check Firestore before force-logging out (prevents split-brain logout)
          const fbCheck = await verifyUserWithFirestore(userId);
          if (fbCheck.checked && fbCheck.valid && fbCheck.user) {
            this.setCurrentUser(fbCheck.user);
            return fbCheck.user;
          }
          if (fbCheck.checked && !fbCheck.valid) {
            console.warn('Session no longer valid on central server/Firestore, logging out');
            this.logout();
            return null;
          }
        }
      }
    } catch (e) {
      console.warn('Session verification checking Firestore fallback');
      const fbCheck = await verifyUserWithFirestore(userId);
      if (fbCheck.checked && fbCheck.valid && fbCheck.user) {
        this.setCurrentUser(fbCheck.user);
        return fbCheck.user;
      }
      if (fbCheck.checked && !fbCheck.valid) {
        this.logout();
        return null;
      }
    }
    return this.getCurrentUser();
  },

  // Helper to persist successful auth locally
  _completeClientLogin(data: AuthResponse): AuthResponse {
    this.setCurrentUser(data.user);
    setCache(STORAGE_KEYS.TOKEN, data.token);

    const cachedUsers = getCache<User[]>(STORAGE_KEYS.CACHED_USERS) || [];
    const idx = cachedUsers.findIndex((u) => u.id === data.user.id);
    if (idx !== -1) {
      cachedUsers[idx] = data.user;
    } else {
      cachedUsers.push(data.user);
    }
    setCache(STORAGE_KEYS.CACHED_USERS, cachedUsers);
    return data;
  },

  // Auth: Login with remember device option + Cloud Firestore & cross-browser fallback
  async login(username: string, password: string, rememberDevice: boolean = true): Promise<AuthResponse> {
    const normalizeText = (val: string) => {
      const cleaned = String(val || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
      try {
        return cleaned.normalize('NFC');
      } catch {
        return cleaned;
      }
    };
    const cleanIdentifier = normalizeText(username).replace(/^@+/, '');
    const cleanPassword = normalizeText(password);

    if (!cleanIdentifier || !cleanPassword) {
      throw new Error('กรุณากรอก Username และ Password');
    }

    if (rememberDevice) {
      setRememberedUsername(cleanIdentifier);
    }

    let serverAuthRejectedMsg: string | null = null;

    if (isOnline()) {
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 3500) : null;
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
          body: JSON.stringify({ username: cleanIdentifier, password: cleanPassword }),
          signal: controller?.signal,
        }).finally(() => {
          if (timer) clearTimeout(timer);
        });

        const contentType = res.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json');

        if (res.ok && isJson) {
          const data: AuthResponse = await res.json();
          if (data && data.user) {
            return this._completeClientLogin(data);
          }
        }

        if (isJson && (res.status === 400 || res.status === 401 || res.status === 403)) {
          const err = await res.json().catch(() => ({}));
          if (res.status === 403) {
            throw new Error(err.error || 'บัญชีผู้ใช้นี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
          }
          serverAuthRejectedMsg = err.error || 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง';
        }
      } catch (err: any) {
        // Explicit 403 error should stop immediately
        if (err?.message && err.message.includes('ถูกระงับการใช้งาน')) {
          throw err;
        }
        console.warn('Backend /api/auth/login unavailable, switching to Cloud Firestore auth:', err?.message);
      }

      // Direct Cloud Firestore Fallback / Cross-Verification
      try {
        const fbAuth = await authenticateWithFirestore(cleanIdentifier, cleanPassword);
        return this._completeClientLogin(fbAuth);
      } catch (fbErr: any) {
        const msg = String(fbErr?.message || '');
        const isAuthRejection =
          msg.includes('ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง') ||
          msg.includes('ถูกระงับการใช้งาน') ||
          msg.includes('ไม่พบข้อมูลบัญชีผู้ใช้ในฐานข้อมูล Cloud');

        if (isAuthRejection) {
          throw new Error(serverAuthRejectedMsg || msg);
        }
        // If server gave explicit 401 and Firestore had a transport error, surface the explicit 401
        if (serverAuthRejectedMsg) {
          throw new Error(serverAuthRejectedMsg);
        }
        console.warn('Firestore direct auth unavailable, checking local cache:', msg);
      }
    }

    if (serverAuthRejectedMsg) {
      throw new Error(serverAuthRejectedMsg);
    }

    // Offline login fallback: Check if user exists in local cache
    const lowerId = cleanIdentifier.toLowerCase();
    const compactId = cleanIdentifier.replace(/\s+/g, '').toLowerCase();
    const cachedUsers = getCache<User[]>(STORAGE_KEYS.CACHED_USERS) || [];
    const currentCached = this.getCurrentUser();
    const candidatePool = currentCached && !cachedUsers.some((u) => u.id === currentCached.id)
      ? [currentCached, ...cachedUsers]
      : cachedUsers;

    const matched = candidatePool.find((u) => {
      const uName = String(u.username || '').trim().toLowerCase();
      const empCode = String(u.employeeCode || '').trim().toLowerCase();
      const fullCompact = String(u.fullName || '').replace(/\s+/g, '').toLowerCase();
      return (
        uName === lowerId ||
        (empCode !== '' && empCode === lowerId) ||
        (compactId !== '' && fullCompact === compactId)
      );
    });

    if (matched) {
      if (matched.status === 'inactive') {
        throw new Error('บัญชีผู้ใช้นี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
      }
      this.setCurrentUser(matched);
      return {
        user: matched,
        token: `offline_token_${matched.id}`,
      };
    }

    throw new Error(
      isOnline()
        ? 'ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนได้ชั่วคราว กรุณาลองใหม่อีกครั้ง'
        : 'ไม่สามารถเข้าสู่ระบบในโหมดออฟไลน์ได้ (บัญชีนี้ยังไม่เคยล็อกอินบนอุปกรณ์นี้)'
    );
  },

  logout() {
    this.setCurrentUser(null);
  },

  // Users
  async getUsers(): Promise<User[]> {
    if (isOnline()) {
      try {
        const res = await freshFetch('/api/users');
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const users = await res.json();
          if (Array.isArray(users)) {
            setCache(STORAGE_KEYS.CACHED_USERS, users);
            return users;
          }
        }
      } catch (e) {
        console.warn('Network error loading /api/users, checking Firestore');
      }

      const fbUsers = await getUsersFromFirestore();
      if (fbUsers && fbUsers.length > 0) {
        setCache(STORAGE_KEYS.CACHED_USERS, fbUsers);
        return fbUsers;
      }
    }
    return getCache<User[]>(STORAGE_KEYS.CACHED_USERS) || [];
  },

  async createUser(userData: Partial<User> & { password?: string }): Promise<User> {
    let createdUser: User;
    try {
      const data = await callBackendJson<{ user: User }>(
        '/api/users',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userData),
        },
        'เพิ่มผู้ใช้งานไม่สำเร็จ'
      );
      createdUser = data.user;
    } catch (err) {
      if (err instanceof BackendValidationError && err.status !== 404) {
        throw new Error(err.message);
      }
      createdUser = await saveUserToFirestore(userData);
    }

    const cachedUsers = getCache<User[]>(STORAGE_KEYS.CACHED_USERS) || [];
    if (!cachedUsers.some((u) => u.id === createdUser.id)) {
      cachedUsers.push(createdUser);
      setCache(STORAGE_KEYS.CACHED_USERS, cachedUsers);
    }
    notifyLocalMutation('users_updated', createdUser);
    return createdUser;
  },

  async updateUser(id: string, userData: Partial<User> & { password?: string }): Promise<User> {
    let updatedUser: User;
    try {
      const data = await callBackendJson<{ user: User }>(
        `/api/users/${id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userData),
        },
        'แก้ไขข้อมูลผู้ใช้งานไม่สำเร็จ'
      );
      updatedUser = data.user;
    } catch (err) {
      if (err instanceof BackendValidationError && err.status !== 404) {
        throw new Error(err.message);
      }
      updatedUser = await saveUserToFirestore({ ...userData, id });
    }

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
    try {
      await callBackendJson(
        `/api/users/${id}`,
        { method: 'DELETE' },
        'ลบผู้ใช้งานไม่สำเร็จ'
      );
    } catch (err) {
      if (err instanceof BackendValidationError && err.status !== 404) {
        throw new Error(err.message);
      }
      await deleteUserFromFirestore(id);
    }

    const cachedUsers = getCache<User[]>(STORAGE_KEYS.CACHED_USERS) || [];
    setCache(STORAGE_KEYS.CACHED_USERS, cachedUsers.filter((u) => u.id !== id));
    notifyLocalMutation('users_updated', { deletedId: id });
  },

  async batchImportUsers(users: (Partial<User> & { password?: string })[]): Promise<{ importedCount: number; updatedCount: number; message: string; totalUsers: number }> {
    let result: { importedCount: number; updatedCount: number; message: string; totalUsers: number };
    try {
      result = await callBackendJson(
        '/api/users/batch',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ users }),
        },
        'นำเข้าข้อมูลผู้ใช้งานไม่สำเร็จ'
      );
    } catch (err) {
      if (err instanceof BackendValidationError && err.status !== 404) {
        throw new Error(err.message);
      }
      result = await batchImportUsersToFirestore(users);
    }

    notifyLocalMutation('users_updated');
    return result;
  },

  async getUsersWithPasswords(): Promise<(User & { password?: string })[]> {
    if (isOnline()) {
      try {
        const res = await freshFetch('/api/admin/users-with-passwords');
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          return await res.json();
        }
      } catch (e) {
        console.warn('Failed to fetch users with passwords from API, checking Firestore');
      }

      const fbUsers = await getUsersWithPasswordsFromFirestore();
      if (fbUsers && fbUsers.length > 0) {
        return fbUsers;
      }
    }
    return this.getUsers();
  },

  async resetUserPassword(id: string, newPassword: string): Promise<void> {
    try {
      await callBackendJson(
        `/api/users/${id}/reset-password`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newPassword }),
        },
        'รีเซ็ตรหัสผ่านไม่สำเร็จ'
      );
    } catch (err) {
      if (err instanceof BackendValidationError && err.status !== 404) {
        throw new Error(err.message);
      }
      await resetUserPasswordInFirestore(id, newPassword);
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
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const departments = await res.json();
          if (Array.isArray(departments)) {
            setCache(STORAGE_KEYS.CACHED_DEPARTMENTS, departments);
            return departments;
          }
        }
      } catch (e) {
        console.warn('Network error, checking Firestore departments');
      }

      const fbDepts = await getDepartmentsFromFirestore();
      if (fbDepts && fbDepts.length > 0) {
        setCache(STORAGE_KEYS.CACHED_DEPARTMENTS, fbDepts);
        return fbDepts;
      }
    }
    return getCache<Department[]>(STORAGE_KEYS.CACHED_DEPARTMENTS) || [];
  },

  async saveDepartment(department: Partial<Department>): Promise<Department> {
    let savedDept: Department;
    try {
      const data = await callBackendJson<{ department: Department }>(
        '/api/departments',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(department),
        },
        'บันทึกข้อมูลแผนกไม่สำเร็จ'
      );
      savedDept = data.department;
    } catch (err) {
      if (err instanceof BackendValidationError && err.status !== 404) {
        throw new Error(err.message);
      }
      savedDept = await saveDepartmentToFirestore(department);
    }

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
    try {
      await callBackendJson(
        `/api/departments/${id}`,
        { method: 'DELETE' },
        'ลบแผนกไม่สำเร็จ'
      );
    } catch (err) {
      if (err instanceof BackendValidationError && err.status !== 404) {
        throw new Error(err.message);
      }
      await deleteDepartmentFromFirestore(id);
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
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const locations = await res.json();
          if (Array.isArray(locations)) {
            setCache(STORAGE_KEYS.CACHED_LOCATIONS, locations);
            return locations;
          }
        }
      } catch (e) {
        console.warn('Network error, checking Firestore locations');
      }

      const fbLocs = await getLocationsFromFirestore();
      if (fbLocs && fbLocs.length > 0) {
        setCache(STORAGE_KEYS.CACHED_LOCATIONS, fbLocs);
        return fbLocs;
      }
    }
    return getCache<WorkLocation[]>(STORAGE_KEYS.CACHED_LOCATIONS) || [];
  },

  async saveLocation(location: Partial<WorkLocation>): Promise<WorkLocation> {
    let savedLoc: WorkLocation;
    try {
      const data = await callBackendJson<{ location: WorkLocation }>(
        '/api/locations',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(location),
        },
        'บันทึกจุดปฏิบัติงานไม่สำเร็จ'
      );
      savedLoc = data.location;
    } catch (err) {
      if (err instanceof BackendValidationError && err.status !== 404) {
        throw new Error(err.message);
      }
      savedLoc = await saveLocationToFirestore(location);
    }

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
    try {
      await callBackendJson(
        `/api/locations/${id}`,
        { method: 'DELETE' },
        'ลบจุดปฏิบัติงานไม่สำเร็จ'
      );
    } catch (err) {
      if (err instanceof BackendValidationError && err.status !== 404) {
        throw new Error(err.message);
      }
      await deleteLocationFromFirestore(id);
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
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const records: AttendanceRecord[] = await res.json();
          setCache(STORAGE_KEYS.CACHED_ATTENDANCE, records);

          const offlineQueue = getOfflineQueue();
          if (offlineQueue.length > 0) {
            return [...offlineQueue, ...records];
          }
          return records;
        }
      } catch (e) {
        console.warn('Attendance API load error, checking Cloud Firestore');
      }

      const fbRecords = await getAttendanceFromFirestore(params);
      if (fbRecords !== null) {
        setCache(STORAGE_KEYS.CACHED_ATTENDANCE, fbRecords);
        const offlineQueue = getOfflineQueue();
        return offlineQueue.length > 0 ? [...offlineQueue, ...fbRecords] : fbRecords;
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

    const safePhoto = await ensureFirestoreSafePhoto(payload.photo);
    const normalizedPayload = { ...payload, photo: safePhoto };

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

    const prependToCache = (rec: AttendanceRecord) => {
      const existing = getCache<AttendanceRecord[]>(STORAGE_KEYS.CACHED_ATTENDANCE) || [];
      const deduped = existing.filter((r) => r.id !== rec.id);
      setCache(STORAGE_KEYS.CACHED_ATTENDANCE, [rec, ...deduped]);
    };

    if (isOnline()) {
      let validationErrorMsg: string | null = null;

      try {
        const res = await freshFetch('/api/attendance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(normalizedPayload),
        });

        const contentType = res.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json');

        if (res.ok && isJson) {
          const data = await res.json();
          if (data?.record) {
            if (!data.firestoreSynced) {
              try {
                await saveAttendanceRecordToFirestore(data.record);
              } catch (fbMirrorErr) {
                console.warn('Firestore mirror fallback note:', fbMirrorErr);
              }
            }
            prependToCache(data.record);
            notifyLocalMutation('attendance_updated', data.record);
            return {
              record: data.record,
              offline: false,
              message: 'บันทึกเวลาเข้าสู่ระบบ Smart Time Attendance (https://smart-sime14.vercel.app/) สำเร็จทันที',
            };
          }
        } else if (isJson && res.status === 400) {
          const err = await res.json().catch(() => ({}));
          validationErrorMsg = err.error || 'ข้อมูลไม่ครบถ้วน';
        }
      } catch (e) {
        console.warn('Backend /api/attendance unavailable, writing directly to Cloud Firestore');
      }

      if (validationErrorMsg) {
        throw new Error(validationErrorMsg);
      }

      // Direct Cloud Firestore Write (primary path on static Vercel host & fallback when /api/* unavailable)
      try {
        const fbRecord = await createAttendanceInFirestore(normalizedPayload);
        prependToCache(fbRecord);
        notifyLocalMutation('attendance_updated', fbRecord);
        return {
          record: fbRecord,
          offline: false,
          message: 'บันทึกเวลาเข้าสู่ระบบ Cloud Smart Time Attendance (https://smart-sime14.vercel.app/) สำเร็จทันที',
        };
      } catch (fbErr: any) {
        const msg = String(fbErr?.message || '');
        if (msg.includes('ไม่พบผู้ใช้งานนี้ในระบบ')) {
          throw new Error(msg);
        }
        console.warn('Direct Cloud Firestore write failed, storing offline queue:', msg);
      }
    }

    // Save offline ONLY when truly disconnected from both backend & Cloud Firestore
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
      photo: safePhoto,
      latitude: payload.latitude,
      longitude: payload.longitude,
      accuracy: payload.accuracy,
      locationName: payload.locationName,
      workLocationId: payload.workLocationId,
      deviceOs,
      note: payload.note,
      isOfflineRecord: true,
      lineNotificationStatus: 'simulated',
    };

    addToOfflineQueue(tempRecord);
    notifyLocalMutation('attendance_updated', tempRecord);

    return {
      record: tempRecord,
      offline: true,
      message: 'บันทึกเวลาแบบออฟไลน์สำเร็จ (ข้อมูลถูกเก็บในอุปกรณ์ จะซิงค์เข้าสู่ระบบทันทีเมื่อต่อเน็ต)',
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

    let syncedCount = 0;
    let handledViaBackend = false;

    try {
      const res = await freshFetch('/api/attendance/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: queue }),
      });

      const contentType = res.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');

      if (res.ok && isJson) {
        const data = await res.json();
        syncedCount = data.syncedCount ?? queue.length;
        if (!data.firestoreSynced) {
          try {
            await syncAttendanceBatchToFirestore(data.records || queue);
          } catch (fbErr) {
            console.warn('Firestore batch mirror notice:', fbErr);
          }
        }
        handledViaBackend = true;
      } else if (isJson && res.status === 400) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'ซิงค์ข้อมูลไม่สำเร็จ');
      }
    } catch (e: any) {
      if (e?.message && !e.message.includes('HTTP') && !e.message.includes('fetch') && !e.message.includes('Network') && e.message !== 'ซิงค์ข้อมูลไม่สำเร็จ') {
        throw e;
      }
      console.warn('Backend /api/attendance/sync unavailable, syncing directly to Cloud Firestore');
    }

    if (!handledViaBackend) {
      const fbSaved = await syncAttendanceBatchToFirestore(queue);
      syncedCount = fbSaved.length || queue.length;
    }

    // Safely remove only the synced items from the offline queue to prevent losing new entries
    const syncedIds = new Set(queue.map((r) => r.id));
    const currentQueue = getOfflineQueue();
    const remaining = currentQueue.filter((item) => !syncedIds.has(item.id));
    saveOfflineQueue(remaining);

    notifyLocalMutation('attendance_updated');
    return {
      syncedCount,
      message: `ซิงค์ข้อมูลเข้าสู่ฐานข้อมูลกลาง Smart Time สำเร็จ ${syncedCount} รายการแล้ว`,
    };
  },

  async deleteAttendance(id: string): Promise<void> {
    const queue = getOfflineQueue();
    const inQueue = queue.some((r) => r.id === id);

    try {
      await callBackendJson(
        `/api/attendance/${id}`,
        { method: 'DELETE' },
        'ลบรายการไม่สำเร็จ'
      );
    } catch (err) {
      if (err instanceof BackendValidationError && err.status === 404 && inQueue) {
        // Offline-queued record deleted locally before upload
      } else if (err instanceof BackendValidationError && err.status !== 404) {
        throw new Error(err.message);
      } else if (!inQueue) {
        await deleteAttendanceFromFirestore(id);
      }
    }

    // Evict from local cache and queue
    const cached = getCache<AttendanceRecord[]>(STORAGE_KEYS.CACHED_ATTENDANCE) || [];
    setCache(STORAGE_KEYS.CACHED_ATTENDANCE, cached.filter((r) => r.id !== id));
    removeFromOfflineQueue(id);
    notifyLocalMutation('attendance_updated', { deletedId: id });
  },

  async updateAttendance(id: string, updates: Partial<AttendanceRecord>): Promise<AttendanceRecord> {
    const queue = getOfflineQueue();
    const queueIdx = queue.findIndex((r) => r.id === id);
    let updatedRecord: AttendanceRecord | null = null;

    if (queueIdx !== -1 && !isOnline()) {
      updatedRecord = { ...queue[queueIdx], ...updates };
      queue[queueIdx] = updatedRecord;
      saveOfflineQueue(queue);
      notifyLocalMutation('attendance_updated', updatedRecord);
      return updatedRecord;
    }

    try {
      const data = await callBackendJson<{ record: AttendanceRecord }>(
        `/api/attendance/${id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        },
        'แก้ไขข้อมูลการลงเวลาไม่สำเร็จ'
      );
      updatedRecord = data.record;
    } catch (err) {
      if (queueIdx !== -1 && (!(err instanceof BackendValidationError) || err.status === 404)) {
        updatedRecord = { ...queue[queueIdx], ...updates };
        queue[queueIdx] = updatedRecord;
        saveOfflineQueue(queue);
        notifyLocalMutation('attendance_updated', updatedRecord);
        return updatedRecord;
      }
      if (err instanceof BackendValidationError && err.status !== 404) {
        throw new Error(err.message);
      }
      updatedRecord = await updateAttendanceInFirestore(id, updates);
    }

    if (queueIdx !== -1 && updatedRecord) {
      queue[queueIdx] = { ...queue[queueIdx], ...updatedRecord };
      saveOfflineQueue(queue);
    }

    const cached = getCache<AttendanceRecord[]>(STORAGE_KEYS.CACHED_ATTENDANCE) || [];
    const idx = cached.findIndex((r) => r.id === id);
    if (idx !== -1 && updatedRecord) {
      cached[idx] = { ...cached[idx], ...updatedRecord };
      setCache(STORAGE_KEYS.CACHED_ATTENDANCE, cached);
    }

    notifyLocalMutation('attendance_updated', updatedRecord);
    return updatedRecord!;
  },

  async cleanDemoAttendance(): Promise<{ message: string; removedCount: number; currentCount: number }> {
    let result: { message: string; removedCount: number; currentCount: number };
    try {
      result = await callBackendJson(
        '/api/attendance/clean-demo',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        'ลบข้อมูลตัวอย่างไม่สำเร็จ'
      );
    } catch (err) {
      if (err instanceof BackendValidationError && err.status !== 404) {
        throw new Error(err.message);
      }
      result = await cleanDemoAttendanceInFirestore();
    }

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
    return result;
  },

  async backupAttendanceSnapshot(): Promise<{
    message: string;
    backupFile: string;
    backupId?: string;
    firebaseStored?: boolean;
    projectId?: string;
    totalRecords: number;
    timestamp: string;
  }> {
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
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const settings = await res.json();
          setCache(STORAGE_KEYS.CACHED_SETTINGS, settings);
          return settings;
        }
      } catch (e) {
        console.warn('Network error loading settings');
      }

      const fbSettings = await getSettingsFromFirestore();
      if (fbSettings) {
        setCache(STORAGE_KEYS.CACHED_SETTINGS, fbSettings);
        return fbSettings;
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
    let savedSettings: SystemSettings;
    try {
      const data = await callBackendJson<{ settings: SystemSettings }>(
        '/api/settings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings),
        },
        'บันทึกการตั้งค่าไม่สำเร็จ'
      );
      savedSettings = data.settings;
    } catch (err) {
      if (err instanceof BackendValidationError && err.status !== 404) {
        throw new Error(err.message);
      }
      savedSettings = await updateSettingsInFirestore(settings);
    }

    setCache(STORAGE_KEYS.CACHED_SETTINGS, savedSettings);
    notifyLocalMutation('settings_updated', savedSettings);
    return savedSettings;
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

  async createManualBackup(): Promise<{
    message: string;
    backupFile: string;
    backupId?: string;
    firebaseStored?: boolean;
    projectId?: string;
    timestamp: string;
  }> {
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
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        return await res.json();
      }
    } catch {
      // fallback to Cloud Firestore
    }
    return await getSyncMetaFromFirestore();
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
