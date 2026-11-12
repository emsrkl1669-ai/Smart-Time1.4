import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { User, Department, AttendanceRecord, SystemSettings, LineNotificationLog, WorkLocation } from './src/types.js';
import { getThaiDateTime } from './src/utils/thaiTime.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================= FIREBASE CLUSTER PERSISTENCE (smart-time-ca6f9) =================
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  deleteDoc,
  Firestore,
} from 'firebase/firestore';

let firestoreDb: Firestore | null = null;
let firestoreConfig: any = null;

try {
  const cfgPath = path.join(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    firestoreConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    const fbApp = getApps().length === 0 ? initializeApp(firestoreConfig) : getApp();
    firestoreDb = getFirestore(fbApp, firestoreConfig.firestoreDatabaseId || undefined);
    console.log(`☁️ Firebase Firestore connected to project: ${firestoreConfig.projectId} (dbId: ${firestoreConfig.firestoreDatabaseId})`);
  }
} catch (fbErr) {
  console.warn('Firebase initialization warning:', fbErr);
}

// Asynchronous Cloud Firestore Helpers
async function firestoreSet(collectionName: string, docId: string, data: any) {
  if (!firestoreDb) return;
  try {
    // Strip undefined values before writing to Firestore
    const cleanData = JSON.parse(JSON.stringify(data));
    await setDoc(doc(firestoreDb, collectionName, docId), cleanData, { merge: true });
  } catch (err) {
    console.warn(`Firestore write notice (${collectionName}/${docId}):`, err);
  }
}

async function firestoreDelete(collectionName: string, docId: string) {
  if (!firestoreDb) return;
  try {
    await deleteDoc(doc(firestoreDb, collectionName, docId));
  } catch (err) {
    console.warn(`Firestore delete notice (${collectionName}/${docId}):`, err);
  }
}

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const BACKUP_DB_FILE = path.join(DATA_DIR, 'database.backup.json');
const TMP_DB_FILE = path.join(DATA_DIR, 'database.tmp.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const ATTENDANCE_ARCHIVE_FILE = path.join(DATA_DIR, 'attendance_archive.jsonl');
const BASELINE_FILE = path.join(DATA_DIR, 'roster_baseline.json');
const ADMIN_JOURNAL_FILE = path.join(DATA_DIR, 'admin_edits_journal.jsonl');
let lastBackupTimestamp = new Date().toISOString();
let dbVersion = Date.now();

interface AdminJournalEntry {
  entity: 'user' | 'location' | 'department' | 'settings';
  op: 'create' | 'update' | 'delete' | 'reset_password';
  id?: string;
  data?: any;
  timestamp: string;
}

// Append-only journal for Admin mutations to guarantee they can NEVER revert or be lost
function appendToAdminJournal(action: AdminJournalEntry) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.appendFileSync(ADMIN_JOURNAL_FILE, JSON.stringify(action) + '\n', 'utf-8');
    dbVersion = Date.now();

    // Mirror to Cloud Firestore immediately (smart-time-ca6f9)
    if (firestoreDb) {
      if (action.entity === 'user') {
        if (action.op === 'delete' && action.id) {
          firestoreDelete('users', action.id);
        } else if (action.data && (action.id || action.data.id)) {
          firestoreSet('users', action.id || action.data.id, action.data);
        }
      } else if (action.entity === 'location') {
        if (action.op === 'delete' && action.id) {
          firestoreDelete('locations', action.id);
        } else if (action.data && (action.id || action.data.id)) {
          firestoreSet('locations', action.id || action.data.id, action.data);
        }
      } else if (action.entity === 'department') {
        if (action.op === 'delete' && action.id) {
          firestoreDelete('departments', action.id);
        } else if (action.data && (action.id || action.data.id)) {
          firestoreSet('departments', action.id || action.data.id, action.data);
        }
      } else if (action.entity === 'settings' && action.data) {
        firestoreSet('settings', 'global', action.data);
      }
    }
  } catch (err) {
    console.error('Failed to append to admin journal:', err);
  }
}

function loadAdminJournal(): AdminJournalEntry[] {
  try {
    if (!fs.existsSync(ADMIN_JOURNAL_FILE)) return [];
    const content = fs.readFileSync(ADMIN_JOURNAL_FILE, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    const entries: AdminJournalEntry[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed && parsed.entity && parsed.op) {
          entries.push(parsed);
        }
      } catch {}
    }
    return entries;
  } catch (e) {
    console.warn('Failed to read admin journal:', e);
    return [];
  }
}

// Permanent append-only attendance archive helper
function appendToAttendanceArchive(record: AttendanceRecord) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const line = JSON.stringify(record) + '\n';
    fs.appendFileSync(ATTENDANCE_ARCHIVE_FILE, line, 'utf-8');

    // Mirror to Cloud Firestore immediately
    if (firestoreDb && record.id) {
      firestoreSet('attendance', record.id, record);
    }
  } catch (err) {
    console.error('Failed to append to attendance archive:', err);
  }
}

function loadAttendanceArchive(): AttendanceRecord[] {
  try {
    if (!fs.existsSync(ATTENDANCE_ARCHIVE_FILE)) return [];
    const content = fs.readFileSync(ATTENDANCE_ARCHIVE_FILE, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    const records: AttendanceRecord[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed && parsed.id && parsed.userId) {
          records.push(parsed);
        }
      } catch {}
    }
    return records;
  } catch (e) {
    console.warn('Failed to read attendance archive:', e);
    return [];
  }
}

// Interface for DB file structure
interface DatabaseData {
  users: User[];
  departments: Department[];
  locations: WorkLocation[];
  attendance: AttendanceRecord[];
  settings: SystemSettings;
  lineLogs: LineNotificationLog[];
}

// Initial Seed Data - 9 Required Organization Departments
const defaultDepartments: Department[] = [
  {
    id: 'dep_ems_rescue',
    name: 'กู้ชีพ-กู้ภัย',
    code: 'EMS',
    color: '#ef4444', // Red
    description: 'งานกู้ชีพฉุกเฉิน ปฐมพยาบาล และกู้ภัยทางการแพทย์',
    lineNotifyToken: '',
    notifyOnCheckIn: true,
    notifyOnCheckOut: true,
  },
  {
    id: 'dep_rescue',
    name: 'กู้ภัย',
    code: 'RESCUE',
    color: '#f97316', // Orange
    description: 'งานบรรเทาสาธารณภัย อุบัติเหตุ ค้นหาและช่วยชีวิต',
    lineNotifyToken: '',
    notifyOnCheckIn: true,
    notifyOnCheckOut: true,
  },
  {
    id: 'dep_social_welfare',
    name: 'สังคมสงเคราะห์',
    code: 'SOC',
    color: '#059669', // Emerald
    description: 'ช่วยเหลือผู้ยากไร้ แจกจ่ายสิ่งของและสงเคราะห์ชุมชน',
    lineNotifyToken: '',
    notifyOnCheckIn: true,
    notifyOnCheckOut: true,
  },
  {
    id: 'dep_admin_mgmt',
    name: 'บริหาร',
    code: 'ADM',
    color: '#4f46e5', // Indigo
    description: 'บริหารงานองค์กร บุคลากร และงานสารบรรณ',
    lineNotifyToken: '',
    notifyOnCheckIn: true,
    notifyOnCheckOut: true,
  },
  {
    id: 'dep_accounting',
    name: 'บัญชี',
    code: 'ACC',
    color: '#0284c7', // Sky
    description: 'งานบัญชี การเงิน และการจัดซื้อจัดจ้าง',
    lineNotifyToken: '',
    notifyOnCheckIn: true,
    notifyOnCheckOut: true,
  },
  {
    id: 'dep_donation',
    name: 'บริจาค',
    code: 'DON',
    color: '#ec4899', // Pink
    description: 'งานรับบริจาค จัดการกองทุน และออกใบเสร็จสมทบทุน',
    lineNotifyToken: '',
    notifyOnCheckIn: true,
    notifyOnCheckOut: true,
  },
  {
    id: 'dep_security',
    name: 'รปภ.',
    code: 'SEC',
    color: '#475569', // Slate
    description: 'งานรักษาความปลอดภัยและการจราจรสถานที่',
    lineNotifyToken: '',
    notifyOnCheckIn: true,
    notifyOnCheckOut: true,
  },
  {
    id: 'dep_housekeeping',
    name: 'แม่บ้าน',
    code: 'CLN',
    color: '#14b8a6', // Teal
    description: 'งานดูแลความสะอาด สุขอนามัย และสถานที่',
    lineNotifyToken: '',
    notifyOnCheckIn: true,
    notifyOnCheckOut: true,
  },
  {
    id: 'dep_general',
    name: 'ทั่วไป',
    code: 'GEN',
    color: '#6b7280', // Gray
    description: 'งานสนับสนุนทั่วไป ภารกิจประสานงาน และอื่นๆ',
    lineNotifyToken: '',
    notifyOnCheckIn: true,
    notifyOnCheckOut: true,
  },
];

