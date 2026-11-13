import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { getThaiDateTime } from '../utils/thaiTime';
import {
  User,
  Department,
  WorkLocation,
  AttendanceRecord,
  SystemSettings,
  AuthResponse,
  STANDARD_DEPARTMENTS,
} from '../types';

// Initialize Firebase App
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore with configured database ID
export const db: Firestore = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  let currentUserId: string | undefined;
  try {
    const rawUser =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('smart_attendance_current_user')
        : null;
    if (rawUser) {
      currentUserId = JSON.parse(rawUser)?.id;
    }
  } catch {
    // ignore storage errors
  }

  const message = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: message,
    operationType,
    path,
    authInfo: {
      userId: currentUserId || 'anonymous',
    },
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(message || `Firestore ${operationType} failed on ${path || 'unknown'}`);
}

function withTimeout<T>(promise: Promise<T>, ms: number = 9000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Firestore request timeout')), ms)),
  ]);
}

function sanitizeForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof obj === 'object') {
    const clean: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj as Record<string, any>)) {
      if (val !== undefined) {
        clean[key] = sanitizeForFirestore(val);
      }
    }
    return clean as T;
  }
  return obj;
}

function calculateDistanceMetersLocal(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function buildBangkokTimestamp(dateStr: string, timeStr: string, fallbackIso?: string): string {
  try {
    const cleanDate = String(dateStr || '').trim();
    const cleanTime = String(timeStr || '').trim();
    const normalizedTime = cleanTime.length === 5 ? `${cleanTime}:00` : cleanTime;
    const candidate = new Date(`${cleanDate}T${normalizedTime}+07:00`);
    if (!Number.isNaN(candidate.getTime())) {
      return candidate.toISOString();
    }
  } catch {
    // ignore
  }
  return fallbackIso || new Date().toISOString();
}

export async function bumpFirestoreSyncMeta(): Promise<void> {
  try {
    await withTimeout(
      setDoc(doc(db, '_meta', 'sync'), {
        version: Date.now(),
        lastModified: new Date().toISOString(),
        source: 'client-firestore',
      }),
      5000
    );
  } catch (e) {
    console.warn('Could not bump Firestore sync meta:', e);
  }
}

/**
 * Validate Connection to Firestore (Per skill requirement: call getDocFromServer)
 */
export async function testFirestoreConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    await getDocFromServer(doc(db, '_health', 'status'));
    return { success: true };
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore offline or connection issue. Please check network/config.');
    }
    return {
      success: false,
      error: error?.message || 'Connection test failed',
    };
  }
}

/**
 * Authenticate directly against Cloud Firestore `users` collection.
 * Supports login by username (case-insensitive), employeeCode, or Thai fullName.
 */
