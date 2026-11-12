import React, { useState, useEffect } from 'react';
import { User, Department, Role, WorkLocation } from '../types';
import {
  Users,
  UserPlus,
  Trash2,
  Edit,
  Shield,
  Briefcase,
  HeartHandshake,
  Search,
  Building2,
  Phone,
  Key,
  X,
  Check,
  PlusCircle,
  Tag,
  AlertCircle,
  MapPin,
  Sparkles,
  Copy,
  Database,
  Smartphone,
  Lock,
  Eye,
  EyeOff,
  QrCode,
  Share2,
  UploadCloud,
  Download,
  FileSpreadsheet,
} from 'lucide-react';
import { api } from '../services/api';

interface AdminUserManagementProps {
  users: User[];
  departments: Department[];
  locations?: WorkLocation[];
  onRefresh: () => void;
  onShareUser?: (user: User) => void;
}

// 9 Required Departments in Exact Order
export const STANDARD_DEPARTMENTS: { id: string; name: string; code: string; color: string; description: string }[] = [
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

// Presets for positions (Admin สามารถกำหนดตำแหน่งได้เองอย่างอิสระ)
export const POSITION_PRESETS = [
  'เจ้าหน้าที่กู้ชีพฉุกเฉิน (EMT / AEMT)',
  'พลขับรถพยาบาล / รถกู้ชีพ',
  'เจ้าหน้าที่กู้ภัยและตัดถ่าง',
  'เจ้าหน้าที่วิทยุสื่อสารและศูนย์สั่งการ 1669',
  'เจ้าหน้าที่สังคมสงเคราะห์',
  'ผู้จัดการฝ่ายบริหาร',
  'เจ้าหน้าที่บัญชีและการเงิน',
  'เจ้าหน้าที่จุดรับบริจาค',
  'เจ้าหน้าที่รักษาความปลอดภัย (รปภ.)',
  'พนักงานดูแลสถานที่ (แม่บ้าน)',
  'อาสาสมัครกู้ภัยประจำจุด',
  'หัวหน้าชุดปฏิบัติการ',
  'เจ้าหน้าที่ประสานงานทั่วไป',
];

export const AdminUserManagement: React.FC<AdminUserManagementProps> = ({
  users,
  departments,
  locations = [],
  onRefresh,
  onShareUser,
}) => {
  // Always guarantee the 9 required departments in order, merged with custom ones
  const allDepartments = React.useMemo(() => {
    const list: Department[] = [];
    const addedNames = new Set<string>();

    // 1. First add the 9 standard departments
    STANDARD_DEPARTMENTS.forEach((std) => {
      const existing = departments.find((d) => d.id === std.id || d.name === std.name);
      list.push(
        existing || {
          id: std.id,
          name: std.name,
          code: std.code,
          color: std.color,
          description: std.description,
          lineNotifyToken: '',
          notifyOnCheckIn: true,
          notifyOnCheckOut: true,
        }
      );
      addedNames.add(std.name);
    });

    // 2. Append any extra custom departments created by Admin
    departments.forEach((d) => {
      if (!addedNames.has(d.name)) {
        list.push(d);
        addedNames.add(d.name);
      }
    });

    return list;
  }, [departments]);

  const [activeTab, setActiveTab] = useState<'users' | 'departments'>('users');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');

  // User Modals
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userFormData, setUserFormData] = useState({
    username: '',
    password: '',
    fullName: '',
    role: 'employee' as Role,
    departmentId: 'dep_ems_rescue',
    position: '',
    assignedLocationId: '',
    phoneNumber: '',
    employeeCode: '',
    status: 'active' as 'active' | 'inactive',
  });

  // Department Modals
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptFormData, setDeptFormData] = useState({
    name: '',
    code: '',
    color: '#0284c7',
    description: '',
    lineNotifyToken: '',
    notifyOnCheckIn: true,
    notifyOnCheckOut: true,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // User passwords and credentials distribution (Central Database)
  const [passwordsMap, setPasswordsMap] = useState<Record<string, string>>({});
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);
  const [copiedToast, setCopiedToast] = useState<string | null>(null);
  const [resetModalUser, setResetModalUser] = useState<User | null>(null);
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});

  // CSV Import/Export Modal states
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [csvTextContent, setCsvTextContent] = useState('');
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [csvPreviewRows, setCsvPreviewRows] = useState<any[]>([]);

  const handleExportUsersCsv = () => {
    const headers = ['ลำดับ', 'รหัสพนักงาน', 'ชื่อ-นามสกุล', 'สิทธิ์/บทบาท', 'กลุ่ม/แผนก', 'ตำแหน่ง', 'เบอร์โทรศัพท์', 'Username', 'รหัสผ่าน', 'จุดปฏิบัติงาน'];
    const rows = users.map((u, i) => {
      const pw = passwordsMap[u.id] || (u.username === 'admin' ? 'admin123' : '123456');
      const roleThai = u.role === 'admin' ? 'ผู้ดูแลระบบ' : u.role === 'volunteer' ? 'อาสาสมัคร' : 'พนักงาน';
      return [
        i + 1,
        `"${u.employeeCode || ''}"`,
        `"${u.fullName}"`,
        `"${roleThai}"`,
        `"${u.departmentName || ''}"`,
        `"${u.position || ''}"`,
        `"${u.phoneNumber || ''}"`,
        `"${u.username}"`,
        `"${pw}"`,
        `"${u.assignedLocationName || ''}"`,
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `smart_attendance_users_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const parseCsvPreview = (text: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const parsed = [];
    for (const line of lines) {
      const row: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') inQuotes = !inQuotes;
        else if (c === ',' && !inQuotes) {
          row.push(cur.trim());
          cur = '';
        } else cur += c;
      }
      row.push(cur.trim());
      if (row.length >= 2) {
        parsed.push(row);
      }
    }
    setCsvPreviewRows(parsed);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) {
        setCsvTextContent(text);
        parseCsvPreview(text);
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleCommitCsvImport = async () => {
    if (csvPreviewRows.length === 0) return;
    setIsImportingCsv(true);
    try {
      const staffUsernames: Record<number, { username: string; code: string }> = {
        1: { username: 'sataporn', code: '01' },
        2: { username: 'admin', code: '03' },
        3: { username: 'aleena', code: '04' },
        4: { username: 'bantitta', code: '05' },
        5: { username: 'mueanruethai', code: '06' },
        6: { username: 'chayanit', code: '07' },
        7: { username: 'sakorn', code: '001' },
        8: { username: 'surachai403', code: '003-403' },
        9: { username: 'prasert', code: '004-401' },
        10: { username: 'wuttichai402', code: '006-402' },
        11: { username: 'narapong402', code: '402' },
        12: { username: 'kritsada404', code: '005-404' },
        13: { username: 'sutthiphong401', code: '404' },
        14: { username: 'sitthisak405', code: '007-405' },
        15: { username: 'thanakorn405', code: '405' },
        16: { username: 'anan403', code: '403' },
        17: { username: 'samart401', code: '401' },
        18: { username: 'phitsamai', code: '07' },
        19: { username: 'kanokwan', code: '06' },
        20: { username: 'boonmee', code: '08' },
        21: { username: 'yongyos', code: '09' },
        22: { username: 'surapol400', code: '400' },
        23: { username: 'chayanan404', code: '404' },
      };

      const payload = csvPreviewRows.map((row) => {
        const num = parseInt(row[0], 10);
        const fullName = (row[1] || '').replace(/\s+/g, ' ').trim();
        let code = '';
        let position = '';
        let phone = '';

        if (num <= 23 && row.length >= 5) {
          code = (row[2] || '').trim();
          position = (row[3] || '').replace(/\s+/g, ' ').trim();
          phone = (row[4] || '').trim();
        } else {
          position = (row[2] || '').replace(/\s+/g, ' ').trim();
          phone = (row[3] || '').trim();
          const matchCallsign = position.match(/\d{3}/);
          code = matchCallsign ? matchCallsign[0] : String(num);
        }

        const digits = phone.replace(/\D/g, '');
        if (digits.length >= 10) {
          const d = digits.substring(0, 10);
          phone = `${d.substring(0, 3)}-${d.substring(3, 6)}-${d.substring(6)}`;
        } else if (digits.length === 9) {
          phone = `${digits.substring(0, 2)}-${digits.substring(2, 5)}-${digits.substring(5)}`;
        }

        let departmentId = 'dep_ems_rescue';
        let departmentName = 'กู้ชีพ-กู้ภัย';

        if (position.includes('บัญชี') || position.includes('การเงิน')) {
          departmentId = 'dep_accounting';
          departmentName = 'บัญชี';
        } else if (position.includes('รับบริจาค')) {
          departmentId = 'dep_donation';
          departmentName = 'บริจาค';
        } else if (position.includes('แม่บ้าน')) {
          departmentId = 'dep_housekeeping';
          departmentName = 'แม่บ้าน';
        } else if (position.includes('รักษาความปลอดภัย') || position.includes('รปภ')) {
          departmentId = 'dep_security';
          departmentName = 'รปภ.';
        } else if (position.includes('ขับรถบริการ') || position.includes('สโตร์')) {
          departmentId = 'dep_general';
          departmentName = 'ทั่วไป';
        } else if (position.includes('สังคมสงเคราะห์') || position.includes('สารสนเทศ')) {
          departmentId = 'dep_social_welfare';
          departmentName = 'สังคมสงเคราะห์';
        } else if (position.includes('กู้ภัย') && !position.includes('กู้ชีพ')) {
          departmentId = 'dep_rescue';
          departmentName = 'กู้ภัย';
        }

        let role: Role = 'employee';
        let username = '';
        let employeeCode = code;

        if (num === 2 || fullName.includes('กริชพิพัฒน์')) {
          role = 'admin';
          username = 'admin';
          employeeCode = code || '03';
        } else if (num >= 24) {
          role = 'volunteer';
          const matchCallsign = position.match(/\d{3}/);
          const callsign = matchCallsign ? matchCallsign[0] : num;
          username = `vol${callsign}`;
          employeeCode = `VOL-${callsign}`;
        } else if (staffUsernames[num]) {
          role = 'employee';
          username = staffUsernames[num].username;
          employeeCode = code || staffUsernames[num].code;
        } else {
          role = 'employee';
          username = `user${num || Math.floor(100 + Math.random() * 900)}`;
          employeeCode = `EMP-${String(num || 1).padStart(3, '0')}`;
        }

        return {
          fullName,
          position,
          phoneNumber: phone,
          departmentId,
          departmentName,
          role,
          username,
          employeeCode,
          password: '123456',
        };
      });

      const res = await api.batchImportUsers(payload);
      setCopiedToast(res.message);
      setIsCsvImportOpen(false);
      setCsvTextContent('');
      setCsvPreviewRows([]);
      onRefresh();
    } catch (err: any) {
      alert(`นำเข้าไม่สำเร็จ: ${err.message}`);
    } finally {
      setIsImportingCsv(false);
    }
  };

  const loadPasswords = async () => {
    try {
      const list = await api.getUsersWithPasswords();
      const map: Record<string, string> = {};
      list.forEach((u) => {
        if (u.id && (u as any).password) {
          map[u.id] = (u as any).password;
        }
      });
      setPasswordsMap(map);
    } catch (e) {
      console.warn('Could not load passwords', e);
    }
  };

  useEffect(() => {
    loadPasswords();
  }, [users]);

  const handleCopyCredentials = (user: User) => {
    const pw = passwordsMap[user.id] || (user.username === 'admin' ? 'admin123' : '123456');
    const personalUrl = `${window.location.origin}?u=${encodeURIComponent(user.username)}`;
    const text = `🔐 ข้อมูลเข้าใช้งานระบบ Smart Time Attendance (ความลับเฉพาะบุคคล)\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 ชื่อ-นามสกุล: ${user.fullName}\n` +
      `🏢 ฝ่าย/สังกัด: ${user.departmentName}\n` +
      `💼 ตำแหน่ง: ${user.position || '-'}\n` +
      `🪪 รหัสพนักงาน: ${user.employeeCode}\n\n` +
      `🆔 ชื่อผู้ใช้งาน (Username): ${user.username}\n` +
      `🔑 รหัสผ่าน (Password): ${pw}\n\n` +
      `🌐 ลิงก์เข้าใช้งานระบบ: ${personalUrl}\n` +
      `(คลิกลิงก์เพื่อเปิดหน้าระบบและกรอกชื่อผู้ใช้ให้อัตโนมัติ สามารถเข้าใช้งานได้จากทุกเครื่อง ทุกอุปกรณ์)\n\n` +
      `⚠️ คำเตือนความปลอดภัย: ข้อมูลนี้เป็นความลับเฉพาะตัวบุคคล กรุณาอย่าส่งต่อให้ผู้อื่น เพื่อความโปร่งใสและถูกต้องของข้อมูลการลงเวลาทำงาน\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    navigator.clipboard.writeText(text);
    setCopiedUserId(user.id);
    setCopiedToast(`คัดลอกข้อมูลและรหัสผ่านของ "${user.fullName}" เรียบร้อยแล้ว สามารถส่งต่อใน LINE ได้ทันที`);
    setTimeout(() => {
      setCopiedUserId(null);
      setCopiedToast(null);
    }, 3500);
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalUser || !resetPasswordInput.trim()) return;
    try {
      setIsLoading(true);
      await api.resetUserPassword(resetModalUser.id, resetPasswordInput.trim());
      await loadPasswords();
      setResetModalUser(null);
      setResetPasswordInput('');
      setCopiedToast(`เปลี่ยนรหัสผ่านของ "${resetModalUser.fullName}" สำเร็จ`);
      setTimeout(() => setCopiedToast(null), 3000);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'รีเซ็ตรหัสผ่านไม่สำเร็จ');
    } finally {
      setIsLoading(false);
    }
  };

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    const matchesQuery =
      u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.employeeCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.phoneNumber.includes(searchQuery) ||
      (u.position && u.position.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesRole = filterRole === 'all' || u.role === filterRole;
    const matchesDept = filterDepartment === 'all' || u.departmentId === filterDepartment;

    return matchesQuery && matchesRole && matchesDept;
  });

  // Open Add User
  const handleOpenAddUser = () => {
    setUserFormData({
      username: '',
      password: '',
      fullName: '',
      role: 'employee',
      departmentId: allDepartments[0]?.id || 'dep_ems_rescue',
      position: '',
      assignedLocationId: '',
      phoneNumber: '',
      employeeCode: `EMP-${Math.floor(100 + Math.random() * 900)}`,
      status: 'active',
    });
    setErrorMsg(null);
    setIsAddUserOpen(true);
  };

  // Open Edit User
  const handleOpenEditUser = (user: User) => {
    setEditingUser(user);
    setUserFormData({
      username: user.username,
      password: '', // Leave blank if no change
      fullName: user.fullName,
      role: user.role,
      departmentId: user.departmentId || allDepartments[0]?.id || 'dep_ems_rescue',
      position: user.position || '',
      assignedLocationId: user.assignedLocationId || '',
      phoneNumber: user.phoneNumber || '',
      employeeCode: user.employeeCode || '',
      status: user.status || 'active',
    });
    setErrorMsg(null);
  };

  // Save User (Create or Update)
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    try {
      if (editingUser) {
        // Update
        const payload: any = { ...userFormData };
        if (!payload.password) delete payload.password; // Do not overwrite if blank

        const updated = await api.updateUser(editingUser.id, payload);
        setEditingUser(null);
        setCopiedToast(`อัปเดตข้อมูลของ "${updated.fullName}" ในฐานข้อมูลกลางสำเร็จแล้ว (มีผลทันทีทุกอุปกรณ์)`);
        setTimeout(() => setCopiedToast(null), 4000);
      } else {
        // Create
        if (!userFormData.password) {
          throw new Error('กรุณากำหนดรหัสผ่านสำหรับผู้ใช้งานใหม่');
        }
        const created = await api.createUser(userFormData);
        setIsAddUserOpen(false);
        setCopiedToast(`เพิ่มผู้ใช้งาน "${created.fullName}" สำเร็จแล้ว`);
        setTimeout(() => setCopiedToast(null), 4000);
      }
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setIsLoading(false);
    }
  };

  // Delete User
  const handleDeleteUser = async (user: User) => {
    if (user.username === 'admin') {
      alert('ไม่สามารถลบบัญชีผู้ดูแลระบบหลัก (Admin) ได้');
      return;
    }
    const confirmed = window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้งาน "${user.fullName}"? ข้อมูลการลงเวลาจะไม่หายไป`);
    if (!confirmed) return;

    try {
      await api.deleteUser(user.id);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'ไม่สามารถลบผู้ใช้งานได้');
    }
  };

  // Open Add Dept
  const handleOpenAddDept = () => {
    setEditingDept(null);
    setDeptFormData({
      name: '',
      code: '',
      color: '#0284c7',
      description: '',
      lineNotifyToken: '',
      notifyOnCheckIn: true,
      notifyOnCheckOut: true,
    });
    setErrorMsg(null);
    setIsDeptModalOpen(true);
  };

  // Open Edit Dept
  const handleOpenEditDept = (dept: Department) => {
    setEditingDept(dept);
    setDeptFormData({
      name: dept.name,
      code: dept.code,
      color: dept.color,
      description: dept.description,
      lineNotifyToken: dept.lineNotifyToken || '',
      notifyOnCheckIn: dept.notifyOnCheckIn,
      notifyOnCheckOut: dept.notifyOnCheckOut,
    });
    setErrorMsg(null);
    setIsDeptModalOpen(true);
  };

  // Save Department
  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    try {
      await api.saveDepartment({
        id: editingDept ? editingDept.id : undefined,
        ...deptFormData,
      });
      setIsDeptModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูลแผนก');
    } finally {
      setIsLoading(false);
    }
  };

  // Delete Department
  const handleDeleteDept = async (dept: Department) => {
    if (!window.confirm(`คุณต้องการลบแผนก "${dept.name}" ใช่หรือไม่?`)) return;
    try {
      await api.deleteDepartment(dept.id);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'ไม่สามารถลบแผนกได้');
    }
  };

  return (
    <div className="space-y-5">
      {/* Tab Switcher & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'users'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>จัดการผู้ใช้งาน ({users.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('departments')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'departments'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>จัดการ 9 หน่วยงาน & LINE Token ({allDepartments.length})</span>
          </button>
        </div>

        {activeTab === 'users' ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportUsersCsv}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs sm:text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
              title="ส่งออกรายชื่อและรหัสผ่านทั้งหมดเป็นไฟล์ CSV สำหรับ Excel"
            >
              <Download className="w-4 h-4 text-slate-600" />
              <span>ส่งออก CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setIsCsvImportOpen(true)}
              className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs sm:text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
              title="นำเข้าไฟล์ CSV รายชื่อบุคลากร"
            >
              <UploadCloud className="w-4 h-4 text-indigo-600" />
              <span>นำเข้า CSV</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAddUser}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition shadow-xs active:scale-95 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>เพิ่มผู้ใช้งานใหม่</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleOpenAddDept}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs sm:text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition shadow-xs active:scale-95 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>เพิ่มกลุ่ม/แผนกใหม่</span>
          </button>
        )}
      </div>

      {/* TAB 1: USERS LIST */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          {/* Filters Bar */}
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="ค้นหาตามชื่อ, Username, รหัสพนักงาน, ตำแหน่ง หรือเบอร์โทร..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm bg-white rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex gap-2">
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="px-3 py-2 text-xs sm:text-sm bg-white rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700"
              >
                <option value="all">ทุกสิทธิ์ / ทุกบทบาท</option>
                <option value="admin">👑 ผู้ดูแลระบบ (Admin)</option>
                <option value="employee">💼 พนักงาน (Employee)</option>
                <option value="volunteer">🤝 อาสาสมัคร (Volunteer)</option>
              </select>

              <select
                value={filterDepartment}
                onChange={(e) => setFilterDepartment(e.target.value)}
                className="px-3 py-2 text-xs sm:text-sm bg-white rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 max-w-[200px]"
              >
                <option value="all">ทุกกลุ่ม / แผนก</option>
                {allDepartments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Centralized Cloud Database Banner */}
          <div className="m-4 p-3.5 bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 border border-emerald-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-start gap-2.5">
              <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-xs mt-0.5 shrink-0">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">
                    ฐานข้อมูลกลางเชื่อมต่อทุกอุปกรณ์ (Centralized Database)
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-semibold rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    ออนไลน์ Real-Time
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  บัญชีผู้ใช้งานที่ Admin สร้างหรือแก้ไขที่นี่ สามารถนำ <b>Username</b> และ <b>รหัสผ่าน</b> ไปลงชื่อเข้าใช้ (Login) และลงเวลาปฏิบัติงานได้ทันทีจากโทรศัพท์มือถือ iPhone, Android, แท็บเล็ต หรือคอมพิวเตอร์ทุกเครื่อง โดยเป็นฐานข้อมูลเดียวกัน
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onShareUser && (
                <button
                  type="button"
                  onClick={() => {
                    if (users.length > 0) {
                      onShareUser(users[0]);
                    }
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-2xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                  title="เปิดหน้าต่าง QR Code และบัตรข้อมูลเข้าใช้งานสำหรับแชร์ต่อ"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>แชร์ลิงก์ & QR Code</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const link = window.location.origin;
                  navigator.clipboard.writeText(link);
                  setCopiedToast(`คัดลอกลิงก์ระบบแล้ว: ${link}\nสามารถส่งต่อให้บุคลากรใน LINE เพื่อเปิดบนมือถือได้ทันที`);
                  setTimeout(() => setCopiedToast(null), 3500);
                }}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-indigo-700 text-xs font-semibold rounded-xl border border-indigo-200 shadow-2xs flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                <span>คัดลอกลิงก์ระบบ</span>
              </button>
            </div>
          </div>

          {copiedToast && (
            <div className="mx-4 mb-3 p-3 bg-emerald-600 text-white text-xs rounded-xl shadow-md flex items-center justify-between gap-2 animate-in fade-in">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{copiedToast}</span>
              </div>
              <button
                type="button"
                onClick={() => setCopiedToast(null)}
                className="text-emerald-100 hover:text-white text-xs font-bold px-2 py-0.5 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-100/70 text-slate-600 font-semibold border-b border-slate-200">
                  <th className="py-3 px-4">ผู้ใช้งาน</th>
                  <th className="py-3 px-4">ข้อมูลเข้าระบบ (Username / รหัสผ่าน)</th>
                  <th className="py-3 px-4">สิทธิ์ / บทบาท</th>
                  <th className="py-3 px-4">แผนก / สังกัด (9 หน่วยงาน)</th>
                  <th className="py-3 px-4">ตำแหน่งงาน</th>
                  <th className="py-3 px-4">จุดปฏิบัติงานประจำ</th>
                  <th className="py-3 px-4">เบอร์โทร</th>
                  <th className="py-3 px-4">สถานะ</th>
                  <th className="py-3 px-4 text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      ไม่พบข้อมูลผู้ใช้งานที่ตรงตามเงื่อนไข
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    const isVolunteer = user.role === 'volunteer';
                    const isAdmin = user.role === 'admin';
                    return (
                      <tr key={user.id} className="hover:bg-slate-50/70 transition">
                        {/* Name & Username */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{user.fullName}</div>
                          <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                            <span className="text-slate-600">{user.employeeCode}</span>
                          </div>
                        </td>

                        {/* Credentials Column for Multi-device login */}
                        <td className="py-3 px-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 font-mono text-xs font-semibold text-slate-800">
                              <span className="text-indigo-600 font-bold">@{user.username}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                              <span className="text-slate-400 font-mono text-[10px]">PASS:</span>
                              <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 text-[10px]">
                                {showPasswordMap[user.id]
                                  ? (passwordsMap[user.id] || (user.username === 'admin' ? 'admin123' : '123456'))
                                  : '••••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setShowPasswordMap((prev) => ({ ...prev, [user.id]: !prev[user.id] }))
                                }
                                className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                                title={showPasswordMap[user.id] ? 'ซ่อนรหัสผ่าน' : 'ดูรหัสผ่าน'}
                              >
                                {showPasswordMap[user.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </button>
                            </div>
                            <div className="flex items-center gap-1 mt-1">
                              <button
                                type="button"
                                onClick={() => handleCopyCredentials(user)}
                                className="text-[10px] text-indigo-700 hover:text-indigo-900 font-semibold flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-md transition cursor-pointer"
                                title="คัดลอก Username, รหัสผ่าน และลิงก์สำหรับส่งต่อให้ผู้ใช้ใน LINE"
                              >
                                {copiedUserId === user.id ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    <span className="text-emerald-700 font-bold">คัดลอกแล้ว</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>คัดลอกรหัส</span>
                                  </>
                                )}
                              </button>
                              {onShareUser && (
                                <button
                                  type="button"
                                  onClick={() => onShareUser(user)}
                                  className="text-[10px] text-emerald-700 hover:text-emerald-900 font-semibold flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-md transition cursor-pointer"
                                  title="เปิด QR Code และการ์ดข้อมูลความลับเฉพาะบุคคล"
                                >
                                  <QrCode className="w-3 h-3 text-emerald-600" />
                                  <span>QR</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td className="py-3 px-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 ${
                              isAdmin
                                ? 'bg-amber-100 text-amber-800'
                                : isVolunteer
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-indigo-100 text-indigo-800'
                            }`}
                          >
                            {isAdmin && <Shield className="w-3 h-3" />}
                            {isVolunteer && <HeartHandshake className="w-3 h-3" />}
                            {!isAdmin && !isVolunteer && <Briefcase className="w-3 h-3" />}
                            {isAdmin ? 'ผู้ดูแลระบบ' : isVolunteer ? 'อาสาสมัคร' : 'พนักงาน'}
                          </span>
                        </td>

                        {/* Department */}
                        <td className="py-3 px-4">
                          <span className="text-slate-700 font-medium">{user.departmentName}</span>
                        </td>

                        {/* Position */}
                        <td className="py-3 px-4 text-slate-700 font-medium">
                          {user.position ? (
                            <span className="px-2 py-0.5 bg-slate-100 rounded-md text-[11px] text-slate-800">
                              {user.position}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* Assigned Location */}
                        <td className="py-3 px-4 text-slate-600 text-xs">
                          {user.assignedLocationName ? (
                            <span className="flex items-center gap-1 text-indigo-700 text-[11px] font-medium">
                              <MapPin className="w-3 h-3 text-indigo-500 shrink-0" />
                              <span className="truncate max-w-[150px]">{user.assignedLocationName}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">ไม่จำกัดจุด</span>
                          )}
                        </td>

                        {/* Phone */}
                        <td className="py-3 px-4 text-slate-600">
                          {user.phoneNumber ? (
                            <span className="flex items-center gap-1 text-slate-700">
                              <Phone className="w-3 h-3 text-slate-400" /> {user.phoneNumber}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                              user.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-500 border border-slate-200'
                            }`}
                          >
                            {user.status === 'active' ? 'ใช้งานปกติ' : 'ระงับการใช้งาน'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {onShareUser && (
                              <button
                                type="button"
                                onClick={() => onShareUser(user)}
                                className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                                title="แชร์ QR Code & บัตรข้อมูลส่งต่อผู้ใช้"
                              >
                                <QrCode className="w-4 h-4 text-emerald-600" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setResetModalUser(user);
                                setResetPasswordInput('');
                              }}
                              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                              title="เปลี่ยน / รีเซ็ตรหัสผ่าน"
                            >
                              <Key className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditUser(user)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                              title="แก้ไขข้อมูล"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(user)}
                              disabled={user.username === 'admin'}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                              title="ลบผู้ใช้"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: DEPARTMENTS LIST */}
      {activeTab === 'departments' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800 text-sm sm:text-base">กลุ่ม / แผนกงาน (9 หน่วยงานหลัก)</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                หน่วยงานหลักสำหรับจัดกลุ่มบุคลากร และกำหนด LINE Notify Token แยกตามแต่ละแผนก
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {allDepartments.map((dept) => (
              <div
                key={dept.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="px-2.5 py-0.5 rounded-md text-white text-xs font-bold"
                      style={{ backgroundColor: dept.color }}
                    >
                      {dept.code}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      สมาชิก {dept.memberCount || 0} คน
                    </span>
                  </div>

                  <h4 className="font-bold text-slate-800 text-sm">{dept.name}</h4>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{dept.description}</p>
                </div>

                <div className="pt-3 mt-3 border-t border-slate-200/80 flex items-center justify-between">
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full ${
                      dept.lineNotifyToken
                        ? 'bg-emerald-50 text-emerald-700 font-medium'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {dept.lineNotifyToken ? '🟢 มี LINE Token' : '⚪ Token ค่าเริ่มต้น'}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEditDept(dept)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                      title="แก้ไขแผนก / LINE Token"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    {!STANDARD_DEPARTMENTS.some((std) => std.id === dept.id) && (
                      <button
                        type="button"
                        onClick={() => handleDeleteDept(dept)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                        title="ลบแผนก"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT USER */}
      {(isAddUserOpen || editingUser) && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800 text-base">
                {editingUser ? 'แก้ไขข้อมูลผู้ใช้งาน' : 'เพิ่มผู้ใช้งานใหม่'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsAddUserOpen(false);
                  setEditingUser(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-4 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ชื่อ - นามสกุล *
                </label>
                <input
                  type="text"
                  required
                  value={userFormData.fullName}
                  onChange={(e) => setUserFormData({ ...userFormData, fullName: e.target.value })}
                  placeholder="เช่น สมชาย ใจดี หรือ อาสา สมศักดิ์"
                  className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Username & Password */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Username *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!editingUser}
                    value={userFormData.username}
                    onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value })}
                    placeholder="เช่น somchai"
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {editingUser ? 'รหัสผ่านใหม่ (เว้นว่างได้)' : 'รหัสผ่าน (Password) *'}
                  </label>
                  <input
                    type="password"
                    required={!editingUser}
                    value={userFormData.password}
                    onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                    placeholder="กำหนดรหัสผ่าน"
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Role & Department (Matches Exact CSS Selector 1 & 2) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    สิทธิ์ / บทบาท *
                  </label>
                  <select
                    value={userFormData.role}
                    onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value as Role })}
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="employee">💼 พนักงาน</option>
                    <option value="volunteer">🤝 อาสาสมัคร</option>
                    <option value="admin">👑 ผู้ดูแลระบบ</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    กลุ่ม / แผนก *
                  </label>
                  <select
                    value={userFormData.departmentId}
                    onChange={(e) => setUserFormData({ ...userFormData, departmentId: e.target.value })}
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="dep_ems_rescue">กู้ชีพ-กู้ภัย</option>
                    <option value="dep_rescue">กู้ภัย</option>
                    <option value="dep_social_welfare">สังคมสงเคราะห์</option>
                    <option value="dep_admin_mgmt">บริหาร</option>
                    <option value="dep_accounting">บัญชี</option>
                    <option value="dep_donation">บริจาค</option>
                    <option value="dep_security">รปภ.</option>
                    <option value="dep_housekeeping">แม่บ้าน</option>
                    <option value="dep_general">ทั่วไป</option>
                    {allDepartments
                      .filter((d) => !STANDARD_DEPARTMENTS.some((std) => std.id === d.id))
                      .map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {dept.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Position (Admin สามารถกำหนดตำแหน่งได้เอง) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    ตำแหน่งหน้าที่การงาน (Admin กำหนดตำแหน่งได้เอง)
                  </label>
                  <span className="text-[11px] text-indigo-600 font-medium">พิมพ์เองหรือเลือกด้านล่าง</span>
                </div>
                <input
                  type="text"
                  list="position_presets_list"
                  value={userFormData.position}
                  onChange={(e) => setUserFormData({ ...userFormData, position: e.target.value })}
                  placeholder="พิมพ์ตำแหน่งงาน เช่น หัวหน้าชุดปฏิบัติการ, พลขับกู้ชีพ..."
                  className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <datalist id="position_presets_list">
                  {POSITION_PRESETS.map((p, idx) => (
                    <option key={idx} value={p} />
                  ))}
                </datalist>

                {/* Quick Preset Badges */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {['เจ้าหน้าที่กู้ชีพ (EMT)', 'พลขับรถพยาบาล', 'เจ้าหน้าที่กู้ภัย', 'เจ้าหน้าที่สังคมสงเคราะห์', 'เจ้าหน้าที่บัญชี', 'รปภ.', 'แม่บ้าน'].map(
                    (preset, idx) => (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => setUserFormData({ ...userFormData, position: preset })}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 transition cursor-pointer"
                      >
                        + {preset}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Assigned Work Location (Admin กำหนดจุดปฏิบัติงาน) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span>จุดปฏิบัติงานที่กำหนด (Work Location)</span>
                  <span className="text-[11px] text-slate-500">พิกัดสำหรับเช็คอิน</span>
                </label>
                <select
                  value={userFormData.assignedLocationId}
                  onChange={(e) => setUserFormData({ ...userFormData, assignedLocationId: e.target.value })}
                  className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="">ไม่ระบุ (สามารถลงเวลาได้ทุกจุด / ลงเวลานอกสถานที่ได้)</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      📍 {loc.name} ({loc.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Phone & Employee Code */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    เบอร์โทรศัพท์
                  </label>
                  <input
                    type="tel"
                    value={userFormData.phoneNumber}
                    onChange={(e) => setUserFormData({ ...userFormData, phoneNumber: e.target.value })}
                    placeholder="081-xxx-xxxx"
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    รหัสประจำตัว (Employee Code)
                  </label>
                  <input
                    type="text"
                    value={userFormData.employeeCode}
                    onChange={(e) => setUserFormData({ ...userFormData, employeeCode: e.target.value })}
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  สถานะการใช้งาน
                </label>
                <select
                  value={userFormData.status}
                  onChange={(e) => setUserFormData({ ...userFormData, status: e.target.value as any })}
                  className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="active">เปิดใช้งาน (Active)</option>
                  <option value="inactive">ระงับชั่วคราว (Inactive)</option>
                </select>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddUserOpen(false);
                    setEditingUser(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2 text-xs sm:text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{isLoading ? 'กำลังบันทึก...' : editingUser ? 'บันทึกการแก้ไข' : 'สร้างผู้ใช้งาน'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT DEPARTMENT */}
      {isDeptModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800 text-base">
                {editingDept ? 'แก้ไขข้อมูลกลุ่ม/แผนก & LINE Token' : 'เพิ่มกลุ่ม/แผนกใหม่'}
              </h3>
              <button
                type="button"
                onClick={() => setIsDeptModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDept} className="p-4 sm:p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Department Name & Code */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    ชื่อกลุ่ม / แผนก *
                  </label>
                  <input
                    type="text"
                    required
                    value={deptFormData.name}
                    onChange={(e) => setDeptFormData({ ...deptFormData, name: e.target.value })}
                    placeholder="เช่น กู้ชีพ-กู้ภัย, กู้ภัย, สังคมสงเคราะห์"
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    รหัสย่อ *
                  </label>
                  <input
                    type="text"
                    required
                    value={deptFormData.code}
                    onChange={(e) => setDeptFormData({ ...deptFormData, code: e.target.value })}
                    placeholder="EMS"
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none uppercase font-mono"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  คำอธิบายภารกิจ / หน้าที่ความรับผิดชอบ
                </label>
                <textarea
                  rows={2}
                  value={deptFormData.description}
                  onChange={(e) => setDeptFormData({ ...deptFormData, description: e.target.value })}
                  placeholder="รายละเอียดหน้าที่ของกลุ่มนี้..."
                  className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none"
                />
              </div>

              {/* LINE Notify Token Specific to Department */}
              <div className="bg-emerald-50/60 p-3.5 rounded-2xl border border-emerald-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-emerald-600" />
                    <span>LINE Notify Token เฉพาะกลุ่มนี้</span>
                  </label>
                  <span className="text-[10px] text-emerald-700">ส่งตรงเข้ากลุ่มแผนก</span>
                </div>
                <input
                  type="text"
                  value={deptFormData.lineNotifyToken}
                  onChange={(e) => setDeptFormData({ ...deptFormData, lineNotifyToken: e.target.value })}
                  placeholder="วาง LINE Token เฉพาะกลุ่มนี้ (เว้นว่าง = ใช้ Token กลาง)"
                  className="w-full text-xs p-2.5 bg-white rounded-xl border border-emerald-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
                />
                <p className="text-[10px] text-emerald-800 leading-relaxed">
                  💡 หากใส่ Token นี้ เมื่อพนักงานหรืออาสาสมัครในแผนกนี้ลงเวลา ระบบจะแจ้งเตือนไปยังกลุ่ม LINE นี้โดยตรง
                </p>
              </div>

              {/* Check-In / Check-Out Notifications Toggle */}
              <div className="space-y-2 pt-1">
                <label className="block text-xs font-semibold text-slate-700">
                  เงื่อนไขการส่งแจ้งเตือน LINE
                </label>
                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deptFormData.notifyOnCheckIn}
                      onChange={(e) => setDeptFormData({ ...deptFormData, notifyOnCheckIn: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    />
                    <span className="text-slate-700">เมื่อเข้างาน (Check-In)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deptFormData.notifyOnCheckOut}
                      onChange={(e) => setDeptFormData({ ...deptFormData, notifyOnCheckOut: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    />
                    <span className="text-slate-700">เมื่อออกงาน (Check-Out)</span>
                  </label>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDeptModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2 text-xs sm:text-sm font-semibold bg-sky-600 hover:bg-sky-700 text-white rounded-xl shadow-xs transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{isLoading ? 'กำลังบันทึก...' : 'บันทึกข้อมูลแผนก'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RESET PASSWORD */}
      {resetModalUser && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">รีเซ็ตรหัสผ่านผู้ใช้งาน</h3>
                  <p className="text-[11px] text-slate-500">@{resetModalUser.username} ({resetModalUser.fullName})</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResetModalUser(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  กำหนดรหัสผ่านใหม่ *
                </label>
                <input
                  type="text"
                  required
                  value={resetPasswordInput}
                  onChange={(e) => setResetPasswordInput(e.target.value)}
                  placeholder="เช่น 123456 หรือรหัสผ่านใหม่"
                  className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  💡 เมื่อบันทึกแล้ว ผู้ใช้งานจะสามารถนำรหัสผ่านใหม่นี้ไปล็อกอินได้จากทุกเครื่องทุกอุปกรณ์ทันที
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetModalUser(null)}
                  className="w-1/2 py-2 px-3 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !resetPasswordInput.trim()}
                  className="w-1/2 py-2 px-3 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {isLoading ? 'กำลังบันทึก...' : 'ยืนยันรหัสผ่านใหม่'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV IMPORT MODAL */}
      {isCsvImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    นำเข้าไฟล์รายชื่อผู้ใช้งาน (Import CSV)
                  </h3>
                  <p className="text-xs text-slate-500">
                    นำเข้ารายชื่อบุคลากรเพื่อสร้างบัญชีและรหัสผ่านเข้าใช้งานอัตโนมัติ
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCsvImportOpen(false);
                  setCsvPreviewRows([]);
                  setCsvTextContent('');
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto pr-1 flex-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  1. เลือกไฟล์ CSV จากเครื่องของคุณ
                </label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer border border-slate-200 rounded-xl p-1"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  หรือวางเนื้อหาข้อมูล CSV (รูปแบบ: ลำดับ, ชื่อ-นามสกุล, ตำแหน่ง, เบอร์โทร)
                </label>
                <textarea
                  rows={4}
                  value={csvTextContent}
                  onChange={(e) => {
                    setCsvTextContent(e.target.value);
                    parseCsvPreview(e.target.value);
                  }}
                  placeholder="เช่น: 1,นายสมชาย ใจดี,หัวหน้าชุดปฏิบัติการ,089-123-4567"
                  className="w-full text-xs p-3 font-mono bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Preview table */}
              {csvPreviewRows.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-800">
                      ตัวอย่างข้อมูลที่ตรวจพบ ({csvPreviewRows.length} รายการ)
                    </span>
                    <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      พร้อมนำเข้าสู่ฐานข้อมูลกลาง
                    </span>
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-[11px] text-left">
                      <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0">
                        <tr>
                          <th className="p-2">#</th>
                          <th className="p-2">ชื่อ-นามสกุล</th>
                          <th className="p-2">ตำแหน่ง</th>
                          <th className="p-2">เบอร์โทร</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {csvPreviewRows.slice(0, 15).map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2 text-slate-400 font-mono">{row[0]}</td>
                            <td className="p-2 font-medium text-slate-800">{row[1]}</td>
                            <td className="p-2 text-slate-600">{row[2]}</td>
                            <td className="p-2 font-mono text-slate-600">{row[3] || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {csvPreviewRows.length > 15 && (
                      <div className="p-2 text-center text-[10px] text-slate-400 bg-slate-50 border-t border-slate-100">
                        ...และอีก {csvPreviewRows.length - 15} รายการ
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  setIsCsvImportOpen(false);
                  setCsvPreviewRows([]);
                  setCsvTextContent('');
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isImportingCsv || csvPreviewRows.length === 0}
                onClick={handleCommitCsvImport}
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition disabled:opacity-50 cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                {isImportingCsv ? 'กำลังนำเข้าสู่ฐานข้อมูล...' : `ยืนยันนำเข้า (${csvPreviewRows.length} บัญชี)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