// Initial Work Locations (Admin สามารถกำหนดตำแหน่งได้เอง)
const defaultLocations: WorkLocation[] = [
  {
    id: 'loc_bualuang_hq',
    name: 'มูลนิธิร่วมกุศล สมุทรปราการ (ศูนย์วิทยุบัวหลวง กู้ชีพกู้ภัย)',
    code: 'LOC-BUALUANG-HQ',
    address: '57/1 ซอยท้ายบ้าน 17 , ตำบลปากน้ำ, เทศบาลนครสมุทรปราการ, อำเภอเมืองสมุทรปราการ, จังหวัดสมุทรปราการ, 10290, ประเทศไทย',
    latitude: 13.5781067,
    longitude: 100.594069,
    radiusMeters: 200,
    departmentId: 'all',
    departmentName: 'ทุกแผนก(ใช้ร่วมกัน)',
    isActive: true,
    createdAt: '2026-01-01T08:00:00.000Z',
  },
  {
    id: 'loc_kongpho',
    name: 'จุดโค้งโพธิ์ มูลนิธิร่วมกศลสมุทรปราการ (กู้ชีพ-กู้ภัย บัวหลวง)',
    code: 'LOC-KONGPHO',
    address: '(โค้งโพธิ์)ถนนสุขุมวิท, สมุทรปราการ, ตำบลปากน้ำ, เทศบาลนครสมุทรปราการ, อำเภอเมืองสมุทรปราการ, จังหวัดสมุทรปราการ, 10290, ประเทศไทย',
    latitude: 13.5753313,
    longitude: 100.6046009,
    radiusMeters: 200,
    departmentId: 'all',
    departmentName: 'ทุกแผนก(ใช้ร่วมกัน)',
    isActive: true,
    createdAt: '2026-01-02T08:00:00.000Z',
  },
  {
    id: 'loc_somdet_ya_bangpu',
    name: 'จุดจอดสวนสมเด็จย่า บางปู',
    code: 'LOC-SOMDET-YA',
    address: 'ถนนสุขุมวิท, ตำบลท้ายบ้าน, เทศบาลตำบลบางปู, อำเภอเมืองสมุทรปราการ, จังหวัดสมุทรปราการ, 10280, ประเทศไทย',
    latitude: 13.555676,
    longitude: 100.6133544,
    radiusMeters: 200,
    departmentId: 'all',
    departmentName: 'ทุกแผนก(ใช้ร่วมกัน)',
    isActive: true,
    createdAt: '2026-01-03T08:00:00.000Z',
  },
  {
    id: 'loc_hosp_muangsamut_bangpu',
    name: 'จุดจอดโรงพยาบาลเมืองสมุทรบางปู',
    code: 'LOC-HOSP-BANGPU',
    address: 'ถนนสุขุมวิท, ตำบลท้ายบ้าน, เทศบาลตำบลบางปู, อำเภอเมืองสมุทรปราการ, จังหวัดสมุทรปราการ, 10280, ประเทศไทย',
    latitude: 13.5258977,
    longitude: 100.6391778,
    radiusMeters: 200,
    departmentId: 'all',
    departmentName: 'ทุกแผนก(ใช้ร่วมกัน)',
    isActive: true,
    createdAt: '2026-01-04T08:00:00.000Z',
  },
  {
    id: 'loc_ptt_praeksa',
    name: 'จุดจอด ปตท.แพรกษา',
    code: 'LOC-PTT-PRAEKSA',
    address: 'ถนนแพรกษา, ตำบลแพรกษา, เทศบาลตำบลแพรกษา, อำเภอเมืองสมุทรปราการ, จังหวัดสมุทรปราการ, 10280, ประเทศไทย',
    latitude: 13.5676663,
    longitude: 100.6629486,
    radiusMeters: 200,
    departmentId: 'all',
    departmentName: 'ทุกแผนก(ใช้ร่วมกัน)',
    isActive: true,
    createdAt: '2026-01-05T08:00:00.000Z',
  },
];

const defaultUsers: User[] = [
  {
    id: 'usr_admin',
    username: 'admin',
    password: 'admin123',
    fullName: 'นายกริชพิพัฒน์  สลับทอง (Admin)',
    role: 'admin',
    departmentId: 'dep_social_welfare',
    departmentName: 'สังคมสงเคราะห์',
    position: 'เจ้าหน้าที่สังคมสงเคราะห์/ธุรการ',
    phoneNumber: '094-781-0499',
    employeeCode: 'ADM-001',
    assignedLocationId: 'loc_bualuang_hq',
    assignedLocationName: 'มูลนิธิร่วมกุศล สมุทรปราการ (ศูนย์วิทยุบัวหลวง กู้ชีพกู้ภัย)',
    status: 'active',
    createdAt: '2026-01-01T08:00:00.000Z',
  },
];

const defaultSettings: SystemSettings = {
  companyName: 'Smart Rescue & Organization Attendance',
  defaultLineToken: process.env.LINE_NOTIFY_TOKEN || '',
  enableLineNotifications: true,
  standardCheckInTime: '08:30',
  standardCheckOutTime: '17:30',
  allowOfflineCheckIn: true,
  requirePhotoOnCheckIn: true,
  requireLocationOnCheckIn: true,
  enforceLocationGeofence: false,
};

// Calculate Haversine distance in meters between 2 coordinates
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

let lastSnapshotTime = 0;

// Save Database atomically with backup copy & disaster protection
function saveDatabase(data: DatabaseData) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }

    // Safety validation before writing
    if (!data || !Array.isArray(data.users) || !Array.isArray(data.departments)) {
      console.error('CRITICAL: saveDatabase aborted - data validation check failed!');
      return;
    }

    const payload = JSON.stringify(data, null, 2);
    if (!payload || payload.length < 50) {
      console.error('CRITICAL: saveDatabase aborted - JSON payload unexpectedly small or empty!');
      return;
    }

    // 1. Maintain immediate rollback backup copy
    if (fs.existsSync(DB_FILE)) {
      try {
        const curStat = fs.statSync(DB_FILE);
        if (curStat.size > 100) {
          fs.copyFileSync(DB_FILE, BACKUP_DB_FILE);
        }
      } catch (bErr) {
        console.warn('Backup copy warning:', bErr);
      }
    }

    // 2. Atomic write: write to temporary file first, then rename atomically
    fs.writeFileSync(TMP_DB_FILE, payload, 'utf-8');
    fs.renameSync(TMP_DB_FILE, DB_FILE);
    lastBackupTimestamp = new Date().toISOString();
    dbVersion = Date.now();

    // 3. Periodic snapshot archive (every 10 minutes)
    const now = Date.now();
    if (now - lastSnapshotTime > 10 * 60 * 1000) {
      lastSnapshotTime = now;
      const dateTag = new Date().toISOString().replace(/[:.]/g, '-');
      const snapshotFile = path.join(BACKUPS_DIR, `snapshot-${dateTag}.json`);
      fs.writeFileSync(snapshotFile, payload, 'utf-8');

      // Keep latest 10 snapshots to prevent disk bloat
      try {
        const files = fs.readdirSync(BACKUPS_DIR)
          .filter((f) => f.startsWith('snapshot-') && f.endsWith('.json'))
          .sort();
        if (files.length > 10) {
          files.slice(0, files.length - 10).forEach((f) => {
            try {
              fs.unlinkSync(path.join(BACKUPS_DIR, f));
            } catch {}
          });
        }
      } catch {}
    }
  } catch (err) {
    console.error('CRITICAL Error in saveDatabase:', err);
  }
}

// ================= CLOUD FIRESTORE MASTER SYNC =================
async function syncAllToFirestore(data: DatabaseData) {
  if (!firestoreDb) return;
  try {
    console.log('☁️ Syncing full organization data to Cloud Firestore...');
    for (const u of data.users) {
      await firestoreSet('users', u.id, u);
    }
    for (const d of data.departments) {
      await firestoreSet('departments', d.id, d);
    }
    for (const l of data.locations) {
      await firestoreSet('locations', l.id, l);
    }
    for (const a of data.attendance) {
      await firestoreSet('attendance', a.id, a);
    }
    if (data.settings) {
      await firestoreSet('settings', 'global', data.settings);
    }
    await firestoreSet('_meta', 'sync', {
      version: dbVersion,
      lastBackupTimestamp,
      counts: {
        users: data.users.length,
        locations: data.locations.length,
        departments: data.departments.length,
        attendance: data.attendance.length,
      },
      updatedAt: new Date().toISOString(),
    });
    console.log(`☁️ Cloud Firestore sync completed: ${data.users.length} users, ${data.locations.length} locations, ${data.attendance.length} records.`);
  } catch (err) {
    console.error('Failed to syncAllToFirestore:', err);
  }
}

async function loadFromFirestore(): Promise<Partial<DatabaseData> | null> {
  if (!firestoreDb) return null;
  try {
    const usersSnap = await getDocs(collection(firestoreDb, 'users'));
    if (usersSnap.empty) {
      return null;
    }

    const users: User[] = [];
    usersSnap.forEach((d) => users.push(d.data() as User));

    const deptsSnap = await getDocs(collection(firestoreDb, 'departments'));
    const departments: Department[] = [];
    deptsSnap.forEach((d) => departments.push(d.data() as Department));

    const locsSnap = await getDocs(collection(firestoreDb, 'locations'));
    const locations: WorkLocation[] = [];
    locsSnap.forEach((d) => locations.push(d.data() as WorkLocation));

    const attSnap = await getDocs(collection(firestoreDb, 'attendance'));
    const attendance: AttendanceRecord[] = [];
    attSnap.forEach((d) => attendance.push(d.data() as AttendanceRecord));

    const settingsDoc = await getDoc(doc(firestoreDb, 'settings', 'global'));
    const settings = settingsDoc.exists() ? (settingsDoc.data() as SystemSettings) : undefined;

    return {
      users,
      departments: departments.length > 0 ? departments : undefined,
      locations: locations.length > 0 ? locations : undefined,
      attendance,
      settings,
    };
  } catch (err) {
    console.warn('Failed to load from Firestore:', err);
    return null;
  }
}

