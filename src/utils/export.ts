import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
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
  URL.revokeObjectURL(url);
}

function loadImageAsync(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function truncateTextToFit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (!text) return '-';
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 2 && ctx.measureText(trimmed + '...').width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed + '...';
}

export async function exportToPDF(
  records: AttendanceRecord[],
  filename = `SmartTime-Attendance-${new Date().toISOString().split('T')[0]}.pdf`,
  title = 'รายงานการลงเวลาเข้า-ออกงาน (Smart Time Attendance)'
): Promise<void> {
  try {
    if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
      await (document as any).fonts.ready;
    }
  } catch {}

  const PAGE_W = 1654; // A4 Landscape @ ~144 DPI
  const PAGE_H = 1169;
  const MARGIN = 48;
  const TABLE_W = PAGE_W - MARGIN * 2;
  const ROWS_PER_PAGE = 9;
  const ROW_H = 82;

  const thaiNow = getThaiDateTime();
  const totalCheckIns = records.filter((r) => r.type === 'check_in').length;
  const totalCheckOuts = records.filter((r) => r.type === 'check_out').length;
  const volunteersCount = records.filter((r) => r.userRole === 'volunteer').length;

  // Preload up to row thumbnails cleanly
  const loadedImages = await Promise.all(records.map((r) => loadImageAsync(r.photo)));

  const totalPages = Math.max(1, Math.ceil(records.length / ROWS_PER_PAGE));
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
    compress: true,
  });
  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();

  const cols = [
    { label: 'ลำดับ', width: 55, align: 'center' as const },
    { label: 'ภาพถ่าย', width: 112, align: 'center' as const },
    { label: 'วัน-เวลา', width: 145, align: 'left' as const },
    { label: 'ชื่อ - นามสกุล', width: 220, align: 'left' as const },
    { label: 'แผนก / สังกัด', width: 170, align: 'left' as const },
    { label: 'ประเภท', width: 110, align: 'center' as const },
    { label: 'สถานที่ / พิกัด GPS', width: 500, align: 'left' as const },
    { label: 'หมายเหตุ', width: TABLE_W - (55 + 112 + 145 + 220 + 170 + 110 + 500), align: 'left' as const },
  ];

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);

    // Header Banner
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(MARGIN, MARGIN, TABLE_W, 92);
    ctx.fillStyle = '#10b981';
    ctx.fillRect(MARGIN, MARGIN, 10, 92);

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 26px Kanit, "Noto Sans Thai", sans-serif';
    ctx.fillText(title, MARGIN + 28, MARGIN + 40);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '16px Kanit, "Noto Sans Thai", sans-serif';
    ctx.fillText(
      `พิมพ์เมื่อ: ${thaiNow.fullThaiDate} เวลา ${thaiNow.timeStr} น. (GMT+7)  •  ฐานข้อมูลกลาง & Firebase (smart-time-ca6f9)`,
      MARGIN + 28,
      MARGIN + 70
    );

    // Page badge top-right
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 16px Kanit, "Noto Sans Thai", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`หน้า ${pageIdx + 1} / ${totalPages}`, PAGE_W - MARGIN - 24, MARGIN + 42);
    ctx.textAlign = 'left';

    let cursorY = MARGIN + 110;

    // Summary KPI strip on page 1
    if (pageIdx === 0) {
      const cardGap = 16;
      const cardW = (TABLE_W - cardGap * 3) / 4;
      const kpis = [
        { label: 'รายการลงเวลาทั้งหมด', value: `${records.length} รายการ`, bg: '#f1f5f9', fg: '#0f172a' },
        { label: 'บันทึกเข้างาน (Check-In)', value: `${totalCheckIns} ครั้ง`, bg: '#ecfdf5', fg: '#047857' },
        { label: 'บันทึกออกงาน (Check-Out)', value: `${totalCheckOuts} ครั้ง`, bg: '#fff1f2', fg: '#be123c' },
        { label: 'อาสาสมัครกู้ชีพ-กู้ภัย', value: `${volunteersCount} รายการ`, bg: '#eff6ff', fg: '#1d4ed8' },
      ];
      kpis.forEach((k, idx) => {
        const x = MARGIN + idx * (cardW + cardGap);
        ctx.fillStyle = k.bg;
        ctx.fillRect(x, cursorY, cardW, 64);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, cursorY, cardW, 64);

        ctx.fillStyle = '#475569';
        ctx.font = '14px Kanit, "Noto Sans Thai", sans-serif';
        ctx.fillText(k.label, x + 16, cursorY + 24);

        ctx.fillStyle = k.fg;
        ctx.font = 'bold 22px Kanit, "Noto Sans Thai", sans-serif';
        ctx.fillText(k.value, x + 16, cursorY + 52);
      });
      cursorY += 82;
    }

    // Table Header
    const TH_H = 44;
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(MARGIN, cursorY, TABLE_W, TH_H);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.strokeRect(MARGIN, cursorY, TABLE_W, TH_H);

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 16px Kanit, "Noto Sans Thai", sans-serif';
    let colX = MARGIN;
    for (const col of cols) {
      if (col.align === 'center') {
        ctx.textAlign = 'center';
        ctx.fillText(col.label, colX + col.width / 2, cursorY + 28);
        ctx.textAlign = 'left';
      } else {
        ctx.fillText(col.label, colX + 12, cursorY + 28);
      }
      ctx.beginPath();
      ctx.moveTo(colX, cursorY);
      ctx.lineTo(colX, cursorY + TH_H);
      ctx.stroke();
      colX += col.width;
    }
    cursorY += TH_H;

    // Rows for this page
    const startIdx = pageIdx * ROWS_PER_PAGE;
    const pageRecords = records.slice(startIdx, startIdx + ROWS_PER_PAGE);

    if (pageRecords.length === 0) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(MARGIN, cursorY, TABLE_W, 120);
      ctx.strokeStyle = '#cbd5e1';
      ctx.strokeRect(MARGIN, cursorY, TABLE_W, 120);
      ctx.fillStyle = '#64748b';
      ctx.font = '18px Kanit, "Noto Sans Thai", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ยังไม่มีรายการบันทึกการลงเวลาในระบบ (พร้อมใช้งานร่วมกับฐานข้อมูล Cloud Firestore)', PAGE_W / 2, cursorY + 68);
      ctx.textAlign = 'left';
    } else {
      pageRecords.forEach((rec, i) => {
        const globalIdx = startIdx + i;
        const rowY = cursorY + i * ROW_H;

        ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#f8fafc';
        ctx.fillRect(MARGIN, rowY, TABLE_W, ROW_H);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.strokeRect(MARGIN, rowY, TABLE_W, ROW_H);

        let rx = MARGIN;

        // Col 1: Index
        ctx.fillStyle = '#334155';
        ctx.font = 'bold 15px Kanit, "Noto Sans Thai", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(globalIdx + 1), rx + cols[0].width / 2, rowY + 46);
        ctx.textAlign = 'left';
        rx += cols[0].width;

        // Col 2: Photo thumbnail (wide 16:9 fit)
        const img = loadedImages[globalIdx];
        if (img) {
          const boxW = 96;
          const boxH = 58;
          const imgX = rx + (cols[1].width - boxW) / 2;
          const imgY = rowY + (ROW_H - boxH) / 2;
          ctx.drawImage(img, imgX, imgY, boxW, boxH);
          ctx.strokeStyle = '#94a3b8';
          ctx.strokeRect(imgX, imgY, boxW, boxH);
        } else {
          ctx.fillStyle = '#94a3b8';
          ctx.font = '13px Kanit, "Noto Sans Thai", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('ไม่มีรูป', rx + cols[1].width / 2, rowY + 46);
          ctx.textAlign = 'left';
        }
        rx += cols[1].width;

        // Col 3: Date & Time
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 15px Kanit, "Noto Sans Thai", sans-serif';
        ctx.fillText(rec.date || '-', rx + 12, rowY + 34);
        ctx.fillStyle = '#475569';
        ctx.font = '15px monospace';
        ctx.fillText(`${rec.time || '-'} น.`, rx + 12, rowY + 58);
        rx += cols[2].width;

        // Col 4: Name + Role
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 16px Kanit, "Noto Sans Thai", sans-serif';
        ctx.fillText(truncateTextToFit(ctx, rec.userName, cols[3].width - 20), rx + 12, rowY + 35);
        ctx.fillStyle = rec.userRole === 'volunteer' ? '#047857' : '#4338ca';
        ctx.font = '14px Kanit, "Noto Sans Thai", sans-serif';
        const roleLabel =
          rec.userRole === 'volunteer' ? 'อาสาสมัคร' : rec.userRole === 'admin' ? 'ผู้ดูแลระบบ' : 'พนักงาน';
        ctx.fillText(roleLabel, rx + 12, rowY + 58);
        rx += cols[3].width;

        // Col 5: Department
        ctx.fillStyle = '#334155';
        ctx.font = '15px Kanit, "Noto Sans Thai", sans-serif';
        ctx.fillText(truncateTextToFit(ctx, rec.departmentName || '-', cols[4].width - 20), rx + 12, rowY + 46);
        rx += cols[4].width;

        // Col 6: Type
        const isCheckIn = rec.type === 'check_in';
        ctx.fillStyle = isCheckIn ? '#059669' : '#dc2626';
        ctx.font = 'bold 16px Kanit, "Noto Sans Thai", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(isCheckIn ? 'เข้างาน' : 'ออกงาน', rx + cols[5].width / 2, rowY + 46);
        ctx.textAlign = 'left';
        rx += cols[5].width;

        // Col 7: Location + GPS Coords
        ctx.fillStyle = '#0f172a';
        ctx.font = '14px Kanit, "Noto Sans Thai", sans-serif';
        ctx.fillText(truncateTextToFit(ctx, rec.locationName || '-', cols[6].width - 24), rx + 12, rowY + 34);
        ctx.fillStyle = '#0369a1';
        ctx.font = '14px monospace';
        const latStr = typeof rec.latitude === 'number' ? rec.latitude.toFixed(6) : '-';
        const lonStr = typeof rec.longitude === 'number' ? rec.longitude.toFixed(6) : '-';
        ctx.fillText(`GPS: ${latStr}, ${lonStr}`, rx + 12, rowY + 58);
        rx += cols[6].width;

        // Col 8: Note
        ctx.fillStyle = '#475569';
        ctx.font = '14px Kanit, "Noto Sans Thai", sans-serif';
        ctx.fillText(truncateTextToFit(ctx, rec.note || '-', cols[7].width - 20), rx + 12, rowY + 46);

        // Draw vertical grid separators
        let gx = MARGIN;
        ctx.strokeStyle = '#cbd5e1';
        for (const col of cols) {
          ctx.beginPath();
          ctx.moveTo(gx, rowY);
          ctx.lineTo(gx, rowY + ROW_H);
          ctx.stroke();
          gx += col.width;
        }
      });
    }

    // Footer Signature Strip on last page
    if (pageIdx === totalPages - 1) {
      const footY = PAGE_H - MARGIN - 65;
      ctx.fillStyle = '#334155';
      ctx.font = '15px Kanit, "Noto Sans Thai", sans-serif';
      const sigPositions = [MARGIN + 150, PAGE_W / 2, PAGE_W - MARGIN - 150];
      const sigLabels = ['( ผู้จัดทำรายงาน )', '( หัวหน้าแผนก / ฝ่าย )', '( ผู้ดูแลระบบ / Admin )'];
      sigPositions.forEach((sx, idx) => {
        ctx.textAlign = 'center';
        ctx.fillText('ลงชื่อ ............................................................', sx, footY + 18);
        ctx.fillText(sigLabels[idx], sx, footY + 44);
      });
      ctx.textAlign = 'left';
    }

    const pageImgData = canvas.toDataURL('image/jpeg', 0.92);
    if (pageIdx > 0) {
      pdf.addPage();
    }
    pdf.addImage(pageImgData, 'JPEG', 0, 0, pdfW, pdfH);
  }

  pdf.save(filename);
}

export function printAttendanceReport(records: AttendanceRecord[], title = 'รายงานการลงเวลาเข้า-ออกงาน') {
  const filename = `รายงานการลงเวลา_${new Date().toISOString().split('T')[0]}.pdf`;
  void exportToPDF(records, filename, title);
}

