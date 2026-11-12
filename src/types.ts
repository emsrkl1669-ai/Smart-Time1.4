export type Role = 'admin' | 'employee' | 'volunteer';

export type AttendanceType = 'check_in' | 'check_out';

export interface WorkLocation {
  id: string;
  name: string;           // ชื่อตำแหน่ง/จุดปฏิบัติงาน เช่น "ศูนย์สั่งการกู้ชีพ-กู้ภัย 1669 (สำนักงานใหญ่)"
  code: string;           // รหัสจุด เช่น "LOC-HQ", "LOC-EMS-01"
  address: string;        // ที่อยู่หรือจุดสังเกต
  latitude: number;       // ละติจูด
  longitude: number;      // ลองจิจูด
  radiusMeters: number;   // รัศมีที่อนุญาตลงเวลา (เมตร) เช่น 200
  departmentId?: string;  // 'all' หรือ id แผนกที่เกี่ยวข้อง
  departmentName?: string;
  isActive: boolean;
  createdAt: string;
}

export interface User {
  id: string;
  username: string;
  password?: string;
  fullName: string;
  role: Role;
  departmentId: string;
  departmentName: string;
  position: string;
  assignedLocationId?: string; // จุดปฏิบัติงานที่กำหนด
  assignedLocationName?: string;
  phoneNumber: string;
  employeeCode: string;
  avatarUrl?: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  color: string;
  description: string;
  lineNotifyToken?: string; // Token เฉพาะกลุ่ม LINE ของแผนกนี้
  notifyOnCheckIn: boolean;
  notifyOnCheckOut: boolean;
  memberCount?: number;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  userRole: Role;
  departmentId: string;
  departmentName: string;
  type: AttendanceType;
  timestamp: string; // ISO String
  date: string;      // YYYY-MM-DD (Asia/Bangkok)
  time: string;      // HH:mm:ss (Asia/Bangkok)
  photo: string;     // Base64 selfie image
  latitude: number;
  longitude: number;
  accuracy?: number;
  locationName: string;
  workLocationId?: string;
  workLocationName?: string;
  isWithinGeofence?: boolean;
  distanceFromLocationMeters?: number;
  note?: string;     // สำหรับอาสาสมัคร: ภารกิจจิตอาสา / สำหรับพนักงาน: หมายเหตุ
  isOfflineRecord?: boolean;
  syncedAt?: string;
  lineNotificationStatus: 'sent' | 'simulated' | 'failed' | 'disabled';
  lineTargetDepartment?: string;
  ipAddress?: string;
  deviceOs?: 'ios' | 'android' | 'desktop' | 'unknown';
}

export interface SystemSettings {
  companyName: string;
  defaultLineToken: string;
  enableLineNotifications: boolean;
  standardCheckInTime: string; // e.g. "08:30"
  standardCheckOutTime: string; // e.g. "17:30"
  allowOfflineCheckIn: boolean;
  requirePhotoOnCheckIn: boolean;
  requireLocationOnCheckIn: boolean;
  enforceLocationGeofence?: boolean; // บังคับต้องอยู่ในรัศมีจุดปฏิบัติงานหรือไม่
}

export interface LineNotificationLog {
  id: string;
  timestamp: string;
  recipientDepartment: string;
  tokenUsed: string; // masked
  type: AttendanceType;
  userName: string;
  message: string;
  status: 'sent' | 'simulated' | 'failed';
  responseDetails?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

// 9 Required Rescue & Organization Departments
export const STANDARD_DEPARTMENTS: {
  id: string;
  name: string;
  code: string;
  color: string;
  description: string;
}[] = [
  { id: 'dep_ems_rescue', name: 'กู้ชีพ-กู้ภัย', code: 'EMS', color: '#ef4444', description: 'งานกู้ชีพฉุกเฉิน ปฐมพยาบาล และกู้ภัยทางการแพทย์' },
  { id: 'dep_rescue', name: 'กู้ภัย', code: 'RESCUE', color: '#f97316', description: 'งานบรรเทาสาธารณภัย อุบัติเหตุ ค้นหาและช่วยชีวิต' },
  { id: 'dep_social_welfare', name: 'สังคมสงเคราะห์', code: 'SOC', color: '#059669', description: 'ช่วยเหลือผู้ยากไร้ แจกจ่ายสิ่งของและสงเคราะห์ชุมชน' },
  { id: 'dep_admin_mgmt', name: 'บริหาร', code: 'ADM', color: '#4f46e5', description: 'บริหารงานองค์กร บุคลากร และงานสารบรรณ' },
  { id: 'dep_accounting', name: 'บัญชี', code: 'ACC', color: '#0284c7', description: 'งานบัญชี การเงิน และการจัดซื้อจัดจ้าง' },
  { id: 'dep_donation', name: 'บริจาค', code: 'DON', color: '#ec4899', description: 'งานรับบริจาค จัดการกองทุน และออกใบเสร็จสมทบทุน' },
  { id: 'dep_security', name: 'รปภ.', code: 'SEC', color: '#475569', description: 'งานรักษาความปลอดภัยและการจราจรสถานที่' },
  { id: 'dep_housekeeping', name: 'แม่บ้าน', code: 'CLN', color: '#14b8a6', description: 'งานดูแลความสะอาด สุขอนามัย และสถานที่' },
  { id: 'dep_general', name: 'ทั่วไป', code: 'GEN', color: '#6b7280', description: 'งานสนับสนุนทั่วไป ภารกิจประสานงาน และอื่นๆ' },
];