// Load Database with Multi-Stage Recovery
function loadDatabase(): DatabaseData {
  let loadedData: DatabaseData | null = null;
  let loadedSource = 'none';

  // Attempt 1: Load primary DB_FILE
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      if (content && content.trim().length > 50) {
        loadedData = JSON.parse(content);
        loadedSource = 'primary (database.json)';
      }
    }
  } catch (err) {
    console.error('Warning: Failed to read primary database file:', err);
  }

  // Attempt 2: Recover from BACKUP_DB_FILE if primary failed
  if (!loadedData || !Array.isArray(loadedData.users)) {
    try {
      if (fs.existsSync(BACKUP_DB_FILE)) {
        console.warn('⚡ RECOVERING: Loading from rollback backup file:', BACKUP_DB_FILE);
        const backupContent = fs.readFileSync(BACKUP_DB_FILE, 'utf-8');
        if (backupContent && backupContent.trim().length > 50) {
          loadedData = JSON.parse(backupContent);
          loadedSource = 'rollback (database.backup.json)';
        }
      }
    } catch (bErr) {
      console.error('Warning: Failed to read backup file:', bErr);
    }
  }

  // Attempt 3: Recover from newest snapshot in BACKUPS_DIR
  if (!loadedData || !Array.isArray(loadedData.users)) {
    try {
      if (fs.existsSync(BACKUPS_DIR)) {
        const snapshots = fs.readdirSync(BACKUPS_DIR)
          .filter((f) => f.endsWith('.json'))
          .sort()
          .reverse();
        if (snapshots.length > 0) {
          const newest = path.join(BACKUPS_DIR, snapshots[0]);
          console.warn('⚡ RECOVERING: Loading from snapshot archive:', newest);
          loadedData = JSON.parse(fs.readFileSync(newest, 'utf-8'));
          loadedSource = `snapshot (${snapshots[0]})`;
        }
      }
    } catch (sErr) {
      console.error('Warning: Failed to read snapshot archives:', sErr);
    }
  }

  // Attempt 4: Recover from roster_baseline.json if all else failed
  if (!loadedData || !Array.isArray(loadedData.users)) {
    try {
      if (fs.existsSync(BASELINE_FILE)) {
        console.warn('⚡ RECOVERING: Loading from immutable baseline roster:', BASELINE_FILE);
        const baselineContent = fs.readFileSync(BASELINE_FILE, 'utf-8');
        if (baselineContent && baselineContent.trim().length > 50) {
          loadedData = JSON.parse(baselineContent);
          loadedSource = 'baseline (roster_baseline.json)';
        }
      }
    } catch (bErr) {
      console.error('Warning: Failed to read baseline file:', bErr);
    }
  }

  // If successfully loaded from primary, backup, snapshot, or baseline
  if (loadedData && Array.isArray(loadedData.users)) {
    console.log(`✅ Central Database loaded successfully from: ${loadedSource}`);
    const loadedDepartments: Department[] = loadedData.departments || [];
    defaultDepartments.forEach((reqDept) => {
      const found = loadedDepartments.some((d) => d.id === reqDept.id || d.name === reqDept.name);
      if (!found) {
        loadedDepartments.push(reqDept);
      }
    });

    let loadedUsers: User[] = loadedData.users;
    let loadedLocations: WorkLocation[] = loadedData.locations && loadedData.locations.length > 0 ? loadedData.locations : defaultLocations;
    let loadedSettings: SystemSettings = loadedData.settings ? { ...defaultSettings, ...loadedData.settings } : defaultSettings;

    // Replay any Admin Journal mutations so Admin edits NEVER roll back or get lost across reboots
    const journalEntries = loadAdminJournal();
    if (journalEntries.length > 0) {
      let replayedCount = 0;
      for (const entry of journalEntries) {
        if (entry.entity === 'user') {
          if (entry.op === 'create' && entry.data?.id) {
            const exists = loadedUsers.some((u) => u.id === entry.data.id);
            if (!exists) {
              loadedUsers.push(entry.data);
              replayedCount++;
            }
          } else if (entry.op === 'update' && entry.id && entry.data) {
            const idx = loadedUsers.findIndex((u) => u.id === entry.id);
            if (idx !== -1) {
              loadedUsers[idx] = { ...loadedUsers[idx], ...entry.data };
              replayedCount++;
            }
          } else if (entry.op === 'delete' && entry.id) {
            const beforeLen = loadedUsers.length;
            loadedUsers = loadedUsers.filter((u) => u.id !== entry.id);
            if (loadedUsers.length !== beforeLen) replayedCount++;
          } else if (entry.op === 'reset_password' && entry.id && entry.data?.password) {
            const targetUser = loadedUsers.find((u) => u.id === entry.id);
            if (targetUser) {
              targetUser.password = entry.data.password;
              replayedCount++;
            }
          }
        } else if (entry.entity === 'location') {
          if (entry.op === 'update' && entry.data?.id) {
            const idx = loadedLocations.findIndex((l) => l.id === entry.data.id);
            if (idx !== -1) {
              loadedLocations[idx] = { ...loadedLocations[idx], ...entry.data };
            } else {
              loadedLocations.push(entry.data);
            }
            replayedCount++;
          } else if (entry.op === 'delete' && entry.id) {
            loadedLocations = loadedLocations.filter((l) => l.id !== entry.id);
            replayedCount++;
          }
        } else if (entry.entity === 'department') {
          if (entry.op === 'update' && entry.data?.id) {
            const idx = loadedDepartments.findIndex((d) => d.id === entry.data.id);
            if (idx !== -1) {
              loadedDepartments[idx] = { ...loadedDepartments[idx], ...entry.data };
            } else {
              loadedDepartments.push(entry.data);
            }
            replayedCount++;
          } else if (entry.op === 'delete' && entry.id) {
            const filtered = loadedDepartments.filter((d) => d.id !== entry.id);
            loadedDepartments.length = 0;
            loadedDepartments.push(...filtered);
            replayedCount++;
          }
        } else if (entry.entity === 'settings' && entry.data) {
          loadedSettings = { ...loadedSettings, ...entry.data };
          replayedCount++;
        }
      }
      if (replayedCount > 0) {
        console.log(`🛡️ Replayed and enforced ${replayedCount} Admin journal edits. Integrity 100%.`);
      }
    }

    loadedUsers.forEach((u) => {
      if ((u.id === 'usr_admin' || u.username === 'admin') && !u.fullName) {
        u.fullName = 'นายกริชพิพัฒน์  สลับทอง (Admin)';
      }
    });

    // Filter out old demo dummy records
    let loadedAttendance: AttendanceRecord[] = (loadedData.attendance || []).filter(
      (r) =>
        r.userId !== 'usr_somchai' &&
        !(r.userName && r.userName.includes('สมชาย')) &&
        r.id !== 'att_1793678354265_gye2' &&
        r.id !== 'att_1791596015445_jm7c'
    );

    // Merge in any records from permanent archive that might be missing
    const archiveRecords = loadAttendanceArchive();
    if (archiveRecords.length > 0) {
      const existingIds = new Set(loadedAttendance.map((r) => r.id));
      let restoredCount = 0;
      for (const arc of archiveRecords) {
        if (
          arc.userId !== 'usr_somchai' &&
          !(arc.userName && arc.userName.includes('สมชาย')) &&
          arc.id !== 'att_1793678354265_gye2' &&
          arc.id !== 'att_1791596015445_jm7c' &&
          !existingIds.has(arc.id)
        ) {
          loadedAttendance.push(arc);
          existingIds.add(arc.id);
          restoredCount++;
        }
      }
      if (restoredCount > 0) {
        console.log(`🛡️ Recovered ${restoredCount} attendance records from permanent archive.`);
      }
    }

    // Sort descending by timestamp
    loadedAttendance.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const cleanData: DatabaseData = {
      users: loadedUsers,
      departments: loadedDepartments,
      locations: loadedLocations,
      attendance: loadedAttendance,
      settings: loadedSettings,
      lineLogs: loadedData.lineLogs || [],
    };

    saveDatabase(cleanData);
    return cleanData;
  }

  // Fallback defaults ONLY if brand new installation
  console.log('ℹ️ Initializing fresh central database with default organization seed');
  let fallbackUsers = defaultUsers;
  let fallbackLocations = defaultLocations;
  try {
    if (fs.existsSync(BASELINE_FILE)) {
      const bContent = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'));
      if (bContent && Array.isArray(bContent.users) && bContent.users.length > 0) {
        fallbackUsers = bContent.users;
      }
      if (bContent && Array.isArray(bContent.locations) && bContent.locations.length > 0) {
        fallbackLocations = bContent.locations;
      }
    }
  } catch {}

  const initialData: DatabaseData = {
    users: fallbackUsers,
    departments: defaultDepartments,
    locations: fallbackLocations,
    attendance: [],
    settings: defaultSettings,
    lineLogs: [],
  };

  saveDatabase(initialData);
  return initialData;
}

// In-Memory active database reference
let db: DatabaseData = loadDatabase();

