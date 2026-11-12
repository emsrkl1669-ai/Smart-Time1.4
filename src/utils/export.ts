import * as XLSX from 'xlsx';
import { AttendanceRecord } from '../types';
import { getThaiDateTime } from './thaiTime';

export function exportToExcel(records: AttendanceRecord[], filename = 'attendance_report.xlsx') {
  const rows = records.map((r, index) => ({
    'ลำดับ': index + 1,
    'วันที่': r.date,
    'เวลา': r.time,
    'ชื่อ-นามสกุล': r.userName,
    'สิทธิ์/บทบาท': r.userRole === 'volunteer' ? 'อาสาสมัคร' : (r.userRole === 'admin' ? 'ผู้ดูแลระบบ' : 'พนักงาน'),
    'แผนก/สังกัด': r.departmentName,
    'ประเภท': r.type === 'check_in' ? 'เข้างาน (Check-In)' : 'ออกงาน (Check-Out)',
    'สถานที่บันทึก': r.locationName,
    'จุดปฏิบัติงาน (Admin)': r.workLocationName || '-',
    'สถานะรัศมีพิกัด': r.isWithinGeofence ? 'อยู่ในจุดพิกัด' : (r.distanceFromLocationMeters ? `นอกรัศมี (${r.distanceFromLocationMeters} ม.)` : '-'),
    'ละติจูด': r.latitude,
    'ลองจิจูด': r.longitude,
    'หมายเหตุ/ภารกิจ': r.note || '-',
    'สถานะ LINE': r.lineNotificationStatus === 'sent' ? 'ส่งแล้ว' : (r.lineNotificationStatus === 'simulated' ? 'จำลอง' : 'ปิด'),
    'รูปแบบการบันทึก': r.isOfflineRecord ? 'ออฟไลน์ (ซิงค์แล้ว)' : 'ออนไลน์',
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set column widths
  worksheet['!cols'] = [
    { wch: 6 },  // ลำดับ
    { wch: 12 }, // วันที่
    { wch: 10 }, // เวลา
    { wch: 22 }, // ชื่อ
    { wch: 14 }, // บทบาท
    { wch: 24 }, // แผนก
    { wch: 18 }, // ประเภท
    { wch: 32 }, // สถานที่
    { wch: 26 }, // จุดปฏิบัติงาน
    { wch: 18 }, // สถานะรัศมี
    { wch: 12 }, // ละติจูด
    { wch: 12 }, // ลองจิจูด
    { wch: 30 }, // หมายเหตุ
    { wch: 14 }, // สถานะ LINE
    { wch: 18 }, // รูปแบบการบันทึก
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'รายงานการลงเวลา');

  XLSX.writeFile(workbook, filename);
}

export function exportToCSV(records: AttendanceRecord[], filename = 'attendance_report.csv') {
  const headers = [
    'ลำดับ',
    'วันที่',
    'เวลา',
    'ชื่อ-นามสกุล',
    'บทบาท',
    'แผนก',
    'ประเภท',
    'สถานที่',
    'จุดปฏิบัติงาน',
    'สถานะรัศมี',
    'ละติจูด',
    'ลองจิจูด',
    'หมายเหตุ',
    'สถานะ LINE',
    'โหมดการบันทึก',
  ];

  const csvRows = records.map((r, i) => [
    i + 1,
    `"${r.date}"`,
    `"${r.time}"`,
    `"${r.userName.replace(/"/g, '""')}"`,
    `"${r.userRole === 'volunteer' ? 'อาสาสมัคร' : (r.userRole === 'admin' ? 'ผู้ดูแลระบบ' : 'พนักงาน')}"`,
    `"${r.departmentName.replace(/"/g, '""')}"`,
    `"${r.type === 'check_in' ? 'เข้างาน' : 'ออกงาน'}"`,
    `"${r.locationName.replace(/"/g, '""')}"`,
    `"${(r.workLocationName || '-').replace(/"/g, '""')}"`,
    `"${r.isWithinGeofence ? 'อยู่ในจุดพิกัด' : 'นอกรัศมี'}"`,
    r.latitude,
    r.longitude,
    `"${(r.note || '-').replace(/"/g, '""')}"`,
    `"${r.lineNotificationStatus}"`,
    `"${r.isOfflineRecord ? 'ออฟไลน์' : 'ออนไลน์'}"`,
  ]);

  // Prepend UTF-8 BOM \uFEFF for proper Thai character display in Excel
  const csvContent = '\uFEFF' + [headers.join(','), ...csvRows.map((e) => e.join(','))].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function printAttendanceReport(records: AttendanceRecord[], title = 'รายงานการลงเวลาเข้า-ออกงาน') {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const totalCheckIns = records.filter((r) => r.type === 'check_in').length;
  const totalCheckOuts = records.filter((r) => r.type === 'check_out').length;
  const volunteersCount = records.filter((r) => r.userRole === 'volunteer').length;

  const tableRows = records
    .map(
      (r, i) => `
    <tr>
      <td style="text-align: center; border: 1px solid #ddd; padding: 6px;">${i + 1}</td>
      <td style="border: 1px solid #ddd; padding: 6px;">${r.date} ${r.time}</td>
      <td style="border: 1px solid #ddd; padding: 6px; font-weight: 500;">${r.userName}</td>
      <td style="border: 1px solid #ddd; padding: 6px;">${r.userRole === 'volunteer' ? 'อาสาสมัคร' : 'พนักงาน'}</td>
      <td style="border: 1px solid #ddd; padding: 6px;">${r.departmentName}</td>
      <td style="border: 1px solid #ddd; padding: 6px; text-align: center; color: ${r.type === 'check_in' ? '#059669' : '#dc2626'}; font-weight: bold;">
        ${r.type === 'check_in' ? 'เข้างาน' : 'ออกงาน'}
      </td>
      <td style="border: 1px solid #ddd; padding: 6px; font-size: 12px;">${r.locationName}</td>
      <td style="border: 1px solid #ddd; padding: 6px; font-size: 12px;">${r.note || '-'}</td>
    </tr>
  `
    )
    .join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;600&display=swap" rel="stylesheet">
      <style>
        body { font-family: 'Kanit', sans-serif; color: #1e293b; padding: 24px; margin: 0; }
        .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #0284c7; padding-bottom: 12px; }
        h1 { margin: 0 0 6px 0; font-size: 22px; color: #0369a1; }
        .sub { font-size: 13px; color: #64748b; }
        .stats { display: flex; gap: 16px; margin-bottom: 16px; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; }
        .stat-box { flex: 1; text-align: center; }
        .stat-num { font-size: 18px; font-weight: bold; color: #0f172a; }
        .stat-label { font-size: 12px; color: #64748b; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px; font-weight: 600; text-align: left; }
        .signature-section { margin-top: 40px; display: flex; justify-content: space-between; page-break-inside: avoid; }
        .sign-box { width: 220px; text-align: center; border-top: 1px dashed #94a3b8; padding-top: 8px; font-size: 13px; }
        @media print {
          body { padding: 0; }
          button { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${title}</h1>
        <div class="sub">พิมพ์เมื่อ: ${getThaiDateTime().fullThaiDate} เวลา ${getThaiDateTime().timeStr} น. (เวลาประเทศไทย GMT+7) | ระบบ Smart Time Attendance & Geo Check-in</div>
      </div>

      <div class="stats">
        <div class="stat-box">
          <div class="stat-num">${records.length}</div>
          <div class="stat-label">รายการทั้งหมด</div>
        </div>
        <div class="stat-box">
          <div class="stat-num" style="color: #059669;">${totalCheckIns}</div>
          <div class="stat-label">บันทึกเข้างาน</div>
        </div>
        <div class="stat-box">
          <div class="stat-num" style="color: #dc2626;">${totalCheckOuts}</div>
          <div class="stat-label">บันทึกออกงาน</div>
        </div>
        <div class="stat-box">
          <div class="stat-num" style="color: #0284c7;">${volunteersCount}</div>
          <div class="stat-label">รายการจิตอาสา</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 35px; text-align: center;">ลำดับ</th>
            <th style="width: 110px;">วัน-เวลา</th>
            <th>ชื่อ - นามสกุล</th>
            <th style="width: 80px;">บทบาท</th>
            <th>แผนก/กลุ่ม</th>
            <th style="width: 70px; text-align: center;">ประเภท</th>
            <th>สถานที่</th>
            <th>หมายเหตุ/ภารกิจ</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>

      <div class="signature-section">
        <div class="sign-box">
          ลงชื่อ........................................................<br>
          ( ผู้จัดทำรายงาน )<br>
          วันที่ ......./......./............
        </div>
        <div class="sign-box">
          ลงชื่อ........................................................<br>
          ( ผู้จัดการ / หัวหน้าแผนก )<br>
          วันที่ ......./......./............
        </div>
        <div class="sign-box">
          ลงชื่อ........................................................<br>
          ( ผู้มีอำนาจอนุมัติ / Admin )<br>
          วันที่ ......./......./............
        </div>
      </div>

      <script>
        window.onload = function() { window.print(); }
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
