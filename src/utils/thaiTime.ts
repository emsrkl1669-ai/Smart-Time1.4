/**
 * Thai Real-Time & Timezone Utility (เวลามาตรฐานประเทศไทย GMT+7 Asia/Bangkok)
 * Ensures accurate Thai date and time across all operating systems (iOS, Android, Windows, macOS, Linux)
 * irrespective of server container timezone or device clock setting.
 */

const THAI_DAYS = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];
const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

let serverTimeOffsetMs = 0; // Difference between server and client clock

export function setServerTimeOffset(serverIso: string) {
  try {
    const serverMs = new Date(serverIso).getTime();
    const clientMs = Date.now();
    if (!isNaN(serverMs)) {
      serverTimeOffsetMs = serverMs - clientMs;
    }
  } catch (e) {
    console.warn('Failed to calculate server time offset', e);
  }
}

export function getNowWithOffset(): Date {
  return new Date(Date.now() + serverTimeOffsetMs);
}

export interface ThaiDateTimeResult {
  dateStr: string;         // YYYY-MM-DD in Asia/Bangkok
  timeStr: string;         // HH:mm:ss in Asia/Bangkok (24-hour)
  thaiYear: number;        // พ.ศ. (ค.ศ. + 543)
  dayName: string;         // เช่น วันศุกร์
  dayNum: number;          // 1-31
  monthNum: number;        // 1-12
  monthNameFull: string;   // เช่น ตุลาคม
  monthNameShort: string;  // เช่น ต.ค.
  fullThaiDate: string;    // เช่น วันศุกร์ที่ 10 ตุลาคม 2569
  formattedDateTime: string; // เช่น 10/10/2569 08:30:15 น.
  rawDate: Date;
}

export function getThaiDateTime(dateInput?: Date | string | number): ThaiDateTimeResult {
  let targetDate: Date;
  if (!dateInput) {
    targetDate = getNowWithOffset();
  } else if (typeof dateInput === 'string' || typeof dateInput === 'number') {
    targetDate = new Date(dateInput);
  } else {
    targetDate = dateInput;
  }

  if (isNaN(targetDate.getTime())) {
    targetDate = new Date();
  }

  // Use Intl.DateTimeFormat strictly with Asia/Bangkok
  const thaiFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
    weekday: 'short',
  });

  const parts = thaiFormatter.formatToParts(targetDate);
  const partMap: Record<string, string> = {};
  parts.forEach((p) => {
    partMap[p.type] = p.value;
  });

  const yearNum = parseInt(partMap.year || `${targetDate.getFullYear()}`, 10);
  const monthNum = parseInt(partMap.month || `${targetDate.getMonth() + 1}`, 10);
  const dayNum = parseInt(partMap.day || `${targetDate.getDate()}`, 10);

  let hour = partMap.hour || `${targetDate.getHours()}`;
  if (hour === '24') hour = '00';
  const hourPadded = hour.padStart(2, '0');
  const minutePadded = (partMap.minute || `${targetDate.getMinutes()}`).padStart(2, '0');
  const secondPadded = (partMap.second || `${targetDate.getSeconds()}`).padStart(2, '0');

  const dateStr = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
  const timeStr = `${hourPadded}:${minutePadded}:${secondPadded}`;

  // Weekday in Thai
  const bangkokDate = new Date(targetDate.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const dayIndex = isNaN(bangkokDate.getDay()) ? targetDate.getDay() : bangkokDate.getDay();
  const dayName = THAI_DAYS[dayIndex] || 'วัน';

  const thaiYear = yearNum + 543;
  const monthNameFull = THAI_MONTHS_FULL[monthNum - 1] || '';
  const monthNameShort = THAI_MONTHS_SHORT[monthNum - 1] || '';

  const fullThaiDate = `${dayName}ที่ ${dayNum} ${monthNameFull} ${thaiYear}`;
  const formattedDateTime = `${String(dayNum).padStart(2, '0')}/${String(monthNum).padStart(2, '0')}/${thaiYear} ${timeStr} น.`;

  return {
    dateStr,
    timeStr,
    thaiYear,
    dayName,
    dayNum,
    monthNum,
    monthNameFull,
    monthNameShort,
    fullThaiDate,
    formattedDateTime,
    rawDate: targetDate,
  };
}

export function formatThaiDateOnly(dateStrYYYYMMDD: string): string {
  if (!dateStrYYYYMMDD) return '-';
  try {
    const [y, m, d] = dateStrYYYYMMDD.split('-').map(Number);
    if (!y || !m || !d) return dateStrYYYYMMDD;
    const thaiYear = y + 543;
    const monthShort = THAI_MONTHS_SHORT[m - 1] || '';
    return `${d} ${monthShort} ${thaiYear}`;
  } catch (e) {
    return dateStrYYYYMMDD;
  }
}