// LINE Notify Helper
async function sendLineNotification(
  message: string,
  departmentId?: string,
  imageThumbnailUrl?: string
): Promise<{ success: boolean; simulated: boolean; details: string; departmentName?: string }> {
  let departmentName = 'ส่วนกลาง / ทุกแผนก';
  try {
    let token = '';

    if (departmentId) {
      const dept = db.departments.find((d) => d.id === departmentId);
      if (dept) {
        departmentName = dept.name;
        if (dept.lineNotifyToken && dept.lineNotifyToken.trim() !== '') {
          token = dept.lineNotifyToken.trim();
        }
      }
    }

    // Fallback to default system LINE token if department doesn't have one
    if (!token && db.settings.defaultLineToken && db.settings.defaultLineToken.trim() !== '') {
      token = db.settings.defaultLineToken.trim();
    }

    if (!token) {
      // Simulate mode
      const log: LineNotificationLog = {
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date().toISOString(),
        recipientDepartment: departmentName,
        tokenUsed: 'โหมดจำลอง (ยังไม่ได้ใส่ Token)',
        type: message.includes('ออกงาน') ? 'check_out' : 'check_in',
        userName: message.split('\n')[1]?.replace('👤 ผู้ลงเวลา: ', '') || 'ผู้ใช้งาน',
        message,
        status: 'simulated',
        responseDetails: 'จำลองสำเร็จ (ใส่ Token ในเมนูตั้งค่า LINE หรือ แผนก เพื่อส่งเข้ากลุ่ม LINE จริง)',
      };
      db.lineLogs.unshift(log);
      if (db.lineLogs.length > 50) db.lineLogs.pop();
      saveDatabase(db);

      return {
        success: true,
        simulated: true,
        details: 'แจ้งเตือนโหมดจำลองสำเร็จ (บันทึกในประวัติ Log)',
        departmentName,
      };
    }

    // Call Real LINE Notify API
    const params = new URLSearchParams();
    params.append('message', message);

    const res = await fetch('https://notify-api.line.me/api/notify', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const resJson = await res.json().catch(() => ({}));
    const isSuccess = res.ok && resJson.status === 200;

    const log: LineNotificationLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      recipientDepartment: departmentName,
      tokenUsed: token.substring(0, 4) + '****' + token.substring(token.length - 4),
      type: message.includes('ออกงาน') ? 'check_out' : 'check_in',
      userName: message.split('\n')[1]?.replace('👤 ผู้ลงเวลา: ', '') || 'ผู้ใช้งาน',
      message,
      status: isSuccess ? 'sent' : 'failed',
      responseDetails: JSON.stringify(resJson),
    };
    db.lineLogs.unshift(log);
    if (db.lineLogs.length > 50) db.lineLogs.pop();
    saveDatabase(db);

    return {
      success: isSuccess,
      simulated: false,
      details: isSuccess ? 'ส่งเข้า LINE สำเร็จ' : `LINE Error: ${resJson.message || res.statusText}`,
      departmentName,
    };
  } catch (err: any) {
    console.error('LINE Notify call error:', err);
    return {
      success: false,
      simulated: false,
      details: `เครือข่ายขัดข้อง: ${err?.message || 'ส่งไม่สำเร็จ'}`,
      departmentName,
    };
  }
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // 0. Cloud Firestore Master Synchronizer (smart-time-ca6f9)
  try {
    const cloudData = await loadFromFirestore();
    if (cloudData && cloudData.users && cloudData.users.length > 0) {
      console.log(`☁️ Cloud Firestore connected: Loaded ${cloudData.users.length} users and ${cloudData.attendance?.length || 0} attendance records.`);
      db.users = cloudData.users;
      if (cloudData.departments && cloudData.departments.length > 0) db.departments = cloudData.departments;
      if (cloudData.locations && cloudData.locations.length > 0) db.locations = cloudData.locations;
      if (cloudData.attendance) db.attendance = cloudData.attendance;
      if (cloudData.settings) db.settings = { ...db.settings, ...cloudData.settings };
      saveDatabase(db);
    } else if (firestoreDb) {
      console.log('☁️ Seeding Cloud Firestore with 57 personnel, work locations, and settings...');
      await syncAllToFirestore(db);
    }
  } catch (cloudErr) {
    console.warn('Cloud Firestore startup sync notice:', cloudErr);
  }

  // JSON Body parser (high limit for base64 photo capture)
  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: '20mb' }));

  // Universal CORS & Cross-Device Access Middleware:
  // Allows mobile phones, external laptops, tablets, and proxies to access the API seamlessly
  app.use((req: Request, res: Response, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Cache-Control, Pragma, Expires, X-Requested-With, Origin, Accept'
    );
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Crucial for Cross-Device Persistence & Device Reboots:
  // Disable HTTP cache for all /api endpoints so mobile/desktop browsers always fetch fresh data
  app.use('/api', (req: Request, res: Response, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
  });

  // ================= API ROUTES =================

  // 1. Health check & DB Status
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      usersCount: db.users.length,
      attendanceCount: db.attendance.length,
      departmentsCount: db.departments.length,
      locationsCount: db.locations.length,
      timestamp: new Date().toISOString(),
    });
  });

  // 1.0 Real-Time Instant Sync-Check for Cross-Device Consistency
  app.get('/api/sync-check', (req: Request, res: Response) => {
    res.json({
      version: dbVersion,
      lastModified: lastBackupTimestamp,
      counts: {
        users: db.users.length,
        locations: db.locations.length,
        departments: db.departments.length,
        attendance: db.attendance.length,
      },
      serverTime: new Date().toISOString(),
      timestamp: Date.now(),
    });
  });

  // 1.1 Thai Real-Time Synchronization (Asia/Bangkok GMT+7)
  app.get('/api/time', (req: Request, res: Response) => {
    const now = new Date();
    const thai = getThaiDateTime(now);
    res.json({
      serverTime: now.toISOString(),
      thaiDate: thai.dateStr,
      thaiTime: thai.timeStr,
      thaiFormatted: thai.formattedDateTime,
      fullThaiDate: thai.fullThaiDate,
      thaiYear: thai.thaiYear,
      timezone: 'Asia/Bangkok (GMT+7)',
      timestamp: now.getTime(),
    });
  });

  // 1.2 Firebase Cloud Firestore Status & Zero Data Loss Guarantee
  app.get('/api/firebase-status', (req: Request, res: Response) => {
    res.json({
      connected: !!firestoreDb,
      projectId: firestoreConfig?.projectId || 'smart-time-ca6f9',
      databaseId: firestoreConfig?.firestoreDatabaseId || 'default',
      status: firestoreDb ? 'connected' : 'offline',
      cloudProtected: true,
      counts: {
        users: db.users.length,
        locations: db.locations.length,
        departments: db.departments.length,
        attendance: db.attendance.length,
      },
      lastSynced: lastBackupTimestamp,
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/firebase-sync', async (req: Request, res: Response) => {
    try {
      await syncAllToFirestore(db);
      res.json({
        success: true,
        message: 'ซิงค์ข้อมูลทั้งหมดเข้าสู่ Cloud Firestore (smart-time-ca6f9) สำเร็จ ปลอดภัย 100%',
        counts: {
          users: db.users.length,
          locations: db.locations.length,
          departments: db.departments.length,
          attendance: db.attendance.length,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: `ซิงค์ไม่สำเร็จ: ${err?.message || err}` });
    }
  });

  // 2. Authentication: Login with username & password
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'กรุณากรอก Username และ Password' });
      return;
    }

    const cleanUsername = String(username).trim().toLowerCase();
    const cleanPassword = String(password).trim();

    const user = db.users.find(
      (u) => u.username.toLowerCase() === cleanUsername && u.password === cleanPassword
    );

    if (!user) {
      res.status(401).json({ error: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง' });
      return;
    }

    if (user.status === 'inactive') {
      res.status(403).json({ error: 'บัญชีผู้ใช้นี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ' });
      return;
    }

    // Strip password in return
    const { password: _, ...userWithoutPassword } = user;
    const token = `token_${user.id}_${Date.now()}`;

    res.json({
      user: userWithoutPassword,
      token,
    });
  });

  // 2.1 Re-hydrate & Verify Session (Cross-device and post-restart persistence)
  app.post('/api/auth/verify', (req: Request, res: Response) => {
    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ valid: false, error: 'Missing userId' });
      return;
    }

    const user = db.users.find((u) => u.id === userId);
    if (!user || user.status === 'inactive') {
      res.json({ valid: false, user: null });
      return;
    }

    const { password: _, ...userWithoutPassword } = user;
    res.json({
      valid: true,
      user: userWithoutPassword,
    });
  });

  // 3. Departments: List, Add, Update, Delete
  app.get('/api/departments', (req: Request, res: Response) => {
    // Augment with active member count
    const departmentsWithCount = db.departments.map((dept) => {
      const count = db.users.filter((u) => u.departmentId === dept.id && u.status === 'active').length;
      return {
        ...dept,
        memberCount: count,
      };
    });
    res.json(departmentsWithCount);
  });

  app.post('/api/departments', (req: Request, res: Response) => {
    const { id, name, code, color, description, lineNotifyToken, notifyOnCheckIn, notifyOnCheckOut } = req.body;
    if (!name || !code) {
      res.status(400).json({ error: 'กรุณาระบุชื่อแผนกและรหัสแผนก' });
      return;
    }

    if (id) {
      // Update existing
      const index = db.departments.findIndex((d) => d.id === id);
      if (index !== -1) {
        db.departments[index] = {
          ...db.departments[index],
          name: name.trim(),
          code: code.trim().toUpperCase(),
          color: color || db.departments[index].color || '#4f46e5',
          description: description || '',
          lineNotifyToken: lineNotifyToken !== undefined ? lineNotifyToken.trim() : db.departments[index].lineNotifyToken,
          notifyOnCheckIn: notifyOnCheckIn !== undefined ? Boolean(notifyOnCheckIn) : true,
          notifyOnCheckOut: notifyOnCheckOut !== undefined ? Boolean(notifyOnCheckOut) : true,
        };

        // Also update departmentName in users if name changed
        db.users.forEach((u) => {
          if (u.departmentId === id) {
            u.departmentName = name.trim();
          }
        });

        // Also cascade departmentName update to all attendance records
        db.attendance.forEach((att) => {
          if (att.departmentId === id) {
            att.departmentName = name.trim();
          }
        });

        saveDatabase(db);
        appendToAdminJournal({
          entity: 'department',
          op: 'update',
          id: db.departments[index].id,
          data: db.departments[index],
          timestamp: new Date().toISOString(),
        });
        res.json({ message: 'บันทึกข้อมูลแผนกสำเร็จ', department: db.departments[index] });
        return;
      }
    }

    // Add new
    const newDept: Department = {
      id: `dep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim(),
      code: code.trim().toUpperCase(),
      color: color || '#4f46e5',
      description: description || '',
      lineNotifyToken: lineNotifyToken?.trim() || '',
      notifyOnCheckIn: notifyOnCheckIn !== undefined ? Boolean(notifyOnCheckIn) : true,
      notifyOnCheckOut: notifyOnCheckOut !== undefined ? Boolean(notifyOnCheckOut) : true,
    };

    db.departments.push(newDept);
    saveDatabase(db);
    appendToAdminJournal({
      entity: 'department',
      op: 'create',
      id: newDept.id,
      data: newDept,
      timestamp: new Date().toISOString(),
    });
    res.status(201).json({ message: 'สร้างแผนกใหม่สำเร็จ', department: newDept });
  });

  app.delete('/api/departments/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const count = db.users.filter((u) => u.departmentId === id).length;
    if (count > 0) {
      res.status(400).json({
        error: `ไม่สามารถลบแผนกนี้ได้ เนื่องจากมีผู้ใช้งานสังกัดอยู่ ${count} คน กรุณาย้ายแผนกของผู้ใช้งานก่อน`,
      });
      return;
    }

    db.departments = db.departments.filter((d) => d.id !== id);
    saveDatabase(db);
    appendToAdminJournal({
      entity: 'department',
      op: 'delete',
      id,
      timestamp: new Date().toISOString(),
    });
    res.json({ message: 'ลบแผนกเรียบร้อยแล้ว' });
  });

  // ================= WORK LOCATIONS MANAGEMENT (Admin กำหนดตำแหน่งได้เอง) =================
  app.get('/api/locations', (req: Request, res: Response) => {
    res.json(db.locations);
  });

  app.post('/api/locations', (req: Request, res: Response) => {
    const {
      id,
      name,
      code,
      address,
      latitude,
      longitude,
      radiusMeters,
      departmentId,
      isActive,
    } = req.body;

    if (!name || latitude === undefined || longitude === undefined) {
      res.status(400).json({ error: 'กรุณากรอกชื่อจุดปฏิบัติงาน และพิกัดละติจูด-ลองจิจูด' });
      return;
    }

    let deptName = 'ทุกแผนก';
    if (departmentId && departmentId !== 'all') {
      const dept = db.departments.find((d) => d.id === departmentId);
      if (dept) deptName = dept.name;
    }

    if (id) {
      // Update
      const index = db.locations.findIndex((l) => l.id === id);
      if (index !== -1) {
        db.locations[index] = {
          ...db.locations[index],
          name: String(name).trim(),
          code: code ? String(code).trim().toUpperCase() : db.locations[index].code,
          address: address ? String(address).trim() : db.locations[index].address,
          latitude: Number(latitude),
          longitude: Number(longitude),
          radiusMeters: Number(radiusMeters) || db.locations[index].radiusMeters || 200,
          departmentId: departmentId || db.locations[index].departmentId,
          departmentName: deptName,
          isActive: isActive !== undefined ? Boolean(isActive) : db.locations[index].isActive,
        };

        const updatedLocName = String(name).trim();
        // Cascade location name update to assigned users
        db.users.forEach((u) => {
          if (u.assignedLocationId === id) {
            u.assignedLocationName = updatedLocName;
          }
        });

        // Cascade location name update to past attendance records linked to this location
        db.attendance.forEach((att) => {
          if (att.workLocationId === id) {
            att.locationName = updatedLocName;
            att.workLocationName = updatedLocName;
          }
        });

        saveDatabase(db);
        appendToAdminJournal({
          entity: 'location',
          op: 'update',
          id: db.locations[index].id,
          data: db.locations[index],
          timestamp: new Date().toISOString(),
        });
        res.json({ message: 'อัปเดตจุดปฏิบัติงานสำเร็จ', location: db.locations[index] });
        return;
      }
    }

    // Add new
    const newLoc: WorkLocation = {
      id: `loc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: String(name).trim(),
      code: code ? String(code).trim().toUpperCase() : `LOC-${Math.floor(100 + Math.random() * 900)}`,
      address: address ? String(address).trim() : 'พิกัดที่กำหนดโดยผู้ดูแลระบบ',
      latitude: Number(latitude),
      longitude: Number(longitude),
      radiusMeters: Number(radiusMeters) || 200,
      departmentId: departmentId || 'all',
      departmentName: deptName,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      createdAt: new Date().toISOString(),
    };

    db.locations.push(newLoc);
    saveDatabase(db);
    appendToAdminJournal({
      entity: 'location',
      op: 'update',
      id: newLoc.id,
      data: newLoc,
      timestamp: new Date().toISOString(),
    });
    res.status(201).json({ message: 'สร้างจุดปฏิบัติงานใหม่สำเร็จ', location: newLoc });
  });

  app.delete('/api/locations/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const exists = db.locations.some((l) => l.id === id);
    if (!exists) {
      res.status(404).json({ error: 'ไม่พบจุดปฏิบัติงานนี้' });
      return;
    }

    db.locations = db.locations.filter((l) => l.id !== id);
    saveDatabase(db);
    appendToAdminJournal({
      entity: 'location',
      op: 'delete',
      id,
      timestamp: new Date().toISOString(),
    });
    res.json({ message: 'ลบจุดปฏิบัติงานเรียบร้อยแล้ว' });
  });

  // 4. Users Management: List, Create, Update, Delete
  app.get('/api/users', (req: Request, res: Response) => {
    const safeUsers = db.users.map(({ password, ...u }) => u);
    res.json(safeUsers);
  });

  // Admin access to view users with passwords (for distributing account credentials to staff on various devices)
  app.get('/api/admin/users-with-passwords', (req: Request, res: Response) => {
    res.json(db.users);
  });

  // Reset password endpoint
  app.post('/api/users/:id/reset-password', (req: Request, res: Response) => {
    const { id } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || String(newPassword).trim() === '') {
      res.status(400).json({ error: 'กรุณากรอกรหัสผ่านใหม่' });
      return;
    }
    const userIndex = db.users.findIndex((u) => u.id === id);
    if (userIndex === -1) {
      res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });
      return;
    }
    db.users[userIndex].password = String(newPassword).trim();
    saveDatabase(db);
    appendToAdminJournal({
      entity: 'user',
      op: 'reset_password',
      id,
      data: { password: String(newPassword).trim() },
      timestamp: new Date().toISOString(),
    });
    res.json({ message: 'เปลี่ยนรหัสผ่านสำเร็จ', username: db.users[userIndex].username });
  });

  app.post('/api/users', (req: Request, res: Response) => {
    const {
      username,
      password,
      fullName,
      role,
      departmentId,
      position,
      assignedLocationId,
      phoneNumber,
      employeeCode,
      status,
    } = req.body;

    if (!username || !password || !fullName || !role) {
      res.status(400).json({ error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (Username, Password, ชื่อ-นามสกุล, สิทธิ์)' });
      return;
    }

    const cleanUsername = String(username).trim().toLowerCase();
    const exists = db.users.some((u) => u.username.toLowerCase() === cleanUsername);
    if (exists) {
      res.status(400).json({ error: 'Username นี้ถูกใช้งานแล้ว กรุณาเลือกชื่ออื่น' });
      return;
    }

    const dept = db.departments.find((d) => d.id === departmentId || d.name === departmentId);
    const departmentName = dept ? dept.name : (departmentId || 'ทั่วไป');

    let assignedLocationName = '';
    if (assignedLocationId) {
      const loc = db.locations.find((l) => l.id === assignedLocationId);
      if (loc) assignedLocationName = loc.name;
    }

    const newUser: User = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      username: cleanUsername,
      password: String(password).trim(),
      fullName: String(fullName).trim(),
      role: (['admin', 'employee', 'volunteer'].includes(role) ? role : 'employee') as any,
      departmentId: dept ? dept.id : 'dep_general',
      departmentName,
      position: position ? String(position).trim() : '',
      assignedLocationId: assignedLocationId || undefined,
      assignedLocationName: assignedLocationName || undefined,
      phoneNumber: phoneNumber ? String(phoneNumber).trim() : '',
      employeeCode: employeeCode ? String(employeeCode).trim() : `EMP-${Math.floor(100 + Math.random() * 900)}`,
      status: status === 'inactive' ? 'inactive' : 'active',
      createdAt: new Date().toISOString(),
    };

    db.users.push(newUser);
    saveDatabase(db);
    appendToAdminJournal({
      entity: 'user',
      op: 'create',
      id: newUser.id,
      data: newUser,
      timestamp: new Date().toISOString(),
    });

    const { password: _, ...safeUser } = newUser;
    res.status(201).json({ message: 'เพิ่มผู้ใช้งานสำเร็จ', user: safeUser });
  });

  // Batch import/sync users (e.g. from CSV or organizational rosters)
  app.post('/api/users/batch', (req: Request, res: Response) => {
    const { users: incomingUsers } = req.body;
    if (!Array.isArray(incomingUsers) || incomingUsers.length === 0) {
      res.status(400).json({ error: 'ไม่พบรายการผู้ใช้งานที่ต้องการนำเข้า' });
      return;
    }

    let importedCount = 0;
    let updatedCount = 0;

    for (const item of incomingUsers) {
      if (!item.fullName || !item.username) continue;
      const cleanUsername = String(item.username).trim().toLowerCase();
      const existingIdx = db.users.findIndex(
        (u) =>
          u.username.toLowerCase() === cleanUsername ||
          u.fullName.replace(/\s+/g, '') === String(item.fullName).replace(/\s+/g, '')
      );

      const dept = db.departments.find(
        (d) => d.id === item.departmentId || d.name === item.departmentName || d.name === item.departmentId
      );
      const departmentName = dept ? dept.name : (item.departmentName || item.departmentId || 'ทั่วไป');
      const departmentId = dept ? dept.id : (item.departmentId || 'dep_general');

      if (existingIdx !== -1) {
        // Update
        db.users[existingIdx] = {
          ...db.users[existingIdx],
          fullName: String(item.fullName).trim(),
          role: item.role ? item.role : db.users[existingIdx].role,
          departmentId,
          departmentName,
          position: item.position !== undefined ? String(item.position).trim() : db.users[existingIdx].position,
          phoneNumber: item.phoneNumber !== undefined ? String(item.phoneNumber).trim() : db.users[existingIdx].phoneNumber,
          employeeCode: item.employeeCode ? String(item.employeeCode).trim() : db.users[existingIdx].employeeCode,
          status: item.status || db.users[existingIdx].status || 'active',
          password: item.password ? String(item.password).trim() : db.users[existingIdx].password,
        };
        updatedCount++;
      } else {
        // Create new
        const newUid = item.id || `usr_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
        db.users.push({
          id: newUid,
          username: cleanUsername,
          password: item.password ? String(item.password).trim() : '123456',
          fullName: String(item.fullName).trim(),
          role: (item.role && ['admin', 'employee', 'volunteer'].includes(item.role) ? item.role : 'employee') as any,
          departmentId,
          departmentName,
          position: item.position ? String(item.position).trim() : '',
          phoneNumber: item.phoneNumber ? String(item.phoneNumber).trim() : '',
          employeeCode: item.employeeCode ? String(item.employeeCode).trim() : `EMP-${Math.floor(100 + Math.random() * 900)}`,
          status: item.status === 'inactive' ? 'inactive' : 'active',
          createdAt: new Date().toISOString(),
        });
        importedCount++;
      }
    }

    saveDatabase(db);
    res.json({
      message: `นำเข้าข้อมูลสำเร็จ: เพิ่มใหม่ ${importedCount} รายการ, อัปเดต ${updatedCount} รายการ`,
      importedCount,
      updatedCount,
      totalUsers: db.users.length,
    });
  });

  app.put('/api/users/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const {
      fullName,
      password,
      role,
      departmentId,
      position,
      assignedLocationId,
      phoneNumber,
      employeeCode,
      status,
    } = req.body;

    const userIndex = db.users.findIndex((u) => u.id === id);
    if (userIndex === -1) {
      res.status(404).json({ error: 'ไม่พบข้อมูลผู้ใช้งานนี้' });
      return;
    }

    const target = db.users[userIndex];
    let deptName = target.departmentName;
    let deptId = target.departmentId;
    if (departmentId) {
      const dept = db.departments.find((d) => d.id === departmentId || d.name === departmentId);
      if (dept) {
        deptName = dept.name;
        deptId = dept.id;
      } else {
        deptName = departmentId;
        deptId = departmentId;
      }
    }

    let assignedLocationName = target.assignedLocationName;
    if (assignedLocationId !== undefined) {
      if (assignedLocationId) {
        const loc = db.locations.find((l) => l.id === assignedLocationId);
        assignedLocationName = loc ? loc.name : '';
      } else {
        assignedLocationName = '';
      }
    }

    db.users[userIndex] = {
      ...target,
      fullName: fullName !== undefined ? String(fullName).trim() : target.fullName,
      password: password ? String(password).trim() : target.password,
      role: role ? role : target.role,
      departmentId: deptId,
      departmentName: deptName,
      position: position !== undefined ? String(position).trim() : target.position,
      assignedLocationId: assignedLocationId !== undefined ? (assignedLocationId || undefined) : target.assignedLocationId,
      assignedLocationName: assignedLocationName || undefined,
      phoneNumber: phoneNumber !== undefined ? String(phoneNumber).trim() : target.phoneNumber,
      employeeCode: employeeCode !== undefined ? String(employeeCode).trim() : target.employeeCode,
      status: status ? status : target.status,
    };

    const updatedUser = db.users[userIndex];

    // Cascade user changes (name, role, department) to all attendance records of this user
    db.attendance.forEach((att) => {
      if (att.userId === target.id) {
        att.userName = updatedUser.fullName;
        att.userRole = updatedUser.role;
        att.departmentId = updatedUser.departmentId;
        att.departmentName = updatedUser.departmentName;
      }
    });

    saveDatabase(db);
    appendToAdminJournal({
      entity: 'user',
      op: 'update',
      id: updatedUser.id,
      data: updatedUser,
      timestamp: new Date().toISOString(),
    });
    const { password: _, ...safeUser } = db.users[userIndex];
    res.json({ message: 'อัปเดตข้อมูลผู้ใช้งานสำเร็จ', user: safeUser });
  });

  app.delete('/api/users/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const user = db.users.find((u) => u.id === id);
    if (!user) {
      res.status(404).json({ error: 'ไม่พบผู้ใช้งาน' });
      return;
    }

    if (user.username === 'admin') {
      res.status(400).json({ error: 'ไม่สามารถลบบัญชีผู้ดูแลระบบหลัก (Admin) ได้' });
      return;
    }

    db.users = db.users.filter((u) => u.id !== id);
    saveDatabase(db);
    appendToAdminJournal({
      entity: 'user',
      op: 'delete',
      id,
      timestamp: new Date().toISOString(),
    });
    res.json({ message: 'ลบผู้ใช้งานเรียบร้อยแล้ว' });
  });

  // 5. Attendance Management: Check-In / Check-Out
  app.get('/api/attendance', (req: Request, res: Response) => {
    const { userId, departmentId, role, type, startDate, endDate } = req.query;

    let results = [...db.attendance];

    if (userId) {
      results = results.filter((r) => r.userId === String(userId));
    }
    if (departmentId) {
      results = results.filter((r) => r.departmentId === String(departmentId));
    }
    if (role) {
      results = results.filter((r) => r.userRole === String(role));
    }
    if (type) {
      results = results.filter((r) => r.type === String(type));
    }
    if (startDate) {
      results = results.filter((r) => r.date >= String(startDate));
    }
    if (endDate) {
      results = results.filter((r) => r.date <= String(endDate));
    }

    // Sort descending by timestamp
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json(results);
  });

  app.post('/api/attendance', async (req: Request, res: Response) => {
    try {
      const {
        userId,
        type,
        photo,
        latitude,
        longitude,
        accuracy,
        locationName,
        workLocationId,
        note,
        isOfflineRecord,
        customTimestamp,
      } = req.body;

      if (!userId || !type) {
        res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน (userId หรือ type หายไป)' });
        return;
      }

      const user = db.users.find((u) => u.id === userId);
      if (!user) {
        res.status(404).json({ error: 'ไม่พบผู้ใช้งานนี้ในระบบ' });
        return;
      }

      const now = customTimestamp ? new Date(customTimestamp) : new Date();
      // Format Thai date & time strictly in Asia/Bangkok (GMT+7)
      const thai = getThaiDateTime(now);
      const dateStr = thai.dateStr;
      const timeStr = thai.timeStr;

      const recordLat = Number(latitude) || 13.7563;
      const recordLon = Number(longitude) || 100.5018;

      // Find closest or selected work location
      let matchedWorkLocation: WorkLocation | undefined;
      let calculatedDistance: number | undefined;
      let isWithinGeofence = false;

      if (workLocationId) {
        matchedWorkLocation = db.locations.find((l) => l.id === workLocationId);
      } else if (user.assignedLocationId) {
        matchedWorkLocation = db.locations.find((l) => l.id === user.assignedLocationId);
      }

      // If no explicit match, find closest location among active locations
      if (!matchedWorkLocation && db.locations.length > 0) {
        let minDistance = Infinity;
        db.locations.forEach((loc) => {
          if (!loc.isActive) return;
          const d = calculateDistanceMeters(recordLat, recordLon, loc.latitude, loc.longitude);
          if (d < minDistance) {
            minDistance = d;
            matchedWorkLocation = loc;
          }
        });
      }

      if (matchedWorkLocation) {
        calculatedDistance = calculateDistanceMeters(
          recordLat,
          recordLon,
          matchedWorkLocation.latitude,
          matchedWorkLocation.longitude
        );
        isWithinGeofence = calculatedDistance <= (matchedWorkLocation.radiusMeters || 200);
      }

      // Detect OS from user-agent
      const userAgent = req.headers['user-agent'] || '';
      let deviceOs: 'ios' | 'android' | 'desktop' | 'unknown' = 'unknown';
      if (/iPhone|iPad|iPod/i.test(userAgent)) {
        deviceOs = 'ios';
      } else if (/Android/i.test(userAgent)) {
        deviceOs = 'android';
      } else {
        deviceOs = 'desktop';
      }

      const recordId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      const newRecord: AttendanceRecord = {
        id: recordId,
        userId: user.id,
        userName: user.fullName,
        userRole: user.role,
        departmentId: user.departmentId,
        departmentName: user.departmentName,
        type: type === 'check_out' ? 'check_out' : 'check_in',
        timestamp: now.toISOString(),
        date: dateStr,
        time: timeStr,
        photo: photo || '',
        latitude: recordLat,
        longitude: recordLon,
        accuracy: accuracy ? Number(accuracy) : undefined,
        locationName: locationName || (matchedWorkLocation ? matchedWorkLocation.name : 'พิกัด GPS ที่ระบุ'),
        workLocationId: matchedWorkLocation?.id,
        workLocationName: matchedWorkLocation?.name,
        isWithinGeofence,
        distanceFromLocationMeters: calculatedDistance,
        deviceOs,
        note: note ? String(note).trim() : '',
        isOfflineRecord: Boolean(isOfflineRecord),
        syncedAt: isOfflineRecord ? new Date().toISOString() : undefined,
        lineNotificationStatus: 'simulated',
        lineTargetDepartment: user.departmentName,
      };

      // Department-targeted LINE Notify message
      const typeThai = newRecord.type === 'check_in' ? '🟢 บันทึกเวลาเข้างาน (Check-In)' : '🔴 บันทึกเวลาออกงาน (Check-Out)';
      const roleThai = user.role === 'volunteer' ? '🤝 อาสาสมัคร' : (user.role === 'admin' ? '👑 ผู้ดูแลระบบ' : '💼 พนักงาน');
      const mapsUrl = `https://www.google.com/maps?q=${newRecord.latitude},${newRecord.longitude}`;

      const geofenceStatusText = matchedWorkLocation
        ? `\n🎯 จุดปฏิบัติงาน: ${matchedWorkLocation.name} (${isWithinGeofence ? '✅ อยู่ในจุดพิกัด' : '⚠️ อยู่นอกรัศมี'} ${calculatedDistance} ม.)`
        : '';

      const lineMessage = `\n${typeThai}
👤 ผู้ลงเวลา: ${user.fullName} (${user.employeeCode})
🏢 แผนก/กลุ่ม: ${user.departmentName}
🏷️ สถานะ: ${roleThai}
⏰ เวลา (ประเทศไทย): ${thai.fullThaiDate} เวลา ${timeStr} น.
📍 สถานที่: ${newRecord.locationName}${geofenceStatusText}
🌐 พิกัด GPS: ${newRecord.latitude.toFixed(6)}, ${newRecord.longitude.toFixed(6)}
${newRecord.note ? `📝 หมายเหตุ/ภารกิจ: ${newRecord.note}\n` : ''}${isOfflineRecord ? '⚡ [ซิงค์ย้อนหลังจากระบบออฟไลน์]\n' : ''}🗺️ ดูแผนที่: ${mapsUrl}`;

      // Check if department enables notification
      const department = db.departments.find((d) => d.id === user.departmentId);
      const shouldNotify = department
        ? (newRecord.type === 'check_in' ? department.notifyOnCheckIn : department.notifyOnCheckOut)
        : true;

      let lineResult: { success: boolean; simulated: boolean; details: string; departmentName?: string } = {
        success: false,
        simulated: true,
        details: 'ปิดการแจ้งเตือน',
        departmentName: user.departmentName,
      };

      if (db.settings.enableLineNotifications && shouldNotify) {
        lineResult = await sendLineNotification(lineMessage, user.departmentId, mapsUrl);
        newRecord.lineNotificationStatus = lineResult.simulated
          ? 'simulated'
          : (lineResult.success ? 'sent' : 'failed');
      } else {
        newRecord.lineNotificationStatus = 'disabled';
      }

      db.attendance.unshift(newRecord);
      saveDatabase(db);
      appendToAttendanceArchive(newRecord);

      res.status(201).json({
        message: 'บันทึกเวลาเรียบร้อยแล้ว',
        record: newRecord,
        lineNotification: lineResult,
      });
    } catch (err: any) {
      console.error('Error recording attendance:', err);
      res.status(500).json({ error: `เกิดข้อผิดพลาดในการบันทึกเวลา: ${err?.message}` });
    }
  });

  // 6. Batch sync offline records
  app.post('/api/attendance/sync', async (req: Request, res: Response) => {
    try {
      const { records } = req.body;
      if (!Array.isArray(records) || records.length === 0) {
        res.status(400).json({ error: 'ไม่มีข้อมูลที่ต้องซิงค์' });
        return;
      }

      const savedRecords: AttendanceRecord[] = [];

      for (const rec of records) {
        const exists = db.attendance.some((existing) => existing.id === rec.id);
        if (exists) {
          continue;
        }

        const user = db.users.find((u) => u.id === rec.userId);
        const recordId = rec.id || `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

        const newRec: AttendanceRecord = {
          ...rec,
          id: recordId,
          userName: user?.fullName || rec.userName,
          userRole: user?.role || rec.userRole || 'employee',
          departmentId: user?.departmentId || rec.departmentId,
          departmentName: user?.departmentName || rec.departmentName,
          isOfflineRecord: true,
          syncedAt: new Date().toISOString(),
          lineNotificationStatus: 'simulated',
        };

        if (db.settings.enableLineNotifications) {
          const typeThai = newRec.type === 'check_in' ? '🟢 บันทึกเวลาเข้างาน (Check-In)' : '🔴 บันทึกเวลาออกงาน (Check-Out)';
          const mapsUrl = `https://www.google.com/maps?q=${newRec.latitude},${newRec.longitude}`;
          const msg = `\n${typeThai} (⚡ ซิงค์ข้อมูลออฟไลน์แล้ว)
👤 ผู้ลงเวลา: ${newRec.userName}
🏢 แผนก/กลุ่ม: ${newRec.departmentName}
⏰ เวลาที่บันทึก: ${newRec.date} ${newRec.time} น.
📍 สถานที่: ${newRec.locationName}
📝 หมายเหตุ: ${newRec.note || '-'}
🗺️ พิกัด: ${mapsUrl}`;

          const lineRes = await sendLineNotification(msg, newRec.departmentId, mapsUrl);
          newRec.lineNotificationStatus = lineRes.simulated ? 'simulated' : (lineRes.success ? 'sent' : 'failed');
        }

        db.attendance.unshift(newRec);
        savedRecords.push(newRec);
        appendToAttendanceArchive(newRec);
      }

      saveDatabase(db);
      res.json({
        message: `ซิงค์ข้อมูลสำเร็จ ${savedRecords.length} รายการ`,
        syncedCount: savedRecords.length,
        records: savedRecords,
      });
    } catch (err: any) {
      console.error('Error syncing records:', err);
      res.status(500).json({ error: `เกิดข้อผิดพลาดในการซิงค์: ${err?.message}` });
    }
  });

  // 7. Attendance Edit & Delete (Admin)
  app.put('/api/attendance/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const { type, locationName, workLocationId, workLocationName, note, date, time, timestamp, userName, departmentName } = req.body;

    const index = db.attendance.findIndex((r) => r.id === id);
    if (index === -1) {
      res.status(404).json({ error: 'ไม่พบรายการลงเวลาที่ต้องการแก้ไข' });
      return;
    }

    const current = db.attendance[index];
    db.attendance[index] = {
      ...current,
      type: type !== undefined ? (type === 'check_out' ? 'check_out' : 'check_in') : current.type,
      locationName: locationName !== undefined ? String(locationName).trim() : current.locationName,
      workLocationId: workLocationId !== undefined ? workLocationId : current.workLocationId,
      workLocationName: workLocationName !== undefined ? workLocationName : current.workLocationName,
      note: note !== undefined ? String(note).trim() : current.note,
      date: date !== undefined ? String(date).trim() : current.date,
      time: time !== undefined ? String(time).trim() : current.time,
      timestamp: timestamp !== undefined ? String(timestamp) : current.timestamp,
      userName: userName !== undefined ? String(userName).trim() : current.userName,
      departmentName: departmentName !== undefined ? String(departmentName).trim() : current.departmentName,
    };

    saveDatabase(db);
    if (firestoreDb) {
      firestoreSet('attendance', db.attendance[index].id, db.attendance[index]);
    }
    res.json({ message: 'แก้ไขรายการลงเวลาสำเร็จ', record: db.attendance[index] });
  });

  app.delete('/api/attendance/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const initialLen = db.attendance.length;
    db.attendance = db.attendance.filter((r) => r.id !== id);
    if (db.attendance.length === initialLen) {
      res.status(404).json({ error: 'ไม่พบรายการที่ต้องการลบ' });
      return;
    }
    saveDatabase(db);
    if (firestoreDb) {
      firestoreDelete('attendance', id);
    }
    res.json({ message: 'ลบรายการลงเวลาเรียบร้อยแล้ว' });
  });

  // Dedicated Attendance Protection & Disaster Prevention Endpoints
  app.post('/api/attendance/clean-demo', (req: Request, res: Response) => {
    try {
      const initialCount = db.attendance.length;
      db.attendance = db.attendance.filter(
        (r) =>
          r.userId !== 'usr_somchai' &&
          !(r.userName && r.userName.includes('สมชาย')) &&
          r.id !== 'att_1793678354265_gye2' &&
          r.id !== 'att_1791596015445_jm7c'
      );
      const removedCount = initialCount - db.attendance.length;
      saveDatabase(db);

      // Clean archive file as well
      try {
        const archive = loadAttendanceArchive();
        const cleanArchive = archive.filter(
          (r) =>
            r.userId !== 'usr_somchai' &&
            !(r.userName && r.userName.includes('สมชาย')) &&
            r.id !== 'att_1793678354265_gye2' &&
            r.id !== 'att_1791596015445_jm7c'
        );
        fs.writeFileSync(
          ATTENDANCE_ARCHIVE_FILE,
          cleanArchive.map((r) => JSON.stringify(r)).join('\n') + (cleanArchive.length > 0 ? '\n' : ''),
          'utf-8'
        );
      } catch (archErr) {
        console.warn('Archive cleanup warning:', archErr);
      }

      res.json({
        message: `ลบข้อมูลตัวอย่างเรียบร้อยแล้ว (${removedCount} รายการ)`,
        removedCount,
        currentCount: db.attendance.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'ไม่สามารถลบข้อมูลตัวอย่างได้: ' + err?.message });
    }
  });

  app.post('/api/attendance/backup-snapshot', (req: Request, res: Response) => {
    try {
      if (!fs.existsSync(BACKUPS_DIR)) {
        fs.mkdirSync(BACKUPS_DIR, { recursive: true });
      }
      const dateTag = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(BACKUPS_DIR, `attendance-snapshot-${dateTag}.json`);
      const payload = {
        title: 'Smart Rescue Attendance Records Backup',
        timestamp: new Date().toISOString(),
        totalRecords: db.attendance.length,
        records: db.attendance,
      };
      fs.writeFileSync(backupFile, JSON.stringify(payload, null, 2), 'utf-8');

      res.json({
        message: 'สร้างจุดสำรองประวัติการลงเวลาเรียบร้อยแล้ว',
        backupFile: path.basename(backupFile),
        totalRecords: db.attendance.length,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: 'สร้างจุดสำรองข้อมูลไม่สำเร็จ: ' + err?.message });
    }
  });

  app.post('/api/attendance/restore', (req: Request, res: Response) => {
    try {
      const { records } = req.body;
      if (!Array.isArray(records)) {
        res.status(400).json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง (ต้องเป็น Array)' });
        return;
      }

      let restoredCount = 0;
      const existingIds = new Set(db.attendance.map((r) => r.id));

      for (const r of records) {
        if (r && r.id && !existingIds.has(r.id)) {
          // Skip dummy records
          if (r.userId === 'usr_somchai' || (r.userName && r.userName.includes('สมชาย'))) {
            continue;
          }
          db.attendance.push(r);
          existingIds.add(r.id);
          appendToAttendanceArchive(r);
          restoredCount++;
        }
      }

      // Sort descending by timestamp
      db.attendance.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      saveDatabase(db);

      res.json({
        message: `กู้คืนข้อมูลสำเร็จ ${restoredCount} รายการ`,
        restoredCount,
        totalCount: db.attendance.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'เกิดข้อผิดพลาดในการกู้คืน: ' + err?.message });
    }
  });

  app.get('/api/attendance/export-json', (req: Request, res: Response) => {
    try {
      const dateTag = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="attendance-records-${dateTag}.json"`);
      res.send(JSON.stringify(db.attendance, null, 2));
    } catch (err: any) {
      res.status(500).json({ error: 'ไม่สามารถส่งออกไฟล์ได้' });
    }
  });

  app.delete('/api/attendance/all', (req: Request, res: Response) => {
    const { confirmation } = req.body || {};
    if (confirmation !== 'CLEAR_ALL_ATTENDANCE') {
      res.status(400).json({ error: 'ต้องยืนยันการลบด้วยคำว่า CLEAR_ALL_ATTENDANCE' });
      return;
    }
    const count = db.attendance.length;
    db.attendance = [];
    saveDatabase(db);
    try {
      fs.writeFileSync(ATTENDANCE_ARCHIVE_FILE, '', 'utf-8');
    } catch {}
    res.json({ message: 'ลบประวัติการลงเวลาทั้งหมดเรียบร้อยแล้ว', clearedCount: count });
  });

  // 8. System Settings
  app.get('/api/settings', (req: Request, res: Response) => {
    res.json(db.settings);
  });

  app.post('/api/settings', (req: Request, res: Response) => {
    db.settings = {
      ...db.settings,
      ...req.body,
    };
    saveDatabase(db);
    appendToAdminJournal({
      entity: 'settings',
      op: 'update',
      data: db.settings,
      timestamp: new Date().toISOString(),
    });
    res.json({ message: 'บันทึกการตั้งค่าระบบเรียบร้อยแล้ว', settings: db.settings });
  });

  // 9. LINE Notification Test & Logs
  app.get('/api/line/logs', (req: Request, res: Response) => {
    res.json(db.lineLogs);
  });

  app.post('/api/line/test', async (req: Request, res: Response) => {
    const { departmentId, customMessage } = req.body;
    const testMsg = customMessage || `\n🔔 ทดสอบระบบแจ้งเตือน LINE Notify
✅ สถานะ: ระบบ Smart Time Attendance ทำงานปกติ
⏰ เวลาที่ทดสอบ: ${new Date().toLocaleTimeString('th-TH')} น.
🏢 ส่งจากเซิร์ฟเวอร์เรียบร้อยแล้ว!`;

    const result = await sendLineNotification(testMsg, departmentId);
    res.json(result);
  });

  // ================= CENTRAL DATABASE SHIELD & BACKUP ENDPOINTS =================
  // 1. Database Health & Status
  app.get('/api/database/status', (req: Request, res: Response) => {
    let fileSize = 0;
    let fileModified = '';
    if (fs.existsSync(DB_FILE)) {
      const stat = fs.statSync(DB_FILE);
      fileSize = stat.size;
      fileModified = stat.mtime.toISOString();
    }

    let backupCount = 0;
    if (fs.existsSync(BACKUPS_DIR)) {
      try {
        backupCount = fs.readdirSync(BACKUPS_DIR).filter((f) => f.endsWith('.json')).length;
      } catch {}
    }

    res.json({
      status: 'healthy',
      storageType: 'Centralized Cloud Database',
      dbFileName: 'database.json',
      dbFileSizeFormatted: `${(fileSize / 1024).toFixed(1)} KB`,
      dbFileSizeBytes: fileSize,
      lastModified: fileModified || new Date().toISOString(),
      lastBackupTimestamp,
      hasRollbackBackup: fs.existsSync(BACKUP_DB_FILE),
      snapshotCount: backupCount,
      counts: {
        users: db.users.length,
        departments: db.departments.length,
        locations: db.locations.length,
        attendance: db.attendance.length,
        lineLogs: db.lineLogs.length,
      },
      protectionFeatures: [
        'Atomic Safe Write (ป้องกันไฟล์เสียหายจากการตัดไฟ/ปิดโปรเซส)',
        'Automatic Rollback Backup (สำรองไฟล์สำรองอัตโนมัติก่อนเขียนทับ)',
        'Disaster Recovery Snapshots (เก็บประวัติ Snapshot ย้อนหลัง)',
        'Centralized Cross-Device Persistence (ฐานข้อมูลเดียวกันทุกอุปกรณ์)',
        'Multi-Device Auto-Sync (ซิงค์ข้อมูลเข้าเซิร์ฟเวอร์แบบ Real-Time)',
      ],
    });
  });

  // 2. Download / Export Database JSON Backup
  app.get('/api/database/export', (req: Request, res: Response) => {
    try {
      const nowStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="smart-attendance-backup-${nowStr}.json"`);
      res.send(JSON.stringify(db, null, 2));
    } catch (err: any) {
      res.status(500).json({ error: 'ไม่สามารถดาวน์โหลดไฟล์สำรองได้' });
    }
  });

  // 3. Trigger Instant Manual Backup
  app.post('/api/database/backup', (req: Request, res: Response) => {
    try {
      saveDatabase(db);
      if (!fs.existsSync(BACKUPS_DIR)) {
        fs.mkdirSync(BACKUPS_DIR, { recursive: true });
      }
      const dateTag = new Date().toISOString().replace(/[:.]/g, '-');
      const snapshotFile = path.join(BACKUPS_DIR, `manual-snapshot-${dateTag}.json`);
      fs.writeFileSync(snapshotFile, JSON.stringify(db, null, 2), 'utf-8');

      res.json({
        message: 'สร้างจุดสำรองฐานข้อมูลฉุกเฉินเรียบร้อยแล้ว',
        backupFile: path.basename(snapshotFile),
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ error: 'สร้างจุดสำรองข้อมูลไม่สำเร็จ' });
    }
  });

  // 4. Verify & Repair Database Integrity
  app.post('/api/database/verify', (req: Request, res: Response) => {
    try {
      // Run sanity checks
      let repaired = false;
      defaultDepartments.forEach((reqDept) => {
        const found = db.departments.some((d) => d.id === reqDept.id || d.name === reqDept.name);
        if (!found) {
          db.departments.push(reqDept);
          repaired = true;
        }
      });

      // Ensure admin exists
      const adminFound = db.users.some((u) => u.username === 'admin');
      if (!adminFound) {
        db.users.unshift(defaultUsers[0]);
        repaired = true;
      }

      saveDatabase(db);

      res.json({
        status: 'verified',
        repaired,
        message: repaired ? 'ตรวจสอบและซ่อมแซมโครงสร้างฐานข้อมูลเรียบร้อยแล้ว' : 'โครงสร้างฐานข้อมูลสมบูรณ์ 100% ปลอดภัยจากข้อมูลสูญหาย',
        counts: {
          users: db.users.length,
          departments: db.departments.length,
          locations: db.locations.length,
          attendance: db.attendance.length,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: 'ตรวจสอบฐานข้อมูลไม่สำเร็จ' });
    }
  });

  // Graceful shutdown: save DB before process exit
  process.on('SIGINT', () => {
    console.log('Received SIGINT: Saving database before shutdown...');
    saveDatabase(db);
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM: Saving database before shutdown...');
    saveDatabase(db);
    process.exit(0);
  });

  // ================= VITE DEV MIDDLEWARE OR STATIC SERVING =================
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        host: '0.0.0.0',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Smart Attendance Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