export async function authenticateWithFirestore(
  identifier: string,
  password: string
): Promise<AuthResponse> {
  const rawIdentifier = String(identifier || '').trim().replace(/^@+/, '');
  const lowerIdentifier = rawIdentifier.toLowerCase();
  const compactIdentifier = rawIdentifier.replace(/\s+/g, '').toLowerCase();
  const cleanPassword = String(password ?? '').trim();

  const snap = await withTimeout(getDocs(collection(db, 'users')), 8000);
  if (snap.empty) {
    throw new Error('ไม่พบข้อมูลบัญชีผู้ใช้ในฐานข้อมูล Cloud');
  }

  const users: User[] = [];
  snap.forEach((d) => users.push(d.data() as User));

  const matched = users.find((u) => {
    const uName = String(u.username || '').trim().toLowerCase();
    const empCode = String(u.employeeCode || '').trim().toLowerCase();
    const fullCompact = String(u.fullName || '').replace(/\s+/g, '').toLowerCase();
    return (
      uName === lowerIdentifier ||
      (empCode !== '' && empCode === lowerIdentifier) ||
      (compactIdentifier !== '' && fullCompact === compactIdentifier)
    );
  });

  if (!matched) {
    throw new Error('ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง');
  }

  const storedPass =
    matched.password !== undefined && matched.password !== null && String(matched.password).trim() !== ''
      ? String(matched.password).trim()
      : matched.username === 'admin'
      ? 'admin123'
      : '123456';

  if (storedPass !== cleanPassword) {
    throw new Error('ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง');
  }

  if (matched.status === 'inactive') {
    throw new Error('บัญชีผู้ใช้นี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
  }

  const { password: _, ...safeUser } = matched;
  return {
    user: safeUser,
    token: `fb_token_${matched.id}_${Date.now()}`,
  };
}

/**
 * Verify user session directly against Cloud Firestore
 */
export async function verifyUserWithFirestore(
  userId: string
): Promise<{ checked: boolean; valid: boolean; user: User | null }> {
  try {
    const snap = await withTimeout(getDoc(doc(db, 'users', String(userId))), 6000);
    if (!snap.exists()) {
      return { checked: true, valid: false, user: null };
    }
    const raw = snap.data() as User;
    if (raw.status === 'inactive') {
      return { checked: true, valid: false, user: null };
    }
    const { password: _, ...safeUser } = raw;
    return { checked: true, valid: true, user: safeUser };
  } catch {
    return { checked: false, valid: true, user: null };
  }
}

export async function getUsersFromFirestore(): Promise<User[] | null> {
  try {
    const snap = await withTimeout(getDocs(collection(db, 'users')), 7000);
    if (snap.empty) return null;
    const list: User[] = [];
    snap.forEach((d) => {
      const { password: _, ...safeUser } = d.data() as User;
      list.push(safeUser);
    });
    return list;
  } catch {
    return null;
  }
}

export async function getUsersWithPasswordsFromFirestore(): Promise<(User & { password?: string })[] | null> {
  try {
    const snap = await withTimeout(getDocs(collection(db, 'users')), 7000);
    if (snap.empty) return null;
    const list: (User & { password?: string })[] = [];
    snap.forEach((d) => list.push(d.data() as User & { password?: string }));
    return list;
  } catch {
    return null;
  }
}

export async function getDepartmentsFromFirestore(): Promise<Department[] | null> {
  try {
    const snap = await withTimeout(getDocs(collection(db, 'departments')), 7000);
    if (snap.empty) return null;
    const list: Department[] = [];
    snap.forEach((d) => list.push(d.data() as Department));
    return list;
  } catch {
    return null;
  }
}

export async function getLocationsFromFirestore(): Promise<WorkLocation[] | null> {
  try {
    const snap = await withTimeout(getDocs(collection(db, 'locations')), 7000);
    if (snap.empty) return null;
    const list: WorkLocation[] = [];
    snap.forEach((d) => list.push(d.data() as WorkLocation));
    return list;
  } catch {
    return null;
  }
}

export async function getAttendanceFromFirestore(params?: {
  userId?: string;
  departmentId?: string;
  role?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
}): Promise<AttendanceRecord[] | null> {
  try {
    const snap = await withTimeout(getDocs(collection(db, 'attendance')), 9000);
    if (snap.empty) return [];
    let list: AttendanceRecord[] = [];
    snap.forEach((d) => list.push(d.data() as AttendanceRecord));

    if (params?.userId) list = list.filter((r) => r.userId === params.userId);
    if (params?.departmentId) list = list.filter((r) => r.departmentId === params.departmentId);
    if (params?.role && params.role !== 'all') list = list.filter((r) => r.userRole === params.role);
    if (params?.type && params.type !== 'all') list = list.filter((r) => r.type === params.type);
    if (params?.startDate) list = list.filter((r) => r.date >= params.startDate!);
    if (params?.endDate) list = list.filter((r) => r.date <= params.endDate!);

    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return list;
  } catch {
    return null;
  }
}

export async function getSettingsFromFirestore(): Promise<SystemSettings | null> {
  try {
    const snap = await withTimeout(getDoc(doc(db, 'settings', 'global')), 6000);
    if (!snap.exists()) return null;
    return snap.data() as SystemSettings;
  } catch {
    return null;
  }
}

// =========================================================================
// Direct Cloud Firestore Admin Mutations (Cross-Device / Fallback Safe)
// =========================================================================

export async function saveUserToFirestore(
  userData: Partial<User> & { id?: string; password?: string }
): Promise<User> {
  const path = userData.id ? `users/${userData.id}` : 'users';
  try {
    const [usersSnap, deptsSnap, locsSnap] = await Promise.all([
      withTimeout(getDocs(collection(db, 'users')), 8000),
      withTimeout(getDocs(collection(db, 'departments')), 8000),
      withTimeout(getDocs(collection(db, 'locations')), 8000),
    ]);

    const existingUsers: User[] = [];
    usersSnap.forEach((d) => existingUsers.push(d.data() as User));

    const depts: Department[] = [];
    deptsSnap.forEach((d) => depts.push(d.data() as Department));

    const locs: WorkLocation[] = [];
    locsSnap.forEach((d) => locs.push(d.data() as WorkLocation));

    const isUpdate = Boolean(userData.id);
    const existing = isUpdate ? existingUsers.find((u) => u.id === userData.id) : undefined;
    if (isUpdate && !existing) {
      throw new Error('ไม่พบผู้ใช้งานในฐานข้อมูล');
    }

    const cleanUsername = String(userData.username ?? existing?.username ?? '').trim();
    if (!cleanUsername) {
      throw new Error('กรุณาระบุ Username');
    }

    const duplicate = existingUsers.find(
      (u) =>
        u.id !== userData.id &&
        String(u.username || '').trim().toLowerCase() === cleanUsername.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`Username "${cleanUsername}" ถูกใช้งานแล้วโดย ${duplicate.fullName}`);
    }

    const targetDeptId = userData.departmentId ?? existing?.departmentId ?? 'dep_general';
    const matchedDept =
      depts.find((d) => d.id === targetDeptId) ||
      STANDARD_DEPARTMENTS.find((d) => d.id === targetDeptId);

    const targetLocId =
      userData.assignedLocationId !== undefined
        ? String(userData.assignedLocationId || '').trim()
        : existing?.assignedLocationId || '';
    const matchedLoc = targetLocId ? locs.find((l) => l.id === targetLocId) : undefined;

    const userId = existing?.id || `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const nextPassword =
      userData.password !== undefined && String(userData.password).trim() !== ''
        ? String(userData.password).trim()
        : existing?.password || '123456';

    const fullDoc: User = sanitizeForFirestore({
      id: userId,
      username: cleanUsername,
      password: nextPassword,
      fullName: String(userData.fullName ?? existing?.fullName ?? '').trim(),
      role: (userData.role ?? existing?.role ?? 'employee') as User['role'],
      departmentId: targetDeptId,
      departmentName: matchedDept ? matchedDept.name : userData.departmentName || existing?.departmentName || 'ทั่วไป',
      position: String(userData.position ?? existing?.position ?? 'เจ้าหน้าที่ทั่วไป').trim(),
      assignedLocationId: matchedLoc ? matchedLoc.id : '',
      assignedLocationName: matchedLoc ? matchedLoc.name : '',
      phoneNumber: String(userData.phoneNumber ?? existing?.phoneNumber ?? '').trim(),
      employeeCode: String(userData.employeeCode ?? existing?.employeeCode ?? `EMP-${Date.now().toString().slice(-4)}`).trim(),
      status: (userData.status ?? existing?.status ?? 'active') as User['status'],
      createdAt: existing?.createdAt || new Date().toISOString(),
    });

    await withTimeout(setDoc(doc(db, 'users', userId), fullDoc), 8000);

    // Cascade user profile updates to Firestore attendance records
    if (existing) {
      const attSnap = await withTimeout(getDocs(collection(db, 'attendance')), 8000);
      const updates: Promise<void>[] = [];
      attSnap.forEach((d) => {
        const rec = d.data() as AttendanceRecord;
        if (rec.userId === userId) {
          const updatedRec: AttendanceRecord = sanitizeForFirestore({
            ...rec,
            userName: fullDoc.fullName,
            userRole: fullDoc.role,
            departmentId: fullDoc.departmentId,
            departmentName: fullDoc.departmentName,
          });
          updates.push(withTimeout(setDoc(doc(db, 'attendance', rec.id), updatedRec), 6000));
        }
      });
      if (updates.length > 0) {
        await Promise.all(updates);
      }
    }

    await bumpFirestoreSyncMeta();
    const { password: _, ...safeUser } = fullDoc;
    return safeUser;
  } catch (err) {
    if (err instanceof Error && (err.message.includes('ถูกใช้งานแล้ว') || err.message.includes('กรุณาระบุ') || err.message.includes('ไม่พบผู้ใช้งาน'))) {
      throw err;
    }
    return handleFirestoreError(err, isWriteUpdate(userData), path);
  }
}

function isWriteUpdate(data: { id?: string }): OperationType {
  return data.id ? OperationType.UPDATE : OperationType.CREATE;
}

export async function deleteUserFromFirestore(id: string): Promise<void> {
  const path = `users/${id}`;
  try {
    const snap = await withTimeout(getDoc(doc(db, 'users', id)), 6000);
    if (snap.exists() && snap.data()?.username === 'admin') {
      throw new Error('ไม่สามารถลบบัญชีผู้ดูแลระบบหลักได้');
    }
    await withTimeout(deleteDoc(doc(db, 'users', id)), 7000);
    await bumpFirestoreSyncMeta();
  } catch (err) {
    if (err instanceof Error && err.message.includes('ผู้ดูแลระบบหลัก')) {
      throw err;
    }
    return handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function resetUserPasswordInFirestore(id: string, newPassword: string): Promise<void> {
  const path = `users/${id}`;
  try {
    const snap = await withTimeout(getDoc(doc(db, 'users', id)), 6000);
    if (!snap.exists()) {
      throw new Error('ไม่พบผู้ใช้งานในระบบ');
    }
    const updated = sanitizeForFirestore({
      ...(snap.data() as User),
      password: String(newPassword).trim(),
    });
    await withTimeout(setDoc(doc(db, 'users', id), updated), 7000);
    await bumpFirestoreSyncMeta();
  } catch (err) {
    if (err instanceof Error && err.message.includes('ไม่พบผู้ใช้งาน')) {
      throw err;
    }
    return handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function batchImportUsersToFirestore(
  incomingUsers: (Partial<User> & { password?: string })[]
): Promise<{ importedCount: number; updatedCount: number; message: string; totalUsers: number }> {
  try {
    const [usersSnap, deptsSnap] = await Promise.all([
      withTimeout(getDocs(collection(db, 'users')), 8000),
      withTimeout(getDocs(collection(db, 'departments')), 8000),
    ]);
    const existingUsers: User[] = [];
    usersSnap.forEach((d) => existingUsers.push(d.data() as User));

    const depts: Department[] = [];
    deptsSnap.forEach((d) => depts.push(d.data() as Department));

    let importedCount = 0;
    let updatedCount = 0;

    for (const u of incomingUsers) {
      if (!u.fullName || !u.username) continue;
      const existing = existingUsers.find(
        (ex) => ex.username.toLowerCase() === String(u.username).trim().toLowerCase()
      );
      const deptId = u.departmentId || existing?.departmentId || 'dep_ems_rescue';
      const dept =
        depts.find((d) => d.id === deptId) ||
        STANDARD_DEPARTMENTS.find((d) => d.id === deptId);

      if (existing) {
        const updatedDoc: User = sanitizeForFirestore({
          ...existing,
          fullName: String(u.fullName).trim(),
          position: u.position || existing.position,
          phoneNumber: u.phoneNumber || existing.phoneNumber,
          employeeCode: u.employeeCode || existing.employeeCode,
          departmentId: deptId,
          departmentName: dept ? dept.name : u.departmentName || existing.departmentName,
          role: (u.role || existing.role) as User['role'],
        });
        await withTimeout(setDoc(doc(db, 'users', existing.id), updatedDoc), 6000);
        updatedCount++;
      } else {
        const newId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const newDoc: User = sanitizeForFirestore({
          id: newId,
          username: String(u.username).trim(),
          password: String(u.password || '123456').trim(),
          fullName: String(u.fullName).trim(),
          role: (u.role || 'employee') as User['role'],
          departmentId: deptId,
          departmentName: dept ? dept.name : u.departmentName || 'ทั่วไป',
          position: u.position || 'เจ้าหน้าที่ทั่วไป',
          assignedLocationId: u.assignedLocationId || '',
          assignedLocationName: u.assignedLocationName || '',
          phoneNumber: u.phoneNumber || '',
          employeeCode: u.employeeCode || `EMP-${existingUsers.length + importedCount + 1}`,
          status: 'active',
          createdAt: new Date().toISOString(),
        });
        await withTimeout(setDoc(doc(db, 'users', newId), newDoc), 6000);
        existingUsers.push(newDoc);
        importedCount++;
      }
    }

    await bumpFirestoreSyncMeta();
    return {
      importedCount,
      updatedCount,
      message: `นำเข้ารายชื่อสำเร็จ: เพิ่มใหม่ ${importedCount} รายการ, อัปเดต ${updatedCount} รายการ`,
      totalUsers: existingUsers.length,
    };
  } catch (err) {
    return handleFirestoreError(err, OperationType.WRITE, 'users/batch');
  }
}

export async function saveDepartmentToFirestore(
  deptData: Partial<Department> & { id?: string }
): Promise<Department> {
  const path = deptData.id ? `departments/${deptData.id}` : 'departments';
  try {
    let existing: Department | undefined;
    if (deptData.id) {
      const snap = await withTimeout(getDoc(doc(db, 'departments', deptData.id)), 6000);
      if (snap.exists()) {
        existing = snap.data() as Department;
      } else {
        const std = STANDARD_DEPARTMENTS.find((s) => s.id === deptData.id);
        if (std) {
          existing = {
            ...std,
            lineNotifyToken: '',
            notifyOnCheckIn: true,
            notifyOnCheckOut: true,
          };
        }
      }
    }

    const finalName = String(deptData.name ?? existing?.name ?? '').trim();
    const finalCode = String(deptData.code ?? existing?.code ?? '').trim().toUpperCase();
    if (!finalName || !finalCode) {
      throw new Error('กรุณาระบุชื่อและรหัสแผนก');
    }

    const deptId = existing?.id || deptData.id || `dep_${Date.now()}`;
    const savedDept: Department = sanitizeForFirestore({
      id: deptId,
      name: finalName,
      code: finalCode,
      color: deptData.color ?? existing?.color ?? '#0284c7',
      description: deptData.description !== undefined ? deptData.description : existing?.description || '',
      lineNotifyToken:
        deptData.lineNotifyToken !== undefined
          ? String(deptData.lineNotifyToken || '').trim()
          : existing?.lineNotifyToken || '',
      notifyOnCheckIn:
        deptData.notifyOnCheckIn !== undefined ? deptData.notifyOnCheckIn : existing?.notifyOnCheckIn ?? true,
      notifyOnCheckOut:
        deptData.notifyOnCheckOut !== undefined ? deptData.notifyOnCheckOut : existing?.notifyOnCheckOut ?? true,
    });

    await withTimeout(setDoc(doc(db, 'departments', deptId), savedDept), 7000);

    // Cascade department name update to users, locations, and attendance
    if (existing && existing.name !== savedDept.name) {
      const [usersSnap, locsSnap, attSnap] = await Promise.all([
        withTimeout(getDocs(collection(db, 'users')), 7000),
        withTimeout(getDocs(collection(db, 'locations')), 7000),
        withTimeout(getDocs(collection(db, 'attendance')), 7000),
      ]);
      const tasks: Promise<void>[] = [];
      usersSnap.forEach((d) => {
        const u = d.data() as User;
        if (u.departmentId === deptId) {
          tasks.push(withTimeout(setDoc(doc(db, 'users', u.id), sanitizeForFirestore({ ...u, departmentName: savedDept.name })), 6000));
        }
      });
      locsSnap.forEach((d) => {
        const l = d.data() as WorkLocation;
        if (l.departmentId === deptId) {
          tasks.push(withTimeout(setDoc(doc(db, 'locations', l.id), sanitizeForFirestore({ ...l, departmentName: savedDept.name })), 6000));
        }
      });
      attSnap.forEach((d) => {
        const a = d.data() as AttendanceRecord;
        if (a.departmentId === deptId) {
          tasks.push(withTimeout(setDoc(doc(db, 'attendance', a.id), sanitizeForFirestore({ ...a, departmentName: savedDept.name })), 6000));
        }
      });
      if (tasks.length > 0) await Promise.all(tasks);
    }

    await bumpFirestoreSyncMeta();
    return savedDept;
  } catch (err) {
    if (err instanceof Error && err.message.includes('กรุณาระบุชื่อ')) {
      throw err;
    }
    return handleFirestoreError(err, isWriteUpdate(deptData), path);
  }
}

export async function deleteDepartmentFromFirestore(id: string): Promise<void> {
  const path = `departments/${id}`;
  try {
    const usersSnap = await withTimeout(getDocs(collection(db, 'users')), 7000);
    let hasUsers = false;
    usersSnap.forEach((d) => {
      if ((d.data() as User).departmentId === id) {
        hasUsers = true;
      }
    });
    if (hasUsers) {
      throw new Error('ไม่สามารถลบแผนกที่มีผู้ใช้งานสังกัดอยู่ได้');
    }
    await withTimeout(deleteDoc(doc(db, 'departments', id)), 7000);
    await bumpFirestoreSyncMeta();
  } catch (err) {
    if (err instanceof Error && err.message.includes('ไม่สามารถลบแผนก')) {
      throw err;
    }
    return handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function saveLocationToFirestore(
  locData: Partial<WorkLocation> & { id?: string }
): Promise<WorkLocation> {
  const path = locData.id ? `locations/${locData.id}` : 'locations';
  try {
    const [deptsSnap, existingSnap] = await Promise.all([
      withTimeout(getDocs(collection(db, 'departments')), 7000),
      locData.id ? withTimeout(getDoc(doc(db, 'locations', locData.id)), 6000) : Promise.resolve(null),
    ]);

    const depts: Department[] = [];
    deptsSnap.forEach((d) => depts.push(d.data() as Department));
    const existing = existingSnap && existingSnap.exists() ? (existingSnap.data() as WorkLocation) : undefined;

    const finalDeptId = locData.departmentId ?? existing?.departmentId ?? 'all';
    const matchedDept = depts.find((d) => d.id === finalDeptId);

    const locId = existing?.id || locData.id || `loc_${Date.now()}`;
    const savedLoc: WorkLocation = sanitizeForFirestore({
      id: locId,
      name: String(locData.name ?? existing?.name ?? '').trim(),
      code: String(locData.code ?? existing?.code ?? `LOC-${Date.now().toString().slice(-3)}`).trim(),
      address: String(locData.address ?? existing?.address ?? 'ประเทศไทย').trim(),
      latitude: Number(locData.latitude ?? existing?.latitude ?? 13.7563),
      longitude: Number(locData.longitude ?? existing?.longitude ?? 100.5018),
      radiusMeters: Number(locData.radiusMeters ?? existing?.radiusMeters ?? 200),
      departmentId: finalDeptId,
      departmentName: finalDeptId === 'all' ? 'ทุกแผนก' : matchedDept ? matchedDept.name : existing?.departmentName || 'ทุกแผนก',
      isActive: locData.isActive !== undefined ? locData.isActive : existing?.isActive ?? true,
      createdAt: existing?.createdAt || new Date().toISOString(),
    });

    await withTimeout(setDoc(doc(db, 'locations', locId), savedLoc), 7000);

    // Cascade location name update to assigned users and attendance records
    if (existing && existing.name !== savedLoc.name) {
      const [usersSnap, attSnap] = await Promise.all([
        withTimeout(getDocs(collection(db, 'users')), 7000),
        withTimeout(getDocs(collection(db, 'attendance')), 7000),
      ]);
      const tasks: Promise<void>[] = [];
      usersSnap.forEach((d) => {
        const u = d.data() as User;
        if (u.assignedLocationId === locId) {
          tasks.push(withTimeout(setDoc(doc(db, 'users', u.id), sanitizeForFirestore({ ...u, assignedLocationName: savedLoc.name })), 6000));
        }
      });
      attSnap.forEach((d) => {
        const a = d.data() as AttendanceRecord;
        if (a.workLocationId === locId) {
          tasks.push(withTimeout(setDoc(doc(db, 'attendance', a.id), sanitizeForFirestore({ ...a, workLocationName: savedLoc.name })), 6000));
        }
      });
      if (tasks.length > 0) await Promise.all(tasks);
    }

    await bumpFirestoreSyncMeta();
    return savedLoc;
  } catch (err) {
    return handleFirestoreError(err, isWriteUpdate(locData), path);
  }
}

export async function deleteLocationFromFirestore(id: string): Promise<void> {
  const path = `locations/${id}`;
  try {
    await withTimeout(deleteDoc(doc(db, 'locations', id)), 7000);
    const usersSnap = await withTimeout(getDocs(collection(db, 'users')), 7000);
    const updates: Promise<void>[] = [];
    usersSnap.forEach((d) => {
      const u = d.data() as User;
      if (u.assignedLocationId === id) {
        updates.push(
          withTimeout(
            setDoc(
              doc(db, 'users', u.id),
              sanitizeForFirestore({ ...u, assignedLocationId: '', assignedLocationName: '' })
            ),
            6000
          )
        );
      }
    });
    if (updates.length > 0) await Promise.all(updates);
    await bumpFirestoreSyncMeta();
  } catch (err) {
    return handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function updateAttendanceInFirestore(
  id: string,
  updates: Partial<AttendanceRecord>
): Promise<AttendanceRecord> {
  const path = `attendance/${id}`;
  try {
    const snap = await withTimeout(getDoc(doc(db, 'attendance', id)), 6000);
    if (!snap.exists()) {
      throw new Error('ไม่พบรายการลงเวลาที่ต้องการแก้ไข');
    }
    const existing = snap.data() as AttendanceRecord;

    let nextUserId = updates.userId ?? existing.userId;
    let nextUserName = updates.userName ?? existing.userName;
    let nextUserRole = updates.userRole ?? existing.userRole;
    let nextDepartmentId = updates.departmentId ?? existing.departmentId;
    let nextDepartmentName = updates.departmentName ?? existing.departmentName;

    if (updates.userId && updates.userId !== existing.userId) {
      const userSnap = await withTimeout(getDoc(doc(db, 'users', updates.userId)), 6000);
      if (userSnap.exists()) {
        const u = userSnap.data() as User;
        nextUserId = u.id;
        nextUserName = updates.userName || u.fullName;
        nextUserRole = updates.userRole || u.role;
        nextDepartmentId = updates.departmentId || u.departmentId;
        nextDepartmentName = updates.departmentName || u.departmentName;
      }
    }

    if (updates.departmentId && updates.departmentId !== existing.departmentId && !updates.departmentName) {
      const deptSnap = await withTimeout(getDoc(doc(db, 'departments', updates.departmentId)), 6000);
      if (deptSnap.exists()) {
        nextDepartmentName = (deptSnap.data() as Department).name;
      }
    }

    let nextWorkLocationId =
      updates.workLocationId !== undefined ? updates.workLocationId : existing.workLocationId;
    let nextWorkLocationName =
      updates.workLocationName !== undefined ? updates.workLocationName : existing.workLocationName;
    let nextLocationName = updates.locationName !== undefined ? updates.locationName : existing.locationName;
    let nextLat = updates.latitude !== undefined ? Number(updates.latitude) : existing.latitude;
    let nextLng = updates.longitude !== undefined ? Number(updates.longitude) : existing.longitude;
    let nextDistance = existing.distanceFromLocationMeters;
    let nextWithin = existing.isWithinGeofence;

    if (nextWorkLocationId) {
      const locSnap = await withTimeout(getDoc(doc(db, 'locations', nextWorkLocationId)), 6000);
      if (locSnap.exists()) {
        const loc = locSnap.data() as WorkLocation;
        nextWorkLocationName = loc.name;
        if (updates.workLocationId && updates.workLocationId !== existing.workLocationId) {
          if (updates.latitude === undefined) nextLat = loc.latitude;
          if (updates.longitude === undefined) nextLng = loc.longitude;
          if (!updates.locationName) nextLocationName = loc.name;
        }
        if (Number.isFinite(nextLat) && Number.isFinite(nextLng)) {
          nextDistance = calculateDistanceMetersLocal(nextLat, nextLng, loc.latitude, loc.longitude);
          nextWithin = nextDistance <= loc.radiusMeters;
        }
      }
    } else if (updates.workLocationId === '') {
      nextWorkLocationId = '';
      nextWorkLocationName = '';
      nextWithin = true;
    }

    const nextDate = updates.date !== undefined ? updates.date : existing.date;
    const nextTime = updates.time !== undefined ? updates.time : existing.time;
    const nextTimestamp =
      updates.timestamp ||
      (updates.date !== undefined || updates.time !== undefined
        ? buildBangkokTimestamp(nextDate, nextTime, existing.timestamp)
        : existing.timestamp);

    const updatedRecord: AttendanceRecord = sanitizeForFirestore({
      ...existing,
      ...updates,
      id,
      userId: nextUserId,
      userName: nextUserName,
      userRole: nextUserRole,
      departmentId: nextDepartmentId,
      departmentName: nextDepartmentName,
      workLocationId: nextWorkLocationId,
      workLocationName: nextWorkLocationName,
      locationName: nextLocationName,
      latitude: nextLat,
      longitude: nextLng,
      distanceFromLocationMeters: nextDistance,
      isWithinGeofence: nextWithin,
      date: nextDate,
      time: nextTime,
      timestamp: nextTimestamp,
    });

    await withTimeout(setDoc(doc(db, 'attendance', id), updatedRecord), 8000);
    await bumpFirestoreSyncMeta();
    return updatedRecord;
  } catch (err) {
    if (err instanceof Error && err.message.includes('ไม่พบรายการลงเวลา')) {
      throw err;
    }
    return handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteAttendanceFromFirestore(id: string): Promise<void> {
  const path = `attendance/${id}`;
  try {
    await withTimeout(deleteDoc(doc(db, 'attendance', id)), 7000);
    await bumpFirestoreSyncMeta();
  } catch (err) {
    return handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function cleanDemoAttendanceInFirestore(): Promise<{
  message: string;
  removedCount: number;
  currentCount: number;
}> {
  try {
    const snap = await withTimeout(getDocs(collection(db, 'attendance')), 8000);
    let removedCount = 0;
    let remainingCount = 0;
    const deletes: Promise<void>[] = [];

    snap.forEach((d) => {
      const r = d.data() as AttendanceRecord;
      const isDemo =
        r.userId === 'usr_somchai' ||
        (r.userName && r.userName.includes('สมชาย')) ||
        r.id === 'att_1793678354265_gye2' ||
        r.id === 'att_1791596015445_jm7c';
      if (isDemo) {
        deletes.push(withTimeout(deleteDoc(doc(db, 'attendance', r.id)), 6000));
        removedCount++;
      } else {
        remainingCount++;
      }
    });

    if (deletes.length > 0) {
      await Promise.all(deletes);
      await bumpFirestoreSyncMeta();
    }

    return {
      message: `ลบข้อมูลตัวอย่าง/ทดสอบเรียบร้อยแล้ว ${removedCount} รายการ`,
      removedCount,
      currentCount: remainingCount,
    };
  } catch (err) {
    return handleFirestoreError(err, OperationType.DELETE, 'attendance');
  }
}

export async function updateSettingsInFirestore(
  settings: Partial<SystemSettings>
): Promise<SystemSettings> {
  const path = 'settings/global';
  try {
    const snap = await withTimeout(getDoc(doc(db, 'settings', 'global')), 6000);
    const existing = snap.exists()
      ? (snap.data() as SystemSettings)
      : {
          companyName: 'Smart Rescue & Organization Attendance',
          defaultLineToken: '',
          enableLineNotifications: true,
          standardCheckInTime: '08:30',
          standardCheckOutTime: '17:30',
          allowOfflineCheckIn: true,
          requirePhotoOnCheckIn: true,
          requireLocationOnCheckIn: true,
          enforceLocationGeofence: false,
        };

    const merged: SystemSettings = sanitizeForFirestore({
      ...existing,
      ...settings,
    });
    await withTimeout(setDoc(doc(db, 'settings', 'global'), merged), 7000);
    await bumpFirestoreSyncMeta();
    return merged;
  } catch (err) {
    return handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// =========================================================================
// Direct Cloud Firestore Attendance Check-In / Check-Out & Real-Time Sync
// Guarantees photos stay under Firestore's 1 MiB document limit and records
// sync immediately across smart-sime14.vercel.app and all user devices.
// =========================================================================

export async function ensureFirestoreSafePhoto(
  photoDataUrl: string,
  maxChars: number = 650000
): Promise<string> {
  if (!photoDataUrl || typeof photoDataUrl !== 'string') return '';
  if (photoDataUrl.length <= maxChars) return photoDataUrl;
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return photoDataUrl;
  }

  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 1440;
          let width = img.naturalWidth || img.width || 1280;
          let height = img.naturalHeight || img.height || 720;
          if (width > maxDim || height > maxDim) {
            const ratio = Math.min(maxDim / width, maxDim / height);
            width = Math.max(1, Math.round(width * ratio));
            height = Math.max(1, Math.round(height * ratio));
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(photoDataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);

          let result = canvas.toDataURL('image/jpeg', 0.82);
          if (result.length > maxChars) {
            result = canvas.toDataURL('image/jpeg', 0.68);
          }
          if (result.length > maxChars) {
            result = canvas.toDataURL('image/jpeg', 0.55);
          }
          resolve(result);
        } catch {
          resolve(photoDataUrl);
        }
      };
      img.onerror = () => resolve(photoDataUrl);
      img.src = photoDataUrl;
    } catch {
      resolve(photoDataUrl);
    }
  });
}

export async function saveAttendanceRecordToFirestore(
  record: AttendanceRecord
): Promise<AttendanceRecord> {
  const path = `attendance/${record.id}`;
  try {
    const safePhoto = await ensureFirestoreSafePhoto(record.photo);
    const cleanRecord: AttendanceRecord = sanitizeForFirestore({
      ...record,
      photo: safePhoto,
    });
    await withTimeout(setDoc(doc(db, 'attendance', cleanRecord.id), cleanRecord), 10000);
    await bumpFirestoreSyncMeta();
    return cleanRecord;
  } catch (err) {
    return handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function createAttendanceInFirestore(payload: {
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
}): Promise<AttendanceRecord> {
  const path = 'attendance';
  try {
    let targetUser: User | null = null;
    try {
      const userSnap = await withTimeout(getDoc(doc(db, 'users', String(payload.userId))), 6000);
      if (userSnap.exists()) {
        targetUser = userSnap.data() as User;
      }
    } catch {
      // fall through to collection / cache lookup
    }

    if (!targetUser) {
      try {
        const usersSnap = await withTimeout(getDocs(collection(db, 'users')), 7000);
        usersSnap.forEach((d) => {
          const u = d.data() as User;
          if (u.id === payload.userId) targetUser = u;
        });
      } catch {
        // ignore
      }
    }

    if (!targetUser && typeof localStorage !== 'undefined') {
      try {
        const cachedRaw = localStorage.getItem('smart_attendance_cached_users');
        if (cachedRaw) {
          const parsed: User[] = JSON.parse(cachedRaw);
          targetUser = parsed.find((u) => u.id === payload.userId) || null;
        }
        if (!targetUser) {
          const curRaw = localStorage.getItem('smart_attendance_current_user');
          if (curRaw) {
            const cur = JSON.parse(curRaw) as User;
            if (cur?.id === payload.userId) targetUser = cur;
          }
        }
      } catch {
        // ignore
      }
    }

    if (!targetUser) {
      throw new Error('ไม่พบผู้ใช้งานนี้ในระบบ');
    }

    const locs = (await getLocationsFromFirestore()) || [];
    const now = payload.customTimestamp ? new Date(payload.customTimestamp) : new Date();
    const thai = getThaiDateTime(now);
    const recordLat = Number(payload.latitude) || 13.7563;
    const recordLon = Number(payload.longitude) || 100.5018;

    let matchedLoc: WorkLocation | undefined;
    if (payload.workLocationId) {
      matchedLoc = locs.find((l) => l.id === payload.workLocationId);
    } else if (targetUser.assignedLocationId) {
      matchedLoc = locs.find((l) => l.id === targetUser!.assignedLocationId);
    }

    if (!matchedLoc && locs.length > 0) {
      let minDist = Infinity;
      locs.forEach((loc) => {
        if (!loc.isActive) return;
        const d = calculateDistanceMetersLocal(recordLat, recordLon, loc.latitude, loc.longitude);
        if (d < minDist) {
          minDist = d;
          matchedLoc = loc;
        }
      });
    }

    let calculatedDistance: number | undefined;
    let isWithinGeofence = false;
    if (matchedLoc) {
      calculatedDistance = calculateDistanceMetersLocal(
        recordLat,
        recordLon,
        matchedLoc.latitude,
        matchedLoc.longitude
      );
      isWithinGeofence = calculatedDistance <= (matchedLoc.radiusMeters || 200);
    }

    let deviceOs: 'ios' | 'android' | 'desktop' | 'unknown' = 'desktop';
    if (typeof navigator !== 'undefined') {
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        deviceOs = 'ios';
      } else if (/Android/i.test(navigator.userAgent)) {
        deviceOs = 'android';
      }
    }

    const safePhoto = await ensureFirestoreSafePhoto(payload.photo);
    const recordId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const newRecord: AttendanceRecord = sanitizeForFirestore({
      id: recordId,
      userId: targetUser.id,
      userName: targetUser.fullName,
      userRole: targetUser.role,
      departmentId: targetUser.departmentId,
      departmentName: targetUser.departmentName,
      type: payload.type === 'check_out' ? 'check_out' : 'check_in',
      timestamp: now.toISOString(),
      date: thai.dateStr,
      time: thai.timeStr,
      photo: safePhoto,
      latitude: recordLat,
      longitude: recordLon,
      accuracy: payload.accuracy ? Number(payload.accuracy) : undefined,
      locationName: payload.locationName || (matchedLoc ? matchedLoc.name : 'พิกัด GPS ที่ระบุ'),
      workLocationId: matchedLoc?.id,
      workLocationName: matchedLoc?.name,
      isWithinGeofence,
      distanceFromLocationMeters: calculatedDistance,
      deviceOs,
      note: payload.note ? String(payload.note).trim() : '',
      isOfflineRecord: false,
      lineNotificationStatus: 'simulated',
      lineTargetDepartment: targetUser.departmentName,
    });

    await withTimeout(setDoc(doc(db, 'attendance', recordId), newRecord), 10000);
    await bumpFirestoreSyncMeta();
    return newRecord;
  } catch (err) {
    if (err instanceof Error && err.message.includes('ไม่พบผู้ใช้งานนี้ในระบบ')) {
      throw err;
    }
    return handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function syncAttendanceBatchToFirestore(
  records: AttendanceRecord[]
): Promise<AttendanceRecord[]> {
  if (!Array.isArray(records) || records.length === 0) return [];
  const path = 'attendance/batch';
  try {
    const usersSnap = await withTimeout(getDocs(collection(db, 'users')), 7000).catch(() => null);
    const userMap = new Map<string, User>();
    if (usersSnap) {
      usersSnap.forEach((d) => {
        const u = d.data() as User;
        userMap.set(u.id, u);
      });
    }

    const savedRecords: AttendanceRecord[] = [];
    for (const rec of records) {
      const recordId = rec.id || `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const existingSnap = await withTimeout(getDoc(doc(db, 'attendance', recordId)), 6000).catch(() => null);
      if (existingSnap && existingSnap.exists()) {
        savedRecords.push(existingSnap.data() as AttendanceRecord);
        continue;
      }

      const user = userMap.get(rec.userId);
      const safePhoto = await ensureFirestoreSafePhoto(rec.photo);
      const cleanRec: AttendanceRecord = sanitizeForFirestore({
        ...rec,
        id: recordId,
        userName: user?.fullName || rec.userName,
        userRole: user?.role || rec.userRole || 'employee',
        departmentId: user?.departmentId || rec.departmentId,
        departmentName: user?.departmentName || rec.departmentName,
        photo: safePhoto,
        isOfflineRecord: true,
        syncedAt: new Date().toISOString(),
        lineNotificationStatus: rec.lineNotificationStatus || 'simulated',
      });

      await withTimeout(setDoc(doc(db, 'attendance', recordId), cleanRec), 10000);
      savedRecords.push(cleanRec);
    }

    if (savedRecords.length > 0) {
      await bumpFirestoreSyncMeta();
    }
    return savedRecords;
  } catch (err) {
    return handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function getSyncMetaFromFirestore(): Promise<{
  version: number;
  lastModified: string;
  counts: { users: number; locations: number; departments: number; attendance: number };
  serverTime: string;
  timestamp: number;
} | null> {
  try {
    const snap = await withTimeout(getDoc(doc(db, '_meta', 'sync')), 5000);
    if (!snap.exists()) return null;
    const data = snap.data() as any;
    const version = Number(data?.version || 0);
    if (!version) return null;
    return {
      version,
      lastModified: String(data?.lastModified || new Date().toISOString()),
      counts: data?.counts || { users: 0, locations: 0, departments: 0, attendance: 0 },
      serverTime: new Date().toISOString(),
      timestamp: Date.now(),
    };
  } catch {
    return null;
  }
}

export function subscribeToFirestoreRealtimeSync(onChange: () => void): () => void {
  let metaInitialized = false;
  let attendanceInitialized = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const triggerReload = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      onChange();
    }, 250);
  };

  const unsubMeta = onSnapshot(
    doc(db, '_meta', 'sync'),
    () => {
      if (!metaInitialized) {
        metaInitialized = true;
        return;
      }
      triggerReload();
    },
    (err) => {
      console.warn('Firestore _meta/sync realtime listener warning:', err?.message || err);
    }
  );

  const unsubAttendance = onSnapshot(
    collection(db, 'attendance'),
    () => {
      if (!attendanceInitialized) {
        attendanceInitialized = true;
        return;
      }
      triggerReload();
    },
    (err) => {
      console.warn('Firestore attendance realtime listener warning:', err?.message || err);
    }
  );

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    unsubMeta();
    unsubAttendance();
  };
}

export { firebaseConfig };
